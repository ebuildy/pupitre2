#!/bin/sh
# SSO demo (spec 027): Keycloak in Docker, then `pnpm dev` with the runtime OIDC provider pointing at it (spec 029)
# and its own database, so the usual dev database is left alone.
set -e
cd "$(dirname "$0")/../.."
KEYCLOAK_PORT="${KEYCLOAK_PORT:-8180}"
export KEYCLOAK_PORT
docker compose -f docker/keycloak/compose.yaml up -d --wait
echo "Keycloak: http://localhost:$KEYCLOAK_PORT (console admin / admin) — realm pupitre: etudiant, manager, admin"

export DATABASE_URL="${SSO_DEMO_DATABASE_URL:-./data/sso-demo.db}"
export OIDC_ENABLED=true
export OIDC_NAME=Keycloak
export OIDC_PROVIDER_URL="http://localhost:$KEYCLOAK_PORT/realms/pupitre"
export OIDC_CLIENT_ID=pupitre
export OIDC_CLIENT_SECRET=pupitre-demo-secret
# The realm has no `groups` scope: its client mapper puts the groups in every token.
export OIDC_SCOPES='openid email profile'
exec pnpm dev
