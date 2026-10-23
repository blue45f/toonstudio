#!/bin/bash
# 명령을 onpod libpq 환경(PGHOST·PGUSER·PGPASSWORD·PGDATABASE·PGSSLMODE)에서 실행한다. 값은 ENVF 의
# ONPOD_DATABASE_URL_PUBLIC 에서 읽고, 모든 출력은 redact.mjs 를 거친다. 접속 값은 출력하지 않는다.
# 사용법: ENVF=<.env.infrastructure.local 경로> ./onpod-run.sh <명령...>
set -o pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
: "${ENVF:?주 작업트리 루트의 .env.infrastructure.local 경로를 ENVF 로 넘기세요}"
_U=$(grep -E '^ONPOD_DATABASE_URL_PUBLIC=' "$ENVF" | head -1 | cut -d= -f2-)
[ -n "$_U" ] || { echo "ONPOD_DATABASE_URL_PUBLIC 이 없다" >&2; exit 2; }
_UP=${_U#*://}; _CRED=${_UP%%@*}; _REST=${_UP#*@}
export PGUSER=${_CRED%%:*} PGPASSWORD=${_CRED#*:}
_HP=${_REST%%/*}; export PGHOST=${_HP%%:*} PGPORT=${_HP##*:}
_DBP=${_REST#*/}; export PGDATABASE=${_DBP%%\?*}
unset _U _UP _CRED _REST _HP _DBP
export PGSSLMODE=require PGCHANNELBINDING=require PGCONNECT_TIMEOUT=20 PSQLRC=/dev/null
"$@" 2>&1 | node "$HERE/redact.mjs"
