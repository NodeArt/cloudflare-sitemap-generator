import { getLocalesFromSsApi } from "./locales-ss-api.js";

import type { Fetcher } from "../request.js";
import type { ApiType, Filter } from "../utils.js";

const getApiFetcher = (type: ApiType) => {
  switch (type) {
    case "ss":
      return getLocalesFromSsApi;

    default:
      throw new Error("Unsupported locales-list API type");
  }
};

export const useLocalesApi = (type: ApiType, url: string, request: Fetcher) => {
  const fetcher = getApiFetcher(type);

  return {
    getLocales: (filter: Filter) => fetcher(url, request, filter),
  };
};
