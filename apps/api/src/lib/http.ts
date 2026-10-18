/**
 * Spec 014: every outbound HTTP call goes through here, so none runs without a timeout. Node's fetch already shares
 * one pooled keep-alive agent (undici's global dispatcher).
 */
export function httpFetch(url: string | URL, init: RequestInit & { timeoutMs?: number } = {}) {
  const { timeoutMs = 15_000, ...rest } = init
  return fetch(url, { ...rest, signal: rest.signal ?? AbortSignal.timeout(timeoutMs) })
}
