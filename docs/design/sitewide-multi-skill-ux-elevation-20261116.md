# ToonStudio 전사 멀티스킬 UI/UX 전수 분석·설계·고도화 명세 (2026-11-16)

- **작성일**: 2026-11-16
- **대상 범위**: `apps/web`(공통 디자인 시스템·전역 셸·공개 홈·탐색·컷츠·마켓·커뮤니티·제작 허브·스튜디오 2D/3D 편집기·매뉴얼), `apps/admin-web`, `apps/character-lab`, `apps/brush-lab`, `apps/mobile/shell`
- **참조 상위 문서**: [`../../AGENTS.md`](../../AGENTS.md), [`../../DESIGN.md`](../../DESIGN.md), [`../architecture/ui-ux-v2-overhaul-blueprint-2026-11-11.md`](../architecture/ui-ux-v2-overhaul-blueprint-2026-11-11.md)

---

## 1. 적용 디자인 스킬 및 검증 플러그인 체계

본 고도화는 단일 관점이 아닌 22종 이상의 전문 디자인·접근성·타이포그래피·스튜디오 크롬 스킬과 브라우저 자동화 도구를 결합해 교차 검증했다.

| 분류 | 적용 스킬 / 플러그인 | 핵심 진단 축 |
| --- | --- | --- |
| 인터페이스 종합 진단 | `better-interface`, `better-accessibility`, `better-layout`, `better-writing`, `better-typography`, `better-colors`, `better-ui` | WCAG 2.2 AA/AAA 명암비·타깃 크기(`>=24px` 하한, `>=44px` 표준), 동심원 반경, 시맨틱 토큰 단절, 명확한 행동 중심 문구 |
| 한국어 스튜디오·조판 | `korean-studio-ux-craft`, `korean-typography`, `plain-writing`, `intuitive-zero-jargon-ux` | `word-break: keep-all`, `font-synthesis` 보존, `"Apple SD Gothic Neo"` 메트릭 호환 폴백, `tabular-nums`, 내부 코드명·메타 문구 제거, 자연스러운 한국어 조사 |
| 에디터·3D·웹툰 크롬 | `editor-chrome-design`, `calm-3d-viewport-chrome`, `cad-3d-ui-review`, `webtoon-panel-craft`, `calm-wellness-atelier-design` | 캔버스·뷰포트 면적 우선, 5~9 핵심 행동 예산, 주간(Light)·종이(Sepia)·별빛(Starlight) 테마 간 조화, 9:16 숏폼 암실 스테이지 일관성 |
| 모션·최신 웹 플랫폼 | `accessible-motion`, `modern-web-guidance` (`prevent-page-scroll-under-modal-dialog`, `tabs`, `accessibility`, `responsive-design`, `color`, `natural-interactions`, `respect-os-text-scale`), `web-design-guidelines`, `ui-ux-pro-max` | 스피너 배제(`DESIGN.md` §4), `dialog:modal` 배경 스크롤 체이닝 차단, `forced-colors` 안전 탭 인디케이터, `100dvh` 뷰포트, OS 텍스트 배율 존중 |
| 실측 브라우저 감사 | `scripts/audit-sitewide-visual-ux.mjs` (Playwright + Axe-core), `chrome-devtools` MCP (`lighthouse_audit`, DOM `evaluate_script`, 스크린샷) | 36개 대표 경로 × 다중 테마 × 데스크톱(`1440×1000`)·모바일(`390×844`) 212회 실측 및 독립 서브앱 4종 전수 프로브 |

---

## 2. 현행 상태(`current`) 전수 실측 진단 요약 (2026-11-16 기준)

### 2.1 정적 라우트·스타일·소스 전수 스캔 결과

1. **`globals.css` `@theme` 시맨틱 컬러 별칭 누락 (`apps/web`)**:
   - TSX 컴포넌트 전반에서 사용 중인 `fg-1`(21회), `fg-4`(64회), `accent-hover`(37회), `accent-contrast`·`accent-foreground`(6회), `field`(28회), `bg-2`·`panel-2`·`surface-2`(10회 이상), `primary`·`primary-foreground`·`background`·`foreground`·`muted`·`muted-foreground`·`border`·`destructive`(175회 이상), `info`·`info-soft`·`bad-light`·`warning-strong`·`ink` 토큰이 `apps/web/src/app/styles/globals.css`의 `@theme`에 선언되지 않아 Tailwind CSS 유틸리티 클래스가 생성되지 않고 투명 배경·무색 테두리·1.9:1 저대비 버튼으로 렌더링됨.
2. **모달 대화상자 스크롤 체이닝 미차단**:
   - 27개 네이티브 `<dialog>` 사용처에서 `overscroll-behavior: contain`이 전역 보장되지 않아 모달 끝 스크롤 시 뒤쪽 문서가 함께 스크롤됨.
3. **한국어 기계식 병기 조사 및 광범위 트랜지션**:
   - 사용자 노출 안내·토스트 일부에 `이(가)`·`을(를)` 기계식 병기가 남아 있고, 공용 버튼·배너 일부가 `transition-all` 또는 회전형 스피너(`LoaderCircle animate-spin`)를 사용함(`DESIGN.md` §4 위반).

### 2.2 실측 브라우저 감사(Wave 1 136회 + Wave 2 76회 = 212회 관찰) 및 Lighthouse 진단

| 영역 | 관찰된 결함 (`current`) | 원인 |
| --- | --- | --- |
| 공개 홈 (`/`) | Light 테마에서 아이디어 입력창·루나 카드가 칠흑색(`oklch(0.12 0.03 275)`) 박스로 이질적 노출; 내부 코드명(`GRAND ATELIER V4`, `"접혀 있던..."`) 노출; Lighthouse SEO `83` (`전체 보기` 모호 링크), PWA 배너 `<aside role="status">` 접근성 트리 오류 | `.rd-clarity-helpers`가 포스터 밖 일반 테마 면에 놓였음에도 `--rd-art-scrim`/`--rd-on-art` 고정 어두운 토큰을 참조함; Lighthouse `link-text`는 `aria-label` 대신 본문 텍스트(`.sr-only` 포함)를 검사함 |
| 컷츠 피드 (`/cuts`) | Light 테마 데스크톱 10건·모바일 12건의 심각(`serious`) Axe `color-contrast` 위반(최저 `1.21:1`) | 암실형 숏폼 무대여야 하는 `.cuts-feed`가 `background: var(--color-canvas)`를 써 주간 테마에서 밝은 크림색으로 바뀌고, 그 위에 흰 글자(`#ffffff`)와 주간용 어두운 `text-warn`/`text-cool`이 겹침 |
| 3D 배경·모델러 (`/studio/bg3d`, `/studio/3d/dcc/model`) | `/studio/bg3d` 시작 오버레이 `"대기"` 배지 명암비 미달(`3.52:1` / `3.72:1`); `/studio/3d/dcc/model` 감사 준비 판정 타임아웃(`route-content-empty`) | `text-fg-3` 위에 `opacity-75`가 중첩되어 명암비 하락; `scripts/lib/sitewide-visual-ux-audit.mjs`가 `bg3d` 포털만 소유 본문으로 인정하고 `3d/dcc/*`의 `[data-studio-hybrid-dcc-dialog="true"]` 포털을 누락함 |
| 전역 셸·작업공간 (`/studio`, `/settings`, `/production`, `/market`, `/community`, `/create`) | 데스크톱 `/studio` 좌측 하단 `⚙ 설정` 위에 OST 플로팅 알약이 겹침; 데스크톱 `/settings`에서 `⚙ 설정` 대신 `전체 메뉴`가 활성 표시됨; `STORY COMES TO LIFE`(`8px`), `.market-material-label`(`9px`), `.nb-site-glance-flow__step`(`9.92px`) `10px` 미만 미세 글자; `/create` 카드 설명이 데스크톱에서도 `1px` 클리핑 상태로 잠김; `/community` 실시간 새로고침 체크박스가 `44×44px` 거대 사각형으로 표시됨; `/market`·`/community` 진입 베일이 첫 클릭을 가로막음 | 사이드바 폭(`--layout-rail-icon` / `--layout-rail-row`) 미반영 좌측 고정 좌표, 데스크톱 보조 내비 `aria-current` 누락, 반응형 리셋 누락, `<input type="checkbox">` 직접 `size-11` 지정, `PageIntro` 베일 `pointer-events` 차단 |
| 독립 서브앱 (`admin-web`, `character-lab`, `brush-lab`, `mobile/shell`) | `admin-web`: 비정상/HTML 응답 시 `requestAdminJson`이 `null`을 반환해 `"Cannot read properties of null (reading 'policy')"` 런타임 오류 노출 및 온보딩 카드 패딩·폭 불균형; `character-lab`: 미스타일 `<select>`·`<input type="number">`·`<summary>` 43개 타깃 크기 미달(`17~23px`) 및 `Inter` + `font-synthesis: none` + `keep-all` 누락으로 한글 음절 단절; `brush-lab`: `22×22px` 체크박스 타깃 미달, `"그레 / 인이"` 음절 단절, 탭 줄바꿈 및 `forced-colors` 인디케이터 부재; `mobile/shell`: iOS WKWebView용 `-webkit-backdrop-filter` 누락 | 서브앱별 초기 독립 스타일시트가 메인 웹의 한국어 조판·접근성·터치 타깃 계약과 동기화되지 않음 |

---

## 3. 목표 설계(`target`) 및 아키텍처 불변 조건

### 3.1 준수하는 기존 계약(회귀 금지 경계)

- **단일 치수 토큰 소유권**: `--layout-*` 리터럴은 `apps/web/src/app/styles/sitewide-visual-ux.css` 한 곳에서만 정의하며, `apps/web/src/app/styles/layout-token-contract.contract.test.ts`의 표준 브레이크포인트(`640`, `768`, `1024`, `1280`, `1536`) 및 잔존 목록 계약을 엄격히 유지한다.
- **표현(Spectacle) 토큰 단일 파생**: 새 하드코딩 팔레트를 추가하지 않고 기존 `--color-*` / `--unified-*` 정본 토큰을 별칭으로만 연결한다(`apps/web/src/app/styles/spectacle-tokens.contract.test.ts`).
- **모듈·번들 경계**: `apps/web/src/domains/creator/` 루트에 신규 파일을 추가하지 않고, 800줄 초과 대형 파일의 줄 수를 늘리지 않으며, 스튜디오 초기 번들에 무거운 3D/마켓 도메인을 정적 import하지 않는다.

### 3.2 작업 스트림별 고도화 설계 (`target`)

1. **WS1 — 디자인 시스템 토큰 완결성·한국어 조판·모달 스크롤 격리 (`apps/web/src/app/styles/`)**:
   - `globals.css` `@theme` 및 `:root[data-theme="light"]`에 누락된 시맨틱 별칭 전수를 정본 토큰 참조(`var(--color-*)`)로 선언하고 `dead-class-patterns.contract.test.ts`로 재발을 잠근다.
   - `--font-sans`에 `"Apple SD Gothic Neo"`를 추가하고 `index.html`에 `<meta name="text-scale" content="scale" />`를 선언해 OS 글자 크기 배율을 존중한다.
   - `dialog:modal` 및 `dialog::backdrop`에 `overscroll-behavior: contain`을 부여해 모달 열림 중 배경 문서 스크롤 체이닝을 원천 차단한다.
2. **WS2 — 전역 셸·내비게이션·상태 배너·Lighthouse 100 달성 (`apps/web/src/shared/`, `apps/web/src/app/`)**:
   - `ServiceDegradedBanner.tsx`의 회전 스피너(`animate-spin`)를 차분한 맥동 점 인디케이터로 교체해 `DESIGN.md` §4를 준수한다.
   - `.workspace-sidebar`가 표시되는 데스크톱(`>=768px`, `>=1280px`)에서 고정형 OST 알약과 홍보 카드가 레일 우측(`calc(var(--layout-rail-*) + 1rem)`)에 놓이도록 배치해 `⚙ 설정` 가림을 해소한다.
   - 데스크톱 `WorkspaceSidebar`에서 `/help`·`/settings` 방문 시 보조 내비의 해당 링크에 `aria-current="page"`를 부여하고 주 메뉴 `전체 메뉴`의 중복 강조를 해제한다(모바일 5탭 바의 `all-menu` 활성은 그대로 유지).
   - `SectionNav`의 데스크톱·태블릿 탭/링크 최소 높이를 `min-h-11`(`44px`)로 통일하고, `STORY COMES TO LIFE`·`.market-material-label`·`.nb-site-glance-flow__step`을 `>=10~12px` 바닥선 이상으로 상향한다.
   - `pwa-install-nudge.tsx`의 대화형 `<aside>`에서 부적절한 `role="status"`를 제거하고, `DiscoverHomePreview`·`Section`의 `"전체 보기"` 링크에 `.sr-only` 맥락 접두사를 결합해 시각적 간결성과 Lighthouse SEO `100`을 동시에 달성한다.
   - `PageIntro` 베일을 비차단(`pointer-events: none`, 배지 버튼만 클릭 가능 + 첫 포인터 입력 시 즉시 종료, 지속시간 단축)으로 개선해 마켓·커뮤니티 진입 즉시 탐색·필터 조작이 가능하게 한다.
3. **WS3 — 공개 진입면 및 콘텐츠 허브 고도화 (`/`, `/discover`, `/cuts`, `/market`, `/community`, `/production`, `/create`)**:
   - **공개 홈(`/`)**: `.rd-clarity-helpers` 내부의 아이디어 입력 바(`.rd-idea`)와 루나 도우미(`.rd-luna-help`, `.rd-luna-card`)를 테마 표면 토큰(`--rd-card`, `--rd-panel`, `--rd-fg`, `--rd-muted`, `--rd-border`)으로 재설계해 Light·Sepia·Starlight 전 테마에서 이질감 없는 아틀리에 조화를 구현한다. 내부 코드명(`GRAND ATELIER V4`, `"접혀 있던..."`)을 창작자 관점의 직관적 한국어 문구로 다듬는다.
   - **탐색(`/discover`) & 컷츠(`/cuts`)**: 모바일 스포트라이트 스크림 가독성을 보강하고, `/cuts` 피드 배경을 테마 불변 암실 토큰(`var(--color-reader-canvas)`)으로 고정하며 엔진 바·오버레이 배지의 명암비를 `>=7:1`로 끌어올려 주간 테마 Axe 위반 12건을 0건으로 해소한다.
   - **마켓·커뮤니티·제작·시작 시트**: 마켓의 `WGSL` 등 내부 기술 용어를 평이한 창작 언어로 순화하고, `/community`의 `44px` 거대 체크박스를 `16px` 인풋 + `44px` 라벨 타깃으로 정돈하며, `/production` 담당자 필터 `<select>`를 `44px`로 확대하고, `/create` 시작 카드 설명이 `>=640px`에서 정상 표시되도록 클리핑을 해제한다.
4. **WS4 — 스튜디오 2D/3D 편집기 및 감사 정합성 고도화 (`apps/web/src/domains/creator/`, `scripts/`)**:
   - `StudioBg3dRetainedOwnerHost.tsx`의 단계 상태 배지에서 중복 투명도(`opacity-75`)를 제거해 주·야간 명암비를 확보하고, `StudioPanelShotTagFields`·`StudioPoseFirstRunGuide` 타깃 크기를 보강하며, HUD 진입 키프레임의 첫 프레임 불투명도를 안정화한다.
   - 사용자 노출 스튜디오 안내의 대표 기계식 조사(`이(가)`, `을(를)`)를 자연스러운 문장으로 정리한다.
   - `scripts/lib/sitewide-visual-ux-audit.mjs`가 `/studio/3d/dcc/*` 경로의 `[data-studio-hybrid-dcc-dialog="true"]` 포털을 소유 본문으로 인식하도록 보강하고, `scripts/audit-sitewide-visual-ux.mjs`가 반응형 W3C `sr-only` 클리핑(`1px×1px` + `clip-path: inset(50%)`)과 실제 텍스트 잘림을 구분하도록 정밀화한다.
5. **WS5 — 독립 서브앱 4종 디자인·안정성 동기화 (`admin-web`, `character-lab`, `brush-lab`, `mobile/shell`)**:
   - **`apps/admin-web`**: `requestAdminJson`이 비정상 JSON/`null`/HTML 폴백 응답에 대해 즉시 `AdminApiError`로 fail-closed 처리하도록 수정해 런타임 null 참조 오류를 제거하고, `Pretendard` + `"Apple SD Gothic Neo"` 타이포그래피·`word-break: keep-all`·`tabular-nums`·`100dvh`·카드 폭 정렬을 적용한다.
   - **`apps/character-lab`**: 전역 폼 컨트롤(`select`, `input[type="number"]`, `summary`)에 `44px` 터치 타깃과 Shaper/Starlight 테마 스타일을 일괄 부여하고, 한국어 타이포그래피(`Pretendard`, `word-break: keep-all`, `font-synthesis` 복구)·`100dvh`/`100%` 레이아웃·`prefers-reduced-motion`·`forced-colors` 대응을 완성한다.
   - **`apps/brush-lab`**: 체크박스 타깃(`24×24px` + `44px` 라벨), 한국어 어절 줄바꿈(`word-break: keep-all`), 가로 스크롤 단일 행 탭바(`.lab-tabs`)와 `forced-colors` 안전 하단 활성 인디케이터, `100dvh`·모션 축소 대응을 적용한다.
   - **`apps/mobile/shell`**: `-webkit-backdrop-filter`와 `"Apple SD Gothic Neo"` 폴백을 추가해 iOS WKWebView 호환성을 높인다.

---

## 4. 레거시 예외(`legacy exception`) 및 범위 경계

- 스튜디오 에디터 내부 밀도 예외(`--studio-chrome-h: 2.75rem`, `--studio-rail-w: 3rem`)는 [`../architecture/ui-ux-v2-overhaul-blueprint-2026-11-11.md`](../architecture/ui-ux-v2-overhaul-blueprint-2026-11-11.md) §5.1 (3)의 확정 예외이므로 유지한다.
- 게스트 픽스처·GPU 비활성(`--disable-gpu`) 기반 브라우저 감사는 공개/로컬 화면의 시각·접근성 정합성을 검증하며, 실제 인증 세션이 필요한 관리자 정책 저장이나 하드웨어 WebGPU 전용 셰이더 실행의 종단 기능 검증과는 구분해 보고한다.

---

## 5. 전수 실측 검증 결과 (`Before` → `After`, 2026-11-16)

| 검증 항목 | 고도화 전 (`Before`) | 고도화 후 (`After`) |
| --- | --- | --- |
| 사이트 전역 시각·접근성 감사 치명적 결함 (36개 경로 × 다중 테마 × 데스크톱·모바일 212회 관찰) | **29건** (`color-contrast` 25건, `route-readiness-timeout` 4건) | **0건** |
| `/cuts` 주간(Light) 테마 Axe `color-contrast` 위반 | 데스크톱 10건 · 모바일 12건 + 모바일 스크롤 스냅 헤더 겹침 | **0건** (스크롤 스냅 헤더 분리 완료) |
| `/studio` · `/studio/bg3d` · `/studio/manual` · `/studio/3d/dcc/model` 치명 결함 및 텍스트 잘림 | `color-contrast` 2건, `route-readiness-timeout` 3건, `clipped-text` 4건 | **0건** |
| `10px` 미만 미세 글자 (`tiny-text`) / 투명 텍스트 (`invisible-text`) | `33건` / `2건` | **0건** / **0건** |
| Chrome DevTools Lighthouse 데스크톱 (`/` 공개 홈) | Accessibility `100`, SEO **`83`**, PWA `role="status"` 경고 | Accessibility **`100`**, SEO **`100`**, 접근성 트리 결함 **0건** |
| 독립 서브앱 (`admin-web`, `character-lab`, `brush-lab`) `24×24px` 미만 타깃 / 가로 넘침(`overflowX`) | `character-lab` **43개** 미달, `brush-lab` 체크박스 미달, `admin-web` null 참조 오류 | 3개 앱 모두 **`under24Count: 0`**, **`overflowX: 0`**, 런타임 오류 **0건** |
