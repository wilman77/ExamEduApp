interface Env {
  API_ORIGIN: string;
}

type PagesRequestContext = {
  request: Request;
  env: Env;
};

const jsonError = (message: string, status: number): Response =>
  new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });

function upstreamUrl(request: Request, apiOrigin: string): URL | null {
  let base: URL;
  try {
    base = new URL(apiOrigin.trim());
  } catch {
    return null;
  }

  if (base.protocol !== 'https:' || base.username || base.password || base.hash) return null;

  const incoming = new URL(request.url);
  base.pathname = `${base.pathname.replace(/\/+$/, '')}${incoming.pathname}`;
  base.search = incoming.search;
  return base;
}

export async function onRequest({ request, env }: PagesRequestContext): Promise<Response> {
  const incoming = new URL(request.url);
  if (incoming.pathname !== '/api' && !incoming.pathname.startsWith('/api/')) return jsonError('Not found.', 404);

  const target = upstreamUrl(request, env.API_ORIGIN);
  if (!target) return jsonError('API proxy is not configured with a valid HTTPS origin.', 503);

  // The Request copy preserves method, body, Origin, Cookie, and custom role headers.
  // No credentials are converted into authorization tokens.
  const proxyRequest = new Request(target, request);
  const upstream = await fetch(proxyRequest, { cache: 'no-store' });
  const headers = new Headers();
  const upstreamHeaders = upstream.headers as Headers & {
    getAll?: (name: string) => string[];
    getSetCookie?: () => string[];
  };
  const setCookies = typeof upstreamHeaders.getAll === 'function'
    ? upstreamHeaders.getAll('Set-Cookie')
    : typeof upstreamHeaders.getSetCookie === 'function'
      ? upstreamHeaders.getSetCookie()
      : (() => {
          const cookie = upstreamHeaders.get('Set-Cookie');
          return cookie ? [cookie] : [];
        })();

  for (const [name, value] of upstream.headers) {
    if (name.toLowerCase() !== 'set-cookie' && name.toLowerCase() !== 'cache-control') {
      headers.append(name, value);
    }
  }
  for (const cookie of setCookies) headers.append('Set-Cookie', cookie);
  headers.set('Cache-Control', 'no-store');

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}
