# ToonStudio 상용 출시 전수 격차 감사 (GAP_AUDIT)

- 작성일: `2026-11-19`
- 기준 브랜치 / HEAD: `feat/studio-assistant-router-workflow-packs-20261119` (`9fb467d90`)
- 문서 상태: **current** (Wave 0 기준선. 각 항목의 구현 완료·검증 통과는 `AC_LEDGER.md`에서 개별 추적)
- 참조 정본: `AGENTS.md`, `PRODUCT.md`, `DESIGN.md`, `DIFFERENTIATION.md`, `UX_FLOW_BACKLOG.md`, `PENDING-TICKETS-MOBILE-DRAW.md`, `docs/design/sitewide-clarity-20261111/verification-matrix.md`

---

## 1. P0 — 상용 즉시 출시 차단 결함 (Must-Fix Before Open)

| ID | 영역 | 현재 상태 (`current` / `model-only`) | 목표 상태 (`target`) | 근거 문서 |
| --- | --- | --- | --- | --- |
| GAP-P0-01 | 모바일 320px 드로잉·협업 HUD | 320px 뷰포트에서 브러시 HUD 슬라이더가 `함께 작업` disclosure를 가려 native tap 실패 이력 존재 | 320/390px 전 구간에서 HUD 겹침 0, native tap 및 키보드 접근 100% 통과 | `verification-matrix.md` §11 |
| GAP-P0-02 | 데스크톱 1440px 소재 상세 Footer | 1440px에서 소재 상세 적용 버튼이 외부 clip 하단 밖으로 밀려 center hit 실패 이력 존재 | 1440/390/320px 전 구간에서 소재 미리보기·권리 확인·적용·Undo·재열기 완주 | `verification-matrix.md` §11 |
| GAP-P0-03 | 모바일 320px 게시·출고 화면 | 320px 하단 탭 31px 겹침 및 폼 라벨 axe 위반 이력 존재 | 320/390/1440px에서 게시·출고 폼 라벨 axe 위반 0, 탭 겹침 0, JSON/PNG/ZIP 실제 다운로드 완주 | `verification-matrix.md` cf510 표 |
| GAP-P0-04 | 로컬 인증 E2E 커버리지 | `e2e/auth-account-matrix.spec.ts`가 live 게이트로 로컬 스킵됨 | mock 세션 API 기반 로컬 인증 스모크 E2E(게스트→로그인 유도→세션 만료→복구) 추가 및 통과 | `UX_FLOW_BACKLOG.md` P3 |
| GAP-P0-05 | 모바일 드로잉 최소 신뢰선 (`T1`·`T5`) | 두 손가락 탭 Undo / 세 손가락 탭 Redo 및 팜 리젝션 강화 티켓 미결 | 2/3손가락 제스처 Undo/Redo + 홀드 스크럽 + 손바닥 터치 무시 강화 구현 및 터치 테스트 통과 | `PENDING-TICKETS-MOBILE-DRAW.md` |
| GAP-P0-06 | AI 9상태 생성 큐 및 저장 충돌 UI | `studio-ai-job.ts` 9상태 모델은 `model-only`, 외부 변경 병합은 local-wins 안내만 존재, 기본 UI에 저장 엔진 내부 용어 잔존 | 정본 9상태 생성 큐 UI 연결, 충돌 3선택 복구 UI 구현, 기본 UI에서 `SQLite/OPFS/CRDT/lease` 내부 용어 0건 | `verification-matrix.md` §2·§3, `DESIGN.md` §1 |
| GAP-P0-07 | 실제 검사 근거 기반 프리플라이트·BOM | 8타깃 사전 점검과 3프로필 게시 검사가 이원화, 마켓 BOM 배지와 실제 원고 반입 출처 보존 검증 분리 | 단일 원스톱 프리플라이트(375px 가독성 + 컷 여백 + Rights BOM NC/GPL 차단) 통합 및 왕복 검증 | `PRODUCT.md`, `verification-matrix.md` §2 |
| GAP-P0-08 | 프로덕션 번들 최종 회귀·영속성 | 오프라인 편집→OPFS 로컬 저장→재연결→재열기 및 멀티탭 리더 락의 최신 번들 재검증 필요 | `verify:studio-autosave-opfs`, `verify:studio-autosave-two-tab`, `verify:collab-stability`, `verify:push` 전부 녹색 | `verification-matrix.md` §10 |

---

## 2. P1 — 경쟁 서비스 초격차 신규 기능 10선 (Surpass All Competitors)

클립스튜디오(CSP), 프로크리에이트(Procreate), 스케치업(SketchUp), 블렌더(Blender), 네이버/카카오/리디/라프텔/Letterboxd 대비 ToonStudio만의 구조적 해자를 완성하는 10대 기능이다.

| 순위 | 기능명 | 타깃 경쟁 공백 | 구현 범위 (실제 저장소 자산 연결) |
| --- | --- | --- | --- |
| **F01** | **"Why This Rank" 투명 산식 분해 패널** | 플랫폼 불투명 랭킹 정면 돌파 | `lib/ranking.ts`의 `rawScore`(베이즈·도달가중·신뢰계수) 기여도를 랭킹 행 클릭 시 스펙트럼 바로 실시간 분해 표시 |
| **F02** | **5문항 취향 테스트 온보딩** | 콜드스타트 추천 한계 해소 | 기존 `recommend.ts`에 가입/게스트 진입 직후 장르·태그·코드 5문항 온보딩 UI 및 즉시 개인화 피드 연결 |
| **F03** | **"어디서 봐" 1급 라우터 + 무료전환·가격변동 타임라인** | 한국 시장 전무 (무료/기다무 전환 알림) | `pricing.ts` 정직한 추정 라벨(≈) 격상 + 카탈로그 스냅샷 diff 기반 기다무/완전무료/완결 전환 타임라인 및 알림 |
| **F04** | **5종 읽기 상태 + 공개 컬렉션 공유 URL** | 크로스플랫폼 워치리스트·바이럴 루프 | `ReadState`에 `hiatus(보류)` 추가 + 공개 컬렉션 URL(`/collections/:slug`) 및 OG/공유 카드 구현 |
| **F05** | **노블코믹스 어댑테이션 버전 비교 매트릭스** | 한국 IP 파이프라인 독점 해자 | 어댑테이션 그래프에 원작 웹소설↔웹툰↔영상 각 버전의 평점·완결 여부·결말 차이·매핑 회차 한 줄 비교 표시 |
| **F06** | **통합 키워드·트리거워닝 파인더 + 베이즈 리뷰 신뢰 엔진** | 별점 인플레·테러 붕괴 해결 | 전 플랫폼 태그(소재·관계·전개·분위기·트리거워닝) 파인더 + 검증 독자 가중·평점 스펙트럼 분포·테러 방어 UI |
| **F07** | **Procreate급 모바일 작화 코어 (`T2`·`T3`·`T6`·`T7`·`T9`)** | 브라우저 웹툰 툴의 터치 작화 열세 역전 | QuickMenu(6액션), 전역/브러시별 압력 베지어 커브, ColorDrop 임계값 스크럽, QuickShape 도형 스냅, Clipping/AlphaLock/Reference 레이어 제스처 |
| **F08** | **3D 스테이지 원클릭 `원고 컷에 바로 굽기` & Live Ink Split-Wipe** | 스케치업↔클튜 수동 왕복 제거 | `Build -> Pose -> Shot -> Live Ink` 4단계에서 실제 WebGPU/Three 렌더 캡처 결과를 현재 2D 원고 컷 레이어로 비파괴 삽입 + 실시간 선화 Split-Wipe |
| **F09** | **원스톱 상용 출고 센터 (스마트 슬라이싱 + Rights BOM + PSD)** | 연재 직전 수작업 검수·저작권 사고 방지 | 375px 모바일 가독성 오버레이, 말풍선/대사 중간 절단 방지 스마트 슬라이싱, NC/GPL 상업 충돌 자동 차단, 비파괴 레이어 그룹 `.psd` 내보내기 |
| **F10** | **스트로크 이벤트 로그 WebM 타임랩스(`T11`) & 탐색→3컷 리믹스 브리지** | 작화 과정 SNS 공유 + 독자→창작자 전환 | 스트로크 이벤트 로그 0.5x~4x 리플레이·WebM 내보내기 + `/title/:slug`에서 연출 템플릿으로 3컷 웹툰 즉시 시작 브리지 |

---

## 3. P2 — 전수 UI/UX v2 디자인·성능·운영 폴리싱

- **에디터 크롬 및 시야 계약**: 단일 `44px` 컨텍스트 상단바(5단계 공정 스위처 + 저장 점 + 출고 CTA), `18 -> 7` 표준 메뉴 압축, 좌측 `48px` 도구 레일, 캔버스 뷰포트 `>= 82%`(모바일 `>= 88%` Thumb-Arc Dock).
- **시각 품질 및 토큰 규격**: Starlight(기본)와 Warm-Ink(선택) 색상 축 혼용 0건, 원시 HEX/Tailwind raw color 0건, 중첩 카드 0건, 회전 스피너 대신 스켈레톤 100%, `prefers-reduced-motion` 및 `forced-colors` 완전 대응.
- **표면 통합 및 접근성**: 28개 `/research/*` 경로의 단일 통합 핀보드 서랍화, 개인(8탭)/팀(14탭) 프로젝트 워크스페이스의 점진 확장형 6탭 수렴, `/my`·`/me` 단일 허브화, `/admin/*` 16탭의 4대 아코디언 구조화, 전 화면 axe-core 위반 0건 및 터치 타겟 `>= 44×44px`.
