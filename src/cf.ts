import { FormData } from "undici";

import type { Fetcher } from "./request.js";

const CLOUDFLARE_API_URL = "https://api.cloudflare.com/client/v4/";

export type TokenAuthConfig = { token: string };
export type GlobalKeyAuthConfig = { email: string; key: string };
export type CfAuthConfig = TokenAuthConfig | GlobalKeyAuthConfig;

export const useCf = (auth: CfAuthConfig, request: Fetcher) => {
  type AuthHeaders =
    | { Authorization: string }
    | { "X-Auth-Email": string; "X-Auth-Key": string };

  const getAuthHeaders = (config: CfAuthConfig): AuthHeaders => {
    if ("token" in config)
      return {
        Authorization: `Bearer ${config.token}`,
      };

    if ("email" in config && "key" in config)
      return {
        "X-Auth-Email": config.email,
        "X-Auth-Key": config.key,
      };

    throw new Error("Invalid CF auth config");
  };

  const authHeaders = getAuthHeaders(auth);

  return {
    uploadWorkerScript: async (
      accountId: string,
      name: string,
      code: string,
      moduleSyntax = true
    ) => {
      const file = new File([code], "worker.js", {
        type: moduleSyntax
          ? "application/javascript+module"
          : "application/javascript",
      });

      const data = new FormData();

      data.append("worker.js", file);
      data.append(
        "metadata",
        JSON.stringify({
          ...(moduleSyntax
            ? { main_module: "worker.js" }
            : { body_part: "worker.js" }),
          compatibility_date: "2025-01-01",
        })
      );

      const url =
        CLOUDFLARE_API_URL + `accounts/${accountId}/workers/scripts/${name}`;

      const { ok, status, body } = await request(url, {
        method: "PUT",
        headers: { ...authHeaders },
        body: data,
      });

      if (!ok) {
        const res = await body.text();
        throw new Error(`Could not update worker script: ${status}, ${res}`);
      }
    },
  };
};
