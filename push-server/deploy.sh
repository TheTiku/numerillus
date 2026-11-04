#!/bin/sh
# Despliega el servidor de avisos de Numerillus en Cloudflare Workers usando la API (sin wrangler).
# Requisitos (fuera del repositorio):
#   ~/.numerillus/cf-token    token de API con la plantilla "Edit Cloudflare Workers"
#   ~/.numerillus/vapid.json  claves VAPID (publicKey + privateJwk)
set -eu
DIR=$(cd "$(dirname "$0")" && pwd)
SECRETS="$HOME/.numerillus"
NAME="numerillus-push"
API="https://api.cloudflare.com/client/v4"
TOKEN=$(tr -d '\n\r ' < "$SECRETS/cf-token")
AUTH="Authorization: Bearer $TOKEN"

j() { python3 -c "import sys,json; d=json.load(sys.stdin); $1"; }
call() { curl -sS -H "$AUTH" "$@"; }
check() { j "import sys; (print('ERROR', d.get('errors')), sys.exit(1)) if not d.get('success') else print('  ok')"; }

echo "· Cuenta"
ACCOUNT=$(call "$API/accounts" | j "print(d['result'][0]['id'])")

echo "· Subdominio workers.dev"
SUB=$(call "$API/accounts/$ACCOUNT/workers/subdomain" | j "print((d.get('result') or {}).get('subdomain') or '')")
if [ -z "$SUB" ]; then
  SUB="numerillus-$(python3 -c 'import secrets; print(secrets.token_hex(3))')"
  call -X PUT "$API/accounts/$ACCOUNT/workers/subdomain" -H "Content-Type: application/json" \
    --data "{\"subdomain\":\"$SUB\"}" | check
fi
echo "  $SUB.workers.dev"

echo "· Almacén KV"
KV=$(call "$API/accounts/$ACCOUNT/storage/kv/namespaces?per_page=100" \
  | j "print(next((n['id'] for n in d['result'] if n['title']=='numerillus-subs'), ''))")
if [ -z "$KV" ]; then
  KV=$(call -X POST "$API/accounts/$ACCOUNT/storage/kv/namespaces" -H "Content-Type: application/json" \
    --data '{"title":"numerillus-subs"}' | j "print(d['result']['id'])")
fi

echo "· Código y configuración"
META=$(mktemp)
python3 - "$KV" "$SECRETS/vapid.json" > "$META" <<'EOF'
import json, sys
kv, vapid_path = sys.argv[1], sys.argv[2]
v = json.load(open(vapid_path))
print(json.dumps({
  "main_module": "worker.js",
  "compatibility_date": "2025-01-01",
  "bindings": [
    {"type": "kv_namespace", "name": "SUBS", "namespace_id": kv},
    {"type": "plain_text", "name": "VAPID_PUBLIC_KEY", "text": v["publicKey"]},
    {"type": "plain_text", "name": "VAPID_SUBJECT", "text": "https://thetiku.github.io/numerillus/"},
    {"type": "plain_text", "name": "ALLOWED_ORIGINS", "text": "https://thetiku.github.io,http://localhost:8765"},
    {"type": "secret_text", "name": "VAPID_PRIVATE_JWK", "text": json.dumps(v["privateJwk"])},
  ],
}))
EOF
call -X PUT "$API/accounts/$ACCOUNT/workers/scripts/$NAME" \
  -F "metadata=@$META;type=application/json" \
  -F "worker.js=@$DIR/worker.js;type=application/javascript+module" \
  -F "webpush.js=@$DIR/webpush.js;type=application/javascript+module" | check
rm -f "$META"

echo "· Publicar en $NAME.$SUB.workers.dev"
call -X POST "$API/accounts/$ACCOUNT/workers/scripts/$NAME/subdomain" -H "Content-Type: application/json" \
  --data '{"enabled":true}' | check

echo "· Cron cada 5 minutos"
call -X PUT "$API/accounts/$ACCOUNT/workers/scripts/$NAME/schedules" -H "Content-Type: application/json" \
  --data '[{"cron":"*/5 * * * *"}]' | check

echo "URL=https://$NAME.$SUB.workers.dev"
