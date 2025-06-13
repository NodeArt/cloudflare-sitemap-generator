import { FormData } from "undici";

import type { Fetcher } from "./request";

const CLOUDFLARE_API_URL = "https://api.cloudflare.com/client/v4/";

export type TokenAuthConfig = { token: string };
export type GlobalKeyAuthConfig = { email: string; key: string };
export type CfAuthConfig = TokenAuthConfig | GlobalKeyAuthConfig;

export const useCf = (auth: CfAuthConfig, request: Fetcher) => {
  const getAuthHeaders = (config: CfAuthConfig) => {
    const token = (config as TokenAuthConfig).token;

    if (token !== undefined)
      return { Authorization: `Bearer ${token}` } as { Authorization: string };

    const email = (config as GlobalKeyAuthConfig).email;
    const key = (config as GlobalKeyAuthConfig).key;

    if (email !== undefined && key !== undefined)
      return {
        "X-Auth-Email": email,
        "X-Auth-Key": key,
      } as {
        "X-Auth-Email": string;
        "X-Auth-Key": string;
      };

    throw "Invalid CF auth config";
  };

  const authHeaders = getAuthHeaders(auth);

  return {
    uploadWorkerScript: async (
      accountId: string,
      name: string,
      code: string,
      moduleSyntax = true
    ) => {
      const file = new File([code], "worker.js", { type: "text/javascript" });

      const data = new FormData();

      data.append("worker.js", file);
      data.append(
        "metadata",
        JSON.stringify(
          moduleSyntax
            ? { main_module: "worker.js" }
            : { body_part: "worker.js" }
        )
      ); // compatibility_date: "2025-01-01"

      const url =
        CLOUDFLARE_API_URL + `accounts/${accountId}/workers/scripts/${name}`;

      const { ok, status, body } = await request(url, {
        method: "PUT",
        headers: { ...authHeaders },
        body: data,
      });

      if (!ok) {
        const res = await body.text();
        throw `Could not update worker script: ${status}, ${res}`;
      }
    },
  };
};
