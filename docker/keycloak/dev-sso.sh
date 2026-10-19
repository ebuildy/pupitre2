#!/bin/sh
# SSO demo (spec 027): Keycloak in Docker, then `pnpm dev`, whose defaults (apps/api/dev.env) sign in through it.
set -e
cd "$(dirname "$0")/../.."
KEYCLOAK_PORT="${KEYCLOAK_PORT:-8180}"
export KEYCLOAK_PORT
docker compose -f docker/keycloak/compose.yaml up -d --wait
echo "Keycloak: http://localhost:$KEYCLOAK_PORT (console admin / admin) — realm pupitre: etudiant, manager, admin"
if [ "$KEYCLOAK_PORT" != 8180 ]; then export OIDC_PROVIDER_URL="http://localhost:$KEYCLOAK_PORT/realms/pupitre"; fi
exec pnpm dev
