# ToonStudio 기술 자료 12개 페이지 중복 분석 및 4-트랙 통합 로드맵

- **작성일**: `2026-11-22`
- **문서 상태**:
  - **1단계 (내비게이션·읽기 코스 통합)**: `current` (브랜치 `feat/technology-hub-consolidation-and-ux` 구현·검증 완료)
  - **2단계 (URL 통합·영구 리다이렉트)**: `target` (선행 계약 테스트 이관 및 소유자 승인 후 착수)
- **관련 소스**:
  - [TechnologyPage.tsx](../../apps/web/src/domains/legal/TechnologyPage.tsx)
  - [engineering-hub-tracks.ts](../../apps/web/src/domains/legal/technology/engineering-hub-tracks.ts)
  - [EngineeringTrackHub.tsx](../../apps/web/src/domains/legal/technology/EngineeringTrackHub.tsx)
  - [EngineeringReadingRoutes.tsx](../../apps/web/src/domains/legal/technology/EngineeringReadingRoutes.tsx)
  - [EngineeringStoryUi.tsx](../../apps/web/src/domains/legal/technology/EngineeringStoryUi.tsx)
  - [EngineeringArchitectureNav.tsx](../../apps/web/src/domains/legal/technology/EngineeringArchitectureNav.tsx)
  - [EngineeringHubStatusStrip.tsx](../../apps/web/src/domains/legal/technology/EngineeringHubStatusStrip.tsx)
  - [engineering-tech-pages.ts](../../apps/web/src/domains/legal/technology/engineering-tech-pages.ts)

---

## 1. 현황 실측 인벤토리 (`2026-11-22` 기준)

`apps/web/src/domains/legal/technology/`의 `Engineering*Page.tsx` 12개 페이지와 허브(`/about/technology`)를 실측한 결과, 총 **13개 기술 경로**, 고정 읽기 시간 합계 **227분(약 3시간 47분)**, 발표 덱 4트랙 **668장**(`talk` 28장 · `brief` 11장 · `lecture` 42장 · `atlas` 587장)으로 분화되어 있다.

| 페이지 | 경로 | 줄 수 | 핵심 실측 분량 | 읽기·발표 시간 | 기존 묶음 | 4-트랙 배정 (1단계) |
| --- | --- | ---: | --- | ---: | --- | --- |
| 허브 (`TechnologyPage`) | `/about/technology` | 445 | 4-트랙 허브·시작 카드·읽는 길·흐름 도식·5단계·스택·도감 미리보기·40챕터 목록 | 진입 허브 | - | **통합 허브** |
| 제작 스토리 (`Story`) | `/about/technology/story` | 324 | 40개 챕터 (`problem`·`decision`·`userValue`·`tradeoff`·`reuseSteps`) | 51분 | 핵심 (1단계) | **트랙 1. 한눈에 보기** |
| 기술 영상 (`Videos`) | `/about/technology/videos` | 395 | 12장면 스토리보드 · 4개 영상 포맷 · 4개 영상 구성안 · 8:24 MP4 임베드 | 미측정 | 발표 | **트랙 1. 한눈에 보기** |
| 아키텍처 (`Architecture`) | `/about/technology/architecture` | 139 | 12개 구간 도식 · 도감 링크 60건 · 스토리 링크 18건 | 43분 | 큰 그림 | **트랙 2. 아키텍처 & 실무 코드** |
| 기술 도감 (`Atlas`) | `/about/technology/atlas` | 190 | 기술 카드 154장 · 비교 지도 5종 429행 (`free-tier` 26, `open-source` 44, `open-api` 43, `competitors` 292, `ai-dev` 24) | 미측정 | 자료 | **트랙 2. 아키텍처 & 실무 코드** |
| 적용 가이드 (`Guides`) | `/about/technology/guides` | 288 | 재사용 청사진 6개(`engineering-playbook-content.ts` 교차 import) · 가이드 30개 | 27분 | 핵심 (3단계) | **트랙 2. 아키텍처 & 실무 코드** |
| 플레이북 (`Playbook`) | `/about/technology/playbook` | 424 | 원칙 5개 · 결정 10선 · 벤치마크군 5개 · AI 워크벤치 6계층 · 이동 안내 3카드 | 25분 | 핵심 (2단계) | **트랙 2. 아키텍처 & 실무 코드** |
| 발표 모드 (`Deck`) | `/about/technology/deck` | 663 | 4트랙 668슬라이드 · 발표자 창 · 오프라인 HTML 내보내기 · 세미나 자료·무료 AI 가이드 | 30분(기본) | 발표 (5단계) | **트랙 3. 기술 세미나 발표** |
| 심화 노트 (`FieldNotes`) | `/about/technology/field-notes` | 542 | 심화 노트 12건 · Open API 8개 · 장애 기록 19건 | 32분 | 핵심 (4단계) | **트랙 3. 기술 세미나 발표** |
| 라이브러리 (`Libraries`) | `/about/technology/libraries` | 146 | 8영역 54개 카드 · 도감 링크 60건 · 오픈소스 지도 35행 연결 | 49분 | 큰 그림 | **트랙 4. 신뢰·라이브러리·용어** |
| 라이선스 (`Licenses`) | `/about/technology/licenses` | 438 | 역할 지도 3카드 · 권리 계층 4종 · 라이브러리 115종 · 모델 6개 | 미측정 | 자료 | **트랙 4. 신뢰·라이브러리·용어** |
| 용어집 (`Glossary`) | `/about/technology/glossary` | 291 | 용어 168개 · 10개 분야 · 도감 링크 102건 | 미측정 | 자료 | **트랙 4. 신뢰·라이브러리·용어** |
| 참고 자료 (`References`) | `/about/technology/references` | 344 | 참고 항목 15건 · 참고 제품 16건 · 세미나 자료·무료 AI 가이드 | 미측정 | 자료 | **트랙 4. 신뢰·라이브러리·용어** |

### 기술 허브 외 인접·유사 페이지 실측

| 페이지 | 경로 | 줄 수 | 기술 허브와의 접점 및 중복 성격 |
| --- | --- | ---: | --- |
| 서비스 소개 (`AboutPage`) | `/about` | 317 | 기술 하위 페이지 5곳(`/videos`, `/architecture`, `/story`, `/deck`, `/atlas`) 연결, 제품 비전과 창작 흐름 요약 |
| 웹툰 제작 과정 (`WebtoonWorkflowPage`) | `/about/workflow` | 233 | 기술 하위 페이지 4곳 연결, 기획→저장→연재 파이프라인 설명이 `Story` 초반부와 서사 중첩 |
| 제품 원칙 (`ProductPrinciplesPage`) | `/about/principles` | 259 | 권리·AI·접근성 기준이 `Playbook` 원칙 5개 및 `Licenses` 권리 계층과 주제 인접 |
| 제품 투어 (`ProductTourPage`) | `/product-tour` | 268 | 9개 챕터마다 `ProductTourTechLinks`로 `/about/technology/atlas#*` 및 `/about/technology/story#*`에 딥링크 |
| 브랜드 필름 (`BrandFilmPage`) | `/brand-film` | 274 | `/about/technology/videos` 및 Remotion 도감 카드 연결, `Videos`·허브에서도 동일 영상 포스터 재노출 |
| 경쟁 비교 (`CompetitorComparisonPage`, 병렬 브랜치 예정) | `/about/compare` | 병렬 작업 | 기존 `/compare`는 독자용 작품 비교(`Catalog ComparePage`) 점유 중. 경쟁 툴 기능·UX·₩0 비용 비교는 `/about/compare`에 등록되며 트랙 1과 직결 |

---

## 2. 중복 페이지 쌍 전수 분석 매트릭스

실제 소스와 데이터 모듈 import 관계를 교차 검증해 확인한 주요 중복 쌍과 원인이다.

| 중복 쌍 | 실측 중복 근거 | 중복 발생 원인 | 1단계 조치 (`current`) | 2단계 통합안 (`target`) |
| --- | --- | --- | --- | --- |
| **`Guides` vs `Playbook`** (+ `Story`·`FieldNotes` 재사용 단계) | `EngineeringGuidesPage.tsx`가 `engineering-playbook-content.ts`의 `ENGINEERING_REUSE_BLUEPRINTS`(6개)를 직접 import. `Playbook`은 `RELOCATED` 3카드로 가이드·덱·영상 이동을 재안내. "다른 프로젝트에 적용" 절차가 `Story`(40챕터)·`Playbook`(10결정)·`Guides`(30가이드)·`FieldNotes`(12노트) 4곳에 분산. `Playbook`의 `#benchmarks`(5군)·`#ai-workbench`(6계층)도 `References`·`Atlas` 지도와 중첩 | 초기에 단일 플레이북에 담겨 있던 청사진·세미나·영상 기획을 분리하면서 데이터 원천은 `engineering-playbook-content.ts`에 남고 화면만 쪼개짐 | **트랙 2(아키텍처 & 실무 코드)** 안에 `Architecture → Atlas → Guides → Playbook` 순서로 통합 배치, 30분 아키텍처 심화 코스에서 `Guides#blueprints` 직결 | `Guides`와 `Playbook`을 `/about/technology/guides` 하위 탭(`원칙·결정` / `재사용 청사진·도입`)으로 통합 검토. `/about/technology/playbook` 및 `#dossier-*`, `#benchmarks` 앵커는 클라이언트·엣지 리다이렉트로 보존 |
| **`Architecture` vs `Atlas`** (+ `Deck` `atlas` 트랙) | `Architecture` 12개 구간이 `Atlas` 고유 카드 **60장**과 `Story` 챕터 18개를 교차 링크. `Atlas`는 154장 카드 + 5종 지도 429행을 보유하며, `Deck` `atlas` 트랙(587장)이 같은 도감 카드를 슬라이드로 재렌더 | "큰 그림 해설(선형)"과 "키워드 검색(사전형)"으로 역할을 나눴으나, 독자 입장에서는 구조·도감·지도가 서로 다른 메뉴 묶음(`큰 그림` vs `자료`)에 갈라져 있어 탐색이 끊김 | **트랙 2(아키텍처 & 실무 코드)**로 한 묶음화, `EngineeringTrackSiblingBar`로 1클릭 왕복 제공 | 두 페이지 모두 독립 목적(선형 해설 vs 검색 카탈로그)이 뚜렷하므로 URL 유지 권장. 단, `Atlas` 비교 지도 중 경쟁사(`#map-competitors`)는 `/about/compare`와 역할 분담(원장 표 vs 의사결정 비교표) |
| **`Libraries` vs `Licenses` vs `References`** (+ `Atlas` 오픈소스 지도) | `Libraries` 54개 카드 중 **43개(79.6%)가 `Atlas` 카드 링크**, **42개(77.8%)가 `Atlas#map-open-source-*`(고유 35/44행 = 79.5%)** 참조. `Libraries` 카드와 `Licenses`(115종) 모두 라이선스 주의 라벨 표시. `References`의 `EngineeringSeminarResources`·`EngineeringFreeAiTokenGuide` 컴포넌트 2종은 `EngineeringDeckPage.tsx`에서도 중복 마운트. Open API는 `FieldNotes`(8개)와 `Atlas`(43행)에 이중 등재 | 라이브러리 "선정 이유"(설계 관점), "권리·고지"(법무/CI 관점), "외부 참고 경계"(과장 방지 관점)가 시간차를 두고 별도 페이지로 증설됨 | **트랙 4(신뢰·라이브러리·용어)**에 4개 페이지(`Libraries`·`Licenses`·`Glossary`·`References`)를 일괄 묶고 `보안·라이선스 검토` 역할 점프로 직결 | `References`의 세미나 자료·무료 AI 가이드는 `Deck` 또는 단일 공유 섹션으로 축약하고, 2단계에서 `Libraries`의 라이선스 요약과 `Licenses` 인벤토리 간 단일 데이터 소스(`THIRD_PARTY_NOTICES` 파이프라인) 정렬 검토 |
| **`Story` vs `Videos` vs `ProductTour`** (+ `About`·`WebtoonWorkflow`) | `Videos`가 `/brand/toonstudio-product-tour.mp4`(8:24) 플레이어를 직접 임베드하면서 `/product-tour` CTA를 함께 노출. `TechnologyPage` 허브도 `/product-tour`·`/brand-film` 카드를 재노출. `Videos`와 `Deck`은 `ServiceStoryJourney`(7항목 별도 네비게이션)를 `EngineeringPageFrame`과 함께 이중 렌더 | 제품 소개(`/about`, `/product-tour`)와 기술 스토리(`/about/technology/story`, `/videos`)가 각각 완결형 랜딩으로 발전하며 영상·흐름 안내가 겹침 | **트랙 1(한눈에 보기)**에 `Story`·`Videos`·`경쟁 비교(/about/compare)`를 묶어 첫 방문자 진입 경로를 단일화 | `Videos`의 중복 `ServiceStoryJourney`를 `EngineeringTrackSiblingBar`로 흡수 검토하고, `ProductTour` 딥링크(`ProductTourTechLinks.test.tsx`) 계약 100% 보존 조건 하에 `/product-tour`는 제품 데모, `/about/technology/videos`는 Remotion 제작 파이프라인으로 역할 고정 |
| **`TechnologyPage` 허브 자체 중복 구역** | 기존 허브에 12개 페이지 진입 구역이 5곳(`EngineeringHubStart`, `EngineeringReadingRoutes`, `EngineeringTechNav`, `TALK PATH 5 STEPS`, `TECH ATLAS` 자료 카드)으로 분산되어 있었고, `ARCHITECTURE MAP` 하단에 `라이브러리 해설 열기` 단독 배너까지 중복 존재. 가장 짧은 읽는 길도 11분(`skim`)으로 3분 즉시 파악 코스가 없었음 | 기존 단계별 구획을 유지한 채 새 허브 위젯을 덧붙이며 서두 안내가 누적됨 | 최상단에 **4-트랙 통합 허브 + 3분/15분/30분 1클릭 코스 + 역할별 빠른 점프** 배치, 중복 `라이브러리 해설 열기` 배너 및 퇴역 `render.yaml` 인용 제거, 장황한 서두 문구 압축 | 2단계에서 `TechnologyHub.test.tsx` 계약을 4-트랙 중심으로 개편한 뒤, 중복된 레거시 `TALK PATH`·`EngineeringReadingRoutes` 구획을 단일 4-트랙 보드로 일원화 가능 |

---

## 3. 1단계 완료 내역 (`current` · `2026-11-22`)

기존 라우트(`/about/technology/*` 12개)와 계약 테스트를 단 1건도 깨뜨리지 않으면서 탐색 피로를 제거한 비파괴 통합 구조다.

### 3.1 4-트랙 통합 구조 (`engineering-hub-tracks.ts`)

1. **트랙 1. 한눈에 보기 (`glance`)**: `Story` · `Videos` · `경쟁 비교(/about/compare)`
2. **트랙 2. 아키텍처 & 실무 코드 (`architecture-code`)**: `Architecture` · `Atlas` · `Guides` · `Playbook`
3. **트랙 3. 기술 세미나 발표 (`seminar`)**: `Deck` · `FieldNotes`
4. **트랙 4. 신뢰·라이브러리·용어 (`trust-reference`)**: `Libraries` · `Licenses` · `Glossary` · `References`

- `ENGINEERING_PAGES` 12종 전원이 4개 트랙에 **중복 0건 · 누락 0건**으로 배정된다.
- 대형 콘텐츠 모듈(`engineering-atlas-content`, `engineering-deck-model`, `engineering-story-published-content` 등)을 정적으로 불러오지 않아 허브 초기 번들 증가를 막는다(`EngineeringTrackHub.test.tsx`로 계약 고정).

### 3.2 목적별 1클릭 읽기 코스 & 역할별 빠른 점프 (`EngineeringTrackHub.tsx`)

| 코스 | 소요 기준 | 대상 | 1클릭 진입 | 연관 바로가기 | 정직성 범위 고지 |
| --- | --- | --- | --- | --- | --- |
| **3분 파악** | 3분 | 처음 오신 분 · 투자자 | `/about/technology/deck?track=brief#slide-1` | `/about/compare`, `/about/technology/videos` | 요약 슬라이드 전체는 약 11분이며, 초반 핵심 장표와 비교표만 3분 코스로 구성 |
| **15분 세미나** | 15분 | 세미나 청중 · 발표자 | `/about/technology/deck?track=talk#slide-1` | `/about/technology/field-notes#incidents`, `/about/technology/glossary` | 기본 세미나 트랙은 30분이며, 핵심 구간 선별 발표 + 장애 사례 15분 흐름 기준 |
| **30분 아키텍처 심화** | 30분 | 실무 개발자 · 설계 검토자 | `/about/technology/architecture` | `/about/technology/guides#blueprints`, `/about/technology/atlas` | 아키텍처 해설 전체는 약 43분이며, 핵심 지도·청사진·관심 기술 카드 집중 코스 |

- **역할별 빠른 점프**: `투자자 · 처음 방문`, `실무 개발자`, `세미나 발표자`, `보안 · 라이선스 검토` 4개 버튼(`min-h-11`, `>= 44×44px`) 선택 시 추천 바로가기 바 표시 및 해당 코스·트랙 강조.
- **하위 12개 페이지 공통 프레임 고도화 (`EngineeringStoryUi.tsx`, `EngineeringArchitectureNav.tsx`, `EngineeringHubStatusStrip.tsx`)**:
  - `EngineeringCatalogMenu` 내부 목차를 4-트랙 그룹으로 재편하고, 접힌 헤더에 현재 페이지의 `트랙 N · 트랙명` 배지 표시.
  - 본문 상단에 간결한 1줄 `EngineeringTrackSiblingBar`를 추가해 같은 트랙 형제 페이지와 4-트랙 허브를 1클릭 전환(현재 페이지는 비링크 상태 칩으로 렌더링해 중복 링크 0건 유지).
  - `ArchitectureSectionStrip`에 구간 진행도(`n/total`, `tabular-nums`)와 `ArrowLeft`/`ArrowRight`/`Home`/`End` 키보드 탐색 추가.
  - `EngineeringHubStatusStrip` CTA를 `min-h-11`(`>= 44px`)로 상향하고 `장애·복구 기록`(`/about/technology/field-notes#incidents`) 직행 링크 연결.

### 3.3 병렬 워커 연동 경계

- **경쟁사 비교 (`/about/compare`)**: `@tech-competitor-ir` 브랜치에서 `marketing.routes.tsx`에 등록 예정(기존 `/compare`는 독자용 작품 비교 `ComparePage` 유지). 본 브랜치의 트랙 1·히어로·카탈로그 메뉴가 `/about/compare`를 일관되게 가리킨다.
- **Remotion 세미나/실무 코드 쇼케이스 (`seminar-showcase/`)**: `@tech-seminar-remotion` 브랜치에서 `EngineeringDeckPage.tsx` 또는 `EngineeringGuidesPage.tsx`에 지연 로드 마운트 예정. 본 브랜치는 해당 두 페이지 파일을 수정하지 않아 병합 충돌 0건을 유지한다.

---

## 4. 2단계 로드맵: 리다이렉트 기반 페이지·콘텐츠 통합 (`target`)

2단계는 **기존 공개 URL·사이트맵·외부 공유 링크를 깨뜨리지 않는 조건**에서만 진행한다. 실제 URL 통합과 리다이렉트 변경은 저장소 소유자 승인 후 별도 PR로 실행한다.

| 통합 대상 (Before) | 2단계 정본 URL (After) | 리다이렉트 & 앵커 보존 규칙 | 선행 수정이 필요한 계약 테스트 | 롤백 기준 |
| --- | --- | --- | --- | --- |
| `Playbook` + `Guides` | `/about/technology/guides` (`?tab=principles` / `?tab=blueprints`) | `/about/technology/playbook` → `/about/technology/guides?tab=principles`, `#dossier-*`·`#benchmarks` 앵커 1:1 유지 | `engineering-tech-pages.test.ts`, `EngineeringPlaybookPage.test.tsx`, `EngineeringStoryUi.test.tsx`, `sitemap-routes.test.ts`, `route-breadcrumb.ts` | 딥링크 404 또는 앵커 유실 1건이라도 발생 시 리다이렉트 전 라우트 복원 |
| `References`의 세미나 자료·무료 AI 가이드 중복 마운트 | `Deck`(`/about/technology/deck#resources`) 또는 `References` 단일 소유 | 중복 마운트 제거 후 교차 앵커 링크로 대체 (URL 유지) | `EngineeringDeckPage.test.tsx`, `EngineeringReferencesPage.test.tsx`, `EngineeringSeminarResources.test.tsx` | 세미나 준비 섹션 접근성 회귀 시 컴포넌트 복원 |
| `Libraries` 라이선스 요약 vs `Licenses` 인벤토리 | 두 URL 유지, 데이터 소스 단일화 | `Libraries` 카드의 라이선스 배지가 `engineering-license-inventory.ts`를 단일 정본으로 참조하도록 통합 | `EngineeringLibrariesPage.test.tsx`, `EngineeringLicensesPage.test.tsx`, `engineering-license-inventory.test.ts` | 라이선스 경고(`CC BY-NC`, `LGPL`) 누락 시 즉시 롤백 |
| `Videos`·`Deck` 내 `ServiceStoryJourney` 중복 네비 | `EngineeringTrackSiblingBar` 단일화 | `Videos`·`Deck` 상·하단에서 중복 7항목 네비 제거, `/product-tour`·`/brand-film`은 트랙 1 바에서 연결 | `EngineeringVideosPage.test.tsx`, `EngineeringDeckPage.test.tsx`, `ProductTourTechLinks.test.tsx` | 투어↔기술 양방향 진입률 저하 또는 계약 실패 시 복구 |
| `TechnologyPage` 레거시 다중 섹션 축소 | `/about/technology` 4-트랙 허브 일원화 | `EngineeringHubStart`·`TALK PATH 5 STEPS`·`EngineeringReadingRoutes`의 중복 블록을 4-트랙 허브 + 1장 흐름 도식 + 40챕터 도서관 3단으로 압축 | `TechnologyHub.test.tsx`, `engineering-reading-routes.test.ts` | 40챕터 앵커·상태 스트립·도감 카테고리 접근 계약 실패 시 이전 레이아웃 복원 |

### 2단계 실행 전제 조건 및 승인 절차

- **승인 주체**: 저장소 소유자 (공개 URL·사이트맵·리다이렉트 규칙 변경 PR 승인)
- **필수 입력**: Cloudflare Static Assets `_redirects` 매핑표 + `apps/web/src/app/routes/groups/legal.routes.tsx` 클라이언트 `<Navigate replace />` 규칙 + 갱신된 사이트맵(`scripts/build-static-catalog.ts`)
- **성공 기준**: 구 URL 12종 전수 HTTP 200/301 응답, 해시 앵커(`#dossier-*`, `#map-*`, `#glossary-*`, `#incidents`) 100% 보존, `ProductTourTechLinks.test.tsx`·`sitemap-routes.test.ts`·`apps/web/src/domains/legal/technology/*.test.*` 전수 통과
- **실패·롤백 경로**: 리다이렉트 루프·앵커 유실·SEO 색인 오류 감지 시 리다이렉트 커밋을 즉시 `git revert`하고 기존 12개 독립 페이지 매핑으로 복귀

---

## 5. 검증 명령 및 기준 (`2026-11-22`)

저장소 루트(`/Users/hjunkim/.gemini/antigravity/worktrees/...` 또는 메인 클론 루트)에서 Node `v24.22.1`과 `pnpm`이 `PATH`에 잡힌 상태로 아래 명령을 실행한다. 모든 명령은 읽기 전용 검증이며 외부 인프라나 운영 배포에 부작용이 없다.

```bash
export PATH="$HOME/.nvm/versions/node/v24.22.1/bin:$HOME/.local/share/pnpm:/opt/homebrew/bin:$PATH"

# 1. 기술 도메인 전체 Vitest + 연관 투어·사이트맵·소개 링크 계약 테스트
pnpm exec vitest run \
  apps/web/src/domains/legal/technology \
  apps/web/src/domains/marketing/ProductTourTechLinks.test.tsx \
  apps/web/src/shared/lib/__tests__/sitemap-routes.test.ts \
  apps/web/src/domains/legal/about-pages-links.test.ts

# 2. 정적 품질·미연결 코드·문서·아키텍처·하네스 게이트
pnpm exec eslint --max-warnings=0 \
  apps/web/src/domains/legal/TechnologyPage.tsx \
  apps/web/src/domains/legal/technology/engineering-hub-tracks.ts \
  apps/web/src/domains/legal/technology/EngineeringTrackHub.tsx \
  apps/web/src/domains/legal/technology/EngineeringTrackHub.test.tsx \
  apps/web/src/domains/legal/technology/EngineeringReadingRoutes.tsx \
  apps/web/src/domains/legal/technology/EngineeringStoryUi.tsx \
  apps/web/src/domains/legal/technology/EngineeringArchitectureNav.tsx \
  apps/web/src/domains/legal/technology/EngineeringHubStatusStrip.tsx
pnpm run check:unconnected-code:gate
pnpm run validate:documentation
pnpm run validate:architecture
pnpm run harness:check
```
