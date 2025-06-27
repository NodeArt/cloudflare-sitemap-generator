import { FormData } from 'undici'

import type { Fetcher } from './request.js'

const CLOUDFLARE_API_URL = 'https://api.cloudflare.com/client/v4/'

export interface TokenAuthConfig { token: string }
export interface GlobalKeyAuthConfig { email: string, key: string }
export type CfAuthConfig = TokenAuthConfig | GlobalKeyAuthConfig

export const useCf = (auth: CfAuthConfig, request: Fetcher) => {
  type AuthHeaders =
    | { Authorization: string }
    | { 'X-Auth-Email': string, 'X-Auth-Key': string }

  const getAuthHeaders = (config: CfAuthConfig): AuthHeaders => {
    if ('token' in config) {
      return {
        Authorization: `Bearer ${config.token}`
      }
    }

    if ('email' in config && 'key' in config) {
      return {
        'X-Auth-Email': config.email,
        'X-Auth-Key': config.key
      }
    }

    throw new Error('Invalid CF auth config')
  }

  const authHeaders = getAuthHeaders(auth)

  return {
    uploadWorkerScript: async (
      accountId: string,
      name: string,
      code: string,
      bindings?: {
        text?: { name: string; content: string }[];
        json?: { name: string; content: any }[];
      }
    ) => {
      const data = new FormData()

      const metadata = {
        main_module: 'main.js',
        compatibility_date: '2025-01-01',
        bindings: [
          ...(bindings?.text?.map((binding) => ({
            type: 'plain_text',
            name: binding.name,
            text: binding.content,
          })) ?? []),
          ...(bindings?.json?.map((binding) => ({
            type: 'json',
            name: binding.name,
            json: binding.content,
          })) ?? []),
        ],
      }

      data.append(
        'metadata',
        new Blob([JSON.stringify(metadata)], { type: 'application/json' })
      )
      data.append(
        'main.js',
        new File([code], 'main.js', { type: 'application/javascript+module' })
      )

      const { statusCode: status, body } = await request(
        `${CLOUDFLARE_API_URL}/accounts/${accountId}/workers/scripts/${name}`,
        {
          method: 'PUT',
          headers: { ...authHeaders },
          body: data,
        }
      )

      const response: any = await body.json().catch((err) => {
        console.error(err)
        return undefined
      })

      console.log(status)
      console.log(response)

      if (response?.success !== true) {
        console.log(response)
        if (response?.errors?.length !== 0)
          response.errors.forEach((err: string) => console.error(err))
        throw new Error(`Could not update worker script: ${status}`)
      }
    }
  }
}
