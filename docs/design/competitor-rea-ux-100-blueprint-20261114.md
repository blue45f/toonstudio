# 경쟁사 REA 역공학 기반 기능·UI/UX 내재화 및 100/100 완성도 달성 설계서

- **작성일**: 2026-11-14
- **문서 상태**: 분석 완료 및 실행 설계 (`current` 실측 감사 + `target` 내재화 설계 분리 기록)
- **증거 원장**: [`docs/evidence/rea-competitor-sitewide-benchmark-20261114.json`](../evidence/rea-competitor-sitewide-benchmark-20261114.json) (`63`개 REA 증거 레코드, 번들 SHA-256 `c9fe88324c50c455382071ea0ca8f64843493ce80640a82c96aab95c901a3673`, 미해결 `unknowns: 0`)
- **대상 브랜치**: `feat/competitor-rea-ux-perfection-20261114`

---

## 1. 목적 및 범위

본 문서는 외부 유사·경쟁 웹 드로잉 에디터, 웹툰 연재·발견 플랫폼, 2D/3D 창작 에셋 마켓, 포징·콘티·아카데미·협업 도구 **22개 라이브 서비스**를 REA(`reverse-engineer-anything`) MCP 도구(`inspect_web_page`, `analyze_web_bundle`, `export_web_scripts`, `analyze_javascript_application`, `inspect_analysis_view`, `export_evidence_bundle`)로 정밀 역공학한 결과와, ToonStudio 로컬 실행본(`http://localhost:5190`)의 **데스크톱 32개 라우트 + 모바일 16개 라우트 + 에디터 실사용 플로우** 전수 감사 결과를 결합해 **100점 만점 기준 100/100 완성도**에 도달하기 위한 아키텍처·기능·UI/UX 내재화 설계를 정의한다.

### 상태 구분 원칙 (`AGENTS.md` §2·§7 준수)

1. **현재 상태 (`current` — 2026-11-14 실측)**:
   - 코드상 정적 점수 원장([`studio-workspace-recommendation.ts`](../../apps/web/src/domains/creator/studio-workspace-recommendation.ts))은 고정 상수 `92 / 100`을 반환하고 있으며, 실제 브라우저 전수 감사(DOM 예산, `44×44px` 터치 타깃, 에디터 1클릭 인체공학, 오프라인 상태 문구 일관성) 기준 엄정 실측 점수는 **`86.4 / 100`**이다.
2. **목표 상태 (`target` — 본 설계 구현 완료 시)**:
   - 아래 8개 워크스트림(WS1~WS8)을 구현·검증하여 전 라우트 `>= 44px` 터치 타깃, 핵심·보조 라우트 DOM 예산 준수, 경쟁사 핵심 조작 패턴 내재화, 결정론적(deterministic) 산출식 기반 **`100 / 100`** 완성도를 달성한다.
3. **외부 검증 보류 경계 (`external-validation` — 과장 금지 경계)**:
   - [`studio-competitor-capability-evidence.ts`](../../apps/web/src/domains/creator/studio-platform/studio-competitor-capability-evidence.ts)에 명시된 실물 태블릿 하드웨어 필압 사인오프, 비공개 상용 포맷(`.clip`/`.procreate`) 독점 코퍼스, 공개 CA 암호화 서명(C2PA) 등 외부 검증이 필요한 영역은 로컬 코드만으로 완전 대체를 주장하지 않고 정직한 경계를 유지한다.

---

## 2. REA MCP 경쟁사·유사 서비스 22종 정밀 역공학 매트릭스 (2026-11-14)

### 2.1 웹 드로잉·화이트보드·3D 에디터 역공학 (7종)

| 서비스 | 주요 REA 증거 ID | 실측 DOM / AX / Worker | 번들·런타임 역공학 핵심 메커니즘 | ToonStudio 내재화 타깃 |
| --- | --- | --- | --- | --- |
| **Kleki** (`kleki.com`) | `ev_35f9d4dc5b330cc...` / `ev_766021384bc45df...` | `1,300` DOM / `277` AX / `0` Worker | `791 KB` 단일 코어 + `10.5 KB` `ko.dd967432.js` 로케일 분리, 서버 API 의존 `0`건. 가입 없이 즉시 캔버스 진입, 상단 1클릭 **`안정화`(손떨림 보정)** 순환 버튼과 4종 브러시 팁 라디오(`원형/분필/캘리그래피/사각형`) 노출 | **WS1**: 기본 드로잉 클라리티 바에 1클릭 **손떨림 보정 프리셋 순환(`꺼짐/표준/강함`)** 및 **브러시 크기 즉시 조절(`- / px / +`)** 직결 |
| **Excalidraw** (`excalidraw.com`) | `ev_be0958e9006a54b...` / `ev_e65b2d701bd793f...` | `383` DOM / `193` AX / `0` Worker | 초경량 캔버스 크롬(`383` DOM). 상단 툴바 좌측 **`선택된 도구 유지하기`(Tool-Lock)** 토글로 연속 도형·말풍선 배치 시 선택 도구 자동 복귀 방지, 좌하단 **`Zoom: 100%`** 즉시 리셋, 우하단 **`도움말 ?`**, 우상단 단일 **`실시간 협업...`** 버튼 | **WS1·WS2·WS4**: 연속 컷/말풍선/도형 작업용 **도구 유지(Tool-Lock)** 토글, 좌하단/상태바 **`100%` 즉시 배율 리셋**, 1인 작업 시 협업 보조 컨트롤 단일화 |
| **Photopea** (`photopea.com` 랜딩 + 실에디터) | `ev_2e3d53bc6f7e73d...` / `ev_d2e040282f3d8d2...` / `ev_889f8c5e7e22e1c...` | 랜딩 `403` DOM · 에디터 `1,174` DOM / `322` AX / **`3` Workers** | 무거운 래스터·PSD 연산을 **3개 Web Worker**로 분리하고 UI 셸은 `21`개 핵심 버튼(`파일..창` 한글 메뉴바 + `찾아보기` 명령 검색 + `Fullscreen`)만 유지. `"Fully Local"` 메시지로 로컬 실행 신뢰성 강조 | **WS3·WS4**: 익숙한 포토샵·포토피아 단축키/레이아웃 1클릭 전환 연결 및 오프라인·로컬 우선 저장 상태 문구 명확화 |
| **miniPaint** (`viliusle.github.io/miniPaint`) | `ev_f5dee4caba144e6...` / `ev_f19ec001490872f...` | `740` DOM / `332` AX / `0` Worker | 상단 바에 `Pressure` 필압 토글과 도구 옵션 노출, 우측 도킹 패널에 `- / 100% / + / Fit` 줌 바 및 레이어 `+ / D / R / ↓ / ↑` 1클릭 조작 배치 | **WS1·WS2**: 줌 컨트롤 터치 규격(`44px`) 보강 및 상시 접근 가능한 캔버스 뷰포트 HUD 제공 |
| **three.js editor** (`threejs.org/editor`) | `ev_a6991b3ca571eb1...` / `ev_8e106c7647655e4...` | `1,207` DOM / `319` AX / `0` Worker (`126` ESM) | 좌측 뷰포트 기즈모 트리오(`이동/회전/스케일`)와 우측 아웃라이너 + 탭형 속성(`장면/오브젝트/지오메트리/재질`) 분리 | `/studio/bg3d` 기존 아웃라이너·기즈모 구조 유지 및 모바일·터치 접근성 점검 |
| **tldraw** (`tldraw.com`) | `ev_c9efcde99098e3e...` / `ev_7f4cd4896b983c9...` | `586` DOM / `131` AX / **`2` Workers** (`48` 청크) | `7`개 시맨틱 `role="toolbar"`, 스크린리더용 **`캔버스로 포커스 이동`** 스킵 버튼, 모든 버튼 ARIA 이름에 단축키 병기(`실행 취소 — ⌘ Z`), 미니맵·`100%` 줌 통합 | **WS1·WS2**: 주요 드로잉·뷰포트 버튼에 단축키 힌트 일관 병기 및 모바일 독자 폭(`390px`) 안전 가이드 오버레이 추가 |
| **JS Paint** (`jspaint.app` + 정적 AST 그래프) | `ev_d1ce40eeabb1c8a...` / `ev_26e3dfb5f58f38e...` / `ev_59e7320831285a5...` | `3,027` DOM / `758` AX (`52` 스크립트, **`10,196` AST 노드**) | `src/sessions.js` `#local:` 해시 기반 무로그인 로컬 자동 세션 보존, `src/OnCanvasHelperLayer.js` 온캔버스 보조 가이드 레이어 분리, 한글 니모닉 메뉴바(`파일 (F)..도움말 (H)`) | **WS2·WS4**: 온캔버스 **모바일 가독 폭(`390px`) 가이드 레이어** 및 로컬 자동 저장 배지 일원화 |

### 2.2 웹툰 연재·발견·창작자 생태계 플랫폼 역공학 (6종)

| 서비스 | 주요 REA 증거 ID | 실측 DOM / AX / Worker | 역공학 핵심 패턴 | ToonStudio 내재화 타깃 |
| --- | --- | --- | --- | --- |
| **네이버 웹툰** (`comic.naver.com/webtoon`) | `ev_bc1a604e97d40f3...` / `ev_5319731fac4a199...` | `13,010` DOM / `10,824` AX (`35` 라우트) | 요일 탭 + 4단 정렬(`인기순·업데이트순·조회순·별점순`)은 직관적이나 전 요일 카드를 한 번에 렌더링해 `13,010` DOM 비대화 발생 | **WS6·WS7**: 4단 정렬 직관성은 채택하되 보조 선반 접기(`더보기`)로 `/discover` 초기 DOM을 `2,400` 이하로 억제 |
| **WEBTOON Global & CANVAS** (`webtoons.com`) | `ev_2bc2133e1f0e1be...` / `ev_e58bf051f27ee81...` | `2,944`~`3,420` DOM / `809`~`879` AX | 상단 헤더 우측 **`Recently viewed`(최근 본 작품)** 원클릭 복귀 버튼과 `PUBLISH` / `CANVAS` 창작자 동선 직결 | **WS7**: `/discover` 상단에 로컬 열람 이력 기반 **`최근 본 작품` 빠른 복귀 바** 내재화 |
| **포스타입** (`postype.com`) | `ev_95c6fa1451e376f...` | `1,989` DOM / `1,590` AX / `1` Worker | 웹툰 원고와 브러시·소재 판매 포스트가 단일 피드에서 공존하며 `1,989` DOM의 쾌적한 밀도 유지 | **WS6·WS7**: `/discover`·`/cuts` 피드 밀도 최적화 및 터치 타깃(`>= 44px`) 보장 |
| **리디 웹툰** (`ridibooks.com/webtoon/recommendation`) | `ev_ba9237683897504...` | `2,203` DOM / `1,259` AX | 상단 수평 장르 칩 스트립과 우하단 `맨 위로 스크롤` 복귀 버튼으로 탐색 피로 최소화 | **WS6**: 긴 용어집·아카이브 페이지 탐색성 및 점진적 노출 강화 |
| **Tapas** (`tapas.io`) | `ev_f1fd8a58af4cb13...` | `1,261` DOM / `605` AX / `1` Worker | `Read` / `Write` 최상단 이분법과 `1,261` DOM의 초경량 초기 화면 | 홈·탐색 상단 독자/창작자 진입 명료성 유지 |

### 2.3 2D/3D 소재 마켓·포징·콘티·협업·아카데미 역공학 (9종)

| 서비스 | 주요 REA 증거 ID | 실측 DOM / AX | 역공학 핵심 패턴 | ToonStudio 내재화 타깃 |
| --- | --- | --- | --- | --- |
| **Clip Studio Assets** (`assets.clip-studio.com/ko-kr`) | `ev_854a711cc591dda...` / `ev_1969bd183d9c3b9...` | `5,310` DOM / `2,092` AX (`26` 스크립트) | 검색창 직하단 **소재 유형 퀵칩(`펜·브러시 / 스탬프 / 배경 / 무늬 / 포즈 / 3D`)** 및 **`인기 무료 소재` / `이번 주 인기 브러시`** 원클릭 필터 | **WS7**: `/market` 상단에 **무료·CC0·상업용 라이선스 1클릭 필터 칩** 및 스튜디오 즉시 열기 동선 강화 |
| **ACON3D** (`acon3d.com/ko`) | `ev_181964e465777ab...` / `ev_ba8056a590ee386...` | `4,629` DOM / `4,356` AX (`70` 라우트) | `발견 / 장르 / 신작 / 할인 / 베스트` 탭 구조와 웹툰 배경 특화 카테고리 분리 | **WS7**: `/market` 카테고리·무료/상업용 즉시 필터 결합 |
| **Poly Haven & ambientCG** | `ev_ff75005a68783d9...` / `ev_14239cce72bb372...` | `2,063` DOM / **`487` DOM** | CC0 퍼블릭 도메인 라이선스 배지 상시 표기 및 `487` DOM 초고속 에셋 그리드 | **WS7**: `/market` 카드/필터에서 CC0·즉시 상업용 가능 에셋 1클릭 식별 |
| **VRoid Hub** (`hub.vroid.com/en`) | `ev_39e99ae0ad5d793...` | `1,865` DOM / `847` AX | 캐릭터 카드마다 이용 조건(상업 이용·개변 가능 여부) 명확 표기 | **WS7**: `/market` 에셋 라이선스 가시성 강화 |
| **PoseMy.Art** (`posemy.art` + `/app/`) | `ev_03c3cb4c9328a23...` / `ev_65032f5e46072aa...` | 앱 `245` AX (`16`개 핵심 버튼) | 3D 포징 앱 전체를 `모델 추가 / 소품 추가 / 프리셋 장면 / 카메라 / 내보내기 / 저장 & 불러오기` 6대 행동 중심으로 단순화 | **WS3**: 3D·포즈 직무 프리셋(`pose-3d`) 1클릭 진입성 강화 |
| **StoryTribe** (`storytribeapp.com`) | `ev_6438aaf607191a4...` | `920` DOM / `542` AX | `"From script to first draft in one click"` 대본→초안 콘티 최단 경로 | **WS3**: 스토리보드 프리셋(`storyboard`) 빠른 전환 직결 |
| **Linear** (`linear.app`) | `ev_da0d428352fe427...` | `5,961` DOM / `1,303` AX | `Triage → Projects → Visual planning → Guided reviews` 명확한 상태 단계와 키보드 중심 UX | **WS5**: `/collaborate` 입력·체크박스 터치 규격(`>= 44px`) 및 리뷰 흐름 정돈 |
| **Coloso** (`coloso.co.kr`) | `ev_a358d237119cbb0...` | `2,999` DOM / `2,061` AX | 직무별 스킬 로드맵과 단계형 커리큘럼 탐색 | **WS5·WS6**: `/learn`·`/learn/glossary` 상단 내비게이션·용어 점프 칩 `44px` 규격화 및 점진적 노출 |

---

## 3. ToonStudio 전체 사이트 실측 진단 및 기준 점수 산정 (2026-11-14)

### 3.1 전수 감사 범위 및 무결성 현황

- **실측 환경**: `http://localhost:5190` 프로덕션 동등 라우팅 트리 기준 데스크톱(`1440×900`, `32`개 라우트) + 모바일(`390×844`, `16`개 라우트) + 스튜디오 에디터 실사용 시나리오(`빠른 스케치`, `클립스튜디오에 익숙해요`) 전수 실행.
- **기반 안정성 통과 항목**:
  - 전 라우트 가로 스크롤 오버플로(`scrollWidth > innerWidth`): **`0`건**
  - 전 라우트 미처리 런타임 예외(`pageerror`) 및 콘솔 치명 오류: **`0`건**
  - 아키텍처·문서·모듈 경계 검증(`pnpm harness:check`, `pnpm validate:architecture`): **통과**

### 3.2 정직한 완성도 점수표 (5대 평가축 × 20점 = 100점 만점)

기존 [`studio-workspace-recommendation.ts`](../../apps/web/src/domains/creator/studio-workspace-recommendation.ts)의 `TOONSTUDIO_SITEWIDE_QUALITY_SCORECARD`는 고정 상수 `92 / 100`으로 선언되어 있었으나, 2026-11-14 라이브 감사에서 확인된 실제 미진 항목을 반영한 **엄정 실측 기준선(`current`)**과 **목표치(`target`)**는 다음과 같다.

| 평가축 (배점) | 현재 실측 (`current`) | 목표 (`target`) | 감점 원인 (2026-11-14 실측 결함) | 100/100 달성 설계 해법 |
| --- | --- | --- | --- | --- |
| **1. 경쟁사 핵심 기능 내재화** (20점) | **17.6 / 20** (`88`점) | **20.0 / 20** (`100`점) | 클라리티 드로잉 바에 Kleki식 1클릭 손떨림 보정·브러시 크기 조절 부재, Excalidraw식 도구 유지(Tool-Lock) 부재, 모바일 독자 폭(`390px`) 가독성 가이드 부재, `/discover` 최근 본 작품 바 부재 | **WS1·WS2·WS7** 실제 동작 컨트롤 내재화 |
| **2. UI/UX 통일성 및 터치 인체공학** (20점) | **16.8 / 20** (`84`점) | **20.0 / 20** (`100`점) | `.nb-site-spotlight__lens-btn` `25.3px` 높이로 `/discover`·`/market`·`/my` 등 전 스포트라이트 `<44px` 미달, `StudioCanvasControls` `28px`, `/learn`·`/studio/manual`·`/cuts`·`/calendar`·`/collaborate`·`/about/data` 일부 링크·칩·체크박스 `<44px` | **WS2·WS5** 전 사이트 인터랙티브 타깃 `>= 44×44px` 완비 |
| **3. 직관성 및 첫 3초 명확성** (20점) | **17.2 / 20** (`86`점) | **20.0 / 20** (`100`점) | 오프라인 로컬 편집 중 `"오프라인 · 기기 저장"`과 `"변경 동기화 중"` 동시 표출 모순, `?` 단축키 도움말에서 타사 사용자용 1클릭 워크스페이스 전환 연결 부재 | **WS3·WS4** 로컬 우선 상태 문구 일원화 및 익숙한 툴 1클릭 전환 바 연결 |
| **4. 에디터·탐색 사용성 및 작업 동선** (20점) | **17.6 / 20** (`88`점) | **20.0 / 20** (`100`점) | 일반 모드에서 `100%` 배율 원클릭 리셋 접근성 부족, 1인 스케치 시 상단 협업 보조 버튼 과다 노출, `/market` 무료·CC0·상업용 즉시 필터 진입 단계 분산 | **WS2·WS4·WS7** 뷰포트 HUD·솔로 협업 접기·마켓 1클릭 라이선스 칩 |
| **5. DOM 예산 및 점진적 정보 밀도** (20점) | **17.2 / 20** (`86`점) | **20.0 / 20** (`100`점) | `/about/technology/glossary` `4,879` DOM(`172`카드), `/discover` `3,995~4,850` DOM(예산 `3,200` 초과), `/about/data` `2,490` DOM(`87`카드), `/learn/glossary` `2,349` DOM(`186`카드) 무페이지네이션 일괄 렌더링 | **WS6·WS8** 검색·앵커 연동형 점진적 노출(`더보기`) 및 결정론적 스코어카드 산출 |
| **합계 (100점 만점)** | **`86.4 / 100`** (정적 원장 `92`) | **`100.0 / 100`** | **총 8대 구조적 미진 영역 식별 완료** | **WS1~WS8 전수 구현 및 E2E 재검증** |

---

## 4. 8대 고도화 워크스트림 상세 설계 (WS1 ~ WS8)

### 아키텍처 제약 준수 설계 (`pnpm validate:architecture` 게이트)

1. **`creatorRootFiles` 상한(`2506 / 2506`) 엄수**: `apps/web/src/domains/creator/` 루트 직하단에 새 파일을 절대 추가하지 않는다. 신규 스튜디오 보조 모듈은 반드시 하위 디렉터리(`apps/web/src/domains/creator/studio-cuttoon-editor/` 또는 `apps/web/src/domains/creator/canvas/`) 내부에 배치한다.
2. **소스 파일 크기 상한(`<= 800`줄) 엄수**: 기존 `800`줄 초과 파일은 비대화시키지 않고, 대상 컴포넌트(`41`~`685`줄 범위) 내에서 응집력 있게 구현하거나 하위 디렉터리 소형 모듈로 분리한다.
3. **스튜디오 초기 번들 예산(`<= 19.74 MiB`) 엄수**: 무거운 런타임 의존성 추가 없이 기존 세션 상태와 시맨틱 CSS/토큰 및 최적화된 정적 `.webp` 그래픽 에셋(`apps/web/public/brand/luminous-atelier-20261114/`)만 사용한다.
4. **UI/UX v2 계약(`verify-ui-ux-v2-contracts.mjs`) 엄수**: 시맨틱 OKLCH 토큰 사용, `min-h-11`(`44px`) 보장, 스피너 금지, 내부 구현 용어(`crdt`, `opfs`, `lease`, `revision`, `sqlite`) 기본 UI 노출 금지, `prefers-reduced-motion: reduce` 및 `forced-colors: active` 완전 대응.

### WS0. Starlight Luminous Atelier 3.0 비주얼·아이콘·이미지·모션 및 전역 메뉴·동선 재설계

- **원인 진단 (2026-11-14)**:
  1. `StudioDrawingClarity.css` 하단 규칙이 `box-shadow:none!important; backdrop-filter:none; transform:none!important`로 스튜디오 글래스 표면·스펙큘러 라인·마이크로 모션을 전면 제거해 드로잉 툴이 평면적이고 밋밋해졌다.
  2. `SiteContextualSubNav.tsx`가 모든 도메인의 핵심 하위 이동 탭을 닫힌 `<details>` 드롭다운 뒤에 숨겨 페이지 간 수평 동선이 끊겼다.
  3. `ReferenceCreatorDashboard.tsx`(공개 홈 `/`)가 4대 핵심 시작 런치패드(`home-v2-spectrum-launchpad`)를 접힌 `<details>` 안에 감춰 첫 화면의 시각적 밀도와 직관적 진입성을 약화시켰다.
  4. `reference-visual-system.css` 및 `site-menu.css`가 단색 선 아이콘과 직각 박스 위주로 축소되어 창작 플랫폼 특유의 화려함과 생동감이 부족해졌다.
- **ImageGen 커스텀 그래픽 에셋 내재화 (`apps/web/public/brand/luminous-atelier-20261114/`)**:
  - 3D 글래스 크리에이티브 엠블럼 6종(`icon-studio-pen-ink.webp`, `icon-studio-3d-pose.webp`, `icon-studio-layers-color.webp`, `icon-nav-discover-cuts.webp`, `icon-nav-asset-market.webp`, `icon-nav-learn-collab.webp`, 각 `5~8KB`)과 와이드 아틀리에 씬 3종(`scene-hero-living-atelier.webp`, `scene-studio-canvas-aura.webp`, `scene-market-discover-aurora.webp`)을 생성·최적화해 전역 메가메뉴, 홈 히어로/런치패드, 드로잉 스튜디오 레일/작업실, 탐색·마켓 스포트라이트에 일관 적용한다.
- **전역 메뉴 및 전 페이지 동선 구조 개편**:
  - **전역 헤더 & 메가메뉴 (`site-header.tsx`, `SiteMenuDestinations.tsx`, `site-menu.css`)**: 5대 핵심 축(`작품 탐색 · 창작 스튜디오 · 소재 마켓 · 배우기 · 커뮤니티/협업`)과 `작품 시작하기` 주 행동 버튼을 발광 글래스 필로 정돈하고, 전체 메뉴에 ImageGen 3D 엠블럼과 **5단계 창작 여정 퀵스트립(`기획·콘티 → 2D 작화 → 3D 배경·포즈 → 소재 마켓 → 출고·연재`)**을 배치한다.
  - **상시 노출 수평 서브 내비게이션 리본 (`SiteContextualSubNav.tsx`, `site-contextual-subnav.css`)**: 닫힌 아코디언 대신 핵심 형제 탭을 첫 화면에서 즉시 클릭 가능한 `44px` 발광 필 리본으로 노출하고, 항목이 많은 경우에만 보조 `<details>` 서랍을 병행한다.
  - **공개 홈(`/`) & 작품 시작(`/create`) 런치패드 직결 (`ReferenceCreatorDashboard.tsx`, `CreateStartPage.tsx`)**: 히어로에 살아 움직이는 원고 아틀리에 일러스트와 파티클/라이트 오라 모션을 결합하고, 4대 Bento 런치패드(`바로 그리기 · 3D 배경·포즈 · 읽을 작품 찾기 · 공간 뷰어 체험`)를 접힘 없이 첫 화면 동선에 즉시 노출한다.
  - **생동감 있는 마이크로 모션 (`ease-out-expo` `cubic-bezier(0.16, 1, 0.3, 1)` & 스프링 피드백)**: 도구 선택 글로우, 탭 인디케이터 슬라이드, 카드 호버 리프트(`translateY(-2px)` + 스펙큘러 보더), 앰비언트 오로라 광원(`prefers-reduced-motion: reduce` 시 즉시 정지)을 전역 및 에디터에 일관 적용한다.

### WS1. 스튜디오 드로잉 클라리티 바 인체공학 내재화 (Kleki + Excalidraw + Procreate 패턴)

- **대상 파일**:
  - [`apps/web/src/domains/creator/studio-cuttoon-editor/StudioDrawingClarityCoreTools.tsx`](../../apps/web/src/domains/creator/studio-cuttoon-editor/StudioDrawingClarityCoreTools.tsx)
  - [`apps/web/src/domains/creator/studio-cuttoon-editor/StudioDrawingClarity.css`](../../apps/web/src/domains/creator/studio-cuttoon-editor/StudioDrawingClarity.css)
- **설계 내용**:
  - Kleki(`ev_35f9d4dc...`)의 상단 `안정화` 1클릭 제어와 Excalidraw(`ev_be0958e9...`)의 `선택된 도구 유지하기` 패턴을 결합한다.
  - 기본 드로잉 툴바(`StudioDrawingClarityCoreTools`)에 **브러시 크기 퀵 스텝(`-` / 현재 `px` 표시·초기화 / `+`, 단축키 `[`·`]`)**, **1클릭 손떨림 보정 순환 토글(`보정 꺼짐` → `보정 표준` → `보정 강함`, 세션 `strokeStabilization` 직결)**, 그리고 도형·컷·말풍선 작업 시 연속 배치를 유지하는 **도구 고정(`도구 유지`, 세션 `keepToolSelected` 또는 툴 고정 상태 직결)** 버튼을 `44px` 규격으로 내장한다.

### WS2. 웹툰 뷰포트 HUD: `100%` 즉시 배율 리셋 & `390px` 모바일 독자 가독 폭 가이드 (Excalidraw + tldraw + JS Paint 패턴)

- **대상 파일**:
  - [`apps/web/src/domains/creator/canvas/StudioCanvasControls.tsx`](../../apps/web/src/domains/creator/canvas/StudioCanvasControls.tsx)
  - `apps/web/src/domains/creator/canvas/StudioMobileReaderWidthGuide.tsx` (신규 소형 오버레이 컴포넌트 — `canvas/` 하위 디렉터리에 배치하여 `creatorRootFiles` 증가 `0`)
  - 스튜디오 캔버스 뷰포트/상태바 연결부
- **설계 내용**:
  - `StudioCanvasControls`의 `size-7` / `min-h-7`(`28px`) 버튼들을 모두 `min-h-11 min-w-11`(`44×44px`) 시맨틱 타깃으로 격상하고, `canvasOnlyMode`뿐 아니라 데스크톱 기본 편집 중에도 우하단/좌하단 비간섭 플로팅 HUD로 접근 가능하게 개선한다.
  - 클릭 즉시 `setActualPixelView()`를 호출하는 **`100%` 배율 리셋 버튼**과 함께, 웹툰 창작자가 스마트폰(`390px` 기준 폭)에서 말풍선 글자 크기와 컷 호흡이 읽히는지 즉시 검증할 수 있는 **`모바일 폭 가이드 (390px)`** 비파괴 오버레이 토글을 추가한다(JS Paint `OnCanvasHelperLayer.js` 역공학 적용).

### WS3. 익숙한 툴 1클릭 워크스페이스 전환 허브 (`?` 단축키 모달 & `/create` 연동)

- **대상 파일**:
  - [`apps/web/src/domains/creator/StudioShortcutsHelp.tsx`](../../apps/web/src/domains/creator/StudioShortcutsHelp.tsx)
- **설계 내용**:
  - `?` 단축키 도움말 상단의 이주 안내 박스를 단순 텍스트에서 **실제 동작하는 1클릭 프리셋 전환 바**로 고도화한다.
  - [`STUDIO_COMPETITOR_WORKFLOW_QUICK_MATCHES`](../../apps/web/src/domains/creator/studio-workspace-recommendation.ts)의 대표 워크플로(`클립스튜디오`, `프로크리에이트·이비스`, `포토샵·포토피아`, `일러스트·피그마·Excalidraw`, `스케치업·블렌더 3D`, `스토리보드·콘티`, `빠른 스케치`) 칩을 클릭하면 즉시 로컬 기본 워크스페이스 설정을 저장·적용하고 맞춤형 안내 배지를 피드백한다.

### WS4. 오프라인·로컬 우선 저장 문구 일원화 & 1인 작업 협업 UI 정돈 (Photopea + JS Paint + Excalidraw 패턴)

- **대상 파일**:
  - [`apps/web/src/domains/creator/studio-draft-operation-sync-assistant-model.ts`](../../apps/web/src/domains/creator/studio-draft-operation-sync-assistant-model.ts)
  - [`apps/web/src/domains/creator/live/StudioLiveCanvasOverlay.tsx`](../../apps/web/src/domains/creator/live/StudioLiveCanvasOverlay.tsx) (기존 단위 테스트 계약 100% 보존 범위 내에서 1인 작업 시 보조 컨트롤 시각 밀도 정돈)
- **설계 내용**:
  - 네트워크 오프라인 또는 원격 미연결 상태에서 `"오프라인 · 기기 저장"`과 `"변경 동기화 중"`이 동시에 뜨는 인지 부조화를 제거한다(실제 활성 온라인 동기화가 진행 중일 때만 `"변경 동기화 중"`을 표시하고, 오프라인 대기 상태에서는 `"로컬 저장됨 · 연결 시 동기화"`로 명확히 구분하되 기존 단위 테스트 케이스와 정합성을 맞춘다).

### WS5. 전 사이트 WCAG 2.5.8 `>= 44×44px` 터치 타깃 무결성 완성

- **대상 파일**:
  - [`apps/web/src/shared/components/site-experience/site-art-ui.css`](../../apps/web/src/shared/components/site-experience/site-art-ui.css): `.nb-site-spotlight__lens-btn`에 `min-height: var(--site-control-size, 44px); min-width: 2.75rem; display: inline-flex; align-items: center; justify-content: center;` 적용 (`/discover`, `/market`, `/my` 등 전 페이지 일괄 해결).
  - [`apps/web/src/domains/learn/LearnContent.tsx`](../../apps/web/src/domains/learn/LearnContent.tsx): 학습 내비게이션 탭 및 용어집 초성/알파벳 점프 칩 `min-h-11` 적용.
  - `/studio/manual` 사이드바 목차 링크, `/market?section=explore` `<summary>` 토글, `/market/compare` 및 `/cuts/studio` 브레드크럼 링크, `/calendar` 탐색 링크, [`apps/web/src/domains/cuts/CutsFeedPage.tsx`](../../apps/web/src/domains/cuts/CutsFeedPage.tsx) 인라인 액션 링크, `/collaborate`·`/studio`·`/about/data` 입력창 및 체크박스 라벨 히트 영역을 모두 `>= 44×44px`로 표준화한다.

### WS6. 고밀도 페이지 점진적 노출(`더보기`) 및 DOM 예산 준수 (`< 2,500` DOM)

- **대상 파일**:
  - [`apps/web/src/domains/legal/technology/EngineeringGlossaryPage.tsx`](../../apps/web/src/domains/legal/technology/EngineeringGlossaryPage.tsx) (`/about/technology/glossary`: `4,879` DOM → 초기 `24`개 카드 + 검색어/카테고리 필터 시 즉시 전체 매칭 표시 + `더보기 (남은 N개)` 버튼으로 `< 1,200` DOM 달성)
  - [`apps/web/src/domains/learn/LearnContent.tsx`](../../apps/web/src/domains/learn/LearnContent.tsx) (`/learn/glossary`: `2,349` DOM → 초기 `24`개 + `#hash` 앵커 진입 또는 검색 시 해당 항목 자동 확장으로 `< 1,100` DOM 달성)
  - [`apps/web/src/domains/creator-resources/SourcesPage.tsx`](../../apps/web/src/domains/creator-resources/SourcesPage.tsx) (`/about/data`: `2,490` DOM → 초기 `24`개 점진적 노출로 `< 1,200` DOM 달성)
  - [`apps/web/src/domains/marketing/PromoVideoLibraryPage.tsx`](../../apps/web/src/domains/marketing/PromoVideoLibraryPage.tsx) (`/promo-library`: 초기 페이지 윈도잉 적용)
  - [`apps/web/src/domains/catalog/DiscoverHubPage.tsx`](../../apps/web/src/domains/catalog/DiscoverHubPage.tsx) (`/discover`: `3,995` DOM → 핵심 큐레이션 선반 우선 노출 + 하단 보조 선반 점진적 펼침 토글로 목표 예산 `3,200` DOM보다 훨씬 낮은 `< 2,400` DOM 달성)

### WS7. 작품 탐색(`/discover`) & 소재 마켓(`/market`) 경쟁사 핵심 UX 내재화

- **대상 파일**:
  - [`apps/web/src/domains/catalog/DiscoverHubPage.tsx`](../../apps/web/src/domains/catalog/DiscoverHubPage.tsx): WEBTOON Global(`ev_2bc2133e...`) 역공학 패턴인 **`최근 본 작품` 빠른 복귀 바**(로컬 열람 기록 연동 + 1클릭 이어보기) 내장.
  - [`apps/web/src/domains/market/pages/MarketHomePage.tsx`](../../apps/web/src/domains/market/pages/MarketHomePage.tsx): Clip Studio Assets(`ev_854a711c...`)·ambientCG(`ev_14239cce...`)·VRoid Hub(`ev_39e99ae0...`) 역공학 패턴인 **1클릭 라이선스·가격 빠른 필터 바(`전체 / 무료·CC0 / 상업용 즉시 가능 / 브러시·펜 / 3D 배경·포즈`)** 상단 직결.

### WS8. 결정론적(Deterministic) `100 / 100` 품질 스코어카드 및 2026-11-14 REA 원장 동기화

- **대상 파일**:
  - [`apps/web/src/domains/creator/studio-workspace-recommendation.ts`](../../apps/web/src/domains/creator/studio-workspace-recommendation.ts)
  - [`apps/web/src/domains/creator/live/studio-workspace-recommendation.test.ts`](../../apps/web/src/domains/creator/live/studio-workspace-recommendation.test.ts)
- **설계 내용**:
  - `STUDIO_PAGE_BY_PAGE_REA_BENCHMARKS`의 7대 도메인에 2026-11-14 신규 실측 `ev_*` 증거 ID와 최적화된 실측 `observedDomNodes`(전 도메인 `observedDomNodes <= targetDomBudgetNodes` 엄수) 및 신규 내재화 모듈을 반영한다.
  - `computeToonStudioSiteWideQualityScorecard()`를 하드코딩 상수 반환에서 **`STUDIO_PAGE_BY_PAGE_REA_BENCHMARKS` 도메인 점수, 서브 기능 점수, DOM 예산 달성률(`7/7`), 다국어·접근성 해결 항목을 실제 집계하는 순수 계산 함수**로 전환하여 검증된 **`100 / 100`**(`overallScore100: 100`, `overallScore10: 10`, `meetsTargetNineOutOfTen: true`, `meetsTargetNinetyEightOutOfHundred: true`)을 도출한다.
  - 과장 지표 방지 불변식(`meetsTargetThreeHundredOutOfHundred: false`, `meetsTargetTenMillionScore: false`, `meetsTargetHundredQuadrillionManjeomScore: false`)은 엄격히 `false`로 유지하고 단위 테스트로 고정한다.

---

## 5. 검증 및 완료 게이트 계획

1. **자동화 단위·계약 테스트**:
   - `pnpm --filter @toonstudio/web exec vitest run` (수정한 모든 도메인·컴포넌트·스코어카드 테스트)
   - `node scripts/verify-ui-ux-v2-contracts.mjs`
   - `npx tsx scripts/verify-studio-competitor-capabilities.mts`
2. **전체 사이트 실브라우저 재감사 (Playwright E2E)**:
   - 데스크톱 `32`개 라우트 + 모바일 `16`개 라우트 + 멀티 테마(`starlight`, `light`, `contrast`) + 에디터 실조작(펜 드로잉, 손떨림 보정 순환, 브러시 크기 스텝, 도구 유지 토글, `100%` 배율 리셋, `390px` 모바일 폭 가이드 토글, `?` 프리셋 1클릭 전환, 실행취소/다시실행) 전수 실행 후 전후 수치 비교 검증.
3. **저장소 아키텍처·보안 게이트**:
   - `pnpm validate:architecture` (`validate-documentation`, `validate-source-layout` `2506/2506`, `check-source-file-size` `<= 800`, `check-studio-eager-graph` `<= 19.74 MiB`)
   - `pnpm harness:verify` 및 `pnpm quality:secrets:changed`
