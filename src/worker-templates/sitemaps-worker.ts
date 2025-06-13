export default {
  async fetch(request): Promise<Response> {
    const url = new URL(request.url);
    const responses: { [path: string]: string } = {}; // RESPONSES
    return new Response(responses[url.pathname], {
      headers: { "content-type": "application/xml; charset=UTF-8" },
    });
  },
} satisfies ExportedHandler;
