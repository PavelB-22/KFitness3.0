/* KFitness · мост между фронтом (Cloudflare Pages) и базой (Worker)
   ------------------------------------------------------------------
   Всё, что относится к серверу (/api/*, вход, профиль, клиенты, выход),
   пробрасываем на воркер с базой. Всё остальное — это статика приложения
   (index.html, css, js), её отдаёт сам Pages. */

const API = 'https://kfiitness.nybzik2020022000.workers.dev';

// точные пути, которые обслуживает воркер (кроме /api/*)
const PROXY = new Set(['/login', '/me', '/clients', '/logout']);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    const toBackend = path.startsWith('/api/') || PROXY.has(path);

    if (toBackend) {
      // собираем запрос к воркеру, сохраняя метод, тело и cookie
      const headers = new Headers(request.headers);
      headers.delete('host');

      const init = {
        method: request.method,
        headers,
        redirect: 'manual',
        body: (request.method === 'GET' || request.method === 'HEAD')
          ? undefined
          : await request.arrayBuffer()
      };

      const resp = await fetch(API + path + url.search, init);

      // отдаём ответ как есть — cookie входа привяжется к домену Pages
      const out = new Headers(resp.headers);
      return new Response(resp.body, {
        status: resp.status,
        statusText: resp.statusText,
        headers: out
      });
    }

    // всё остальное — статика приложения (твой дизайн с GitHub)
    return env.ASSETS.fetch(request);
  }
};
