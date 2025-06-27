export default {
  async fetch (req: Request): Promise<Response> {
    return new Response('$_CONTENT_$', {
      headers: { 'content-type': '$_CONTENT_TYPE_$' }
    })
  }
} satisfies ExportedHandler
