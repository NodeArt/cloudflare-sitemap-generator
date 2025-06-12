import { Fetcher } from "../request";
import { ApiType, Filter, Locale } from "../utils";
import { getPagesFromGamesApi } from "./pages-games-api";
import { getPagesFromSsApi } from "./pages-ss-api";

const getApiFetcher = (type: ApiType) => {
  switch (type) {
    case "ss":
      return getPagesFromSsApi;

    case "games":
      return getPagesFromGamesApi;

    default:
      throw "Unsupported pages-list API type";
  }
};

export const usePagesApi = (type: ApiType, url: string, request: Fetcher) => {
  const fetcher = getApiFetcher(type);

  return {
    getPages: (locales: Locale[], filter: Filter) =>
      fetcher(url, request, locales, filter),
  };
};
