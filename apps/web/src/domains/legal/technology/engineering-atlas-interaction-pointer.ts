import { INTERACTION_REVIEWED_AT, t } from "./engineering-atlas-interaction-kit";

import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/** interaction · Pointer Events 로 직접 만든 끌기 카드: 제작 허브 칸반 보드, 떠 있는 패널(이동·크기·도킹). */

const CREATOR = "apps/web/src/domains/creator";
const HUB = `${CREATOR}/production-hub`;

const POINTER_DRAG_KANBAN: EngineeringAtlasEntry = {
  id: "pointer-drag-kanban",
  category: "interaction",
  name: "Pointer Events (drag)",
  title: t("칸반 카드를 라이브러리 없이 포인터로 끌어 옮기기", "Dragging kanban cards with Pointer Events, no library"),
  status: "live",
  tagline: t(
    "마우스·펜·터치를 한 모델로 받아 5px 넘게 끌면 시작하고, 취소와 Esc 는 저장 없이 정리합니다.",
    "Takes mouse, pen and touch in one model: a drag starts after 5 px, and cancel or Esc cleans up without saving.",
  ),
  background: [
    t(
      "화면에서 카드를 손으로 끌어 다른 열로 옮기는 칸반 보드는, 마우스·펜·터치를 한 가지 방식으로 받는 Pointer Events 로 만들었습니다. 진열대에서 진짜 상품은 두고 모형만 들고 다니다가 내려놓을 때 자리를 바꾸는 것처럼, 끌기 중에는 카드 복제본(고스트)만 포인터를 따라다니고 실제 이동은 손을 떼는 순간 한 번 일어납니다.",
      "A kanban board where you drag a card to another column is built on Pointer Events, which take mouse, pen and touch in one model. Like carrying a mock-up around a store shelf and swapping the real item only when you set it down, a copy of the card (a ghost) follows the pointer during the drag, and the real move happens once, when you release.",
    ),
    t(
      "마우스·펜은 카드 어디서나(버튼·입력·링크 제외) 5px 넘게 움직이면 끌기가 시작되고, 그 안에서 손을 떼면 그냥 클릭입니다. 터치는 카드 본문의 세로 스크롤을 지키려고 손잡이(touch-action: none)에서만 시작합니다. 끌기 중에는 포인터 아래의 열과 카드 위·아래 절반으로 놓일 자리를 정하고, 화면 가장자리에서는 requestAnimationFrame 루프로 자동 스크롤합니다. pointerup 이면 커밋하고 pointercancel·Esc·창 blur·탭 숨김·필터 변경이면 취소하며, 끝난 직후의 click 은 한 번 막습니다.",
      "With mouse or pen, moving more than 5 px from almost anywhere on a card (excluding buttons, inputs and links) starts a drag, and releasing inside 5 px is just a click. On touch, a drag starts only from the handle (touch-action: none) so the card body keeps its vertical scroll. During a drag, the column under the pointer and the upper or lower half of a card decide the drop spot, and near the screen edge a requestAnimationFrame loop auto-scrolls. pointerup commits; pointercancel, Esc, window blur, a hidden tab or a filter change cancels, and the click right after a drag is suppressed once.",
    ),
    t(
      "HTML5 끌어 놓기 대신 이 방식을 쓴 이유를 직접 비교한 문서는 찾지 못했고, 코드 주석은 '새 라이브러리 없이 Pointer Events 로 구현'이라고만 밝힙니다. 코드로 확인되는 점은 터치 스크롤 보존, 고스트, 자동 스크롤, 여러 카드 동시 이동(×N 배지), 키보드 집기 모드를 한 상태기계에 넣었다는 것입니다. 같은 제작 허브의 공정 디자이너처럼 단순한 1차원 목록은 HTML5 끌어 놓기를 씁니다.",
      "I found no document comparing this with HTML5 drag and drop; a code comment says only 'built with Pointer Events, no new library'. What the code does show is that touch scroll preservation, a ghost, auto-scroll, moving several cards at once (an ×N badge) and a keyboard pick-up mode all live in one state machine. A simple one-dimensional list in the same area, the process designer, uses HTML5 drag and drop.",
    ),
    t(
      "직접 구현이라 접근성과 입력 편차를 스스로 책임집니다. 손잡이에서 Space 로 집고 방향키로 열·위치를 고른 뒤 Enter 로 놓는 키보드 모드, 카드의 Alt+방향키, 상태 선택 메뉴, role=status 안내를 함께 두었습니다. 테스트는 jsdom 에 레이아웃이 없어 getBoundingClientRect 와 elementFromPoint 를 흉내 내므로, 실제 터치 기기에서의 검증은 확인하지 못했습니다(미확인).",
      "Building it directly means owning accessibility and input differences, so the board also provides a keyboard mode (Space to pick up, arrow keys to choose column and position, Enter to drop), Alt+arrow keys on a card, a status menu and role=status announcements. Because jsdom has no layout, the tests fake getBoundingClientRect and elementFromPoint, so verification on real touch devices was not found (unconfirmed).",
    ),
  ],
  keyPoints: [
    t("Pointer Events 직접 구현: 마우스·펜·터치를 한 모델로", "Hand-built on Pointer Events: mouse, pen and touch in one model"),
    t("5px 넘어야 끌기 시작, 취소·Esc 는 저장 없이 정리", "A drag starts after 5 px; cancel and Esc clean up without saving"),
    t("터치는 손잡이에서만, 키보드는 Space→방향키→Enter", "Touch starts from the handle; keyboard is Space, arrows, Enter"),
  ],
  diagram: {
    id: "pointer-drag-kanban-diagram",
    kind: "graph",
    title: t("칸반 끌기의 생애", "Life of a kanban drag"),
    caption: t(
      "5px 문턱으로 클릭과 끌기를 가르고, 끝은 커밋 한 번이거나 저장 없는 취소입니다.",
      "A 5 px threshold separates click from drag, and the end is either one commit or a cancel that saves nothing.",
    ),
    alt: t(
      "카드나 손잡이를 누르면 5px 문턱을 넘었는지 확인합니다. 넘지 못하고 손을 떼면 그냥 클릭입니다. 넘으면 고스트가 만들어지고 포인터 아래의 열과 카드 절반으로 놓일 곳을 계산하며, 가장자리에서는 자동 스크롤을 합니다. 손을 떼면 onDrop 을 한 번 부르고, 취소나 Esc, 창 전환이면 저장 없이 원위치로 정리합니다.",
      "Pressing a card or its handle checks whether the 5 px threshold was crossed. If not and the pointer is released, it is just a click. Once crossed, a ghost is created and the drop spot is computed from the column under the pointer and the card halves, with auto-scroll near the edges. Releasing calls onDrop once, while a cancel, Esc or a window switch cleans up and returns everything without saving.",
    ),
    nodes: [
      { id: "down", label: t("pointerdown", "pointerdown"), sub: t("터치는 손잡이에서만", "Touch: handle only"), tone: "local", shape: "pill", at: [0, 1] },
      { id: "gate", label: t("5px 넘었나?", "Over 5 px?"), sub: t("클릭과 구분", "Click or drag"), tone: "neutral", shape: "diamond", at: [1, 1] },
      { id: "click", label: t("그냥 클릭", "Just a click"), sub: t("카드 열기 등 원래 동작", "The normal action"), tone: "neutral", at: [1, 2] },
      { id: "ghost", label: t("고스트 생성", "Create the ghost"), sub: t("복제본이 포인터를 따름", "A copy follows the pointer"), tone: "local", at: [2, 1] },
      { id: "aim", label: t("놓일 곳 계산", "Find the drop spot"), sub: t("열 + 카드 위·아래 절반", "Column and card half"), tone: "local", at: [3, 1] },
      { id: "scroll", label: t("자동 스크롤", "Auto-scroll"), sub: t("가장자리 56·80px · rAF", "Edge 56 and 80 px; rAF"), tone: "local", at: [3, 0] },
      { id: "end", label: t("끝나는 방식", "How it ends"), sub: t("up / 취소", "up or cancel"), tone: "neutral", shape: "diamond", at: [4, 1] },
      { id: "commit", label: t("onDrop 한 번", "One onDrop call"), sub: t("이동·정렬은 보드가 저장", "The board saves the move"), tone: "good", at: [5, 1] },
      { id: "cancel", label: t("저장 없이 정리", "Clean up, no save"), sub: t("Esc·cancel·blur 등", "Esc, cancel, blur, etc."), tone: "warn", at: [4, 2] },
    ],
    edges: [
      { from: "down", to: "gate", label: t("이동", "move") },
      { from: "gate", to: "ghost", label: t("예", "yes") },
      { from: "gate", to: "click", label: t("아니오·up", "no, up") },
      { from: "ghost", to: "aim" },
      { from: "aim", to: "scroll", style: "dashed", label: t("가장자리", "near edge") },
      { from: "aim", to: "end" },
      { from: "end", to: "commit", label: t("pointerup", "pointerup") },
      { from: "end", to: "cancel", label: t("취소", "cancel") },
    ],
    groups: [{ id: "dragging", label: t("끄는 중", "While dragging"), nodeIds: ["ghost", "aim", "scroll"], tone: "local" }],
  },
  usage: [
    {
      feature: t("제작 허브 작업 보드 · 카드 끌어 옮기기", "Production hub board · dragging cards"),
      role: t(
        "카드를 다른 열(상태)이나 다른 위치로 끌어 옮깁니다. 선택한 카드 여러 장은 함께 이동하고 고스트에 ×N 배지가 붙으며, 동시 진행 한도(WIP)가 찬 공정이면 놓기 전에 한도를 알립니다.",
        "Cards are dragged to another column (status) or position. Several selected cards move together with an ×N badge on the ghost, and if a process has hit its work-in-progress limit the board says so before you drop.",
      ),
      paths: [
        `${HUB}/board/use-board-dnd.ts`,
        `${HUB}/ProductionWorkBoard.tsx#handleDrop`,
        `${HUB}/ProductionBoardTaskCard.tsx`,
        `${HUB}/board/board-wip.ts`,
      ],
      route: "/production/projects",
    },
    {
      feature: t("낙관적 이동과 되돌리기", "Optimistic moves and undo"),
      role: t(
        "상태가 바뀌는 이동은 화면에 먼저 반영하고 서버가 거절하면 원래 열로 되돌리며 이유를 경고로 남깁니다. 순서만 바꾼 이동은 '되돌리기' 토스트를 제공합니다.",
        "A move that changes status is applied on screen first, and if the server rejects it the card returns to its column with the reason shown as a warning. A reorder-only move offers an Undo toast.",
      ),
      paths: [
        `${HUB}/board/board-actions.ts`,
        `${HUB}/board/board-optimistic.ts`,
        `${HUB}/ProductionWorkBoard.interactions.test.tsx`,
      ],
    },
    {
      feature: t("끌지 않는 경로 · 키보드와 상태 메뉴", "Paths without dragging · keyboard and status menu"),
      role: t(
        "손잡이에서 Space 로 집고 ←→ 로 열, ↑↓ 로 위치를 고른 뒤 Enter 로 놓습니다(Esc 취소). 카드에서는 Alt+방향키로 바로 옮기고, 상태 선택 메뉴도 있으며, 결과는 role=status 로 알립니다.",
        "On the handle, Space picks up, Left and Right choose the column, Up and Down choose the position, and Enter drops (Esc cancels). On a card, Alt+arrow keys move it directly, there is also a status menu, and results are announced through role=status.",
      ),
      paths: [
        `${HUB}/board/use-board-dnd.ts#useBoardDnd`,
        `${HUB}/ProductionWorkBoard.tsx#moveCard`,
        `${HUB}/ProductionBoardTaskCard.tsx`,
      ],
    },
    {
      feature: t("터치와 스크롤의 공존", "Touch and scrolling together"),
      role: t(
        "손잡이에만 touch-action: none 을 걸어 카드 본문의 스크롤은 그대로 두고, 끌기 중에는 body 에 data-board-dragging 을 걸어 커서·텍스트 선택·스냅 스크롤을 잠급니다. 손잡이는 44px 이상으로 만듭니다.",
        "touch-action: none is applied to the handle only, so the card body keeps scrolling, and during a drag body gets data-board-dragging to lock the cursor, text selection and snap scrolling. The handle is at least 44 px.",
      ),
      paths: [`${HUB}/production-workboard.css`, `${HUB}/ProductionBoardTaskCard.tsx`],
    },
  ],
  samples: [
    {
      kind: "teaching",
      title: t("5px 임계값과 취소(Esc·cancel)를 가진 최소 끌기", "A minimal drag with a 5 px threshold and cancel (Esc, pointercancel)"),
      language: "ts",
      code: `export function startDrag(down: PointerEvent, onDrop: (x: number, y: number) => void): void {
  const ac = new AbortController(); // 정리 한 번으로 모든 리스너를 해제한다
  const opts = { signal: ac.signal };
  let started = false;
  window.addEventListener("pointermove", (e) => {
    started ||= Math.hypot(e.clientX - down.clientX, e.clientY - down.clientY) >= 5; // 5px 임계값
  }, opts);
  const end = (commit: boolean, at: { clientX: number; clientY: number }) => {
    ac.abort();
    if (started && commit) onDrop(at.clientX, at.clientY); // 임계값을 넘은 끌기만 확정
  };
  window.addEventListener("pointerup", (e) => end(true, e), opts);
  window.addEventListener("pointercancel", (e) => end(false, e), opts); // 취소는 커밋하지 않는다
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") end(false, down); }, opts);
}
// el.addEventListener("pointerdown", (e) => { if (e.isPrimary) startDrag(e, onDrop); });`,
      codeEn: `export function startDrag(down: PointerEvent, onDrop: (x: number, y: number) => void): void {
  const ac = new AbortController(); // one abort removes every listener
  const opts = { signal: ac.signal };
  let started = false;
  window.addEventListener("pointermove", (e) => {
    started ||= Math.hypot(e.clientX - down.clientX, e.clientY - down.clientY) >= 5; // 5 px threshold
  }, opts);
  const end = (commit: boolean, at: { clientX: number; clientY: number }) => {
    ac.abort();
    if (started && commit) onDrop(at.clientX, at.clientY); // only a drag past the threshold is confirmed
  };
  window.addEventListener("pointerup", (e) => end(true, e), opts);
  window.addEventListener("pointercancel", (e) => end(false, e), opts); // cancel never commits
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") end(false, down); }, opts);
}
// el.addEventListener("pointerdown", (e) => { if (e.isPrimary) startDrag(e, onDrop); });`,
      explain: t(
        "pointerdown 이후 window 에 move/up/cancel/Esc 를 걸고, 5px 를 넘은 뒤 pointerup 이면 한 번 커밋합니다. 취소 경로는 어떤 것도 저장하지 않고 리스너만 정리합니다.",
        "After pointerdown it listens for move, up, cancel and Esc on window, and a pointerup after passing 5 px commits once. Every cancel path saves nothing and just removes the listeners.",
      ),
      verify: "types",
    },
    {
      kind: "simplified",
      title: t("놓일 앞 카드 정하기와 가장자리 자동 스크롤 속도", "Finding the card to insert before, and edge auto-scroll speed"),
      language: "ts",
      code: `interface Card { id: string; top: number; height: number }

/** 포인터 y 가 어느 카드 앞인지 정한다(위쪽 절반이면 그 카드 앞, 없으면 열 맨 아래). */
export function beforeIdAt(cards: readonly Card[], moving: ReadonlySet<string>, y: number): string | null {
  for (const card of cards) {
    if (moving.has(card.id)) continue; // 끌고 있는 카드는 건너뛴다
    if (y < card.top + card.height / 2) return card.id;
  }
  return null;
}

/** 가장자리에 가까울수록 빠르게(최대 maxStep px/프레임) 스크롤한다. */
export function edgeStep(position: number, min: number, max: number, zone: number, maxStep = 22): number {
  if (position < min + zone) return -Math.min(maxStep, Math.ceil((maxStep * (min + zone - position)) / zone));
  if (position > max - zone) return Math.min(maxStep, Math.ceil((maxStep * (position - (max - zone))) / zone));
  return 0;
}`,
      codeEn: `interface Card { id: string; top: number; height: number }

/** Finds the card to insert before (the upper half means before that card; none means the column bottom). */
export function beforeIdAt(cards: readonly Card[], moving: ReadonlySet<string>, y: number): string | null {
  for (const card of cards) {
    if (moving.has(card.id)) continue; // skip the cards being dragged
    if (y < card.top + card.height / 2) return card.id;
  }
  return null;
}

/** Scrolls faster the closer the pointer is to an edge (up to maxStep px per frame). */
export function edgeStep(position: number, min: number, max: number, zone: number, maxStep = 22): number {
  if (position < min + zone) return -Math.min(maxStep, Math.ceil((maxStep * (min + zone - position)) / zone));
  if (position > max - zone) return Math.min(maxStep, Math.ceil((maxStep * (position - (max - zone))) / zone));
  return 0;
}`,
      explain: t(
        "use-board-dnd.ts 의 computeTarget 과 edgeStep 의 핵심입니다. 실제 코드는 elementFromPoint 로 열을 찾은 뒤 이 계산을 하고, 가로 56px·세로 80px 안쪽에서 최대 22px/프레임으로 스크롤합니다.",
        "The core of computeTarget and edgeStep in use-board-dnd.ts. The real code finds the column with elementFromPoint and then does this calculation, scrolling at up to 22 px per frame inside 56 px horizontally and 80 px vertically.",
      ),
      source: `${HUB}/board/use-board-dnd.ts`,
      verify: "types",
    },
  ],
  links: [
    {
      title: "MDN · Pointer events",
      url: "https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events",
      kind: "docs",
      note: t("마우스·터치·펜을 하나로 다루는 이벤트 모델", "One event model for mouse, touch and pen"),
    },
    {
      title: "MDN · touch-action",
      url: "https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/touch-action",
      kind: "docs",
      note: t("스크롤·확대 제스처를 요소마다 끄는 CSS", "CSS that turns off scroll and zoom gestures per element"),
    },
    {
      title: "MDN · Document.elementFromPoint()",
      url: "https://developer.mozilla.org/en-US/docs/Web/API/Document/elementFromPoint",
      kind: "docs",
    },
    {
      title: "W3C · Pointer Events Level 3",
      url: "https://www.w3.org/TR/pointerevents3/",
      kind: "spec",
    },
    {
      title: "Atlassian · Kanban WIP limits",
      url: "https://www.atlassian.com/agile/kanban/wip-limits",
      kind: "article",
      note: t("동시 진행 한도의 일반 개념(설계 문서가 인용)", "The general idea of WIP limits (cited by the design note)"),
    },
  ],
  chapterIds: ["brush-engine", "quality"],
  talk: {
    pitch: t(
      "제작 허브의 칸반 보드는 카드를 끌어 다른 열로 옮기는데, 외부 끌어 놓기 라이브러리 없이 브라우저의 Pointer Events 로 직접 만들었습니다. 5픽셀 넘게 움직여야 끌기가 시작되어 클릭과 구분되고, 끌기 중에는 복제본만 따라다니다가 손을 뗄 때 한 번만 이동합니다. Esc 나 창 전환으로 취소하면 아무것도 저장하지 않고, 키보드로도 같은 이동을 할 수 있습니다.",
      "The production hub's kanban board lets you drag cards between columns, and it is built directly on the browser's Pointer Events without a drag-and-drop library. A drag starts only after 5 pixels of movement, which separates it from a click, and during the drag only a copy follows the pointer; the real move happens once on release. Cancelling with Esc or a window switch saves nothing, and the same move can be done from the keyboard.",
    ),
    analogy: t(
      "진열대의 상품 대신 모형을 들고 다니다가, 놓을 자리를 정한 뒤에야 진짜 상품을 옮기는 것과 같습니다.",
      "Like carrying a mock-up instead of the real item and moving the real one only after you have chosen the spot.",
    ),
    questions: [
      {
        question: t("왜 HTML5 끌어 놓기가 아니라 Pointer Events 인가요?", "Why Pointer Events rather than HTML5 drag and drop?"),
        answer: t(
          "코드 주석은 '새 라이브러리 없이 Pointer Events 로 구현'이라고만 밝혀 비교 문서는 없습니다. 코드로 확인되는 것은 터치 스크롤 보존, 다중 카드 이동, 자동 스크롤, 키보드 집기를 한 상태기계로 다룬다는 점입니다. 같은 허브의 단순 목록(공정 디자이너)은 HTML5 방식을 씁니다.",
          "A code comment says only 'built with Pointer Events, no new library', and there is no comparison document. What the code shows is one state machine covering touch scroll preservation, multi-card moves, auto-scroll and keyboard pick-up. A simple list in the same hub (the process designer) uses the HTML5 approach.",
        ),
      },
      {
        question: t("동시 진행 한도(WIP)는 어떻게 지키나요?", "How are work-in-progress limits enforced?"),
        answer: t(
          "놓을 열이 정해지면 서버 규칙과 같은 기준으로 '작업 중 수/한도'를 놓기 전에 미리 보여 줍니다. 한도에 찬 공정으로 놓아도 저장하지 않는 테스트가 있고, 최종 규칙은 서버에서도 확인합니다.",
          "Once the target column is known, the board shows 'in progress / limit' before the drop, using the same basis as the server rule. A test confirms that dropping into a full process saves nothing, and the final rule is also checked on the server.",
        ),
      },
      {
        question: t("저장이 실패하면 카드는 어떻게 되나요?", "What happens to the card if saving fails?"),
        answer: t(
          "상태가 바뀌는 이동은 화면에 먼저 반영하고, 서버가 거절하면 원래 열로 돌아오며 이유를 경고로 남깁니다. 순서만 바꾼 이동은 '되돌리기' 토스트를 제공합니다.",
          "A status change is shown first, and if the server rejects it the card returns to its column and the reason is shown as a warning. A reorder-only move offers an Undo toast.",
        ),
      },
    ],
    pitfall: t(
      "'라이브러리보다 낫다'고 말하지 마세요. 직접 구현은 접근성·터치·IME 처리를 스스로 책임지는 비용이 있고, 라이브러리와 비교한 기록은 찾지 못했습니다(미확인). 실제 터치 기기에서의 검증도 확인하지 못했습니다(미확인).",
      "Do not claim it beats a library. A hand-built drag takes on accessibility, touch and IME handling itself, and I found no record of comparing it with a library (unconfirmed). Verification on real touch devices was also not found (unconfirmed).",
    ),
  },
  technologies: ["Pointer Events", "requestAnimationFrame", "React"],
  facts: [
    {
      value: "5 px",
      label: t("끌기가 시작되는 이동 거리(클릭과 구분)", "Movement that starts a drag (separates it from a click)"),
      source: `${HUB}/board/use-board-dnd.ts`,
    },
    {
      value: "56 px / 80 px",
      label: t("가로·세로 자동 스크롤이 켜지는 가장자리 폭", "Edge widths that trigger horizontal and vertical auto-scroll"),
      source: `${HUB}/board/use-board-dnd.ts`,
    },
    {
      value: "22 px/프레임",
      label: t("자동 스크롤의 최대 속도", "Maximum auto-scroll speed per frame"),
      source: `${HUB}/board/use-board-dnd.ts`,
    },
    {
      value: "44 px",
      label: t("끌기 손잡이의 최소 크기(min-h-11 min-w-11)", "Minimum size of the drag handle (min-h-11 min-w-11)"),
      source: `${HUB}/ProductionBoardTaskCard.tsx`,
    },
  ],
  reviewedAt: INTERACTION_REVIEWED_AT,
};

const FLOATING_PANEL_POINTER_DRAG: EngineeringAtlasEntry = {
  id: "floating-panel-pointer-drag",
  category: "interaction",
  name: "Pointer capture",
  title: t("패널을 창처럼 끌어 옮기고 크기 바꾸기", "Moving and resizing panels like windows"),
  status: "live",
  tagline: t(
    "끄는 동안은 화면 요소만 움직이고, 손을 떼는 순간 위치를 한 번 저장하며 취소하면 제자리로 돌아옵니다.",
    "While dragging only the on-screen element moves; the position is saved once on release, and a cancel returns it to where it was.",
  ),
  background: [
    t(
      "책상 위의 메모지나 서랍을 손으로 끌어 옮기듯, 스튜디오의 팔레트·메뉴·페이지 목록 같은 패널을 창처럼 끌어 옮기고 크기를 바꿀 수 있습니다. 손이 움직일 때마다 화면 전체를 다시 계산하면 손이 느려지므로, 끄는 동안에는 패널의 위치(transform)만 바꾸고 손을 놓는 순간에만 위치를 저장합니다.",
      "Like sliding a sticky note or a drawer across a desk, panels such as palettes, menus and the page list can be dragged and resized like windows. Recomputing the whole screen on every hand movement would make the drag sluggish, so only the panel's position (transform) changes while dragging and the position is saved only when you let go.",
    ),
    t(
      "핸들을 누르면 포인터 세션이 시작되고 setPointerCapture 로 포인터가 창 밖으로 나가도 이벤트를 계속 받습니다(실패해도 전역 리스너로 동작). 마우스·펜은 8px 넘게 움직여야 활성화되고, 터치는 250ms 안에 8px 넘게 움직이면 스크롤로 보고 취소하며, 크기 조절은 곧바로 시작합니다. 활성이 되면 body 의 커서·텍스트 선택을 잠그고 requestAnimationFrame 으로 DOM 만 갱신합니다. pointerup 에서 정리를 먼저 하고 커밋 콜백을 한 번 부르며, Esc·pointercancel·창 blur·lostpointercapture 는 시작 사각형으로 되돌립니다.",
      "Pressing the handle starts a pointer session, and setPointerCapture keeps events coming even when the pointer leaves the window (global listeners cover the case where capture fails). Mouse and pen activate after moving 8 px; on touch, moving more than 8 px within 250 ms is read as scrolling and cancels; resizing starts immediately. Once active, the body cursor and text selection are locked and only the DOM is updated through requestAnimationFrame. On pointerup the cleanup runs first and then the commit callback once, while Esc, pointercancel, window blur and lostpointercapture restore the starting rectangle.",
    ),
    t(
      "대안은 react-rnd·interact.js 같은 끌기 라이브러리나 dockview 같은 도킹 레이아웃 라이브러리인데, 이 저장소에는 없습니다. 직접 구현한 대가로 위치 저장, 도킹, z-order, 모바일 전환, 접근성을 모두 스스로 유지합니다. 위치는 픽셀이 아니라 뷰포트에서 움직일 수 있는 거리에 대한 비율(xRatio·yRatio)로 저장해, 모니터나 창 크기가 바뀌어도 화면 밖으로 복원되지 않게 한 것이 핵심 설계입니다.",
      "The alternatives are drag libraries such as react-rnd or interact.js and docking-layout libraries such as dockview, none of which are in this repository. The cost of building it directly is maintaining position storage, docking, z-order, mobile switching and accessibility yourself. The key design is storing the position not in pixels but as a ratio of the distance the panel can travel in the viewport (xRatio, yRatio), so it never restores off-screen after a monitor or window size change.",
    ),
    t(
      "한계: 떠 있는 창은 데스크톱(min-width 1024px)에서만 동작하고 폭이 줄면 도킹형으로 돌아갑니다. 창 배치는 문서 Undo 에 들어가지 않는 '기기 환경설정'이며, 저장에 실패하면 이번 세션에서만 유지(memory-only)됩니다. 쌓을 수 있는 창은 z-index 50~69 범위의 20개로 제한됩니다.",
      "Limits: floating windows work only at desktop widths (min-width 1024 px) and return to docked form when the width shrinks. Window layout is a device preference outside the document's undo history, and if saving fails it lasts only for this session (memory-only). At most 20 windows can stack, in the z-index range 50 to 69.",
    ),
  ],
  keyPoints: [
    t("끄는 동안 DOM transform 만, 놓을 때 한 번만 커밋", "Only the DOM transform while dragging; one commit on release"),
    t("마우스·펜 8px, 터치는 250ms 길게 눌러야 시작", "Mouse and pen start at 8 px; touch needs a 250 ms hold"),
    t("위치는 픽셀이 아니라 이동 가능 범위의 비율로 저장", "Position is stored as a ratio of the travel range, not pixels"),
  ],
  diagram: {
    id: "floating-panel-pointer-drag-diagram",
    kind: "graph",
    title: t("패널 이동 세션", "A panel move session"),
    caption: t(
      "끄는 동안은 DOM 만 바꾸고, 끝에서 한 번 커밋하며, 취소하면 시작 자리로 돌아갑니다.",
      "Only the DOM changes while dragging, one commit happens at the end, and a cancel returns to the start.",
    ),
    alt: t(
      "핸들을 누르면 포인터 캡처를 시도하고 활성 조건을 기다립니다. 마우스·펜은 8px, 터치는 250ms 길게 누름이 조건이고, 터치가 그 전에 8px 넘게 움직이면 스크롤로 보고 취소합니다. 활성이 되면 프레임마다 DOM 위치만 갱신하고, 손을 떼면 비율로 환산해 한 번 커밋하고 기기 환경설정에 저장합니다. Esc·취소·blur 이면 시작 자리로 복원합니다.",
      "Pressing the handle tries pointer capture and waits for an activation condition: 8 px for mouse and pen, or a 250 ms hold for touch, and if touch moves more than 8 px first it is read as scrolling and cancelled. Once active, only the DOM position is updated each frame; on release the position is converted to a ratio, committed once and saved as a device preference. Esc, cancel or blur restores the starting position.",
    ),
    nodes: [
      { id: "down", label: t("핸들 누름", "Press the handle"), sub: t("캡처 시도", "Try pointer capture"), tone: "local", shape: "pill", at: [0, 1] },
      { id: "gate", label: t("활성 조건?", "Activate?"), sub: t("8px·250ms", "8 px, 250 ms"), tone: "neutral", shape: "diamond", at: [1, 1] },
      { id: "scroll", label: t("스크롤로 판단", "Read as scroll"), sub: t("터치 8px 초과 → 취소", "Touch over 8 px: cancel"), tone: "warn", at: [1, 2] },
      { id: "active", label: t("활성화", "Activated"), sub: t("커서·텍스트 선택 잠금", "Cursor and selection locked"), tone: "local", at: [2, 1] },
      { id: "preview", label: t("rAF 미리보기", "rAF preview"), sub: t("DOM transform 만 갱신", "Only DOM transform"), tone: "local", at: [3, 1] },
      { id: "end", label: t("끝나는 방식", "How it ends"), sub: t("up / 취소", "up or cancel"), tone: "neutral", shape: "diamond", at: [4, 1] },
      { id: "commit", label: t("놓을 때 1회 커밋", "One commit on release"), sub: t("비율로 환산 · 도킹 판정", "Ratio and dock check"), tone: "good", at: [5, 1] },
      { id: "save", label: t("기기 환경설정", "Device preference"), sub: t("SQLite/OPFS 에 저장", "Saved to SQLite/OPFS"), tone: "local", shape: "cylinder", at: [5, 0] },
      { id: "restore", label: t("시작 자리로 복원", "Back to the start"), sub: t("Esc·cancel·blur 등", "Esc, cancel, blur, etc."), tone: "warn", at: [4, 2] },
    ],
    edges: [
      { from: "down", to: "gate", label: t("이동", "move") },
      { from: "gate", to: "active", label: t("충족", "met") },
      { from: "gate", to: "scroll", label: t("터치 이동", "touch move") },
      { from: "active", to: "preview" },
      { from: "preview", to: "end" },
      { from: "end", to: "commit", label: t("pointerup", "pointerup") },
      { from: "end", to: "restore", label: t("취소", "cancel") },
      { from: "commit", to: "save", label: t("저장", "save") },
    ],
    groups: [{ id: "session", label: t("세션 중 · React 무변경", "In session: React untouched"), nodeIds: ["active", "preview"], tone: "local" }],
  },
  usage: [
    {
      feature: t("스튜디오 편집기 · 패널을 창처럼 끌어 옮기기", "Studio editor · dragging panels like windows"),
      role: t(
        "팔레트·메뉴·프로젝트 센터·페이지 목록 같은 패널의 이동 핸들을 8px 넘게 끌면 옮겨지고, 터치는 250ms 길게 눌러야 시작합니다. 끄는 동안은 transform 만 갱신하고 놓을 때 한 번 커밋합니다.",
        "Dragging the move handle of a panel such as a palette, menu, Project Center or page list by more than 8 px moves it, and touch needs a 250 ms hold. Only the transform is updated while dragging and it is committed once on release.",
      ),
      paths: [
        `${CREATOR}/studio-floating-surface-pointer.ts#startStudioFloatingSurfacePointerSession`,
        `${CREATOR}/studio-floating-surface-pointer-state.ts`,
        `${CREATOR}/StudioFloatingSurface.tsx`,
      ],
      route: "/studio",
    },
    {
      feature: t("크기 조절과 가장자리 도킹", "Resizing and edge docking"),
      role: t(
        "8방향 핸들로 크기를 바꾸고, 가장자리 12px 안에서 이동 방향이 같을 때 도킹합니다. 위치는 뷰포트에서 움직일 수 있는 거리에 대한 비율로 저장합니다.",
        "Eight handles resize the panel, and it docks when released within 12 px of an edge while moving in that direction. The position is stored as a ratio of the distance the panel can travel in the viewport.",
      ),
      paths: [
        `${CREATOR}/studio-floating-surface.ts#createStudioFloatingSurfaceLayout`,
        `${CREATOR}/StudioFloatingSurface.tsx`,
      ],
    },
    {
      feature: t("배치 저장 · 기기 환경설정", "Layout persistence · device preference"),
      role: t(
        "배치를 SQLite/OPFS 에 기기 환경설정으로 저장하고, 쓴 값을 다시 읽어 확인한 뒤에만 성공으로 보고합니다. 실패하면 memory-only 로 낮추며, 문서 Undo 기록은 바뀌지 않습니다(E2E 가 확인).",
        "The layout is saved as a device preference in SQLite/OPFS and success is reported only after reading the written value back. A failure degrades to memory-only, and the document's undo history is unchanged (checked by an E2E test).",
      ),
      paths: [
        `${CREATOR}/studio-floating-surface-preferences-sqlite.ts`,
        "e2e/studio-workspace-arrangement.spec.ts",
      ],
    },
    {
      feature: t("끌지 않는 경로 · 키보드와 배치 메뉴", "Paths without dragging · keyboard and layout menu"),
      role: t(
        "이동 핸들에서 Alt+방향키로 10px(Shift 는 40px), Alt+Home 으로 기본 배치로 돌아가고, 크기 핸들도 Alt+방향키를 받습니다. 더블클릭과 창 배치 메뉴로도 같은 일을 합니다.",
        "On the move handle, Alt+arrow keys move 10 px (40 px with Shift) and Alt+Home restores the default layout; resize handles also accept Alt+arrow keys. Double-click and the window layout menu do the same jobs.",
      ),
      paths: [`${CREATOR}/StudioFloatingSurface.tsx#handleMoveKeyDown`],
    },
  ],
  samples: [
    {
      kind: "teaching",
      title: t("포인터 캡처 + rAF 미리보기 + 놓을 때 한 번 커밋", "Pointer capture, rAF preview and one commit on release"),
      language: "ts",
      code: `export function startMove(el: HTMLElement, down: PointerEvent, commit: (dx: number, dy: number) => void): void {
  const ac = new AbortController(); // 정리 한 번으로 모든 리스너를 해제한다
  const opts = { signal: ac.signal };
  let dx = 0, dy = 0, frame = 0, active = false;
  el.setPointerCapture(down.pointerId); // 포인터가 창 밖으로 나가도 이벤트를 계속 받는다
  const paint = () => { frame = 0; el.style.transform = \`translate3d(\${dx}px, \${dy}px, 0)\`; }; // DOM 만 바꾼다
  const finish = (ok: boolean) => {
    if (ac.signal.aborted) return;
    ac.abort();
    if (frame) cancelAnimationFrame(frame);
    if (ok && active) commit(dx, dy); // 놓을 때 한 번만 확정
    else el.style.transform = ""; // 취소: 시작 자리로 되돌린다
  };
  window.addEventListener("pointermove", (e) => {
    dx = e.clientX - down.clientX;
    dy = e.clientY - down.clientY;
    if (!active && Math.hypot(dx, dy) < 8) return; // 8px 넘어야 시작
    active = true;
    if (!frame) frame = requestAnimationFrame(paint); // 프레임당 한 번만 그린다
  }, opts);
  window.addEventListener("pointerup", () => finish(true), opts);
  window.addEventListener("pointercancel", () => finish(false), opts);
  el.addEventListener("lostpointercapture", () => finish(false), opts);
}`,
      codeEn: `export function startMove(el: HTMLElement, down: PointerEvent, commit: (dx: number, dy: number) => void): void {
  const ac = new AbortController(); // one abort removes every listener
  const opts = { signal: ac.signal };
  let dx = 0, dy = 0, frame = 0, active = false;
  el.setPointerCapture(down.pointerId); // keep receiving events even outside the window
  const paint = () => { frame = 0; el.style.transform = \`translate3d(\${dx}px, \${dy}px, 0)\`; }; // change the DOM only
  const finish = (ok: boolean) => {
    if (ac.signal.aborted) return;
    ac.abort();
    if (frame) cancelAnimationFrame(frame);
    if (ok && active) commit(dx, dy); // confirm exactly once on release
    else el.style.transform = ""; // cancel: go back to the start
  };
  window.addEventListener("pointermove", (e) => {
    dx = e.clientX - down.clientX;
    dy = e.clientY - down.clientY;
    if (!active && Math.hypot(dx, dy) < 8) return; // start only after 8 px
    active = true;
    if (!frame) frame = requestAnimationFrame(paint); // paint at most once per frame
  }, opts);
  window.addEventListener("pointerup", () => finish(true), opts);
  window.addEventListener("pointercancel", () => finish(false), opts);
  el.addEventListener("lostpointercapture", () => finish(false), opts);
}`,
      explain: t(
        "끄는 동안은 transform 만 프레임당 한 번 바꾸고, 문서·저장은 건드리지 않습니다. 정상 종료(pointerup)만 commit 을 부르고 cancel·캡처 상실은 제자리로 돌립니다.",
        "While dragging, only the transform changes once per frame and no document or storage is touched. Only a normal end (pointerup) calls commit, while cancel and lost capture put the element back.",
      ),
      verify: "types",
    },
    {
      kind: "simplified",
      title: t("위치를 비율로 저장하고 복원하기", "Storing and restoring a position as a ratio"),
      language: "ts",
      code: `export interface Rect { x: number; y: number; width: number; height: number }
interface Size { width: number; height: number }

/** 뷰포트에서 움직일 수 있는 거리에 대한 비율(0..1)로 바꾼다. 화면 크기가 변해도 밖으로 나가지 않는다. */
export function toRatio(rect: Rect, vp: Size): { xRatio: number; yRatio: number } {
  const travelX = Math.max(0, vp.width - rect.width);
  const travelY = Math.max(0, vp.height - rect.height);
  return {
    xRatio: travelX > 0 ? rect.x / travelX : 0, // 움직일 거리가 없으면 0
    yRatio: travelY > 0 ? rect.y / travelY : 0,
  };
}

/** 비율을 현재 뷰포트의 좌표로 되돌린다. */
export function fromRatio(r: { xRatio: number; yRatio: number }, size: Size, vp: Size): Rect {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return {
    ...size,
    x: Math.round(clamp(r.xRatio) * Math.max(0, vp.width - size.width)),
    y: Math.round(clamp(r.yRatio) * Math.max(0, vp.height - size.height)),
  };
}`,
      codeEn: `export interface Rect { x: number; y: number; width: number; height: number }
interface Size { width: number; height: number }

/** Converts to a ratio (0..1) of the distance the panel can travel, so it never ends up off-screen after a resize. */
export function toRatio(rect: Rect, vp: Size): { xRatio: number; yRatio: number } {
  const travelX = Math.max(0, vp.width - rect.width);
  const travelY = Math.max(0, vp.height - rect.height);
  return {
    xRatio: travelX > 0 ? rect.x / travelX : 0, // no travel distance means 0
    yRatio: travelY > 0 ? rect.y / travelY : 0,
  };
}

/** Converts the ratio back into coordinates for the current viewport. */
export function fromRatio(r: { xRatio: number; yRatio: number }, size: Size, vp: Size): Rect {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return {
    ...size,
    x: Math.round(clamp(r.xRatio) * Math.max(0, vp.width - size.width)),
    y: Math.round(clamp(r.yRatio) * Math.max(0, vp.height - size.height)),
  };
}`,
      explain: t(
        "실제 createStudioFloatingSurfaceLayout 과 계산 방식이 같은 핵심입니다(뷰포트 인셋과 도킹 처리는 생략). 픽셀이 아니라 비율을 저장하므로 큰 모니터에서 저장한 위치도 작은 화면에서 안쪽으로 복원됩니다.",
        "This is the core of the same calculation as the real createStudioFloatingSurfaceLayout (viewport insets and docking are omitted). Because a ratio is stored instead of pixels, a position saved on a large monitor is restored inside a smaller screen.",
      ),
      source: `${CREATOR}/studio-floating-surface.ts`,
      verify: "types",
    },
  ],
  links: [
    {
      title: "MDN · Element.setPointerCapture()",
      url: "https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture",
      kind: "docs",
      note: t("포인터가 밖으로 나가도 이벤트를 계속 받기", "Keep receiving events even when the pointer leaves"),
    },
    {
      title: "MDN · lostpointercapture event",
      url: "https://developer.mozilla.org/en-US/docs/Web/API/Element/lostpointercapture_event",
      kind: "docs",
    },
    {
      title: "MDN · Window.requestAnimationFrame()",
      url: "https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame",
      kind: "docs",
    },
    {
      title: "W3C · Pointer Events Level 3",
      url: "https://www.w3.org/TR/pointerevents3/",
      kind: "spec",
    },
  ],
  chapterIds: ["performance", "brush-engine"],
  talk: {
    pitch: t(
      "스튜디오의 패널은 창처럼 끌어 옮기고 크기를 바꿀 수 있습니다. 끄는 동안에는 화면 요소의 위치만 바꾸고 손을 놓는 순간에만 위치를 저장해서 손이 느려지지 않습니다. Esc 나 창 전환으로 취소하면 시작 자리로 돌아오고, 위치는 픽셀이 아니라 비율로 저장해 화면 크기가 달라져도 밖으로 나가지 않습니다. 키보드로는 Alt+방향키로 같은 이동을 합니다.",
      "Studio panels can be dragged and resized like windows. While dragging, only the on-screen element moves and the position is saved only when you let go, so the drag stays smooth. Cancelling with Esc or a window switch returns it to the start, and the position is stored as a ratio rather than pixels so it stays on screen when the display size changes. On the keyboard, Alt plus the arrow keys do the same move.",
    ),
    analogy: t(
      "책상 위의 메모지를 손으로 밀어 옮기다가, 마음에 드는 자리에서 손을 떼는 순간 그 자리를 기억해 두는 것과 같습니다.",
      "Like sliding a note across a desk and remembering the spot only when you lift your hand.",
    ),
    questions: [
      {
        question: t("왜 react-rnd 같은 라이브러리를 쓰지 않았나요?", "Why not use a library such as react-rnd?"),
        answer: t(
          "이 저장소에는 끌기·도킹 라이브러리가 없고 직접 구현입니다. 라이브러리와 비교해 선택한 기록은 찾지 못했습니다. 직접 구현의 대가는 위치 저장·도킹·z-order·모바일 전환·접근성을 스스로 유지하는 것입니다.",
          "The repository has no drag or docking library; this is a direct implementation, and I found no record of a comparison. The cost is maintaining position storage, docking, z-order, mobile switching and accessibility ourselves.",
        ),
      },
      {
        question: t("창 배치도 되돌리기(Undo)가 되나요?", "Does undo cover window layout too?"),
        answer: t(
          "아니요. 창 배치는 문서가 아니라 기기 환경설정이라 문서 Undo 기록에 들어가지 않습니다. E2E 테스트가 배치를 바꿔도 문서 히스토리 개수가 변하지 않음을 확인합니다.",
          "No. Window layout is a device preference, not document content, so it is outside the undo history. An E2E test checks that the document history count does not change after rearranging.",
        ),
      },
      {
        question: t("모바일에서도 창을 끌 수 있나요?", "Can I drag windows on mobile?"),
        answer: t(
          "떠 있는 창은 데스크톱 폭(1024px 이상)에서만 동작하고, 390px 로 줄이면 워크스페이스 영역이 도킹형으로 돌아가는 것을 E2E 가 확인합니다. 터치 입력 자체는 250ms 길게 누르기로 스크롤과 구분하도록 구현되어 있습니다.",
          "Floating windows work only at desktop widths (1024 px and up), and an E2E test confirms that a workspace region returns to docked form at 390 px. The touch input itself is implemented to separate a drag from scrolling with a 250 ms hold.",
        ),
      },
    ],
    pitfall: t(
      "'모바일에서도 창을 끌 수 있다'고 말하지 마세요. 이동·도킹은 데스크톱 한정입니다. 설정 저장이 실패하면 이번 세션에서만 유지되는 점과, 실제 기기별 터치 동작은 확인하지 못했다는 점(미확인)도 함께 말합니다.",
      "Do not say windows can be dragged on mobile; moving and docking are desktop-only. Also mention that a failed save lasts only for the session, and that real touch behaviour per device was not verified (unconfirmed).",
    ),
  },
  technologies: ["Pointer Events", "requestAnimationFrame", "SQLite WASM", "OPFS"],
  facts: [
    {
      value: "8 px",
      label: t("마우스·펜이 이동을 시작하는 거리", "Distance at which mouse and pen start moving"),
      source: `${CREATOR}/studio-floating-surface-pointer-state.ts`,
    },
    {
      value: "250 ms / 8 px",
      label: t("터치 길게 누름 시간 / 그 사이 허용 이동", "Touch hold time / movement allowed during it"),
      source: `${CREATOR}/studio-floating-surface-pointer-state.ts`,
    },
    {
      value: "10 px / 40 px",
      label: t("Alt+방향키 이동 / Shift 를 더한 이동", "Alt+arrow move / with Shift"),
      source: `${CREATOR}/StudioFloatingSurface.tsx`,
    },
    {
      value: "z-index 50 - 69",
      label: t("떠 있는 창이 쌓이는 범위(최대 20개)", "Stacking range for floating windows (up to 20)"),
      source: `${CREATOR}/studio-floating-surface-stack.ts`,
    },
  ],
  reviewedAt: INTERACTION_REVIEWED_AT,
};

export const ENGINEERING_ATLAS_INTERACTION_POINTER: readonly EngineeringAtlasEntry[] = [
  POINTER_DRAG_KANBAN,
  FLOATING_PANEL_POINTER_DRAG,
];
