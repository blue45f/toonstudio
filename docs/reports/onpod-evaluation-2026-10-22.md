# onpod 개인 계정 평가 기록 — 2026-10-22

- 문서 상태: **역사 자료(평가 시점 스냅샷)**. 이 문서는 현재 운영 구성을 설명하지 않는다.
- **후속(2026-10-22 21:20 KST)**: 이 평가는 같은 날 오후 소유자가 서울 재구축을 승인하기 **전** 상태를 적는다. 이후 `toonstudio-db`(스키마 적용)·`toonstudio-api`(병렬 스테이징)·웹 셸 프로토타입을 만들고 측정했다. 현재 구성·승인 범위·비밀 위치는 [인프라 지도](../operations/infrastructure-map.md)와 [ADR-0030](../adr/0030-seoul-origin-hybrid-infrastructure.md)이 정본이며, 아래 1·6·8절의 "맡긴 workload·앱·DB 없음"과 "승인 전" 서술은 평가 시점 기준이다.
- 평가 시점의 상태 한 줄: **개인 계정 평가 중** — CLI·MCP 설치, 로그인, 읽기 전용 호출 검증만 끝났고 앱·사이트·DB·버킷 생성이나 배포는 없었다.
- 기준: `main` 커밋 `c30e0abec`(확인일 2026-10-22 기준 로컬 `origin/main`) 위에서 작성했다. 작성 브랜치 `claude/onpod-setup-korea-free-d4a9c3`는 처음 `5ab029b70`에서 갈라졌고, 같은 날 ADR-0029가 들어온 `main`으로 옮겼다. 그 차이 중 onpod 관련 항목(ADR-0029)은 2절에서 언급한다.
- 짝 문서: [무료 우선 인프라 운영 기준](../FREE_INFRASTRUCTURE.md)의 onpod 소절.
- 증거 표기: **[직접]** 2026-10-22 이 Mac에서 직접 확인(설치 검증과 읽기 전용 호출까지), **[벤더]** 벤더 매뉴얼에 적힌 근사치로 이 저장소가 검증하지 않았다, **[저장소]** 저장소 파일 근거, **미확인** 확인하지 못한 항목.

## 1. 한 줄 판단

이번 작업의 결과는 채택 여부가 아니라 "도구가 설치되어 동작한다"는 확인이다. CLI와 MCP가 로그인된 상태로 읽기 전용 호출(`whoami`, `apps`)에 성공했고, 그 이상(리소스 생성·배포·충전)은 하지 않았다. 따라서 이 문서는 onpod를 운영·배포·폴백·백업 후보로 올리지 않는다. 사용하려면 6절의 전제와 사용자의 별도 명시적 승인이 먼저 필요하다. onpod로 호스팅을 옮길지는 ADR-0029(`docs/adr/0029-onpod-hosting-migration.md`, 상태 Proposed)에서 결정하며, 이 문서는 그 결정을 대신하지 않는다.

## 2. 정체와 출처

- onpod.ai의 한국 리전 PaaS다. 정적 웹, 서버 앱, 관리형 Postgres, 오브젝트 스토리지, GPU, 코드 샌드박스를 다룬다. [직접]
- npm 게시자 표기는 `ai3inc`다. 라이선스는 npm에서 MIT, Homebrew 포뮬러에서 Proprietary로 서로 다르게 표기되고, npm 레지스트리에 소스 저장소 링크가 없다. 네이티브 바이너리의 소스는 확인하지 못했다. [직접]
- 설치 중 postinstall이 벤더의 CLI 배포 경로에서 네이티브 바이너리를 내려받아 패키지에 박힌 sha256과 대조한다. darwin-arm64 바이너리의 sha256이 벤더가 게시한 체크섬 파일과도 일치함을 확인했다. [직접]
- Homebrew 포뮬러 `onpod/onpod/onpod` 0.7.142도 이 머신에 설치되어 있다(2026-10-22 18:47 KST, 설치 영수증의 `installed_on_request`가 true, 링크는 `/opt/homebrew/bin/onpod`). 이 바이너리의 sha256은 npm 설치본 및 `install.js`의 darwin-arm64 핀 값과 같다(`ab402c48…f44d`). 이 검증 셸의 `which -a onpod`는 nvm의 npm 래퍼를 먼저, Homebrew 쪽을 그다음에 반환한다. 이 설치를 유지할지 제거할지는 사용자 결정으로 남긴다. [직접]
- 저장소는 onpod를 의존성으로 쓰지 않는다. 갈라진 시점(`5ab029b70`)에는 추적 텍스트 파일에 onpod 참조가 없었고, 기준 커밋(`c30e0abec`)에서도 참조는 ADR-0029(`docs/adr/0029-onpod-hosting-migration.md`, 상태 Proposed)와 `docs/README.md`의 안내뿐이다. `package.json`과 lockfile은 이 변경에서 바뀌지 않는다. ADR-0029는 호스팅 이전 여부를, 이 문서는 이 Mac의 설치·로그인·MCP 검증을 각각 기록한다. [저장소]

## 3. 설치·로그인·MCP 상태

| 항목 | 상태 | 증거 |
| --- | --- | --- |
| CLI | npm 전역 패키지 `onpod` 0.7.142(nvm Node v24.16.0)와 Homebrew 포뮬러 `onpod/onpod/onpod` 0.7.142(`/opt/homebrew/bin/onpod`, 2026-10-22 18:47 KST 설치). 두 바이너리의 sha256이 같다. 이 검증 셸의 `PATH`에서는 npm 래퍼가 먼저 잡힌다 | [직접] |
| 바이너리 무결성 | darwin-arm64 sha256이 패키지에 박힌 값과 벤더 게시 체크섬에 모두 일치 | [직접] |
| 로그인 | 개인 workspace, 관리자 아님, 잔액 0원, 실행 중인 앱 없음. 설정 파일은 `~/.onpod/config.json`(권한 600) | [직접] |
| MCP 등록 | `onpod mcp`(stdio)를 Claude Code user 스코프에 이름 `onpod`로 등록했고 `claude mcp get onpod` 상태가 Connected | [직접] |
| MCP 호출 | initialize·tools/list 핸드셰이크와 읽기 전용 도구 `whoami`, `apps` 호출 성공 | [직접] |
| 세션 로드 | 등록이 세션 시작 이후라 이미 열려 있던 세션에는 도구가 로드되지 않는다. 새 세션을 열거나 `/mcp`로 재연결해야 한다 | [직접] |
| 원격 커넥터 | `api.onpod.ai`의 `/mcp`는 웹사이트 게시 전용이다 | [직접] |

## 4. MCP 도구와 노출 위험

- 도구는 10개다. 읽기 전용 표기는 `manual`, `whoami`, `apps`, `app_status`, `logs`, `deploy_plan`이고, destructive 표기는 `deploy`, `exec`, `onpod`(임의 CLI 명령 실행)다. `job`의 표기는 확인하지 않았다(미확인). [직접]
- `--read-only`로 띄우면 조회 도구만 노출한다. 서버는 `login`, 결제수단·자동충전, admin 명령, 대화형 ssh, 홈 폴더와 `~/.ssh` 같은 비밀 경로 배포를 막는다. 같은 동작을 CLI가 허용하는지는 확인하지 않았다(미확인). [직접]
- 추정: tools/list 결과에 destructive 도구가 포함되어 있었으므로 현재 등록은 `--read-only`가 아닌 것으로 보인다. 등록 인자는 다시 확인하지 않았다(미확인).
- `onpod` 도구는 임의 CLI 명령을 실행하므로 `deploy`만 막아서는 우회된다. 이 저장소의 `.claude/settings.json`에는 이 도구들을 거부하는 규칙이 없다(`permissions.allow`에 `Workflow`만 있다). [저장소]
- 이 저장소의 CI 게시 금지 스캐너(`scripts/release-workflow-policy.mjs`)는 wrangler, vercel, render와 지정 스크립트만 분류하므로 onpod 게시 명령은 막지 못한다. 현재 워크플로에는 onpod 사용이 없어 위반은 아니다. 워크플로에 쓰기 전에 분류와 시험을 먼저 추가해야 한다. [저장소]
- 권고(소유자 결정, 이 문서는 적용하지 않는다): `onpod mcp --read-only`로 재등록하거나 `.claude/settings.json`의 거부 규칙으로 막고, 에이전트에 위임할 때는 범위 제한·만료 키를 쓴다. Claude Code에 노출되는 도구의 실제 이름은 미확인이다.

## 5. 한도와 요금 (벤더 매뉴얼 기준 근사치, 확인일 2026-10-22, 저장소 미검증)

| 항목 | 내용 |
| --- | --- |
| 정적 사이트 | 무료. 10개, 사이트당 100MB, 월 100GB 트래픽 |
| free-tier 서버 앱 | 0원. 약 30분 유휴 시 휴면, 데이터 디스크 없음, 웹 앱만 |
| 관리형 Postgres dev 티어 | 0원. 10GB, 계정당 1개, 30일 유휴 시 자동 휴면 |
| 유료 예시 | 앱 hobby 월 9,450원, Postgres basic 월 19,710원(50GB), 오브젝트 스토리지 GB당 월 45원(egress 무료) |
| 지출 한도 | 기본값은 앱당 월 20만원, 계정 월 100만원이며 `onpod app spend-cap`으로 바꾼다. 0원으로 둘 수 있는지는 미확인 |
| 빌드 | 동시 2개, 무료 빌드는 24시간당 30개 |
| 결제 | 선불 크레딧(원화). 잔액이 0이면 유료 자원은 `402 insufficient_funds` |
| 자동 확장 | 유료 플랜 기준이며 free-tier는 단일 인스턴스다 |
| 리전 | 서울이 기본이고 관리형 DB 셀프서비스는 서울만 지원한다. 해외(버지니아, 프랑크푸르트)는 CPU 서버만이고 GPU·관리형 DB·웹앱 플랜·공유 볼륨은 한국 전용이다 |
| 백업 | 매뉴얼은 관리형 Postgres에 WAL 매분 + 일일 베이스 스냅샷, 7일 PITR(새 DB로 복원)을 기술하며 dev 티어 적용 여부는 매뉴얼에 명시가 없다. ADR-0029(`docs/adr/0029-onpod-hosting-migration.md`, 상태 Proposed)는 벤더 콘솔 문서 `db`를 근거로 개발용 Postgres에도 매분 백업·일일 스냅샷·7일 시점 복구가 적혀 있다고 기록한다. 벤더 문서의 서술일 뿐이며 dev 티어 복구 rehearsal은 하지 않았다 |

해석: 잔액 0원이 유료 자원을 막는 것은 현재 잔액 때문이지 공급자가 보장하는 hard stop이 아니다. 충전하면 위 지출 한도 안에서 과금될 수 있다.

벤더 매뉴얼 전문은 옮기지 않는다. 최신 내용은 10절의 명령으로 다시 확인한다.

## 6. 정책 적합성과 활성화 전제

onpod로 호스팅을 옮길지는 ADR-0029(`docs/adr/0029-onpod-hosting-migration.md`, 상태 Proposed)에서 결정한다. 이 절은 평가 계정을 어디까지 쓸 수 있는지를 다루며 그 결정을 대신하지 않는다.

| 항목 | 판단 | 근거 |
| --- | --- | --- |
| 새 배포 단위·환경변수·시크릿·유료 플랜 | 상시 승인 범위 밖이다. 사용자의 별도 명시적 승인이 필요하다 | 루트 `AGENTS.md` 8절, `DEPLOY.md`의 상시 승인 절 |
| 원격 자동 source build 금지 | onpod는 소스 폴더를 서버에서 빌드하는 경로(`onpod build`·`--build`), 사전 빌드된 이미지를 지정하는 경로(`onpod app deploy --image`), 빌드된 정적 폴더를 올리는 경로(`onpod deploy ./dist`)를 모두 문서화한다. 내장 매뉴얼은 이미지가 이미 있으면 `--image`로 배포하고 Dockerfile만 있을 때 서버 빌드를 쓰라고 적으며, 비공개 이미지는 `onpod registry add`로 자격을 먼저 등록하고 레지스트리는 허용 목록(`ghcr.io` 등)에 있어야 한다고 적는다. 이 저장소의 CI 산출 이미지(GHCR)를 `--image`만으로 배포할 때 비공개 레지스트리 자격 등록이 필요한지와 `AGENTS.md` 8절과의 정합 여부는 미확인이다. 정합이 어긋나면 사용자가 결정한다 | 루트 `AGENTS.md` 8절, 설치된 npm 패키지의 `README.md`, 바이너리 내장 매뉴얼 문자열(정적 추출, CLI 미실행) |
| 무료 우선 정책 | 선불 크레딧 과금은 정책 파일의 청구 경계 분류에 해당하지 않아 `config/free-infrastructure-policy.json`에 등록하지 않았다 | `docs/FREE_INFRASTRUCTURE.md` |
| 다중 계정 순환 금지 | 단일 개인 계정만 쓴다 | `docs/FREE_INFRASTRUCTURE.md` 금지 사항 |
| 권위 DB 후보 | 권위 DB로 쓰려면 workload 선언, quota 확인, canary가 먼저다. dev 티어는 30일 유휴 시 자동 휴면하고 백업·복구를 시험하지 않았으므로 지금은 권위 DB 후보로 보지 않는다 | `docs/operations/canonical-database-topology.md` 5절 |
| 운영 데이터 전송 | 운영 시크릿·환경변수·사용자 데이터·도메인을 onpod로 보내지 않았다 | 루트 `AGENTS.md` 8절 |

활성화 전제(모두 충족하기 전에는 평가 상태를 유지한다):

1. 맡길 독립 workload와 단일 쓰기 권위를 먼저 선언한다.
2. 이 저장소의 CI 산출 이미지(GHCR)나 빌드된 `dist/`를 서버 빌드 없이 배포할 수 있는지, 비공개 레지스트리 자격 등록이 필요한지, `AGENTS.md` 8절과 맞는지 확인한다(문서화된 경로는 위 표 참조).
3. 무료 한도·휴면·백업/복구를 공식 자료로 확인해 확인일과 함께 기록하고, 지출 한도를 0원으로 둘 수 있는지 확인한다.
4. 사용자의 별도 명시적 승인을 받는다.
5. 승인 뒤에만 정책 JSON, 검증기·시험, 워크플로 게시 가드를 함께 갱신한다.

## 7. 로컬 자격 증명과 환경변수 이름

- 로컬 전용 시크릿 파일 `.env.infrastructure.local`(주 작업트리 루트, Git 무시, 권한 600 확인)에 `ONPOD_PROVIDER`, `ONPOD_USAGE`, `ONPOD_DEPLOY_POLICY`, `ONPOD_CLI_STATUS`, `ONPOD_CREDENTIAL_SOURCE`, `ONPOD_CREDENTIAL_LOCATION`, `ONPOD_TOKEN` 블록을 2026-10-22에 추가했다. 값은 이 문서에 쓰지 않는다. `ONPOD_DEPLOY_POLICY`는 `manual`이지만 라벨일 뿐 집행 장치가 아니다.
- CLI 로그인 파일은 `~/.onpod/config.json`(권한 600)이다. 토큰이 이 파일과 `ONPOD_TOKEN` 두 곳에 있을 수 있고 두 값이 같은지는 열람하지 않아 미확인이다. 루트 `AGENTS.md` 9절은 기존 secret store를 우선하고 다른 저장소로 복사하지 않도록 하므로 한 곳만 유지하는 편이 맞다.
- 토큰은 두 종류다. 전체 권한의 사용자 토큰과 `onpod key add`로 발급하는 범위 제한·만료 키다. 저장된 토큰이 어느 쪽인지는 확인하지 않았다(미확인).
- ADR-0029(Proposed)의 인수인계 절은 대화에 노출된 전권·무기한 API 키 하나의 폐기를 권고한다. 이 Mac의 `ONPOD_TOKEN`과 `~/.onpod/config.json`의 토큰이 그 키와 같은지는 값을 열람하지 않아 이 문서로 알 수 없다. 소유자가 같은 키인지 확인하고, 같다면 폐기한 뒤 가능하면 `onpod key add`로 범위를 제한하고 만료를 둔 키를 새로 발급한다(ADR-0029는 범위 제한 키가 기업 계정용으로 적혀 있다고 기록한다).
- CLI가 읽는 환경변수 이름 중 이 평가와 관련된 것은 `ONPOD_TOKEN`, `ONPOD_URL`(기본값은 벤더 API 주소), `ONPOD_NO_ERROR_REPORT`다. `ONPOD_NO_ERROR_REPORT=1`은 로그인 상태에서 CLI 오류 보고를 onpod 운영팀에 보내는 동작을 끈다. `.env.infrastructure.local`에는 이 키가 없고 셸 환경에 설정했는지는 미확인이다. CLI 오류 로그는 `~/.onpod/errors.log`다.
- 저장소의 `.env.example`, `.env.production.example`, `render.yaml`에는 onpod 변수를 추가하지 않는다. 앱이 읽지 않는 로컬 도구 값이다.

## 8. 하지 않은 일

- 앱, 정적 사이트, DB, 버킷을 만들거나 배포하지 않았다.
- MCP의 `deploy`, `exec`, `onpod`(임의 CLI) 도구를 호출하지 않았다. 호출한 것은 읽기 전용 `whoami`, `apps`뿐이다.
- 크레딧 충전과 결제수단 등록을 하지 않았다. 잔액은 0원이다.
- 운영 시크릿·환경변수·사용자 데이터·도메인을 onpod로 보내지 않았다.
- 저장소의 워크플로, `package.json`, MCP 설정, 정책 JSON을 바꾸지 않았다. 이 문서를 추가하는 변경은 문서만 바꾼다.

## 9. 미확인 목록

- dev 티어 Postgres의 7일 PITR·일일 스냅샷이 실제로 동작하는지. ADR-0029(Proposed)는 벤더 콘솔 문서에 적용으로 적혀 있다고 기록하지만 복구 rehearsal은 하지 않았다.
- 이 저장소의 CI 산출 이미지(GHCR)를 `--image`만으로 배포할 때 비공개 레지스트리 자격 등록이 필요한지, `AGENTS.md` 8절과 맞는지. 이미지·정적 폴더 경로 자체는 패키지 `README.md`와 내장 매뉴얼에 문서화되어 있다.
- 지출 한도를 0원으로 둘 수 있는지.
- 네이티브 바이너리의 소스와 서명 여부, 라이선스 표기 불일치(MIT 대 Proprietary)의 해소.
- 현재 MCP 등록이 `--read-only`인지, Claude Code에 노출되는 도구의 실제 이름, `job` 도구의 표기.
- MCP 등록이 가리키는 실행 파일이 npm 래퍼인지 Homebrew 바이너리인지(`PATH` 조회인지 절대 경로인지).
- 저장된 토큰의 종류, 두 저장 위치 값의 일치 여부, ADR-0029가 폐기를 권고한 키와 같은 키인지.
- `ONPOD_NO_ERROR_REPORT=1`의 셸 설정 여부.
- 프로젝트 루트에서 CLI가 설정·링크 파일을 쓰는지.
- 5절 수치의 현재 유효성(벤더 매뉴얼이 바뀔 수 있다).

## 10. 다시 확인하는 법

```sh
# 위치: 아무 디렉터리. 전제: 전역 설치된 onpod CLI.
# 부작용: 매뉴얼 조회이며 리소스를 만들지 않을 것으로 보이나, 이 문서를 작성하며 이 명령 자체는 실행하지 않았다.
onpod manual --brief
```

5절 수치를 갱신하기 전에 위 명령으로 매뉴얼을 다시 읽고 확인일을 바꾼다.
