export default {
  async fetch (request): Promise<Response> {
    try {
      const router = { /* SITEMAPS_ROUTER */ }
      const url = new URL(request.url)
      if (!Object.hasOwn(router, url.pathname)) return await fetch(request)
      const response = router[url.pathname]
      const headers = { 'content-type': 'application/xml; charset=UTF-8' }
      return new Response(response, { headers })
    } catch (err) {
      console.log(request)
      console.error(err)
      return await fetch(request)
    }
  }
} satisfies ExportedHandler
