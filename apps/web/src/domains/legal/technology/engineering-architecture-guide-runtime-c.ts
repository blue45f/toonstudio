import { t } from "./engineering-architecture-guide-kit";
import type { ArchitectureGuideSection } from "./engineering-architecture-guide-types";

/**
 * 아키텍처 해설 · 실행 구조 ⑤ 가상 스튜디오와 3D ⑥ AI가 끼어드는 길 ⑦ 실패해도 작업이 남는 이유.
 * ⑤는 코드로 확인한 사실만 쓴다: 2D 공간(`virtual-space/`)은 이미지 에셋과 Phaser 만 쓰고 three.js·bg3d·VRM 모듈을 가져오지 않는다.
 */

/** 5) 가상 스튜디오와 3D — 2D 공간(Phaser)과 3D 장면(three.js)이 만나는 곳. */
export const VIRTUAL_STUDIO_3D_SECTION: ArchitectureGuideSection = {
  id: "virtual-studio-3d",
  group: "runtime",
  number: 5,
  title: t("가상 스튜디오와 3D", "The virtual studio and 3D"),
  question: t("2D 공간과 3D 장면은 어떻게 맞물리나?", "How do the 2D space and 3D scenes fit together?"),
  oneLine: t(
    "2D 공간(Phaser)과 3D 장면(three.js)은 따로 돌고, 프로젝트와 작품 문서로 만납니다.",
    "The 2D space (Phaser) and 3D scenes (three.js) run separately and meet through the project and its document.",
  ),
  easy: t(
    "가상 스튜디오는 팀이 모이는 '로비'이고, 3D 는 캐릭터와 배경을 만드는 '공방'입니다. 로비와 공방은 서로의 도구를 빌려 쓰지 않고, 완성품(작품 문서)과 안내(어느 문으로 갈지)로만 오갑니다.",
    "The virtual studio is the lobby where a team gathers, and 3D is the workshop where characters and backgrounds are made. Lobby and workshop never borrow each other's tools; they exchange only finished pieces (the work document) and directions (which door to take).",
  ),
  diagram: {
    id: "virtual-studio-3d-diagram",
    kind: "graph",
    title: t("두 세계가 만나는 곳", "Where the two worlds meet"),
    caption: t(
      "엔진은 따로 쓰고, 프로젝트와 작품 문서에서 만납니다. 2D 공간은 3D 모듈을 가져오지 않습니다.",
      "Each uses its own engine and they meet at the project and its document; the 2D space imports no 3D modules.",
    ),
    alt: t(
      "서버가 발행한 월드를 브라우저가 해시로 확인해 채택하면 Phaser 가 2D 공간을 그립니다. 공간의 문과 구역은 프로젝트 화면을 여는 의도만 전달합니다. 3D 쪽에서는 그림 한 장이 규칙으로 GLB 가 되고, 검증된 GLB 가 three.js 장면에 놓이며, 장면의 캡처가 레이어가 되어 작품 문서로 들어갑니다.",
      "The browser adopts a server-published world after checking its hash, and Phaser draws the 2D space. Doors and zones in the space only pass an intent to open project screens. On the 3D side, one image becomes a GLB by rules, a verified GLB is placed in a three.js scene, and captures of the scene become layers that enter the work document.",
    ),
    nodes: [
      { id: "world", label: t("서버 월드 발행본", "Server-published world"), sub: t("이미지 에셋 · 해시 검증", "Image assets, hash-checked"), tone: "server", shape: "cylinder", at: [0, 0] },
      { id: "space", label: t("2D 공간 (Phaser)", "2D space (Phaser)"), sub: t("걷기·프레즌스·근접 영상", "Walking, presence, proximity video"), tone: "local", at: [0, 1] },
      { id: "project", label: t("프로젝트·문서", "Project and document"), sub: t("두 엔진이 만나는 곳", "Where both engines meet"), tone: "neutral", at: [2, 1] },
      { id: "lift", label: t("그림 → 3D 변환", "Image to 3D"), sub: t("AI 없이 규칙으로", "Rules, no AI"), tone: "local", at: [2, 0] },
      { id: "glb", label: t("검증된 GLB", "Verified GLB"), sub: t("9형식을 한 형식으로", "Nine formats become one"), tone: "local", shape: "cylinder", at: [4, 0] },
      { id: "scene3d", label: t("3D 장면 (three.js)", "3D scene (three.js)"), sub: t("뷰포트 · VRM 포즈 · LT", "Viewport, VRM poses, LT"), tone: "local", at: [4, 1] },
    ],
    edges: [
      { from: "world", to: "space", label: t("발행본 채택", "Adopt world") },
      { from: "space", to: "project", style: "dashed", label: t("열기 의도", "Open intent") },
      { from: "lift", to: "glb", label: t("GLB 생성", "Make GLB") },
      { from: "glb", to: "scene3d", label: t("장면에 배치", "Place in scene") },
      { from: "scene3d", to: "project", label: t("레이어 삽입", "Insert layers") },
    ],
  },
  steps: [
    t("공간에 들어갈 때 Phaser 엔진을 받도록 설계돼 있습니다(/studio/space, 협업은 /studio/p/…/space).", "Entering a space is designed to load the Phaser engine then (/studio/space, or /studio/p/…/space for collaboration)."),
    t("방(월드)은 서버가 확정한 발행본이고(발행본이 없으면 내장 월드가 열립니다), 브라우저는 해시를 다시 계산해 맞을 때만 채택합니다.", "The room (world) is a server-confirmed publication (a built-in world opens when none is published), and the browser adopts it only after recomputing and matching its hash."),
    t("문·구역·NPC 는 '어디로 갈지'만 정하고, 쓸 자격은 도착한 기능이 따로 판단합니다.", "Doors, zones and NPCs only decide where to go; the feature you arrive at judges whether you may use it."),
    t("3D 는 별도 화면(/studio/bg3d, /studio/poser)에서 three.js 가 그리며 Phaser 를 쓰지 않습니다.", "3D is drawn by three.js on separate screens (/studio/bg3d, /studio/poser) and does not use Phaser."),
    t("그림 한 장은 규칙으로 GLB 가 되고, 가져온 3D 파일 9형식은 검증된 GLB 하나로 정규화됩니다.", "One image becomes a GLB by rules, and the nine importable 3D formats are normalized into one verified GLB."),
    t("3D 장면은 캡처되어 컬러·톤·질감선·주선 네 레이어로 2D 작품에 들어갑니다.", "A 3D scene is captured and enters the 2D work as four layers: color, tone, texture lines and main lines."),
  ],
  background: [
    t(
      "'가상 스튜디오'와 '3D'는 한 덩어리처럼 들리지만 하는 일이 다릅니다. 가상 스튜디오는 팀원이 2D 방을 걸어 다니며 만나고 대화하는 '장소'이고, 3D 는 캐릭터와 배경을 만드는 '도구'입니다. 둘은 서로 다른 엔진(Phaser, three.js)이 맡고, 코드에서 2D 공간이 3D 모듈을 가져오는 곳은 찾지 못했습니다.",
      "'Virtual studio' and '3D' sound like one thing but do different jobs. The virtual studio is a place where teammates walk around 2D rooms to meet and talk, while 3D is a tool for making characters and backgrounds. They are handled by different engines (Phaser and three.js), and no place was found where the 2D space imports a 3D module.",
    ),
    t(
      "2D 쪽은 Phaser 가 그림을 그리고 충돌·근접·길 찾기 규칙은 순수 모듈로 나눴으며, 월드는 서버가 한 번에 한 버전만 확정합니다(기대 버전이 최신일 때만 기록). 3D 쪽은 three.js 와 React Three Fiber 가 뷰포트를 맡고, VRM 표준 뼈 이름(포즈 저장은 55개 허용 목록)이 포즈·손발 IK·웹캠 추적의 공통 언어이며, 낯선 3D 파일은 검증된 GLB 하나로 정규화한 뒤 씁니다.",
      "On the 2D side Phaser draws while collision, proximity and pathfinding rules live in pure modules, and the server confirms one world version at a time (it writes only when the expected version is the latest). On the 3D side three.js and React Three Fiber run the viewport, standard VRM bone names (a 55-name allowlist for pose saving) are the common language for poses, limb IK and webcam tracking, and unfamiliar 3D files are normalized into one verified GLB before use.",
    ),
    t(
      "한계: 2D 공간 안에서 3D 장면을 보여 주는 기능은 없습니다. Phaser 는 입장 때 불러오도록 설계했지만 정적 import 한 곳이 남아 있어 실제 청크 분리는 단정하지 않습니다. 3D 엔진은 몰래 바꾸지 않고 사용자가 WebGPU 와 WebGL2 중에서 고르며, VRM 캐릭터가 있는 장면에서는 WebGPU 를 쓸 수 없게 되고, 그때 사용자가 WebGL2 를 직접 골라야 합니다. 자동으로 바뀌지 않습니다.",
      "Limits: no feature shows a 3D scene inside the 2D space. Phaser is designed to load on entry, but one static import remains, so real chunk separation is not claimed. The 3D engine is never swapped silently: users choose between WebGPU and WebGL2, and in scenes with a VRM character WebGPU becomes unavailable and the user must pick WebGL2 manually; the app does not switch on its own.",
    ),
  ],
  inService: [
    {
      what: t("가상 스튜디오 화면", "Virtual studio screen"),
      role: t(
        "발행 월드를 채택해 Phaser 캔버스·프레즌스·근접 영상·패널을 한 화면에 조립하고, 공간 행동은 '열기 의도'로만 번역",
        "Adopts the published world and assembles the Phaser canvas, presence, proximity video and panels, translating space actions only into open intents",
      ),
      paths: [
        "apps/web/src/domains/creator/virtual-space/StudioVirtualSpacePage.tsx",
        "apps/web/src/domains/creator/virtual-space/StudioVirtualSpacePhaserCanvas.tsx",
        "apps/web/src/domains/creator/virtual-space/studio-virtual-space-interaction-orchestrator.ts",
      ],
    },
    {
      what: t("월드 발행 (서버 확정)", "World publication (server-confirmed)"),
      role: t(
        "기대 버전이 최신일 때만 새 리비전·해시를 기록하고, 브라우저는 해시를 다시 계산해 채택",
        "Records a new revision and hash only when the expected version is the latest, and the browser recomputes the hash before adopting",
      ),
      paths: [
        "apps/api/src/modules/studio-project-graph/studio-world-publication.repository.ts",
        "packages/studio-project-model/src/graph/world-publication.ts",
      ],
    },
    {
      what: t("3D 뷰포트와 LT 삽입", "3D viewport and LT insertion"),
      role: t(
        "three.js·R3F 가 3D 장면을 그리고, 선과 톤 계산 결과를 네 레이어 묶음으로 2D 작품에 삽입",
        "three.js and R3F draw the scene, and line-and-tone results are inserted into the 2D work as a four-layer bundle",
      ),
      paths: [
        "apps/web/src/domains/creator/bg3d/StudioBg3dEditorViewport.tsx",
        "apps/web/src/domains/creator/bg3d/studio-bg3d-editor-insert-host.ts",
      ],
    },
    {
      what: t("VRM 캐릭터 포즈", "VRM character poses"),
      role: t(
        "포즈 저장은 표준 뼈 이름 55개 허용 목록을 쓰고, 손발 IK·웹캠 추적은 VRM 라이브러리의 같은 표준 뼈 이름을 써서 표준 뼈를 갖춘 VRM 캐릭터에 적용",
        "Pose saving uses an allowlist of 55 standard bone names, and limb IK and webcam tracking use the same standard names from the VRM library, applying to VRM characters that provide the standard bones",
      ),
      paths: ["apps/web/src/domains/creator/studio-humanoid-bones.ts"],
    },
    {
      what: t("3D 파일 들이기·그림에서 3D", "Importing 3D files and image-to-3D"),
      role: t(
        "9형식을 검증된 GLB 하나로 정규화하고, 원화 한 장을 AI 없이 규칙으로 GLB 로 세움",
        "Normalizes nine formats into one verified GLB and builds a GLB from one image by rules, without AI",
      ),
      paths: [
        "apps/web/src/domains/creator/bg3d/studio-bg3d-model-import.ts",
        "apps/web/src/domains/creator/lift3d/studio-lift3d-pipeline.ts",
      ],
    },
  ],
  decisions: [
    {
      choice: t("2D 공간과 3D 도구를 서로 다른 엔진에 둔다", "Keep the 2D space and the 3D tools on different engines"),
      because: t(
        "각 화면이 필요한 엔진만 불러오도록 설계해, 가벼운 만남 화면이 3D 도구의 무게를 지지 않게 합니다.",
        "Each screen is designed to load only the engine it needs, so the light meeting screen does not carry the weight of the 3D tools.",
      ),
      cost: t(
        "두 엔진을 함께 유지해야 하고, 2D 공간에서 3D 장면을 직접 보여 주는 기능은 없습니다.",
        "Two engines must be maintained together, and there is no way to show a 3D scene directly inside the 2D space.",
      ),
    },
    {
      choice: t("월드는 서버가 한 번에 한 버전만 확정한다", "The server confirms one world version at a time"),
      because: t(
        "두 사람이 서로 다른 지도를 보는 일을 막고, 브라우저가 해시를 다시 계산해 어긋나면 공유 기능을 끕니다.",
        "It prevents two people seeing different maps, and the browser recomputes the hash and turns sharing off on a mismatch.",
      ),
      cost: t(
        "발행은 작품 소유자와 관리 권한 멤버만 하고 충돌하면 거절됩니다. 운영 DB 의 실제 발행·다중 사용자 실측은 확인하지 못했습니다.",
        "Only the project owner and members with manage rights publish, and conflicts are rejected; real publications and multi-user behavior in the production database were not verified.",
      ),
    },
    {
      choice: t("3D 엔진은 몰래 바꾸지 않고 사용자가 고른다", "Never swap the 3D engine silently; the user chooses"),
      because: t(
        "엔진마다 같은 캐릭터의 색이 달라질 수 있어(실측 기록 있음), 실패를 다른 엔진 뒤에 숨기지 않습니다.",
        "The same character can look different in each engine (a measurement is on record), so failure is not hidden behind another engine.",
      ),
      cost: t(
        "WebGPU 가 막히는 환경(인앱 브라우저·VRM·WebXR)에서는 WebGL2 를 직접 골라야 합니다.",
        "Where WebGPU is blocked (in-app browsers, VRM, WebXR) the user must pick WebGL2 explicitly.",
      ),
    },
  ],
  pitfall: t(
    "'가상 스튜디오 안에서 3D 를 본다'는 오해입니다. 2D 공간은 이미지 에셋과 Phaser 만 쓰고 3D 와 코드로 이어진 곳을 찾지 못했습니다. 운영 DB 의 실제 발행 월드와 다중 사용자 실측은 확인하지 못했습니다.",
    "It is a misconception that you see 3D inside the virtual studio. The 2D space uses only image assets and Phaser, and no code link to 3D was found. Real published worlds and multi-user behavior in the production database were not verified.",
  ),
  facts: [
    {
      value: "55",
      label: t("VRM 휴머노이드 표준 뼈 이름 수(허용 목록)", "Standard VRM humanoid bone names (allowlist)"),
      source: "apps/web/src/domains/creator/studio-humanoid-bones.ts",
    },
    {
      value: "9",
      label: t("3D 가져오기 기본 형식 수", "Primary 3D import formats"),
      source: "apps/web/src/domains/creator/bg3d/studio-bg3d-model-import.ts",
    },
    {
      value: "32 MiB · 128 MiB",
      label: t("월드 에셋 파일당 · 전체 크기 상한(설계값)", "World asset size limit per file and in total (design value)"),
      source: "packages/studio-project-model/src/graph/world-publication.ts",
    },
  ],
  status: "live",
  atlasIds: [
    "virtual-studio-architecture-overview",
    "world-authority-cas-projection",
    "space-is-not-permission",
    "three-r3f-viewport",
    "vrm-humanoid-rig",
    "glb-optimization-pipeline",
    "lift-2d-to-3d",
  ],
  chapterIds: ["virtual-studio-world-authority", "web-3d-engine"],
  glossaryIds: ["virtual-studio", "vrm", "threejs", "r3f", "gltf", "humanoid-bones"],
};

/** 6) AI가 끼어드는 길 — 처리 위치 선택, 예산 예약, 유료 허락, 제안과 승인. */
export const AI_PATH_SECTION: ArchitectureGuideSection = {
  id: "ai-path",
  group: "runtime",
  number: 6,
  title: t("AI가 끼어드는 길", "How AI joins in"),
  question: t("AI 요청은 어디를 거쳐 누가 승인하나?", "Where does an AI request go, and who approves the result?"),
  oneLine: t(
    "AI는 예산을 먼저 예약하고 무료 길부터 시도하며, 글 도구의 결과는 검토할 제안으로 돌아옵니다.",
    "AI reserves its budget first, tries free routes first, and text-tool results come back as proposals to review.",
  ),
  easy: t(
    "AI 는 택시와 비슷합니다. 타기 전에 미터기 한도를 먼저 정하고(예산 예약), 요금이 안 드는 노선부터 알아보고, 유료 택시는 내가 손을 들어야만 탑니다. 도착한 결과는 짐이 아니라 제안서라서, 내가 받아들일 때만 작품에 들어옵니다.",
    "AI is like a taxi. You set the meter limit before getting in (budget reserved), look for free routes first, and board a paid cab only when you raise your hand. What arrives is a proposal rather than luggage, and it enters the work only when you accept it.",
  ),
  diagram: {
    id: "ai-path-diagram",
    kind: "graph",
    title: t("AI 요청이 지나는 문", "The gates an AI request passes"),
    caption: t(
      "기기 안 → 무료 → (허락한 경우) 유료 순으로 열고, 글 도구 결과는 제안으로 돌아와 작가가 승인하며 이미지 도구는 바로 반영됩니다.",
      "Routes open from on-device to free to (if allowed) paid; text-tool results return as proposals for the author to approve, while image tools apply at once.",
    ),
    alt: t(
      "처리 위치는 사용자가 연 도구에 따라 정해집니다. 기기 안 모델은 서버 없이 처리하고, 무료 공급자는 호출 전에 예산을 예약한 뒤 부르며, 유료 키는 사용자가 허락해야 쓰입니다. 글 도구의 결과는 문서를 바로 고치지 않는 제안으로 돌아오고 작가가 승인한 것만 적용됩니다. 이미지 도구는 새 이미지 요소로 추가되고, 기기 안 이미지 도구는 선택한 이미지를 바로 바꿉니다.",
      "Where a request runs is decided by the tool the user opens. On-device models work without a server, free providers are called only after the budget is reserved, and a paid key is used only when the user allows it. Text-tool results return as proposals that do not edit the document, and only what the author approves is applied. Image tools add a new image element, and on-device image tools replace the selected image at once.",
    ),
    nodes: [
      { id: "ask", label: t("AI 요청", "AI request"), tone: "local", shape: "pill", at: [0, 1] },
      { id: "route", label: t("도구별 처리 위치", "Where it runs"), tone: "neutral", shape: "diamond", at: [1, 1] },
      { id: "device", label: t("기기 안 모델", "On-device model"), sub: t("ONNX · MediaPipe", "ONNX, MediaPipe"), tone: "ai", at: [2, 0] },
      { id: "free", label: t("무료 공급자", "Free providers"), sub: t("먼저 예산을 예약", "Budget reserved first"), tone: "external", shape: "cloud", at: [2, 1] },
      { id: "paid", label: t("내 유료 키", "Your paid key"), sub: t("허락해야 사용", "Only if allowed"), tone: "warn", at: [2, 2] },
      { id: "direct", label: t("바로 반영", "Applied at once"), sub: t("이미지 도구 · 되돌리기가 안전망", "Image tools; undo is the net"), tone: "warn", at: [3, 0] },
      { id: "proposal", label: t("글은 제안으로", "Text as proposal"), sub: t("문서는 그대로", "Document untouched"), tone: "ai", at: [3, 1] },
      { id: "author", label: t("작가의 승인", "Author approval"), sub: t("고른 것만 적용", "Only chosen parts apply"), tone: "warn", shape: "pill", at: [4, 1] },
    ],
    edges: [
      { from: "ask", to: "route" },
      { from: "route", to: "device", label: t("기기 안에서", "On device") },
      { from: "route", to: "free", label: t("무료 먼저", "Free first") },
      { from: "route", to: "paid", label: t("허락할 때만", "If allowed") },
      { from: "device", to: "direct" },
      { from: "free", to: "proposal" },
      { from: "paid", to: "proposal" },
      { from: "paid", to: "direct" },
      { from: "proposal", to: "author", label: t("검토", "Review") },
    ],
  },
  steps: [
    t("처리 위치는 라우터 한 곳이 아니라 사용자가 연 도구가 정하고, 무료 길의 순서만 코드가 정합니다.", "No single router picks where a request runs: the tool the user opens decides (on-device model, reviewed free provider, or, only if allowed, your paid key), and only the order among free routes is fixed by code."),
    t("기기 안 모델(ONNX·MediaPipe)은 그림이 서버로 나가지 않아 키도 한도도 필요 없습니다.", "On-device models (ONNX, MediaPipe) never send the image to a server, so no key or quota is needed."),
    t("무료 길은 호출 전에 하루 한도를 먼저 예약하고, 한도에 닿으면 공급자를 부르지 않고 멈춥니다.", "Free routes reserve the daily limit before calling, and at the limit they stop without calling the provider."),
    t("확실히 거절된 경우만 다음 무료 공급자로 넘기고, 시간 초과·5xx 같은 애매한 실패는 다시 보내지 않습니다.", "Only a definite rejection moves on to the next free provider; ambiguous failures such as timeouts and 5xx are not sent again."),
    t("유료 키는 설정에서 허락해야 자동 순서에 들어오며, 내 키는 기본적으로 이 탭의 메모리에만 둡니다.", "A paid key enters the automatic order only when allowed in settings, and by default your key stays in this tab's memory."),
    t("글 도구 결과는 제안으로 돌아와 고른 것만 적용되고, 이미지 도구는 새 요소 추가·ONNX 는 바로 교체입니다.", "Text-tool results come back as proposals instead of editing the document, and only what the author picks is applied as one undo step. Image tools add a new image element, and on-device image tools (ONNX) replace the selected image at once."),
  ],
  background: [
    t(
      "AI 는 부르는 만큼 돈이 들고, 같은 요청을 두 번 보내면 요금도 두 번 나갑니다. 결과가 마음에 안 들 수도 있어서 작품을 AI 가 직접 고치게 두면 되돌리기도 어렵습니다. 그래서 AI 길 곳곳에 '멈추는 문'을 세웠습니다: 예산 예약, 무료 허용 목록, 애매한 실패는 재시도 금지, 유료는 내 허락, 글 도구의 결과는 제안.",
      "AI costs money for every call, and sending the same request twice bills twice. Results may also disappoint, and letting AI edit the work directly makes undoing hard. So gates that stop things are placed along the AI route: budget reservation, a free allowlist, no retry on ambiguous failure, paid use only with your consent, and text-tool results as proposals.",
    ),
    t(
      "브라우저에는 무료 경로마다 하루 25회·예약 토큰 64,000의 안전 한도가, 서버 자동 무료 AI 에는 사용자당 하루 200회·토큰 1,000,000(코드 기본값)의 원장과 전체 합계 상한(500회·2,000,000 토큰)이 있고, 날짜 경계는 UTC 자정입니다. 서버 공유 풀은 공급자 9곳을 기본 순서로 시도하지만 스위치·키·운영자 확인이 갖춰져야 준비됨이 되며, 저장소 기준으로 지금은 설정 필요 상태입니다.",
      "The browser has a safety limit of 25 calls a day and 64,000 reserved tokens per free route, and the server's automatic free AI has a ledger of 200 calls and 1,000,000 tokens per user per day (code defaults) plus a global cap of 500 calls and 2,000,000 tokens, with the day boundary at UTC midnight. The shared server pool tries nine providers in a default order, but it counts as ready only when the switch, keys and operator confirmation are all in place, and by the repository it currently needs setup.",
    ),
    t(
      "한계: '무료 우선'은 '공짜'가 아닙니다. 계정이 결제 없는 무료 계정인지는 코드가 아니라 사용자 확인 사항입니다. 이미지·3D 는 자동 무료 길이 없어 내 키를 명시해야 하고 3D 키만 ToonStudio API 를 거칩니다. 획 제안 생성기는 AI 모델이 아니라 이동평균 규칙이며, 아직 화면에 연결되어 있지 않고 테스트에서만 돕니다.",
      "Limits: 'free first' does not mean free of charge. Whether an account is a no-billing free account is for the user to confirm, not something code can tell. Images and 3D have no automatic free route and need your own key, and only the 3D key passes through the ToonStudio API. The stroke-proposal generator is a moving-average rule, not an AI model, and it is not yet wired into the product UI; only tests exercise it.",
    ),
  ],
  inService: [
    {
      what: t("AI 설정 · 무료 길 고르기", "AI settings and free-route choice"),
      role: t(
        "프리셋은 공급자 10곳과 사용자 지정 1개(운영 CSP 허용은 OpenRouter·Z.ai 2곳뿐)이며, 검토된 허용 목록과 같을 때만 무료로 보고 사용자 지정은 청구될 수 있는 BYOK 로 따로 다룸",
        "The presets are 10 providers and 1 user-defined entry (the production CSP allows only 2 of the 10, OpenRouter and Z.ai); one counts as free only when it matches the reviewed free allowlist, and the user-defined one is handled separately as BYOK that can be billed to you",
      ),
      paths: ["apps/web/src/shared/ai/free-ai-policy.ts", "apps/web/src/shared/ai/user-ai-store.ts"],
    },
    {
      what: t("호출 전 예산 예약", "Reserving the budget before a call"),
      role: t(
        "브라우저는 하루 25회, 서버는 PostgreSQL 원장에 먼저 예약한 뒤 호출하고 응답 뒤 정산",
        "The browser allows 25 calls a day and the server reserves in a PostgreSQL ledger first, calling afterwards and settling after the response",
      ),
      paths: ["apps/web/src/shared/ai/free-ai-runtime-budget.ts", "apps/api/src/modules/studio-ai/studio-ai-usage.ts"],
    },
    {
      what: t("서버 공유 무료 풀", "Shared free pool on the server"),
      role: t(
        "공급자 9곳을 기본 순서로 시도하고 확정 거절만 다음으로 넘기며, 영수증으로 같은 요청의 재처리를 막음",
        "Tries nine providers in order, moves on only after a definite rejection, and uses receipts to block reprocessing of the same request",
      ),
      paths: ["apps/api/src/modules/studio-ai/studio-ai-provider.ts", "apps/api/src/modules/studio-ai/studio-ai.service.ts"],
    },
    {
      what: t("내 키 (BYOK) 호출", "Calls with your own key (BYOK)"),
      role: t(
        "키는 기본적으로 탭 메모리에만 두고 쿠키 없이 공급자로 직접 전송(운영 CSP 가 허용하지 않는 호스트는 브라우저가 차단), 유료 키는 허락 스위치(기본 꺼짐)",
        "By default the key stays in tab memory and goes straight to the provider without cookies (the browser blocks hosts the production CSP does not allow); paid keys sit behind an allow switch that is off by default",
      ),
      paths: ["apps/web/src/shared/ai/user-ai-transport.ts", "apps/web/src/shared/ai/user-ai-types.ts"],
    },
    {
      what: t("기기 안 AI와 제안 검토", "On-device AI and proposal review"),
      role: t(
        "ONNX 모델이 그림 처리를 기기에서 하되 선택한 이미지를 바로 바꾸고, 글 도구의 결과는 제안으로 돌아와 작가가 골라 적용",
        "ONNX models process images on the device and replace the selected image at once, while text-tool results come back as proposals for the author to pick and apply",
      ),
      paths: [
        "apps/web/src/domains/creator/studio-onnx-inference-provider.ts",
        "apps/web/src/domains/creator/ai/studio-ai-execution-preflight.ts",
      ],
    },
  ],
  decisions: [
    {
      choice: t("부른 뒤가 아니라 부르기 전에 예산을 예약", "Reserve the budget before the call, not after"),
      because: t(
        "요금이 나간 뒤에 세면 이미 늦으므로, 최악값을 먼저 잡고 한도에 닿으면 호출하지 않습니다.",
        "Counting after the charge is too late, so the worst case is reserved first and no call is made once the limit is reached.",
      ),
      cost: t(
        "정산 전까지 예약량이 실제보다 클 수 있고, 한도에 닿으면 유료로 넘기지 않고 멈춥니다.",
        "Until settlement the reservation can exceed real usage, and at the limit it stops instead of moving to a paid route.",
      ),
    },
    {
      choice: t("애매한 실패는 다른 길로 다시 보내지 않는다", "Never resend an ambiguous failure along another route"),
      because: t(
        "시간 초과 때는 공급자가 이미 일을 시작했는지 알 수 없어, 다시 보내면 요금이 두 번 나갈 수 있습니다.",
        "After a timeout nobody knows whether the provider has already started, so sending again could bill twice.",
      ),
      cost: t(
        "일시적 장애에서도 자동으로 다른 공급자로 넘어가지 않아 사용자가 직접 다시 시도해야 합니다.",
        "Even a brief outage does not switch providers automatically, so the user has to retry by hand.",
      ),
    },
    {
      choice: t("글 도구는 제안만, 확정은 사람이", "Text tools propose, people decide"),
      because: t(
        "되돌리기 단위를 하나로 묶고 낡은 제안은 세대 번호로 거절해, 작품이 AI 때문에 망가지지 않게 합니다.",
        "Bundling the undo step and rejecting stale proposals by generation number keeps the work from being damaged by AI.",
      ),
      cost: t(
        "확인 단계가 하나 늘고, 이미지 도구는 새 요소 추가·기기 안 ONNX 도구는 바로 교체라 이 보호가 닿지 않습니다. 획 제안 생성기는 AI 모델이 아닌 규칙 기반이며 아직 화면에 연결되지 않았습니다.",
        "It adds a confirmation step, and image tools add a new element while on-device ONNX tools replace at once, so this protection does not reach them. The stroke-proposal generator is rule-based rather than an AI model and is not yet wired to the screen.",
      ),
    },
  ],
  pitfall: t(
    "'무료 우선 = 공짜'가 아니며 서버 공유 무료 풀은 키·운영 확인 대기('설정 필요')입니다. 한도 날짜 경계는 UTC 자정입니다. 모든 AI 가 기기 안에서 도는 것도 아니고, 글·이미지 생성은 클라우드입니다. 결과가 모두 제안으로 돌아오는 것도 아닙니다.",
    "'Free first' does not mean free of charge, and the shared free pool is waiting on keys and operator confirmation ('setup needed'). The daily limit resets at UTC midnight. Not all AI runs on the device; text and image generation are cloud-based. Not every result returns as a proposal, either.",
  ),
  facts: [
    {
      value: "25 · 64,000",
      label: t("브라우저 하루 요청 수 · 예약 토큰", "Browser calls per day and reserved tokens"),
      source: "apps/web/src/shared/ai/free-ai-runtime-budget.ts",
    },
    {
      value: "200 · 1,000,000",
      label: t("서버 사용자당 하루 요청 수 · 토큰(코드 기본값)", "Server calls and tokens per user per day (code defaults)"),
      source: "apps/api/src/modules/studio-ai/studio-ai-usage.ts",
    },
    {
      value: "9",
      label: t("서버 공유 풀의 공급자 수", "Providers in the shared server pool"),
      source: "apps/api/src/modules/studio-ai/studio-ai-provider.ts",
    },
    {
      value: "false",
      label: t("유료 폴백 허락(allowPaidFallback)의 기본값", "Default of the paid-fallback switch (allowPaidFallback)"),
      source: "apps/web/src/shared/ai/user-ai-types.ts",
    },
  ],
  status: "configured",
  atlasIds: [
    "free-first-ai-routing",
    "quota-ledger-budget",
    "ambiguous-failure-no-retry",
    "byok-paid-approval-gate",
    "free-ai-provider-allowlist",
    "onnx-runtime-web-inference",
    "ai-proposal-not-commit",
  ],
  chapterIds: ["free-ai-routing", "ai-routing", "on-device-inference"],
  glossaryIds: ["ai-routing", "quota-ledger", "byok", "ai-provider-allowlist", "ai-proposal-review", "ambiguous-failure", "onnx"],
};

/** 7) 실패해도 작업이 남는 이유 — 층마다 무엇이 막히고 무엇이 남는가. */
export const RESILIENCE_SECTION: ArchitectureGuideSection = {
  id: "resilience",
  group: "runtime",
  number: 7,
  title: t("실패해도 작업이 남는 이유", "Why work survives failures"),
  question: t("서버·네트워크·GPU·AI 한도가 막히면?", "What happens when the server, network, GPU or AI limit is blocked?"),
  oneLine: t(
    "실패는 숨기지 않고 알리되, 작업이 놓일 바닥은 기기 저장입니다. 기기 저장이 막히면 그 사실을 알립니다.",
    "Failures are announced rather than hidden, and device saving is the floor the work rests on; if that saving is blocked, the app says so.",
  ),
  easy: t(
    "배의 격벽과 비슷합니다. 한 칸에 물이 새도 다른 칸이 막아 주도록 칸을 나눴습니다. 서버가 멈추면 기기 안 저장이, 저장이 막히면 알림과 복구가, GPU 가 끊기면 마지막 정상 화면이 작품을 지킵니다.",
    "It works like the bulkheads of a ship: the hull is split so that water leaking into one compartment is held by the others. If the server stops, on-device saving holds; if saving is blocked, notices and recovery step in; if the GPU drops, the last good frame protects the work.",
  ),
  diagram: {
    id: "resilience-diagram",
    kind: "layers",
    title: t("무엇이 막히면 무엇이 남나", "What remains when something is blocked"),
    caption: t(
      "바깥의 장애일수록 위, 기기 안의 방어일수록 아래입니다. 맨 아래 복구 저널이 마지막 바닥입니다.",
      "Outer failures sit higher and on-device defenses lower; the recovery journal at the bottom is the final floor.",
    ),
    alt: t(
      "위에서부터 AI 한도와 공급자 실패, 서버·네트워크 장애, 새 버전 배포, GPU 장치 끊김, 탭·저장 공간 문제, 브라우저 꺼짐·크래시의 여섯 층입니다. 각 층은 막혔을 때 남는 것을 적었고, 서버와 공급자 쪽 문제는 위 두 층이 기기 안의 문제는 아래 네 층이 막습니다.",
      "From the top, six layers: AI limits and provider failures, server and network outages, new releases, GPU device loss, tab and storage-space problems, and browser close or crash. Each layer states what remains when it is blocked; the top two cover server and provider problems and the lower four cover problems on the device.",
    ),
    layers: [
      {
        id: "ai",
        label: t("AI 한도·공급자 실패", "AI limits and provider failures"),
        sub: t("예산을 먼저 예약하고, 애매한 실패는 다시 보내지 않고 멈춤", "Budget reserved first; ambiguous failures stop instead of retrying"),
        tone: "ai",
        chips: ["Quota ledger", "Allowlist"],
      },
      {
        id: "server",
        label: t("서버·네트워크 장애", "Server and network outages"),
        sub: t("4초 안에 답이 없으면 기기에 둔 같은 화면으로 대신 열기", "No answer in 4 s: the same studio opens from the device"),
        tone: "server",
        chips: ["Service Worker", "Offline shell"],
      },
      {
        id: "update",
        label: t("새 버전 배포", "New releases"),
        sub: t("저장·동기화가 끝나야 눌리는 업데이트 버튼", "The update button works only after saving finishes"),
        tone: "local",
        chips: ["Update safety", "Kill switch"],
      },
      {
        id: "gpu",
        label: t("GPU 장치 끊김", "GPU device loss"),
        sub: t("엔진을 몰래 바꾸지 않고 같은 GPU 재연결, 3회 끊기면 이번 세션은 GPU 포기", "Reconnects the same GPU; after 3 losses the session gives up on the GPU"),
        tone: "warn",
        chips: ["GPU fabric", "Loss recovery"],
      },
      {
        id: "tabs",
        label: t("탭·저장 공간 문제", "Tab and storage-space problems"),
        sub: t("먼저 연 탭만 저장(둘째 탭은 저장 안 됨), 공간 부족은 알리고 회수", "First tab saves, others do not; low space is reclaimed"),
        tone: "local",
        chips: ["Web Locks", "Safe mode"],
      },
      {
        id: "journal",
        label: t("브라우저 꺼짐·크래시", "Browser close or crash"),
        sub: t("복구 저널이 확실히 저장된 마지막 상태까지 되살림", "The recovery journal restores the last state that was safely stored"),
        tone: "good",
        chips: ["OPFS journal", "Autosave"],
      },
    ],
    brackets: [
      { label: t("서버·공급자 쪽 문제", "Problems outside your device"), layerIds: ["ai", "server"] },
      { label: t("기기 안에서 막는 문제", "Problems stopped on your device"), layerIds: ["update", "gpu", "tabs", "journal"] },
    ],
  },
  steps: [
    t("편집이 1.5초 멈추거나 펜을 뗄 때 복구 저널에 기록해, 브라우저가 꺼져도 마지막 상태로 돌아옵니다.", "When editing pauses for 1.5 seconds or the pen lifts, the journal records it, so the last state returns even if the browser closes."),
    t("같은 문서를 탭 두 개로 열면 먼저 연 탭만 저장합니다. 나머지 탭도 그릴 수는 있지만 그린 내용은 저장되지 않으며, 화면에 그렇게 안내합니다.", "If a document is open in two tabs, only the first tab saves. The other tab can still draw, but what it draws is not saved, and the screen says so."),
    t("저장 공간이 모자라면 조용히 실패하지 않고 알린 뒤, 안전 모드에서 복구 기록을 정리합니다.", "When storage runs short it does not fail silently: it announces the problem, then tidies recovery records in safe mode."),
    t("서버가 4초 안에 답하지 않거나 5xx 를 주면 기기에 준비해 둔 같은 스튜디오 화면을 대신 엽니다.", "If the server does not answer within 4 seconds or returns 5xx, the same studio screen prepared on the device opens instead."),
    t("GPU 가 끊기면 다른 엔진으로 몰래 바꾸지 않고 같은 GPU 재연결을 시도하며 마지막 정상 프레임을 지킵니다.", "When the GPU drops, it retries the same GPU instead of switching engines silently and keeps the last good frame."),
    t("AI 는 한도에 닿으면 호출하지 않고 애매한 실패는 다시 보내지 않으며, 새 버전은 저장이 끝나야 적용됩니다.", "At its limit AI is not called, ambiguous failures are not resent, and a new version is applied only after saving ends."),
  ],
  background: [
    t(
      "소프트웨어에서 실패는 '일어날지'가 아니라 '언제 일어날지'의 문제입니다. 인터넷이 끊기고, 서버가 잠들고, 브라우저 탭이 닫히고, GPU 가 멈추고, 무료 AI 한도가 바닥납니다. 그래서 ToonStudio 는 실패를 없애려 하지 않고, 실패했을 때 작품이 어디에 남는지와 사용자에게 무엇을 알리는지를 층마다 미리 정해 두었습니다.",
      "In software, failure is not a question of whether but when: the internet drops, the server falls asleep, a tab closes, the GPU stops and the free AI limit runs out. So ToonStudio does not try to remove failure; for each layer it decides in advance where the work remains and what the user is told.",
    ),
    t(
      "공통 원칙은 둘입니다. 첫째, 바닥은 기기입니다. 복구 저널(OPFS)과 SQLite 가 서버 없이도 마지막 상태를 지킵니다. 둘째, 실패는 숨기지 않습니다. 저장 실패는 고지 → 안전 모드 → 공간 회수 순으로 알리고, GPU·AI 는 몰래 다른 엔진·공급자로 갈아타지 않습니다. 갈아타면 결과가 달라지거나 요금이 두 번 나갈 수 있기 때문입니다.",
      "Two principles run through all of it. First, the floor is the device: the recovery journal (OPFS) and SQLite keep the last state without a server. Second, failures are not hidden: a failed save is announced, then safe mode, then space is reclaimed, and GPUs and AI providers are never swapped silently, since swapping can change results or bill twice.",
    ),
    t(
      "한계: 오프라인으로 되는 것은 미리 준비된 범위(그리기까지)이고 협업·AI·게시는 서버가 필요합니다. 첫 방문 오프라인은 지원하지 않습니다. 결함 주입 시험은 시뮬레이션이며 실기기에서 아직 돌리지 않은 항목이 파일에 따로 적혀 있습니다. 브라우저 저장소는 백업이 아니므로 내보내기·개인 클라우드 사본이 필요합니다.",
      "Limits: offline covers only what was prepared in advance (drawing), while collaboration, AI and publishing need the server, and a first visit cannot work offline. Fault-injection tests are simulations, and items not yet run on real devices are listed separately in the result file. Browser storage is not a backup, so export files or personal-cloud copies are needed.",
    ),
  ],
  inService: [
    {
      what: t("자동 저장과 복구", "Autosave and recovery"),
      role: t(
        "A/B 두 칸 복구 저널이 크래시 뒤 가장 최근의 온전한 상태를 되살리고, 실패하면 SQLite 로 내려감",
        "A two-slot A/B recovery journal restores the latest intact state after a crash and falls back to SQLite if it fails",
      ),
      paths: [
        "apps/web/src/domains/creator/studio-opfs-recovery-journal.ts",
        "apps/web/src/domains/creator/studio-autosave-opfs-session.ts",
      ],
    },
    {
      what: t("탭 하나만 저장", "One saving tab"),
      role: t(
        "Web Locks 로 먼저 연 탭만 저장을 맡고(다른 탭은 그릴 수 있으나 저장되지 않음), 그 탭이 닫히면 기다리던 탭이 이어받음",
        "Web Locks let only the first tab save (other tabs can draw but are not saved), and a waiting tab takes over when it closes",
      ),
      paths: ["apps/web/src/domains/creator/studio-autosave-document-leader.ts"],
    },
    {
      what: t("서버 장애 때 같은 화면", "The same screen during outages"),
      role: t(
        "4초 데드라인 뒤 3단 폴백(준비된 셸 → 같은 스튜디오 셸 → 긴급 복구 드로잉)",
        "After a 4-second deadline, a three-step fallback: prepared shell, the same studio shell, then emergency drawing",
      ),
      paths: [
        "apps/web/src/app/service-worker/studio-service-worker-navigation.ts",
        "apps/web/src/app/service-worker/studio-local-drawing-rescue.ts",
      ],
    },
    {
      what: t("GPU 끊김 복구", "GPU loss recovery"),
      role: t(
        "끊기면 같은 GPU 재연결을 시도하며 3회에 닿으면 이번 세션의 GPU 를 포기(장치는 한 곳에서 빌려 쓰는 것이 원칙이나 일부 모듈은 자기 장치를 직접 요청)",
        "Retries the same GPU after a loss and gives up on the GPU for the session after 3 losses (sharing one device is the intent, but some modules request their own)",
      ),
      paths: [
        "apps/web/src/domains/creator/studio-device-loss-recovery.ts",
        "apps/web/src/domains/creator/render/studio-gpu-fabric.ts",
      ],
    },
    {
      what: t("저장 공간·업데이트 안전", "Storage space and update safety"),
      role: t(
        "쿼터 오류를 알리고 안전 모드에서 공간을 회수하며, 새 버전은 저장이 끝나야 사용자가 눌러 적용",
        "Announces quota errors and reclaims space in safe mode, and applies a new version only after saving ends and the user confirms",
      ),
      paths: [
        "apps/web/src/domains/creator/studio-storage-recovery-runtime.ts",
        "apps/web/src/domains/creator/studio-update-safety.ts",
      ],
    },
  ],
  decisions: [
    {
      choice: t("애매한 실패를 몰래 다른 길로 돌리지 않는다", "Never reroute an ambiguous failure quietly"),
      because: t(
        "GPU 를 몰래 갈아타면 표면마다 다른 픽셀이 나오고, 시간 초과한 AI 요청을 다시 보내면 요금이 두 번 나갈 수 있습니다.",
        "Quietly switching GPUs gives different pixels per surface, and resending an AI request that timed out can bill twice.",
      ),
      cost: t(
        "지원되지 않는 환경에서는 대체 기능 대신 안내가 보이고, 사용자가 직접 다시 시도해야 합니다.",
        "Unsupported environments show a notice instead of a substitute feature, and the user must retry by hand.",
      ),
    },
    {
      choice: t("바닥은 기기 저장, 서버는 그 위", "Device saving is the floor, the server sits above it"),
      because: t(
        "서버·네트워크가 멈춰도 그리기와 자동 저장은 이어져, 잠드는 무료 서버의 약점을 가립니다.",
        "Drawing and autosave continue even when the server or network stops, covering the weakness of a free server that sleeps.",
      ),
      cost: t(
        "브라우저 저장소는 백업이 아니고 첫 방문 오프라인은 불가하며, 협업·AI·게시는 서버 없이는 되지 않습니다.",
        "Browser storage is not a backup, a first visit cannot work offline, and collaboration, AI and publishing do not work without the server.",
      ),
    },
    {
      choice: t("업데이트는 저장이 끝나야 적용", "Apply updates only after saving ends"),
      because: t(
        "새 버전으로 갈아끼우는 순간 작업 중이던 상태가 사라지지 않게, 각 모듈이 '지금 안전한가'를 답하게 했습니다.",
        "So that swapping in a new version never loses work in progress, each module has to answer whether it is safe right now.",
      ),
      cost: t(
        "새 버전 적용이 늦어지고, 판정 중 오류는 '안전하지 않음'으로 보아 버튼이 잠깁니다.",
        "Applying the new version is delayed, and an error during evaluation counts as 'not safe' so the button stays locked.",
      ),
    },
  ],
  pitfall: t(
    "'오프라인이면 다 된다'고 말하지 마세요. 첫 방문 오프라인은 불가하고 협업·AI·게시는 서버가 필요합니다. 결함 주입·소크 시험은 시뮬레이션이며 실기기 검증이 남은 항목이 있습니다.",
    "Do not say 'everything works offline': a first visit cannot work offline and collaboration, AI and publishing need the server. Fault-injection and soak tests are simulations, with some items still awaiting real-device checks.",
  ),
  facts: [
    {
      value: "1.5 s",
      label: t("편집이 멈춘 뒤 자동 저장까지의 지연", "Delay from the last edit to the autosave"),
      source: "apps/web/src/domains/creator/StudioCuttoonEditorHost.tsx",
    },
    {
      value: "4 s",
      label: t("서버 응답을 기다리는 한도(스튜디오 열기)", "How long opening the studio waits for the server"),
      source: "apps/web/src/app/service-worker/studio-service-worker-navigation.ts",
    },
    {
      value: "3",
      label: t("GPU 장치 손실이 이 횟수(회)에 닿으면 이번 세션 GPU 포기", "GPU losses (times) after which the session gives up on the GPU"),
      source: "apps/web/src/domains/creator/studio-device-loss-recovery.ts",
    },
    {
      value: "2.25 MiB",
      label: t("서비스 워커 필수(critical) 미리받기 예산 — 넘으면 빌드 실패", "Service Worker critical precache budget; exceeding it fails the build"),
      source: "apps/web/src/app/service-worker/studio-service-worker-precache-plan.ts",
    },
  ],
  status: "live",
  atlasIds: [
    "autosave-crash-recovery-journal",
    "web-locks-broadcastchannel-single-author",
    "storage-persistence-quota-safe-mode",
    "server-down-fallback-deadline",
    "user-approved-update-kill-switch",
    "webgpu-tier-budget-recovery",
    "fault-injection-and-soak",
  ],
  chapterIds: ["pwa-continuity", "storage", "troubleshooting-evidence"],
  glossaryIds: ["fail-visible", "gpu-device-loss", "kill-switch", "fault-injection", "web-locks", "offline-shell", "soak-test"],
};

export const ARCHITECTURE_RUNTIME_SECTIONS_C: readonly ArchitectureGuideSection[] = [
  VIRTUAL_STUDIO_3D_SECTION,
  AI_PATH_SECTION,
  RESILIENCE_SECTION,
];
