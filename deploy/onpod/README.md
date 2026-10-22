# deploy/onpod — onpod 서울 재구축 도구

- 문서 상태: **migration** (2026-10-22). 현재 구성의 정본은 [`docs/operations/infrastructure-map.md`](../../docs/operations/infrastructure-map.md)이고 결정 근거는 [`docs/adr/0030-seoul-origin-hybrid-infrastructure.md`](../../docs/adr/0030-seoul-origin-hybrid-infrastructure.md)다.
- 이 디렉터리는 **상시 승인 배포 단위가 아니다**(`deploy/STANDING_APPROVAL.json` 범위 밖). 소유자가 승인한 onpod 신규 구성(DB·Core API)을 다시 만들 수 있게 하는 도구와 기록이다. 자동 배포나 CI에 연결하지 않는다.
- 비밀값은 이 디렉터리에 없다. 스크립트는 주 작업트리 루트의 `.env.infrastructure.local`(`ENVF`)에서만 값을 읽고 출력에서 가린다.

## schema-apply — onpod DB에 운영 스키마를 올린다

공식 `scripts/run-production-database-migrations.mjs`는 `verify-full` TLS와 분리된 런타임 역할을 요구해 onpod 개발용 DB(자체 서명 인증서, 단일 소유자 역할)에는 그대로 쓸 수 없다. 이 도구는 고정 커밋 `37b51837787ea67ee26b14358a1ac84664a7c584`의 공식 부트스트랩 순서를 그대로 재현하되 TLS와 역할 부분만 최소로 패치한다. 원장·체크섬·잠금·provenance 로직은 공식 코드 그대로다.

### 전제

- 저장소 루트에서 `pnpm install`이 끝나 있다(`node_modules` 거울을 만든다). Node 24, `psql` 클라이언트(libpq 17 권장).
- `toonstudio-db`가 실행 중이고 내 IP가 허용목록에 있다(`docs/operations/infrastructure-map.md` 6.2절). 허용목록 반영에는 수십 초가 걸린다.
- `ENVF`가 `.env.infrastructure.local` 경로이고 `ONPOD_DATABASE_URL_PUBLIC`이 **현재** 비밀번호를 담고 있다(배포·회전 직후에는 6.4절 동기화를 먼저 한다).

### 순서

```sh
# 1) 오프라인 작업공간 재구성(DB 접속 없음, 저장소는 읽기만 한다). 새 빈 디렉터리를 고른다.
W="$(mktemp -d)"
deploy/onpod/schema-apply/rebuild.sh "$W"

# 2) 계획만 확인(DB 쓰기 없음): 계약 지문, 사전점검, Drizzle DDL 생성(2회 결정성 증명)
cd "$W/repo" && ENVF="<.env.infrastructure.local 경로>" ONPOD_SINGLE_ROLE=1 ../onpod-run.sh node scripts/onpod-apply-schema.mjs plan

# 3) 실행(쓰기). 대상이 비어 있어야 한다. 비어 있지 않으면 먼저 sql/reset-app-objects.sql 을 실행한다(public 과 확장은 보존).
ENVF="<경로>" ONPOD_SINGLE_ROLE=1 ../onpod-run.sh node scripts/onpod-apply-schema.mjs execute

# 4) 검증: 원장 114행, 체크섬, 필수 관계 223개, 확장, 무결성 12개 항목
ENVF="<경로>" ONPOD_SINGLE_ROLE=1 ../onpod-run.sh node scripts/onpod-verify.mjs

# 5) 준비성 재생: 앱의 isSchemaReady() 를 실제 코드로 실행해 false 플래그를 나열한다(읽기 전용)
ENVF="<경로>" ../onpod-run.sh node node_modules/tsx/dist/cli.mjs scripts/onpod-readiness-replay.mjs
```

- 성공 기준: `ONPOD SCHEMA APPLY COMPLETE`, 재실행 `apply`가 `0 applied · 113 skipped`, 검증 12/12.
- 이미 적용된 DB에서 `execute`를 다시 실행하면 비어 있지 않아 거부한다. 의도한 재구축일 때만 `sql/reset-app-objects.sql`을 먼저 실행한다.
- `sql/20`·`21`·`30`은 소유자 ACL 실험과 `*_require_ready()` 점검이고 `sql/90`은 마지막 읽기 전용 스냅샷이다. 읽기 전용 SQL은 `psql -X -v ON_ERROR_STOP=1 -f <파일>`로 `onpod-run.sh` 아래에서 실행한다.
- `patches/*.diff`는 공식 스크립트 3개에 가한 변경(12곳)이다. `rebuild.sh`가 다시 만든 패치본 3개는 2026-10-22 실행본과 바이트 동일함을 확인했다. onpod 전용 스크립트 3개는 실행 뒤 린트 수정(미사용 import·타입)만 가했고, 수정 뒤 4·5단계를 실제 DB에 다시 실행해 같은 결과(검증 12/12, false 플래그 6개)를 확인했다. 패치는 고정 커밋의 문자열에 맞춰져 있어 다른 커밋에서는 `apply-patches.mjs`가 실패한다(조용히 넘어가지 않는다).

### 알려진 한계

- **마켓플레이스 ACL 플래그 6개가 false**: 단일 소유자 역할에서는 SQL로 풀 수 없다. 비소유 로그인 역할이 필요하다([인프라 지도 7.3절](../../docs/operations/infrastructure-map.md)).
- `0093_review_voice_note_constraints_repair`의 비한정 `CREATE FUNCTION`은 실행 SQL에서만 `public.` 한정으로 치환했다. 같은 결함이 슈퍼유저가 아닌 운영 마이그레이터에서도 난다.
- `sql/40-out-of-manifest-objects.sql`은 매니페스트에 없는 표 4개의 DDL이며 **실행하지 않았다**.
- 출력 마스킹은 `redact.mjs`가 `PG*` 환경변수 값, `postgres://` URL, IPv4 리터럴을 가린다. 그래도 로그를 채팅에 붙이기 전에 한 번 더 확인한다.
