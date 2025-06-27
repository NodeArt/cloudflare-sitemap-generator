interface Env {
  SITEMAPS_MANIFEST: Record<string, string>
  [sitemapName: `SITEMAP_${string}`]: string
  [key: string]: any
}

export default {
  async fetch (request, env): Promise<Response> {
    try {
      const router = env.SITEMAPS_MANIFEST
      const url = new URL(request.url)
      if (!Object.hasOwn(router, url.pathname)) return await fetch(request)
      const binding = router[url.pathname]
      const response = env[binding]
      const headers = { 'content-type': 'application/xml; charset=UTF-8' }
      return new Response(response, { headers })
    } catch (err) {
      console.log(request)
      console.error(err)
      return await fetch(request)
    }
  }
} satisfies ExportedHandler<Env>
