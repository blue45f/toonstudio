import { CREATOR, D, FIELD_NOTES, PLAYBOOK, listed, row, t, watch } from "./engineering-map-competitors-kit";

import type { EngineeringMapRow } from "./engineering-map-types";

/**
 * 경쟁·참고 제품 지도의 행 — 협업·가상공간, 콘티·검토, 디자인·문서 영역의 추가분.
 * 앞부분의 대표 제품(Figma·Gather·Storyboard Pro·Canva 등)은 engineering-map-competitors-rows.ts 에 있다.
 * 쓰는 규칙은 engineering-map-competitors-kit.ts 머리말을 따른다.
 */

const VIRTUAL_BENCH = `${CREATOR}/virtual-space/VIRTUAL_SPACE_BENCHMARK_2026-10-01.md`;
const OFFICE_BENCH = "docs/studio/virtual-studio-office-collaboration-benchmark-20260927.md";
const CONTROL_ROOM = "docs/storyboard-control-room-benchmark-2026-09-09.md";
const COMPETITOR_BENCH = "docs/studio-competitor-benchmark-2026-07-10.md";
const DIRECTOR_BENCH = "docs/reports/webtoon-ai-production-director-benchmark-2026-09-05.md";
const COMPOSER_BENCH = "docs/studio-ai-comic-composer-benchmark-2026-09.md";
const OUTBOX_BENCH = "docs/studio-draft-save-outbox-benchmark-2026-09.md";
const PROJECT_CENTER = "docs/studio-project-center-command-hub-2026-09-09.md";
const BUBBLE_BENCH = "docs/studio-bubble-library-benchmark-2026-09-09.md";
const RESEARCH_DESK = "docs/research-desk-benchmark-2026-09-09.md";
const EMERGING_REGISTRY = "docs/benchmarks/studio-emerging-product-registry.json";
const COMPETITOR_REGISTRY = "docs/benchmarks/studio-competitor-registry.json";
const COMMAND_SEARCH = `${CREATOR}/StudioCommandSearchDialog.tsx`;

/* ───────────── 협업·가상공간 ───────────── */

export const COMPETITOR_ROWS_COLLAB: readonly EngineeringMapRow[] = [
  row({
    id: "ovice",
    name: "oVice",
    domain: D.collab,
    url: "https://www.ovice.com/",
    what: t(
      "2D 가상 사무실 서비스입니다. 저장소 문서는 원형 아이콘과 영상 얼굴, 지도 보기(조감도)로 이동하기, 회의실 예약·멘션 채팅을 비교했습니다.",
      "A 2D virtual office service. The repository compared its round icons with live faces, map-view (bird's-eye) travel, and meeting-room booking and mention chat.",
    ),
    learned: t(
      "배움: 지도 보기에서 한 번에 이동하고 목록에서 사람 위치를 확인하는 방식(참고). 격차로 기록한 것: Slack·캘린더 같은 외부 연동과 브랜딩. 구현했다고는 적지 않음.",
      "Learned: one-step travel from a map view and finding people from a list (reference). Recorded as gaps: external links such as Slack and calendars, and branding. Not claimed as built.",
    ),
    overlap: t("가상 스튜디오의 미니맵·텔레포트와 회의 예약 패널.", "The Virtual Studio minimap, teleport and meeting-booking panel."),
    evidence: [VIRTUAL_BENCH, `${CREATOR}/virtual-space/StudioVirtualSpaceSpaceBookingPanel.tsx`, `${CREATOR}/virtual-space/StudioSpaceMapMenu.tsx`],
  }),
  row({
    id: "zep",
    name: "ZEP",
    domain: D.collab,
    url: "https://zep.us/en",
    what: t(
      "2D 가상 공간 서비스입니다. 저장소 문서는 타일마다 효과(통행 불가·시작점·포털·비공개 영역·스포트라이트)를 입히는 방식과 영역 ID로 떨어진 공간을 잇는 방식을 비교했습니다.",
      "A 2D virtual space service. The repository compared tile effects (impassable, spawn, portal, private area, spotlight) and linking separate spaces by an area ID.",
    ),
    learned: t(
      "배움: 타일 효과로 영역의 뜻을 데이터로 선언하는 방식. 참고만 한 것: 영역 ID로 분리된 공간을 하나로 잇는 발상(구현 여부는 문서에 없음).",
      "Learned: declare the meaning of an area as data through tile effects. Referenced only: linking separate spaces by an area ID (whether built is not recorded).",
    ),
    overlap: t("가상 스튜디오의 타일 효과 편집기(시작점·포털·비공개·조용한 구역).", "The Virtual Studio tile-effect editor (spawn, portal, private and silent zones)."),
    evidence: [VIRTUAL_BENCH, `${CREATOR}/virtual-space/StudioVirtualSpaceTileEffectEditor.tsx`],
  }),
  row({
    id: "topia",
    name: "Topia",
    domain: D.collab,
    url: "https://topia.io/",
    what: t(
      "2D 가상 공간 서비스입니다. 저장소 문서는 클릭으로 이동하기, 템플릿으로 세계 짓기, 이미지·오디오·웹링크·포털 임베드, 지정한 관리자의 공동 편집을 비교했습니다.",
      "A 2D virtual space service. The repository compared click-to-move, world building from templates, embedded images, audio, web links and portals, and co-editing by named admins.",
    ),
    learned: t(
      "배움: 포털·임베드로 공간을 잇는 구성과 공동 편집 권한 모델을 참고. 아바타 꾸미기는 참고할 점이 적다고 기록함.",
      "Learned: a layout that links spaces through portals and embeds, and its co-editing permission model, as references. Its avatar customization was recorded as having little to learn from.",
    ),
    overlap: t("가상 스튜디오의 앱 임베드 패널과 공간 이동(포털).", "The Virtual Studio app-embed panel and space travel (portals)."),
    evidence: [VIRTUAL_BENCH, `${CREATOR}/virtual-space/StudioVirtualSpaceAppEmbedPanel.tsx`],
  }),
  row({
    id: "spatial",
    name: "Spatial",
    domain: D.collab,
    url: "https://www.spatial.io/",
    what: t(
      "3D 가상 공간 서비스입니다. 저장소 문서는 셀카 한 장으로 만드는 3D 아바타(Ready Player Me 연동)와 실시간 표정, 공간 음성, 이미지·3D 모델 임베드를 정리했습니다.",
      "A 3D virtual space service. The repository noted selfie-based 3D avatars (via Ready Player Me), live facial expressions, spatial voice, and image and 3D model embeds.",
    ),
    learned: t(
      "배움: ‘누가 말하는지 입 모양으로 바로 보인다’는 기대치만 참고해 마이크 소리 크기를 입 모양 3단계로 바꾸는 립싱크 모듈을 만듦. 3D 아바타·표정 추적은 따르지 않음.",
      "Learned: only the expectation that you can see who is speaking, so a lip-sync module turns mic level into three mouth shapes. 3D avatars and expression tracking are not followed.",
    ),
    overlap: t("가상 스튜디오의 음성 연동 립싱크 모듈(순수 로직).", "The Virtual Studio voice-driven lip-sync module (pure logic)."),
    evidence: [VIRTUAL_BENCH, `${CREATOR}/virtual-space/studio-virtual-space-lipsync.ts`],
  }),
  row({
    id: "spatialchat",
    name: "SpatialChat",
    domain: D.collab,
    url: "https://spatial.chat/",
    what: t(
      "온라인 가상 공간 서비스입니다. 저장소 문서는 초대받은 손님을 인증 뒤 곧바로 해당 방으로 연결하는 도움말 한 편을 근거로 삼았습니다.",
      "An online virtual space service. The repository relied on one help article about sending an invited guest straight to a specific room after authentication.",
    ),
    learned: t(
      "배움: 목적지가 있는 초대는 인증을 거쳐 바로 그 방으로 연결. 다르게 한 점: 상대의 수락과 원고 접근 권한을 건너뛰지 않고 서버 검증을 유지. 제품 전체 비교는 아님.",
      "Learned: an invitation with a destination connects straight to that room after authentication. Done differently: the other person's acceptance and manuscript access are never skipped. Not a whole-product comparison.",
    ),
    overlap: t("팀원 목록의 검수 초대에서 고정 검수본 선택으로 이어지는 흐름.", "The review-invite flow from the teammate list into choosing a pinned review copy."),
    evidence: [OFFICE_BENCH, `${CREATOR}/virtual-space/StudioVirtualSpaceReviewPicker.tsx`],
  }),
  row({
    id: "sowork",
    name: "SoWork",
    domain: D.collab,
    url: "https://www.sowork.com/",
    what: t(
      "가상 사무실 서비스입니다. 저장소 문서는 사람의 위치와 진행 중인 회의를 보여 주는 대시보드, 상태 표시, 검색 가능한 업무 자료를 다룬 2026년 6·7월 업데이트를 근거로 삼았습니다.",
      "A virtual office service. The repository relied on its June and July 2026 updates about a dashboard of who is where and in which meeting, status display and searchable work material.",
    ),
    learned: t(
      "배움: 위치·작업 상태·접속 권한 역할로 팀원을 찾고 현황은 실제 접속 목록에서 계산. 안 한 점: 동의 없는 앱 사용 추적과 가상의 일정·회의 요약.",
      "Learned: find teammates by place, work status and access role, with counts computed from the real presence list. Not adopted: app-usage tracking without consent, and invented schedules or meeting summaries.",
    ),
    overlap: t("가상 스튜디오 팀원 패널의 검색·상태·역할 표시.", "Search, status and role display in the Virtual Studio teammate panel."),
    evidence: [OFFICE_BENCH, `${CREATOR}/virtual-space/studio-virtual-space-teammates.ts`, `${CREATOR}/virtual-space/StudioVirtualSpaceSocialPanel.tsx`],
  }),
  row({
    id: "teamflow",
    name: "Teamflow",
    domain: D.collab,
    url: "https://www.teamflowhq.com/",
    what: t(
      "가상 사무실 서비스입니다. 저장소 문서는 회의에 관련 문서와 앱을 함께 두어 자료를 다시 찾는 시간을 줄인다는 공식 제품 소개를 근거로 삼았습니다.",
      "A virtual office service. The repository relied on its official product page about keeping related documents and apps in the meeting to cut the time spent finding material again.",
    ),
    learned: t(
      "배움: 검수 초대에 고른 원고·검수·리비전의 고정 참조를 유지. 다르게 한 점: 최신 편집본으로 바꾸거나 초대만으로 편집 권한을 주지 않음. 근거가 제품 소개라 세부 구현은 확인하지 못함.",
      "Learned: keep the pinned reference to the chosen manuscript, review and revision on a review invite. Done differently: it never swaps to the latest edit or grants edit rights by invitation. The source is a product page, so details are unconfirmed.",
    ),
    overlap: t("검수 초대의 고정 검수본 참조(StudioVirtualSpaceReviewPicker).", "The pinned review-copy reference on review invites (StudioVirtualSpaceReviewPicker)."),
    evidence: [OFFICE_BENCH, `${CREATOR}/virtual-space/StudioVirtualSpaceReviewPicker.tsx`],
  }),
  row({
    id: "figjam",
    name: "FigJam",
    domain: D.collab,
    url: "https://www.figma.com/figjam/",
    what: t(
      "Figma의 온라인 화이트보드입니다. 저장소 문서는 키보드로 여는 빠른 작업 막대(동작이나 개체를 입력하고 Enter로 실행)와 스크린 리더 흐름을 비교했습니다.",
      "Figma's online whiteboard. The repository compared its keyboard-first quick-action bar (type an action or object, press Enter) and its screen-reader flow.",
    ),
    learned: t(
      "배움: 검색 결과가 Enter를 누르면 무엇이 실행되는지 알려 주고, 눈에 보이는 메뉴와 같은 처리기를 실행. 안 한 점: 정적인 두 번째 팔레트를 따로 만드는 것.",
      "Learned: results say what Enter will do and run the same handler as the visible menu. Not adopted: a separate, static second palette.",
    ),
    overlap: t("스튜디오 명령 검색(Command/Control+K).", "The Studio command search (Command/Control+K)."),
    evidence: ["docs/studio-command-hub-benchmark-2026-09-09.md", COMMAND_SEARCH, "apps/web/src/shared/lib/studio-command-search-bridge.ts"],
  }),
  row({
    id: "liveblocks",
    name: "Liveblocks",
    domain: D.collab,
    url: "https://liveblocks.io/",
    what: t(
      "실시간 협업 기능을 개발자에게 제공하는 서비스입니다. 저장소 문서는 연결·접속 상태를 드러내고 재연결을 알려 주는 사용자 경험을 근거로 삼았습니다.",
      "A service that gives developers real-time collaboration features. The repository relied on its user experience of exposing connection and presence status and signalling reconnection.",
    ),
    learned: t(
      "배움: 문서 안전(저장 확인)과 일회성 커서 품질을 다른 신호로 나눠 보임. 다르게 한 점: 이 서비스를 쓰지 않고 자체 서버와 Yjs 기반 동기화로 구현.",
      "Learned: show document safety (save acknowledgement) and disposable cursor quality as separate signals. Done differently: this service is not used; sync is built in-house on a server and Yjs.",
    ),
    overlap: t("실시간 협업의 전송 상태와 커서 품질 표시.", "Live collaboration transport status and cursor-quality indicator."),
    evidence: ["docs/realtime-collaboration-benchmark-2026-09-04.md", `${CREATOR}/live/StudioLiveCollaborationProvider.tsx`],
  }),
  row({
    id: "toon-boom-producer",
    name: "Toon Boom Producer",
    domain: D.collab,
    url: "https://www.toonboom.com/products/producer",
    what: t(
      "애니메이션 제작 관리 도구입니다. 저장소 문서는 제작 단계·작업·에셋·장면·팀·진행률과 보고서를 한 제작 문맥에서 잇는 방식을 비교했습니다.",
      "An animation production-management tool. The repository compared how it ties stages, tasks, assets, scenes, teams, progress and reports into one production context.",
    ),
    learned: t(
      "배움: 직군별 작업 셀, 회차 필터, 잔여 공수, 차단·검수·인력 공백 지표. 다르게 한 점: 외형을 따라 하지 않고 웹툰의 열 개 직군 모델로 재구성.",
      "Learned: role work cells, episode filters, remaining effort, and blocked, review and staffing-gap indicators. Done differently: the look is not copied; the idea is rebuilt around ten webtoon roles.",
    ),
    overlap: t("제작 허브의 직군별 작업 공간(10개 작업 셀).", "The production hub's role workspace (ten work cells)."),
    evidence: ["docs/webtoon-production-role-workcells-v5.md", `${CREATOR}/production-hub/ProductionRoleWorkspace.tsx`],
  }),
  row({
    id: "kitsu",
    name: "Kitsu",
    domain: D.collab,
    url: "https://www.cg-wire.com/kitsu/",
    what: t(
      "제작 진행을 추적하는 도구입니다. 저장소 문서는 작업 유형별 흐름, 부서별 대기열, 제출 버전, 감독 검토, 보고서 필터를 비교했습니다.",
      "A tool for tracking production progress. The repository compared task-type workflows, per-department queues, submitted versions, supervisor review and report filters.",
    ),
    learned: t(
      "배움: 직군별 대기열, 담당자와 검수자 분리, 단계 게이트, 역할·범위 기반 자동 배치. 외형 복제는 하지 않음.",
      "Learned: per-role queues, separate assignee and reviewer, stage gates, and role- and scope-based auto assignment. Its look is not copied.",
    ),
    overlap: t("제작 허브의 직군별 작업 공간과 검수 대기열.", "The production hub's role workspace and review queues."),
    evidence: ["docs/webtoon-production-role-workcells-v5.md", `${CREATOR}/production-hub/ProductionRoleWorkspace.tsx`],
  }),
  watch({
    id: "raster",
    name: "Raster",
    domain: D.collab,
    url: "https://raster.app/",
    registry: "emerging",
    category: "collaboration-design",
    priority: "P0",
    focus: t("에셋 변형본, 기본 버전 지정, 에이전트 자동화, 영상 변형본, 검토 흐름", "asset variants, default-version choice, agent automation, video variants and review workflow"),
  }),
];

/* ───────────── 콘티·검토 ───────────── */

export const COMPETITOR_ROWS_STORYBOARD: readonly EngineeringMapRow[] = [
  row({
    id: "adobe-firefly-boards",
    name: "Adobe Firefly Boards",
    domain: D.storyboard,
    url: "https://www.adobe.com/products/firefly/features/storyboard.html",
    urlTitle: "Adobe Firefly Boards storyboard page",
    what: t(
      "Adobe의 AI 보드형 콘티 기능입니다. 저장소 문서는 텍스트·스크립트·참조 이미지로 장면 만들기, 패널 간 일관성, 패널 리믹스, 댓글 협업, 카메라 움직임 미리보기를 정리했습니다.",
      "Adobe's AI board-style storyboard feature. The repository noted scene generation from text, scripts and references, panel-to-panel consistency, panel remix, comment collaboration and camera-move previews.",
    ),
    learned: t(
      "배움: AI 생성량을 늘리기보다 생성 결과를 검토 상태·샷 정보·담당자 기준으로 사람이 통제하는 운영 계층을 강화. 같은 일을 하는 AI 엔진을 새로 만들지는 않음.",
      "Learned: rather than adding more generation, strengthen the operations layer where people control results by review status, shot data and assignee. No duplicate AI engine was built.",
    ),
    overlap: t("콘티 컨트롤 룸과 AI 스토리보드 디렉터.", "The Storyboard Control Room and the AI storyboard director."),
    evidence: [CONTROL_ROOM, `${CREATOR}/studio-storyboard-control-room.ts`, `${CREATOR}/StudioStoryboardGridPanel.tsx`],
  }),
  row({
    id: "canva-storyboard",
    name: "Canva Storyboard",
    domain: D.storyboard,
    url: "https://www.canva.com/create/storyboards/",
    urlTitle: "Canva storyboard maker",
    what: t(
      "Canva의 스토리보드 메이커입니다. 저장소 문서는 템플릿, 드래그 앤 드롭, 대규모 스톡 라이브러리, AI 스토리·이미지 생성, 실시간 공동 편집과 클라이언트 공유를 정리했습니다.",
      "Canva's storyboard maker. The repository noted templates, drag and drop, a large stock library, AI story and image generation, live co-editing and client sharing.",
    ),
    learned: t(
      "배움: 검색·밀도 조절·터치 접근성은 소비자 도구 수준으로 단순하게. 다르게 한 점: 자산 수 경쟁 대신 제작 상태·샷 정보·승인 흐름을 앞에 둠.",
      "Learned: keep search, density control and touch access as simple as a consumer tool. Done differently: instead of competing on asset counts, production status, shot data and approvals come first.",
    ),
    overlap: t("콘티 컨트롤 룸의 검색·밀도 조절·보드 뷰.", "Search, density control and board view in the Storyboard Control Room."),
    evidence: [CONTROL_ROOM, `${CREATOR}/StudioStoryboardGridPanel.tsx`],
  }),
  row({
    id: "studiobinder",
    name: "StudioBinder",
    domain: D.storyboard,
    url: "https://www.studiobinder.com/",
    what: t(
      "영상 제작 관리 서비스입니다. 저장소 문서는 스크립트 가져오기, 장면·샷 태그, 사용자 정의 그룹, 댓글·작업, 보기 전용 공유, 샷리스트를 비교했습니다.",
      "A video production-management service. The repository compared script import, scene and shot tags, custom groups, comments and tasks, view-only sharing and shot lists.",
    ),
    learned: t(
      "배움: 원본 순서와 상태별 작업 큐를 따로 보여 주고, 담당자·상태·잠금을 제작 운영 정보로 다룸.",
      "Learned: show the original order and per-status work queues separately, and treat assignee, status and lock as production-operations data.",
    ),
    overlap: t("콘티 컨트롤 룸의 시퀀스 뷰와 검토 큐 뷰.", "The Control Room's sequence view and review-queue view."),
    evidence: [CONTROL_ROOM, `${CREATOR}/studio-storyboard-control-room.ts`],
  }),
  row({
    id: "storyboarder",
    name: "Storyboarder",
    domain: D.storyboard,
    url: "https://wonderunit.com/storyboarder/",
    what: t(
      "Wonder Unit이 만든 오픈소스 스토리보드 도구입니다. 저장소 문서는 빠른 드로잉, 샷 종류·타이밍·대사, Photoshop 왕복, 내보내기, 3D 샷 생성기를 비교했습니다.",
      "An open-source storyboard tool from Wonder Unit. The repository compared quick sketching, shot type, timing and dialogue, a Photoshop round trip, export and a 3D shot generator.",
    ),
    learned: t(
      "배움: 샷 종류와 카메라 앵글 태그가 빠진 페이지를 그리드에서 바로 찾게 함. 기존 샷 태그와 3D 도구는 그대로 유지.",
      "Learned: pages missing a shot type or camera angle tag can be found at once in the grid. The existing shot tags and 3D tools stay as they are.",
    ),
    overlap: t("콘티 컨트롤 룸의 샷 유형·카메라 앵글 태그와 누락 표시.", "Shot-type and camera-angle tags and missing-data flags in the Control Room."),
    evidence: [CONTROL_ROOM, COMPETITOR_REGISTRY, `${CREATOR}/StudioStoryboardGridPanel.tsx`],
  }),
  row({
    id: "milanote",
    name: "Milanote",
    domain: D.storyboard,
    url: "https://milanote.com/",
    what: t(
      "무한 캔버스에 이미지·영상·PDF를 섞어 배치하는 보드형 도구입니다. 콘티 문서와 리서치 데스크 문서 두 곳이 비교 대상으로 올렸습니다.",
      "A board tool that mixes images, video and PDFs on an infinite canvas. Both the storyboard document and the research-desk document compared it.",
    ),
    learned: t(
      "배움: 자유 배치보다 페이지 순서를 정본으로 두되 검색·밀도 조절·보드 뷰로 탐색을 빠르게. 리서치 데스크에는 ‘수집 전에 맥락을 만든다’는 흐름만 번역.",
      "Learned: keep page order authoritative rather than free placement, and speed up browsing with search, density control and board view. The research desk took only the idea of building context before collecting.",
    ),
    overlap: t("콘티 컨트롤 룸의 보드 뷰와 리서치 데스크의 조사 렌즈.", "The Control Room's board view and the research desk's research lens."),
    evidence: [CONTROL_ROOM, RESEARCH_DESK, `${CREATOR}/StudioStoryboardGridPanel.tsx`, "apps/web/src/domains/creator-resources/research-desk-session.ts"],
  }),
  row({
    id: "animatic-app",
    name: "Animatic.app",
    domain: D.storyboard,
    url: "https://www.animatic.app/",
    what: t(
      "애니매틱(움직이는 콘티)을 만드는 웹 도구입니다. 저장소 문서는 프레임별 메모·대사·효과음, 팀·클라이언트 초대, 음높이를 바꿀 수 있는 오디오를 비교했습니다.",
      "A web tool for making animatics (storyboards played as video). The repository compared per-frame notes, dialogue and sound effects, team and client invites, and pitch-adjustable audio.",
    ),
    learned: t(
      "배움: 페이지 메모와 검토 메모가 검색과 CSV 인계에서 사라지지 않게 통합. 안 한 점: 이미 있는 애니매틱 작업 공간과 겹치는 기능을 다시 만들기.",
      "Learned: page notes and review notes now survive search and CSV hand-off. Not adopted: rebuilding features that already exist in the animatic workspace.",
    ),
    overlap: t("콘티 컨트롤 룸의 CSV 인계와 애니매틱 작업 공간.", "The Control Room's CSV hand-off and the animatic workspace."),
    evidence: [CONTROL_ROOM, `${CREATOR}/animatic/StudioAnimaticWorkspacePanel.tsx`],
  }),
  row({
    id: "storyboardhero",
    name: "StoryboardHero",
    domain: D.storyboard,
    url: "https://storyboardhero.ai/",
    what: t(
      "AI 스토리보드 서비스입니다. 저장소 문서는 대본 가져오기, 장면·샷 자동 분해, 저장 캐릭터, 샷 종류·원근·초점·조명 설정, 공유·댓글을 정리했습니다.",
      "An AI storyboard service. The repository noted script import, automatic scene and shot breakdown, saved characters, shot type, perspective, focus and lighting settings, sharing and comments.",
    ),
    learned: t(
      "배움: 장면 제목과 줄바꿈을 먼저 읽어 장면을 나누고, 컷별 샷·앵글·감정·대사를 생성 묶음에 기록.",
      "Learned: split scenes by reading scene titles and line breaks first, and record each cut's shot, angle, emotion and dialogue in the generation bundle.",
    ),
    overlap: t("에피소드 프로덕션 디렉터의 장면·컷 구조.", "The scene and cut structure of the episode production director."),
    evidence: [DIRECTOR_BENCH, `${CREATOR}/ai/studio-ai-episode-production-director.ts`],
  }),
  row({
    id: "ltx-studio",
    name: "LTX Studio",
    domain: D.storyboard,
    url: "https://ltx.io/studio",
    urlTitle: "LTX Studio",
    what: t(
      "대본에서 샷 목록·스토리보드·영상까지 한 제작 흐름으로 잇는 AI 서비스입니다. 저장소 문서는 도구를 오가며 생기는 인계 손실을 줄이는 점을 비교했습니다.",
      "An AI service that links script, shot list, storyboard and video in one flow. The repository compared how it reduces hand-off loss from switching tools.",
    ),
    learned: t(
      "배움: 기능 목록보다 작업 순서(대본, 기준 고정, 생성, 검수)를 앞세운 4단계 화면과, 에피소드 계획을 편집 가능한 컷으로 넘기는 핸드오프.",
      "Learned: a four-step screen led by work order (script, reference lock, generate, review) rather than a feature list, and a hand-off that turns the episode plan into editable cuts.",
    ),
    overlap: t("에피소드 프로덕션 디렉터와 AI 코믹 컴포저 핸드오프.", "The episode production director and the AI Comic Composer hand-off."),
    evidence: [COMPOSER_BENCH, DIRECTOR_BENCH, EMERGING_REGISTRY, `${CREATOR}/ai/studio-ai-comic-composer-handoff.ts`],
  }),
  watch({
    id: "frameforge",
    name: "FrameForge",
    domain: D.storyboard,
    url: "https://www.storyboardsmarter.com/",
    registry: "competitor",
    category: "storyboard",
    priority: "P2",
    focus: t("프리비주얼라이제이션, 카메라, 블로킹, 샷, 3D", "previsualization, camera, blocking, shots and 3D"),
  }),
  row({
    id: "storyboard-that",
    name: "Storyboard That",
    domain: D.storyboard,
    url: "https://www.storyboardthat.com/",
    what: t(
      "웹 스토리보드 서비스입니다. 저장소 문서는 내장 캐릭터 포즈·색 변경, 최대 100셀, 레이어·정렬·잠금, 셀 오디오, 교육판의 실시간 공동 편집과 수정 이력을 정리했습니다.",
      "A web storyboard service. The repository noted built-in character poses and color changes, up to 100 cells, layers, alignment and locks, cell audio, and live co-editing and revision history in its education edition.",
    ),
    learned: t(
      "배움: 이름 있는 복구 지점과, 텍스트 장면 설계를 이미지 생성과 분리하는 비트 시트 검토 단계(제품군 기록). 전용 생성형 이미지 기능은 공식 문서에서 확인하지 못함.",
      "Learned: named recovery points and a beat-sheet review step that splits text scene design from image generation (group-level record). A dedicated image-generation feature was not found in its official docs.",
    ),
    overlap: t("AI 비트 시트 검토 게이트와 이름 있는 체크포인트.", "The AI beat-sheet review gate and named checkpoints."),
    evidence: [COMPETITOR_BENCH, BUBBLE_BENCH, `${CREATOR}/StudioCheckpointPanel.tsx`],
  }),
  row({
    id: "pixton",
    name: "Pixton",
    domain: D.storyboard,
    url: "https://www.pixton.com/",
    what: t(
      "웹에서 만화를 만드는 서비스입니다. 저장소 문서는 이야기 시작 도우미, 다양한 아바타의 포즈·표정·의상, 말풍선·효과음, 문장으로 장면 소재를 찾는 검색을 정리했습니다.",
      "A web service for making comics. The repository noted story starters, diverse avatars with poses, expressions and outfits, balloons and sound effects, and sentence-based scene search.",
    ),
    learned: t(
      "배움(제품군 기록): 완성 초안에서 국소 수정으로 가는 흐름과 쉬운 캐릭터·장면 조립. 이 제품만의 적용 위치는 문서에 따로 없음(미확인).",
      "Learned (group-level record): the path from a finished draft to local edits, and easy character and scene assembly. No product-specific place of adoption is recorded (unconfirmed).",
    ),
    overlap: t("빠른 웹툰 조립의 적용 전 프리플라이트(제품군 단위로 비교).", "The quick-comic assembly preflight (compared at group level)."),
    evidence: [COMPETITOR_BENCH, "docs/studio-commercial-manual-benchmark-2026-07-10.md", `${CREATOR}/comic/studio-quick-comic-preflight.ts`],
  }),
  row({
    id: "syncsketch",
    name: "SyncSketch",
    domain: D.storyboard,
    url: "https://syncsketch.com/",
    what: t(
      "영상·애니메이션 검토용 서비스입니다. 저장소 문서는 발표 모드, 동기화 입장과 나가기, 검토 항목에서 특정 프레임·의견으로 돌아가는 링크, 내보내기와 접근 회수의 구분을 비교했습니다.",
      "A review service for video and animation. The repository compared presentation mode, joining and leaving sync, links back to a specific frame and comment, and exporting versus revoking access.",
    ),
    learned: t(
      "배움: 검토 모드의 기본 도구를 ‘이동’으로 두어 실수로 그리지 않게 하고, 작업 원본과 검토 주석을 다른 문서 가지로 분리. 일부는 목표 단계로 기록됨(구현 범위는 문서별로 다름).",
      "Learned: default the review tool to Move so nothing is drawn by accident, and keep annotations on a separate branch from the source. Some items are recorded as targets, so how much is built differs by document.",
    ),
    overlap: t("고정 검토 패널(같은 컷 검토, 수정, 재검토)과 검토 주석.", "The pinned review panel (review, fix and re-review the same cut) and review annotations."),
    evidence: [
      "docs/studio/virtual-studio-creative-review-benchmark-20260920.md",
      "docs/architecture/ToonStudio_최종공유본_초확장_멀티엔진_제품기능_UIUX_성능품질_아키텍처_V5_2026-08-07.md",
      `${CREATOR}/virtual-space/StudioPinnedReviewPanel.tsx`,
    ],
  }),
  listed({
    id: "mangoboard",
    name: "Mangoboard",
    domain: D.storyboard,
    url: "https://www.mangoboard.net/",
    what: t(
      "문서가 ‘망고보드’라는 이름만 적은 국내 서비스입니다. 경쟁사 기능 문서의 6차 배치 제목에 벤치마크 대상으로 이름이 올랐습니다.",
      "A Korean service that the document names only as 'Mangoboard'. Its name appears in the title of the sixth batch in the competitor-features document as a benchmark source.",
    ),
    evidence: ["docs/studio-competitor-features.md"],
    note: t("항목별 근거는 문서에 없음.", "The document gives no item-level basis."),
  }),
];

/* ───────────── 디자인·문서 ───────────── */

export const COMPETITOR_ROWS_DESIGN: readonly EngineeringMapRow[] = [
  row({
    id: "figma-slides",
    name: "Figma Slides",
    domain: D.design,
    url: "https://www.figma.com/slides/",
    what: t(
      "Figma의 발표 자료 기능입니다. 기술 자료 플레이북은 Canva·Adobe Express와 묶어 ‘템플릿에서 편집·공유까지’ 이어지는 짧은 첫 성공 경로를 참고했다고 적었습니다.",
      "Figma's presentation feature. The tech playbook groups it with Canva and Adobe Express for the short path from a template to editing and sharing.",
    ),
    learned: t(
      "배움: 템플릿에서 발표 모드와 공유로 이어지는 짧은 길. 다르게 한 점: 발표 덱을 같은 원본 데이터에서 만들어 화면과 문서가 어긋나지 않게 함.",
      "Learned: a short path from template to presentation mode and sharing. Done differently: the deck is generated from the same source data so screen and document do not drift.",
    ),
    overlap: t("기술 자료의 발표 모드(발표 덱).", "The presentation mode of the tech pages (the talk deck)."),
    evidence: [PLAYBOOK, FIELD_NOTES, "apps/web/src/domains/legal/technology/engineering-talk-deck.ts"],
  }),
  row({
    id: "notion",
    name: "Notion",
    domain: D.design,
    url: "https://www.notion.com/",
    what: t(
      "문서와 검색·라이브러리를 갖춘 작업 공간 도구입니다. 저장소 문서는 오프라인 작업과 백그라운드 동기화, 버전 복원, 전역 검색·라이브러리, 사이드바 탐색을 비교했습니다.",
      "A workspace tool with documents, search and a library. The repository compared offline work with background sync, version restore, global search and library, and sidebar navigation.",
    ),
    learned: t(
      "배움: 온라인 복귀 때 자동 재시도하되 실패와 충돌은 기존 검토 흐름으로 돌림. 프로젝트 센터 검색은 이름을 설명보다 위로 순위. 홈 검색은 공통 검색에 연결.",
      "Learned: retry on reconnect but route failures and conflicts to the existing review flow. Project-center search ranks labels above descriptions, and the home search opens the shared search.",
    ),
    overlap: t("초안 저장 outbox와 프로젝트 센터 명령 검색.", "The draft-save outbox and the project-center command search."),
    evidence: [OUTBOX_BENCH, PROJECT_CENTER, "docs/design/reference-design-audit-20260928.md", `${CREATOR}/studio-draft-save-outbox.ts`, `${CREATOR}/studio-project-center-search-model.ts`],
  }),
  row({
    id: "google-docs",
    name: "Google Docs",
    domain: D.design,
    url: "https://support.google.com/docs/answer/6388102",
    urlTitle: "Google Docs offline help",
    what: t(
      "웹에서 함께 쓰는 문서 도구입니다. 저장소 문서는 오프라인 편집 준비 여부를 문서 상태에서 확인하는 방식과 동기화 문제를 명시하는 방식을 근거로 삼았습니다.",
      "A web document tool for working together. The repository relied on how it shows whether a file is ready for offline editing and how it reports sync problems.",
    ),
    learned: t(
      "배움: 예약이 새로고침 뒤에도 복구되는지를 사용자에게 정직하게 표시. 다르게 한 점: 본문은 로컬 OPFS/SQLite에 두고 서버 전송 의도만 내용 없는 outbox로 보관.",
      "Learned: tell users honestly whether a queued save survives a reload. Done differently: the body stays in local OPFS/SQLite and only the server-send intent is kept in a content-free outbox.",
    ),
    overlap: t("초안 저장 센터의 서버 저장 예약(outbox) 표시.", "Server-save reservation (outbox) display in the draft-save center."),
    evidence: [OUTBOX_BENCH, `${CREATOR}/studio-draft-save-outbox.ts`, `${CREATOR}/StudioDraftSaveCenter.tsx`],
  }),
  row({
    id: "microsoft-365",
    name: "Microsoft 365",
    domain: D.design,
    url: "https://www.microsoft.com/microsoft-365",
    what: t(
      "문서·표·발표 도구 묶음입니다. 저장소 문서는 자동 저장, 자동 복구, 버전 기록을 서로 다른 보호 계층으로 다루는 방식을 근거로 삼았습니다.",
      "A suite of document, spreadsheet and presentation tools. The repository relied on how it treats AutoSave, AutoRecover and Version History as separate protection layers.",
    ),
    learned: t(
      "배움: 기기 복구, 서버 저장 예약, 서버 개정을 하나의 ‘저장됨’ 값으로 합치지 않음.",
      "Learned: never collapse device recovery, the server-save reservation and server revisions into one 'saved' flag.",
    ),
    overlap: t("초안 저장 센터의 세 가지 저장 권위 분리.", "The draft-save center's separation of three save authorities."),
    evidence: [OUTBOX_BENCH, `${CREATOR}/studio-draft-save-center-model.ts`],
  }),
  row({
    id: "linear",
    name: "Linear",
    domain: D.design,
    url: "https://linear.app/",
    what: t(
      "이슈·프로젝트 관리 도구입니다. 저장소 문서는 공통 프레임, 표면·텍스트의 의미 토큰, 화면 간 정렬을 맞춘 UI 개편을 사이트 디자인의 참고로 적었습니다.",
      "An issue and project management tool. The repository cited its UI refresh, with a shared frame, semantic tokens for surfaces and text, and cross-screen alignment, as a site design reference.",
    ),
    learned: t(
      "배움: 헤더·컨테이너·섹션을 같은 규격으로 맞추고 본문을 사이드바보다 강조. 다르게 한 점: 화면이나 자산을 복제하지 않고 각 제작 도구의 배치를 보존.",
      "Learned: align header, container and section to one spec and emphasize the body over the sidebar. Done differently: no screens or assets are copied and each production tool keeps its layout.",
    ),
    overlap: t("사이트 공통 셸(1320px 외곽 폭, 의미 색상 토큰).", "The sitewide shell (1320px outer width, semantic color tokens)."),
    evidence: ["docs/design/sitewide-design-unification-20260927.md", "docs/design/reference-design-audit-20260928.md"],
  }),
  row({
    id: "framer",
    name: "Framer",
    domain: D.design,
    url: "https://www.framer.com/",
    what: t(
      "웹사이트를 디자인하고 게시하는 도구입니다. 저장소 문서는 작품 이미지 중심의 카드와 목적별 탐색·필터를 가진 템플릿 마켓을 사이트 디자인의 참고로 적었습니다.",
      "A tool for designing and publishing websites. The repository cited its template marketplace, with image-led cards and purpose-based browsing and filters, as a site design reference.",
    ),
    learned: t(
      "배움: 조작부를 정돈하고 시각적 무게를 콘텐츠 아트에 둠. 다르게 한 점: 외형 복제 없이 카드 구성 원칙만 참고.",
      "Learned: tidy the controls and put the visual weight on content art. Done differently: only the card composition principle is referenced, with no copied look.",
    ),
    overlap: t("공개 목록·마켓 카드의 작품 중심 배치.", "Artwork-led layout of public lists and market cards."),
    evidence: ["docs/design/sitewide-design-unification-20260927.md"],
  }),
  row({
    id: "miricanvas",
    name: "MiriCanvas",
    domain: D.design,
    url: "https://www.miricanvas.com/en",
    what: t(
      "국내 디자인 템플릿 도구로 문서가 ‘미리캔버스’라고 적었습니다. 한국어 디자인 제작, 요소 사용·재편집 안내, ‘비슷한 요소 찾기’, 멀티미디어 요소가 참고 대상이었습니다.",
      "A Korean design-template tool that the document names 'MiriCanvas'. Korean-language design, its element use and re-edit guidance, 'find similar elements' and multimedia elements were references.",
    ),
    learned: t(
      "배움: 프레임 안 이미지 자동 맞춤, 같은 범주의 다른 소재 더 보기(유사 스타일), 움직이는 GIF 요소 보존, 한글 줄바꿈·정보 위계 운영 템플릿. 카드뉴스 대량 생성은 웹툰과 맞지 않아 미룸.",
      "Learned: auto-fit of images in a frame, more items of the same kind (similar style), keeping animated GIFs, and Korean line-break and hierarchy templates. Bulk card-news generation does not suit webtoons and is deferred.",
    ),
    overlap: t("패널 자동 맞춤, 유사 스타일 보기, GIF 요소.", "Panel auto-fit, similar-style browsing and the GIF element."),
    evidence: [
      "docs/studio-competitor-features.md",
      "docs/studio-asset-quality-benchmark-20260906.md",
      `${CREATOR}/studio-panel-autofit.ts`,
      `${CREATOR}/studio-similar-style.ts`,
      `${CREATOR}/studio-gif-element.ts`,
    ],
  }),
  row({
    id: "comic-life",
    name: "Comic Life",
    domain: D.design,
    url: "https://plasq.com/apps/comiclife/macwin/features-galore/",
    urlTitle: "Comic Life features",
    what: t(
      "만화 페이지를 꾸미는 앱입니다. 저장소 문서는 드래그 삽입, 꼬리 곡률 핸들, 다중 꼬리, 연결·확장 말풍선, 스크립트 중심 제작을 비교했습니다.",
      "An app for laying out comic pages. The repository compared drag insertion, tail-curvature handles, multiple tails, linked and extended balloons and script-led production.",
    ),
    learned: t(
      "배움: 말풍선 반복 삽입을 ‘최근 다시 넣기’와 스크립트 맥락 추천으로 단축. 드래그 삽입·다중 꼬리·스크립트 일괄 삽입은 이미 있던 기능으로 대조.",
      "Learned: shorten repeated balloon insertion with 'insert again' and script-based suggestions. Drag insertion, multiple tails and script batch insertion were compared as features that already existed.",
    ),
    overlap: t("말풍선 라이브러리의 최근 사용과 대사 맥락 추천.", "Recent use and dialogue-aware suggestions in the bubble library."),
    evidence: [BUBBLE_BENCH, `${CREATOR}/lettering/studio-bubble-library.ts`, `${CREATOR}/lettering/StudioBubbleLibraryPanel.tsx`],
  }),
];
