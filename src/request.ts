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
  minTimeout: 2000, // Minimum time to wait before retrying (1 second)
  timeoutFactor: 3 // Factor by which the timeout increases for each retry (exponential backoff)
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
      connections: 5
    })
    dispatcher = agent
  }

  dispatcher = dispatcher.compose([
    interceptors.dns({
      maxTTL: 60 * 1000,
      maxItems: 100
    }),
    interceptors.redirect({
      maxRedirections: 0
    }),
    interceptors.retry(retryOptions)
  ])

  return { request: async (input, init) => await request(input, { dispatcher, ...init }) }
}
