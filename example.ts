import { updateSitemap } from "./src";

await updateSitemap({
  modules: [],

  proxy: {
    url: "http://example-proxy.com",
    username: "",
    password: "",
  },

  workers: [
    {
      name: "sitemap-a",
      accountId: "",
      auth: { token: "" },
      config: {
        baseUrl: "https://www.example-a.com",
        modules: [
          {
            name: "main",
            localesListApi: { type: "ss", url: "/api/example/locales" },
            pagesListApi: { type: "ss", url: "/api/example/pages" },
            filter: {
              exclude: {
                urls: [ "home", "games/all", "games/all/.*", "game/.*", "promotions" ],
                locales: ["no"],
              },
            },
          },
          {
            name: "games",
            localesListApi: { type: "ss", url: "/api/example/locales" },
            pagesListApi: { type: "games", url: "/api/example/games" },
            filter: {
              exclude: {
                locales: ["no"],
              },
            },
          },
        ],
      },
    },

    {
      name: "sitemap-b",
      accountId: "",
      auth: { token: "" },
      config: {
        baseUrl: "https://www.example-b.com",
        modules: [
          {
            name: "main",
            localesListApi: { type: "ss", url: "/api/example/locales" },
            pagesListApi: { type: "ss", url: "/api/example/pages" },
            filter: {
              exclude: {
                urls: [ "home", "games/all", "games/all/.*", "game/.*", "promotions" ],
                locales: [ "no", "ru", "fi", "en-AU", "cs", "en-PH", "en-IN", "en-ZA" ],
              },
            },
          },
          {
            name: "games",
            localesListApi: { type: "ss", url: "/api/example/locales" },
            pagesListApi: { type: "games", url: "/api/example/games" },
            filter: {
              exclude: {
                locales: [ "no", "ru", "fi", "en-AU", "cs", "en-PH", "en-IN", "en-ZA" ],
              },
            },
          },
        ],
      },
    },

    {
      name: "sitemap-c",
      accountId: "",
      auth: { token: "" },
      config: {
        baseUrl: "https://www.example-c.com",
        modules: [
          {
            name: "main",
            localesListApi: { type: "ss", url: "/api/example/locales" },
            pagesListApi: { type: "ss", url: "/api/example/pages" },
            filter: {
              exclude: {
                urls: ["home", "games/all/.*", "game/.*"],
                locales: [ "cs", "ja", "de", "no", "en-ZA", "fr-CA", "en-CA", "en-NZ", "en", "fi", "en-IN" ],
              },
            },
            replace: [{ pattern: "/en-AU", value: "" }],
          },
          {
            name: "games",
            localesListApi: { type: "ss", url: "/api/example/locales" },
            pagesListApi: { type: "games", url: "/api/example/games" },
            filter: {
              exclude: {
                locales: [ "cs", "ja", "de", "no", "en-ZA", "fr-CA", "en-CA", "en-NZ", "en", "fi", "en-IN" ],
              },
            },
          },
        ],
      },
    },
  ],
});
