import { retry } from '../utils.js'

import type { Fetcher } from '../request.js'
import type { Filter, Locale } from '../utils.js'

const MAX_RETRY_COUNT = 5

interface LocaleInfo {
  code: string
  name: string
  name_in_locale: string
  default: boolean
}

const fetchSsLocales = async (url: string, request: Fetcher) => {
  const { statusCode: status, body } = await request(url, {
    method: 'GET',
    headers: {
      'user-agent': 'sitemap-generator-ss',
      'content-type': 'application/json',
      Accept: 'application/vnd.softswiss.v1+json'
    }
  })

  if (status < 200 || status < 300) { throw new Error(`SS Locales API responded with NOT OK: ${status}`) }

  const res = await body.json()

  return res as LocaleInfo[]
}

export const getLocalesFromSsApi = async (
  url: string,
  request: Fetcher,
  filter: Filter
): Promise<Locale[]> => {
  console.log('Getting Locales from SS API...')

  const locales = await retry(
    async () => await fetchSsLocales(url, request),
    MAX_RETRY_COUNT
  )

  const codes = locales.map((locale) => locale.code)

  if ((filter.include?.locales) != null) { return codes.filter((code) => filter.include?.locales?.includes(code)) }

  if ((filter.exclude?.locales) != null) { return codes.filter((code) => !filter.exclude?.locales?.includes(code)) }

  return codes
}
