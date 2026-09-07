import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

// The probe runs against a loopback server, so the address guard has to be off
// before config.ts is read.
process.env.POCKET_BLOCK_PRIVATE_ADDRESSES = '0';

const { probeUrl } = await import('./http.js');

type Handler = (req: http.IncomingMessage, res: http.ServerResponse) => void;

/** A one-off server, torn down by the test that started it. */
async function withServer(handler: Handler, run: (base: string) => Promise<void>): Promise<void> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test('a page that answers is alive', async () => {
  await withServer(
    (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html><body>fine</body></html>');
    },
    async (base) => {
      const result = await probeUrl(`${base}/ok`);
      assert.equal(result.verdict, 'alive');
      assert.equal(result.status, 200);
      assert.equal(result.error, null);
    },
  );
});

test('a 404 is the one answer that means the page is gone', async () => {
  await withServer(
    (_req, res) => {
      res.writeHead(404);
      res.end('gone');
    },
    async (base) => {
      const result = await probeUrl(`${base}/missing`);
      assert.equal(result.verdict, 'dead');
      assert.equal(result.status, 404);
    },
  );
});

test('a bot filter that never relents is still not a broken link', async () => {
  let requests = 0;
  await withServer(
    (_req, res) => {
      requests += 1;
      res.writeHead(403);
      res.end('no bots');
    },
    async (base) => {
      const result = await probeUrl(`${base}/walled`);
      assert.equal(result.verdict, 'alive', 'a 403 means the host answered, not that the link is dead');
      assert.equal(requests, 2, 'the refusal should get one more try as a browser');
    },
  );
});

test('a host that only turns away the crawler is read correctly on the retry', async () => {
  const seen: string[] = [];
  await withServer(
    (req, res) => {
      const agent = req.headers['user-agent'] ?? '';
      seen.push(agent);
      if (agent.includes('PocketBookmarks')) {
        res.writeHead(403);
        res.end('no bots');
        return;
      }
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html><body>welcome</body></html>');
    },
    async (base) => {
      const result = await probeUrl(`${base}/cloudflare-ish`);
      assert.equal(result.verdict, 'alive');
      assert.equal(result.status, 200);
      assert.equal(seen.length, 2);
      assert.ok(seen[1]?.includes('Chrome'), 'the second attempt should look like a browser');
    },
  );
});

test('a server having a bad day is inconclusive, not dead', async () => {
  await withServer(
    (_req, res) => {
      res.writeHead(503);
      res.end('back soon');
    },
    async (base) => {
      const result = await probeUrl(`${base}/down`);
      assert.equal(result.verdict, 'unknown', 'a 5xx is the host struggling, not the bookmark rotting');
      assert.equal(result.status, 503);
    },
  );
});

test('a host that never answers times out on its own and stays inconclusive', async () => {
  await withServer(
    () => {
      // Deliberately never responds, which is the case undici's headersTimeout
      // alone did not always cover.
    },
    async (base) => {
      const started = Date.now();
      const result = await probeUrl(`${base}/hang`, 500);
      const elapsed = Date.now() - started;

      assert.equal(result.verdict, 'unknown');
      assert.ok(result.error?.includes('did not respond'));
      // Two attempts at 500ms each, plus room for a slow machine.
      assert.ok(elapsed < 4000, `the probe took ${elapsed}ms, so nothing bounded it`);
    },
  );
});
