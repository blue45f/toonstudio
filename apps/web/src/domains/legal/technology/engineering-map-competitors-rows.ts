import { CREATOR, D, FIELD_NOTES, PLAYBOOK, row, t } from "./engineering-map-competitors-kit";
import { COMPETITOR_ROWS_MARKET } from "./engineering-map-competitors-rows-market";

import type { EngineeringMapRow } from "./engineering-map-types";

/**
 * 경쟁·참고 제품 지도의 행 — 그림·페인팅, 협업·가상공간, 3D·캐릭터, 콘티·검토, 디자인·문서.
 * 나머지 영역(웹툰 유통, AI, 엔진)은 engineering-map-competitors-rows-market.ts 에 있다.
 * 쓰는 규칙은 engineering-map-competitors-kit.ts 머리말을 따른다.
 */

/* ───────────── 그림·페인팅 ───────────── */

const DRAWING: readonly EngineeringMapRow[] = [
  row({
    id: "clip-studio-paint",
    name: "Clip Studio Paint",
    domain: D.drawing,
    url: "https://www.clipstudio.net/en/",
    what: t(
      "만화·웹툰 원고를 그리는 상용 그림 프로그램입니다. 페이지 관리, 말풍선, 3D 인체 참고, 애니메이션 기능이 한 프로그램에 묶여 있다고 저장소가 정리했습니다.",
      "A commercial drawing program for comic and webtoon pages. The repository notes that page management, speech balloons, 3D figure reference and animation sit inside one program.",
    ),
    learned: t(
      "배움: 페이지 관리 창, 말풍선, 자·대칭 자 같은 만화 작업 흐름. 다르게 한 점: 이름·화면·소재를 따라 하지 않는 clean-room(공개 자료만 보고 새로 설계) 원칙. 안 한 점: .clip 파일 직접 호환(독점 형식·서버 비용·브라우저 보안).",
      "Learned: the page window, speech balloons, and ruler and symmetry-ruler workflow. Done differently: a clean-room rule (redesign from public material only), so no names, screens or materials are copied. Not adopted: opening .clip files directly (proprietary format, server cost, browser security).",
    ),
    overlap: t(
      "그리기 스튜디오의 페이지 정리 창, 자·대칭 자 도구, 말풍선.",
      "Studio page organizer, ruler and symmetry tools, speech balloons.",
    ),
    evidence: [
      "docs/studio-clip-ex-benchmark-2026-07-22.md",
      "docs/studio-commercial-manual-benchmark-2026-07-10.md",
      `${CREATOR}/drawing/DRAWING-BENCHMARK.md`,
      `${CREATOR}/StudioPageOrganizerDialog.tsx`,
      FIELD_NOTES,
    ],
  }),
  row({
    id: "krita",
    name: "Krita",
    domain: D.drawing,
    url: "https://krita.org/",
    what: t(
      "오픈소스 디지털 그림 프로그램입니다. 손 떨림 보정(Stabilizer), 선택 영역 도구, 인쇄 색 미리보기(소프트 프루핑)가 비교 대상이었습니다.",
      "An open-source digital painting program. Its stroke stabilizer, selection tools and soft proofing (a print-color preview) were compared.",
    ),
    learned: t(
      "배움: 손 떨림 보정 3가지 방식, 선택 영역 넓히기·줄이기·테두리, 소프트 프루핑. 안 한 점: 라이선스(GPL) 때문에 Krita 코어 코드는 참고만 하고 가져오지 않음(ADR 0008).",
      "Learned: three stabilizer modes, grow/shrink/border selection, soft proofing. Not adopted: because of its GPL license, Krita's core code is reference only and nothing is copied (ADR 0008).",
    ),
    overlap: t(
      "획 안정화(손 떨림 보정), 선택 영역 테두리, 소프트 프루핑.",
      "Stroke stabilizer, selection border, soft proofing.",
    ),
    evidence: [
      "docs/studio-web-drawing-benchmark-2026-07-12.md",
      "docs/reports/studio-non3d-competitive-benchmark-2026-09-12.md",
      "docs/adr/0008-license-isolation-policy.md",
      `${CREATOR}/drawing/stroke-stabilizer.ts`,
    ],
  }),
  row({
    id: "procreate",
    name: "Procreate",
    domain: D.drawing,
    url: "https://procreate.com/",
    what: t(
      "아이패드용 그림 앱입니다. 선 보정(StreamLine), 도형 자동 보정(QuickShape), 빠른 메뉴 같은 간결한 조작이 비교 대상이었습니다.",
      "A drawing app for iPad. Its line smoothing (StreamLine), shape snapping (QuickShape) and quick menu were compared.",
    ),
    learned: t(
      "배움: 펜을 쓰는 동안 화면의 떠 있는 UI를 비우는 방식, 선 보정, 도형 자동 보정. 다르게 한 점: iPad 앱과 같은 성능이라 말하지 않고 웹용 지연 시간 기준을 따로 둠.",
      "Learned: clearing floating UI while the pen is down, line smoothing, shape snapping. Done differently: no claim of iPad-native performance; web latency is measured against its own budget.",
    ),
    overlap: t(
      "획 안정화, 도형 자동 보정(quick shape), 빠른 메뉴, 캔버스 집중 모드.",
      "Stroke stabilizer, shape snapping (quick shape), quick actions menu, canvas focus mode.",
    ),
    evidence: [
      "docs/studio-commercial-manual-benchmark-2026-07-10.md",
      `${CREATOR}/drawing/DRAWING-BENCHMARK.md`,
      `${CREATOR}/drawing/quick-shape.ts`,
      FIELD_NOTES,
    ],
  }),
  row({
    id: "adobe-photoshop",
    name: "Adobe Photoshop",
    domain: D.drawing,
    url: "https://www.adobe.com/products/photoshop.html",
    what: t(
      "범용 이미지 편집 상용 프로그램입니다. 스마트 필터, 콘텐츠 인식 채우기, PSD(포토샵 파일 형식) 호환이 비교 대상이었습니다.",
      "A general-purpose commercial image editor. Smart filters, content-aware fill and PSD (Photoshop file format) compatibility were compared.",
    ),
    learned: t(
      "배움: 원본을 지키는 비파괴 레이어·필터와 PSD 왕복 기대 수준. 다르게 한 점: ‘완전 호환’이라 하지 않고 항목별로 보존·변환·래스터화·차단을 공개. 안 한 점: Photoshop API 연동(기업용).",
      "Learned: non-destructive layers and filters, and the PSD round-trip bar. Done differently: no blanket compatibility claim; each item is reported as preserved, converted, rasterized or blocked. Not adopted: Photoshop API integration (enterprise only).",
    ),
    overlap: t(
      "PSD 불러오기·내보내기, 스마트 필터 패널, 콘텐츠 인식 채우기·퍼핏 워프.",
      "PSD import and export, smart filters panel, content-aware fill and puppet warp.",
    ),
    evidence: [
      "docs/studio-commercial-manual-benchmark-2026-07-10.md",
      "docs/studio-competitor-features.md",
      `${CREATOR}/studio-psd-import.ts`,
      FIELD_NOTES,
    ],
  }),
  row({
    id: "medibang-paint",
    name: "MediBang Paint",
    domain: D.drawing,
    url: "https://medibangpaint.com/",
    what: t(
      "만화 제작에 쓰는 그림 앱입니다. 만화 프로젝트·페이지 관리와 클라우드 버전 기능이 비교 대상이었습니다.",
      "A drawing app used for comics. Its comic project and page management and cloud versioning were compared.",
    ),
    learned: t(
      "배움: 만화 프로젝트·페이지 단위 관리, 모바일 명령 바, 톤·소재. 이 제품만의 반영 위치는 문서에 따로 없어 확인하지 못했습니다(미확인).",
      "Learned: comic project and page management, a mobile command bar, tones and materials. No product-specific place of adoption is recorded, so it is unconfirmed.",
    ),
    overlap: t(
      "만화 페이지 관리와 삽입 허브(구체적 반영 위치는 미확인).",
      "Comic page management and the insert hub (exact place of adoption unconfirmed).",
    ),
    evidence: ["docs/studio-commercial-manual-benchmark-2026-07-10.md", "docs/studio-insert-hub-benchmark-2026-09-09.md", PLAYBOOK],
  }),
  row({
    id: "ibispaint",
    name: "ibisPaint",
    domain: D.drawing,
    url: "https://ibispaint.com/",
    what: t(
      "스마트폰·태블릿용 그림 앱입니다. 손 떨림 보정과 그리기 과정 타임랩스가 비교 대상이었습니다.",
      "A drawing app for phones and tablets. Its stroke stabilization and drawing-process timelapse were compared.",
    ),
    learned: t(
      "배움: 손 떨림 보정 강도(0–10)와 예측, 레이어 창, 타임랩스, 즐겨찾기. 다르게 한 점이나 채택하지 않은 점은 문서에 따로 적혀 있지 않습니다.",
      "Learned: adjustable stabilization strength and prediction, a layer window, timelapse, favorites. The documents record no separate difference or exclusion for this product.",
    ),
    overlap: t("획 안정화, 그리기 과정 타임랩스.", "Stroke stabilizer, drawing timelapse."),
    evidence: [
      "docs/studio-commercial-manual-benchmark-2026-07-10.md",
      `${CREATOR}/drawing/DRAWING-BENCHMARK.md`,
      `${CREATOR}/drawing/studio-timelapse.ts`,
    ],
  }),
  row({
    id: "sumo-paint",
    name: "Sumo Paint",
    domain: D.drawing,
    url: "https://www.sumo.app/",
    what: t(
      "브라우저에서 바로 쓰는 그림·사진 편집 앱입니다. 하단 브러시 선반, 렌즈 효과 같은 단순한 화면 구성이 비교 대상이었습니다.",
      "A drawing and photo-editing app that runs in the browser. Its bottom brush shelf and lens effects, in a simple layout, were compared.",
    ),
    learned: t(
      "배움: 하단 브러시 선반, 프리셋으로 시작하는 문서. 안 한 것: 이름만 바꾼 브러시 늘리기, 에셋·코드 복사, 벡터 원본 몰래 래스터화, 외부 URL로 문서 보내기.",
      "Learned: a bottom brush shelf and preset-based new documents. Not done: padding the brush count with renamed brushes, copying assets or code, silently rasterizing vector originals, sending documents to external URLs.",
    ),
    overlap: t("그리기 스튜디오의 하단 옵션 바와 브러시 트레이.", "Studio drawing options bar and brush tray."),
    evidence: ["docs/studio-sumo-paint-benchmark-2026-07-28.md", `${CREATOR}/brush/StudioDrawOptionsBar.tsx`, `${CREATOR}/brush/StudioBrushTray.tsx`],
  }),
  row({
    id: "corel-painter",
    name: "Corel Painter",
    domain: D.drawing,
    url: "https://www.painterartist.com/",
    what: t(
      "물감·종이 질감을 흉내 내는 ‘자연 매체’ 그림 프로그램입니다. Rebelle(안료 혼색·수채 번짐), ArtRage(오일·캔버스 질감)도 같은 묶음으로 비교했습니다.",
      "A 'natural media' painting program that imitates paint and paper. Rebelle (pigment mixing, watercolor bleed) and ArtRage (oil, canvas texture) were compared in the same group.",
    ),
    learned: t(
      "배움: 기능 개수가 아니라 엔진 파라미터(안료 혼색, 번짐, 임파스토 조명)로 판단. 안 한 점: 상용 코드·프리셋·에셋 반입(clean-room 규칙).",
      "Learned: judge by engine parameters (pigment mixing, bleed, impasto lighting), not feature counts. Not adopted: importing commercial code, presets or assets (clean-room rule).",
    ),
    overlap: t("자체 자연 매체 브러시 엔진(Hokusai).", "The in-house natural-media brush engine (Hokusai)."),
    evidence: [
      "docs/studio-commercial-clean-room-radar-2026-07-28.md",
      "docs/brush-texture-competitive-analysis-2026-08-22.md",
      "docs/benchmarks/studio-competitive-intake-2026-09-02.md",
      "packages/studio-hokusai-wasm",
    ],
  }),
];

/* ───────────── 협업·가상공간 ───────────── */

const COLLAB: readonly EngineeringMapRow[] = [
  row({
    id: "figma",
    name: "Figma",
    domain: D.collab,
    url: "https://www.figma.com/",
    what: t(
      "여럿이 한 화면을 동시에 편집하는 디자인 도구입니다. 커서 공유·따라가기·댓글·버전 방식이 협업 설계의 참고 대상이었습니다.",
      "A design tool where several people edit one canvas at once. Its shared cursors, follow mode, comments and versions informed the collaboration design.",
    ),
    learned: t(
      "배움: 협업자 커서 숨기기, 5초짜리 커서 채팅, 큰 방에서의 커서 우선순위. 다르게 한 점: CRDT(동시 편집을 합치는 데이터 방식)를 쓴다고 Figma 수준의 다자 편집을 달성했다고 말하지 않음. 안 한 점: Figma REST 연동.",
      "Learned: a hide-cursors control, five-second cursor chat, cursor priority in large rooms. Done differently: using CRDT (a data method that merges simultaneous edits) is not claimed to equal Figma-level multi-user editing. Not adopted: Figma REST integration.",
    ),
    overlap: t(
      "Studio 실시간 협업: 커서·따라가기·커서 채팅·댓글, 명령 팔레트.",
      "Studio live collaboration: cursors, follow, cursor chat, comments, command palette.",
    ),
    evidence: [
      "docs/realtime-collaboration-benchmark-2026-09-04.md",
      "docs/studio-figma-collaboration-benchmark-2026-07-13.md",
      `${CREATOR}/live/StudioLiveCollaborationProvider.tsx`,
      PLAYBOOK,
    ],
  }),
  row({
    id: "miro",
    name: "Miro",
    domain: D.collab,
    url: "https://miro.com/",
    what: t(
      "온라인 화이트보드 협업 도구입니다. 발표자를 따라가게 하는 ‘주의 끌기(attention management)’ 방식이 참고 대상이었습니다.",
      "An online whiteboard for teamwork. Its attention management, which lets people follow a presenter, was the reference.",
    ),
    learned: t(
      "배움: 발표자가 ‘내 작업 위치로 오세요’ 초대를 보내고 참가자가 따라가기·무시를 고름. 다르게 한 점: 다른 사람의 화면을 강제로 옮기지 않음.",
      "Learned: a presenter sends a 'come to my location' invitation and each person chooses Follow or Dismiss. Done differently: another user's camera is never taken over.",
    ),
    overlap: t("실시간 협업의 ‘현재 작업 위치 초대’와 따라가기.", "Live collaboration 'current work location' invitation and follow."),
    evidence: ["docs/realtime-collaboration-benchmark-2026-09-04.md", `${CREATOR}/live/StudioLiveCollaborationProvider.tsx`],
  }),
  row({
    id: "tldraw",
    name: "tldraw",
    domain: D.collab,
    url: "https://tldraw.com/",
    what: t(
      "웹에서 쓰는 화이트보드·캔버스 개발 키트입니다. 방(room) 단위 동기화, 잠깐 보였다 사라지는 접속 표시, 커서 채팅 구조가 참고 대상이었습니다.",
      "A whiteboard and canvas toolkit for the web. Its per-room syncing, short-lived presence indicators and cursor chat design were the reference.",
    ),
    learned: t(
      "배움: 가벼운 접속 표시(awareness)와 카메라 따라가기를 문서 저장과 분리. 다르게 한 점: 자체 Yjs 기반으로 구현했고, 접속 표시 데모를 문서 내구성과 같다고 말하지 않음.",
      "Learned: keep lightweight awareness and camera follow apart from document storage. Done differently: built on Yjs in-house; a presence demo is not presented as document durability.",
    ),
    overlap: t("실시간 협업의 접속 표시(presence)와 방 단위 문서 동기화.", "Live collaboration presence and per-room document sync."),
    evidence: [
      "docs/realtime-collaboration-benchmark-2026-09-04.md",
      "docs/studio-realtime-collaboration-v19.md",
      "docs/studio-p2p-huddle.md",
      PLAYBOOK,
    ],
  }),
  row({
    id: "excalidraw",
    name: "Excalidraw",
    domain: D.collab,
    url: "https://excalidraw.com/",
    what: t(
      "손그림 느낌의 오픈소스 화이트보드입니다. 암호화 협업이 서버를 거치는 경우를 ‘P2P’와 구분해 표기한 점이 참고 대상이었습니다.",
      "A hand-drawn-style open-source whiteboard. It was a reference for telling server-relayed encrypted collaboration apart from true peer-to-peer.",
    ),
    learned: t(
      "배움: ‘서버 전달’과 ‘브라우저끼리 직접 전송(P2P)’을 같은 말로 쓰지 않음. 다르게 한 점: P2P 채널이 막혀도 서버 중계로 몰래 바꾸지 않고, 녹화·자동 전사는 넣지 않음.",
      "Learned: 'server relay' and 'direct browser-to-browser (P2P)' are never labelled the same. Done differently: a blocked P2P channel does not silently switch to server relay, and no recording or auto-transcription was added.",
    ),
    overlap: t("허들(P2P 음성·화면 공유)의 전송 방식 표기.", "How the P2P huddle (voice and screen sharing) labels its transport."),
    evidence: ["docs/studio-p2p-huddle.md", `${CREATOR}/live/huddle/studio-p2p-huddle-controller.ts`, PLAYBOOK],
  }),
  row({
    id: "magma",
    name: "Magma",
    domain: D.collab,
    url: "https://magma.com/",
    what: t(
      "웹에서 여럿이 함께 그리는 협업 그림 서비스입니다. 커서, 채팅, 역할·권한, 레이어 소유권, 댓글, 버전 같은 공동 그리기 기능이 비교 대상이었습니다.",
      "A web service for drawing together. Cursors, chat, roles and permissions, layer ownership, comments and versions were compared.",
    ),
    learned: t(
      "배움: 역할·권한, 레이어 소유권, 댓글·버전을 한 묶음으로 봄. 다르게 한 점: Magma 내부가 순수 P2P라고 가정하지 않음. 자체 ‘동등+’ 평가표는 근거로 쓰지 않음(대체·동등 주장 금지).",
      "Learned: roles, permissions, layer ownership, comments and versions as one bundle. Done differently: no assumption that Magma is pure P2P inside. Our own 'parity+' table is not used as evidence (no replacement or parity claims).",
    ),
    overlap: t(
      "실시간 협업 서버(게이트웨이·CRDT·편집 잠금)와 댓글, 버전 비교.",
      "Live collaboration server (gateway, CRDT, edit locks), comments and revision compare.",
    ),
    evidence: [
      "docs/studio-web-drawing-benchmark-2026-07-12.md",
      "docs/studio-magma-parity-assessment-2026-07-17.md",
      "docs/studio-p2p-huddle.md",
      "apps/api/src/modules/creator/studio-live.gateway.ts",
      "apps/api/src/modules/creator/studio-crdt.service.ts",
    ],
  }),
  row({
    id: "gather",
    name: "Gather",
    domain: D.collab,
    url: "https://www.gather.town/",
    what: t(
      "온라인 가상 사무실입니다. 가까이 가면 대화가 켜지는 ‘근접 대화’와 방 전체 방송(Spotlight)을 구분하는 방식이 참고 대상이었습니다.",
      "An online virtual office. Its split between proximity chat (talk when you walk close) and room-wide Spotlight broadcast was the reference.",
    ),
    learned: t(
      "배움: 사람 찾기→회의 요청→동의→이동이 이어지는 흐름, 대화 가능·집중 같은 상태 표시, 근접 대화와 방 전체 방송의 구분. 다르게 한 점: 최신 2.0과 Classic을 섞지 않고, 화면 속 거리·벽만으로 음성·화면 공유가 비공개라고 말하지 않음. 확인 못 한 접근성·성능은 ‘없다’고 단정하지 않음.",
      "Learned: a flow from finding people to a meeting request, consent and moving there, availability and focus status, and proximity chat kept distinct from room-wide broadcast. Done differently: Gather 2.0 and Classic are not mixed, and on-screen distance or walls are not claimed to make voice or screen share private. Unconfirmed accessibility or performance is not declared absent.",
    ),
    overlap: t("가상 스튜디오의 월드 매니페스트, NPC 디렉터, 음성 연결 진단.", "Virtual Studio world manifest, NPC director, voice-connection diagnostics."),
    evidence: [
      "docs/studio/virtual-studio-benchmark-20260920.md",
      "docs/studio/virtual-studio-office-collaboration-benchmark-20260927.md",
      "docs/technology/toonstudio-webrtc-realtime-media-2026-09-25.md",
      `${CREATOR}/virtual-space/VIRTUAL_SPACE_BENCHMARK_2026-10-01.md`,
      `${CREATOR}/virtual-space/studio-virtual-space-world-manifest.ts`,
    ],
  }),
  row({
    id: "workadventure",
    name: "WorkAdventure",
    domain: D.collab,
    url: "https://workadventu.re/",
    what: t(
      "오픈소스 가상 공간입니다. 회의·조용한·제한·개인·잠금 영역과 확성기(megaphone)를 지도에서 정의하는 방식이 참고 대상이었습니다.",
      "An open-source virtual space. Defining meeting, silent, restricted, personal and lockable areas, plus a megaphone, in the map itself was the reference.",
    ),
    learned: t(
      "배움: 영역 종류(회의·조용함·제한·개인·잠금)를 지도 데이터로 선언하는 계약과 캐릭터 레이어. 이 제품만의 채택하지 않은 점은 문서에 따로 적혀 있지 않습니다.",
      "Learned: declaring area types (meeting, silent, restricted, personal, lockable) as map data, and character layers. No product-specific exclusion is recorded in the documents.",
    ),
    overlap: t("가상 스튜디오의 월드 매니페스트(방·구역 선언)와 캐릭터 아틀라스.", "Virtual Studio world manifest (rooms and zones) and character atlas."),
    evidence: [
      "docs/studio/virtual-studio-benchmark-20260920.md",
      `${CREATOR}/virtual-space/VIRTUAL_SPACE_BENCHMARK_2026-10-01.md`,
      `${CREATOR}/virtual-space/studio-virtual-space-world-manifest.ts`,
      `${CREATOR}/virtual-space/studio-virtual-space-character-atlas.ts`,
    ],
  }),
  row({
    id: "kumospace",
    name: "Kumospace",
    domain: D.collab,
    url: "https://www.kumospace.com/",
    what: t(
      "온라인 가상 공간입니다. 공간 오디오와 방 오디오, 닫힌 방, 층 방송, 녹화 범위, 상태 표시의 구분이 참고 대상이었습니다.",
      "An online virtual space. Its split between spatial and room audio, closed rooms, floor broadcast, recording scope and status was the reference.",
    ),
    learned: t(
      "배움: 거리에 따라 들리는 음성과 방 전체 음성을 다른 경험으로 나누고, 누가 듣는지·상태(가능·자리비움·집중)를 사용자가 알 수 있게 표시. 이 제품만의 채택하지 않은 점은 문서에 없음.",
      "Learned: treat distance-based voice and room-wide voice as different experiences, and show users who receives them and the status (available, away, focusing). No product-specific exclusion is recorded.",
    ),
    overlap: t("가상 스튜디오의 음성·영상 연결 진단(RTC diagnostics).", "Virtual Studio voice and video connection diagnostics (RTC diagnostics)."),
    evidence: [
      "docs/studio/virtual-studio-benchmark-20260920.md",
      "docs/studio/virtual-studio-office-collaboration-benchmark-20260927.md",
      `${CREATOR}/virtual-space/studio-virtual-space-rtc-diagnostics.ts`,
    ],
  }),
];

/* ───────────── 3D·캐릭터 ───────────── */

const THREE_D: readonly EngineeringMapRow[] = [
  row({
    id: "blender",
    name: "Blender",
    domain: D.threeD,
    url: "https://www.blender.org/",
    what: t(
      "오픈소스 3D 제작 도구입니다. Line Art·Freestyle 선화와 배치 렌더를 브라우저 밖의 전문 도구·품질 점검 용도로만 봅니다.",
      "An open-source 3D creation suite. Its Line Art and Freestyle outlines and batch rendering are used only as an outside specialist and quality-check tool.",
    ),
    learned: t(
      "배움: 자동화할 수 있는 제작 도구로서 모델 구조·리그·렌더·내보내기를 검증. 다르게 한 점: 브라우저 장면 문서의 권위를 대체하지 않고 검증된 패키지로만 들여옴.",
      "Learned: its role as an automatable tool for checking topology, rigging, render and export. Done differently: it never replaces the browser scene document's authority; output enters only as verified packages.",
    ),
    overlap: t("3D 자산 품질 점검(Blender QA) 단계와 Blender 연동 도구.", "The 3D asset quality-check stage (Blender QA) and the Blender bridge tool."),
    evidence: [FIELD_NOTES, PLAYBOOK, "docs/studio-3d-webtoon-tool-benchmark-2026-07-19.md", "docs/reports/shaper-competitive-benchmark-2026-09-12.md"],
  }),
  row({
    id: "sketchup",
    name: "SketchUp",
    domain: D.threeD,
    url: "https://www.sketchup.com/",
    what: t(
      "건축·공간 3D 모델링 도구입니다. 장면(scene)·태그·컴포넌트 구조와 GLB(3D 파일 형식) 내보내기가 비교 대상이었습니다.",
      "A 3D modeling tool for architecture and spaces. Its scene, tag and component structure and GLB (a 3D file format) export were compared.",
    ),
    learned: t(
      "배움: 배경 장면·카메라·재사용 부품(컴포넌트) 구조와 대규모 3D 자산 탐색. 안 한 점: SKP 파일 직접 해석기는 만들지 않고 공식 GLB 내보내기를 거침(CAD 정밀도는 전문 도구로 격리).",
      "Learned: scene, camera and reusable-component structure, plus browsing large 3D asset libraries. Not adopted: no native SKP parser; files go through the official GLB export (CAD precision is isolated in specialist tools).",
    ),
    overlap: t(
      "배경 3D 장면 프리셋, 재사용 샷, 자산 카탈로그와 가져오기 사전 점검.",
      "Background 3D scene presets, reusable shots, asset catalog and import preflight.",
    ),
    evidence: [FIELD_NOTES, "docs/studio-3d-webtoon-tool-benchmark-2026-07-19.md", "docs/reports/shaper-competitive-benchmark-2026-09-12.md"],
  }),
  row({
    id: "spline",
    name: "Spline",
    domain: D.threeD,
    url: "https://spline.design/",
    what: t(
      "브라우저에서 3D 장면을 만들고 함께 편집하는 도구입니다. 카메라를 움직이는 객체로 보고 전환 속도를 정하는 방식이 참고 대상이었습니다.",
      "A tool for building and editing 3D scenes together in the browser. Treating the camera as an animatable object with set transitions was the reference.",
    ),
    learned: t(
      "배움: 카메라를 장면 속 객체로 다루기, 정해진 전환(감속·멈춤)과 발행 전 연속 미리보기. 이 제품만의 채택하지 않은 점은 문서에 없음.",
      "Learned: treat the camera as a scene object, use deterministic transitions (easing, hold) and preview the sequence before publishing. No product-specific exclusion is recorded.",
    ),
    overlap: t("3D 시네마틱 카메라 디렉터와 컷 연속성 도구.", "3D cinematic camera director and shot-continuity tools."),
    evidence: [
      "docs/studio-3d-benchmark-productization-wave-2026-09-04.md",
      `${CREATOR}/scene-3d/studio-3d-camera-cinematic-director.ts`,
      `${CREATOR}/bg3d/studio-bg3d-shot-continuity.ts`,
    ],
  }),
  row({
    id: "vroid-studio",
    name: "VRoid Studio",
    domain: D.threeD,
    url: "https://vroid.com/en/studio",
    what: t(
      "VRM 아바타 캐릭터를 만드는 도구입니다. 프리셋·슬라이더·텍스처 조절 방식이 비교 대상이었습니다.",
      "A tool for making VRM avatar characters. Its presets, sliders and texture painting were compared.",
    ),
    learned: t(
      "배움: 프리셋·슬라이더·직접 그리기·머리카락 가이드로 캐릭터 제작의 문턱을 낮춤. 다르게 한 점: 도형 기반 샘플을 전문가 품질로 표시하지 않고 제대로 만든 자산의 반입은 따로 운영.",
      "Learned: presets, sliders, direct texture painting and hair guides lower the barrier to making characters. Done differently: simple primitive samples are not shown as professional quality; authored assets are admitted separately.",
    ),
    overlap: t("캐릭터 셰이퍼의 부위 슬롯·안전 범위와 VRM 내보내기.", "Character Shaper part slots, safe ranges and VRM delivery."),
    evidence: [
      FIELD_NOTES,
      "docs/reports/shaper-competitive-benchmark-2026-09-12.md",
      "docs/studio-3d-webtoon-tool-benchmark-2026-07-19.md",
      `${CREATOR}/vrm/studio-vrm-avatar-forge.ts`,
    ],
  }),
  row({
    id: "metahuman",
    name: "MetaHuman",
    domain: D.threeD,
    url: "https://www.metahuman.com/en-US",
    what: t(
      "사실적인 디지털 인간 캐릭터를 만드는 도구입니다. 얼굴 구조와 LOD(거리별 단순화) 품질 기준만 참고하고 런타임·자산은 가져오지 않았습니다.",
      "A tool for realistic digital-human characters. Only its quality bar for face structure and LODs (distance-based simplification) is referenced; no runtime or assets are included.",
    ),
    learned: t(
      "배움: 얼굴 구조·재질·LOD·보정 변형을 점검하는 품질 기준. 안 한 점: MetaHuman 런타임·자산을 넣지 않고 동등한 품질이라고도 주장하지 않음(참고 기준 전용).",
      "Learned: a review bar for face topology, materials, LODs and corrective deformation. Not adopted: no MetaHuman runtime or assets, and no claim of equivalent quality (reference only).",
    ),
    overlap: t(
      "캐릭터 자산 입수 심사(정면·실루엣·재질·변형 점수 기준).",
      "Character asset admission scoring (golden view, silhouette, material, deformation).",
    ),
    evidence: [FIELD_NOTES, "docs/studio-3d-webtoon-tool-benchmark-2026-07-19.md", "docs/reports/shaper-competitive-benchmark-2026-09-12.md"],
  }),
  row({
    id: "reallusion-character-creator",
    name: "Reallusion Character Creator",
    domain: D.threeD,
    url: "https://www.reallusion.com/character-creator/",
    what: t(
      "캐릭터 제작·애니메이션 도구 모음(Character Creator, iClone 등)입니다. 전신 IK(손발 위치에 맞춰 관절을 계산)와 접촉 보정이 참고 대상이었습니다.",
      "A suite of character creation and animation tools (Character Creator, iClone and others). Full-body IK (solving joints from hand and foot targets) and contact handling were the reference.",
    ),
    learned: t(
      "배움: 몸 모양 변형, 옷 맞춤, 스키닝, 접촉 보정의 품질 기준. 안 한 점: 상용 에셋·형식을 복제하지 않고 공개된 기능 수준만 비교(참고 기준 전용).",
      "Learned: quality bars for body morphs, garment fitting, skinning and contact solving. Not adopted: no commercial assets or formats are copied; only public capability is compared (reference only).",
    ),
    overlap: t(
      "VRM 전신 IK·관절 제한·접촉 보정과 캐릭터 IK/FK 전환.",
      "VRM full-body IK, joint limits, contact solving and character IK/FK switching.",
    ),
    evidence: [
      FIELD_NOTES,
      "docs/studio-3d-webtoon-tool-benchmark-2026-07-19.md",
      "docs/studio-3d-benchmark-productization-wave-2026-09-04.md",
      `${CREATOR}/vrm/studio-vrm-full-body-ik.ts`,
    ],
  }),
  row({
    id: "acon3d",
    name: "ACON3D",
    domain: D.threeD,
    url: "https://www.acon3d.com/",
    what: t(
      "웹툰용 3D 배경 소재를 파는 마켓입니다. 소재 탐색·미리보기와 개인/팀/법인 라이선스 구분이 비교 대상이었습니다.",
      "A marketplace for 3D background assets made for webtoons. Asset browsing, previews and separate personal, team and company licenses were compared.",
    ),
    learned: t(
      "배움: 웹툰 소재 탐색, 미리보기, 라이선스 단계, 작업에 적용하는 흐름. 안 한 점: 상용 카탈로그·메타데이터를 수집하거나 같은 자산을 제공하지 않음(참고 기준 전용).",
      "Learned: webtoon asset discovery, previews, tiered licenses and the path to using an asset. Not adopted: no collection of its commercial catalog or metadata and no equivalent assets (reference only).",
    ),
    overlap: t(
      "마켓의 제작 적합성 패스포트, 웹툰 스펙 검사기, 라이선스 단계.",
      "Market production-fit passport, webtoon spec inspector and license tiers.",
    ),
    evidence: [
      FIELD_NOTES,
      "docs/benchmarks/market-production-fit-2026-09-09.md",
      "docs/webtoon-marketplace-ecosystem-benchmark-2026-09-03.md",
      "apps/web/src/domains/market/models/market-webtoon-licensing.ts",
    ],
  }),
  row({
    id: "ablur",
    name: "ABLUR",
    domain: D.threeD,
    url: "https://ablur.acon3d.com/",
    what: t(
      "ACON3D 계열의 웹툰 배경용 3D 장면 도구입니다. SketchUp 장면 유지, 컷 단위 카메라, 멀티 패스(색·선·그림자) 출력이 참고 대상이며 공식 페이지는 ‘Not AI’라고 밝힙니다.",
      "A 3D scene tool for webtoon backgrounds from the ACON3D family. Keeping SketchUp scenes, per-cut cameras and multi-pass output (color, line, shadow) were the reference; its official page states 'Not AI'.",
    ),
    learned: t(
      "배움: 컷 단위 카메라, 분위기 조명, 여러 패스(색·선·그림자·재질 ID) 일괄 렌더, 레이어 PSD. 다르게 한 점: AI 기능으로 소개하지 않음. 안 한 점: SKP 직접 해석 대신 공식 GLB 안내.",
      "Learned: per-cut cameras, mood lighting, batch rendering of passes (color, line, shadow, material ID) and layered PSD. Done differently: never described as an AI feature. Not adopted: no native SKP parser; users are pointed to the official GLB export.",
    ),
    overlap: t("배경 3D 멀티 패스 내보내기와 컷 연속성 도구.", "Background 3D multi-pass exporter and shot-continuity tools."),
    evidence: [
      "docs/studio-3d-webtoon-tool-benchmark-2026-07-19.md",
      "docs/studio-3d-benchmark-productization-wave-2026-09-04.md",
      `${CREATOR}/scene-3d/studio-3d-webtoon-multipass-exporter.ts`,
      `${CREATOR}/bg3d/StudioBg3dMultiPassExporterPanel.tsx`,
    ],
  }),
  row({
    id: "naver-webtoon-shaper",
    name: "NAVER WEBTOON SHAPER",
    domain: D.threeD,
    url: "https://shaper.webtoons.com/",
    what: t(
      "네이버웹툰 계열의 웹툰용 3D 캐릭터 제작 도구입니다. 프리셋 범주, 모델 위 직접 그리기, 포즈, 항목별 PSD 출력이 비교 대상이었습니다.",
      "A 3D character-making tool for webtoon artists from the NAVER WEBTOON family. Preset categories, drawing directly on the model, poses and per-item PSD export were compared.",
    ),
    learned: t(
      "문서 간 불일치, 확인 필요: 07-19·09-12 문서는 3D 캐릭터 제작 도구로, 09-03 AI 문서는 ‘AI 러프 스케처’로 적음. 앞의 두 문서를 따랐고 ‘2D를 3D로 자동 복원’한다는 설명은 정정됨.",
      "Documents disagree, needs confirmation: the 07-19 and 09-12 documents call it a 3D character-making tool, the 09-03 AI document an 'AI rough sketcher'. We follow the first two; the idea that it rebuilds 3D from 2D art automatically was corrected.",
    ),
    overlap: t("캐릭터 셰이퍼의 프리셋 카탈로그, VRM 아바타 제작소, 포즈 프리셋.", "Character Shaper preset catalog, VRM avatar forge, pose presets."),
    evidence: [
      "docs/reports/shaper-competitive-benchmark-2026-09-12.md",
      "docs/studio-3d-webtoon-tool-benchmark-2026-07-19.md",
      "docs/webtoon-ai-generative-suite-benchmark-2026-09-03.md",
      `${CREATOR}/character-shaper/character-shaper-catalog.ts`,
    ],
  }),
  row({
    id: "snaptoon",
    name: "Snaptoon",
    domain: D.threeD,
    url: "https://snaptoon.co.kr/",
    what: t(
      "언리얼 엔진 기반의 웹툰 3D 배경 도구입니다. 실시간 렌더, SketchUp 직접 불러오기, 소재 라이브러리가 비교 대상이었습니다.",
      "A webtoon 3D background tool built on Unreal Engine. Real-time rendering, direct SketchUp import and an asset library were compared.",
    ),
    learned: t(
      "문서 간 불일치, 확인 필요: 07-19 문서는 ‘날씨 효과’ 사양을 공식 페이지에서 확인하지 못해 정정했는데 09-03 문서는 기능으로 적음. 07-19 쪽을 따랐고 Unreal 직접 채택은 안 함.",
      "Documents disagree, needs confirmation: the 07-19 document corrected the 'weather effects' claim because the official page gave no detail, while the 09-03 document lists it as a feature. We follow 07-19; Unreal itself was not adopted.",
    ),
    overlap: t("3D 웹툰 필터(배경 분위기·효과).", "3D webtoon filters (background mood and effects)."),
    evidence: [
      "docs/studio-3d-webtoon-tool-benchmark-2026-07-19.md",
      "docs/studio-3d-startup-comprehensive-benchmark-2026-09-03.md",
      "docs/reports/studio-3d-engine-evaluation-2026-09-12.md",
      `${CREATOR}/scene-3d/studio-3d-webtoon-filters.ts`,
    ],
  }),
];

/* ───────────── 콘티·검토 ───────────── */

const STORYBOARD: readonly EngineeringMapRow[] = [
  row({
    id: "storyboard-pro",
    name: "Storyboard Pro",
    domain: D.storyboard,
    url: "https://www.toonboom.com/products/storyboard-pro",
    what: t(
      "애니메이션 콘티(스토리보드)를 만드는 전문 상용 도구입니다. 패널 타이밍, 애니매틱(움직이는 콘티), 소리·카메라 연결이 비교 대상이었습니다.",
      "A professional commercial tool for animation storyboards. Panel timing, animatics (storyboards played as video) and linked sound and camera were compared.",
    ),
    learned: t(
      "배움: 장면·패널 구조와 타이밍을 가진 콘티 모델. 다르게 한 점: 그림만 보는 썸네일 대신 페이지 상태·샷 정보·검토 진행을 한 화면에 보여줌(콘티 컨트롤 룸).",
      "Learned: a storyboard model with scenes, panels and timing. Done differently: instead of only static thumbnails, one screen shows page status, shot data and review progress (the storyboard Control Room).",
    ),
    overlap: t("콘티 컨트롤 룸(페이지 그리드)과 애니매틱 작업 공간.", "Storyboard Control Room (page grid) and the animatic workspace."),
    evidence: [
      "docs/storyboard-control-room-benchmark-2026-09-09.md",
      "docs/studio-competitor-benchmark-2026-07-10.md",
      `${CREATOR}/studio-storyboard-control-room.ts`,
      `${CREATOR}/StudioStoryboardGridPanel.tsx`,
    ],
  }),
  row({
    id: "boords",
    name: "Boords",
    domain: D.storyboard,
    url: "https://boords.com/",
    what: t(
      "스크립트를 프레임으로 바꿔 스토리보드를 만드는 웹 서비스입니다. 상태별 검토·승인 흐름이 비교 대상이었습니다.",
      "A web service that turns scripts into storyboard frames. Its status-based review and approval flow was compared.",
    ),
    learned: t(
      "배움: 상태별 검토 대기열, 통합 검색, 승인 진행률. 아직 안 한 점: 버전 승인·공유 링크는 ‘향후 확장’으로만 기록하고 만들지 않음.",
      "Learned: status-based review queues, combined search and approval progress. Not yet built: version approval and share links are recorded only as future extensions.",
    ),
    overlap: t(
      "콘티 컨트롤 룸의 검토 상태(작업 중·검토 요청·수정 요청·승인)와 검토표 내보내기.",
      "Control Room review states (working, review requested, changes requested, approved) and review-sheet export.",
    ),
    evidence: [
      "docs/storyboard-control-room-benchmark-2026-09-09.md",
      "docs/storyboard-bulk-review-operations-2026-09-09.md",
      `${CREATOR}/studio-storyboard-control-room.ts`,
    ],
  }),
  row({
    id: "krock-io",
    name: "KROCK.io",
    domain: D.storyboard,
    url: "https://krock.io/",
    what: t(
      "스토리보드·영상 검토용 협업 서비스입니다. 프레임에 핀 꽂기, 버전 비교, 상태 칸반(Kanban) 보드가 비교 대상이었습니다.",
      "A collaboration service for reviewing storyboards and video. Frame pins, version comparison and a status Kanban board were compared.",
    ),
    learned: t(
      "배움: 검토 상태별 4열 보드와 수정 요청 중심 필터. 아직 안 한 점: 프레임 주석과 버전 비교(diff)는 ‘향후 우선순위’로만 기록.",
      "Learned: a four-column board by review state and filters centered on change and review requests. Not yet built: frame annotations and version diff are recorded only as future priorities.",
    ),
    overlap: t("콘티 컨트롤 룸의 상태 보드와 고정 검토 패널(pinned review).", "Control Room status board and the pinned review panel."),
    evidence: [
      "docs/storyboard-control-room-benchmark-2026-09-09.md",
      "docs/studio/virtual-studio-creative-review-benchmark-20260920.md",
      `${CREATOR}/virtual-space/StudioPinnedReviewPanel.tsx`,
    ],
  }),
  row({
    id: "frame-io",
    name: "Frame.io",
    domain: D.storyboard,
    url: "https://frame.io/",
    what: t(
      "영상·콘텐츠 검토/승인 서비스입니다. 만료·암호가 있는 공유 링크와 특정 프레임으로 돌아가는 링크가 참고 대상이었습니다.",
      "A review and approval service for video and other content. Share links with expiry and passwords, and links that return to a specific frame, were the reference.",
    ),
    learned: t(
      "배움: 만료·암호·댓글이 붙는 검토 링크, 발표 모드, ‘접근 회수는 내보내기가 아님’. 다르게 한 점: Legacy와 V4 기능을 섞지 않고 유료 등급으로 기능 비용을 추정하지 않음.",
      "Learned: review links with expiry, passwords and comments, a presentation mode, and 'revoking access is not exporting'. Done differently: Legacy and V4 features are not mixed, and paid tiers are not used to estimate feature cost.",
    ),
    overlap: t(
      "고정 검토 패널(같은 컷 검토→수정→재검토)과 검토 공유 링크.",
      "Pinned review panel (review, fix and re-review the same cut) and review share links.",
    ),
    evidence: [
      "docs/studio/virtual-studio-creative-review-benchmark-20260920.md",
      "docs/studio/virtual-studio-spatial-review-contract-20260920.md",
      `${CREATOR}/virtual-space/StudioPinnedReviewPanel.tsx`,
    ],
  }),
];

/* ───────────── 디자인·문서 ───────────── */

const DESIGN: readonly EngineeringMapRow[] = [
  row({
    id: "canva",
    name: "Canva",
    domain: D.design,
    url: "https://www.canva.com/",
    what: t(
      "템플릿으로 디자인하고 공유하는 웹 디자인 도구입니다. 참가자 색·가까운 댓글 같은 협업 방식과 템플릿에서 첫 결과까지의 짧은 길이 참고 대상이었습니다.",
      "A web design tool where you start from templates and share. Its collaboration cues (participant colors, comments near the object) and short path from template to first result were the reference.",
    ),
    learned: t(
      "배움: 참가자별 색, 대상 가까이에 붙는 댓글, 고급 기능을 점차 보여주는 방식. 안 한 점: 기업용 Canva Connect 연동. 다르게 한 점: 템플릿·생성 기능 수로 전문 제작 완성도를 판단하지 않음.",
      "Learned: per-person colors, comments anchored near the object, and progressive disclosure of advanced features. Not adopted: Canva Connect (enterprise only). Done differently: template or generation counts are not used to judge professional completeness.",
    ),
    overlap: t(
      "실시간 협업의 참가자 색·댓글 핀과, 같은 원본에서 만드는 기술 자료 페이지·발표 덱.",
      "Live collaboration participant colors and comment pins, and the tech pages and deck built from one source.",
    ),
    evidence: [
      "docs/studio-competitor-benchmark-2026-07-10.md",
      "docs/realtime-collaboration-benchmark-2026-09-04.md",
      PLAYBOOK,
    ],
  }),
  row({
    id: "adobe-express",
    name: "Adobe Express",
    domain: D.design,
    url: "https://www.adobe.com/express/",
    what: t(
      "템플릿 중심의 웹 창작 도구입니다. Canva, Figma Slides(Figma의 발표 자료 기능)와 함께 ‘템플릿에서 편집·공유까지’ 이어지는 짧은 첫 성공 경로가 참고 대상이었습니다.",
      "A template-led web creation tool. Together with Canva and Figma Slides (Figma's presentation feature), its short path from template to editing and sharing was the reference.",
    ),
    learned: t(
      "배움: 템플릿→편집→공유·다운로드로 이어지는 짧은 길과 고급 기능의 단계적 노출. 다르게 한 점: 화려한 영상이 실제 제품 지표나 사용 장면을 대신하지 않음.",
      "Learned: a short template, edit, share and download path with progressive disclosure of advanced features. Done differently: polished film never stands in for real product metrics or usage.",
    ),
    overlap: t(
      "기술 자료의 공유·다운로드·발표 모드(발표 덱)와 홍보 영상.",
      "Sharing, download and presentation modes of the tech pages (the talk deck), and the promotional film.",
    ),
    evidence: [
      PLAYBOOK,
      "docs/studio-competitor-benchmark-2026-07-10.md",
      "apps/web/src/domains/legal/technology/engineering-talk-deck.ts",
      "tools/media/brand-film",
      "packages/product-tour-film",
    ],
  }),
  row({
    id: "remotion",
    name: "Remotion",
    domain: D.design,
    url: "https://www.remotion.dev/",
    what: t(
      "React 코드로 영상을 만드는 도구입니다. 같은 데이터로 같은 영상을 다시 만들어 내는 방식을 홍보 영상(brand-film)에 사용합니다.",
      "A tool that makes video from React code. Its way of regenerating the same film from the same data is used for the promotional film (brand-film).",
    ),
    learned: t(
      "배움: 코드로 프레임 단위 영상을 재현하고 코드 리뷰로 발표 자산을 관리. 다르게 한 점: 웹 앱 번들에 넣지 않고 자동 게시하지 않으며 조직·렌더 방식별 라이선스를 따로 확인.",
      "Learned: reproduce film frame by frame from code and review presentation assets like code. Done differently: kept out of the web bundle, never auto-published, and licensing is rechecked per organization and render mode.",
    ),
    overlap: t("홍보 영상(brand-film)과 제품 투어 영상 패키지.", "The promotional film (brand-film) and product-tour film packages."),
    evidence: [FIELD_NOTES, PLAYBOOK, "tools/media/brand-film", "packages/product-tour-film"],
  }),
];

export const COMPETITOR_ROWS: readonly EngineeringMapRow[] = [
  ...DRAWING,
  ...THREE_D,
  ...COLLAB,
  ...STORYBOARD,
  ...DESIGN,
  ...COMPETITOR_ROWS_MARKET,
];
