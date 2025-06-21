import {request, ProxyAgent, FormData, getGlobalDispatcher, interceptors, RetryHandler} from "undici";

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
    body?: string | FormData;
};

export type HttpResponse = {
    ok: boolean;
    status: number;
    body: {
        text(): Promise<string>;
        json(): Promise<any>;
    };
};

export type Fetcher = (
    input: string | URL,
    init?: HttpOptions
) => Promise<HttpResponse>;


const retryOptions: RetryHandler.RetryOptions = {
    maxRetries: 5, // Maximum number of retry attempts
    minTimeout: 1000, // Minimum time to wait before retrying (1 second)
    timeoutFactor: 2, // Factor by which the timeout increases for each retry (exponential backoff)
};

export const useRequest = (
    proxy: ProxyConfig | null = null
): { request: Fetcher } => {
    let dispatcher = getGlobalDispatcher();
    if (proxy) {
        const agent = new ProxyAgent({
            uri: proxy.url,
            token: `Basic ${Buffer.from(`${proxy.username}:${proxy.password}`).toString('base64')}`,
            headers: {"proxy-connection": "keep-alive"},
            connections: 5,
        });
        dispatcher = agent
    }

     dispatcher = dispatcher
        .compose([
                interceptors.dns({
                    maxTTL: 60 * 1000,
                    maxItems: 100,
                }),
                interceptors.redirect({
                    maxRedirections: 0,
                }),
                interceptors.retry(retryOptions)
            ]
        )


    return {
        request: (input, init = {}) =>
            request(input, {dispatcher, ...init}).then((res) => ({
                ok: 200 <= res.statusCode && res.statusCode < 300,
                status: res.statusCode,
                body: {
                    json: () => res.body.json(),
                    text: () => res.body.text(),
                },
            })),
    };
};
