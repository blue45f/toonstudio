# ToonStudio 전수 UI/UX 고도화 시안 및 통합 개편 설계서 (v2 Blueprint)

- 문서 상태: **target** (기준일: `2026-11-11`, 현재 구현 `current`와의 경계 및 무손실 전환 규칙 명시)
- 상위 정본: 제품 범위와 원칙은 [PRODUCT.md](../../PRODUCT.md), 시각·토큰·레이아웃 계약은 [DESIGN.md](../../DESIGN.md), 아키텍처 경계는 [ARCHITECTURE.md](../../ARCHITECTURE.md)를 따른다.

## 1. 개편 배경 및 전수 감사 요약

모노레포 산하 **7개 애플리케이션(`web`, `api`, `admin-web`, `brush-lab`, `character-lab`, `mobile`, `desktop-sync`), 웹 라우트 22개 그룹(약 195개 경로·별칭), 스튜디오 문서 작업공간 13종, 에디터 메인 메뉴 18개 그룹, 3D 하이브리드 DCC 9개 모드, 운영자 콘솔 16개 탭**을 전수 분석한 결과 다음 4가지 핵심 사용성 병목이 확인되었다.

1. **진입 관문 중복(7개 홈·시작 화면 충돌)**: `/`(사이트 홈), `/home`(개인 작업 홈), `/hub`(둘러보기), `/create`(시작 시트), `/studio`(크리에이터 로비·내 작업), `/studio/new`(생성 폼), `/studio/p/:projectId/overview`(프로젝트 홈)가 중첩되어 첫 캔버스 도달까지 3~4회 이상의 페이지 이동이 발생한다.
2. **에디터 상단 크롬 과밀(4~5단 적층)**: 에디터 진입 시 사이트 헤더, 다중 창·작업공간 바(`StudioDocumentWindowHub`), 18개 그룹 메인 메뉴·보조 액션 줄, 복구·로그인 안내 배너, 2줄 옵션 바가 세로 원고 캔버스 상단 180~220px을 점유한다. 또한 `고급 도구 펼치기` 토글이 도구 막대용과 메뉴 내부 섹션용 두 곳에 같은 이름으로 존재해 인지 혼선을 유발한다.
3. **페이지 단절형 제작 도구 배치**: 스토리(`/story-lab`), 캐릭터(`/shaper`, `/studio/poser`), 3D 배경(`/studio/bg3d`), 리서치(`/research/*` 28개 기관별 라우트), 출고(`/studio/publish`, `/publish`, `/studio/p/:id/export`)가 모두 개별 페이지로 분리되어 원고 작화 흐름이 끊긴다.
4. **이원화된 관리·개인 표면**: 개인 프로젝트 셸(`/studio/p/:id/*` 8탭)과 팀 프로덕션 셸(`/production/projects/:id/*` 14탭), 개인 허브(`/my`)와 계정 프로필(`/me`), 마켓 탐색(`/market`)과 호환성 실험실(`/market/fit-lab`)이 각각 나뉘어 있다.

## 2. 12대 전수 화면군 UI/UX 디자인 시안 체계

단 한 개의 누락된 화면도 없도록 전체 195개 이상 경로와 서브 앱을 **12개 표준 화면군(시안 A ~ 시안 L)**으로 재설계한다. 모든 시안은 [DESIGN.md](../../DESIGN.md) 축 A(스타라이트 남색 표면 + 청록·보라 행동 신호, OKLCH 의미 토큰, 중첩 카드 금지, `44px` 터치 타깃, 스켈레톤 로딩)를 준수한다.

| 시안 ID | 대상 화면군 및 포괄 라우트 (전수) | 핵심 UI/UX 개편 설계 요지 |
| :--- | :--- | :--- |
| **시안 A** | **통합 크리에이터 홈 & 1초 시작 허브**<br>`/studio`, `/home`, `/create`, `/studio/new`, `/studio/import`, `/studio/templates` | 상단 2열 Bento 구성: 좌측 **[방금 작업 1클릭 이어하기]**(마지막 편집 컷·오프라인 안전 저장 배지 표시), 우측 **[1초 새 작품 포맷 타일 4종]**(세로 웹툰·4컷툰·3D 세트/캐릭터·PSD/CLIP 가져오기). 포맷 클릭 시 중간 생성 양식 페이지 없이 기본 규격 캔버스를 즉시 오픈하고 제목은 에디터 상단에서 인라인 편집 |
| **시안 B** | **단일 44px 바 2D 웹툰 에디터**<br>`/studio/p/:id/d/:docId`, `/studio/draft/:id`, `/studio/canvas`, `/studio/comic` | 전역 `SiteHeader` 비노출 및 상단 크롬 **44px 단일 바** 압축. 중앙 **5단계 공정 스위처(`1. 콘티 · 2. 3D/배경 · 3. 작화/채색 · 4. 식자 · 5. 검수/출고`)**, 좌측 `48px` 9그룹 코어 툴레일(+ 참 바 칩 레일), 중앙 `82%+` 원고 캔버스, 우측 `290px` 선택 속성·레이어·미니맵 분할 도킹 패널. 복구·로그인 배너는 우측 상단 상태칩 팝오버로 전환 |
| **시안 C** | **통합 3D 세트·캐릭터·선화 스튜디오**<br>`/studio/bg3d`, `/studio/poser`, `/shaper`, `/studio/lift3d`, `/studio/character-convert`, `apps/character-lab` | Blender 4.x 에셋 쉘프 UX 반영: 상단 **`공간 조립(Build) → 캐릭터 포즈(Pose) → 카메라 컷(Shot) → 선화 브리지(Live Ink)`** 4단계 모드 바, 좌측 `220px` 계층·컷 카메라 리스트, 중앙 WebGPU 뷰포트 내 **실시간 2D 선화 추출 반반 비교 슬라이더(Split-Wipe)**, 하단 접이식 **Asset Shelf**(방·가구·포즈·조명 드래그 배치), 우측 가림 벽 자동 투명화·선 두께 조정 및 `원고 컷에 바로 굽기` |
| **시안 D** | **모바일 한손 Thumb-Arc 에디터 & 원스톱 출고 센터**<br>`apps/mobile`, 모바일 웹 에디터, `/studio/publish`, `/publish`, `/studio/p/:id/export`, `StudioReviewExport` | • **모바일 에디터**: 상단 배너 완전 제거(플로팅 저장 점 + `출고` 버튼만 유지), 하단 곡선형 **Thumb-Arc 플로팅 독**(브러시·지우개·말풍선·컷 추가·레이어 시트·실행취소, 좌/우 손잡이 전환)<br>• **원스톱 출고 프리플라이트**: 모바일 실제 폭 스크롤 리듬 미리보기 + 말풍선 잘림 검사 + Rights BOM 상업 라이선스 검증 + 플랫폼별(네이버·카카오·글로벌·승인본 ZIP) 원클릭 분할 출력 통합 |
| **시안 E** | **공개 정문 & 탐색(Spectrum) 슈퍼 허브 · 작품 상세**<br>`/`, `/discover`, `/explore`, `/search`, `/recommend`, `/ranking`, `/calendar`, `/tags`, `/compare`, `/random`, `/title/:slug`, `/title/:slug/read/:ep`, `/author/:name`, `/authors`, `/news`, `/guide`, `/insights`, `/cuts/*` | • **탐색 슈퍼 허브(`/discover`)**: 6개 분산 탐색 라우트를 상단 패싯 탭(`맞춤 추천 · 장르/태그 · 통합 랭킹 · 요일 캘린더 · 숏컷 피드`)으로 단일 화면 전환<br>• **작품 상세(`/title/:slug`)**: 우측 상단에 `"어디서 봐"` 플랫폼·가격·무료회차 신호판(스냅샷 출처 명시)과 원작→웹툰→영상화 **어댑테이션 그래프** 배치, 하단 **`이 장르·연출 템플릿으로 3컷 시작하기`** 창작 브리지 버튼 연결 |
| **시안 F** | **통합 프로젝트 워크스페이스 & 팀 프로덕션 칸반**<br>`/studio/p/:projectId/*`, `/production`, `/production/projects/:projectId/*`, `/production/review/*`, `/production/pinned-review`, `/share/version/:token`, `/team/*` | 개인 프로젝트(8탭)와 팀 프로덕션(14탭)을 단일 좌측 `216px` 레일 셸로 통합: 기본 **6탭(`홈 개요 · 기획/스토리바이블 · 회차/공정 칸반 · 소재/권리BOM · 비교검수/피드백 · 출고/배포`)** 제공, 팀원 2인 이상 협업 시 회차별 5열 공정 칸반(`콘티 → 3D세트 → 선화 → 채색 → 식자/승인`)과 직군 배지·버전 Diff·공정 인계(`Handoff`) 패널 활성화 |
| **시안 G** | **소재 마켓(인라인 Fit) & 작가 수익·성장 통합 스튜디오**<br>`/market/*`(14개 경로), `/asset-points`, `/creator/revenue`, `/creator/early-access`, `/creator/membership`, `/memberships`, `/studio/analytics`, `/studio/growth`, `/pricing`, `/membership` | • **마켓 구매 동선 단축**: 별도 Fit Lab 이동 없이 소재 목록·상세 슬라이드 드로어 안에 **`내 원고 호환성 Fit(WebGPU 프레임·규격)`** 및 **`Rights BOM 상업 연재 사용권 녹색 배지`** 즉시 표시 + `내 참 바에 바로 고정` 제공<br>• **작가 성장·수익 통합**: 정산 수익·후원 멤버십·얼리액세스 전환율 KPI와 썸네일·제목 A/B 클릭 퍼널 스펙트럼 차트를 단일 화면에 집약 |
| **시안 H** | **28개 기관 통합 레퍼런스 핀보드 & 실습형 배우기·매뉴얼**<br>`/research/*`(28개 경로), `/references`, `/story-lab`, `/learn/*`, `/learn/recipes`, `/studio/manual/*`, `/ecosystem/*`, `/help` | • **통합 리서치 핀보드(`/research`)**: 국가유산청·NASA·Rijksmuseum·V&A·PolyHaven·ambientCG 등 28개 개별 기관 페이지를 **단일 통합 검색 + 용도 필터(`시대/고증 · 건축/3D · 복식/소품 · 조명/날씨 · CC0 상업무료`)**로 묶고 에디터 내부 참고창에 원클릭 핀 고정<br>• **실습형 학습(`/learn`, `/studio/manual`)**: 좌측 단계별 미션 가이드 + 우측 인앱 미니 실습 캔버스 및 실시간 단축키 HUD(`T · B · F1`) 2단 분할 |
| **시안 I** | **창작 커뮤니티 · 쇼케이스 · 타임랩스 · 구인 & 캐릭터챗**<br>`/showcase/*`, `/community/*`, `/pencafe/:name`, `/reviews`, `/collaborate/*`, `/opportunities`, `/events/*`, `/newsletter/*`, `/character-chat/*` | • **소셜 4탭 일원화**: `작품 갤러리 & 챌린지(/showcase)` · `깊은 리뷰 & 팬카페(/community)` · `작화 타임랩스` · `팀원 구인·의뢰 & 공모전(/collaborate + /opportunities)`<br>• **세계관 캐릭터 챗(`/character-chat`)**: 공식 스토리바이블 범위 배지와 함께 독자가 캐릭터와 대화한 뒤 원작 회차로 즉시 유입되는 양방향 카드 구성 |
| **시안 J** | **전문 크리에이터 보조 도구 스위트 (브러시·오디오·AI·브리지)**<br>`/studio/assets/brushes/*`, `apps/brush-lab`, `/studio/assets/audio`, `/studio/motion-webtoon`, `/studio/generate`, `/studio/ai-lab`, `/studio/toolchain`, `/studio/engines`, `/studio/jobs`, `/studio/pdf-workbench` | • **브러시 스튜디오 V6**: 실시간 자연매체 시필 패드 + 필압/기울기 커브 + ABR/MYB/KPP 가져오기 통합<br>• **오디오·모션 웹툰**: 세로 컷 키프레임에 동기화된 장면 BGM·애니 OST 파형 타임라인과 권리 확인 원클릭 연결<br>• **Luna AI & ToonBridge 드로어**: 원고 자동 덮어쓰기 없는 비파괴 초안 카드 + 로컬 실행기(`ToonBridge`) 연결 상태 점·작업 큐·PDF 페이지 정리 워크벤치 통합 |
| **시안 K** | **통합 내 공간 · AI 키 볼트 · ⌘K 커맨드 디렉터리**<br>`/my`, `/me`, `/u/:userId`, `/creators`, `/library`, `/messages/*`, `/notifications`, `/settings/*`, `/settings/integrations`, `/settings/api-keys`, `/automation`, `/developers`, `/sitemap`, `/fortune/*`, `/play`, `/now`, `/install`, `/offline` | • **`/my` + `/me` + `/settings` 통합 허브**: 좌측 레일 4축(`내 서재·클라우드 소재함` / `메시지·알림` / `직군 맞춤 워크스페이스` / `통합 AI 키 볼트 & 오프라인 저장소 관리`)으로 단순화<br>• **`⌘K` & 전체 메뉴(`/sitemap`)**: 5대 핵심 여정 그룹을 상단에 배치하고 `쉬어가기(/fortune 운세 · /play 놀이터 · /now 오늘의 영감)`를 하단 독립 휴식 행으로 깔끔히 분리 |
| **시안 L** | **운영자 Admin 4대 그룹 콘솔 & 가상 스튜디오 · Labs 실험실**<br>`/admin/*`(16개 경로), `apps/admin-web`, `/studio/space`, `/studio/p/:id/space`, `/studio/immersive`, `/read/spatial`, `/studio/anchor-lab`, `/studio/branching-cuttoon`, `/about/*`, `/ir/*`, `/business-plan`, `/promo-library`, `/status` | • **Admin 콘솔 v2**: 16개 평면 탭을 **4대 아코디언 도메인(`1. 실시간 지표·트래픽` / `2. 회원·커뮤니티·신고` / `3. 요금·정산·창작지원` / `4. 운영모드·보안·감사로그`)**으로 재편하고 Edge Origin Auth 상태를 상단 배지로 고정<br>• **가상 스튜디오 & Labs**: 아바타 협업 타운(`/studio/space`)과 실험 도구(`anchor-lab`, `branching-cuttoon`)에 명확한 `LABS` 배지를 부여해 핵심 마감 동선과 혼동되지 않게 분리 |

## 3. 메뉴 · 라우팅 · 상태 정합성 상세 설계

### 3-1. 전역 헤더(GNB) 및 모바일 하단 탭 규격

- **데스크톱 전역 헤더 (`60px`, 비에디터 화면 전용)**:
  - 좌측: `ToonStudio` 브랜드 마크 + 워드마크 (`/`)
  - 중앙 1차 메뉴 (최대 4~5개): `스튜디오(/studio)` · `탐색(/discover)` · `소재 마켓(/market)` · `커뮤니티(/community)` (`배우기(/learn)`와 `전체 메뉴(/sitemap)`는 스튜디오·탐색 하위 및 우측 그리드 런처로 즉시 도달)
  - 우측 유틸리티: `⌘K 통합 검색` 필 바 · `+ 새 작품` 즉시 포맷 런처 · 알림 벨 · 프로필/내 공간 드롭다운
- **모바일 하단 탭 바 (`60px + safe-area-inset-bottom`, 비에디터 화면 전용)**:
  - `홈/스튜디오` · `탐색` · `+ 시작` · `마켓` · `전체/내공간` 5탭 고정 (에디터·리더·가상스튜디오 등 몰입 경로 `isImmersiveMobileRoute` 진입 시 자동 숨김)

### 3-2. 에디터 상단 크롬 및 메뉴 그룹 통폐합 규격

1. **상단 고정 크롬 단일화 (`44px`)**:
   - 좌측 영역: `← 내 작업(/studio)` 복귀 버튼 · 인라인 편집 가능한 `작품명 · 회차명` · 다중 창 배지(`⌘⇧M`)
   - 중앙 영역: **5단계 공정 세그먼트 피일**
     - `1. 콘티` (`storyboard` / `writer-room` / 컷 프레임 도구 활성화)
     - `2. 3D·배경` (`3d` / `bg3d` / `poser` / 하단 Asset Shelf 활성화)
     - `3. 작화·채색` (`draw` / `image` / 브러시·채우기·보정 활성화 — 기본 진입 단계)
     - `4. 식자` (`comic` / 말풍선·대사 일괄 편집·현지화 QA·오디오 BGM 활성화)
     - `5. 검수·출고` (`review` / 모바일 스크롤 프리뷰·댓글·원스톱 출고 프리플라이트 활성화)
   - 우측 영역: 4가지 사용자 친화 저장 상태 점(`저장됨` / `저장 중` / `오프라인에서도 안전` / `확인할 내용이 있어요` — 클릭 시 체크포인트·복구 팝오버 오픈) · 밀도 토글(`집중 / 심플 / 프로`) · 주 행동 CTA `출고·게시`
2. **18개 메인 메뉴 그룹 → 7개 표준 메뉴 매핑**:
   - `파일(File)` ← `file`
   - `편집(Edit)` ← `edit` + `select` + `transform`
   - `캔버스·레이어(Layer)` ← `canvas` + `layer` + `filter` + `vector`
   - `웹툰·식자(Webtoon)` ← `comic` + `text` + `brush`(프리셋·팩 관리만 유지, 펜/지우개 단순 선택 중복 행 제거)
   - `3D·모션(3D & Motion)` ← `3d` + `animation`
   - `협업·AI(Co-Work)` ← `collaboration` + `ai` + 로컬 `ToonBridge` 상태
   - `보기·도움말(View & Help)` ← `view` + `window` + `help`
3. **'고급 도구 펼치기' 명칭 충돌 해소**:
   - 상단/툴바 영역 토글은 `프로 도구 표시`로, 개별 메뉴 내부 접힘 행은 `전문 명령 더보기 (N개)`로 라벨을 분리해 스크린리더(`WCAG 2.5.3`)와 시각 인지 혼동을 동시에 제거한다.

### 3-3. URL 무파괴 호환(Zero-Broken-Link) 원칙

- 기존에 등록된 약 195개 모든 라우트와 별칭(`studio-route-manifest.ts`, `studio-route-registry.ts`, `legacy.routes.tsx`)은 **단 하나도 404로 삭제하지 않는다**.
- 통합되는 하위 경로는 정본 통합 화면의 초기 탭·필터·드로어 상태로 자동 매핑한다:
  - 예: `/research/open-data/kheritage` 진입 → 통합 `/research` 핀보드가 열리며 `source=kheritage` 필터가 자동 선택됨.
  - 예: `/market/fit-lab` 진입 → `/market` 내 내 원고 호환성 Fit 비교 드로어가 즉시 열린 상태로 진입됨.
  - 예: `/production/projects/:id/schedule` 진입 → 통합 프로젝트 셸의 `회차·공정 칸반` 탭 일정 뷰로 연결됨.

## 4. 단계별 구현 로드맵 및 검증 게이트

코드 이행 시 아키텍처 래칫(`validate:architecture`), 파일 크기 상한(`check:source-file-size`), 스튜디오 초기 번들 그래프(`check:studio-eager-graph`), 접근성 스모크(`test:a11y`)를 매 단계 통과하도록 4개 웨이브로 나누어 실행한다.

| 웨이브 | 구현 범위 | 핵심 수정 대상 모듈 | 필수 통과 검증 명령 |
| :--- | :--- | :--- | :--- |
| **Wave 1: 정문 통합 & 비차단 게스트 셸** | • 초기 세션·헬스 체크 3초 비차단 타임아웃 폴백<br>• `/studio` 상단 Bento(1클릭 이어하기 + 1초 포맷 스타터) 및 `/create`·`/home` 동선 수렴 | `apps/web/src/domains/auth/`, `StudioCreatorLobby.tsx`, `CreateStartContinueSection.tsx`, `site-header.tsx` | `pnpm harness:verify`<br>`pnpm test:a11y` |
| **Wave 2: 에디터 44px 단일 바 & 7대 메뉴** | • 에디터 진입 시 `SiteHeader` 숨김 및 44px 단일 바 + 5단계 공정 스위처 적용<br>• 복구·로그인 고정 배너의 상단 상태칩 팝오버 전환<br>• 18개 메뉴의 7대 표준 메뉴 뷰 프로젝션 | `StudioDocumentWindowHub.tsx`, `StudioMenubarContent.tsx`, `studio-menubar-catalog.ts`, `StudioInspectorNavigator.tsx` | `pnpm run verify:studio-menus`<br>`pnpm run verify:studio-canvas-chrome`<br>`pnpm run test:a11y:editor` |
| **Wave 3: 통합 3D 에셋 쉘프 & 리서치 핀보드** | • 3D 워크스페이스 4단계 모드 바 + 하단 접이식 Asset Shelf + 실시간 선화 Split-Wipe<br>• 28개 `/research/*` 어댑터 통합 검색 + 에디터 참고창 핀 고정 브리지 | `StudioBg3dProfessionalWorkspace.tsx`, `domains/creator-resources/`, `StudioAssetMenuPanel.tsx` | `pnpm run verify:studio-3d-professional-foundation`<br>`pnpm run verify:studio-3d-web-authoring` |
| **Wave 4: 원스톱 출고 · 프로젝트 단일화 · Admin 4그룹** | • 모바일 가독성·Rights BOM·플랫폼 분할 통합 출고 화면<br>• 개인/팀 프로젝트 셸 점진 확장 통합 및 마켓 인라인 Fit 배지<br>• Admin 16탭 → 4대 도메인 아코디언 내비 재편 | `StudioReviewExport.tsx`, `StudioPublishRoute.tsx`, `domains/production/`, `domains/market/`, `AdminShell.tsx` | `pnpm run verify:studio-manuscript-delivery-acceptance`<br>`pnpm run validate:architecture`<br>`pnpm run check:studio-bundle` |
