# 에이전트 작업 하네스

상태: **current**

적용일: **2026-09-26**

권위 문서: 루트 `AGENTS.md`

## 다른 LLM의 공통 진입 경로

도구 종류와 관계없이 다음 순서로 문맥을 읽는다. 어댑터에는 정책을 복제하지 않는다.

1. 루트 [`AGENTS.md`](../../AGENTS.md)와 수정 대상에 가장 가까운 `AGENTS.md`: 언어·Git·검증·보안·배포 계약.
2. [`ARCHITECTURE.md`](../../ARCHITECTURE.md), [`문서 안내`](../README.md), 대상 앱·패키지 README: 현재 구현과 목표·역사 기록 구분. 사실 판정은 소스·테스트를 우선한다.
3. 인프라 작업은 [`인프라 지도`](infrastructure-map.md) → [`배포 안내`](../../DEPLOY.md) → [`배포 단위 인덱스`](../../deploy/README.md): 공급자·연결·승인·롤백 확인.

실행 위치는 저장소 루트다. Node·pnpm 버전은 `package.json`의 `engines`·`packageManager`를 확인하고 `pnpm install --frozen-lockfile`로 준비한다. 시작 상태는 `git status --short --branch`, `git worktree list`, `pnpm harness:doctor`로 확인한다. 검증 명령과 변경별 최소 기준은 아래 명령 절과 루트 AGENTS 5절을 따른다. 문서 링크·권위 검사는 `pnpm validate:documentation`이다.

인프라 지도에는 2026-10-23 onpod 서울 Core API·PostgreSQL 컷오버와 2026-10-29 조회가 기록돼 있다. 프런트·엣지·공개 R2 에셋·실시간·분석은 Cloudflare다. onpod는 RunPod가 아니며, 저장소 설정이나 과거 조회를 현재 원격 가동의 증거로 확대하지 않는다. GPU 추론은 [`별도 서비스 README`](../../services/creator-inference/README.md)의 CPU 시험·GPU 검증·운영 배포 구분을 따른다.

환경변수의 이름·기본 계약은 루트 `.env.example`·`.env.production.example`과 해당 기능·배포 단위의 `*.env.example`을 확인한다. 실제 비밀값 위치·동기화·변경 영향은 인프라 지도 5·6절이 정본이다. 예제 이름은 활성 기능이나 키 유효성을 증명하지 않으며, 실제 값을 문서·로그·결과에 복사하지 않는다.

필수 계약은 실패를 숨기지 않는 검증, 앱 간 import 경계, 인증·권한·시크릿 보호, 승인 범위와 정확한 릴리스 SHA·롤백이다. CI·보안 검사·보호 설정과 상시 승인 범위는 문서 정리로 약화하거나 확대하지 않는다. 실행하지 못한 검사와 미확인 운영 상태는 결과에 구분한다.

## 목적

ToonStudio은 사람과 여러 코딩 에이전트가 많은 worktree에서 동시에 작업한다. 이 하네스는 도구별
프롬프트를 늘리는 대신 하나의 정책, 범위별 규칙, 자동 검증을 연결해 작업 편차와 검증 누락을 줄인다.

## 구성

| 구성 | 역할 |
| --- | --- |
| `AGENTS.md` | 전역 단일 기준, 언어·Git·검증·배포 정책 |
| 하위 `AGENTS.md` | Web/API/Admin/Mobile/Docs/Scripts/Rust 범위별 추가 규칙 |
| 도구 어댑터 | Claude, Gemini, Copilot, Cursor, OpenCode가 기준 문서를 읽도록 연결 |
| `.gitmessage.ko` | 한글 Conventional Commit 작성 안내 |
| Husky hooks | 템플릿 제공, commitlint, staged 검사, push 전 검증 |
| `scripts/agent-harness.mjs` | doctor/check/verify 명령과 변경 범위 분류 |
| `scripts/agent-harness.test.mjs` | 하네스 파일·분류·CI 연결의 회귀 방지 |
| PR 템플릿 | 목적·검증·위험·배포 분리 기록 |
| [`infrastructure-map.md`](infrastructure-map.md) | 인프라 위치·비용·상태·비밀 저장 위치(이름만)·절차의 단일 지도. 인프라를 바꾸면 같은 변경에서 갱신한다 |

## 단일 기준 원칙

도구 어댑터에는 세부 정책을 복사하지 않는다. 복사된 규칙은 시간이 지나면 서로 달라지기 때문이다.
공통 정책은 루트 `AGENTS.md`, 영역 특화 정책은 가장 가까운 하위 `AGENTS.md`에서만 관리한다.
어댑터는 이 두 파일을 읽도록 연결하는 최소 지침만 가진다.

## 언어 정책

사람이 읽는 저장소 기록은 한글을 기본으로 한다. Conventional Commits의 type/scope, 코드 식별자,
명령어, 오류 원문, 외부 고유명사는 검색 가능성과 표준 호환성을 위해 원문을 유지한다.
commitlint는 사람 작성 커밋 제목에 한글이 없으면 실패한다. `deps`, `release`, `generated`,
`automation` 같은 외부 자동화 scope와 revert는 제한적으로 예외 처리한다.

## 명령

```bash
pnpm harness:doctor
pnpm harness:check
pnpm harness:verify
pnpm harness:verify -- --base=origin/main
pnpm harness:verify -- --staged
pnpm harness:verify -- --full
```

`doctor`는 도구와 hook 상태를 진단한다. `check`는 기준 파일과 연결이 빠지지 않았는지 검사한다.
`verify`는 base와 현재 변경을 모아 lint, Secretlint, lockfile, 하네스 테스트를 실행하고 파일 종류에 따라
아키텍처와 typecheck를 추가한다. `--full`은 root 테스트와 의존성 변경 시 보안·라이선스 검사를 더한다.

## 변경 범위 분류

- 문서만 바뀌면 하네스·보안 검사를 유지하고 불필요한 전체 typecheck는 생략한다.
- TS/TSX 또는 manifest가 바뀌면 typecheck를 실행한다.
- 앱·패키지·아키텍처 설정이 바뀌면 architecture ratchet을 실행한다.
- UI나 API 변경은 자동 게이트 외에도 관련 브라우저·통합 테스트가 필요하다고 결과에 표시한다.
- 전체 저장소 보증과 운영 배포는 각각 `pnpm verify:push`, `DEPLOY.md`의 별도 절차다.

## 확장 방법

새 도구를 지원할 때는 정책을 복사하지 말고 `AGENTS.md`를 읽도록 하는 얇은 어댑터만 추가한다.
새 영역 규칙은 실제로 다른 품질·보안 경계가 있을 때만 하위 `AGENTS.md`로 추가한다.
하네스 파일을 변경하면 `scripts/agent-harness.mjs`의 필수 파일 목록과 테스트를 함께 갱신한다.

## 로컬 시크릿·토큰 처리

실제 API 토큰·키·자격증명은 루트 AGENTS.md의 로컬 시크릿 정책을 따른다. 사용자가 전달한 실제
값을 작업에 사용할 필요가 있으면 .env.infrastructure.local 같은 Git-ignored 로컬 secret store에
즉시 저장하고, 하네스·문서·테스트에는 환경변수 이름만 기록한다. 실제 값은 로그, PR, 커밋, 문서,
채팅 결과로 재출력하지 않는다.

## 역공학(REA) 분석 엔진 정책

REA(`reverse-engineer-anything`)로 네이티브 바이너리나 패키지를 역공학할 때는 유료인 Hopper 대신
무료 오픈소스인 **Ghidra**를 강제한다. 강제는 다음 두 계층으로 동작한다.

1. **하네스 계약 강제 (`AGENTS.md`)**: 모든 에이전트가 MCP `open_binary` 호출 시 `provider_id: "ghidra"`를 명시하고, CLI 실행 시 `--provider ghidra`를 사용하며 `--install-hopper`나 `provider_id: "hopper"`를 사용하지 않도록 강제한다.
2. **런타임·MCP 환경변수 강제 (`REA_ANALYSIS_PROVIDER=ghidra`)**: MCP 서버 등록 환경(`env`)과 셸 환경에 `REA_ANALYSIS_PROVIDER=ghidra`, `GHIDRA_INSTALL_DIR`, `JAVA_HOME`을 설정해 호출 시 `provider_id`가 생략되더라도 REA 라우터가 Hopper 대신 Ghidra를 기본 선택하도록 고정한다.

## 실패 처리

하네스 실패를 hook 우회나 ignore로 해결하지 않는다. 누락 파일, 어댑터 drift, 잘못된 package script,
실행 권한, CI sparse checkout 중 무엇이 원인인지 오류 메시지로 확인한 뒤 기준과 구현을 함께 고친다.
