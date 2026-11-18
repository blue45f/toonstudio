# 관리자 보드 운영 반영 조건과 읽기 전용 진단

- 문서 상태: **current** — 소스의 진단 계약과 운영 판정 기준. 운영 반영은 아래 증거를 수집하기 전까지 **migration / 미검증**이다.
- 작성 기준일: **2026-11-19**. 이 문서나 진단 워크플로의 병합은 운영 DB 적용·API 배포·관리자 웹 배포를 뜻하지 않는다.
- 인프라·승인 정본: [인프라 지도](infrastructure-map.md), [DEPLOY.md](../../DEPLOY.md), [관리자 앱 README](../../apps/admin-web/README.md).
- 구현: [수동 워크플로](../../.github/workflows/onpod-admin-readonly-audit.yml), [실행기](../../scripts/run-onpod-admin-readonly-audit.mjs), [고정 DB 진단 코드](../../scripts/onpod-admin-db-audit-payload.mjs).

## 1. 상태를 판정하는 증거

| 구분 | 완료 판정에 필요한 증거 | 이것만으로는 완료로 판정하지 않음 |
| --- | --- | --- |
| 코드 병합 | 원격 main의 정확한 40자리 SHA에 관리자 소스·manifest가 포함됨 | PR 제목, 과거 main SHA |
| CI | 해당 SHA의 필수 `core`·`verify`와 관련 검사 결과 | 다른 SHA의 성공, 진행 중인 실행, Architecture boundaries 한 개 성공 |
| DB | 전체 manifest와 운영 원장의 ID·checksum·state·provenance·releaseSha·적용 시각 대조, 순서와 관리자 표의 카탈로그 검사 | SQL 파일 존재, `CREATE TABLE IF NOT EXISTS`, health 200 |
| API | Onpod `toonstudio-api`의 현재 이미지와 컨테이너 `/app/RELEASE_SHA`, 필요한 경로·권한 동작 | GHCR 이미지 발행, 이전 이미지, readiness 200만 확인 |
| 관리자 웹 | Cloudflare 활성 배포 메타데이터, 공개 build-meta SHA, Admin HTML과 그 HTML이 참조하는 번들 | 앱 README, 일반 Web SPA fallback의 HTTP 200 |
| 기능 검증 | 인증·권한별 허용/거부, 저장·충돌·복구·내보내기 결과를 실제 배포 버전에 연결한 기록 | 로컬 단위 테스트, 무인증 401/403, 메뉴만 보이는 상태 |

DB 원장이 `applied`로 입증한 항목은 재적용 목록에서 뺀다. 비교 결과 `pending`은 검증된 원장에서 실제 빠진 항목이며, `unknown`은 아직 적용 여부를 판단할 수 없는 항목이다. `checksum-drift`·`incomplete`·순서 불일치는 실행 중단 사유다. 표가 이미 존재하는데 원장이 없거나 불완전하면 `adopt`·`repair` 또는 SQL 재실행으로 추정 보정하지 않는다.

진단의 `status: ok`는 읽기 전용 조회의 완료를 뜻한다. `migrations.integrity`, `orderValid`, 개별 비교 상태와 카탈로그 결과를 별도로 검토한다. 이 상태가 배포 승인이나 기능 준비 완료를 대신하지 않는다.

## 2. 0122~0128의 순서·의존성·보존 조건

정본은 [production migration manifest](../../scripts/production-database-migrations.manifest)다. 전체 목록은 0001부터 연속이어야 하며, 0122 앞의 실제 미적용 항목을 건너뛰지 않는다. 진단은 0122~0128만 조회해서 앞부분이 완료됐다고 가정하지 않고, checkout에 있는 전체 SQL 파일의 SHA-256을 계산한다.

원장 자체인 `0023_production_migration_ledger`는 정식 실행기가 0020 이후 순회 전에 생성·기록한다. 따라서 checksum·state·`bootstrap` provenance·release SHA·적용 시각이 정상인 0023만 일반 적용 순서 비교에서 제외한다. 0023 행이 없으면 `pending`으로 추정하지 않고 `unknown`으로 차단하며, 다른 항목의 실제 중간 누락은 계속 순서 오류다.

| 순서 | 변경과 의존성 | 기존 자료·권한 조건 |
| --- | --- | --- |
| 0122 | 통합 작업실의 본문·감사·영수증 3개 표. 기존 사용자 표를 참조 | singleton 초기 행은 충돌 시 보존. RLS·브라우저 역할 권한 회수 조건을 확인 |
| 0123 | 사업계획서 본문·revision·감사·영수증 4개 표와 불변 이력 보호 함수·trigger | 과거 snapshot·감사·영수증의 수정/삭제 및 truncate 보호를 유지 |
| 0124 | NestJS 검증 보드·이력 2개 표와 이력 변경 차단 trigger | 문서·작업 상태는 보드의 저장 자료이며 실제 CI나 운영 배포를 자동 실행하지 않음 |
| 0125 | 소유자별 클라우드 작업 보드·감사·영수증 3개 표 | 소유자·보드 복합키로 격리. 사용자 삭제의 FK cascade가 있으므로 계정 삭제를 데이터 보존 절차와 분리 |
| 0126 | AI 운영 보드·감사·영수증 3개 표 | singleton 초기 행은 충돌 시 보존. 관리자 기록 저장과 실제 유료 AI 호출·계정 설정은 별개 |
| 0127 | 0122 이후. 운영/사업 영역별 revision, 사업 소유자, grant·접근 감사 2개 표 | 기존 payload·감사·영수증을 재작성하지 않음. 기존 이력의 scope는 `legacy`. 과거 `updated_by`를 소유자로 추정하지 않음 |
| 0128 | 0123 이후. 사업계획서 소유자, grant·접근 감사 2개 표. 0123의 불변 보호 함수를 재사용 | 기존 본문에 소유자를 자동 배정하지 않음. 6개 사업계획서 표의 RLS와 접근 감사 보호를 확인 |

SQL의 추가형 구문이 기존 객체의 정의 일치까지 입증하지는 않는다. `IF NOT EXISTS`로 건너뛴 표·열·제약이 예상 계약과 다른 경우를 카탈로그로 확인해야 한다. 진단은 알려진 19개 표의 존재·열 타입·null/default 여부·제약 검증 상태·보호 trigger·RLS·유효 권한 및 공개 grant 개수만 반환한다. 제약 식·함수 본문을 가져오지 않으므로 같은 이름의 잘못된 제약 정의까지 완전히 증명하지 않는다.

0127·0128의 소유자가 없는 기존 사업 자료는 계속 접근 거부 상태를 유지한다. 빈 보드의 최초 claim과 기존 데이터의 귀속 복구를 구분하고, 과거 수정자나 현재 관리자라는 이유만으로 소유권을 만들지 않는다. 소유권 집계는 사용자 ID·이메일·원문을 출력하지 않는다. `payload IS NOT NULL` 집계만으로 실제 사업 내용이 비어 있는지 판정할 수 없으므로 진단 결과만으로 claim 또는 복구를 자동 실행하지 않는다.

세부 계약은 [통합 작업실](admin-workspace-integration.md), [사업계획서 접근 권한](admin-business-plan-access.md), [NestJS 보드](admin-nestjs-quality-board.md), [AI 운영 보드](admin-ai-operations-board.md)를 함께 확인한다.

## 3. 권한과 기존 데이터 보존

통합 작업실의 운영 영역과 비공개 사업 영역은 별도 권한 경계다. 사업 영역 및 사업계획서는 활성 관리자 여부에 더해 소유자 또는 명시적인 grant를 확인한다. 읽기·쓰기·내보내기 권한을 구분하며 한 보드에서 받은 grant가 다른 보드의 권한으로 확장되지 않는다. NestJS·AI 운영 보드의 공유 권한, 클라우드 보드의 개인 소유권, CI/QA의 브라우저 로컬 상태도 서로 대체하지 않는다.

브라우저 localStorage와 외부 Sites의 자료는 DB migration만으로 서버에 이관되지 않는다. 운영 보드 전환 전에 원본 export·수동 import 대상·소유자·digest 또는 revision을 확인하고, 기존 브라우저 자료를 자동 삭제하지 않는다. 새 서버 표나 첫 빈 화면만으로 과거 자료가 안전하게 이관되었다고 보고하지 않는다.

**인증된 GET도 항상 DB 읽기 전용은 아니다.** 사업 영역/사업계획서의 성공한 읽기·접근 목록·내보내기는 접근 감사 행을 기록할 수 있다. 이 진단은 해당 사용자 API를 호출하지 않는다. 실제 기능 검증을 할 때는 허용된 계정과 기록 대상·생성되는 감사 이력을 먼저 특정한다. 사용자 역할이나 상태를 바꾸는 `verify-admin-qa-live.mjs`는 이 읽기 전용 절차에 포함하지 않는다.

앱 소유자 역할의 RLS 우회 가능성과 실제 grant를 함께 검토한다. `ENABLE ROW LEVEL SECURITY`만으로 단일 소유자 DB의 API 권한 경계를 입증하지 않는다. 운영 계정·세션·grant 변경은 DB 진단과 별도 작업이다.

## 4. 무료 범위의 고정 진단 실행

실행 주체는 저장소 운영 권한이 있는 사용자/에이전트이며, 기존 `production-deploy` Environment의 main 제한을 따른다. 입력은 **현재 원격 main의 소문자 40자리 `release_sha` 하나**다. SQL·명령어·앱 이름·DB 주소·임의 API endpoint 입력은 받지 않는다.

1. 최신 main의 PR/CI 상태를 기록하고 Actions의 **Onpod admin read-only audit**를 main에서 수동 실행한다. 이 워크플로는 변경을 실행하지 않으므로 배포 CI 게이트를 대체하지 않는다.
2. 워크플로는 실행 당시 `github.sha`, checkout HEAD, 다시 조회한 origin/main, 입력 SHA가 같은지 확인한다. 실행 대기 중 main이 바뀌면 실패하며 이전 SHA로 진행하지 않는다.
3. 운영 secret이 없는 단계에서 두 Node 테스트를 실행하고 공식 Onpod CLI `0.7.159`를 설치한다. 정본 npm 패키지의 installer는 해당 버전의 release 바이너리 SHA-256을 검증한다.
4. 마지막 단계만 `ONPOD_DEPLOY_TOKEN`을 받는다. 고정 앱 `toonstudio-api`의 상태를 조회하고 `free_tier === true`와 `state === running`일 때만 다음 진단을 실행한다. 사전 조회에서 절전·비실행 상태이면 `exec`를 호출하지 않고, 플랜 변경 명령은 보내지 않는다. 다만 [Onpod의 2026-10-20 공식 변경 기록](https://onpod.ai/updates)에 명시된 `exec`의 자동 절전 해제 동작 때문에 상태 조회와 `exec` 사이에 절전으로 전환되는 경우까지 원자적으로 배제할 수는 없다.
5. 공식 CLI의 stdin 전송으로 고정 Node payload를 한 번 실행한다. Node heap 상한 64 MiB, CLI timeout 40초, 로컬 자식 프로세스 timeout 60초다. 대상 앱의 기존 `DATABASE_URL`은 컨테이너 내부에서만 사용한다.
6. 내부 호스트가 `toonstudio-db.db.onpod.local:5432`인지 확인하고 `BEGIN READ ONLY`, 조회 제한 시간, 마지막 `ROLLBACK`·연결 종료를 확인한다. 개인 원문·식별자를 읽어 출력하지 않는다.
7. 허용된 sentinel JSON 하나를 검증한 뒤 필드·값을 다시 허용 목록으로 투영한다. 원래 stdout/stderr, 예외 메시지, DB URL, 토큰, 환경변수 맵은 로그·artifact에 남기지 않는다. Actions 요약에는 정제된 JSON만 남긴다.

공개 저장소의 표준 `ubuntu-24.04` runner를 사용하고 job 상한은 10분이다. 유료 runner·새 서버·새 DB·AI 호출·계정 변경·배포·migration은 실행하지 않는다. 의존성 전체 설치, Actions cache, artifact 업로드도 없다. 조회는 짧은 추가 프로세스와 DB 연결을 사용하므로 기존 앱의 메모리·DB 부하는 완전히 0이 아니다. 실패하면 자동 재실행하거나 유료 플랜으로 확장하지 않는다.

`CLOUDFLARE_API_TOKEN`이 이미 제공되는 경우에만 고정 Worker `toonspectrum-web`의 deployments/settings에 GET을 보내 활성 deployment/version ID와 허용된 `RELEASE_SHA`만 기록한다. 토큰이 없으면 `not-configured`, 권한이 거부되면 `denied`로 남긴다. redirect를 허용하지 않고 토큰·계정 ID를 Onpod 자식 프로세스에 전달하지 않는다.

## 5. 실제 관측과 아직 닫히지 않은 조건

다음은 **2026-11-19에 수행한 개별 읽기 관측**이며, 최신 운영 상태를 영구적으로 보장하지 않는다.

| 관측 시각(KST) | 근거 | 판정 범위 |
| --- | --- | --- |
| 02:08 | 공개 `https://www.toonstudio.cloud/.vite/build-meta.json`: `gitSha=df34d31c0c42916e08f698084a0c1618e1d012bd`, `buildId=a902faf52105` | 당시 공개 정적 웹이 가리킨 빌드. 11월 18일 관리자 보드 병합 SHA의 배포 증거로 쓸 수 없음 |
| 02:08 | www 및 직접 Onpod `/api/health/ready`가 HTTP 200 | readiness 응답 확인. API 이미지 SHA와 0122~0128 적용 여부는 별도 미검증 |
| 02:38 | GitHub `production-deploy` 설정을 읽어서 main 제한, `ONPOD_DEPLOY_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` 변수 존재 확인 | 기존 앱 범위 키를 사용하는 진단 경로가 있음. 키의 현재 유효성은 실제 진단에서 확인 필요 |
| 02:38 | GitHub Environment와 repository secret의 **이름만** 조회. 양쪽 모두 `CLOUDFLARE_API_TOKEN` 없음 | 현재 Actions의 Cloudflare 배포 인증이 없음. 자동 재발급·추출·계정 설정을 하지 않음 |

설정 확인 위치는 [production-deploy Environment](https://github.com/blue45f/toonstudio/settings/environments)와 [Actions secrets](https://github.com/blue45f/toonstudio/settings/secrets/actions)다. 값은 조회·기록하지 않았다. 이후 계정 설정이 바뀌면 위 관측을 새 시각과 증거로 갱신한다.

현재 Onpod용 일반 production migration 경로에는 단일 소유자 DB·TLS 관련 차단 조건이 있다. 이 진단은 기존 앱 연결의 TLS 암호화 여부, 인증 여부, 인증서 지문·기간·호스트 일치, 역할 권한을 기록하지만 **migration용 TLS/채널 바인딩 증거가 아니다.** `migrationTransportVerified`와 `channelBindingEnforced`는 항상 false다. 진단 성공을 이유로 기존 `ONPOD_DATABASE_WORKFLOW_UNSUPPORTED` 차단이나 migration 승인 정책을 제거하지 않는다.

## 6. 결과에 따른 다음 작업과 실패 대응

| 진단 결과 | 다음에 특정할 작업 |
| --- | --- |
| 해당 migration이 `applied`, checksum·provenance·순서·카탈로그 일치 | DB 재적용 대상에서 제외하고 API/웹 배포와 권한 검증으로 진행 |
| 검증된 원장에 후속 항목이 `pending` | 실제 pending ID만 순서대로 나열. 대상 DB·역할·TLS·잠금 시간·현재 데이터·복구 증거와 기존 승인을 대조한 뒤 별도 변경 절차를 준비 |
| 원장 부재, 미확인 항목, checksum drift, 중간 누락, durable lock, 예상과 다른 스키마 | 적용을 시작하지 않고 증거를 보완. 이미 실행된 SQL을 재적용하거나 원장을 자동 수리하지 않음 |
| API 이미지가 기준 SHA보다 오래됨 | 같은 SHA의 필수 CI·이미지 존재 확인 후 기존 승인 범위에 따라 이미지 교체를 준비. 환경변수 맵·DB 부착·rollback 명령을 같이 실행하지 않음 |
| 웹 SHA가 오래됨 | 기존 Cloudflare 인증이 가능한지 확인 후 같은 SHA의 빌드·배포를 준비. API 검증 완료 뒤 웹을 순서대로 반영 |
| CF 인증 없음, 앱 키 거부, 앱 절전, 실제 DB 결과 미수집 | 각각 미검증/차단으로 기록. 인증 부재를 미배포 또는 DB 미적용으로 바꾸어 추정하지 않음 |

관리자 앱은 Web 빌드의 [`vite-admin-quality-entry.ts`](../../apps/web/config/vite-admin-quality-entry.ts)에 포함되어 기존 Cloudflare 정적 배포 단위로 나간다. 독립 서버를 새로 만들 필요가 없다. 확인 경로는 `/admin/platform/quality/`, `/admin/workspace/`, `/admin/growth/business-plan/`, `/admin/platform/ai-operations/`이며 Cloud/NestJS 보드는 quality 화면의 view 선택을 함께 확인한다. HTML 제목 `ToonStudio Admin`과 `/admin/platform/quality/assets/`의 실제 참조 번들을 확인하고 일반 Web fallback과 구분한다.

API와 웹은 한 SHA로 묶되 실행 순서는 DB 계약 확인 → API → 웹 → 권한별 기능 검증이다. 기존 배포 워크플로에서 API와 웹 옵션을 동시에 선택하면 작업이 병렬로 실행될 수 있으므로 필요한 경우 API 실행과 웹 실행을 분리한다. 실제로 반영된 단위를 다시 배포하지 않는다.

읽기 전용 진단에는 적용한 변경이 없어 DB 롤백 작업이 없다. 연결 종료나 rollback 확인 실패 시 진단 실패로 기록하고 세션 상태를 검토한다. 이후 별도 운영 변경이 실패하면 이전 정상 **이미지**를 기준으로 복구를 검토하되 DB 표·원문·snapshot·감사·영수증·권한 이력을 삭제하지 않는다. 비공개 사업 자료의 권한 경계가 없는 구 API로 되돌리는 경우 먼저 해당 보드 경로를 비활성화해야 한다. Onpod `app rollback`은 환경변수도 되돌릴 수 있으므로 이미지 지정 교체 절차를 따른다.

## 7. 로컬 검증

저장소 루트에서 운영 자격증명 없이 실행한다.

```bash
node --test scripts/onpod-admin-db-audit-payload.test.mjs scripts/run-onpod-admin-readonly-audit.test.mjs
pnpm harness:verify
```

테스트는 실제 Onpod·Cloudflare·운영 DB를 호출하지 않는다. 고정 명령, 허용 목록, 수동 main/SHA 게이트, 단계별 secret 주입, 무료 상태 차단, 읽기 전용 트랜잭션, 시간 상한, cleanup, 원장 분류와 민감값 미출력을 검증한다. 실행 성공·테스트 성공·운영 준비 완료를 서로 구분하여 PR 및 운영 기록에 적는다.
