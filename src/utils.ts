export type ApiType = "ss" | "games";

export type Filters = {
  urls?: string[];
  locales?: string[];
  categories?: string[];
  providers?: string[];
  ids?: string[];
};

export type Filter =
  | { include?: Filters; exclude?: never }
  | { include?: never; exclude?: Filters };

export type Locale = string;

export type Page = {
  path: string;
  lang: string;
  priority: Priority;
  freq: ChangeFrequency;
  alternates: { path: string; lang: string }[];
};

export type Sitemap = {
  name: string;
  xml: string;
  baseUrl: string;
};

export type Priority = number;
export type ChangeFrequency =
  | "always"
  | "daily"
  | "weekly"
  | "monthly"
  | "yearly";

export const retry = async <T>(
  f: () => Promise<T> | T,
  retryCount = 0
): Promise<T> => {
  const _retry = async (i = 0) => {
    try {
      return await f();
    } catch (err) {
      if (i >= retryCount) throw err;
      console.error(err);
      return _retry(i + 1);
    }
  };

  return await _retry();
};
