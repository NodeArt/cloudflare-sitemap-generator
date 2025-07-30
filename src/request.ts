import {
  request,
  ProxyAgent,
  getGlobalDispatcher,
  interceptors,
  RetryHandler
} from 'undici'

export interface ProxyConfig {
  url: string
  username: string
  password: string
}

export type Fetcher = typeof request

const retryOptions: RetryHandler.RetryOptions = {
  maxRetries: 10, // Maximum number of retry attempts
  minTimeout: 1000, // Minimum time to wait before retrying (1 second)
  maxTimeout: 10 * 60 * 1000, // Maximum number of milliseconds to wait before retrying (10 minutes)
  timeoutFactor: 10, // Factor by which the timeout increases for each retry (exponential backoff)
  statusCodes: [429, 500, 502, 503, 504] // Array of HTTP status codes to retry
}

export const useRequest = (
  proxy: ProxyConfig | null = null
): { request: typeof request } => {
  let dispatcher = getGlobalDispatcher()

  if ((proxy != null) && proxy.username && proxy.password) {
    const agent = new ProxyAgent({
      uri: proxy.url,
      token: `Basic ${Buffer.from(
        `${proxy.username}:${proxy.password}`
      ).toString('base64')}`,
      headers: { 'proxy-connection': 'keep-alive' },
      connections: 5,
      connectTimeout: 60 * 1000, // The maximum amount of time, in milliseconds, to wait for a connection to be established with a server. If a connection is not made within this timeframe, undici will terminate the attempt and throw a ConnectTimeoutError. (1 minute)
      keepAliveTimeout: 60 * 1000 // The timeout, in milliseconds, after which a socket without active requests will time out. Monitors time between activity on a connected socket. This value may be overridden by keep-alive hints from the server. See MDN: HTTP - Headers - Keep-Alive directives for more details. (1 minute)
    })
    dispatcher = agent
  }

  dispatcher = dispatcher.compose([
    interceptors.dns({
      maxTTL: 5 * 60 * 1000,
      maxItems: 100
    }),
    interceptors.redirect({
      maxRedirections: 0
    }),
    interceptors.retry(retryOptions)
  ])

  return {
    request: async (input, init) => {
      const maxRetries = 10
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          return await request(input, { dispatcher, ...init })
        } catch (err: any) {
          const isRetryable =
              err?.code === 'UND_ERR_ABORTED' ||
              err?.code === 'UND_ERR_HEADERS_TIMEOUT' ||
              err?.code === 'UND_ERR_BODY_TIMEOUT'

          if (isRetryable) {
            const delay = 1000 * (attempt + 1)
            console.warn(`Retry #${attempt + 1} for ${input} after ${delay}ms due to: ${err.code || err.message}`)
            await new Promise(res => setTimeout(res, delay))
            continue
          }

          err.message += `\n${JSON.stringify({ input, init })}`
          throw err
        }
      }
      throw new Error(`Failed after ${maxRetries} retries for: ${input}`)
    }
  }
}
