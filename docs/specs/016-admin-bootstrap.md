# 016 — Admin account bootstrap

| Field | Value |
| --- | --- |
| Area | Operations / security |
| Actors | Platform operator |
| Related | [001](001-roles-and-permissions.md), [023](023-local-login.md) |

## Summary

At every API start, after migrations and before listening, an admin account is ensured.

| | |
| --- | --- |
| Username | `admin` |
| E-mail | `admin@pupitre.local` |
| Role | `admin` |
| Login | `admin` or `admin@pupitre.local` on `/login` |

## Password

Source, in order:

1. `ADMIN_PASSWORD_FILE` — trimmed content of the file (e.g. a mounted Kubernetes Secret);
2. `ADMIN_PASSWORD`;
3. none → built-in default `Admin@1234`, with a warning in the logs.

Hashed with better-auth's default password hasher (scrypt).

## Behaviour

| Situation | Effect |
| --- | --- |
| Account missing | Created (verified e-mail, active, `admin` role) with a credential account and the password above. |
| Account exists, password configured | Password overwritten at every start (rotation by restart). |
| Account exists, no password configured | Password left unchanged (the default never overwrites). |
| Account exists but lost the admin role or was deactivated | Restored to `admin`, active. |

## Acceptance criteria

- Fresh install without configuration: `admin` / `Admin@1234` logs in and lands on `/admin`.
- Changing `ADMIN_PASSWORD` and restarting: the old password stops working, the new one works.
- Changing the admin's password in the app, then restarting without configuration: the changed password still works.

## Differences from the original

- No polling of `ADMIN_PASSWORD_FILE` every 30 s: the file is read at startup only.
- No precomputed bcrypt hash support (`ADMIN_PASSWORD` starting with `$2`): hashes are scrypt.
- The admin can also log in by username `admin`.

## Source

`apps/api/src/bootstrap/admin.ts`, `apps/api/src/index.ts`, `apps/api/src/env.ts`.
