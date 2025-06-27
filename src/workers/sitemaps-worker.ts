interface Env {
  SITEMAP_MANIFEST: Record<string, string>;
  [key: string]: any;
}

export default {
  async fetch(request, env): Promise<Response> {
    const router = env.SITEMAPS_MANIFEST;
    const url = new URL(request.url);
    if (!Object.hasOwn(router, url.pathname)) return fetch(request);
    const response = env[router[url.pathname]];
    const headers = { "content-type": "application/xml; charset=UTF-8" };
    return new Response(response, { headers });
  },
} satisfies ExportedHandler<Env>;
