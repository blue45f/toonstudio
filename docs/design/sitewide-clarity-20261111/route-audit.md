# 전체 경로와 화면 복잡도 코드 감사 — 2026-11-11

상태: **current** — 1~4절은 정본 소스의 정적 분석 결과다. 실제 브라우저로 모든 페이지의 기능을 확인했다는 뜻이 아니다. 5절은 **migration**, 6절은 **target**이다.

## 1. 조사 범위와 재현 근거

[`route-inventory.json`](./route-inventory.json)은 `scripts/lib/sitewide-audit-route-inventory.mjs`의 `collectAuditRouteInventory`와 `collectDeclaredAuditRoutes`를 실행한 결과다. 실행 시점의 커밋, 전체 경로, 소스 파일·행·심볼, 중복 선언과 와일드카드 위임 근거를 함께 저장한다.

| 정적 집계 | 수치 | 해석 |
| --- | ---: | --- |
| 앱 라우트 선언 | 314 | 그룹 배열의 import·spread를 재귀적으로 해석 |
| 구체 주소 확장 | 441 | 중복 제거한 주소. 별칭·리다이렉트·합성 동적 표본 포함 |
| 와일드카드 위임 | 5 | Studio·Learn·Admin·404 소유자 경계 |
| 파싱한 소스 모듈 | 31 | 앱 그룹·Studio·Admin·학습 콘텐츠 정본 |

**441은 독립 화면 수나 검증 완료 화면 수가 아니다.** `visual-audit` 동적 파라미터는 실제 프로젝트·계정·문서의 성공 표본이 아니다. 인증·실데이터·저장·GPU 편집·게시 기능은 별도 사용자 여정 검증이 필요하다.

기존 `scripts/accessibility-sweep-20261107/route-domain-classifier.ts`의 기본 분류는 이 분석에서 134개 경로를 `redirect-legacy`로 묶었다. `/home`, `/create`, `/ranking`, `/explore`, `/research/*`처럼 실제 콘텐츠 경로도 포함되므로 이 값을 레거시 또는 리다이렉트 수로 해석하지 않는다. 이번 원장은 소스 provenance 기준으로 그룹을 유지한다.

## 2. 앱 라우트 선언의 영역별 목록

전체 URL과 선언 행은 JSON의 `routes`, `entries`, `excluded`에 있다. 아래 표의 수치는 와일드카드를 포함한 앱 선언 수이며, 441개 확장 주소와 합산하지 않는다.

| 소스 그룹 | 선언 수 | 사용자 업무 |
| --- | ---: | --- |
| `creator.routes.tsx` | 57 | 제작 입구·프로젝트·도구·매뉴얼·Studio/Learn 위임 |
| `creator-resources.routes.tsx` | 52 | 창작 리서치·외부 자료·학습·생태계 |
| `legal.routes.tsx` | 33 | 도움말·서비스·정책·기술 문서 |
| `production.routes.tsx` | 30 | 제작 관리·회차·검토·팀·권한 |
| `community.routes.tsx` | 24 | 커뮤니티·구인·의뢰·카페·홍보 |
| `catalog.routes.tsx` | 19 | 작품 찾기·랭킹·검색·작품 상세·리더 |
| `account.routes.tsx` | 15 | 개인 공간·메시지·설정·인증 |
| `marketing.routes.tsx` | 15 | 작업 홈·소개·요금제·브랜드·행사 |
| `market.routes.tsx` | 14 | 소재 탐색·거래·보유 소재·판매 관리 |
| `creator-showcase-routes.tsx` | 12 | 공개 작품·시리즈·검토 공유 |
| `experience.routes.tsx` | 10 | 운세·플레이 |
| `legacy.routes.tsx` | 7 | 호환 주소 리다이렉트 |
| `integrations.routes.tsx` | 5 | 외부 연동·자동화·연재 센터·개발자 |
| `monetization.routes.tsx` | 4 | 창작자 수익·멤버십 |
| `engagement.routes.tsx`, `cuts.routes.tsx` | 각 3 | 알림·취향·목록, 숏폼 컷 |
| `newsletter.routes.tsx`, `labs.routes.tsx`, `pwa.routes.tsx` | 각 2 | 뉴스레터, 실험실, 설치·오프라인 |
| `reference.routes.tsx`, `admin.routes.tsx`, `not-found.route.tsx` | 각 1 | 레퍼런스, 관리자 위임, 404 |

## 3. 기존 디자인 시안과 점검 자료의 적용 상태

| 자료 | 확인한 내용과 현재 코드와의 차이 |
| --- | --- |
| `docs/design/sitewide-design-unification-20260927.md` | 공통 여백·테마·제목 중복 제거 원칙은 활용 가능하다. 생성 입구를 `/studio/new`로 쓰는 부분은 현재 `/create` 시작 시트와 다르므로 과거 동선 설명으로 취급한다. |
| `docs/design/sitewide-experience-predevelopment-20260916/` | IA·와이어프레임·라우트·수용 조건이 있다. 현재 정본 라우트와 대조해야 하는 역사 설계다. |
| `docs/design/pilates-toonstudio-ui-ux-20261110/PILATES_TOONSTUDIO_UI_UX_MASTER_SPEC.md` | 원본 미반영 독립 샘플임을 명시한다. ToonStudio 실제 계약과 Pilates 확장 가정이 혼재하므로 전체를 구현된 제품 명세로 취급하지 않는다. |
| `docs/reports/full-route-feature-audit-and-session-plan-2026-11-06.md` | 화면별 문제·재현 조건·소유 경계를 추적할 수 있다. 역사 스냅샷의 버그는 현재 소스와 다시 대조해야 한다. |
| `docs/accessibility-sweep-20261107/route-inventory-and-coverage.md` | 확장 주소 441개라는 값은 재현됐다. 당시 문서의 소스 17개와 현재 실제 파싱 모듈 31개는 구분한다. |

## 4. 코드에서 확인한 사용성 문제

| 문제 | 코드 근거 | 사용자에게 미치는 영향 |
| --- | --- | --- |
| 공개 셸과 작업 셸의 메뉴 어휘 차이 | `site-header.tsx`, `studio-product-ia.ts`, `workspace-navigation-model.ts` | 공개 헤더는 제작·탐색·커뮤니티·배우기·마켓을, 작업 셸은 작업 홈·작품·탐색·커뮤니티·전체를 사용한다. 같은 목적지의 명칭·분류가 달라 문맥 전환 때 다시 학습해야 한다. |
| 본문보다 먼저 나타나는 창작 활용 안내 | 변경 전 `AppShell.tsx`의 `SiteCreationCompass` 위치 | 검색·감상·도움말을 사용하려는 사람도 현재 업무보다 먼저 다른 창작 행동을 보게 된다. |
| 접힌 안내 바깥의 다른 업무 CTA | 변경 전 `SiteCreationCompass.tsx` | 데스크톱에서 안내를 펼치지 않아도 제작 CTA가 노출되어 본문 작업과 시각적 우선순위가 경쟁한다. |
| 과거 설계·자동 점수를 현재 사용성 완료로 오인할 가능성 | `scripts/ux-audit/README.md`와 과거 보고서 | 기존 자동 점수는 IA 직관성과 미적 위계를 측정하지 않는다. 높은 점수만으로 복잡도 문제가 해결됐다고 판단할 수 없다. |

현재 `SearchPage.tsx`는 제목 → 검색 방식 → 검색 입력과 결과를 먼저 배치하고 긴 안내와 보조 동선은 결과 아래 접힌 영역에 둔다. 다른 목록과 허브에서 참고할 수 있는 기존 구현 패턴이다.

## 5. 이번 공통 셸 변경 — migration

- `SiteCreationCompass`를 라우터가 그리는 현재 업무 본문 뒤로 옮긴다. 메인 랜드마크는 유지한다.
- 창작 활용 안내의 다음 업무 CTA를 기본 접힘 `<details>` 안에 둔다. 필요한 사람이 직접 펼쳐서 이동할 수 있다.
- 서비스 장애·연결 상태 안내, 프로젝트 문맥 브리지, 로그인·복구·오프라인 처리는 기존 경계를 유지한다.
- 이 변경은 레이아웃과 선택 노출 범위다. 데이터 저장·권한·게시 계약 또는 441개 경로의 기능 구현을 바꾸지 않는다.

검증 기록은 통합 결과와 함께 갱신한다. 이 문서와 정적 원장만으로 운영 배포 완료를 주장하지 않는다.

## 6. 전수 브라우저 검증과 후속 수용 조건 — target

- `scripts/audit-sitewide-visual-ux.mjs`의 `AUDIT_ROUTE_MODE=all`로 확장 주소 전체의 렌더링 경계를 확인하고, `AUDIT_THEMES`, `AUDIT_VIEWPORT_WIDTHS`로 light/dark/contrast·좁은 모바일·데스크톱을 분리한다.
- 이 시각 감사는 게스트·API 503 fixture·GPU 비활성화 조건이다. 로그인 이후 실제 데이터와 편집 동작을 검증했다고 보고하지 않는다.
- `scripts/ux-audit/run.mjs`의 핵심 34개 화면·3개 뷰포트·6개 여정과 실제 지원되는 프로젝트 표본을 이용해 생성→편집→저장→검토→내보내기 복귀를 따로 확인한다.
- 닫힌 선택 안내의 링크는 키보드 Tab 순서에 들어오지 않아야 한다. 펼치기·접기 후 현재 입력과 결과는 유지되어야 한다.
- 첫 화면에는 현재 업무의 제목·입력·목록 또는 작업 대상이 먼저 보여야 한다. 장식·설명·다른 업무 권유가 그 앞에 쌓이지 않아야 한다.
- 인증이 필요한 경로, 합성 ID로 열린 오류 경로, GPU 미지원, 실제 데이터 경로의 성공은 서로 다른 검증 결과로 기록한다.
