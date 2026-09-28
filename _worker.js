const API = 'https://kfiitness.nybzik2020022000.workers.dev';
const PROXY = new Set(['/me', '/clients', '/logout', '/analytics']);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    const toBackend =
      path.startsWith('/api/') ||
      path.startsWith('/clients/') ||
      PROXY.has(path) ||
      (path === '/login' && request.method === 'POST');

    if (toBackend) {
      const headers = new Headers(request.headers);
      headers.delete('host');
      const resp = await fetch(API + path + url.search, {
        method: request.method,
        headers,
        redirect: 'manual',
        body: (request.method === 'GET' || request.method === 'HEAD') ? undefined : await request.arrayBuffer()
      });
      return new Response(resp.body, {
        status: resp.status,
        statusText: resp.statusText,
        headers: new Headers(resp.headers)
      });
    }

    return env.ASSETS.fetch(request);
  }
};
