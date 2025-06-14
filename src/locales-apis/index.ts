import { getLocalesFromSsApi } from "./locales-ss-api";
import { Fetcher } from "../request";
import { ApiType, Filter } from "../utils";

const getApiFetcher = (type: ApiType) => {
  switch (type) {
    case "ss":
      return getLocalesFromSsApi;

    default:
      throw "Unsupported locales-list API type";
  }
};

export const useLocalesApi = (type: ApiType, url: string, request: Fetcher) => {
  const fetcher = getApiFetcher(type);

  return {
    getLocales: (filter: Filter) => fetcher(url, request, filter),
  };
};
