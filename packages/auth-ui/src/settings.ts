import type { PublicSettings } from '@pupitre/shared'
import { useEffect, useState } from 'react'

let cached: Promise<PublicSettings | null> | null = null

function load() {
  cached ??= fetch('/api/settings/public')
    .then((res) => (res.ok ? (res.json() as Promise<PublicSettings>) : null))
    .catch(() => null)
  return cached
}

/** Spec 179 public settings (registration, password policy, local login), fetched once per page load. */
export function usePublicSettings() {
  const [settings, setSettings] = useState<PublicSettings | null | undefined>(undefined)
  useEffect(() => {
    let active = true
    load().then((s) => active && setSettings(s))
    return () => {
      active = false
    }
  }, [])
  return settings
}

export type SsoProviderInfo = { id: string; name: string; kind: 'oidc' | 'github' }
let providersCache: Promise<SsoProviderInfo[]> | null = null

/** Specs 027, 028: the SSO providers shown on the login page. */
export function useSsoProviders() {
  const [providers, setProviders] = useState<SsoProviderInfo[]>([])
  useEffect(() => {
    let active = true
    providersCache ??= fetch('/api/sso/providers')
      .then((r) => (r.ok ? (r.json() as Promise<{ providers: SsoProviderInfo[] }>) : { providers: [] }))
      .then((d) => d.providers)
      .catch(() => [])
    providersCache.then((p) => active && setProviders(p))
    return () => {
      active = false
    }
  }, [])
  return providers
}
