import path from 'path'
import { promises as fs } from 'fs'

import xmlBuilder from 'xmlbuilder'

import { useRequest, type ProxyConfig } from './request.js'
import { useCf, type CfAuthConfig } from './cf.js'
import { useLocalesApi } from './locales-apis/index.js'
import { usePagesApi } from './pages-apis/index.js'

import type { ApiType, Filter, Locale, Page, Sitemap } from './utils.js'

const __dirname = import.meta.dirname

const MAX_WORKERS = 3
const MAX_SITEMAPS_PER_WORKER = 40

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

type LocaleBaseUrlMap = {[locale: string]: string}

interface LocaleBaseUrlMapConfig {
  localeBaseUrlMap?: LocaleBaseUrlMap
}

type ModuleConfig = {
  name: string
  localesListApi: ApiConfig
  pagesListApi: ApiConfig
  proxy?: ProxyConfig
  forceSplitByLocale?: boolean
} &
FilterConfig &
ReplaceConfig &
LocaleBaseUrlMapConfig

type Strict = 'strict'
type Loose = 'loose'

type BaseConfig<
  BaseUrlMode extends Strict | Loose = Strict,
  ModulesMode extends Strict | Loose = Strict
> = { proxy?: ProxyConfig } &
FilterConfig &
ReplaceConfig &
LocaleBaseUrlMapConfig &
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
  localeBaseUrlMap: {[locale: string]: string}
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
        localeBaseUrlMap: worker.config?.localeBaseUrlMap ?? config.localeBaseUrlMap ?? {},
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
          localeBaseUrlMap: module.localeBaseUrlMap ?? workerConfig.localeBaseUrlMap,
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

const generateSitemap = (
  baseURL: string,
  pages: Page[],
  localeBaseUrlMap: LocaleBaseUrlMap = {}
) => {
  const xml = xmlBuilder
    .create('urlset', { version: '1.0', encoding: 'UTF-8' })
    .att({
      xmlns: 'http://www.sitemaps.org/schemas/sitemap/0.9',
      'xmlns:xhtml': 'http://www.w3.org/1999/xhtml'
    })

  for (const page of pages) {
    const url = generateUrl(
      localeBaseUrlMap[page.lang] ?? baseURL,
      page.path,
      page.lang
    )

    const xUrl = xml.ele('url')
    xUrl.ele('loc', url)
    xUrl.ele('priority', page.priority.toFixed(1))
    xUrl.ele('changefreq', page.freq)

    for (const alt of page.alternates) {
      xUrl.ele('xhtml:link').att({
        rel: 'alternate',
        hreflang: alt.lang,
        href: generateUrl(
          localeBaseUrlMap[alt.lang] ?? baseURL,
          alt.path,
          alt.lang
        )
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
      generateSitemap(module.baseUrl, pages, module.localeBaseUrlMap)
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

const collectModuleSitemaps = async (module: Module): Promise<{ sitemaps: Sitemap[], namedSitemaps: Sitemap[] }> => {
  console.log('Getting sitemaps for module', module.name)

  const sitemaps: Sitemap[] = await getSitemaps(module)


  const limitedSitemaps = sitemaps.slice(0, MAX_WORKERS * MAX_SITEMAPS_PER_WORKER)
  const namedSitemaps: Sitemap[] = []

  // Always create exactly MAX_WORKERS workers, even if some are empty
  for (let workerIndex = 0; workerIndex < MAX_WORKERS; workerIndex++) {
    const start = workerIndex * MAX_SITEMAPS_PER_WORKER
    const end = start + MAX_SITEMAPS_PER_WORKER
    const chunk = limitedSitemaps.slice(start, end)

    // Create sitemaps even for empty chunks to ensure consistent naming
    const chunkWithRenamed = chunk.map((sitemap, sitemapIndex) => ({
      ...sitemap,
      name: `sitemap-${module.name}-${workerIndex + 1}-${sitemapIndex + 1}`
    }))

    namedSitemaps.push(...chunkWithRenamed)
  }

  console.log(`Module ${module.name}: Created ${namedSitemaps.length} named sitemaps`)
  return { sitemaps: limitedSitemaps, namedSitemaps }
}

// Helper function to create a worker script
const createWorkerScript = async (sitemaps: Sitemap[], globalSitemapIndex: Sitemap): Promise<string> => {
  const sitemapsWithIndex = [...sitemaps, globalSitemapIndex]

  const sitemapsRouter = Object.fromEntries(
      sitemapsWithIndex.map((sitemap) => [`/${sitemap.name}.xml`, sitemap.xml])
  )

  const sitemapsRouterTemplateRegex = /\{\s*\/\* SITEMAPS_ROUTER \*\/\s*\}/

  const codeTemplate = await fs
      .readFile(
          path.join(__dirname, "./workers/sitemaps-worker-with-replace.js"),
          "utf-8"
      )
      .catch((err) => {
        console.error(err)
        return null
      })

  if (!codeTemplate)
    throw new Error("Failed to load cf worker script template")

  if (!codeTemplate.match(sitemapsRouterTemplateRegex))
    throw new Error("Failed to insert sitemaps into cf worker script template")

  return codeTemplate.replace(
      sitemapsRouterTemplateRegex,
      JSON.stringify(sitemapsRouter),
  )
}

// Helper function to upload a worker to Cloudflare
const uploadWorkerToCloudflare = async (worker: Worker, workerName: string, code: string): Promise<void> => {
  console.log('Updating worker with code', workerName)

  const { request } = useRequest() // ! WARNING ! no proxy (add `worker.proxy ?? null` to use proxy)
  const { uploadWorkerScript } = useCf(worker.auth, request)
  await uploadWorkerScript(worker.accountId, workerName, code)
}

// Helper function to log global sitemap index
const logGlobalSitemapIndex = (globalSitemapIndex: Sitemap, allSitemaps: Sitemap[]): void => {
  console.log('=== GLOBAL SITEMAP INDEX CONTENT ===')
  console.log(globalSitemapIndex.xml)
  console.log('=== END GLOBAL SITEMAP INDEX ===')
  console.log(`Total sitemaps in global index: ${allSitemaps.length}`)
}

const updateWorker = async (worker: Worker) => {
  // Collect all sitemaps from all modules
  const allSitemaps: Sitemap[] = []
  const moduleSitemapsMap = new Map<string, Sitemap[]>()

  for (const module of worker.modules) {
    const { sitemaps, namedSitemaps } = await collectModuleSitemaps(module)
    moduleSitemapsMap.set(module.name, sitemaps)
    allSitemaps.push(...namedSitemaps)
  }

  console.log(`Total sitemaps collected: ${allSitemaps.length}`)
  console.log('Sitemaps by module:')
  for (const [moduleName, sitemaps] of moduleSitemapsMap.entries()) {
    console.log(`  ${moduleName}: ${sitemaps.length} sitemaps`)
  }

  // Generate global sitemap index
  const globalSitemapIndex = {
    name: 'sitemap-index',
    xml: generateSitemapIndex(allSitemaps),
    baseUrl: ''
  }

  logGlobalSitemapIndex(globalSitemapIndex, allSitemaps)

  // Create and upload workers
  for (const module of worker.modules) {
    console.log('Updating Worker for module', module.name)

    const limitedSitemaps = moduleSitemapsMap.get(module.name) || []

    // Always create exactly MAX_WORKERS workers
    for (let workerIndex = 0; workerIndex < MAX_WORKERS; workerIndex++) {
      const start = workerIndex * MAX_SITEMAPS_PER_WORKER
      const end = start + MAX_SITEMAPS_PER_WORKER
      const chunk = limitedSitemaps.slice(start, end)

      // Create sitemaps even for empty chunks to ensure consistent naming
      const chunkWithRenamed = chunk.map((sitemap, sitemapIndex) => ({
        ...sitemap,
        name: `sitemap-${module.name}-${workerIndex + 1}-${sitemapIndex + 1}`
      }))

      const code = await createWorkerScript(chunkWithRenamed, globalSitemapIndex)
      const workerName = `${worker.name}-${module.name}-${workerIndex + 1}`

      await uploadWorkerToCloudflare(worker, workerName, code)
    }
  }
}

export const updateSitemap = async (config: Config) => {
  const workers = aggregateConfigIntoWorkers(config)
  for (const worker of workers) await updateWorker(worker)
}
