/* eslint-disable */
addEventListener("fetch", (event) =>
  event.respondWith(
    new Response(`$_CONTENT_$`, {
      headers: { "content-type": "$_CONTENT_TYPE_$" },
    })
  )
);
