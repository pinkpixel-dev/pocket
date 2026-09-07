export type Route =
  | { kind: 'all' }
  | { kind: 'pinned' }
  | { kind: 'collection'; id: number }
  | { kind: 'uncollected' }
  | { kind: 'tag'; name: string }
  | { kind: 'untagged' }
  | { kind: 'attention' }
  | { kind: 'settings' };

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#\/?/, '').split('?')[0] ?? '';
  const [head, tail] = path.split('/');

  switch (head) {
    case 'pinned':
      return { kind: 'pinned' };
    case 'settings':
      return { kind: 'settings' };
    case 'uncollected':
      return { kind: 'uncollected' };
    case 'untagged':
      return { kind: 'untagged' };
    case 'attention':
    case 'broken':
      return { kind: 'attention' };
    case 'collections': {
      const id = Number(tail);
      return Number.isFinite(id) && id > 0 ? { kind: 'collection', id } : { kind: 'all' };
    }
    case 'tags':
      return tail ? { kind: 'tag', name: decodeURIComponent(tail) } : { kind: 'all' };
    default:
      return { kind: 'all' };
  }
}

export function routeHref(route: Route): string {
  switch (route.kind) {
    case 'pinned':
      return '#/pinned';
    case 'settings':
      return '#/settings';
    case 'uncollected':
      return '#/uncollected';
    case 'untagged':
      return '#/untagged';
    case 'attention':
      return '#/attention';
    case 'collection':
      return `#/collections/${route.id}`;
    case 'tag':
      return `#/tags/${encodeURIComponent(route.name)}`;
    default:
      return '#/';
  }
}

export function routesMatch(a: Route, b: Route): boolean {
  return routeHref(a) === routeHref(b);
}
