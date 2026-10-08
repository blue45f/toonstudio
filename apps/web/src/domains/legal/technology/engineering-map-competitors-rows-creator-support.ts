import { CREATOR, D, row, t } from "./engineering-map-competitors-kit";

import type { EngineeringMapRow } from "./engineering-map-types";

/**
 * 경쟁·참고 제품 지도의 행 — 마켓·소재·창작자 지원 영역 중 ‘창작자 지원’(의뢰·멤버십, 영감·조사, 학습, 보조 도구, 레터링 기준).
 * 소재 마켓과 소재 라이브러리는 engineering-map-competitors-rows-assets.ts 에 있다.
 * 쓰는 규칙은 engineering-map-competitors-kit.ts 머리말을 따른다.
 *
 * 학습 문서의 진행률은 자기주도 기록이지 숙련도나 공인 수료가 아니다. 이 지도도 학습 서비스의 성과·수강생 수는 싣지 않는다.
 */

const HUB = "docs/creator-hub-implementation-20260913.md";
const PROMOTION = "docs/creator-promotion-community-20260913.md";
const PROFILE = "docs/profile-benchmark-2026-09.md";
const NOW_V2 = "docs/creator-resources/now-page-v2.md";
const NOW_V3 = "docs/creator-resources/now-page-v3.md";
const RESEARCH_DESK = "docs/research-desk-benchmark-2026-09-09.md";
const EVIDENCE_SYNTHESIS = "docs/research-evidence-synthesis.md";
const LEARNING_HUB = "docs/learn/learning-hub-benchmark.md";
const GUIDED_LESSON = "docs/learn/guided-lesson-experience.md";
const COMPANION = "docs/webtoon-companion-apps-benchmark-2026-09-03.md";
const LOCALIZATION_QA = "docs/webtoon-localization-qa-benchmark-2026-09-03.md";
const LEARN = "apps/web/src/domains/learn";
const RESOURCES = "apps/web/src/domains/creator-resources";
const ASSISTANT = `${CREATOR}/assistant`;
const LETTERING = `${CREATOR}/lettering`;
const SHOWCASE = "apps/web/src/domains/account/creator-profile-showcase.ts";

export const COMPETITOR_ROWS_CREATOR_SUPPORT: readonly EngineeringMapRow[] = [
  /* ───────────── 의뢰·멤버십·포트폴리오 ───────────── */

  row({
    id: "vgen",
    name: "VGen",
    domain: D.market,
    url: "https://vgen.co/",
    what: t(
      "작가에게 그림을 의뢰하는 서비스입니다. 저장소 문서는 의뢰, 범위·일정·보수 협의, 상태 관리와 포트폴리오의 제목·매체·설명·태그·게시 상태를 비교했습니다.",
      "A service for commissioning artists. The repository compared request, scope, schedule and pay negotiation, status tracking, and portfolio title, medium, description, tags and publish state.",
    ),
    learned: t(
      "배움: 요청의 범위·일정·보수를 구조화하고 본인 콘텐츠의 게시 상태를 관리. 안 한 점: 결제·에스크로는 도입하지 않음.",
      "Learned: structure a request's scope, schedule and pay, and manage the publish state of one's own content. Not adopted: payment and escrow.",
    ),
    overlap: t("협업 게시판(작업 의뢰·팀원 모집)과 작가 프로필.", "The collaboration board (commissions and team hiring) and creator profiles."),
    evidence: [HUB, PROMOTION, "apps/web/src/domains/collaboration/CollaborationBoardPage.tsx"],
  }),
  row({
    id: "kmong",
    name: "Kmong",
    domain: D.market,
    url: "https://kmong.com/",
    what: t(
      "국내 재능 거래 마켓입니다(한글 상호 ‘크몽’). 저장소 문서는 납품물·일정·수정 범위를 상품에 적는 방식을 비교했습니다.",
      "A Korean marketplace for freelance services (known in Korean as 'Kmong'). The repository compared how a listing states deliverables, schedule and revision scope.",
    ),
    learned: t(
      "배움: 납품물·일정·수정 횟수·지급 일정을 구조화. 안 한 점: 개별 판매가를 업계 표준 단가로 쓰지 않음.",
      "Learned: structure deliverables, schedule, revision count and payment timing. Not adopted: individual list prices are not used as an industry standard rate.",
    ),
    overlap: t("협업 게시판의 작업 의뢰 공고 항목.", "The commission-posting fields on the collaboration board."),
    evidence: [HUB, "apps/web/src/domains/collaboration/CollaborationBoardPage.tsx"],
  }),
  row({
    id: "patreon",
    name: "Patreon",
    domain: D.market,
    url: "https://www.patreon.com/",
    what: t(
      "창작자가 월 구독 티어를 만들고 팬이 후원하는 멤버십 서비스입니다. 저장소 팬 멤버십 모델의 머리말이 ‘Patreon / pixiv FANBOX형’이라고 적었습니다.",
      "A membership service where creators set monthly tiers and fans support them. The header of the repository's fan-membership model says 'Patreon / pixiv FANBOX style'.",
    ),
    learned: t(
      "배움: 창작자가 티어를 만들고 혜택(앞서 보기·제작 뒷이야기·전용 내려받기·멤버 글)을 정하는 모델. 이 서비스의 정책·요율은 조사하지 않음.",
      "Learned: a model where creators build tiers and set perks (early access, behind-the-scenes, exclusive downloads, member posts). This service's policies and rates were not researched.",
    ),
    overlap: t("팬 멤버십 모델(membership-model).", "The fan-membership model (membership-model)."),
    evidence: ["apps/web/src/domains/monetization/membership/models/membership-model.ts"],
  }),
  row({
    id: "behance",
    name: "Behance",
    domain: D.market,
    url: "https://www.behance.net/",
    what: t(
      "디자이너·일러스트레이터의 포트폴리오 서비스입니다. 저장소는 대표 작품과 전문 분야 패턴, 무드보드, 작품 유형·태그·도구로 가르는 창작 검색, 목적별 탐색을 근거로 삼았습니다.",
      "A portfolio service for designers and illustrators. The repository relied on its featured-work and specialty patterns, moodboards, creative search split by project type, tags and tools, and purpose-first browsing.",
    ),
    learned: t(
      "배움: 일일 프롬프트를 저장해 최근 7일 보관함으로 보이고, 분위기 태그를 검색 도약대로 씀. 다르게 한 점: 제3자 미디어나 권리 정보를 복제하지 않고 외부 소재를 몰래 Studio에 넣지 않음.",
      "Learned: daily prompts can be saved into a seven-day archive and mood tags act as search pivots. Done differently: no third-party media or rights data is copied, and nothing is silently inserted into Studio.",
    ),
    overlap: t("오늘의 창작(NowPage), 탐색 메뉴의 목적 분류, 프로필 대표 작품.", "Today's creation (NowPage), purpose-based menu grouping, and featured works on profiles."),
    evidence: [NOW_V2, PROFILE, "docs/design/sitewide-design-unification-20260927.md", `${RESOURCES}/NowPage.tsx`, SHOWCASE],
  }),
  row({
    id: "linkedin",
    name: "LinkedIn",
    domain: D.market,
    url: "https://www.linkedin.com/",
    what: t(
      "직무 기반 소셜 네트워크입니다. 저장소 프로필 벤치마크는 ‘전문 분야(스킬)’를 보여 주는 패턴의 예로 들었습니다.",
      "A professional social network. The repository's profile benchmark cites it as an example of the specialties (skills) pattern.",
    ),
    learned: t(
      "배움: 별도 입력 양식 없이 공개 작품의 반복 태그에서 전문 분야 칩을 도출해 콜드스타트 부담을 줄임. 협업 가능 상태·외부 링크는 정책이 정해질 때까지 미룸.",
      "Learned: derive specialty chips from recurring tags of public works with no extra form, easing cold start. Collaboration availability and external links wait until policy is defined.",
    ),
    overlap: t("크리에이터 프로필의 전문 분야 칩.", "Specialty chips on creator profiles."),
    evidence: [PROFILE, SHOWCASE],
  }),

  /* ───────────── 영감·조사 ───────────── */

  row({
    id: "are-na",
    name: "Are.na",
    domain: D.market,
    url: "https://www.are.na/",
    what: t(
      "사진·노트·파일·웹페이지를 채널에 모으고 정리·검색·연결하는 서비스입니다. 저장소 문서는 이 흐름과, 좋아요·광고·참여도 순위 없이 천천히 둘러보는 방식을 참고했습니다.",
      "A service for gathering photos, notes, files and web pages into channels, then arranging, searching and linking them. The repository drew on that flow and on slow browsing without likes, ads or engagement ranking.",
    ),
    learned: t(
      "배움: 저장에서 끝나지 않고 최근 자료·제공처 분포·보드 검색·출처 내보내기·Studio 전환으로 이어지게 함. 오늘의 창작은 무한 스크롤 없이 세 가지 경로 중 하나만 고르게 함.",
      "Learned: collecting does not end at saving; it leads to recent items, source distribution, board search, source export and Studio hand-off. Today's creation offers one of three bounded routes with no infinite scroll.",
    ),
    overlap: t("리서치 데스크와 오늘의 창작(NowPage).", "The research desk and today's creation (NowPage)."),
    evidence: [RESEARCH_DESK, NOW_V3, EVIDENCE_SYNTHESIS, `${RESOURCES}/research-desk-session.ts`, `${RESOURCES}/NowPage.tsx`],
  }),
  row({
    id: "pinterest",
    name: "Pinterest",
    domain: D.market,
    url: "https://www.pinterest.com/",
    what: t(
      "이미지를 보드에 모으는 서비스입니다. 저장소 문서는 보드를 Pin의 컬렉션으로 두는 구조와, 사용자가 추천 입력을 직접 조정하는 설정을 참고했습니다.",
      "A service for pinning images to boards. The repository drew on boards as collections of Pins and on settings that let people tune recommendation inputs directly.",
    ),
    learned: t(
      "배움: 보드 단위 저장은 유지하되 취향 수집보다 제공처·조회일·이용조건과 원문 링크를 앞에 둠. 추천 조정은 눈에 보이는 연출 모드 네 가지로, 숨은 순위나 행동 프로파일링 없이 브라우저 로컬 선택으로 구현.",
      "Learned: keep board-level saving but put source, viewed date, terms and the original link ahead of taste collecting. Tuning is four visible directing modes as a browser-local choice, with no hidden ranking or behavioral profiling.",
    ),
    overlap: t("리서치 데스크의 보드 저장과 오늘의 창작의 연출 모드.", "Board saving in the research desk and the directing modes of today's creation."),
    evidence: [RESEARCH_DESK, NOW_V2, NOW_V3, `${RESOURCES}/NowPage.tsx`],
  }),
  row({
    id: "raindrop-io",
    name: "Raindrop.io",
    domain: D.market,
    url: "https://raindrop.io/",
    what: t(
      "북마크 관리 서비스입니다. 저장소 문서는 컬렉션, 태그와 필터, 중복·깨진 링크 점검, 전문 검색, 영구 사본, 알림, 일괄 처리를 정리했습니다.",
      "A bookmark-management service. The repository noted collections, tags and filters, duplicate and broken-link checks, full-text search, permanent copies, reminders and batch processing.",
    ),
    learned: t(
      "배움: 스키마를 무리하게 늘리지 않고 설명 검색·제공처 분포·점진 렌더링·조회일 재확인 신호·검색 결과 출처 내보내기를 더함. 컬렉션 상태와 정리 필요 항목을 드러내는 방식을 근거 공백 지도에 적용.",
      "Learned: without stretching the schema, add description search, source distribution, progressive rendering, re-check signals for viewed dates and export of search-result sources. Its way of surfacing collection state informed the evidence-gap map.",
    ),
    overlap: t("리서치 데스크의 근거 공백 지도와 조회일 재확인.", "The research desk's evidence-gap map and viewed-date re-check."),
    evidence: [RESEARCH_DESK, "docs/creator-resources/research-desk-v2.md", EVIDENCE_SYNTHESIS, `${RESOURCES}/research-desk-session.ts`],
  }),
  row({
    id: "cosmos",
    name: "Cosmos",
    domain: D.market,
    url: "https://www.cosmos.so/",
    what: t(
      "발견·수집·정리를 취향 중심으로 줄여 주는 큐레이션 서비스입니다. 저장소 문서는 빠른 수집과 재사용, 컬렉션이 발견과 재사용 사이를 줄인다는 점을 참고했습니다.",
      "A curation service that shortens the path from discovery to reuse around taste. The repository drew on its fast capture, retrieval and collections.",
    ),
    learned: t(
      "배움: 고른 경로와 날짜별 제작 노트를 기기에 저장하고 휴대용 브리프로 함께 내보냄. 제3자 미디어 수집, 공개 프로필, 탐색 기록에서 취향 추론은 하지 않음.",
      "Learned: save the chosen route and date-scoped production note on the device and export them together as a portable brief. No third-party media ingestion, public profile or taste inference from browsing is added.",
    ),
    overlap: t("오늘의 창작(NowPage)의 경로 저장과 브리프 내보내기.", "Route saving and brief export in today's creation (NowPage)."),
    evidence: [NOW_V3, `${RESOURCES}/NowPage.tsx`],
  }),
  row({
    id: "daily-ui",
    name: "Daily UI",
    domain: D.market,
    url: "https://www.dailyui.co/",
    what: t(
      "하루 한 번 디자인 도전 과제를 내는 서비스입니다. 저장소 문서는 분명한 제약과 끝선이 연습을 반복 가능하게 만든다는 점을 참고했습니다.",
      "A service that sets one design challenge a day. The repository drew on how a clear constraint and finish line make practice repeatable.",
    ),
    learned: t(
      "배움: 다섯 단계 제작 루프, 연속 기록 계산, 20분 스프린트, 구조화된 브리프 복사. 이메일 수집·보상 장치·공개 제출 압박은 넣지 않았고, 하루를 못 해도 어제 기록이 바로 사라지지 않음.",
      "Learned: a five-step creation loop, streak calculation, a 20-minute sprint and a copyable structured brief. No email capture, reward mechanics or public-submission pressure, and missing a day does not wipe yesterday.",
    ),
    overlap: t("오늘의 창작(NowPage)의 일일 프롬프트와 스프린트.", "The daily prompt and sprint in today's creation (NowPage)."),
    evidence: [NOW_V2, NOW_V3, `${RESOURCES}/NowPage.tsx`],
  }),

  /* ───────────── 학습 ───────────── */

  row({
    id: "adobe-learn",
    name: "Adobe Learn",
    domain: D.market,
    url: "https://www.adobe.com/learn",
    what: t(
      "Adobe의 학습 사이트입니다. 저장소 문서는 앱·주제 탐색과 별도로 순차 학습 경로를 두고 수준·총 시간·단계를 밝히는 점을 비교했습니다.",
      "Adobe's learning site. The repository compared how it offers sequential learning paths apart from app and topic browsing, stating level, total time and steps.",
    ),
    learned: t(
      "배움: 독립 강좌는 유지하면서 권장 학습 경로 다섯 개와 경로 상세를 더하고, 이전·다음 강좌와 완료 뒤 복습 흐름으로 짧은 수업을 잇는다. 경로는 권장 순서일 뿐 잠그지 않음.",
      "Learned: keep standalone courses while adding five recommended paths with detail pages, and link short lessons through previous, next and post-completion review. Paths are a suggested order, never a lock.",
    ),
    overlap: t("배우기 홈의 학습 경로와 강좌 이전·다음 이동.", "Learning paths on the learn home and previous and next course navigation."),
    evidence: [LEARNING_HUB, GUIDED_LESSON, `${LEARN}/learning-paths.ts`, `${LEARN}/LearningHome.tsx`],
  }),
  row({
    id: "canva-design-school",
    name: "Canva Design School",
    domain: D.market,
    url: "https://www.canva.com/design-school/",
    what: t(
      "Canva의 학습 사이트입니다. 저장소 문서는 전역 검색, 주제 분류, 강좌·레슨·영상·활동·치트시트 같은 형식 구분, 초급·소요 시간 표시를 비교했습니다.",
      "Canva's learning site. The repository compared its global search, topic taxonomy, format split (courses, lessons, videos, activities, cheat sheets) and display of level and duration.",
    ),
    learned: t(
      "배움: 강좌 검색을 목표·난이도·시간·상태·역량 필터와 묶고, 과정·수준·시간·예제 유형·현재 상태를 학습 전에 보여 줌. 강좌 설명은 결과물 중심으로 씀.",
      "Learned: combine course search with goal, level, time, status and skill filters, and show course, level, time, exercise type and current status before learning. Course descriptions lead with the outcome.",
    ),
    overlap: t("배우기 홈의 필터와 강좌 카드 메타데이터.", "Filters and course-card metadata on the learn home."),
    evidence: [LEARNING_HUB, GUIDED_LESSON, `${LEARN}/learning-paths.ts`],
  }),
  row({
    id: "figma-learn",
    name: "Figma Learn",
    domain: D.market,
    url: "https://help.figma.com/hc/en-us/categories/360002051613-Figma-Learn",
    urlTitle: "Figma Learn",
    what: t(
      "Figma의 학습 모음입니다. 저장소 문서는 입문부터 산업별 실무까지 컬렉션으로 묶고 실제 프로젝트·사용 사례·모범 사례를 앞세우는 점을 비교했습니다.",
      "Figma's learning collection. The repository compared how it groups material from beginner to industry practice and leads with real projects, use cases and best practices.",
    ),
    learned: t(
      "배움: 개념 설명을 실제 웹툰 산출물과 툰스튜디오 자기주도 실습으로 연결. 완료 기록은 체크리스트와 확인 퀴즈를 통과한 자기주도 기록이며 공인 수료증으로 표현하지 않음.",
      "Learned: tie concept explanations to real webtoon deliverables and self-guided Studio practice. Completion is a self-directed record from a checklist and quiz, never presented as a certificate.",
    ),
    overlap: t("강좌별 결과물과 툰스튜디오 실습 진입점.", "Per-course deliverables and entry points to Studio practice."),
    evidence: [LEARNING_HUB, `${LEARN}/learning-paths.ts`],
  }),
  row({
    id: "webflow-university",
    name: "Webflow University",
    domain: D.market,
    url: "https://university.webflow.com/",
    what: t(
      "Webflow의 학습 사이트입니다. 저장소 문서는 강좌·학습 경로·영상·문서·인증을 목적별로 나누고 내 학습, 역할·목표 기반 경로, 체크리스트를 둔 점을 비교했습니다.",
      "Webflow's learning site. The repository compared how it separates courses, paths, videos, docs and certifications by purpose, with My Learning, role- and goal-based paths and checklists.",
    ),
    learned: t(
      "배움: 학습 홈·경로·용어·제품 실습·기록 관리의 목적을 나누고 현재 진행과 다음 행동을 앞에 둠. 수업 목차·조작형 예제·관련 용어·진행 요구사항을 한 화면에 이음.",
      "Learned: separate the purposes of learn home, paths, glossary, product practice and records, with progress and the next action up front. Lesson outline, interactive example, related terms and requirements sit on one screen.",
    ),
    overlap: t("배우기 홈과 강좌 상세(목차·조작형 예제·용어).", "The learn home and course detail (outline, interactive example, terms)."),
    evidence: [LEARNING_HUB, GUIDED_LESSON, `${LEARN}/LearningHome.tsx`],
  }),
  row({
    id: "unity-learn",
    name: "Unity Learn",
    domain: D.market,
    url: "https://learn.unity.com/",
    what: t(
      "Unity의 학습 사이트입니다. 저장소 문서는 단계별 튜토리얼과 프로젝트를 묶은 Pathway, 빠른 입문 가이드, 목표별 컬렉션, 결과물 제출 흐름을 비교했습니다.",
      "Unity's learning site. The repository compared its Pathways of step tutorials and projects, quick-start guides, goal-based collections and submission of finished work.",
    ),
    learned: t(
      "배움: 모든 강좌에 ‘완성할 것’을 표시하고, 15·30·45분 시간 예산에 맞춘 다음 세션을 자동으로 구성.",
      "Learned: mark what each course produces, and auto-build the next session to fit a 15, 30 or 45 minute time budget.",
    ),
    overlap: t("학습 프로필의 시간 예산과 다음 세션 추천.", "The learning profile's time budget and next-session suggestion."),
    evidence: [LEARNING_HUB, `${LEARN}/learning-profile.ts`, `${LEARN}/learning-paths.ts`],
  }),
  row({
    id: "procreate-beginners-series",
    name: "Procreate Beginners Series",
    domain: D.market,
    url: "https://procreate.com/beginners-series",
    what: t(
      "Procreate의 입문 시리즈입니다. 저장소 문서는 핵심 기능을 네 단계의 짧은 시리즈로 나누고 수업에서 바로 쓸 활동을 주며, 각 수업이 직접 만든 결과물로 끝나는 점을 비교했습니다.",
      "Procreate's beginners series. The repository compared how it splits core features into four short parts with ready-to-use activities, each lesson ending in something the learner made.",
    ),
    learned: t(
      "배움: 긴 종합 매뉴얼 대신 15·30·45분 세션과 작은 과제로 나누고, 강좌별 결과물과 직접 실습 과제를 상단에 먼저 보여 줌.",
      "Learned: split a long manual into 15, 30 and 45 minute sessions with small tasks, and show each course's deliverable and hands-on task at the top first.",
    ),
    overlap: t("강좌 카드의 결과물·실습 과제 표시.", "Deliverable and practice-task display on course cards."),
    evidence: [LEARNING_HUB, GUIDED_LESSON, `${LEARN}/learning-paths.ts`],
  }),
  row({
    id: "clip-studio-tips",
    name: "CLIP STUDIO TIPS",
    domain: D.market,
    url: "https://tips.clip-studio.com/en-us/official",
    what: t(
      "Clip Studio의 공식·사용자 튜토리얼 사이트입니다. 저장소 문서는 제작 단계와 기능별 분류, 첫 디지털 만화 제작 가이드를 비교했습니다.",
      "Clip Studio's site of official and user tutorials. The repository compared its split by production stage and feature, and its first-digital-comic guide.",
    ),
    learned: t(
      "배움: 제작 순서와 역량 분류를 함께 제공하고 ‘개념, 예제, 직접 실습, 확인, 기록’ 순서를 강화. 추천에는 현재 공식 강좌 데이터만 사용.",
      "Learned: offer production order and skill grouping together and reinforce the concept, example, practice, check, record sequence. Recommendations use only the current official course data.",
    ),
    overlap: t("강좌 상세의 실습 순서와 역량 지도.", "The practice sequence on course pages and the skill map."),
    evidence: [LEARNING_HUB, GUIDED_LESSON, `${LEARN}/learning-paths.ts`],
  }),
  row({
    id: "webtoon-academy",
    name: "WEBTOON Academy",
    domain: D.market,
    url: "https://www.webtoons.com/en/creators101/webtoon-academy",
    urlTitle: "WEBTOON Academy (Creators 101)",
    what: t(
      "WEBTOON의 창작자 교육·자료 모음(Creators 101)입니다. 저장소 문서는 창작·게시 단계별 공식 자료와 창작자 관점의 실전 주제를 비교했습니다.",
      "WEBTOON's creator education and resources collection (Creators 101). The repository compared its stage-by-stage official material on making and publishing, and practical topics from a creator's viewpoint.",
    ),
    learned: t(
      "배움: 첫 회차 제작과 게시 검수 경로를 따로 구성. 다르게 한 점: 이곳의 플랫폼 규격을 모든 곳에 통하는 규칙처럼 단정하지 않음.",
      "Learned: build separate paths for making a first episode and for pre-publish review. Done differently: this platform's specs are not stated as universal rules.",
    ),
    overlap: t("학습 경로 ‘첫 회차 게시 준비’와 플랫폼 규격 검사기.", "The 'prepare a first episode for release' path and the platform spec validator."),
    evidence: [LEARNING_HUB, `${LEARN}/learning-paths.ts`, "apps/web/src/domains/creator/assistant/webtoon-platform-spec-validator.ts"],
  }),

  /* ───────────── 웹툰 제작 보조 앱·사이트 ───────────── */

  row({
    id: "toonslicer",
    name: "ToonSlicer",
    domain: D.market,
    url: "https://toonslicer.com/",
    what: t(
      "긴 세로 원고를 플랫폼 규격에 맞춰 나눠 내보내는 웹툰 컷 자르기 도구입니다. 저장소 문서는 얼굴이나 말풍선 한가운데가 잘리지 않게 하는 안전 여백 절단을 핵심으로 적었습니다.",
      "A webtoon slicing tool that splits a long vertical manuscript to platform specs. The repository noted its safe-gutter cutting, which avoids cutting through a face or the middle of a balloon.",
    ),
    learned: t(
      "배움: 안전 여백을 찾아 절단선을 옮기고 반드시 재검증하는 자동 분할 계획(planAutoSlices). 이 사이트가 정리한 네이버웹툰 규격은 공식 출처가 아니므로 ‘외부 출처’ 신뢰도로 다룸.",
      "Learned: an automatic split plan (planAutoSlices) that finds a safe gutter, moves the cut and always re-verifies. The Naver Webtoon spec it summarizes is not an official source, so it is treated as an outside source.",
    ),
    overlap: t("플랫폼 규격 검사기와 보조 모달의 분할 계획 화면.", "The platform spec validator and the split-plan screen in the assistant modal."),
    evidence: [COMPANION, `${ASSISTANT}/webtoon-platform-spec-validator.ts`, `${ASSISTANT}/StudioWebtoonAssistantContent.tsx`],
  }),
  row({
    id: "spirall",
    name: "Spirall",
    domain: D.market,
    what: t(
      "Spirall Webtoon Previewer라는 이름의 도구로, 모바일에서 독자가 스크롤할 때의 연출 템포와 여백이 알맞은지 시뮬레이션한다고 보조 앱 문서가 적었습니다.",
      "A tool named Spirall Webtoon Previewer that, per the companion-apps document, simulates whether pacing and gutters feel right as a reader scrolls on mobile.",
    ),
    learned: t(
      "배움: 컷 사이 여백 길이로 연출 박자를 나누는 시뮬레이터(LlamaGen 행과 같은 모듈). 스크롤 속도·체류 시간은 1차 출처가 없는 추정값이라 임의로 바꾸지 않고 코드에 그 사실을 적음.",
      "Learned: a simulator that classifies pacing from gutter length (the same module as the LlamaGen row). Scroll speed and dwell time are estimates with no primary source, so they are left untouched and flagged in code.",
    ),
    overlap: t("웹툰 스크롤 페이싱 시뮬레이터.", "The webtoon scroll pacing simulator."),
    evidence: [COMPANION, `${ASSISTANT}/webtoon-scroll-pacing-simulator.ts`],
  }),
  row({
    id: "line-of-action",
    name: "Line of Action",
    domain: D.market,
    url: "https://line-of-action.com/",
    what: t(
      "인체 크로키를 연습하는 사이트입니다. 보조 앱 문서는 30·60·180초 인터벌 타이머와 동세선(C·S·직선) 안내를 정리했습니다.",
      "A site for practicing figure drawing. The companion-apps document noted its 30, 60 and 180 second interval timers and line-of-action (C, S, straight) guidance.",
    ),
    learned: t(
      "배움: 인터벌 크로키 타이머 모달과 동세선 안내, 아이레벨·로우앵글·하이앵글·더치 앵글의 네 가지 투시 가이드.",
      "Learned: an interval croquis timer modal with line-of-action guidance and four perspective guides (eye level, low angle, high angle, Dutch angle).",
    ),
    overlap: t("크로키·투시 가이드(webtoon-croquis-pose-guide).", "The croquis and perspective guide (webtoon-croquis-pose-guide)."),
    evidence: [COMPANION, `${ASSISTANT}/webtoon-croquis-pose-guide.ts`],
  }),
  row({
    id: "posemaniacs",
    name: "Posemaniacs",
    domain: D.market,
    url: "https://www.posemaniacs.com/",
    what: t(
      "3D 인체 포즈 참고와 크로키 연습을 돕는 사이트입니다. 보조 앱 문서와 3D 포즈 라이브러리 머리말이 모두 벤치마크로 이름을 적었습니다.",
      "A site for 3D figure pose reference and croquis practice. Both the companion-apps document and the 3D pose library's header name it as a benchmark.",
    ),
    learned: t(
      "배움: 인터벌 크로키 타이머와 동세선 안내, 손 표현을 포함한 3D 고급 포즈 라이브러리(VRoid·Mixamo와 함께 벤치마크로 적힘). 제품별 적용 범위는 문서에 따로 없음(미확인).",
      "Learned: an interval croquis timer with line-of-action guidance, and an advanced 3D pose library with hand expressions (named alongside VRoid and Mixamo). The per-product scope of adoption is not recorded (unconfirmed).",
    ),
    overlap: t("3D 고급 포즈·손 표현 라이브러리와 크로키 가이드.", "The advanced 3D pose and hand-expression library, and the croquis guide."),
    evidence: [COMPANION, `${CREATOR}/scene-3d/studio-3d-advanced-poses-library.ts`, `${ASSISTANT}/webtoon-croquis-pose-guide.ts`],
  }),
  row({
    id: "focusflow",
    name: "FocusFlow",
    domain: D.market,
    what: t(
      "에이콘3D의 웹툰 마감 보조로 보조 앱 문서가 적은 도구입니다. 여섯 단계 공정별 소요 시간을 기록하고 포모도로 집중 타이머와 마감 D-Day를 보여 준다고 정리했습니다.",
      "A deadline helper from Acon3D, per the companion-apps document. It records time per six production stages and shows a Pomodoro focus timer and a deadline countdown.",
    ),
    learned: t(
      "배움: 콘티·데생·선화·밑색·배경·식자의 공정별 누적 시간과 25/5·50/10·15/3 포모도로 프리셋. 코드 머리말도 이 도구를 벤치마크로 적음.",
      "Learned: cumulative time per stage (storyboard, rough, ink, base color, background, lettering) and Pomodoro presets of 25/5, 50/10 and 15/3. The code header also names it as a benchmark.",
    ),
    overlap: t("공정별 마감 타이머(webtoon-focus-timer).", "The per-stage deadline timer (webtoon-focus-timer)."),
    evidence: [COMPANION, `${ASSISTANT}/webtoon-focus-timer.ts`],
  }),

  /* ───────────── 레터링·현지화 기준 ───────────── */

  row({
    id: "blambot",
    name: "Blambot",
    domain: D.market,
    url: "https://blambot.com/",
    what: t(
      "만화 레터링 폰트와 ‘Comic Book Grammar & Tradition’ 글쓰기 관례를 공개하는 곳입니다. 현지화 문서는 이를 공개 출처로 적었습니다.",
      "A source of comic lettering fonts and the public 'Comic Book Grammar & Tradition' conventions. The localization document lists it as a public source.",
    ),
    learned: t(
      "배움: 가로 막대 I는 ‘I’와 약어에만, 끼어듦은 이중 대시, 여운은 세 점 말줄임표, 생각·무전·외국어·속삭임은 이탤릭 같은 관례를 문체 린터 규칙에 반영. 외국어 꺾쇠 관례는 예외로 풀 수 있음.",
      "Learned: conventions such as crossbar-I only for 'I' and abbreviations, a double dash for interruption, a three-dot ellipsis for trailing off, and italics for thought, radio, foreign speech and whispers feed the style linter. The foreign-speech bracket convention can be allowed as an exception.",
    ),
    overlap: t("영문 대사 문체 린터(studio-localization-style-lint).", "The English dialogue style linter (studio-localization-style-lint)."),
    evidence: [LOCALIZATION_QA, `${LETTERING}/studio-localization-style-lint.ts`],
  }),
  row({
    id: "comicraft",
    name: "Comicraft",
    domain: D.market,
    url: "https://www.comicraft.com/",
    what: t(
      "만화 레터링 업체입니다. 현지화 문서는 이 업체의 레터링 용어집을 공개 출처로 적었습니다.",
      "A comic lettering studio. The localization document lists its lettering glossary as a public source.",
    ),
    learned: t(
      "배움: 문서가 정리한 기준은 말풍선 여백이 글자 폭 한 자 안팎이고 양축 중앙 정렬이라는 것. 코드에 반영한 위치는 문서에 따로 없음(미확인).",
      "Learned: the document records its guidance that balloon padding is about one character width, centered on both axes. Where this is reflected in code is not recorded (unconfirmed).",
    ),
    overlap: t("말풍선 글자 맞춤 모듈(studio-bubble-text-fit)과 넘침 게이트.", "The balloon text-fit module (studio-bubble-text-fit) and the overflow gate."),
    evidence: [LOCALIZATION_QA, `${LETTERING}/studio-bubble-text-fit.ts`],
  }),
  row({
    id: "webtoon-english-style-guide",
    name: "WEBTOON English style guide",
    domain: D.market,
    what: t(
      "WEBTOON의 영문 번역 스타일 가이드로, 공개본 두 종을 현지화 문서가 근거로 삼았습니다. 대사 ALLCAPS, 말줄임표 세 점, 금지 문자, 효과음 단일 어근형, 모래시계 말풍선 금지 등을 담았습니다.",
      "WEBTOON's English translation style guide, of which the localization document used two public copies. It covers ALLCAPS dialogue, three-dot ellipses, banned characters, single-root sound effects and a ban on hourglass balloons.",
    ),
    learned: t(
      "배움: 열세 규칙의 영문 문체 린터를 만들고 발견마다 MQM 하위 유형에 연결, 규칙별로 켜고 끌 수 있게 함(성인물·작화 내 텍스트 예외). 시리즈별 용어집 강제는 이미 있던 번역 메모리가 맡음.",
      "Learned: build a 13-rule English style linter that maps each finding to an MQM subtype and can be toggled per rule (adult-title and in-art-text exceptions). Series glossary enforcement was already handled by the translation memory.",
    ),
    overlap: t("영문 대사 문체 린터와 MQM 채점.", "The English dialogue style linter and MQM scoring."),
    evidence: [LOCALIZATION_QA, `${LETTERING}/studio-localization-style-lint.ts`, `${LETTERING}/studio-localization-mqm.ts`],
  }),
];
