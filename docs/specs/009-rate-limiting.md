# 009 — Rate limiting

| Field | Value |
| --- | --- |
| Area | Security |
| Related | [020](020-registration-and-password-policy.md), [023](023-local-login.md) |

## Behaviour

- better-auth's rate limiter, per client IP: `POST /api/auth/sign-in/*`, `/sign-up/*` and `/change-password` allow
  `AUTH_RATE_LIMIT_REQUESTS` (default 10) requests per `AUTH_RATE_LIMIT_WINDOW_SECONDS` (default 60); `0` disables it.
  Other better-auth endpoints: 600 per minute. Over the limit → 429; the login and registration pages show
  "Trop de tentatives. Réessayez dans une minute."
- The client IP comes from `CLIENT_IP_HEADER` (default `X-Forwarded-For`), skipping the addresses in `TRUSTED_PROXIES`
  (default `127.0.0.1,::1`, the Vite proxy, which adds the header with `xfwd`). Behind an ingress, add its address range.
- Counters are in memory (one API process).

## Acceptance criteria

- The 11th sign-in attempt within a minute from one IP returns 429; another IP is unaffected.

## Differences from the original

- The checker-service limit does not apply (no checker service yet).

## Source

`apps/api/src/auth.ts`, `apps/api/src/env.ts`, `apps/app/vite.config.ts`, `e2e/account.spec.ts`. Tests send a random
`X-Forwarded-For` per test (`e2e/fixtures.ts`).
