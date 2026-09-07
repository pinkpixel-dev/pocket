import net from 'node:net';
import dns from 'node:dns';
import { config } from '../config.js';

/** IPv4 ranges that must never be reachable from a metadata fetch. */
const BLOCKED_V4: Array<[string, number]> = [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, includes cloud metadata endpoints
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.88.99.0', 24], // 6to4 relay anycast
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, includes 255.255.255.255
];

function v4ToInt(address: string): number | null {
  const parts = address.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

function v4Blocked(address: string): boolean {
  const value = v4ToInt(address);
  if (value === null) return true;
  for (const [base, bits] of BLOCKED_V4) {
    const baseValue = v4ToInt(base);
    if (baseValue === null) continue;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    if ((value & mask) >>> 0 === (baseValue & mask) >>> 0) return true;
  }
  return false;
}

/** Expands any IPv6 form into its 8 numeric groups. */
function expandV6(address: string): number[] | null {
  let text = address.split('%')[0] ?? address;
  let tail: number[] = [];

  const lastColon = text.lastIndexOf(':');
  const trailing = text.slice(lastColon + 1);
  if (trailing.includes('.')) {
    const value = v4ToInt(trailing);
    if (value === null) return null;
    tail = [(value >>> 16) & 0xffff, value & 0xffff];
    text = text.slice(0, lastColon + 1) + '0:0';
  }

  const [head, rest, extra] = text.split('::');
  if (extra !== undefined) return null;

  const toGroups = (chunk: string | undefined): number[] =>
    !chunk ? [] : chunk.split(':').filter(Boolean).map((group) => Number.parseInt(group, 16));

  const left = toGroups(head);
  const right = toGroups(rest);
  let groups: number[];

  if (rest === undefined) {
    groups = left;
  } else {
    const fill = 8 - (left.length + right.length);
    if (fill < 0) return null;
    groups = [...left, ...Array<number>(fill).fill(0), ...right];
  }

  if (tail.length === 2) groups = [...groups.slice(0, 6), ...tail];
  if (groups.length !== 8 || groups.some((group) => !Number.isFinite(group) || group < 0 || group > 0xffff)) {
    return null;
  }
  return groups;
}

function v6Blocked(address: string): boolean {
  const groups = expandV6(address);
  if (!groups) return true;
  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups as [number, number, number, number, number, number, number, number];

  const isZeroPrefix = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0;
  // ::, ::1 and every other address in ::/96
  if (isZeroPrefix && g5 === 0) return true;
  // IPv4-mapped (::ffff:a.b.c.d) and NAT64 (64:ff9b::/96) carry a v4 address
  if ((isZeroPrefix && g5 === 0xffff) || (g0 === 0x0064 && g1 === 0xff9b && !g2 && !g3 && !g4 && !g5)) {
    const embedded = `${(g6 >> 8) & 0xff}.${g6 & 0xff}.${(g7 >> 8) & 0xff}.${g7 & 0xff}`;
    return v4Blocked(embedded);
  }
  // 6to4 (2002::/16) embeds the v4 address of the relay endpoint
  if (g0 === 0x2002) {
    const embedded = `${(g1 >> 8) & 0xff}.${g1 & 0xff}.${(g2 >> 8) & 0xff}.${g2 & 0xff}`;
    return v4Blocked(embedded);
  }
  if ((g0 & 0xfe00) === 0xfc00) return true; // unique local fc00::/7
  if ((g0 & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
  if ((g0 & 0xff00) === 0xff00) return true; // multicast ff00::/8
  if (g0 === 0x0100 && !g1 && !g2 && !g3) return true; // discard-only 100::/64
  return false;
}

export function isBlockedAddress(address: string): boolean {
  if (!config.fetch.blockPrivateAddresses) return false;
  const family = net.isIP(address);
  if (family === 4) return v4Blocked(address);
  if (family === 6) return v6Blocked(address);
  return true;
}

export class BlockedAddressError extends Error {
  constructor(host: string, address?: string) {
    super(
      address
        ? `Refusing to connect to ${host}: ${address} is a private or reserved address.`
        : `Refusing to connect to ${host}: no public address available.`,
    );
    this.name = 'BlockedAddressError';
  }
}

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | dns.LookupAddress[],
  family?: number,
) => void;

/**
 * A drop-in replacement for dns.lookup that hands the socket only public
 * addresses. Guarding at connect time rather than before the request means a
 * DNS answer that changes between check and connect still cannot get through.
 */
export function guardedLookup(
  hostname: string,
  options: dns.LookupOneOptions | dns.LookupAllOptions | number,
  callback: LookupCallback,
): void {
  const wantsAll = typeof options === 'object' && options !== null && 'all' in options && options.all === true;

  dns.lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
    if (err) {
      callback(err, []);
      return;
    }
    const allowed = addresses.filter((entry) => !isBlockedAddress(entry.address));
    if (allowed.length === 0) {
      callback(new BlockedAddressError(hostname, addresses[0]?.address) as NodeJS.ErrnoException, []);
      return;
    }
    if (wantsAll) {
      callback(null, allowed);
      return;
    }
    const first = allowed[0]!;
    callback(null, first.address, first.family);
  });
}
