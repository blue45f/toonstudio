import { INTERACTION_REVIEWED_AT, t } from "./engineering-atlas-interaction-kit";

import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/** interaction · 선택 기준과 접근성 카드: 끌기 구현 방식 고르기, 끌기마다 짝으로 두는 대체 경로(WCAG 2.5.7). */

const CREATOR = "apps/web/src/domains/creator";
const HUB = `${CREATOR}/production-hub`;

const DND_IMPLEMENTATION_CHOICE: EngineeringAtlasEntry = {
  id: "dnd-implementation-choice",
  category: "interaction",
  name: "HTML5 DnD vs Pointer Events",
  title: t("끌기를 구현하는 세 가지 길, 어떻게 고를까", "Three ways to build dragging, and how to choose"),
  status: "live",
  tagline: t(
    "ToonStudio 는 끌기를 일에 따라 세 방식으로 직접 구현했고, 끌어 놓기 라이브러리는 쓰지 않았습니다.",
    "ToonStudio builds dragging three ways depending on the job, and uses no drag-and-drop library.",
  ),
  background: [
    t(
      "물건을 옮기는 방법이 세 가지 있다고 생각해 보세요. 택배 창구에 상자를 건네는 방법(HTML5 끌어 놓기: 전달 규칙을 브라우저가 정해 줌), 손수레를 직접 끌고 가는 방법(Pointer Events: 움직임을 전부 직접 처리), 공장 컨베이어를 쓰는 방법(Konva·three.js 같은 엔진이 자기 장면 안의 끌기를 제공)입니다. ToonStudio 는 일에 따라 셋을 모두 쓰지만 dnd-kit 같은 끌어 놓기 라이브러리는 쓰지 않습니다.",
      "Imagine three ways of moving goods: handing a box over a parcel counter (HTML5 drag and drop: the browser sets the hand-over rules), pushing your own handcart (Pointer Events: you handle every movement), or using a factory conveyor (engines such as Konva or three.js provide dragging inside their own scene). ToonStudio uses all three depending on the job, but no drag-and-drop library such as dnd-kit.",
    ),
    t(
      "기준은 구현 위치와 코드 주석에서 정리한 것입니다. ① 장면 안의 객체(캔버스·3D)는 엔진 기능(Konva draggable, three.js TransformControls). ② 바깥 데이터를 받으면 HTML5 끌어 놓기: OS 에서 끌어온 파일은 drop 이벤트로만 들어옵니다. ③ 놓을 대상이 있는 단순 목록 재정렬(레이어·페이지·공정 디자이너)도 HTML5. ④ 여러 열·여러 카드 동시 이동·터치 스크롤 보존·자동 스크롤이 필요한 칸반은 Pointer Events. ⑤ 놓을 대상 없는 연속 조작(창 이동, 스플리터, 바텀시트)은 Pointer Events 와 포인터 캡처.",
      "The criteria below are what I read from where each feature lives and from code comments. (1) Objects inside a scene (canvas, 3D) use engine features (Konva draggable, three.js TransformControls). (2) Data from outside uses HTML5 drag and drop, since files dragged from the OS arrive only as drop events. (3) A simple list reorder with drop targets (layers, pages, the process designer) is also HTML5. (4) The kanban board, which needs several columns, multi-card moves, touch scrolling and auto-scroll, uses Pointer Events. (5) Continuous gestures with no drop target (moving windows, splitters, bottom sheets) use Pointer Events with pointer capture.",
    ),
    t(
      "일반적으로 라이브러리는 키보드 센서나 자동 스크롤을 대신 해 주는 대신 의존성이 늘어납니다. 이 저장소는 의도 계산·슬롯 변환·키 해석을 순수 함수로 분리해 DOM 없이 테스트하는 쪽을 택했습니다. 다만 라이브러리와 비교해 이 선택을 기록한 결정 문서(ADR)는 찾지 못했고, 속도나 번들 크기를 비교한 수치도 없습니다(미확인). 같은 제작 허브 안에서도 칸반은 Pointer Events, 공정 디자이너는 HTML5 로 갈립니다.",
      "Libraries generally supply keyboard sensors and auto-scroll in exchange for more dependencies. This repository instead split intent calculation, slot conversion and key interpretation into pure functions that are tested without a DOM. I found no decision record (ADR) that compares this choice with a library, and no speed or bundle-size numbers (unconfirmed). Even inside the same production hub, the kanban uses Pointer Events while the process designer uses HTML5.",
    ),
    t(
      "방식이 달라도 계약은 같습니다. 끄는 동안은 미리보기(의도)만 보여 주고, 놓을 때 한 번만 커밋하며, Esc·cancel·blur 는 저장 없는 취소이고, 잠금 상태에서는 시작 자체를 막고, 끌지 않는 대체 경로를 함께 둡니다. 대가는 방식마다 접근성·터치 검증을 따로 해야 한다는 점입니다.",
      "The contract is the same whichever way is used. While dragging only a preview (the intent) is shown, the commit happens once on drop, Esc, cancel and blur cancel without saving, locked states stop a drag from starting, and a non-dragging alternative always exists. The price is that each approach needs its own accessibility and touch verification.",
    ),
  ],
  keyPoints: [
    t("외부 데이터·단순 목록은 HTML5, 복잡한 제스처는 Pointer Events", "Outside data and simple lists use HTML5; complex gestures use Pointer Events"),
    t("캔버스·3D 안의 물체는 Konva·three.js 의 내장 기능", "Objects inside canvas and 3D use Konva and three.js built-ins"),
    t("라이브러리 0개, 공통 계약: 미리보기·1회 커밋·Esc 취소", "Zero libraries; shared contract: preview, one commit, Esc cancels"),
  ],
  diagram: {
    id: "dnd-implementation-choice-diagram",
    kind: "graph",
    title: t("끌기 방식 고르는 길", "How to pick a dragging approach"),
    caption: t(
      "무엇을 끌고 어디에 놓는지, 제스처가 얼마나 복잡한지로 방식을 고르고, 라이브러리는 거치지 않습니다.",
      "Choose by what is dragged, where it lands and how complex the gesture is; no library is involved.",
    ),
    alt: t(
      "끌어서 하는 일은 먼저 캔버스나 3D 장면 안의 객체인지 묻고, 맞으면 Konva 나 three.js 의 내장 드래그를 씁니다. 아니면 바깥 데이터인지 물어 맞으면 HTML5 끌어 놓기를 쓰고, 다중 열·터치 스크롤 같은 복잡한 제스처면 Pointer Events 로 직접 만듭니다. 놓을 대상이 있는 목록 재정렬은 HTML5, 없는 창 이동·스플리터는 포인터 캡처를 씁니다. 끌어 놓기 라이브러리는 이 흐름 어디에도 쓰이지 않습니다.",
      "A drag first asks whether the object lives inside a canvas or 3D scene; if so it uses Konva's or three.js's built-in dragging. Otherwise it asks whether the data comes from outside and uses HTML5 drag and drop, or, for complex gestures such as several columns and touch scrolling, builds the drag with Pointer Events. A list reorder with drop targets uses HTML5, while moving windows and splitters with no target use pointer capture. No drag-and-drop library appears anywhere in the flow.",
    ),
    nodes: [
      { id: "start", label: t("끌어서 하는 일", "A drag task"), sub: t("무엇을 끌고 어디에 놓나", "What and where to"), tone: "neutral", shape: "pill", at: [0, 1] },
      { id: "lib", label: t("DnD 라이브러리", "DnD library"), sub: t("dnd-kit 등 · 코드에 0개", "dnd-kit etc.; none in code"), tone: "warn", shape: "cloud", at: [0, 0] },
      { id: "q1", label: t("장면 안 객체?", "In a scene?"), tone: "neutral", shape: "diamond", at: [1, 1] },
      { id: "engine", label: t("엔진 내장 드래그", "Engine built-in"), sub: t("Konva · three.js", "Konva, three.js"), tone: "external", at: [1, 0] },
      { id: "q2", label: t("바깥 데이터?", "Outside data?"), sub: t("파일·카드", "files, cards"), tone: "neutral", shape: "diamond", at: [2, 1] },
      { id: "html5ext", label: t("HTML5 끌어 놓기", "HTML5 drag and drop"), sub: t("OS 파일 · 삽입 카드", "OS files, insert cards"), tone: "local", at: [2, 0] },
      { id: "q3", label: t("복잡한 제스처?", "Complex gesture?"), tone: "neutral", shape: "diamond", at: [3, 1] },
      { id: "pointerA", label: t("Pointer Events", "Pointer Events"), sub: t("칸반·터치·자동 스크롤", "Kanban, touch, auto-scroll"), tone: "local", at: [3, 0] },
      { id: "q4", label: t("놓을 대상?", "Drop target?"), tone: "neutral", shape: "diamond", at: [4, 1] },
      { id: "html5list", label: t("HTML5: 순서 변경", "HTML5: reorder"), sub: t("레이어·페이지·공정", "Layers, pages, process"), tone: "local", at: [4, 0] },
      { id: "pointerB", label: t("Pointer + 캡처", "Pointer + capture"), sub: t("창 이동·스플리터·시트", "Windows, splitters, sheets"), tone: "local", at: [5, 1] },
    ],
    edges: [
      { from: "start", to: "lib", style: "dashed", label: t("쓰지 않음", "not used") },
      { from: "start", to: "q1" },
      { from: "q1", to: "engine", label: t("예", "yes") },
      { from: "q1", to: "q2", label: t("아니오", "no") },
      { from: "q2", to: "html5ext", label: t("예", "yes") },
      { from: "q2", to: "q3", label: t("아니오", "no") },
      { from: "q3", to: "pointerA", label: t("예", "yes") },
      { from: "q3", to: "q4", label: t("아니오", "no") },
      { from: "q4", to: "html5list", label: t("예", "yes") },
      { from: "q4", to: "pointerB", label: t("아니오", "no") },
    ],
  },
  usage: [
    {
      feature: t("브라우저 표준 끌어 놓기 · 바깥 데이터와 단순 목록", "Browser drag and drop · outside data and simple lists"),
      role: t(
        "삽입 카드→캔버스, OS 파일→캔버스, 레이어·페이지 순서 바꾸기가 draggable 과 dragstart·dragover·drop 으로 구현됩니다.",
        "Insert card to canvas, OS file to canvas, and layer and page reordering are built with draggable and dragstart, dragover and drop.",
      ),
      paths: [
        `${CREATOR}/StudioInsertHubDirectDragBoundary.tsx`,
        `${CREATOR}/layer/StudioLayerNavigator.tsx#beginItemLayerDrag`,
        `${CREATOR}/page/studio-page-strip-dnd.ts`,
        `${HUB}/ProductionWorkflowDesigner.tsx`,
      ],
      route: "/studio",
    },
    {
      feature: t("Pointer Events 직접 구현 · 칸반과 창·스플리터", "Hand-built Pointer Events · kanban, windows and splitters"),
      role: t(
        "칸반 보드는 window 리스너 기반 상태기계, 떠 있는 패널은 포인터 캡처 세션, 스플리터는 캡처와 rAF 폭 갱신, 바텀시트는 손잡이에 포인터 캡처를 걸고 시트 transform 을 직접 바꿉니다.",
        "The kanban board is a state machine on window listeners, floating panels use a pointer-capture session, splitters use capture plus rAF width updates, and the bottom sheet captures the pointer on its handle and writes the sheet's transform directly.",
      ),
      paths: [
        `${HUB}/board/use-board-dnd.ts`,
        `${CREATOR}/studio-floating-surface-pointer.ts`,
        "apps/web/src/shared/hooks/use-resizable.ts",
        `${CREATOR}/useStudioBottomSheetGesture.ts`,
      ],
    },
    {
      feature: t("엔진 내장 드래그 · 캔버스와 3D", "Engine built-in dragging · canvas and 3D"),
      role: t(
        "Konva 노드의 draggable 과 Stage 의 dragmove 핸들러로 캔버스 객체를 옮기고, three.js TransformControls 로 3D 객체를 옮깁니다. Phaser 월드의 가구 배치는 드래그가 아니라 고스트를 조준해 클릭·키로 확정합니다.",
        "Konva node draggable and a Stage dragmove handler move canvas objects, and three.js TransformControls moves 3D objects. Furniture placement in the Phaser world is not a drag: you aim a ghost and confirm with a click or key.",
      ),
      paths: [
        `${CREATOR}/studio-cuttoon-editor/studio-cuttoon-stage-pointers-drag.ts#onStageDragMove`,
        `${CREATOR}/hybrid-dcc/StudioHybridDccTransformGizmo.tsx`,
        `${CREATOR}/virtual-space/studio-virtual-space-build-placement-canvas.ts`,
      ],
    },
    {
      feature: t("라이브러리 부재 확인", "Confirming there is no library"),
      role: t(
        "루트·apps·packages 의 package.json 에서 dnd-kit, react-dnd, SortableJS, interact.js, use-gesture, react-rnd, dockview 등의 이름을 찾지 못했습니다. motion 패키지는 애니메이션용입니다.",
        "I found none of dnd-kit, react-dnd, SortableJS, interact.js, use-gesture, react-rnd or dockview in the root, apps or packages package.json files. The motion package is for animation.",
      ),
      paths: ["package.json"],
    },
  ],
  samples: [
    {
      kind: "teaching",
      title: t("선택표를 코드로 옮기면", "The choice table written as code"),
      language: "ts",
      code: `export type Approach = "engine" | "html5-dnd" | "pointer-events" | "pointer-capture";

interface Need {
  insideEngineScene: boolean; // Konva·three.js 장면 안의 객체인가
  fromOutsidePage: boolean; // OS 파일 등 바깥에서 오는 데이터인가
  complexGesture: boolean; // 여러 열·다중 선택·터치 스크롤 공존이 필요한가
  hasDropTarget: boolean; // 놓을 대상(목록 칸)이 있는가
}

/** ToonStudio 가 고른 방식을 규칙으로 적은 선택표(설명용). */
export function chooseDragApproach(n: Need): Approach {
  if (n.insideEngineScene) return "engine"; // 엔진이 이미 주는 드래그를 쓴다
  if (n.fromOutsidePage) return "html5-dnd"; // 바깥 데이터는 drop 이벤트로만 들어온다
  if (n.complexGesture) return "pointer-events"; // 고스트·자동 스크롤·터치 스크롤을 직접 처리
  return n.hasDropTarget ? "html5-dnd" : "pointer-capture"; // 단순 목록은 표준, 창·스플리터는 캡처
}`,
      codeEn: `export type Approach = "engine" | "html5-dnd" | "pointer-events" | "pointer-capture";

interface Need {
  insideEngineScene: boolean; // an object inside a Konva or three.js scene
  fromOutsidePage: boolean; // data from outside, such as an OS file
  complexGesture: boolean; // needs several columns, multi-select or touch scrolling
  hasDropTarget: boolean; // there is a drop target (a list slot)
}

/** The approach ToonStudio chose, written as a rule table (for explanation). */
export function chooseDragApproach(n: Need): Approach {
  if (n.insideEngineScene) return "engine"; // use the dragging the engine already provides
  if (n.fromOutsidePage) return "html5-dnd"; // outside data arrives only through drop events
  if (n.complexGesture) return "pointer-events"; // handle ghost, auto-scroll and touch scrolling directly
  return n.hasDropTarget ? "html5-dnd" : "pointer-capture"; // simple lists: standard; windows and splitters: capture
}`,
      explain: t(
        "코드에서 읽은 선택 패턴을 네 가지 질문으로 줄인 설명용 코드입니다. 실제 저장소에 이런 함수가 있는 것은 아니며, 결정 문서가 아니라 구현 위치를 정리한 해석입니다.",
        "Explanatory code that condenses the pattern I read in the code into four questions. No such function exists in the repository, and it is an interpretation of where each feature lives rather than a decision record.",
      ),
      verify: "types",
    },
  ],
  links: [
    {
      title: "MDN · HTML Drag and Drop API",
      url: "https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API",
      kind: "docs",
    },
    {
      title: "MDN · Pointer events",
      url: "https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events",
      kind: "docs",
    },
    {
      title: "Konva · Drag and Drop",
      url: "https://konvajs.org/docs/drag_and_drop/Drag_and_Drop.html",
      kind: "docs",
      note: t("캔버스 객체 드래그를 라이브러리가 제공하는 방식", "How the library provides dragging for canvas objects"),
    },
    {
      title: "W3C · Understanding SC 2.5.7 Dragging Movements",
      url: "https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html",
      kind: "guide",
      note: t("어느 방식이든 끌지 않는 대안이 필요하다는 기준", "Whichever approach, a non-dragging alternative is required"),
    },
  ],
  chapterIds: ["architecture", "open-source"],
  talk: {
    pitch: t(
      "끌기를 구현하는 방법은 크게 세 가지입니다. 브라우저 표준 끌어 놓기, 포인터 이벤트로 직접 만들기, 캔버스·3D 엔진의 내장 기능입니다. ToonStudio 는 일에 따라 셋을 모두 쓰고 외부 끌어 놓기 라이브러리는 한 개도 쓰지 않습니다. 바깥에서 파일을 받을 때와 단순 목록은 표준 방식, 칸반과 창·스플리터는 포인터 이벤트, 캔버스와 3D 안의 물체는 엔진 기능을 씁니다. 어느 쪽이든 끌지 않는 경로를 짝으로 둡니다.",
      "There are three main ways to build dragging: the browser's standard drag and drop, hand-building it on pointer events, and the built-ins of canvas and 3D engines. ToonStudio uses all three depending on the job and no external drag-and-drop library at all. Receiving files from outside and simple lists use the standard way, the kanban board, windows and splitters use pointer events, and objects inside canvas and 3D use engine features. In every case a non-dragging path is provided alongside.",
    ),
    analogy: t(
      "물건을 옮기는 세 방법과 같습니다. 택배 창구(규칙은 브라우저가 정함), 손수레(전부 직접), 공장 컨베이어(엔진이 제공).",
      "Like three ways to move goods: a parcel counter (the browser sets the rules), a handcart (all by hand) and a factory conveyor (the engine provides it).",
    ),
    questions: [
      {
        question: t("왜 dnd-kit 같은 라이브러리를 쓰지 않았나요?", "Why not use a library like dnd-kit?"),
        answer: t(
          "코드에는 끌어 놓기 라이브러리가 없고, 라이브러리와 비교해 결정한 기록도 찾지 못했습니다. 기준은 구현 위치와 코드 주석에서 읽은 것입니다. 바깥 데이터는 표준 drop 이벤트로만 들어오고, 칸반은 '새 라이브러리 없이' 터치·키보드·자동 스크롤을 한 상태기계로 만들었고, 삽입 허브는 기존 drop 처리부 재사용이 목적이었습니다.",
          "There is no drag-and-drop library in the code and I found no record of a comparison. The criteria are what I read from where features live and from code comments: outside data arrives only through standard drop events, the kanban was built 'without a new library' with touch, keyboard and auto-scroll in one state machine, and the insert hub aimed to reuse the existing drop handler.",
        ),
      },
      {
        question: t("방식이 섞여 있으면 유지보수가 어렵지 않나요?", "Doesn't mixing approaches make maintenance harder?"),
        answer: t(
          "방식은 달라도 계약이 같습니다. 끄는 동안은 미리보기만, 놓을 때 한 번 커밋, Esc 는 저장 없는 취소, 잠금이면 시작 금지, 대체 경로 병행입니다. 대신 방식마다 접근성·터치 검증을 따로 해야 하는 비용이 있습니다.",
          "The contract is shared even when the approach differs: preview only while dragging, one commit on drop, Esc cancels without saving, locks stop a drag from starting, and an alternative path exists. The cost is verifying accessibility and touch separately for each approach.",
        ),
      },
      {
        question: t("한 도메인 안에서 방식이 갈리는 이유는요?", "Why does one area use different approaches?"),
        answer: t(
          "제작 허브의 칸반은 Pointer Events, 공정 디자이너와 컬럼 설정은 HTML5 입니다. 복잡도(다중 열·다중 선택·터치 스크롤·자동 스크롤)에 따른 선택으로 읽히지만, 이를 직접 설명한 문서는 없습니다.",
          "In the production hub the kanban uses Pointer Events while the process designer and column settings use HTML5. It reads as a choice driven by complexity (multiple columns, multi-select, touch scrolling, auto-scroll), but no document explains it directly.",
        ),
      },
    ],
    pitfall: t(
      "'dnd-kit·React Aria 를 쓴다'고 말하지 마세요. 과거 설계 문서(docs/architecture 의 V5)에는 채택 후보로 적혀 있지만 package.json 에도 코드에도 없습니다. 위 선택 기준은 코드에서 정리한 해석이며 결정 문서(ADR)가 아닙니다. 방식별 성능 비교 수치도 없습니다.",
      "Do not say we use dnd-kit or React Aria. An older design document (the V5 file under docs/architecture) lists them as candidates, but they are in neither package.json nor the code. The criteria above are an interpretation read from the code, not a decision record (ADR), and there are no performance numbers comparing the approaches.",
    ),
  },
  technologies: ["HTML Drag and Drop", "Pointer Events", "Konva", "Three.js"],
  facts: [
    {
      value: "0",
      label: t(
        "package.json 에서 찾은 끌어 놓기·제스처 라이브러리 수(dnd-kit, react-dnd, SortableJS, interact.js, use-gesture 등을 검색)",
        "Drag-and-drop or gesture libraries found in package.json (searched for dnd-kit, react-dnd, SortableJS, interact.js, use-gesture and more)",
      ),
      source: "package.json",
    },
  ],
  reviewedAt: INTERACTION_REVIEWED_AT,
};

const KEYBOARD_ALTERNATIVES_FOR_DRAG: EngineeringAtlasEntry = {
  id: "keyboard-alternatives-for-drag",
  category: "interaction",
  name: "WCAG 2.5.7",
  title: t("끌기마다 짝으로 두는 대체 경로", "A paired alternative for every drag"),
  status: "live",
  tagline: t(
    "끌어서 되는 일은 키보드·클릭·말로도 되게 하고, 아직 비어 있는 곳은 숨기지 않고 적어 둡니다.",
    "Anything done by dragging also works by keyboard, click and speech, and the gaps that remain are listed openly.",
  ),
  background: [
    t(
      "끌기는 손이 자유로운 사람에게는 자연스럽지만 모두에게 그런 것은 아닙니다. 손이 떨리거나 마우스 대신 키보드·스위치를 쓰거나 화면을 소리로 듣는 사람은 '끌어서만' 되는 기능을 쓰지 못합니다. 건물에 계단만 있으면 휠체어가 들어가지 못하듯 끌기에는 경사로(대체 경로)가 짝으로 있어야 하고, 웹 접근성 기준 WCAG 2.2 의 2.5.7(끌기 동작)과 2.1.1(키보드)이 그 기준입니다.",
      "Dragging feels natural when your hands are free, but not for everyone. People with tremors, people who use a keyboard or switch instead of a mouse, and people who listen to the screen cannot use features that work only by dragging. Just as a building with only stairs shuts out wheelchairs, dragging needs a ramp (an alternative path), and WCAG 2.2's 2.5.7 (Dragging Movements) and 2.1.1 (Keyboard) set that standard.",
    ),
    t(
      "ToonStudio 의 끌기에는 같은 일을 하는 다른 길이 있습니다. 레이어는 Alt+↑/↓ 와 일괄 맨 앞/뒤 버튼, 페이지는 Alt+←/→ 와 ↑/↓ 버튼, 칸반은 Space→방향키→Enter 와 상태 선택 메뉴, 떠 있는 패널은 Alt+방향키와 창 배치 메뉴, 스플리터는 role=separator 와 화살표·Home·End, 가구 배치 지도는 화살표 16px(Shift 1px), VRM 관절은 화살표·PageUp/Down 으로 4°(Shift 1°)입니다. 결과는 aria-live·role=status 문구로 읽어 줍니다.",
      "ToonStudio's drags each have another path to the same job. Layers use Alt+Up/Down and bulk bring-to-front and send-to-back buttons, pages use Alt+Left/Right and up and down buttons, the kanban uses Space, arrows and Enter plus a status menu, floating panels use Alt+arrows and a window layout menu, splitters use role=separator with arrows, Home and End, the furniture map moves 16 px per arrow (1 px with Shift), and VRM joints rotate 4 degrees (1 with Shift) by arrows and PageUp or PageDown. Results are read out through aria-live or role=status text.",
    ),
    t(
      "접근성 전용 끌기 라이브러리는 쓰지 않고 화면마다 직접 구현했습니다. 장점은 화면에 맞는 키 규칙(레이어와 페이지가 같은 Alt+방향키)을 맞출 수 있다는 것이고, 단점은 화면마다 따로 검증해야 한다는 것입니다. 공통 패턴은 ① 키 해석을 순수 함수로 분리 ② 이동 결과를 live region 으로 안내 ③ 끌기와 키보드가 같은 커밋 경로 공유 ④ 잠금 상태에서는 두 경로를 함께 끔입니다.",
      "No accessibility-specific drag library is used; each screen implements its own. The upside is key rules that fit each screen (layers and pages share Alt+arrows); the downside is verifying each screen separately. The common pattern is: (1) key interpretation in pure functions, (2) results announced through a live region, (3) dragging and the keyboard sharing one commit path, and (4) both paths switched off together when locked.",
    ),
    t(
      "비어 있는 곳도 있습니다. 타임라인 키프레임 이동은 끌기뿐이고 키보드로는 선택·삭제(Delete)만 되며, 캔버스에 그려진 도형과 WebGL 기즈모는 스크린리더가 읽을 수 없어 수치 입력 필드 같은 DOM 대체물로 보완합니다(키보드 동작은 일부만 확인). 실제 스크린리더로 들어 본 검증은 확인하지 못했습니다(미확인).",
      "There are gaps. Moving timeline keyframes works only by dragging; the keyboard can select and delete (Delete) but not move. Shapes drawn on the canvas and WebGL gizmos cannot be read by screen readers, so DOM substitutes such as numeric input fields fill in (their keyboard behaviour was only partly checked). Verification with real screen readers was not found (unconfirmed).",
    ),
  ],
  keyPoints: [
    t("끌기마다 키보드·클릭·말(aria-live)로 같은 일을 하는 길을 짝으로 둠", "Every drag has keyboard, click and spoken (aria-live) paths for the same job"),
    t("키 해석은 순수 함수, 끌기와 같은 커밋 경로, 잠금이면 함께 끔", "Key rules are pure functions sharing the drag's commit path, both off when locked"),
    t("비어 있는 곳(키프레임 이동)은 숨기지 않고 표시", "Gaps such as keyframe moving are shown, not hidden"),
  ],
  diagram: {
    id: "keyboard-alternatives-for-drag-diagram",
    kind: "layers",
    title: t("끌기 하나를 받치는 층", "The layers behind each drag"),
    caption: t(
      "끌어서 되는 일은 키보드·클릭·말로도 되게 하고, 비어 있는 곳은 솔직히 표시합니다.",
      "Whatever works by dragging also works by keyboard, click and speech, and the gaps are shown honestly.",
    ),
    alt: t(
      "맨 위에는 마우스와 펜으로 하는 직접 조작이 있고, 그 아래에 같은 일을 하는 키보드 경로, 클릭·탭 경로, 보조기기에 결과를 알리는 층이 차례로 있습니다. 모든 경로 아래에는 Esc 취소, 한 번의 커밋, 잠금 시 비활성이라는 공통 안전장치가 있습니다. 맨 아래에는 아직 비어 있는 곳으로 타임라인 키프레임 이동이 표시됩니다.",
      "At the top is direct manipulation by mouse and pen, and below it come layers for the keyboard path, the click and tap path, and announcing the result to assistive technology, all doing the same job. Under every path sits a shared safety layer of Esc cancel, a single commit and being disabled when locked. At the bottom, timeline keyframe moving is marked as a gap that is still open.",
    ),
    layers: [
      { id: "drag", label: t("끌어서 하는 일", "Work done by dragging"), sub: t("레이어·페이지·칸반·패널·스플리터·3D 관절", "Layers, pages, kanban, panels, splitters, 3D joints"), tone: "local" },
      { id: "keys", label: t("키보드 경로", "Keyboard path"), sub: t("초점을 두고 키로 같은 일을 한다", "Focus an item and do the same job by keys"), tone: "good", chips: ["Alt+↑↓", "Alt+←→", "Space → Enter", "Alt+Arrows", "Home · End", "PageUp · PageDown"] },
      { id: "click", label: t("클릭·탭 경로", "Click and tap path"), sub: t("이동 버튼·상태 메뉴·배치 메뉴(2.5.7)", "Move buttons, status and layout menus (2.5.7)"), tone: "good" },
      { id: "aria", label: t("보조기기에 알리기", "Telling assistive technology"), sub: t("역할·단축키·결과를 말로 전달", "Roles, shortcuts and results as speech"), tone: "neutral", chips: ["role=separator", "aria-keyshortcuts", "aria-live", "role=status", "aria-pressed"] },
      { id: "safe", label: t("공통 안전장치", "Shared safeguards"), sub: t("Esc 취소 · 놓을 때 1회 커밋 · 잠금이면 비활성", "Esc cancels, one commit on drop, disabled when locked"), tone: "warn", chips: ["Esc", "pointercancel", "lostpointercapture", "blur"] },
      { id: "gap", label: t("아직 비어 있는 곳", "Gaps still open"), sub: t("타임라인 키프레임 이동은 끌기뿐(삭제는 Delete)", "Moving timeline keyframes is drag-only (Delete removes)"), tone: "warn" },
    ],
    brackets: [{ label: t("끌지 않는 대체 경로: 같은 일을 한다", "Non-dragging paths do the same job"), layerIds: ["keys", "click", "aria"] }],
  },
  usage: [
    {
      feature: t("레이어·페이지·칸반의 대체 경로", "Alternatives for layers, pages and kanban"),
      role: t(
        "레이어는 Alt+↑/↓·⌘/Ctrl+[ ] 와 일괄 버튼, 페이지 스트립은 Alt+←/→ 와 목록 이동 버튼, 칸반은 손잡이 Space·방향키·Enter 와 Alt+방향키로 같은 이동을 합니다.",
        "Layers use Alt+Up/Down, Cmd/Ctrl+[ ] and bulk buttons, the page strip uses Alt+Left/Right and the list's move buttons, and the kanban uses the handle's Space, arrows and Enter plus Alt+arrows for the same moves.",
      ),
      paths: [
        `${CREATOR}/layer/StudioLayerNavigator.tsx#layerOrderShortcutDirection`,
        `${CREATOR}/page/studio-page-strip-keyboard.ts`,
        `${HUB}/board/use-board-dnd.ts`,
      ],
      route: "/studio",
    },
    {
      feature: t("스플리터·패널 크기 조절", "Splitters and panel resizing"),
      role: t(
        "핸들에 role=separator 와 aria-valuenow·min·max, 화살표 16px·Home·End·Enter 를 주고, 터치 더블탭(350ms)으로 기본 너비를 복원합니다.",
        "The handle carries role=separator with aria-valuenow, min and max, 16 px arrow steps, Home, End and Enter, and a touch double-tap (350 ms) restores the default width.",
      ),
      paths: ["apps/web/src/shared/hooks/use-resizable.ts", `${CREATOR}/StudioPanelResizeHandle.tsx`],
    },
    {
      feature: t("3D 관절과 가구 배치 지도", "3D joints and the furniture layout map"),
      role: t(
        "WebGL 위 관절은 DOM 버튼 오버레이로 올려 포커스·키보드(화살표 4°, Shift 1°)를 확보합니다. 가구 배치 지도는 화살표 16px, Shift 1px, Esc 로 움직이고, Phaser 월드의 배치는 방향키·WASD·Enter·R·Esc 만으로 끝낼 수 있습니다.",
        "Joints over WebGL are lifted into a DOM button overlay for focus and keyboard (arrows 4 degrees, Shift 1). The furniture map moves with arrows 16 px, Shift 1 px and Esc, and placement in the Phaser world can be completed with arrows, WASD, Enter, R and Esc alone.",
      ),
      paths: [
        `${CREATOR}/vrm/StudioVrmJointHandles.tsx#handleKeyboardRotation`,
        `${CREATOR}/virtual-space/StudioVirtualSpaceDecorationEditor.tsx`,
        `${CREATOR}/virtual-space/studio-virtual-space-build-placement-canvas.ts`,
      ],
      route: "/studio/space",
    },
    {
      feature: t("알려진 빈틈 · 타임라인 키프레임", "Known gap · timeline keyframes"),
      role: t(
        "키프레임 점은 끌어서만 옮길 수 있고, 키보드로는 선택과 삭제(Delete)만 됩니다. 버튼 라벨도 '이동하려면 드래그'라고 안내합니다.",
        "Keyframe dots can be moved only by dragging; the keyboard can select and delete (Delete) but not move. The button label itself says to drag to move.",
      ),
      paths: [`${CREATOR}/StudioAnimTimelinePanel.tsx`],
    },
  ],
  samples: [
    {
      kind: "teaching",
      title: t("끌기·키보드·버튼이 같은 이동 함수를 쓰게 하기", "One move function for drag, keyboard and buttons"),
      language: "ts",
      code: `interface Move {
  from: number;
  to: number;
}

/** 끌기·키보드·버튼이 모두 같은 함수로 순서를 바꾸고, 같은 문장으로 결과를 알린다. */
export function createMover<T>(
  getList: () => readonly T[],
  commit: (next: T[]) => void, // 문서에 반영하는 길은 하나뿐
  announce: (message: string) => void, // aria-live 영역에 넣을 문장
) {
  return ({ from, to }: Move): void => {
    const list = getList();
    if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return;
    const next = [...list];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item as T);
    commit(next);
    announce(\`\${from + 1}번째 항목을 \${to + 1}번째로 옮겼어요.\`);
  };
}
// 끌어 놓기 onDrop, Alt+방향키 onKeyDown, ↑/↓ 버튼 onClick 이 모두 move({ from, to }) 를 부른다.`,
      codeEn: `interface Move {
  from: number;
  to: number;
}

/** Drag, keyboard and buttons all reorder through this one function and announce the result the same way. */
export function createMover<T>(
  getList: () => readonly T[],
  commit: (next: T[]) => void, // the one path that changes the document
  announce: (message: string) => void, // the sentence for an aria-live region
) {
  return ({ from, to }: Move): void => {
    const list = getList();
    if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return;
    const next = [...list];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item as T);
    commit(next);
    announce(\`Moved item \${from + 1} to position \${to + 1}.\`);
  };
}
// drag onDrop, Alt+arrow onKeyDown and the up/down buttons' onClick all call move({ from, to }).`,
      explain: t(
        "대체 경로의 핵심은 '입력은 여러 개, 변경 경로는 하나'입니다. 페이지 스트립의 reorderPage 가 같은 구조입니다(끌어 놓기와 Alt+방향키가 같은 함수를 부릅니다).",
        "The heart of an alternative path is many inputs, one change path. The page strip's reorderPage has the same structure: dragging and Alt+arrow keys call the same function.",
      ),
      verify: "types",
    },
    {
      kind: "simplified",
      title: t("스플리터의 키 규칙(WAI-ARIA window splitter)", "Splitter key rules (WAI-ARIA window splitter)"),
      language: "ts",
      code: `/** 폭 조절 핸들(오른쪽 가장자리)의 키 규칙: ←→ 조금씩, Home/End 최소·최대, Enter 기본값. */
export function nextWidth(
  key: string,
  width: number,
  o: { min: number; max: number; step: number; fallback: number },
): number | null {
  const clamp = (v: number) => Math.min(o.max, Math.max(o.min, v));
  switch (key) {
    case "ArrowRight": return clamp(width + o.step);
    case "ArrowLeft": return clamp(width - o.step);
    case "Home": return o.min;
    case "End": return o.max;
    case "Enter": return o.fallback;
    default: return null; // 처리하지 않는 키는 preventDefault 하지 않는다
  }
}
// <div role="separator" aria-orientation="vertical" tabIndex={0}
//      aria-valuenow={w} aria-valuemin={min} aria-valuemax={max} />`,
      codeEn: `/** Key rules for a width handle on the right edge: arrows nudge, Home/End jump to min/max, Enter restores the default. */
export function nextWidth(
  key: string,
  width: number,
  o: { min: number; max: number; step: number; fallback: number },
): number | null {
  const clamp = (v: number) => Math.min(o.max, Math.max(o.min, v));
  switch (key) {
    case "ArrowRight": return clamp(width + o.step);
    case "ArrowLeft": return clamp(width - o.step);
    case "Home": return o.min;
    case "End": return o.max;
    case "Enter": return o.fallback;
    default: return null; // do not preventDefault for keys we do not handle
  }
}
// <div role="separator" aria-orientation="vertical" tabIndex={0}
//      aria-valuenow={w} aria-valuemin={min} aria-valuemax={max} />`,
      explain: t(
        "use-resizable.ts 의 onKeyDown 을 오른쪽 가장자리 핸들 기준으로 줄인 것입니다(실제 코드는 핸들 위치에 따라 ←→ 의미를 뒤집습니다). 포커스를 받을 수 있는 separator 는 조절 위젯이 되어 aria-valuenow 등이 필요합니다.",
        "A reduction of the onKeyDown in use-resizable.ts for a right-edge handle (the real code flips the meaning of left and right by handle position). A focusable separator becomes an adjustable widget and needs aria-valuenow and friends.",
      ),
      source: "apps/web/src/shared/hooks/use-resizable.ts",
      verify: "types",
    },
  ],
  links: [
    {
      title: "W3C · Understanding SC 2.5.7 Dragging Movements",
      url: "https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html",
      kind: "guide",
      note: t("끌기에는 단일 포인터 대안이 필요하다는 기준(AA)", "The criterion that dragging needs a single-pointer alternative (AA)"),
    },
    {
      title: "W3C · Understanding SC 2.1.1 Keyboard",
      url: "https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html",
      kind: "guide",
    },
    {
      title: "WAI-ARIA APG · Window Splitter Pattern",
      url: "https://www.w3.org/WAI/ARIA/apg/patterns/windowsplitter/",
      kind: "guide",
      note: t("스플리터 핸들의 키보드·ARIA 규칙", "Keyboard and ARIA rules for a splitter handle"),
    },
    {
      title: "MDN · ARIA live regions",
      url: "https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Guides/Live_regions",
      kind: "docs",
    },
  ],
  chapterIds: ["quality", "virtual-studio-world-authority"],
  talk: {
    pitch: t(
      "끌어서 하는 일에는 반드시 끌지 않고도 되는 길을 짝으로 둡니다. 레이어와 페이지는 Alt+방향키, 칸반은 Space·방향키·Enter, 패널은 Alt+방향키, 스플리터는 화살표 키로 같은 일을 하고, 결과는 화면 읽기 프로그램이 말로 알려 줍니다. 아직 키프레임 이동처럼 끌기뿐인 곳도 있어서 그 목록도 솔직히 관리합니다.",
      "Every dragging task is paired with a way to do it without dragging. Layers and pages use Alt plus arrows, the kanban uses Space, arrows and Enter, panels use Alt plus arrows and splitters use the arrow keys, and screen readers speak the result. Some places, such as moving keyframes, are still drag-only, so that list is kept honestly too.",
    ),
    analogy: t(
      "계단 옆의 경사로와 엘리베이터 같습니다. 같은 층으로 가는 길이 여러 개여야 누구나 갈 수 있습니다.",
      "Like a ramp and an elevator beside the stairs: there must be more than one way to the same floor for everyone to get there.",
    ),
    questions: [
      {
        question: t("WCAG 를 준수한다고 말해도 되나요?", "Can we say it complies with WCAG?"),
        answer: t(
          "코드에서 확인한 것은 키보드·클릭 대체 경로, ARIA 속성, 안내 문구와 단위 테스트입니다. 준수 인증이나 외부 감사 기록은 확인하지 못했습니다. 접근성 스모크 테스트(e2e/a11y-smoke.spec.ts)는 /studio 같은 라우트를 열어 axe 로 심각한 위반을 검사하지만, 끌기 상호작용은 그 테스트의 대상이 아닙니다.",
          "What I verified in code is the keyboard and click alternatives, ARIA attributes, announcement text and unit tests. I found no certification or external audit record. The accessibility smoke test (e2e/a11y-smoke.spec.ts) opens routes such as /studio and runs axe for serious violations, but drag interactions are not part of that test.",
        ),
      },
      {
        question: t("터치 기기에서 끌기는요?", "What about dragging on touch devices?"),
        answer: t(
          "화면마다 다릅니다. 칸반은 손잡이에서 터치 끌기를 지원하고, 레이어 핸들은 마우스에서만 보이며 터치에는 일괄 버튼이 있고, 떠 있는 창은 250ms 길게 누르기로 시작합니다. 실제 기기별 검증은 확인하지 못했습니다.",
          "It varies by screen. The kanban supports touch dragging from its handle, the layer handle appears only for a mouse with bulk buttons for touch, and floating windows start with a 250 ms hold. Verification on real devices was not found.",
        ),
      },
      {
        question: t("왜 접근성 라이브러리를 쓰지 않았나요?", "Why not use an accessibility library?"),
        answer: t(
          "라이브러리와 비교해 결정한 기록은 찾지 못했습니다. 코드는 화면마다 알맞은 키 규칙을 직접 구현하고, 키 해석을 순수 함수로 분리해 DOM 없이 테스트합니다.",
          "I found no record of a comparison with libraries. The code implements fitting key rules per screen and separates key interpretation into pure functions tested without a DOM.",
        ),
      },
    ],
    pitfall: t(
      "'모든 끌기에 대체 경로가 있다'고 말하지 마세요. 타임라인 키프레임 이동은 끌기뿐입니다. 캔버스 도형 이동·변형과 3D 기즈모의 키보드 동작은 일부만 확인했고(미확인), 실제 스크린리더 검증도 확인하지 못했습니다. 또한 Phaser 월드의 가구 배치는 '끌어 놓기'가 아니라 고스트를 조준해 클릭·키로 확정하는 방식이고, 진짜 포인터 드래그는 SVG 지도 편집기에 있습니다.",
      "Do not say every drag has an alternative: moving timeline keyframes is drag-only. Keyboard behaviour for canvas shape moves and transforms and for the 3D gizmo was only partly checked (unconfirmed), and verification with real screen readers was not found. Also, furniture placement in the Phaser world is not drag and drop but aiming a ghost and confirming by click or key; the real pointer drag lives in the SVG map editor.",
    ),
  },
  technologies: ["WAI-ARIA", "Pointer Events", "React"],
  facts: [
    {
      value: "350 ms / 8 px / 24 px",
      label: t("스플리터 터치 더블탭 한도(간격 / 이동 / 두 탭 사이 거리)", "Splitter double-tap limits (delay / travel / distance between taps)"),
      source: "apps/web/src/shared/hooks/use-resizable.ts",
    },
    {
      value: "16 px / 1 px",
      label: t("가구 배치 지도의 화살표 이동량 / Shift 를 더한 이동량", "Furniture map arrow step / with Shift"),
      source: `${CREATOR}/virtual-space/StudioVirtualSpaceDecorationEditor.tsx`,
    },
    {
      value: "4° / 1°",
      label: t("VRM 관절 키보드 회전량 / Shift 를 더한 회전량", "VRM joint keyboard rotation / with Shift"),
      source: `${CREATOR}/vrm/StudioVrmJointHandles.tsx`,
    },
  ],
  reviewedAt: INTERACTION_REVIEWED_AT,
};

export const ENGINEERING_ATLAS_INTERACTION_CHOICE: readonly EngineeringAtlasEntry[] = [
  DND_IMPLEMENTATION_CHOICE,
  KEYBOARD_ALTERNATIVES_FOR_DRAG,
];
