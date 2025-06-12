import { request, ProxyAgent } from "undici";

export type ProxyConfig = {
  url: string;
  username: string;
  password: string;
};

export type HttpMethod =
  | "GET"
  | "HEAD"
  | "POST"
  | "PUT"
  | "DELETE"
  | "CONNECT"
  | "OPTIONS"
  | "TRACE"
  | "PATCH";

export type HttpOptions = {
  method?: HttpMethod;
  headers?: Record<string, string>;
  body?: string;
};

export type HttpResponse = {
  ok: boolean;
  status: number;
  headers: Headers | Record<string, string | string[] | undefined>;
  body: {
    text(): Promise<string>;
    formData(): Promise<FormData>;
    json(): Promise<any>;
  };
};

export type Fetcher = (
  input: string | URL,
  init?: HttpOptions
) => Promise<HttpResponse>;

export const useRequest = (
  proxy: ProxyConfig | null = null
): { request: Fetcher } => {
  if (proxy === null)
    return {
      request: async (input, init = {}) =>
        await fetch(input, init).then((res) => ({
          ok: res.ok,
          status: res.status,
          headers: res.headers,
          body: {
            blob: () => res.blob(),
            formData: () => res.formData(),
            json: () => res.json(),
            text: () => res.text(),
          },
        })),
    };

  const agent = new ProxyAgent({
    uri: proxy.url,
    auth: Buffer.from(`${proxy.username}:${proxy.password}`).toString("base64"),
    headers: { "proxy-connection": "keep-alive" },
    connections: 5,
  });

  return {
    request: async (input, init = {}) =>
      await request(input, { dispatcher: agent, ...init }).then((res) => ({
        ok: 200 <= res.statusCode && res.statusCode < 300,
        status: res.statusCode,
        headers: res.headers,
        body: {
          blob: () => res.body.blob(),
          formData: () => res.body.formData(),
          json: () => res.body.json(),
          text: () => res.body.text(),
        },
      })),
  };
};
