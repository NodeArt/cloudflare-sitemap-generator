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

export const retry = <T>(f: () => T, retryCount = 0): T => {
  const _retry = (i = 0) => {
    try {
      return f();
    } catch (error) {
      if (i < retryCount) return _retry(i + 1);
      else throw error;
    }
  };

  return _retry();
};
