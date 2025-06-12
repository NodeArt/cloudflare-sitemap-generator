import { retry } from "../utils";

import type { Fetcher } from "../request";
import type { Locale, Page, Filter } from "../utils";

const MAX_RETRY_COUNT = 3;

interface PageInfo {
  title: string;
  uniq_seo_title: boolean;
  lines: number | null;
  ways: unknown | null;
  volatility_rating: string | null;
  hit_rate: string | null;
  payout: string | null;
  devices: string[] | null;
  provider: string | null;
  identifier: string;
  seo_title: string;
  currencies: { [name: string]: { id: number; jackpot: unknown | null } };
  categories: string[];
  unfinished_games_for: unknown[];
}

const fetchGamesPages = async (url: string, request: Fetcher, page = 1) => {
  const PAGE_SIZE = 100;

  const { ok, status, body } = await request(url, {
    method: "POST",
    headers: {
      "user-agent": "sitemap-generator-games",
      "content-type": "application/json",
      Accept: "application/vnd.s.v2+json",
      pragma: "no-cache",
      priority: "u=1, i",
    },
    body: JSON.stringify({
      device: "desktop",
      page: page,
      without_territorial_restrictions: true,
      sort: {
        direction: "ASC",
        type: "global",
      },
      page_size: PAGE_SIZE,
    }),
  });

  if (!ok)
    throw `Games Pages API responded with NOT OK: ${status} (page: ${page})`;

  const res = await body.json();

  return res as {
    data: PageInfo[];
    pagination: {
      current_page: number;
      next_page: number | null;
      prev_page: number | null;
      total_pages: number;
      total_count: number;
    };
  };
};

export const getPagesFromGamesApi = async (
  url: string,
  request: Fetcher,
  locales: Locale[],
  filter: Filter
): Promise<{ locale: Locale; pages: Page[] }[]> => {
  console.log("Getting Pages from Games API...");
  const pagesRaw: PageInfo[] = [];

  let page: number | null = 1;
  while (page !== null) {
    console.log("Fetching Games from page", page);
    const res = await retry(
      () => fetchGamesPages(url, request, page!),
      MAX_RETRY_COUNT
    );

    pagesRaw.push(...res.data);

    page = res.pagination.next_page;
  }

  const filterPage = (page: PageInfo) => {
    const filters = filter.include ?? filter.exclude;

    if (filters === undefined) return true;

    const predicates = [
      filters.ids?.some((id) => page.identifier === id),
      filters.urls?.some((url) => new RegExp(url).test(page.seo_title)),
      filters.categories?.some((category) =>
        page.categories?.includes(category)
      ),
      filters.providers?.some((provider) => page.provider === provider),
    ];

    if (filter.include)
      if (predicates.some((isSatisfied) => isSatisfied === false)) return false;

    if (filter.exclude)
      if (predicates.some((isSatisfied) => isSatisfied === true)) return false;

    return true;
  };

  const allPaths = pagesRaw
    .filter(filterPage)
    .map((page) => `games/${page.seo_title}`);

  const pathsByLocales = locales.map((locale) => ({ locale, paths: allPaths }));

  return pathsByLocales.map(({ locale, paths }) => ({
    locale,
    pages: paths.map((path) => {
      const alternates: { path: string; lang: string }[] = [];
      for (const otherLoc of pathsByLocales) {
        // if (otherLoc.locale === locale) continue;
        if (otherLoc.paths.includes(path))
          alternates.push({ lang: otherLoc.locale, path });
      }

      return {
        path,
        lang: locale,
        priority: 0.4,
        freq: "monthly",
        alternates,
      };
    }),
  }));
};
