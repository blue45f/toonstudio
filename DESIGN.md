# ToonStudio — 디자인 시스템 및 UI/UX 정본 가이드

- 문서 상태: **current** (최종 개편 기준일: `2026-11-11`)
- 권위 범위: ToonStudio 전역 공개 페이지, 탐색(Spectrum), 스튜디오 에디터(2D·3D), 프로젝트·프로덕션 허브, 마켓, 커뮤니티, 모바일 셸 및 운영자 콘솔(`Admin`)의 **단일 시각·인터랙션·레이아웃 정본**이다. 전수 화면별 상세 개편 명세는 [UI/UX v2 전수 개편 설계서](./docs/architecture/ui-ux-v2-overhaul-blueprint-2026-11-11.md), 제품 경계는 [PRODUCT.md](./PRODUCT.md)를 따른다.
- 규격과 실제 완료 증거는 구분한다. 화면군별 구현·목표·잔여는 [현행 대조표](./docs/design/sitewide-clarity-20261111/verification-matrix.md), 실제 검증·원격 반영·배포 상태는 [검증 및 반영 기록](./docs/design/sitewide-clarity-20261111/validation-and-release.md)을 따른다. 원본 시안의 완료 문구나 정적 경로 수만으로 사용성·배포 완료를 판정하지 않는다.

시그니처 디자인 언어: **이야기가 살아나는 창작자의 아틀리에(The Living Webtoon Atelier)**. 짙은 남색 스타라이트 표면과 청록·보라 행동 신호, 섬세한 1px 경계선, 원고 아트워크가 주인공이 되는 절제된 크롬을 공유한다. 전역 헤더·푸터·사이드 레일·모바일 독·에디터 패널은 모두 하나의 일관된 제품 규격으로 동작한다.

## 1. UX 설계 5대 제1원칙 (UI/UX v2 Core Mandate)

1. **원고 시야 최우선 (Canvas-First, Chrome-Minimal)**: 창작 화면에서 UI 크롬은 결코 원고를 압도하지 않는다. 데스크톱 에디터는 **단일 44px 상단바 + 좌측 48px 도구 레일**로 캔버스 면적 82% 이상을 보장하고, 모바일 에디터는 상단 고정 배너 없이 **하단 한손 엄지 독(Thumb-Arc Dock)**으로 88% 이상의 작화 영역을 확보한다.
2. **페이지 이동 없는 공정 전환 (Stage-Lens over Page-Hop)**: 콘티, 3D 세트·포즈, 선화·채색, 식자·오디오, 검수·출고는 별도 사이트처럼 찢어지지 않고 **단일 문서 위 5단계 공정 스위처**와 슬라이드오버 서랍(레퍼런스 핀보드, Luna AI, 로컬 브리지)으로 연결된다.
3. **3초 첫 행동 (3-Second First Action)**: 로그인 홈(`/studio`)과 공개 정문(`/`) 모두 첫 화면 스크롤 없이 **방금 작업 1클릭 이어하기** 또는 **포맷 선택 즉시 캔버스 열기**에 도달해야 한다. 임시저장 복구·로그인 권유는 캔버스를 가리는 다단 배너 대신 상단 상태 칩 팝오버로 안내한다.
4. **점진적 노출 (3-Tier Progressive Disclosure)**:
   - `집중(focus)`: 캔버스 + 핵심 그리기·말풍선 레일 + 미니 상태 점만 남기는 몰입 모드(`` ` `` 단축키 즉시 토글).
   - `심플(simple, 신규·일반 기본값)`: 5단계 공정 스위처 + 9개 기본 도구 그룹 + 우측 선택 속성·레이어 통합 도킹 패널 노출, 저빈도 전문 제어는 접힘.
   - `프로(full)`: 3D 고급 DCC(Model/Sculpt/CAD), 다중 창 타일링(`⌘/Ctrl+Shift+M`), 브러시 커브·필터 전체 팩, 팀 공정 칸반까지 상시 노출.
5. **한 개념 한 이름·한 아이콘 (Single Vocabulary & Icon Ownership)**: 하나의 아이콘과 용어는 제품 전체에서 단 하나의 목적지만 가리킨다(`site-navigation.ts` 아이콘 단일 소유 규칙). 내부 구현 용어(`revision`, `lease`, `crdt`, `opfs`, `sqlite`, `leader tab`, `server lock` 등 `STUDIO_FORBIDDEN_DEFAULT_UI_TERMS`)는 기본 사용자 UI 라벨에 절대 노출하지 않는다.

## 2. 테마와 OKLCH 색상 체계

기본 정본 테마는 **스타라이트(Starlight)**이며, 사용자 선택으로 `잉크(Ink) · 페이퍼(Paper) · 그래파이트(Graphite) · 미드나이트(Midnight) · 세피아(Sepia) · 고대비(Contrast) · 오로라(Aurora) · 블로섬(Blossom) · 시스템 설정`을 지원한다. 사이트와 스튜디오 테마는 독립 선택 가능하며(스튜디오 기본값은 사이트 상속), 테마 토큰은 **오직 앱 UI 크롬에만 적용**되고 사용자의 원고 픽셀·브러시 색상·3D 렌더 출력·내보내기 결과물에는 일절 개입하지 않는다(`apps/web/src/shared/lib/theme-presets.ts`, `apps/web/src/app/styles/design-themes.css`).

> **브랜드 색상 두 축 분리 규칙 (혼용 절대 금지)**
> - **축 A — 기본 스타라이트(정본 기본값)**: 짙은 남색 중립 표면(`canvas` → `panel` → `card` → `raised`) + **청록(Cyan)·보라(Violet) 행동·활성 신호**. 모든 기본 화면, 마케팅, 에디터 기본 상태 및 신규 컴포넌트는 이 축의 의미 토큰(`--unified-*`, `--color-*`)만 사용한다.
> - **축 B — 잉크(Warm-Ink) 테마 전용**: 아래 persimmon(감/주홍) 악센트와 `hue ≈ 64–70` 따뜻한 중립 규칙은 사용자가 **잉크 테마를 명시적으로 선택했을 때만** 활성화된다. 기본 스타라이트 화면에 persimmon이나 갈색 틴트를 하드코딩해 섞지 않는다.

### 원시 색상 금지 및 OKLCH 의미 토큰 규약

컴포넌트에 `#000`, `#fff`, `bg-white`, `bg-red-500`, raw `rgb()/rgba()/hex`를 직접 적는 것을 엄격히 금지한다(`ux-audit` 및 ESLint 색상 게이트). 반드시 의미 토큰(`canvas`, `panel`, `card`, `raised`, `line`, `line-strong`, `fg`, `fg-2`, `fg-3`, `accent`, `accent-soft`, `on-accent`, `cool`, `good`, `warn`, `bad`)을 사용한다.

```text
[축 B — 잉크(Warm-Ink) 테마 선택 시 적용되는 OKLCH 기준값]
중립 표면 (따뜻한 잉크, hue 64–70 축 고정 · 중립 장식에 쿨블루 hue 230–270 금지)
--color-canvas      oklch(0.155 0.008 70)   페이지·작업대 바탕
--color-panel       oklch(0.185 0.009 68)   상단바·사이드 레일·바텀시트
--color-card        oklch(0.205 0.010 66)   단일 카드 표면
--color-raised      oklch(0.245 0.011 64)   호버·선택·칩 강조 표면
--color-line        oklch(0.305 0.012 64)   기본 1px 헤어라인 보더
--color-line-strong oklch(0.42  0.013 64)   포커스·활성 강조 보더
--color-fg          oklch(0.95  0.010 85)   주 본문 텍스트
--color-fg-2        oklch(0.74  0.012 78)   보조 설명·메타 텍스트
--color-fg-3        oklch(0.57  0.012 76)   비활성·캡션·힌트 텍스트

행동 악센트 (잉크 테마: persimmon / 기본 스타라이트: 테마 계약의 청록·보라 토큰으로 자동 매핑)
--color-accent      oklch(0.72 0.185 42)
--color-accent-2    oklch(0.66 0.200 38)
--color-accent-soft oklch(0.72 0.185 42 / 0.14)
--color-on-accent   oklch(0.20 0.02  60)

시맨틱 상태 신호 (의미 전달 전용, 색각 이상 대응을 위해 반드시 아이콘·문구 병기)
--color-cool        oklch(0.80 0.11 232)    정보·참조·3D 스냅 보조 신호
--color-good        oklch(0.80 0.15 150)    저장 완료·검수 통과·무료·상승
--color-warn        oklch(0.82 0.15 80)     임시본 확인·라이선스 주의·지연
--color-bad         oklch(0.66 0.20 25)     저장 오류·상업 충돌·하락·성인등급
```

- **18종 장르 스펙트럼**: `L 0.72 / C 0.15`를 고정하고 `hue`만 변주해 18개 장르를 색상환에 매핑한다(`apps/web/src/shared/lib/genre-color.ts` 단일 출처). 데이터 칩·스펙트럼 바·차트에서만 일관되게 사용한다.
- **표현·히어로 토큰**: 표지·히어로의 그라디언트·글로우·스크림은 `apps/web/src/app/styles/unified-theme-contract.css`의 `--spectacle-*`, `--domain-tint`, `--elevation-*`, `--surface-glass`, `--art-scrim`, `--art-on`만을 정본으로 쓰며, `forced-colors: active` 환경에서는 모든 장식용 글로우·그라디언트·그림자를 자동 제거한다(`spectacle-tokens.contract.test.ts`).

## 3. 타이포그래피 (활자와 스펙트럼)

역할별 3가지 서체 보이스를 명확히 구분한다.

- **데이터·인덱스 보이스 (`--font-display`: Space Grotesk)**: `ToonStudio` 워드마크, 랭킹 대형 순번, KPI·정산·프레임 수치, 섹션 대문자 영문 아이브로우 라벨 전용. 항상 `font-variant-numeric: tabular-nums`를 적용하고 디스플레이 자간은 `-0.02em`, 대문자 영문 라벨은 `+0.12em`을 유지한다.
- **한국어 UI·본문 보이스 (`--font-sans`: Pretendard)**: 모든 한국어 내비게이션, 에디터 도구·속성 라벨, 안내 문구, 본문 기본 패밀리. 줄바꿈 시 단어 쪼개짐 방지를 위해 주요 제목과 버튼에 `word-break: keep-all`을 기본 적용한다.
- **문학·인용 보이스 (`--font-serif`: Nanum Myeongjo)**: 웹소설 발췌, 에디토리얼 히어로 인용문, 깊은 리뷰 풀쿼트에서 `data-type-variant="editorial"`로 명시한 순간에만 절제해 사용한다.

**고정 디스플레이 스케일 계약 (`LAYOUT_TYPE_SCALE`)**:
- 페이지·히어로 제목(`--site-heading-size`): 기본 `2rem` → `≥640px 2.25rem` → `≥1024px 3.75rem`
- 섹션 제목(`--site-section-title-size`): 기본 `1.5rem` → `≥640px 1.875rem` → `≥1024px 2.25rem`
- 작업형 공통 제목(`LAYOUT_TYPE_SCALE.display.taskHeading` / `--site-task-heading-size`): `clamp(1.5rem, 4vw, 2rem)`. `SitePageHeader` 기본 크기에 적용하고, 소개용 `hero`와 읽기·편집기의 문서 제목은 각 역할의 규격을 유지한다. 테마 변경이 크기나 배치를 바꾸지 않는다.
- 본문 가독 폭은 `65–75ch`(`--site-reading-max: 48rem`)를 유지하며, 테마 전환이 글자 크기를 바꾸지 않는다(`typography-display-scale.contract.test.ts`).

## 4. 표면 깊이 · 시그니처 자산 · 컴포넌트 규격

### 깊이와 경계 (중첩 카드 금지)

그림자 남발 대신 **표면 명도 단계(`canvas → panel → card → raised`) + 1px `line` 보더 + 미세한 상단 inner highlight**로 계층을 나눈다. **카드 안에 또 다른 테두리 카드를 중첩하는 것(Nested Cards)을 금지**한다 — 카드 내부 구획은 여백, 헤어라인 구분선(`border-t border-line/60`), 또는 평면 칩 영역으로만 분리한다. 배경에는 아주 옅은 대장(臺帳) 해어라인 그리드 텍스처를 선택적으로 사용한다.

### 6대 브랜드 시그니처 요소

1. **인덱스 넘버럴**: 랭킹·단계 표시의 대형 tabular Space Grotesk 숫자 + 베이스라인 헤어라인.
2. **스펙트럼 바**: 평점 분포·장르 믹스·A/B 실험 퍼널을 나타내는 다중 스톱 가로 바.
3. **장르 스펙트럼 칩**: 플랫 그레이 대신 장르 고유 hue가 틴트된 토글 가능 칩.
4. **"어디서 봐" 라우터**: 플랫폼 브랜드 도트 + 가격·이용 방식(무료/기다무/단행본) + 스냅샷 기준일을 한눈에 보여주는 비교 신호판.
5. **어댑테이션 & 세계관 그래프**: `원작 웹소설 → 웹툰 → 영상화/OST/캐릭터챗` 연결을 보여주는 노드 다이어그램.
6. **타이포그래픽 커버**: 썸네일 미지정 시 깨진 아이콘 대신 장르 그라디언트와 디스플레이 타이포로 조판되는 에디토리얼 포스터 커버.

### 필수 컴포넌트 및 상태 계약 (`기본 / 호버 / 포커스 / 활성 / 비활성+사유 / 스켈레톤 로딩 / 오류`)

- **버튼**: `solid`(현재 상태의 주 행동) / `outline`(`ghost`, 보조 행동) / `quiet`(아이콘·텍스트 도구). 작업이 있으면 이어하기, 없으면 새 작업을 우선한다. 공통 반경은 `--layout-control-radius`의 `0.625rem`을 `--site-control-radius`로 참조하고, 포커스 링은 `2px accent` 오프셋이다. 색·호버는 의미 토큰을 사용하며 테마와 무관한 색상 글로우를 넣지 않는다. 축소 모션 설정에서는 버튼 이동·크기 애니메이션을 끈다. 비활성(`disabled`) 항목은 특히 에디터 메뉴·3D 패널에서 **왜 비활성인지 한 줄 사유(`unavailableReason`)**를 툴팁·보조 문구로 함께 제공한다.
- **스위치/토글 단일 기하 규칙**: 독립 토글은 반드시 `@/shared/components/ui/switch`의 `Switch`(`role="switch"` + `aria-checked`), 행 내부 이진 표시는 `SwitchIndicator`를 재사용하며 개별 화면에서 임의 thumb/track을 다시 그리지 않는다. 기준 규격은 `44×24px` 트랙, `20px` thumb, 명시적 `left/top 2px` 기준점, ON 이동 `20px`, 독립 클릭 영역 최소 `44×44px`이다.
- **로딩과 빈 상태 (스피너 금지)**: 회전 스피너 대신 실제 콘텐츠 골격과 동일한 **스켈레톤(`RouteSilhouetteSkeleton`, `LoadingState`)**만 사용한다. 빈 상태(Empty State)는 단순 "데이터 없음"이 아니라 **다음 첫 행동 버튼(예: `새 웹툰 시작`, `내 파일 불러오기`)을 가르치는 런처**로 설계한다.
- **통합 커맨드 팔레트 (`⌘K` / 에디터 `F1`)**: 작품·작가·소재·페이지 이동은 `⌘K`, 에디터 내부의 모든 숨겨진 고급 명령·브러시·필터·단축키·타 프로그램 용어 매핑(클립스튜디오·포토샵·스케치업 용어 검색)은 `F1` 명령 검색으로 언제든 1초 만에 호출된다.

## 5. 레이아웃 치수 계약 및 전수 화면 아키텍처

폭·거터·레일·크롬 높이는 `apps/web/src/app/styles/sitewide-visual-ux.css`의 `--layout-*`와 `apps/web/src/shared/components/layout/layout-tokens.ts`의 `LAYOUT_DIMENSIONS`가 단일 출처다(`layout-token-contract.contract.test.ts`).

### 공통 치수 및 반응형 브레이크포인트

- **컨테이너 4단 폭**: `reading` `48rem` · `standard` `82.5rem (1320px)` · `app` `100rem (1600px, 데이터·칸반 밀집 화면)` · `full` `100% (2D/3D 에디터 및 가상 스튜디오)`.
- **정렬 거터 (`--layout-gutter`)**: 기본 `16px` → `≥640px 24px` → `≥1280px 32px` (전역 헤더·본문·푸터 좌우 정렬선 엄격 일치).
- **표준 브레이크포인트**: `640px · 768px · 1024px · 1280px · 1536px` (및 `표준-1` max-width 짝)만 사용한다. 좁은 화면에서 다열 데이터 표는 글자 단위 줄바꿈으로 무너지지 않도록 구조적 카드 리스트로 전환한다.
- **표지·소재 그리드 (`LAYOUT_COVER_GRID`)**: `2열` → `≥640px 3열` → `≥1024px 4열` → `≥1280px 5열`, 간격 `12px`(`≥640px 16px`), 기본 표지 비율 `3:4`.
- **크롬 높이 계약**: 공개·일반 전역 헤더 `60px`, 작업공간 상단바 `64px`, 데스크톱 행 내비 레일 `216px`(`≥1024px`), 축소 아이콘 레일 `96px`, **스튜디오 에디터 전용 단일 상단바 `44px` · 좌측 도구 레일 `48px`**(`[data-studio-editor="true"]`).

### 화면군별 표준 레이아웃 패턴 (전수 적용 기준)

1. **통합 크리에이터 홈 (`/studio`)**: 상단 2열 Bento(좌: 최근 원고 1클릭 이어하기 + 저장 안전 배지 / 우: 4대 포맷 1초 스타터), 하단 프로젝트 상태 필터 그리드(`전체 · 연재 중 · 검수 완료 · 임시 작업`) 및 레퍼런스 핀보드 스트립.
2. **2D 웹툰 에디터 (`/studio/p/:id/d/:docId`)**: 상단 `44px` 단일 바(중앙 5단계 공정 스위처 + 우측 저장 상태 점 + `출고·게시` CTA), 좌측 `48px` 9그룹 도구 레일(필요 시 참 바 칩 레일 인접 부착), 중앙 `82%+` 세로 원고 캔버스(모바일 가독 안전선 오버레이 지원), 우측 `280–320px` 선택 속성·레이어·페이지 스트립 통합 도킹 패널.
3. **3D 세트·캐릭터 스튜디오 (`?workspace=3d`, `/studio/bg3d`)**: 상단 4단계 모드 바(`공간 조립 Build · 캐릭터 포즈 Pose · 카메라 컷 Shot · 선화 브리지 Live Ink`), 좌측 `220px` 장면 계층(Outliner) 및 컷 카메라 목록, 중앙 WebGPU 뷰포트(실시간 2D 선화 추출 Split-Wipe 내장), 하단 접이식 **에셋 쉘프(Asset Shelf)**, 우측 `280px` 렌즈·가림 벽 자동 투명화·선 두께 인스펙터 및 `원고 컷에 바로 굽기` CTA.
4. **모바일 한손 에디터 (`<768px`)**: 상단 고정 배너 0개, 좌상단 미니 알약(`안전 저장됨`)과 우상단 `출고` 버튼만 플로팅, 하단 엄지 반경에 맞춘 **Thumb-Arc 플로팅 독**(6대 주 도구 + 레이어 바텀시트 핸들, 모든 터치 타깃 `≥44px`, 좌/우 주사용 손 전환 지원).
5. **탐색 슈퍼 허브 (`/discover`, `/title/:slug`)**: 상단 패싯 탭(`맞춤 추천 · 장르/태그 · 통합 랭킹 · 요일 캘린더 · 숏컷`) 단일 전환, 작품 상세 우측 상단에 `"어디서 봐"` 플랫폼·가격 비교 카드와 하단 `이 연출 템플릿으로 3컷 시작` 창작 연결 CTA 배치.
6. **통합 리서치 핀보드 (`/research`) & 실습형 배우기 (`/learn`, `/studio/manual`)**: 28개 공공·박물관 아카이브를 단일 검색창과 용도 필터 칩으로 조회해 `원고 참고창에 꽂기`로 직결하고, 학습·매뉴얼 화면은 좌측 단계 가이드 + 우측 실습 프리뷰/단축키 HUD 분할 구성을 따른다.
7. **소재 마켓 (`/market`) & 작가 성장·수익 허브 (`/studio/growth`, `/creator/revenue`)**: 마켓 목록·상세 드로어 내부에 내 원고 규격 및 Rights BOM 상업 라이선스 **인라인 Fit 배지**를 즉시 표시하고, 수익·정산·멤버십·썸네일 A/B 실험 퍼널을 단일 KPI + 스펙트럼 차트 대시보드로 통합한다.
8. **프로젝트·팀 프로덕션 (`/studio/p/:id/*`) & 운영자 콘솔 (`/admin/*`)**: 좌측 `216px` 행 레일 내비게이션을 공유한다. 프로젝트는 6개 기본 탭에서 팀원 합류 시 공정 칸반·인계(`Handoff`) 뷰를 확장하고, Admin 콘솔은 16개 운영 기능을 4대 아코디언 그룹으로 묶어 제공한다.

## 6. 모션과 마이크로 인터랙션

- **속도와 곡선**: 모든 UI 상태 전환은 `150–250ms`, `ease-out-expo`(`cubic-bezier(0.16, 1, 0.3, 1)`)를 기본으로 한다. 첫 페이지 진입을 늦추는 장식용 로드 안무(Page-load choreography)는 금지한다.
- **허용 마이크로 모션**: 탭 활성 밑줄 이동, 랭킹·지표 수치 카운트업, 스펙트럼 바 채움, 표지 카드 미세 호버 리프트, 동일 문서 내 뷰 전환(`View Transition`).
- **모션 감소 존중**: `prefers-reduced-motion: reduce` 활성 시 모든 이동·확대 전환을 즉시 상태 변경(`transition: none`)으로 대체하고 반복 재생 미디어는 정지 상태로 시작한다.
