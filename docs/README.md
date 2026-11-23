# ToonStudio 문서 안내

- 상태: **현재 문서 체계**
- 최종 갱신: **2026-11-23**

## 문서 권위 순서

```text
소스·테스트·manifest
  > 기계 원장과 ratchet
  > 현재 아키텍처 문서
  > 승인된 ADR
  > 역사적 보고서·감사·벤치마크
  > OpenWiki 탐색 문서
```

문서가 소스와 다르면 소스를 우선하고 문서를 즉시 갱신한다.

Blender 기능을 자체 웹 도구로 구현하는 근거는 [Blender 동작 분석과 웹 모델링 구현 계약](studio/blender-native-modifier-contracts.md)에 정리한다. 원본 프로그램의 화면 연결과 웹 메시 기능의 구현을 구분한다.
면 코너 UV·아일랜드 편집과 GLB 전달은 [UV 분석 및 구현 계약](studio/blender-native-uv-contracts.md)의 migration 상태를 따른다.
UV 아일랜드를 한 타일로 정리하는 후속 구현은 [웹 UV 정리 계약](studio/blender-native-uv-pack-contracts.md)의 migration 상태를 따른다.
설치 없이 실제 GLB·OBJ·VRM을 편집 메시로 등록하는 후속 경로는 [웹 모델 가져오기 계약](studio/blender-native-editable-import-contracts.md)에 기록한다.
슬롯별 툰 재질의 저장·렌더·GLB와 BG3D 표시의 미완성 경계는 [웹 툰 재질 계약](studio/blender-native-toon-material-contracts.md)에 기록한다.

## 디렉터리 분류

| 경로 | 성격 | 현재 사실의 권위 여부 |
| --- | --- | --- |
| `docs/architecture/` | 현재 구조, 목표 구조, 장기 설계 | 현재 표시 문서만 권위 있음 |
| `docs/adr/` | 결정 시점의 맥락과 선택 | 결정 기록으로 권위 있음 |
| `docs/operations/`, `DEPLOY.md` | 현행 운영·배포 정본 정책과 런북 (`infrastructure-map.md`, `ai-deployment-quickstart.md` 등) | 현재 표시 문서만 권위 있음 |
| `docs/engineering/` | 코드 구조·번들 경계 등 개발 패턴과 가드레일 해설 | 현재 표시 문서만 권위 있음(가드레일 규칙의 권위는 스크립트와 기준선) |
| `docs/tech/` | IT 개발자·기획자용 차세대 웹 엔지니어링 기술 백서 (Remotion·WebGPU·WASM·AI 하네스·멀티디바이스·차세대 Chrome API) | 개별 문서 상단 상태 표기 우선(`current`/`target` 분리) |
| `docs/ir/` | IR 피치덱·홍보·제휴 차별화 브리프 및 제품 기술 현황 정본 | 개별 문서 상단 상태 표기 우선(`current`/`target` 분리) |
| `docs/engines/` | 엔진 역할·핀·품질 계약 | 생성 원장과 현재 표시 문서 우선 |
| `docs/features/` | 기능별 현재 구현·정책 (접근성 1단계, Claude AI 보조, 잠재 안료 혼합, 필터 갤러리 등) | 현재 표시 문서만 권위 있음 |
| `docs/asset-provenance/` | UI 폰트·3D/2D 에셋 출처·라이선스 원장([`asset-inventory.md`](asset-provenance/asset-inventory.md) 포함) | 출처·권리 원장으로 관리(정책 개정 대기 항목은 본문 명시) |
| `docs/studio/` | Studio 설계·제작 계약 (Blender 웹 모델링·UV·재질 계약 등) | 개별 문서 상단 상태 표기 우선, 현재 표시 문서만 권위 있음 |
| `docs/design/` | UX·디자인 기반과 분석 (2026-09 기반 문서와 2026-10/11 분석 포함) | 혼합 — 분석 시점의 기록, 현재 표시 문서만 권위 있음 |
| `docs/archive/` | 완료된 백로그·과거 운영 사고/QA·시효 만료 계획서 아카이브([`archive/README.md`](archive/README.md)) | **역사 자료** — 현재 사실을 주장하지 않음 |
| `docs/reports/`, `docs/evidence/` | 특정 commit·실험·라이선스 감사의 증거 | 해당 시점의 증거이며 현재 구조 문서가 아님 |
| `docs/candidates/`, `docs/benchmarks/`, `tests/benchmarks/` | 엔진 후보 비교 방법과 측정 결과 | 측정 조건 안에서만 유효(역사 자료) |
| `docs/rewrite/`, `docs/quality/`, `docs/maintenance/` | 과거 재구성 감사·품질 수용·복구 기록 | 역사 자료 |
| `docs/technology/` | 공유 엔지니어링 기록·플레이북 | 참고 자료 — 현재 구조 문서가 아님 |
| `docs/launch-loop/` | 자율 출시 검증 루프 원장(`scripts/launch-loop-runner.sh` 연동) | 루프 작업 원장 |
| `openwiki/` | 빠른 탐색과 설명 | 보조 문서 |

## 현재 구조를 읽는 순서

1. [`../ARCHITECTURE.md`](../ARCHITECTURE.md)
2. [`architecture/README.md`](architecture/README.md)
3. [`architecture/modular-monorepo-target.md`](architecture/modular-monorepo-target.md)
4. 해당 애플리케이션·패키지의 README
5. 관련 ADR과 테스트

기능을 추가할 때는 [기능 확장 실무 가이드](engineering/feature-extension-guide.md)에서 모듈·상태·권한·테마·3D·협업·API/DB·자산 수명과 검증 경로를 연결한다. 개별 계약과 정책은 해당 정본 문서를 따른다.

관리자의 사업계획·운영 자료 통합은 [통합 작업실 계약](features/admin-integrated-workspace.md)에서
화면·검증 규칙·서버 저장·기존 자료 가져오기와 운영 적용의 승인 경계를 확인한다.
Cloudflare 모델 종료·Onpod 무료 한도 기록의 관리자 통합은 [AI·무료 플랜 운영 보드](operations/admin-ai-operations-board.md)의 현재 구현·DB 준비·가져오기·롤백 계약을 따른다.

Studio는 다음 문서를 추가로 본다.

1. [`architecture/studio-current-boundaries.md`](architecture/studio-current-boundaries.md)
2. [`engines/renderer-roles.md`](engines/renderer-roles.md) — 기계 생성 파일
3. [`engineering/code-structure-and-bundle-patterns.md`](engineering/code-structure-and-bundle-patterns.md) — 파일 크기·진입 그래프 가드레일과 분해·지연 로딩 패턴
4. 관련 `docs/adr/` 결정

실험 앱(`apps/character-lab`, `apps/brush-lab`)은 다음 문서를 추가로 본다.

1. [`adr/0026-labs-experimental-apps-engine-selection-and-promotion.md`](adr/0026-labs-experimental-apps-engine-selection-and-promotion.md) — 위치·엔진 선택·라이선스·승격 절차
2. [`reports/character-lab-engine-alternatives-2026-10-01.md`](reports/character-lab-engine-alternatives-2026-10-01.md) — 엔진 대안 비교(역사 자료)
3. [`engines/labs-brush-engine-references-2026-10-01.md`](engines/labs-brush-engine-references-2026-10-01.md), [`engines/labs-character-engine-references-2026-10-01.md`](engines/labs-character-engine-references-2026-10-01.md) — 채택 기법·참고 코드·논문·라이선스·수치 목표 원장

Godot의 Studio 3D 적용 가능성 평가(2026-10-15)는 역사 자료다. 2026-10-21 소유자 결정(PR #2354)으로 운영 Godot 섬이 제거돼 ADR-0028 은 Superseded 이고 현재 기능이 아니다. 다음 문서를 추가로 본다.

1. `reports/godot-3d-evaluation-2026-10-15.md`(삭제됨 — git 이력에서 확인 가능) — 3D 한계 진단, 적용 모드 비교, 측정 해석(`target` 평가 보고서, 2026-10-15 시점)
2. `adr/0028-godot-3d-adoption-modes.md`(삭제됨 — git 이력에서 확인 가능) — 모드별 채택 조건·롤백·공급망(Superseded, 모드 B~D 보류)
3. [`evidence/godot-3d-poc/2026-10-15/README.md`](evidence/godot-3d-poc/2026-10-15/README.md) — 측정 원본 JSON과 읽는 법
4. [`../tools/godot-3d-poc/README.md`](../tools/godot-3d-poc/README.md) — PoC 재현 순서(운영 연결·배포 없음)

Mixbox 작동 원리 분석과 독립 구현 방침(2026-10-15, 역사 자료)은 다음 문서를 추가로 본다.

1. [`reports/mixbox-working-principle-analysis-2026-10-15.md`](reports/mixbox-working-principle-analysis-2026-10-15.md) — 잠재 안료 혼합의 구조, clean-room 구현 방침, 권리 상태와 미해결 항목
2. [`../third_party/mixbox/LICENSE-GRANT.md`](../third_party/mixbox/LICENSE-GRANT.md) — 제작사 서면 합의 기록(소유자 작성 대기)
3. [`features/latent-pigment-mixing.md`](features/latent-pigment-mixing.md) — 독립 구현(잠재 안료 혼합기 `toonstudio-latent-pigment-v1`)의 구조, 안료 선택과 출처, 적합 오차, 성능, 한계, 권리 상태(현재 구현)

CC0 MyPaint 브러시 라이브러리(2026-10-29, 현재 구현)는 다음 문서를 본다.

1. [`features/mypaint-cc0-brush-library.md`](features/mypaint-cc0-brush-library.md) — mypaint-brushes(CC0) 196종을 고정된 libmypaint 1.6.1 WASM 으로 실제 실행하는 선택 획 변환의 변환 규칙, 검증, 레거시 획 경로 한계

필터 갤러리, 젖은 종이 정착 굽기와 브러시·필터 REA 내재화(2026-10-29)는 다음 문서를 본다.

1. [`features/filter-gallery.md`](features/filter-gallery.md) — 효과를 최대 8겹 쌓는 비파괴 필터 갤러리의 저장 형식, 실행 경로(Konva·Worker·예산), 효과 목록과 기능 대응, 한계(현재 구현)
2. [`features/wet-paper-bake.md`](features/wet-paper-bake.md) — 수채·수묵 젖은 종이 확산 레인 4종(먹 번짐·백런·입자 침전·갈필)의 정착 굽기 실행 경로(Canvas 시분할·SVG PNG), 모델, 상한·결정성, Sumi 이식 범위, 한계(현재 구현)
3. [`reports/brush-filter-rea-internalization-2026-10-29.md`](reports/brush-filter-rea-internalization-2026-10-29.md) — REA 분석 대상·증거, 프로그램 × 브러시·필터·기능 적용 범위, 이식과 독립 구현의 구분, 확인하지 못한 것(역사 자료)
4. [`evidence/rea-brush-filter-internalization-20261029.json`](evidence/rea-brush-filter-internalization-20261029.json) — 위 보고서의 REA 증거 원장(증거 ID·원본 해시·통계)

참조 사이트(플로터·1toon) 분석과 도입 결정(2026-10-16, 역사 자료)은 다음 문서를 추가로 본다.

1. [`reports/reference-sites-plotr-1toon-benchmark-2026-10-16.md`](reports/reference-sites-plotr-1toon-benchmark-2026-10-16.md) — 외부 두 사이트의 관찰 기록, 우리 현황 대조 17행, 이번에 한 일과 다음 차례, 확인하지 못한 것

UI/UX 자동 측정 하니스와 기준선(2026-10-16, 역사 자료)은 다음 문서를 추가로 본다.

1. [`../scripts/ux-audit/README.md`](../scripts/ux-audit/README.md) — 측정 항목, 점수 규칙, 실행·보안 규칙(현재 구현)
2. [`reports/ux-audit-baseline-2026-10-16.md`](reports/ux-audit-baseline-2026-10-16.md) — 개발 서버 기준 합계 95.12 와 시간 지표 최악 가정 하한 89.71, 감점 유형별 회수 점수, 미측정 항목, 다시 재는 법

인프라 구성은 2026-10-23 onpod 컷오버를 마쳤다. 아래 지도에는 2026-10-29 공급자 조회 기록과 2026-11-22 저장소 배포 도구·마이그레이션 원장(133개) 동기화 기록이 구분되어 있으며, 과거 공급자 조회를 실시간 상태로 간주하지 않는다. 인프라·배포·DB·도메인·비밀값 작업 전에 다음 문서를 먼저 본다.

1. [`operations/infrastructure-map.md`](operations/infrastructure-map.md) — 구성요소별 위치·비용·상태, 요청 경로, 비밀값 저장 위치(이름만), 배포·DB 접속 문자열 동기화·롤백 절차, 측정으로 확인한 제약, 열린 결정
2. [`operations/ai-deployment-quickstart.md`](operations/ai-deployment-quickstart.md) — AI·운영자용 5단계 정본 배포 명령(`deploy:preflight`, `deploy:web`, `deploy:cloud -- --smart`, 사후 스모크·롤백 가드)
3. [`adr/0030-seoul-origin-hybrid-infrastructure.md`](adr/0030-seoul-origin-hybrid-infrastructure.md) — Core API·DB는 onpod 서울, 웹 엣지는 Cloudflare 유지(Accepted). 근거 측정, 대안, 컷오버 전 열린 문제
4. [`../deploy/onpod/README.md`](../deploy/onpod/README.md) — onpod DB에 운영 스키마를 올리는 재현 도구(상시 승인 배포 단위가 아니다)

2026-11-20의 Onpod 배포·읽기 전용 감사와 활동보고서 활용 범위는 [Onpod 활용 증빙 보완 기록](reports/onpod-utilization-evidence-2026-11-21.md)에서 확인한다. 특정 시점의 배포·가동 증거와 미확인인 운영 사용량·크레딧 차감·성능 개선을 구분하며, 원본 출처와 발췌 필드는 [증빙 원장](evidence/onpod-utilization-2026-11-21.json)에 연결한다.

onpod.ai 호스팅 이전 평가(2026-10-22, 평가 시점의 기록이며 현재 구성은 위 문서가 정본이다)는 다음 문서를 추가로 본다.

1. [`adr/0029-onpod-hosting-migration.md`](adr/0029-onpod-hosting-migration.md) — 무료 한도 대조, 구성요소별 판정, Core API 1단계 이전 절차·롤백(Proposed, DB 판정은 ADR-0030이 대체)
2. [`reports/onpod-evaluation-2026-10-22.md`](reports/onpod-evaluation-2026-10-22.md) — 설치·로그인·MCP 검증 결과, 벤더 수치의 기준과 확인일, 정책 적합성, 미확인 목록(재구축 승인 전 스냅샷)
3. [`FREE_INFRASTRUCTURE.md`](FREE_INFRASTRUCTURE.md) — 무료 우선 정책 안에서의 위치를 요약한 onpod 소절

열린 편집기 접근성 1단계(2026-10-22, 현재 구현)는 다음 문서를 추가로 본다.

1. [`features/accessibility-stage1.md`](features/accessibility-stage1.md) — 패널을 열 때마다 하는 axe·키보드 순회·이름/역할 감사의 범위와 방법, 고친 것, 문서화된 예외, 미해결과 확인하지 못한 것(실제 화면 낭독기 낭독은 미확인), 실행 방법과 CI 편입 판단

AI 보조(2026-10-22 도입, 2026-10-29부터 키 없이도 ToonStudio AI로 실행 — 병합 전에는 브랜치에만 있다)는 다음 문서를 추가로 본다.

1. [`features/ai-assist.md`](features/ai-assist.md) — 연결 정책, 아트 디렉터·명령 도우미·번역·대체 텍스트 4종의 입력·출력·비용 상한, 공통 UX 원칙, 구조, 보안, 검증과 하지 못한 것, 새 기능을 더하는 법
2. [`reports/claude-ai-assist-benchmark-2026-10-22.md`](reports/claude-ai-assist-benchmark-2026-10-22.md) — 공개 페이지에서 읽은 경쟁 제품 사실, 설계 판단, 추가 AI 보조 기능 구상 10건(역사 자료)
3. [`operations/free-ai-runtime.md`](operations/free-ai-runtime.md) — Claude 연결이 기존 BYOK 정책 안에서 어떻게 다뤄지는지(Claude 소절)
4. [`benchmarks/ai-settings-ux-benchmark-2026-10-29.md`](benchmarks/ai-settings-ux-benchmark-2026-10-29.md) — 키 없이 시작·키 붙여넣기·여러 키·경로 표시를 비슷한 서비스와 비교한 설정 사용성 벤치마크(공개 문서 기반)

차세대 웹 엔지니어링 기술 백서, 글로벌 경쟁사·멀티디바이스 벤치마크 및 IR·홍보 브리프(`2026-11-23`)는 다음 문서를 본다.

1. [`tech/toonstudio-nextgen-engineering-whitepaper.md`](tech/toonstudio-nextgen-engineering-whitepaper.md) — 브라우저 올인원 단위경제, WebGPU 7밴드 KM·Rust WASM·WebAudio Foley, Remotion 구현 원리·실전 사용법, AI 스웜 하네스·자동 래칫, 멀티 디바이스 I/O, 차세대 Chrome API 27종 실전 가이드
2. [`benchmarks/toonstudio-global-competitor-device-benchmark-2026-11.md`](benchmarks/toonstudio-global-competitor-device-benchmark-2026-11.md) — Clip Studio Paint · Procreate · Photoshop · Rebelle 7 · Blender · ibisPaint · 웨어러블/TV/XR 드로잉 UX 비교와 시나리오별 의사결정 매트릭스
3. [`ir/toonstudio-ir-promo-differentiation-brief-2026-11.md`](ir/toonstudio-ir-promo-differentiation-brief-2026-11.md) — IR 피치덱·홍보·제휴 복붙용 핵심 메시지, 8대 기술 해자, 2026-11-23 실측 지표, `current` vs `target` 경계표 ([2026-11-22 기술 IR 정본](ir/toonstudio-ir-brief-20261122.md) 연계)

## 문서 상태 표기

- **현재**: 소스와 테스트로 지금 검증 가능
- **마이그레이션**: 현재·레거시·목표 경로가 함께 존재
- **목표**: 아직 완료되지 않은 의도
- **역사 자료**: 특정 날짜·commit·실험을 기록하며 현재 사실을 주장하지 않음

## 작성 및 정리·아카이브 정책 (`2026-11-22` 정비)

- 기본 언어는 한국어다.
- 명령, 식별자, API 이름, 원문 인용은 필요한 범위에서 영어를 유지한다.
- 경로는 저장소 루트 기준으로 적는다.
- 자주 변하는 수치는 원장 파일을 링크하고 산문에 중복하지 않는 것을 우선한다.
- “구현”, “검증”, “병합”, “배포”를 서로 다른 상태로 기록한다.
- 생성 파일(`STUDIO_MANUAL.md`, `STUDIO_3D_DCC_MANUAL.md`, `THIRD_PARTY_NOTICES.md`, `docs/engines/renderer-roles.md`)은 직접 수정하지 않고 생성 원장을 수정한다.
- **저장소 루트 경계**: 루트에는 전역 계약·진입·정책 문서(`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `README.md`, `ARCHITECTURE.md`, `PRODUCT.md`, `DESIGN.md`, `DEPLOY.md`, `CONTRIBUTING.md`, `SECURITY.md`, `DIFFERENTIATION.md`, `MONETIZATION.md`, 동기화/생성 매뉴얼·고지)만 두고, 작업 백로그·티켓·에셋 인벤토리는 `docs/` 하위 해당 디렉터리나 `docs/archive/`에 둔다.
- **아카이브 이동(`docs/archive/`)**: 완료된 백로그, 퇴역 공급자 시기의 사고·릴리스·QA 기록, 새 정본으로 대체된 중기 계획서는 활성 디렉터리에서 [`docs/archive/`](archive/README.md)로 옮겨 노이즈를 줄인다.
- **즉시 삭제(Git 이력 보존)**: 일회성 작업 지시 프롬프트, 임시 브랜치 통합 체크리스트, 유휴 worktree 정리 영수증, 단일 PR/CI 실패 수정 메모, 미참조 빈 스텁·미체크 초안 목록은 저장소에 남기지 않고 삭제한다.
- **삭제·이동 전 필수 점검**: `config/documentation-authority.json` 원장 등록 여부, 코드·테스트·계약 테스트(`engineering-seminar-*.test.ts`, `deploy-docs-contract.test.mjs`, `verify:studio-manual-docs` 등) 참조 여부, SHA-256 해시로 봉인된 감사 증거(`docs/evidence/`) 여부를 먼저 확인한다.

## 검사

```sh
pnpm run validate:documentation
pnpm run validate:architecture
pnpm run harness:check
```

검사는 현재 문서의 존재, 한국어 본문, 폐기 경로, 오래된 아키텍처 경로와 내부 링크를 확인한다.
외부 vendor 문서, 법적 고지, 기계 생성 파일은 별도 예외로 관리한다.
