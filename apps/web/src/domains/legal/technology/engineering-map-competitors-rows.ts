import type { EngineeringMapRow } from "./engineering-map-types";
import type { LocalizedText } from "./engineering-story-content";

/**
 * 경쟁·참고 제품 지도의 행. 영역 순서대로 모은다.
 *
 * 쓰는 규칙(저장소가 스스로 정한 선):
 * - 저장소 문서(벤치마크·ADR·플레이북·참고 카드)가 기록한 관찰만 쓴다. 경쟁 제품의 가격·점유율·최신 버전·기능 우열은 조사하지 않았으므로 쓰지 않는다.
 * - "대체·동등·우위"를 말하지 않는다(`replacementClaimAllowed: false`). 자체 평가표(Magma 동등+, 3D 매트릭스 ‘O’)는 근거로 쓰지 않는다.
 * - 정량 수치(성능·번들 크기)와 마켓 수수료율(자체 설계값)은 싣지 않는다.
 * - 문서가 따로 적지 않은 것은 지어내지 않고 ‘문서에 없음·미확인’이라고 쓴다.
 */

const t = (ko: string, en: string): LocalizedText => ({ ko, en });

/** 첫 열(영역). 같은 객체를 여러 행이 공유한다. */
const D = {
  drawing: t("그림·페인팅", "Drawing & painting"),
  threeD: t("3D·캐릭터", "3D & characters"),
  collab: t("협업·가상공간", "Collaboration & virtual space"),
  storyboard: t("콘티·검토", "Storyboard & review"),
  design: t("디자인·문서", "Design & documents"),
  publishing: t("웹툰 유통·생태계", "Webtoon publishing & ecosystem"),
  ai: t("AI·에이전트", "AI & agents"),
  engines: t("엔진·표준", "Engines & standards"),
} as const;

interface RowSource {
  readonly id: string;
  readonly name: string;
  readonly domain: LocalizedText;
  /** 공식 주소. 링크 레지스트리(engineering-external-links.ts)나 접속 점검을 통과한 주소만 쓴다. */
  readonly url?: string;
  /** 공식 사이트 홈이 아니라 문서·저장소 페이지를 걸 때의 링크 제목(기본은 "<이름> official site"). */
  readonly urlTitle?: string;
  readonly what: LocalizedText;
  readonly learned: LocalizedText;
  readonly overlap: LocalizedText;
  readonly evidence: readonly string[];
}

function row(source: RowSource): EngineeringMapRow {
  return {
    id: source.id,
    name: source.name,
    cells: { domain: source.domain, what: source.what, learned: source.learned, overlap: source.overlap },
    ...(source.url ? { link: { title: source.urlTitle ?? `${source.name} official site`, url: source.url } } : {}),
    evidence: source.evidence,
  };
}

const CREATOR = "apps/web/src/domains/creator";
const FIELD_NOTES = "apps/web/src/domains/legal/technology/engineering-field-notes-content.ts";
const PLAYBOOK = "apps/web/src/domains/legal/technology/engineering-playbook-content.ts";

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

/* ───────────── 웹툰 유통·생태계 ───────────── */

const PUBLISHING: readonly EngineeringMapRow[] = [
  row({
    id: "webtoon-canvas",
    name: "WEBTOON CANVAS",
    domain: D.publishing,
    url: "https://www.webtoons.com/en/canvas",
    what: t(
      "웹툰 작가가 직접 연재하는 창작자 플랫폼입니다. 예약 공개·정책 심사·분석 기능이 게시 전 점검(preflight) 설계의 참고였습니다.",
      "A creator platform where artists publish their own webtoons. Its scheduling, policy review and analytics informed the design of the pre-publish check (preflight).",
    ),
    learned: t(
      "배움: 예약·미리보기·심사·분석, 다국어 연재와 AI 번역 동의(opt-in). 안 한 점: 공식 Creator API 승인 없이 직접 게시·예약·수익 동기화를 주장하지 않고, 로컬 릴리스 일정과 수동 성과 가져오기만 제공.",
      "Learned: scheduling, preview, review, analytics, multi-language publishing and opt-in AI translation. Not adopted: no direct publishing, scheduling or revenue sync is claimed without official Creator API approval; only a local release calendar and manual metric import exist.",
    ),
    overlap: t("게시 패키지, 게시 전 점검 패널, 플랫폼 규격 검사기.", "Publish package, publish preflight panel and platform spec validator."),
    evidence: [
      "docs/studio-competitor-benchmark-2026-07-10.md",
      "docs/studio-commercial-manual-benchmark-2026-07-10.md",
      "docs/benchmarks/studio-webtoon-ecosystem-registry.json",
      `${CREATOR}/studio-publish-package.ts`,
      `${CREATOR}/StudioPublishPreflightPanel.tsx`,
    ],
  }),
  row({
    id: "tapas",
    name: "Tapas",
    domain: D.publishing,
    url: "https://www.creators.tapas.io/creating-a-series",
    urlTitle: "Tapas creators guide",
    what: t(
      "웹툰·웹소설 연재 플랫폼입니다. 2026-07-10 문서가 적은 AI 생성 콘텐츠 정책이 게시 전 점검 설계의 참고였습니다.",
      "A platform for serialized webcomics and web novels. The AI-generated-content policy recorded in a 2026-07-10 document informed the pre-publish check.",
    ),
    learned: t(
      "배움: 초안·예약·분석 기능과, 게시처에 AI 생성 이력이 있으면 경고·차단하는 사전 점검. 주의: 정책은 2026-07-10 문서 기준이라 지금도 같은지 다시 확인해야 함.",
      "Learned: drafts, scheduling and analytics, plus a preflight that warns or blocks when AI-generation history exists for that destination. Caution: the policy is as of the 2026-07-10 document and must be rechecked.",
    ),
    overlap: t("게시 패키지와 게시 전 점검 패널(AI 생성 이력 경고).", "Publish package and preflight panel (AI-generation history warning)."),
    evidence: [
      "docs/studio-competitor-benchmark-2026-07-10.md",
      "docs/studio-commercial-manual-benchmark-2026-07-10.md",
      `${CREATOR}/studio-publish-package.ts`,
    ],
  }),
  row({
    id: "toonstoons",
    name: "Toonstoons",
    domain: D.publishing,
    url: "https://www.toonstoonsweb.com/",
    what: t(
      "AI로 웹툰과 30초 영상을 만드는 서비스입니다. 대본→캐릭터→장면→음성→영상을 한 프로젝트로 묶는 제작 흐름을 clean-room 방식(공개된 화면·동작만 보고 새로 설계)으로 분석했습니다.",
      "A service that makes webtoons and 30-second videos with AI. Its flow from script to characters, scenes, voice and video inside one project was analyzed in a clean-room way.",
    ),
    learned: t(
      "배움: 대본→캐릭터 기준→장면 이미지→음성→영상을 한 프로젝트로 잇는 흐름. 다르게 한 점: 소스·브랜드·문구·결과물을 복사하지 않고 기존 엔진을 하나의 작업대로 묶음.",
      "Learned: a production flow tying script, character references, scene images, voice and video into one project. Done differently: no source, brand, wording or output is copied; existing engines were gathered into one workbench.",
    ),
    overlap: t(
      "AI 코믹 디렉터 세션과 Toon Automation 작업대(웹툰·30초 애니 모드).",
      "AI Comic Director sessions and the Toon Automation workbench (webtoon and 30-second animation modes).",
    ),
    evidence: [
      "docs/audits/toonstoons-functional-parity-2026-09-23.md",
      `${CREATOR}/ai/studio-toon-automation.ts`,
      `${CREATOR}/ai/StudioToonAutomationWorkspace.tsx`,
    ],
  }),
  row({
    id: "creco",
    name: "Creco",
    domain: D.publishing,
    url: "https://app.creco.so/ko/",
    urlTitle: "Creco app",
    what: t(
      "웹툰 제작을 팀으로 운영하는 협업 서비스입니다. 워크스페이스·공정·원고 버전·피드백·전달 흐름을 직접 구현할 대상으로 정리했습니다.",
      "A service for running webtoon production as a team. Its workspace, process, manuscript version, feedback and delivery flow was mapped for in-house reimplementation.",
    ),
    learned: t(
      "배움: 워크스페이스·멤버·표준 공정·원고·버전·피드백·전달을 한 흐름으로 묶기. 다르게 한 점: 화면·문구·브랜드를 복제하지 않고 기존 권한·버전·검수 모델로 해결.",
      "Learned: tie workspace, members, standard processes, manuscripts, versions, feedback and delivery into one flow. Done differently: no UI, wording or brand is copied; the flow is solved with existing permission, version and review models.",
    ),
    overlap: t(
      "제작 허브의 원고·공정·전달 화면과 고정 검토 패널.",
      "Production hub manuscript, process and delivery screens, and the pinned review panel.",
    ),
    evidence: [
      "docs/design/creco-feature-internalization-20260923.md",
      "docs/design/production-workflows-20260927.md",
      `${CREATOR}/production-hub/ProductionManuscriptWorkspace.tsx`,
      `${CREATOR}/production-hub/ProductionManuscriptDeliveryHub.tsx`,
    ],
  }),
  row({
    id: "clip-studio-assets",
    name: "Clip Studio Assets",
    domain: D.publishing,
    url: "https://assets.clip-studio.com/",
    what: t(
      "Clip Studio용 소재(브러시·3D 등)를 받는 마켓입니다. 팔레트별 탐색과 다운로드·가져오기 분리가 비교 대상이었고, Unity Asset Store·Fab·3D Warehouse도 같은 문서에서 비교했습니다.",
      "A marketplace for Clip Studio materials such as brushes and 3D assets. Palette-based browsing and splitting download from import were compared, alongside Unity Asset Store, Fab and 3D Warehouse in the same document.",
    ),
    learned: t(
      "배움: 쓰는 환경(버전·렌더러)을 먼저 밝히고 카드와 상세에서 같은 판정을 재사용. 안 한 점: 패스포트가 설치 성공·적법성을 보증한다고 말하지 않고, 다운로드·변환·삽입 일괄 처리는 후속으로 남김.",
      "Learned: declare the target Studio version and renderer first, and reuse one verdict on cards and detail pages. Not adopted: a passport is not a guarantee of installation or legality, and one-step download, convert and insert is left for later.",
    ),
    overlap: t("마켓의 제작 적합성 패스포트와 제작 적합성 랩.", "Market production-fit passport and fit lab."),
    evidence: [
      "docs/benchmarks/market-production-fit-2026-09-09.md",
      "docs/benchmarks/marketplace-social-studio-integration-2026-09-04.md",
      "apps/web/src/domains/market/models/market-production-fit.ts",
    ],
  }),
  row({
    id: "kaistory",
    name: "KAISTORY",
    domain: D.publishing,
    url: "https://kaistory.net/",
    what: t(
      "웹툰 제작·유통 서비스입니다. 저장소 감시 목록은 오프라인 우선 콘티, 하나의 프로젝트 데이터 모델, 레이어 PSD, 다국어 번역에 주목했습니다.",
      "A webtoon production and distribution service. The repository's watch list noted offline-first storyboards, one project data model, layered PSD and multi-language translation.",
    ),
    learned: t(
      "미조사: 감시 목록(우선순위 P0)에만 있고 직접 비교한 기록은 없음. 레지스트리 구현 메모: 콘티부터 게시까지 버전 있는 프로젝트 하나로 잇고 로컬 복구를 정본으로 둘 것.",
      "Not researched: it is only on the watch list (priority P0) with no direct comparison on record. Registry implementation note: link storyboard to publish in one versioned project and keep local-first recovery authoritative.",
    ),
    overlap: t(
      "로컬 우선 저장·복구와 콘티~내보내기를 잇는 프로젝트 흐름(비교는 미조사).",
      "Local-first save and recovery and the storyboard-to-export project flow (comparison not researched).",
    ),
    evidence: ["docs/benchmarks/studio-webtoon-ecosystem-registry.json"],
  }),
  row({
    id: "laftel",
    name: "Laftel",
    domain: D.publishing,
    url: "https://laftel.net/",
    what: t(
      "애니메이션 스트리밍·정보 서비스입니다. 가입할 때 취향 테스트를 하고 별점을 쌓아 추천하는 방식이 탐색 계층(Spectrum)의 참고 대상이었습니다.",
      "An anime streaming and information service. Its sign-up taste test, with recommendations built from star ratings, was the reference for the discovery layer (Spectrum).",
    ),
    learned: t(
      "배움: 취향 테스트로 시작하는 온보딩, 분기별 캘린더, 태그 중심 탐색. 주의: 근거 문서가 2026-05 기준이라 프레이밍이 오래됨 — ‘참고한 것’으로만 읽어야 함.",
      "Learned: a taste-test onboarding, a seasonal calendar and tag-led browsing. Caution: the source document is from 2026-05 and its framing is dated, so read this only as 'what was referenced'.",
    ),
    overlap: t("취향 테스트 온보딩 화면(TasteOnboardingPage).", "The taste-test onboarding page (TasteOnboardingPage)."),
    evidence: [
      "docs/competitor-analysis.md",
      "DIFFERENTIATION.md",
      "apps/web/src/domains/engagement/TasteOnboardingPage.tsx",
    ],
  }),
  row({
    id: "anilist",
    name: "AniList",
    domain: D.publishing,
    url: "https://anilist.co/",
    what: t(
      "만화·애니메이션 기록(트래킹)·통계·태그 서비스입니다. 저장소는 이를 ‘기록·통계·태그’의 핵심 롤모델로 적었습니다.",
      "A tracking, statistics and tagging service for manga and anime. The repository names it a key role model for tracking, stats and tags.",
    ),
    learned: t(
      "배움: 점수 스케일을 고르는 유연함, 개인 통계 대시보드, 다음 화 일정·밀린 화수 추적, 작품 사이의 관계(원작·각색). 주의: 근거 문서가 2026-05 기준이라 ‘참고한 것’으로만 읽어야 함.",
      "Learned: a choice of score scales, a personal statistics dashboard, next-episode and backlog tracking, and relations between works (source and adaptation). Caution: the source document is from 2026-05, so read this only as 'what was referenced'.",
    ),
    overlap: t(
      "연재 캘린더(다음 화 일정)와 원작-각색 관계 그래프.",
      "The release calendar (next-episode dates) and the adaptation graph.",
    ),
    evidence: [
      "docs/competitor-analysis.md",
      "DIFFERENTIATION.md",
      "docs/catalog-research-lab.md",
      "apps/web/src/domains/catalog/CalendarPage.tsx",
      "apps/web/src/shared/components/adaptation-graph.tsx",
    ],
  }),
  row({
    id: "letterboxd",
    name: "Letterboxd",
    domain: D.publishing,
    url: "https://letterboxd.com/",
    what: t(
      "영화 기록·리뷰 소셜 서비스입니다. 저장소는 이를 ‘소셜 리뷰’의 핵심 롤모델로 적되, 색·화면을 그대로 따라 하지 않는 가드를 두었습니다.",
      "A social service for logging and reviewing films. The repository names it a key role model for social reviews, but sets a guard against copying its colors or look.",
    ),
    learned: t(
      "배움: 반쪽 별, 다이어리, 공개 리스트, 팔로우로 이어지는 기록·리뷰 문화. 다르게 한 점: 틸/그린 색을 쓰지 않고 한국 웹툰 맥락으로 재해석. 팔로우 피드·다이어리는 이용자가 모인 뒤로 미룸(P2).",
      "Learned: a logging and review culture built on half stars, diaries, public lists and follows. Done differently: its teal and green colors are not used and social features are reinterpreted for Korean webtoons. Follow feeds and diaries wait until enough users exist (P2).",
    ),
    overlap: t(
      "작품 리뷰·평점과 내 라이브러리(Spectrum).",
      "Work reviews and ratings, and the personal library (Spectrum).",
    ),
    evidence: ["docs/competitor-analysis.md", "DIFFERENTIATION.md", "PRODUCT.md", "docs/catalog-research-lab.md"],
  }),
  row({
    id: "trakt",
    name: "Trakt",
    domain: D.publishing,
    url: "https://trakt.tv/",
    what: t(
      "시청 기록과 ‘어디서 볼 수 있나(Where to watch)’ 정보를 주는 서비스입니다. 저장소는 이를 ‘어디서 볼지’ 안내의 핵심 롤모델로 적었습니다.",
      "A service that tracks what you watch and tells you where to watch it. The repository names it a key role model for 'where to read' guidance.",
    ),
    learned: t(
      "배움: 작품 하나가 어느 제공처에 있는지 한눈에 보여주는 방식. 다르게 한 점: 외부 플랫폼의 유료 본문과 회차 이미지는 호스팅하지 않고 연결만 함. 주의: 근거 문서가 2026-05 기준이라 ‘참고한 것’으로만 읽어야 함.",
      "Learned: show at a glance which providers carry a work. Done differently: paid text and episode images of external platforms are not hosted; users are only linked out. Caution: the source document is from 2026-05, so read this only as 'what was referenced'.",
    ),
    overlap: t("작품 상세의 제공처(어디서 볼지) 표시.", "Where-to-read availability on work pages."),
    evidence: [
      "docs/competitor-analysis.md",
      "DIFFERENTIATION.md",
      "PRODUCT.md",
      "apps/web/src/shared/components/availability.tsx",
    ],
  }),
];

/* ───────────── AI·에이전트 ───────────── */

const AI: readonly EngineeringMapRow[] = [
  row({
    id: "dia",
    name: "Dia",
    domain: D.ai,
    url: "https://www.diabrowser.com/",
    what: t(
      "AI 기능이 들어간 웹 브라우저입니다. 주 모델이 실패하면 보조 AI 모델로 바꿔 대화를 이어가는 방식이 참고 대상이었습니다.",
      "A web browser with built-in AI. Its way of switching chat to a backup AI model when the main model fails was the reference.",
    ),
    learned: t(
      "배움: 자동 모드에서는 전환을 눈에 띄지 않게 하되 실제 쓴 경로는 보여줌. 다르게 한 점: 결과가 애매한 실패(시간 초과 등)는 다른 공급자로 다시 보내지 않음(이중 생성·과금 위험).",
      "Learned: keep fallback unobtrusive in automatic mode but show the route actually used. Done differently: ambiguous failures such as timeouts are never replayed to another provider (risk of duplicate generation or billing).",
    ),
    overlap: t(
      "AI 연결 설정과 자동·우선순위·수동 라우팅(user-ai-transport).",
      "AI connection settings and automatic, priority and manual routing (user-ai-transport).",
    ),
    evidence: ["docs/operations/cloud-ai-routing-benchmark-2026-09-16.md", "apps/web/src/shared/ai/user-ai-transport.ts", PLAYBOOK],
  }),
  row({
    id: "browser-use-cloud",
    name: "Browser Use Cloud",
    domain: D.ai,
    url: "https://docs.browser-use.com/cloud/quickstart",
    urlTitle: "Browser Use Cloud quickstart",
    what: t(
      "AI가 브라우저를 대신 조작하는 ‘브라우저 에이전트’를 클라우드로 제공하는 서비스입니다. 여러 AI 공급자와 내 키 직접 쓰기(BYOK)를 지원한다고 문서가 기록했습니다.",
      "A cloud service for 'browser agents', AI that operates a browser for you. The repository records support for many AI providers and bring-your-own-key (BYOK).",
    ),
    learned: t(
      "배움: 한 곳의 설정 화면에서 공급자 키·모델을 관리하고 공급자마다 키와 모델을 여러 개 둘 수 있게 함. 내 컴퓨터에서 도는 브라우저 실행기는 필요 없음.",
      "Learned: manage provider keys and models in one settings surface, with several keys and models per provider. No local browser runner is required.",
    ),
    overlap: t("AI 연결 설정: 연결마다 여러 키·모델 등록.", "AI connection settings: several keys and models per connection."),
    evidence: ["docs/operations/cloud-ai-routing-benchmark-2026-09-16.md", "apps/web/src/shared/ai/user-ai-transport.ts", PLAYBOOK],
  }),
  row({
    id: "vercel-ai-gateway",
    name: "Vercel AI Gateway",
    domain: D.ai,
    url: "https://vercel.com/docs/ai-gateway",
    urlTitle: "Vercel AI Gateway documentation",
    what: t(
      "여러 AI 모델 공급자를 한 창구로 묶어 주는 게이트웨이입니다. 공급자 순서, 모델 폴백, 요청별 BYOK, 예산이 핵심 개념으로 문서에 있습니다.",
      "A gateway that puts many AI model providers behind one entry point. Its documentation treats provider ordering, model fallback, per-request BYOK and budgets as core concepts.",
    ),
    learned: t(
      "배움: 순서를 명시하고, 공용 무료 풀의 순서와 개인 연결·모델·키 우선순위를 분리. 다르게 한 점: 유료 개인 키(BYOK)는 사용자가 켜기 전에는 자동 라우팅에서 제외.",
      "Learned: make order explicit and keep the shared free pool's order apart from personal connection, model and key priority. Done differently: paid personal keys (BYOK) stay out of automatic routing until the user opts in.",
    ),
    overlap: t("AI 라우팅의 자동·우선순위·수동 모드와 비용 안전 장치.", "AI routing modes (automatic, priority, manual) and cost safeguards."),
    evidence: ["docs/operations/cloud-ai-routing-benchmark-2026-09-16.md", "apps/web/src/shared/ai/user-ai-transport.ts", PLAYBOOK],
  }),
  row({
    id: "openrouter",
    name: "OpenRouter",
    domain: D.ai,
    url: "https://openrouter.ai/",
    what: t(
      "하나의 API로 여러 회사의 AI 모델을 쓸 수 있게 해 주는 서비스입니다. 큰 모델 목록과 무료 모델 라우터가 참고 대상이었습니다.",
      "A service that lets one API reach AI models from many companies. Its large model catalog and free-model router were the reference.",
    ),
    learned: t(
      "배움: 무료 라우터(openrouter/free)를 기본 프리셋으로 제공. 다르게 한 점: 중개 서비스 하나에만 기대지 않도록 각 공급자의 직접 키도 계속 쓸 수 있게 함.",
      "Learned: offer the free router (openrouter/free) as a preset. Done differently: direct provider keys still work, so no single aggregator becomes a point of dependency.",
    ),
    overlap: t("AI 연결 프리셋과 공유 무료 풀.", "AI connection presets and the shared free pool."),
    evidence: ["docs/operations/cloud-ai-routing-benchmark-2026-09-16.md", "apps/web/src/shared/ai/user-ai-transport.ts", PLAYBOOK],
  }),
  row({
    id: "gentoon",
    name: "GenToon",
    domain: D.ai,
    url: "https://www.gentoon.ai/",
    what: t(
      "AI로 웹툰을 만드는 서비스입니다. Dashtoon·LlamaGen·Anifusion 같은 AI 만화 서비스와 함께 ‘이야기→컷 분할→캐릭터 일관성’ 흐름이 비교 대상이었습니다.",
      "A service that makes webtoons with AI. It was compared with AI comic services such as Dashtoon, LlamaGen and Anifusion on the flow from story to panel split to character consistency.",
    ),
    learned: t(
      "배움: 캐릭터·화풍 기준을 고정하고 컷 단위로 다시 생성, 말풍선은 편집 가능하게 유지, 생성 이력(영수증) 남기기. 다르게 한 점: 텍스트 모델을 이미지 생성·LoRA 학습 기능처럼 표현하지 않음.",
      "Learned: fix character and style references, regenerate per panel, keep lettering editable and keep a provenance receipt. Done differently: text models are never presented as image generation or LoRA training.",
    ),
    overlap: t(
      "AI 코믹 디렉터(이야기 분해·컷 후보·부분 수리)와 에피소드 제작 디렉터.",
      "AI Comic Director (story breakdown, panel candidates, partial repair) and the episode production director.",
    ),
    evidence: [
      "docs/studio-competitor-benchmark-2026-07-10.md",
      "docs/studio-commercial-manual-benchmark-2026-07-10.md",
      "docs/reports/webtoon-ai-production-director-benchmark-2026-09-05.md",
      "docs/benchmarks/studio-webtoon-ecosystem-registry.json",
      `${CREATOR}/ai/studio-ai-episode-production-director.ts`,
    ],
  }),
  row({
    id: "comfyui",
    name: "ComfyUI",
    domain: D.ai,
    url: "https://github.com/comfyanonymous/ComfyUI",
    urlTitle: "ComfyUI repository",
    what: t(
      "노드를 이어 붙여 이미지·영상 생성 과정을 직접 짜는 AI 도구입니다. 저장소 감시 목록은 노드 그래프·로컬 모델·확장 기능에 주목했습니다.",
      "An AI tool where you wire nodes together to build image and video generation pipelines. The repository's watch list noted node graphs, local models and extensions.",
    ),
    learned: t(
      "다르게 한 점: 예전의 로컬 ComfyUI 환경변수는 이제 읽지 않고, 이미지·영상·2D↔3D 추론은 공개 HTTPS 클라우드 주소만 씀. 그 밖의 직접 비교 기록은 감시 목록 수준.",
      "Done differently: the former local ComfyUI environment variables are no longer read, and image, video and 2D-to-3D inference use only public HTTPS cloud endpoints. Beyond the watch list there is no direct comparison on record.",
    ),
    overlap: t("미디어 추론(이미지·영상·2D↔3D)의 클라우드 연결 설정.", "Cloud connection settings for media inference (image, video, 2D-to-3D)."),
    evidence: [
      "docs/operations/cloud-ai-routing-benchmark-2026-09-16.md",
      "docs/webtoon-ai-generative-suite-benchmark-2026-09-03.md",
      "docs/benchmarks/studio-competitor-registry.json",
    ],
  }),
];

/* ───────────── 엔진·표준 (오픈소스 지도와 겹치는 것은 ‘참고·대안으로 검토한 것’만) ───────────── */

const ENGINES: readonly EngineeringMapRow[] = [
  row({
    id: "three-js",
    name: "Three.js",
    domain: D.engines,
    url: "https://threejs.org/",
    what: t(
      "웹에서 3D를 그리는 라이브러리입니다. ToonStudio 3D 편집기의 현행 엔진이며 다른 엔진을 평가할 때의 기준점이었습니다.",
      "A library for drawing 3D on the web. It is the current engine of the ToonStudio 3D editor and the baseline against which other engines were evaluated.",
    ),
    learned: t(
      "결론: 3D 편집기는 Three를 유지하고 이미 만든 Babylon 출력 경로만 제한적으로 키움. 전체 교체를 정당화할 기기 성능 비교는 없음. 주의: Three dev 문서는 설치 버전보다 앞설 수 있어 적용 전 버전 확인.",
      "Conclusion: keep Three for the 3D editor and only extend the existing Babylon output path in a limited way; no on-device performance comparison justifies a full replacement. Caution: Three's dev docs can run ahead of the installed version, so check the version first.",
    ),
    overlap: t("배경 3D 편집기의 렌더링 런타임과 엔진 어댑터.", "The background 3D editor's rendering runtime and engine adapter."),
    evidence: [
      "docs/reports/studio-3d-engine-evaluation-2026-09-12.md",
      "docs/studio-babylonjs-adoption-evaluation-2026-07-11.md",
      `${CREATOR}/bg3d/useStudioBg3dEngineRuntime.ts`,
      `${CREATOR}/bg3d/studio-bg3d-runtime-adapter.ts`,
    ],
  }),
  row({
    id: "babylon-js",
    name: "Babylon.js",
    domain: D.engines,
    url: "https://www.babylonjs.com/",
    what: t(
      "또 하나의 웹 3D 엔진입니다. 현재는 배경 3D에서 색·깊이·법선(면의 방향)·ID 이미지를 뽑는 작업에만 따로 떼어 쓰고 있습니다.",
      "Another web 3D engine. It is currently used only, and in isolation, to produce color, depth, normal (surface direction) and ID images for background 3D.",
    ),
    learned: t(
      "배운 점: 색·깊이·법선·객체 ID·재질 ID 출력 경로. 한계: 압축 메시·텍스처 배열·활성 포즈·직교 카메라 등은 아직 거부해 캐릭터 편집기의 완전한 대체가 아니며, 교체할 근거도 없음.",
      "Learned: an output path for color, depth, normal, object ID and material ID. Limit: it still rejects compressed meshes, texture arrays, active poses and orthographic cameras, so it is no full replacement for the character editor, and there is no case for replacing Three.",
    ),
    overlap: t(
      "배경 3D 출력 캡처(beauty·depth·normal·ID)를 맡는 격리된 전문 작업.",
      "Background 3D output capture (beauty, depth, normal, ID) as an isolated specialist job.",
    ),
    evidence: [
      "docs/reports/studio-3d-engine-evaluation-2026-09-12.md",
      "docs/studio-babylonjs-adoption-evaluation-2026-07-11.md",
      `${CREATOR}/bg3d/studio-bg3d-babylon-artifact-capture.ts`,
    ],
  }),
  row({
    id: "playcanvas",
    name: "PlayCanvas",
    domain: D.engines,
    url: "https://playcanvas.com/",
    what: t(
      "웹 3D 엔진입니다(촬영한 공간을 점 구름처럼 보여 주는 Gaussian Splat의 편집기 SuperSplat 포함). 독립 비교 후보일 뿐 도입할 근거는 아직 없다고 기록했습니다.",
      "A web 3D engine (including SuperSplat, an editor for Gaussian Splats, which show a captured space as a point cloud). It is recorded only as a candidate for an independent comparison, with no case yet for adopting it.",
    ),
    learned: t(
      "배운 점: React 통합이 가능하고 WebGPU(베타)에 WebGL2 대체 경로가 있음. 안 한 점: 실제 어댑터는 만들지 않았고(엔진 ID만 있음), SuperSplat은 ‘평가 예정’ 후보로 운영 기능에 표시하지 않음.",
      "Learned: React integration is possible and WebGPU (beta) has a WebGL2 fallback. Not adopted: no real adapter exists (only an engine ID), and SuperSplat is a 'planned evaluation' candidate not presented as a live feature.",
    ),
    overlap: t(
      "배경 3D의 엔진 선택 목록과 촬영 배경(Gaussian Splat) 후보.",
      "The background 3D engine selection list and a candidate for captured backgrounds (Gaussian Splat).",
    ),
    evidence: [
      FIELD_NOTES,
      "docs/reports/studio-3d-engine-evaluation-2026-09-12.md",
      "docs/studio-3d-engine-specialist-topology-2026-07-18.md",
    ],
  }),
  row({
    id: "godot",
    name: "Godot",
    domain: D.engines,
    url: "https://godotengine.org/",
    what: t(
      "오픈소스 게임 엔진입니다. 웹으로 내보내려면 WASM(웹용 실행 코드)과 WebGL2만 쓸 수 있고 C#은 웹으로 내보낼 수 없다는 점이 평가 대상이었습니다.",
      "An open-source game engine. Web export is limited to WASM (web-ready compiled code) and WebGL2, with no C# web export, and that was what the evaluation looked at.",
    ),
    learned: t(
      "채택하지 않음: 별도 WASM 앱이 Studio 상태를 이중으로 갖게 되고 WebGPU 목표와 맞지 않으며, React 편집 문서와 잇는 비용이 큼. ‘엔진부터 고르면 안 된다’는 반례로 기록.",
      "Not adopted: a separate WASM app would duplicate Studio state, does not fit the WebGPU goal and costs a lot to bridge to the React editing document. Recorded as a counterexample to picking an engine first.",
    ),
    overlap: t("3D 편집기 엔진 선택(Three 유지)과 문서 권위 설계.", "3D editor engine choice (Three kept) and document-authority design."),
    evidence: [FIELD_NOTES, "docs/reports/studio-3d-engine-evaluation-2026-09-12.md"],
  }),
  row({
    id: "unity",
    name: "Unity",
    domain: D.engines,
    url: "https://unity.com/",
    what: t(
      "게임 엔진입니다. 웹에서는 WebGL2가 기본이고 WebGPU는 실험 단계이며 C# 코드에 제약이 있다는 점이 평가 대상이었습니다(Unity 6.3 LTS 문서 기준).",
      "A game engine. On the web, WebGL2 is the default, WebGPU is experimental and C# code has limits (per the Unity 6.3 LTS documentation).",
    ),
    learned: t(
      "채택하지 않음: C#↔웹 명령 다리, 자산 변환, 셰이더, 입력·저장·캡처를 상당 부분 다시 만들어야 하고, 현재 어댑터 계약(함수·AbortSignal 포함)은 WASM·iframe으로 그대로 보낼 수 없음. 약관은 도입 전 확인 필요.",
      "Not adopted: the C#-to-web command bridge, asset conversion, shaders, input, saving and capture would largely need rebuilding, and today's adapter contract (functions and AbortSignal) cannot be sent into WASM or an iframe as is. License terms need checking before any adoption.",
    ),
    overlap: t("3D 편집기 엔진 선택과 런타임 어댑터 설계.", "3D editor engine choice and runtime adapter design."),
    evidence: ["docs/reports/studio-3d-engine-evaluation-2026-09-12.md"],
  }),
  row({
    id: "unreal-engine",
    name: "Unreal Engine",
    domain: D.engines,
    url: "https://dev.epicgames.com/documentation/unreal-engine/pixel-streaming-in-unreal-engine",
    urlTitle: "Unreal Engine Pixel Streaming documentation",
    what: t(
      "게임 엔진입니다. Pixel Streaming은 서버 GPU에서 앱을 실행하고 WebRTC 영상으로 보내는 방식이라, 브라우저 안에서 도는 엔진과 운영 방식이 다릅니다.",
      "A game engine. Pixel Streaming runs the app on a server GPU and sends WebRTC video, a different operating model from an engine that runs inside the browser.",
    ),
    learned: t(
      "채택하지 않음: 클라우드 고품질 렌더의 후보일 뿐이며 지연·압축·동시 사용자 비용을 재야 함. Pixel Streaming 영상은 PSD 레이어를 전달하는 수단이 아님. 최신 약관(EULA) 적용은 확인하지 못함.",
      "Not adopted: at most a candidate for cloud high-quality rendering, with latency, compression and per-user cost still to be measured. Pixel Streaming video cannot carry PSD layers. The latest EULA terms were not checked.",
    ),
    overlap: t("3D 출력(PNG·PSD) 설계와 엔진 평가 보고서.", "3D output (PNG and PSD) design and the engine evaluation report."),
    evidence: ["docs/reports/studio-3d-engine-evaluation-2026-09-12.md", "docs/studio-3d-webtoon-tool-benchmark-2026-07-19.md"],
  }),
  row({
    id: "skia-canvaskit",
    name: "Skia (CanvasKit)",
    domain: D.engines,
    url: "https://skia.org/docs/user/modules/canvaskit/",
    urlTitle: "CanvasKit documentation",
    what: t(
      "도형·글자·이미지를 그려 주는 2D 그래픽 엔진 Skia의 웹 버전(CanvasKit)입니다. 2D 그리기의 기준선으로 고정했고, Vello가 아직 못 하는 기능을 채우는 역할도 합니다.",
      "CanvasKit, the web version of Skia, a 2D graphics engine that draws shapes, text and images. It is pinned as the 2D baseline and also fills in what Vello cannot yet do.",
    ),
    learned: t(
      "결정: CanvasKit 0.41.1을 2D 기준선으로 고정(ADR 0004)하고 문서 화면 표시를 그 위로 옮김(ADR 0025, 에디터 전체 전환은 아님). Vello가 못 하는 5개 기능을 Skia가 맡는지 빌드로 검사(ADR 0017). Google Forma는 보관돼 불채택.",
      "Decision: CanvasKit 0.41.1 is pinned as the 2D baseline (ADR 0004) and the document display now sits on it (ADR 0025, not a whole-editor switch). The build checks that Skia covers the five features Vello cannot (ADR 0017). Google Forma was rejected because it is archived.",
    ),
    overlap: t("2D 문서 화면 표시(CanvasKit 지속 표면)와 내보내기 기준 출력.", "The 2D document display (a persistent CanvasKit surface) and reference export output."),
    evidence: [
      "docs/adr/0004-2d-baseline-canvaskit-plus-vello-cpu.md",
      "docs/adr/0017-vello-gap-alternative-engine-lanes.md",
      "docs/adr/0025-skia-retained-document-migration.md",
      "packages/studio-engine-skia",
    ],
  }),
  row({
    id: "vello",
    name: "Vello",
    domain: D.engines,
    url: "https://github.com/linebender/vello",
    urlTitle: "Vello repository",
    what: t(
      "도형과 선을 화면에 그려 주는 2D 그래픽 엔진입니다. 그래픽 카드(GPU)의 힘을 쓰는 방식이며, 만든 쪽이 ‘알파(초기 시험) 단계’라고 밝혔다고 ADR 0004(2026-08)가 기록했습니다.",
      "A 2D graphics engine that draws shapes and lines using the graphics card (GPU). ADR 0004 (2026-08) records that its makers label it alpha, meaning early testing.",
    ),
    learned: t(
      "결정: 한 작업은 엔진 하나만 고르고, 실패해도 다른 엔진으로 자동 폴백하지 않음(ADR 0018). vello_cpu는 결정적 기준선(ADR 0004). 문서 화면 표시는 CanvasKit으로 옮겼고(ADR 0025) Vello는 명시적으로 고르는 공급자로 남음.",
      "Decision: a job picks exactly one engine and never falls back to another automatically (ADR 0018). vello_cpu is the deterministic baseline (ADR 0004). The document display moved to CanvasKit (ADR 0025), and Vello stays as an explicitly chosen provider.",
    ),
    overlap: t(
      "2D 렌더 엔진 선택기, 결정적 CPU 기준 출력, 엔진 레지스트리.",
      "The 2D render-engine selector, deterministic CPU reference output and the engine registry.",
    ),
    evidence: [
      "docs/adr/0004-2d-baseline-canvaskit-plus-vello-cpu.md",
      "docs/adr/0018-no-automatic-engine-fallback-vello-primary.md",
      "docs/adr/0025-skia-retained-document-migration.md",
      "docs/engines/vello-thorvg-boundary-20260924.md",
      "packages/studio-engine-vello",
    ],
  }),
  row({
    id: "thorvg",
    name: "ThorVG",
    domain: D.engines,
    url: "https://www.thorvg.org/",
    what: t(
      "SVG(벡터 그림)와 Lottie(움직이는 벡터 애니메이션)를 그려 주는 오픈소스 렌더러입니다. Vello가 일부러 받지 않는 파일만 맡는 좁은 전문 영역에 씁니다.",
      "An open-source renderer for SVG (vector art) and Lottie (animated vector graphics). It is used only in a narrow specialist lane for files that Vello deliberately rejects.",
    ),
    learned: t(
      "결정: 대안 엔진을 ‘폴백’이 아니라 미리 고르는 별도 공급자로 둠. 스크립트·외부 주소·표현식이 든 SVG·Lottie는 거부하고, 한 요청은 엔진 하나로만 실행.",
      "Decision: the alternative engine is a separately pre-selected provider, not a fallback. SVG and Lottie containing scripts, external URLs or expressions are rejected, and each request runs on exactly one engine.",
    ),
    overlap: t(
      "SVG·Lottie 전문 영역(studio-engine-thorvg)과 렌더러 역할 원장.",
      "The SVG and Lottie specialist lane (studio-engine-thorvg) and the renderer-role ledger.",
    ),
    evidence: [
      "docs/engines/vello-thorvg-boundary-20260924.md",
      "docs/adr/0017-vello-gap-alternative-engine-lanes.md",
      "packages/studio-engine-thorvg/README.md",
    ],
  }),
  row({
    id: "phaser",
    name: "Phaser",
    domain: D.engines,
    url: "https://phaser.io/",
    what: t(
      "웹용 2D 게임 엔진입니다. 가상 스튜디오 월드를 그리는 데 쓰며, 화면 표시만 맡고 제품 판단은 맡지 않습니다.",
      "A 2D game engine for the web. It draws the Virtual Studio world and only displays; it makes no product decisions.",
    ),
    learned: t(
      "결정: 가상 스튜디오는 2D/2.5D 제품으로 유지하고, 진짜 3D 공간으로 바꿀 때도 Phaser 위에 3D 엔진을 겹치지 않음. 새 3D 소셜 엔진으로 갈아타지도 않음.",
      "Decision: the Virtual Studio stays a 2D/2.5D product, and a future true-3D space will not stack a 3D engine on top of Phaser. It is not being swapped for a new 3D social engine either.",
    ),
    overlap: t("가상 스튜디오의 월드 렌더러(Phaser 캔버스).", "The Virtual Studio world renderer (Phaser canvas)."),
    evidence: [
      "docs/studio/studio-3d-platform-evolution-2026-09-19.md",
      "docs/studio/virtual-studio-benchmark-20260920.md",
      "docs/technology/toonstudio-engineering-playbook-2026-09-23.md",
      `${CREATOR}/virtual-space/StudioVirtualSpacePhaserCanvas.tsx`,
    ],
  }),
];

export const COMPETITOR_ROWS: readonly EngineeringMapRow[] = [
  ...DRAWING,
  ...THREE_D,
  ...COLLAB,
  ...STORYBOARD,
  ...DESIGN,
  ...PUBLISHING,
  ...AI,
  ...ENGINES,
];
