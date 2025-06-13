/* eslint-disable */
addEventListener("fetch", (event) =>
  event.respondWith(
    () => {
      const url = new URL(event.request.url);
      const responses = {}; // RESPONSES
      return new Response(responses[url.pathname], {
        headers: { "content-type": "application/xml; charset=UTF-8" },
      });
    }
  )
);
