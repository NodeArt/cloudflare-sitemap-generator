/* eslint-disable */
addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const responses = {}; // RESPONSES
  event.respondWith(
    new Response(responses[url.pathname], {
      headers: { "content-type": "application/xml; charset=UTF-8" },
    })
  );
});
