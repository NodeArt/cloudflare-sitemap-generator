import path from 'path'
import { promises as fs } from 'fs'

import xmlBuilder from 'xmlbuilder'

import { useRequest, type ProxyConfig } from './request.js'
import { useCf, type CfAuthConfig } from './cf.js'
import { useLocalesApi } from './locales-apis/index.js'
import { usePagesApi } from './pages-apis/index.js'

import type { ApiType, Filter, Locale, Page, Sitemap } from './utils.js'

interface ApiConfig {
  type: ApiType
  url: string
}

interface FilterConfig {
  filter?: Filter
}

interface ReplaceConfig {
  replace?: Array<{ pattern: string, value: string }>
}

type ModuleConfig = {
  name: string
  localesListApi: ApiConfig
  pagesListApi: ApiConfig
  proxy?: ProxyConfig
  forceSplitByLocale?: boolean
} & FilterConfig &
ReplaceConfig

type Strict = 'strict'
type Loose = 'loose'

type BaseConfig<
  BaseUrlMode extends Strict | Loose = Strict,
  ModulesMode extends Strict | Loose = Strict
> = {
  proxy?: ProxyConfig
} & FilterConfig &
ReplaceConfig &
(BaseUrlMode extends Strict ? { baseUrl: string } : { baseUrl?: string }) &
(ModulesMode extends Strict
  ? { modules: ModuleConfig[] }
  : { modules?: ModuleConfig[] })

type WorkerConfig<
  BaseUrlMode extends Strict | Loose = Loose,
  ModulesMode extends Strict | Loose = Loose
> = {
  name: string
  accountId: string
  auth: CfAuthConfig
} & (BaseUrlMode | ModulesMode extends Loose
  ? { config?: BaseConfig<BaseUrlMode, ModulesMode> }
  : { config: BaseConfig<BaseUrlMode, ModulesMode> })

export type Config =
  | (BaseConfig<Strict, Strict> & { workers: Array<WorkerConfig<Loose, Loose>> })
  | (BaseConfig<Loose, Strict> & { workers: Array<WorkerConfig<Strict, Loose>> })
  | (BaseConfig<Strict, Loose> & { workers: Array<WorkerConfig<Loose, Strict>> })
  | (BaseConfig<Loose, Loose> & { workers: Array<WorkerConfig<Strict, Strict>> })

interface Module {
  name: string
  localesListApi: ApiConfig
  pagesListApi: ApiConfig
  forceSplitByLocale: boolean
  filter: Filter
  replace: Array<{ pattern: string, value: string }>
  proxy?: ProxyConfig
  baseUrl: string
}

interface Worker {
  name: string
  accountId: string
  auth: CfAuthConfig
  proxy?: ProxyConfig
  modules: Module[]
}

const aggregateConfigIntoWorkers = (config: Config): Worker[] =>
  config.workers.map(
    (
      worker:
      | WorkerConfig<Loose, Loose>
      | WorkerConfig<Strict, Loose>
      | WorkerConfig<Loose, Strict>
      | WorkerConfig<Strict, Strict>
    ) => {
      const workerConfig = {
        baseUrl: worker.config?.baseUrl ?? config.baseUrl,
        filter: worker.config?.filter ?? config.filter ?? {},
        replace: worker.config?.replace ?? config.replace ?? [],
        proxy: worker.config?.proxy ?? config.proxy,
        modules: worker.config?.modules ?? config.modules ?? []
      }

      if (workerConfig.baseUrl === undefined) { throw new Error('Missing baseUrl') }

      return {
        name: worker.name,
        accountId: worker.accountId,
        auth: worker.auth,
        proxy: workerConfig.proxy,
        modules: workerConfig.modules.map((module) => ({
          name: module.name,
          localesListApi: module.localesListApi,
          pagesListApi: module.pagesListApi,
          forceSplitByLocale: module.forceSplitByLocale ?? false,
          filter: module.filter ?? workerConfig.filter,
          replace: module.replace ?? workerConfig.replace,
          proxy: module.proxy ?? workerConfig.proxy,
          baseUrl: workerConfig.baseUrl!
        }))
      }
    }
  )

const generateUrl = (
  baseUrl: string,
  pagePath: string,
  locale: string
): string => {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  const localeSegment = locale === 'en' ? '' : `${locale}/`
  const pathSegment = pagePath.startsWith('/')
    ? pagePath.substring(1)
    : pagePath

  return new URL(`${localeSegment}${pathSegment}`, base).href
}

const generateSitemap = (baseURL: string, pages: Page[]) => {
  const xml = xmlBuilder
    .create('urlset', { version: '1.0', encoding: 'UTF-8' })
    .att({
      xmlns: 'http://www.sitemaps.org/schemas/sitemap/0.9',
      'xmlns:xhtml': 'http://www.w3.org/1999/xhtml'
    })

  for (const page of pages) {
    const url = generateUrl(baseURL, page.path, page.lang)

    const xUrl = xml.ele('url')
    xUrl.ele('loc', url)
    xUrl.ele('priority', page.priority.toFixed(1))
    xUrl.ele('changefreq', page.freq)

    for (const alt of page.alternates) {
      xUrl.ele('xhtml:link').att({
        rel: 'alternate',
        hreflang: alt.lang,
        href: generateUrl(baseURL, alt.path, alt.lang)
      })
    }
  }

  return xml.end({ pretty: true, indent: '  ', newline: '\n' })
}

const generateSitemapIndex = (sitemaps: Sitemap[]) => {
  const xml = xmlBuilder
    .create('sitemapindex', { version: '1.0', encoding: 'UTF-8' })
    .att({
      xmlns: 'http://www.sitemaps.org/schemas/sitemap/0.9',
      'xmlns:xhtml': 'http://www.w3.org/1999/xhtml'
    })

  for (const sitemap of sitemaps) {
    const xUrl = xml.ele('sitemap')
    xUrl.ele('loc', `${sitemap.baseUrl}/${sitemap.name}.xml`)
  }

  return xml.end({ pretty: true, indent: '  ', newline: '\n' })
}

const getPages = async (
  module: Module
): Promise<Array<{ locale: Locale, pages: Page[] }>> => {
  console.log('Getting Pages for module', module.name)

  const { request } = useRequest(module.proxy)

  console.log('Getting Locales List...')
  const { getLocales } = useLocalesApi(
    module.localesListApi.type,
    module.localesListApi.url.startsWith('/')
      ? `${module.baseUrl}${module.localesListApi.url}`
      : module.localesListApi.url,
    request
  )

  const locales = await getLocales(module.filter)

  console.log('Getting Pages List...')
  const { getPages } = usePagesApi(
    module.pagesListApi.type,
    module.pagesListApi.url.startsWith('/')
      ? `${module.baseUrl}${module.pagesListApi.url}`
      : module.pagesListApi.url,
    request
  )

  const pages = await getPages(locales, module.filter)

  return pages
}

const getSitemaps = async (module: Module): Promise<Sitemap[]> => {
  console.log('Getting Sitemaps for module', module.name)

  const PAGINATION_LIMIT = 1000

  const pages = await getPages(module)

  const getSitemap = (name: string, pages: Page[]): Sitemap => {
    const xml = module.replace.reduce(
      (str, { pattern, value }) => str.replaceAll(pattern, value),
      generateSitemap(module.baseUrl, pages)
    )
    return { name, xml, baseUrl: module.baseUrl }
  }

  const totalPagesCount = pages.reduce((sum, loc) => sum + loc.pages.length, 0)
  if (totalPagesCount < PAGINATION_LIMIT) {
    return [
      getSitemap(
        `sitemap-${module.name}`,
        pages.reduce<Page[]>(
          (allPages, locale) => [...allPages, ...locale.pages],
          []
        )
      )
    ]
  }

  const sitemaps: Sitemap[] = []

  for (const loc of pages) {
    for (let i = 0; i * PAGINATION_LIMIT < loc.pages.length; ++i) {
      sitemaps.push(
        getSitemap(
          loc.pages.length < PAGINATION_LIMIT
            ? `sitemap-${module.name}-${loc.locale}`
            : `sitemap-${module.name}-${loc.locale}-${i + 1}`,
          loc.pages.slice(i * PAGINATION_LIMIT, (i + 1) * PAGINATION_LIMIT)
        )
      )
    }
  }

  return sitemaps
}

const getWorkerCode = async (sitemaps: Sitemap[], sitemapIndex: string) => {
  const responses: { [path: string]: string } = {
    '/sitemap-index.xml': sitemapIndex
  }

  sitemaps.forEach(({ name, xml }) => {
    responses[`/${name}.xml`] = xml
  })

  const WORKER_TEMPLATE_PATH = 'worker-templates/sitemaps-worker.js'
  const templateFullPath = path.join(__dirname, WORKER_TEMPLATE_PATH)
  const template = await fs.readFile(templateFullPath, 'utf8')

  const code = template.replace(
    '{}; // RESPONSES',
    JSON.stringify(responses) + ';'
  )

  return code
}

const updateWorker = async (worker: Worker) => {
  console.log('Updating Worker', worker.name)

  const sitemaps: Sitemap[] = []

  for (const module of worker.modules) { sitemaps.push(...(await getSitemaps(module))) }

  sitemaps.push({
    name: 'sitemap-index',
    xml: generateSitemapIndex(sitemaps),
    baseUrl: '',
  })

  const getSitemapBindingName = (name: string) =>
    `SITEMAP_${name.replaceAll("-", "_").toUpperCase()}`

  const sitemapsBindings = sitemaps.map((sitemap) => ({
    name: getSitemapBindingName(sitemap.name),
    content: sitemap.xml,
  }))

  const sitemapsManifestBinding = {
    name: 'SITEMAPS_MANIFEST',
    content: Object.fromEntries(
      sitemaps.map((sitemap) => [
        `/${sitemap.name}.xml`,
        getSitemapBindingName(sitemap.name),
      ])
    ),
  }

  const bindings = { text: sitemapsBindings, json: [sitemapsManifestBinding] }

  const code = await fs.readFile(
    path.resolve('workers/sitemaps-worker.js'),
    'utf-8'
  )

  console.log(
    'Updating worker with code and bindings',
    worker.name,
    code,
    bindings
  )

  const { request } = useRequest(worker.proxy ?? null)
  const { uploadWorkerScript } = useCf(worker.auth, request)
  await uploadWorkerScript(worker.accountId, worker.name, code, bindings)
}

export const updateSitemap = async (config: Config) => {
  const workers = aggregateConfigIntoWorkers(config)
  for (const worker of workers) await updateWorker(worker)
}
