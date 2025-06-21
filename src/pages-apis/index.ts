import { getPagesFromGamesApi } from './pages-games-api'
import { getPagesFromSsApi } from './pages-ss-api'

import type { Fetcher } from '../request'
import type { ApiType, Filter, Locale } from '../utils'

const getApiFetcher = (type: ApiType) => {
  switch (type) {
    case 'ss':
      return getPagesFromSsApi

    case 'games':
      return getPagesFromGamesApi

    default:
      throw new Error('Unsupported pages-list API type')
  }
}

export const usePagesApi = (type: ApiType, url: string, request: Fetcher) => {
  const fetcher = getApiFetcher(type)

  return {
    getPages: async (locales: Locale[], filter: Filter) =>
      await fetcher(url, request, locales, filter)
  }
}
