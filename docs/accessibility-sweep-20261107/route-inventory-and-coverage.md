# 전페이지 라우트 인벤토리 및 접근성 검증 범위 (2026-11-07)

- 상태: 1~4절은 `origin/main`(`e48cdc2563227ba5dd10bd491b54977ce92b4afa`) 기준 정적 라우트 권위 원장과 확장 인벤토리를 집계한 사실(**current**)이다. 5절은 동적 파라미터 및 와일드카드 소유 경계의 보존 정책(**legacy exception**)이다.
- 기준 일자: `2026-11-07`
- 관련 스크립트: [route-inventory-audit.ts](../../scripts/accessibility-sweep-20261107/route-inventory-audit.ts), [route-inventory-audit.test.ts](../../scripts/accessibility-sweep-20261107/route-inventory-audit.test.ts), [browser-accessibility-sweep.mjs](../../scripts/accessibility-sweep-20261107/browser-accessibility-sweep.mjs)

---

## 1. 라우트 권위 원장 요약 (`current`)

ToonStudio 웹 애플리케이션(`apps/web`)의 라우트 선언은 단일 파일이 아니라 4개의 정적 권위 원장(Route Authority)과 1개의 와일드카드 폴백 경계로 구성된다. `scripts/accessibility-sweep-20261107/route-inventory-audit.ts`는 AST 정적 분석기([sitewide-audit-route-inventory.mjs](../../scripts/lib/sitewide-audit-route-inventory.mjs))를 호출해 선언된 모든 경로와 별칭(alias), 동적 파라미터 표본, 학습 커리큘럼 ID를 빠짐없이 전수 확장한다.

| 구분 | 수치 | 정본 출처 파일 | 비고 |
| --- | ---: | --- | --- |
| `appRoutes` 정적 선언 수 | `314` | [app-routes.tsx](../../apps/web/src/app/routes/groups/app-routes.tsx) 및 하위 라우트 그룹 12개 파일 | 공개·계정·법무·탐색·마켓·커뮤니티·프로덕션·스튜디오 진입 경로 |
| 스튜디오 레지스트리 고유 확장 경로 | `55` | [studio-route-registry.ts](../../apps/web/src/domains/creator/studio-route-registry.ts) (`STUDIO_ROUTE_REGISTRY`) | 등록 엔트리 및 하위 별칭(alias) 포함 |
| 스튜디오 매니페스트 고유 확장 경로 | `47` | [studio-route-manifest.ts](../../apps/web/src/domains/creator/studio-router/studio-route-manifest.ts) (`STUDIO_ROUTE_MANIFEST`) | `/studio/companion/:surface` 정적 표면 확장 포함 |
| 관리자 매니페스트 및 리다이렉트 경로 | `15` | [admin-route-manifest.ts](../../apps/web/src/domains/admin/router/admin-route-manifest.ts) (`ADMIN_ROUTES`, `resolveAdminRedirectHref`) | 관리자 콘솔 탭 및 레거시 리다이렉트 별칭 |
| 학습(`Learn`) 브랜치·수업·코스 경로 | `60` | [LearnPage.tsx](../../apps/web/src/domains/learn/LearnPage.tsx), [LearnContent.tsx](../../apps/web/src/domains/learn/LearnContent.tsx), [learning-content.ts](../../apps/web/src/domains/learn/learning-content.ts), [learning-paths.ts](../../apps/web/src/domains/learn/learning-paths.ts) | `LESSONS`(40개), `LEARNING_PATHS`(7개), `/learn/quiz` 및 분기 경로 |
| **전수 확장 구체 URL 합계 (`expandedRoutes`)** | **`441`** | 17개 라우트 정본 모듈 통합 | 중복 제거·정규화 완료된 구체 경로 |
| 와일드카드 위임 선언 (`wildcardExclusions`) | `5` | `/learn/*`, `/studio/*`(2건), `/admin/*`, `*` | 각 하위 라우터 매니페스트로 위임되어 구체 경로에 이미 반영됨 |

---

## 2. 17개 라우트 선언 소스 모듈 목록 (`current`)

정적 AST 수집기가 직접 파싱하는 17개 라우트 정본 파일은 다음과 같다.

1. [app-routes.tsx](../../apps/web/src/app/routes/groups/app-routes.tsx)
2. [account.routes.tsx](../../apps/web/src/app/routes/groups/account.routes.tsx)
3. [catalog.routes.tsx](../../apps/web/src/app/routes/groups/catalog.routes.tsx)
4. [community.routes.tsx](../../apps/web/src/app/routes/groups/community.routes.tsx)
5. [creator.routes.tsx](../../apps/web/src/app/routes/groups/creator.routes.tsx)
6. [engagement.routes.tsx](../../apps/web/src/app/routes/groups/engagement.routes.tsx)
7. [experience.routes.tsx](../../apps/web/src/app/routes/groups/experience.routes.tsx)
8. [creator-resources.routes.tsx](../../apps/web/src/app/routes/groups/creator-resources.routes.tsx)
9. [legal.routes.tsx](../../apps/web/src/app/routes/groups/legal.routes.tsx)
10. [market.routes.tsx](../../apps/web/src/app/routes/groups/market.routes.tsx)
11. [production.routes.tsx](../../apps/web/src/app/routes/groups/production.routes.tsx)
12. [admin.routes.tsx](../../apps/web/src/app/routes/groups/admin.routes.tsx)
13. [admin-route-manifest.ts](../../apps/web/src/domains/admin/router/admin-route-manifest.ts)
14. [studio-route-registry.ts](../../apps/web/src/domains/creator/studio-route-registry.ts)
15. [studio-route-manifest.ts](../../apps/web/src/domains/creator/studio-router/studio-route-manifest.ts)
16. [LearnPage.tsx](../../apps/web/src/domains/learn/LearnPage.tsx) 및 [LearnContent.tsx](../../apps/web/src/domains/learn/LearnContent.tsx)
17. [learning-content.ts](../../apps/web/src/domains/learn/learning-content.ts) 및 [learning-paths.ts](../../apps/web/src/domains/learn/learning-paths.ts)

---

## 3. 도메인별 확장 라우트(441건) 분포 및 대표 검증 표면 (`current`)

441개 구체 라우트는 기능 도메인별로 다음과 같이 분류되며, 각 도메인의 대표 표면은 실제 Chromium 브라우저 멀티 뷰포트(`320×844`, `390×844`, `768×1024`, `1440×900`, `200% 확대`, `prefers-reduced-motion: reduce`)에서 검증되었다.

| 도메인 분류 (`RouteDomainCategory`) | 주요 포함 경로 예시 | 브라우저 대표 검증 라우트 | 핵심 접근성 검증 포인트 |
| --- | --- | --- | --- |
| `home` | `/` | `/` | 스킵 링크(`#main-content`), 헤더 드롭다운(`제작`·`탐색`·`배우기`), 커맨드 팔레트(`⌘K`), 모바일 전체 메뉴, 플로팅 컨트롤 |
| `discover` | `/discover`, `/rankings`, `/schedule`, `/genres`, `/search`, `/compare`, `/calendar`, `/ost`, `/news` | `/discover` | 필터 칩 `aria-pressed`, 검색 입력 레이블, 카드 목록 키보드 순회, 200% 확대 줄바꿈 |
| `catalog-work` | `/title/:id`, `/author/:slug`, `/authors`, `/publishers`, `/tags` | `/discover` (카탈로그 정적 픽스처 연동) | 작품·작가 상세 링크 이름, 커버 대체 텍스트 |
| `community` | `/community`, `/forum`, `/clubs`, `/polls`, `/fanart`, `/reviews`, `/challenges` | `/community` | 섹션 탭(`role="navigation"`), 게시글·투표 카드 버튼 이름, 모바일 320px 가로 오버플로 0px |
| `market` | `/market`, `/pricing`, `/assets`, `/brushes`, `/checkout`, `/passes`, `/license` | `/market` | 카테고리 탭·가격 필터 컨트롤 이름, 44px 터치 타깃 바닥선 |
| `learn` | `/learn`, `/learn/quiz`, `/learn/lessons/*`(40건), `/learn/paths/*`(7건), `/academy`, `/faq`, `/help` | `/learn` | 커리큘럼 카드·단계 탐색, 퀴즈 라디오·버튼 접근성 이름 |
| `legal` | `/accessibility`, `/terms`, `/privacy`, `/copyright`, `/youth-policy`, `/ai-policy`, `/about`, `/notices` | `/accessibility` | 접근성 조율실(`AccessibilityLab`) 슬라이더(`#accessibility-text-scale`), 고대비·모션 토글 역할(`GAP-A11Y-03`) |
| `account` | `/settings`, `/profile`, `/library`, `/bookmarks`, `/notifications`, `/login`, `/signup` | `/settings` | 탭 목록(`display`/`region`/`age`/`data`/`account`), `role="switch"` 설정 토글, 폼 컨트롤 레이블 |
| `experience` | `/fortune`, `/play`, `/tarot`, `/worldcup`, `/mbti`, `/gallery`, `/exhibition` | `/fortune`, `/play` | 인터랙티브 카드·미니게임 시작 단추 이름, `prefers-reduced-motion: reduce` 애니메이션 즉시 정지 |
| `production` | `/production`, `/production/projects`, `/pipeline`, `/schedule-board`, `/review`, `/publish`, `/team` | `/production` | 프로젝트 허브 작업 보드, 상태 배지 텍스트 병기, 200% 확대 리플로우 |
| `studio-hub` | `/studio`, `/studio/new`, `/studio/publish`, `/studio/assets`, `/studio/templates`, `/studio/manual` | `/studio`, `/studio/new`, `/studio/publish` | 워크스페이스 셸 내비게이션, 새 작품 생성 마법사 입력·버튼 이름, 게시 체크리스트 |
| `studio-editor` | `/studio/canvas`, `/studio/draw`, `/studio/ink`, `/studio/color`, `/studio/lettering`, `/studio/cuttoon` | `/studio/canvas` (정적 계약 + 전용 E2E 참조) | `StudioAppMenubar` 배너 랜드마크 중첩(`GAP-A11Y-05`), 툴레일 로빙 탭인덱스, 부동 창 포커스 복귀 |
| `studio-3d-brush-character` | `/brush-lab`, `/shaper`, `/character-lab`, `/pose-lab`, `/bg3d`, `/vrm`, `/studio/3d` | `/brush-lab`, `/shaper` | 슬라이더·프리셋 버튼 이름, 3D·브러시 실험실 반응형 폴백 |
| `admin` | `/admin`, `/admin/overview`, `/admin/users`, `/admin/content`, `/admin/system`, `/admin/audit` | `/admin/overview` | 비인증 게스트 접근 차단 안내 랜드마크(`#main-content`), 로그인 복귀 액션 키보드 도달성 |
| `status-ops` / `events-promo` / `reader-viewer` | `/status`, `/events/beta-open`, `/viewer/:id`, `/preview/:id` | `/` (베타·상태 배너 포함) | `ServiceDegradedBanner`(`role="status"`), 오프라인·베타 안내 포커스 비가림 계약 |

---

## 4. 와일드카드 라우트 위임 매핑 (`current`)

`appRoutes` 및 하위 라우터에 존재하는 5개의 와일드카드(`*`) 패턴은 누락된 미지 경로가 아니라 하위 도메인 매니페스트로 라우팅 권한을 위임하는 소유 경계다.

| 와일드카드 패턴 | 선언 위치 | 위임된 정본 권위(Owner Authority) | 구체 확장 경로 수 |
| --- | --- | --- | ---: |
| `/learn/*` | `apps/web/src/app/routes/groups/learn.routes.tsx#learnRoutes` | `LearnPage.tsx` + `LearnContent.tsx` + `LESSONS` + `LEARNING_PATHS` | `60` |
| `/studio/*` | `apps/web/src/app/routes/groups/studio.routes.tsx#studioRoutes` | `STUDIO_ROUTE_REGISTRY` + `STUDIO_ROUTE_MANIFEST` | `55` (레지스트리) / `47` (매니페스트) |
| `/studio/*` | `apps/web/src/domains/creator/studio-route-registry.ts#STUDIO_ROUTE_REGISTRY` | `StudioRouter` 내부 폴백 및 `STUDIO_ROUTE_MANIFEST` | `55` |
| `/admin/*` | `apps/web/src/app/routes/groups/app-routes.tsx#appRoutes` | `apps/web/src/domains/admin/router/admin-route-manifest.ts` (`ADMIN_ROUTES`) | `15` |
| `*` | `apps/web/src/app/routes/groups/app-routes.tsx#appRoutes` | `NotFoundPage` (404 복구 안내 화면) | `1` |

---

## 5. 동적 파라미터 표본 및 게스트 오프라인 경계 (`legacy exception`)

- 동적 세그먼트(`:id`, `:slug`, `:projectId`, `:episodeId` 등)를 포함한 경로는 실사용자 데이터나 개인정보를 절대 조회하지 않고, 결정론적 합성 표본(`visual-audit` 또는 정적 카탈로그의 공개 시드 ID)으로 확장해 검증한다.
- `/api/auth/session`은 `{ authenticated: false, user: null }` 게스트 세션으로 고정하고, 그 외 `/api/**` 요청은 `503 Service Unavailable` 합성 응답으로 격리하여 외부 서버 상태나 실데이터에 의존하지 않는 재현성을 보장한다.
