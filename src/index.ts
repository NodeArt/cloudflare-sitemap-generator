import path from "path";
import { promises as fs } from "fs";

import xmlBuilder from "xmlbuilder";

import { useCf } from "./cf";
import { useRequest, type ProxyConfig } from "./request";
import { useLocalesApi } from "./locales-apis";
import { usePagesApi } from "./pages-apis";

import type { ApiType, Filter, Locale, Page, Sitemap } from "./utils";

type ApiConfig = {
  type: ApiType;
  url: string;
};

type FilterConfig = {
  filter?: Filter;
};

type ReplaceConfig = {
  replace?: { pattern: string; value: string }[];
};

type ModuleConfig = {
  name: string;
  localesListApi: ApiConfig;
  pagesListApi: ApiConfig;
  proxy?: ProxyConfig;
  forceSplitByLocale?: boolean;
} & FilterConfig &
  ReplaceConfig;

type Strict = "strict";
type Loose = "loose";

type BaseConfig<
  BaseUrlMode extends Strict | Loose = Strict,
  ModulesMode extends Strict | Loose = Strict
> = {
  proxy?: ProxyConfig;
} & FilterConfig &
  ReplaceConfig &
  (BaseUrlMode extends Strict ? { baseUrl: string } : { baseUrl?: string }) &
  (ModulesMode extends Strict
    ? { modules: ModuleConfig[] }
    : { modules?: ModuleConfig[] });

type WorkerConfig<
  BaseUrlMode extends Strict | Loose = Loose,
  ModulesMode extends Strict | Loose = Loose
> = {
  name: string;
  accountId: string;
  authToken: string;
} & (BaseUrlMode | ModulesMode extends Loose
  ? { config?: BaseConfig<BaseUrlMode, ModulesMode> }
  : { config: BaseConfig<BaseUrlMode, ModulesMode> });

export type Config =
  | (BaseConfig<Strict, Strict> & { workers: WorkerConfig<Loose, Loose>[] })
  | (BaseConfig<Loose, Strict> & { workers: WorkerConfig<Strict, Loose>[] })
  | (BaseConfig<Strict, Loose> & { workers: WorkerConfig<Loose, Strict>[] })
  | (BaseConfig<Loose, Loose> & { workers: WorkerConfig<Strict, Strict>[] });

type Module = {
  name: string;
  localesListApi: ApiConfig;
  pagesListApi: ApiConfig;
  forceSplitByLocale: boolean;
  filter: Filter;
  replace: { pattern: string; value: string }[];
  proxy?: ProxyConfig;
  baseUrl: string;
};

type Worker = {
  name: string;
  accountId: string;
  authToken: string;
  proxy?: ProxyConfig;
  modules: Module[];
};

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
        modules: worker.config?.modules ?? config.modules ?? [],
      };

      if (workerConfig.baseUrl === undefined) throw "Missing baseUrl";

      return {
        name: worker.name!,
        accountId: worker.accountId!,
        authToken: worker.authToken!,
        proxy: workerConfig.proxy,
        modules: workerConfig.modules!.map((module) => ({
          name: module.name!,
          localesListApi: module.localesListApi!,
          pagesListApi: module.pagesListApi!,
          forceSplitByLocale: module.forceSplitByLocale ?? false,
          filter: module.filter ?? workerConfig.filter!,
          replace: module.replace ?? workerConfig.replace!,
          proxy: module.proxy ?? workerConfig.proxy,
          baseUrl: workerConfig.baseUrl!,
        })),
      };
    }
  );

const generateUrl = (
  baseUrl: string,
  pagePath: string,
  locale: string
): string => {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const localeSegment = locale === "en" ? "" : `${locale}/`;
  const pathSegment = pagePath.startsWith("/")
    ? pagePath.substring(1)
    : pagePath;

  return new URL(`${localeSegment}${pathSegment}`, base).href;
};

const generateSitemap = (baseURL: string, pages: Page[]) => {
  const xml = xmlBuilder
    .create("urlset", { version: "1.0", encoding: "UTF-8" })
    .att({
      xmlns: "http://www.sitemaps.org/schemas/sitemap/0.9",
      "xmlns:xhtml": "http://www.w3.org/1999/xhtml",
    });

  for (const page of pages) {
    const url = generateUrl(baseURL, page.path, page.lang);

    const xUrl = xml.ele("url");
    xUrl.ele("loc", url);
    xUrl.ele("priority", page.priority.toFixed(1));
    xUrl.ele("changefreq", page.freq);

    for (const alt of page.alternates) {
      xUrl.ele("xhtml:link").att({
        rel: "alternate",
        hreflang: alt.lang,
        href: generateUrl(baseURL, alt.path, alt.lang),
      });
    }
  }

  return xml.end({ pretty: true, indent: "  ", newline: "\n" });
};

const generateSitemapIndex = (sitemaps: Sitemap[]) => {
  const xml = xmlBuilder
    .create("sitemapindex", { version: "1.0", encoding: "UTF-8" })
    .att({
      xmlns: "http://www.sitemaps.org/schemas/sitemap/0.9",
      "xmlns:xhtml": "http://www.w3.org/1999/xhtml",
    });

  for (const sitemap of sitemaps) {
    const xUrl = xml.ele("sitemap");
    xUrl.ele("loc", `${sitemap.baseUrl}/${sitemap.name}.xml`);
  }

  return xml.end({ pretty: true, indent: "  ", newline: "\n" });
};

const getPages = async (
  module: Module
): Promise<{ locale: Locale; pages: Page[] }[]> => {
  const { request } = useRequest(module.proxy);

  const { getLocales } = useLocalesApi(
    module.localesListApi.type,
    module.localesListApi.url.startsWith("/")
      ? `${module.baseUrl}${module.localesListApi.url}`
      : module.localesListApi.url,
    request
  );

  const locales = await getLocales(module.filter);

  const { getPages } = usePagesApi(
    module.pagesListApi.type,
    module.pagesListApi.url.startsWith("/")
      ? `${module.baseUrl}${module.pagesListApi.url}`
      : module.pagesListApi.url,
    request
  );

  const pages = await getPages(locales, module.filter);

  return pages;
};

const getSitemaps = async (module: Module): Promise<Sitemap[]> => {
  const PAGINATION_LIMIT = 1000;

  const pages = await getPages(module);

  const getSitemap = (name: string, pages: Page[]): Sitemap => {
    const xml = module.replace.reduce(
      (str, { pattern, value }) => str.replaceAll(pattern, value),
      generateSitemap(module.baseUrl, pages)
    );
    return { name, xml, baseUrl: module.baseUrl };
  };

  const totalPagesCount = pages.reduce((sum, loc) => sum + loc.pages.length, 0);
  if (totalPagesCount < PAGINATION_LIMIT)
    return [
      getSitemap(
        module.name,
        pages.reduce(
          (allPages, locale) => [...allPages, ...locale.pages],
          [] as Page[]
        )
      ),
    ];

  const sitemaps: Sitemap[] = [];

  for (const loc of pages)
    for (let i = 0; i * PAGINATION_LIMIT < loc.pages.length; ++i)
      sitemaps.push(
        getSitemap(
          loc.pages.length < PAGINATION_LIMIT
            ? `sitemap-${module.name}-${loc.locale}`
            : `sitemap-${module.name}-${loc.locale}-${i + 1}`,
          loc.pages.slice(i * PAGINATION_LIMIT, (i + 1) * PAGINATION_LIMIT)
        )
      );

  return sitemaps;
};

const getWorkerCode = async (sitemaps: Sitemap[], sitemapIndex: string) => {
  const responses: { [path: string]: string } = {
    "/sitemap-index.xml": sitemapIndex,
  };

  sitemaps.forEach(({ name, xml }) => {
    responses[`/${name}.xml`] = xml;
  });

  const WORKER_TEMPLATE_PATH = path.join(__dirname, "worker-template.ts");
  const template = await fs.readFile(WORKER_TEMPLATE_PATH, "utf8");

  const code = template.replace(
    "{}; // RESPONSES",
    JSON.stringify(responses) + ";"
  );

  return code;
};

const updateWorker = async (worker: Worker) => {
  const sitemaps: Sitemap[] = [];

  for (const module of worker.modules)
    sitemaps.push(...(await getSitemaps(module)));

  const sitemapIndex = generateSitemapIndex(sitemaps);

  const workerCode = await getWorkerCode(sitemaps, sitemapIndex);

  const { request } = useRequest(worker.proxy ?? null);
  const { uploadWorkerScript } = useCf({ token: worker.authToken }, request);
  await uploadWorkerScript(worker.accountId, worker.name, workerCode);
};

export const updateSitemap = async (config: Config) => {
  const workers = aggregateConfigIntoWorkers(config);
  for (const worker of workers) await updateWorker(worker);
};
