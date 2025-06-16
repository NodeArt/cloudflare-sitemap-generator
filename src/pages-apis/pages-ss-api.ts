import { retry } from "../utils";

import type { Fetcher } from "../request";
import type { Locale, Page, Priority, ChangeFrequency, Filter } from "../utils";

const MAX_RETRY_COUNT = 5;

interface PageInfo {
  id: string;
  title: string;
  categories: string[];
  path: string;
  layout: string;
  children?: PageInfo[];
}

const fetchSsPages = async (url: string, request: Fetcher) => {
  const { ok, status, body } = await request(url, {
    method: "GET",
    headers: {
      "user-agent": "sitemap-generator-ss",
      "content-type": "application/json",
      Accept: "application/vnd.softswiss.v1+json",
    },
  });

  if (!ok) throw new Error(`SS Pages API responded with NOT OK: ${status}`);

  const res = await body.json();

  return res as PageInfo[];
};

interface PageDetails {
  id: string;
  title: string;
  categories: string[];
  path: string;
  layout: string;
  content: string;
  blocks?: {
    title: string;
    description?: string | null;
    keywords?: string | null;
    data?: string | null;
    anonOnly?: string | null;
    userOnly?: string | null;
    showForUserGroups?: string | null;
    hideForUserGroups?: string | null;
    showForCountries?: string | null;
    hideForCountries?: string | null;
    showOnWeekDaysNumbers?: string | null;
    timeStart?: string | null;
    timeEnd?: string | null;
    showForLicenses?: string | null;
    hideForLicenses?: string | null;
    noindex?: string | null;
    invisible_route?: string | null;
  };
}

const fetchSSPageDetails = async (
  url: string,
  pagePath: string,
  localeCode: string,
  request: Fetcher
) => {
  const pageURL = `${url}/${pagePath}?locale=${localeCode}`;

  const { ok, status, body } = await request(pageURL, {
    method: "GET",
    headers: {
      "user-agent": "sitemap-generator-ss",
      "content-type": "application/json",
      Accept: "application/vnd.softswiss.v1+json",
      locale_override: "forbidden",
      "accept-language": localeCode,
    },
  });

  if (status === 404) return null;

  if (!ok) {
    const res = await body.text();
    throw new Error(
      `Could NOT get '${pageURL}' page details: ${status}, ${res}`
    );
  }

  const res = await body.json();

  return res as PageDetails;
};

export const getPagesFromSsApi = async (
  url: string,
  request: Fetcher,
  locales: Locale[],
  filter: Filter
): Promise<{ locale: Locale; pages: Page[] }[]> => {
  console.log("Getting Pages from SS API...");

  const pagesRaw = await retry(
    () => fetchSsPages(url, request),
    MAX_RETRY_COUNT
  );

  const filterPage = (page: PageInfo) => {
    const filters = filter.include ?? filter.exclude;

    if (filters === undefined) return true;

    const predicates = [
      filters.ids?.some((id) => page.id === id),
      filters.urls?.some((url) => new RegExp(url).test(page.path)),
      filters.categories?.some((category) =>
        page.categories?.includes(category)
      ),
    ];

    if (filter.include)
      if (predicates.some((isSatisfied) => isSatisfied === false)) return false;

    if (filter.exclude)
      if (predicates.some((isSatisfied) => isSatisfied === true)) return false;

    return true;
  };

  const allPaths: string[] = [];
  const addPaths = (pages: PageInfo[]) =>
    pages.forEach((page) => {
      if (filterPage(page)) allPaths.push(page.path);
      if (page.children) addPaths(page.children);
    });

  addPaths(pagesRaw);

  const pathsByLocales: { locale: Locale; paths: string[] }[] = [];

  for (const locale of locales) {
    const paths: string[] = [];

    for (const path of allPaths) {
      console.log("Checking Page Details using SS API for", path, locale);
      const details = await fetchSSPageDetails(url, path, locale, request);
      if (details === null) continue;
      if (details.blocks?.noindex || details.blocks?.invisible_route) continue;
      paths.push(path);
    }

    pathsByLocales.push({ locale, paths });
  }

  return pathsByLocales.map(({ locale, paths }) => ({
    locale,
    pages: paths.map((path) => {
      const alternates: { path: string; lang: string }[] = [];
      for (const otherLoc of pathsByLocales) {
        if (otherLoc.locale === locale) continue;
        if (otherLoc.paths.includes(path))
          alternates.push({ lang: otherLoc.locale, path });
      }

      const getPriority = (): Priority => {
        switch (path.split("/")[+path.startsWith("/")]) {
          case "":
            return 1.0;
          case "games":
            return 0.8;
          default:
            return 0.6;
        }
      };

      const getFreq = (): ChangeFrequency => {
        switch (path.split("/")[+path.startsWith("/")]) {
          case "":
            return "always";
          case "games":
            return "daily";
          default:
            return "weekly";
        }
      };

      return {
        path,
        lang: locale,
        priority: getPriority(),
        freq: getFreq(),
        alternates,
      };
    }),
  }));
};
