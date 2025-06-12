import { Fetcher } from "../request";
import { Filter, Locale, retry } from "../utils";

const MAX_RETRY_COUNT = 5;

const fetchSsLocales = async (url: string, request: Fetcher) => {
  const { ok, status, body } = await request(url, {
    method: "GET",
    headers: {
      "user-agent": "sitemap-generator-ss",
      "content-type": "application/json",
      Accept: "application/vnd.softswiss.v1+json",
    },
  });

  if (!ok) throw `SS Locales API responded with NOT OK: ${status}`;

  const res = await body.json();

  interface Locale {
    code: string;
    name: string;
    name_in_locale: string;
    default: boolean;
  }

  return res as Locale[];
};

export const getLocalesFromSsApi = async (
  url: string,
  request: Fetcher,
  filter: Filter
): Promise<Locale[]> => {
  const locales = await retry(
    () => fetchSsLocales(url, request),
    MAX_RETRY_COUNT
  );

  const codes = locales.map((locale) => locale.code);

  if (filter.include?.locales)
    return codes.filter((code) => filter.include?.locales?.includes(code));

  if (filter.exclude?.locales)
    return codes.filter((code) => !filter.exclude?.locales?.includes(code));

  return codes;
};
