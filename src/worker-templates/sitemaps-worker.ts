import { ExportedHandler } from '@cloudflare/workers-types'
export default {
  async fetch (request: Request): Promise<Response> {
    const url = new URL(request.url)
    const responses: { [path: string]: string } = {} // RESPONSES
    // if no sitemap file exists - pass to origin
    if (responses[url.pathname]) {
      return new Response(responses[url.pathname], {
        headers: { 'content-type': 'application/xml; charset=UTF-8' }
      })
    }
    return await fetch(request)
  }
} satisfies ExportedHandler
