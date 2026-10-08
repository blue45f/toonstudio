import { t } from "./engineering-glossary-more-kit";

import type { GlossaryTerm } from "./engineering-glossary-content";

/** 확장 용어집 · 입력 · 상호작용. 손·펜·키보드의 움직임이 동작이 되기까지. */
export const GLOSSARY_MORE_INPUT: readonly GlossaryTerm[] = [
  {
    id: "html5-dnd-vs-pointer",
    category: "input",
    term: t("HTML5 끌어 놓기 vs Pointer Events", "HTML5 drag and drop vs Pointer Events"),
    definition: t(
      "끌기를 만드는 두 가지 길입니다. HTML5 끌어 놓기는 전달 규칙을 브라우저가 정해 주고, Pointer Events 는 움직임을 전부 직접 처리합니다.",
      "Two ways to build dragging: HTML5 drag and drop lets the browser set the hand-over rules, while Pointer Events means handling every movement yourself.",
    ),
    analogy: t(
      "택배 창구에 상자를 건네는 길(HTML5)과 손수레를 직접 끌고 가는 길(Pointer Events)의 차이입니다. 창구는 규칙이 정해져 편하고, 손수레는 길을 내 마음대로 고릅니다.",
      "Handing a box over a parcel counter (HTML5) versus pushing your own handcart (Pointer Events): the counter has fixed rules, the cart lets you choose your route.",
    ),
    inToonstudio: t(
      "일에 따라 세 방식을 직접 구현했고 끌어 놓기 라이브러리는 쓰지 않습니다. 바깥 파일·단순 목록 재정렬은 HTML5(삽입 허브·레이어·페이지), 여러 열을 오가는 칸반·창 이동·스플리터는 Pointer Events, 장면 안 객체는 Konva·three.js 내장 기능입니다. 방식이 달라도 ‘미리보기 → 놓을 때 한 번 커밋 → Esc 취소’ 계약은 같습니다.",
      "Three approaches are built in-house and no drag-and-drop library is used. Outside files and simple list reorders use HTML5 (insert hub, layers, pages); kanban across columns, window moves and splitters use Pointer Events; objects inside a scene use Konva and three.js built-ins. The contract is shared: preview, one commit on drop, Esc cancels.",
    ),
    chapters: ["architecture", "quality"],
    atlasIds: ["dnd-implementation-choice"],
  },
  {
    id: "data-transfer",
    category: "input",
    term: t("dataTransfer (끌어 놓기 전달 상자)", "dataTransfer (the drag payload box)"),
    definition: t(
      "HTML5 끌기에서 ‘무엇을 끌고 있는지’를 문자열이나 파일로 담아 놓을 곳에 전달하는 상자입니다.",
      "The box in HTML5 dragging that carries what is being dragged, as strings or files, to the drop target.",
    ),
    analogy: t(
      "이삿짐 상자에 붙이는 내용물 스티커와 같습니다. 받는 쪽은 스티커를 읽고 풀지 말지 정하며, 스티커는 거짓일 수 있으니 열어서 확인해야 합니다.",
      "Like the contents sticker on a moving box: the receiver reads it to decide whether to unpack, but a sticker can lie, so the box must still be checked.",
    ),
    inToonstudio: t(
      "삽입 허브가 카드를 끌 때 payload 를 쓰고(studio-insert-hub-drag.ts), 놓을 때 읽는 쪽이 검증합니다. 삽입 payload 는 4,096자·정확한 키 구성·제어문자 없음만 통과하고(parseStudioInsertDragPayload), 에셋 끌기는 data URL 약 32MiB·한 변 16,384px·SVG 2MiB 가 상한입니다(studio-shared-asset-drag.ts). 거대한 payload 로 앱이 멈추는 일을 막습니다.",
      "The insert hub writes a payload when a card is dragged (studio-insert-hub-drag.ts) and the receiver validates it on drop. An insert payload passes only at 4,096 characters or fewer, with the exact key set and no control characters (parseStudioInsertDragPayload); asset drags are capped at about 32 MiB of data URL, 16,384 px per side and 2 MiB of SVG (studio-shared-asset-drag.ts). A huge payload cannot freeze the app.",
    ),
    chapters: ["quality", "troubleshooting-evidence"],
    atlasIds: ["html5-dnd-insert-hub-canvas"],
  },
  {
    id: "drop-validation",
    category: "input",
    term: t("drop 유효성 검사 (놓은 파일 검증)", "Drop validation"),
    definition: t(
      "사용자가 놓은 파일을 받아들이기 전에 종류·크기·픽셀 수를 검사해, 위험하거나 너무 큰 입력이 문서에 닿지 못하게 막는 절차입니다.",
      "Checking a dropped file's type, size and pixel count before accepting it, so risky or oversized input never reaches the document.",
    ),
    analogy: t(
      "공항 보안검색대와 같습니다. 가방(파일)은 누가 가져와도 검색대를 통과해야 하고, 규정을 넘으면 탑승(문서 반입) 전에 돌려보냅니다.",
      "Like airport security: any bag (file) goes through the scanner, and anything over the rules is turned back before boarding (entering the document).",
    ),
    inToonstudio: t(
      "캔버스에 놓은 파일은 먼저 어떤 가져오기 길로 갈지 계획하고(planStudioCanvasFileDrop), 이미지는 inspectStudioUploadSourceImage 가 검사합니다. 원본 12MiB·묶음 48MiB, 디코드 픽셀은 데스크톱 16,777,216 · 모바일 8,388,608 이 상한이고 PSD 는 128MiB 입니다(studio-upload-image-safety.ts, studio-psd-import.ts). 한도를 넘으면 문서에 닿기 전에 막습니다.",
      "A file dropped on the canvas is first planned onto an import route (planStudioCanvasFileDrop), and images are inspected by inspectStudioUploadSourceImage. Caps are 12 MiB per source and 48 MiB per batch, 16,777,216 decoded pixels on desktop and 8,388,608 on mobile, and 128 MiB for PSD (studio-upload-image-safety.ts, studio-psd-import.ts). Anything over is stopped before it touches the document.",
    ),
    chapters: ["quality", "troubleshooting-evidence"],
    atlasIds: ["file-drop-import-safety"],
  },
  {
    id: "pointer-capture",
    category: "input",
    term: t("포인터 캡처 (Pointer capture)", "Pointer capture"),
    definition: t(
      "끌기가 시작된 요소가 포인터를 ‘붙잡아’, 손가락이나 마우스가 요소 밖으로 나가도 이벤트를 계속 받게 하는 기능입니다.",
      "A feature where the element that started a drag ‘holds’ the pointer, so it keeps receiving events even when the finger or mouse leaves it.",
    ),
    analogy: t(
      "줄다리기에서 밧줄을 놓치지 않는 것과 같습니다. 손이 선 밖으로 나가도 밧줄(이벤트)은 계속 내 손에 있습니다.",
      "Like never letting go of the rope in a tug of war: even if your hand crosses the line, the rope (the events) stays with you.",
    ),
    inToonstudio: t(
      "크기 조절 핸들(shared/hooks/use-resizable.ts)이 setPointerCapture 로 포인터를 잡고, pointercancel·lostpointercapture·창 blur 가 오면 끌기를 마무리합니다. 플로팅 패널은 마우스·펜이 8px 넘게 움직여야 시작하고 터치는 250ms 길게 눌러야 시작합니다(studio-floating-surface-pointer-state.ts). 손을 떼는 순간 위치를 한 번만 저장합니다.",
      "The resize handle (shared/hooks/use-resizable.ts) grabs the pointer with setPointerCapture and finishes the drag on pointercancel, lostpointercapture or window blur. Floating panels start after a mouse or pen moves 8 px, or a touch holds for 250 ms (studio-floating-surface-pointer-state.ts), and the position is saved just once, on release.",
    ),
    chapters: ["performance", "quality"],
    atlasIds: ["floating-panel-pointer-drag"],
  },
  {
    id: "drag-threshold-autoscroll",
    category: "input",
    term: t("끌기 임계값과 자동 스크롤", "Drag threshold and auto-scroll"),
    definition: t(
      "몇 px 이상 움직여야 ‘끌기’로 보는 기준과, 끌다가 화면 가장자리에 닿으면 알아서 화면이 밀려 가는 기능입니다.",
      "The distance a pointer must travel before a press counts as a drag, and the feature that scrolls the view when you drag to the edge.",
    ),
    analogy: t(
      "문손잡이를 살짝 건드리는 것과 문을 열려고 당기는 것의 차이입니다. 일정 거리 이상 당겨야 ‘연다’고 보고, 복도 끝에 닿으면 다음 방이 나타납니다.",
      "The difference between brushing a door handle and pulling to open: only a certain pull counts as opening, and reaching the end of the corridor reveals the next room.",
    ),
    inToonstudio: t(
      "제작 허브 칸반(production-hub/board/use-board-dnd.ts)은 START_DISTANCE = 5px 를 넘어야 끌기를 시작해 클릭과 구분하고, 가장자리 가로 56px·세로 80px 구역에서 한 번에 최대 22px 씩 자동 스크롤합니다. 터치에서는 카드 본문은 그대로 스크롤되고 손잡이(touch-action: none)에서만 끌기가 시작됩니다.",
      "The production-hub kanban (production-hub/board/use-board-dnd.ts) starts a drag only past START_DISTANCE = 5 px, which separates it from a click, and auto-scrolls up to 22 px per step in edge zones of 56 px horizontally and 80 px vertically. On touch the card body keeps scrolling and only the handle (touch-action: none) starts a drag.",
    ),
    chapters: ["performance", "quality"],
    atlasIds: ["pointer-drag-kanban"],
  },
  {
    id: "snap",
    category: "input",
    term: t("스냅 (자석 정렬)", "Snap (magnetic alignment)"),
    definition: t(
      "끌던 물체가 격자·가이드선·다른 물체의 가장자리 근처에 오면 정확한 위치로 철컥 달라붙게 하는 보조 기능입니다.",
      "An aid that makes a dragged object click into an exact position when it nears a grid, guide line or another object's edge.",
    ),
    analogy: t(
      "냉장고 자석이 문 가까이에서 딱 붙는 것과 같습니다. 손은 대충 가져가도 정확한 자리에 앉습니다.",
      "Like a fridge magnet that snaps onto the door when it gets close: a rough hand still lands in the exact spot.",
    ),
    inToonstudio: t(
      "캔버스 객체 끌기는 화면 기준 6px 안에서 격자에 붙고(studio-object-drag-snap.ts, STUDIO_OBJECT_DRAG_SNAP_TOLERANCE_PX = 6), 줌 배율로 환산하되 격자 칸의 1/3 을 넘지 않습니다. 회전은 Shift 를 누르면 15° 단위로 맞춰지며(studio-transform-interaction.ts) 가장 가까운 눈금이 늘 7.5° 이내라 Shift 를 누르면 항상 눈금에 앉습니다. 문서에는 놓을 때 한 번만 기록합니다.",
      "Dragging a canvas object snaps to the grid within 6 screen pixels (studio-object-drag-snap.ts, STUDIO_OBJECT_DRAG_SNAP_TOLERANCE_PX = 6), converted by zoom level and never more than a third of a grid cell. Holding Shift quantizes rotation to 15 degrees (studio-transform-interaction.ts); the nearest stop is always within 7.5 degrees, so Shift always lands on one. The document records only once, on release.",
    ),
    chapters: ["performance", "web-3d-engine"],
    atlasIds: ["konva-transform-snap"],
  },
  {
    id: "wcag-drag-alternatives",
    category: "input",
    term: t("끌기 동작의 대체 수단 (WCAG 2.5.7)", "Dragging alternatives (WCAG 2.5.7)"),
    definition: t(
      "끌어서 하는 일은 끌지 않고도(클릭·키보드·버튼) 할 수 있어야 한다는 접근성 기준입니다. 손이 불편하거나 보조기기를 쓰는 사람을 위한 것입니다.",
      "An accessibility criterion saying anything done by dragging must also be doable without dragging (click, keyboard, buttons), for people with limited hand control or assistive tech.",
    ),
    analogy: t(
      "계단 옆의 경사로와 같습니다. 계단(끌기)만 있으면 못 올라가는 사람이 있으니, 같은 곳에 닿는 다른 길을 항상 함께 둡니다.",
      "Like a ramp beside the stairs: with stairs (dragging) alone some people cannot get up, so another route to the same place always comes with it.",
    ),
    inToonstudio: t(
      "끌기마다 짝을 둡니다. 페이지 스트립은 Alt+←/→ 로 같은 이동 함수를 쓰고, 가구 배치 지도는 화살표 16px(Shift 와 함께 1px), VRM 관절은 키보드 4°(Shift 와 함께 1°) 회전, 스플리터는 터치 더블탭(350ms)이 있습니다. 아직 비어 있는 곳은 숨기지 않고 도감 카드에 적어 둡니다.",
      "Every drag gets a partner. The page strip uses Alt+Left/Right through the same move function; the furniture map moves 16 px per arrow key (1 px with Shift); VRM joints rotate 4 degrees by keyboard (1 degree with Shift); splitters support a touch double tap (350 ms). Gaps that remain are listed in the atlas card rather than hidden.",
    ),
    chapters: ["quality", "quality-gates"],
    atlasIds: ["keyboard-alternatives-for-drag", "page-strip-keyboard-reorder"],
  },
  {
    id: "aria-live",
    category: "input",
    term: t("aria-live (결과를 말로 알려 주기)", "aria-live (announcing results)"),
    definition: t(
      "화면의 일부가 바뀔 때 스크린 리더가 그 변화를 소리로 읽어 주게 하는 표시입니다. 눈으로 못 보는 사람에게 ‘방금 무슨 일이 있었는지’ 알려 줍니다.",
      "A marker that makes a screen reader speak changes in part of the page, telling people who cannot see the screen what just happened.",
    ),
    analogy: t(
      "공항의 안내방송과 같습니다. 전광판(화면)을 못 봐도 ‘게이트가 바뀌었습니다’라는 소리로 상황을 알 수 있습니다.",
      "Like an airport announcement: even if you cannot see the board, a voice tells you the gate has changed.",
    ),
    inToonstudio: t(
      "페이지 스트립에서 순서를 바꾸면 화면에는 보이지 않는 role=\"status\" aria-live=\"polite\" 영역(sr-only)에 결과 문장이 들어가 스크린 리더가 읽습니다(StudioPageSequenceStrip.tsx). 끌기와 키보드(Alt+←/→)가 같은 이동 함수를 쓰므로 어느 쪽으로 옮겨도 같은 안내가 나옵니다.",
      "After a reorder in the page strip, a result sentence goes into a visually hidden role=\"status\" aria-live=\"polite\" region (sr-only) that screen readers read out (StudioPageSequenceStrip.tsx). Dragging and the keyboard (Alt+Left/Right) share one move function, so either way produces the same announcement.",
    ),
    chapters: ["quality", "quality-gates"],
    atlasIds: ["page-strip-keyboard-reorder"],
  },
  {
    id: "focus-restoration",
    category: "input",
    term: t("포커스 복구", "Focus restoration"),
    definition: t(
      "화면이 다시 그려져도 키보드 사용자가 있던 자리를 잃지 않도록, 방금 쓰던 요소에 초점(포커스)을 되돌려 주는 처리입니다.",
      "Handing keyboard focus back to the element just used, so a re-render never makes a keyboard user lose their place.",
    ),
    analogy: t(
      "책갈피와 같습니다. 책장을 다시 정리해도 읽던 쪽에 책갈피가 꽂혀 있으면 이어서 읽을 수 있습니다.",
      "Like a bookmark: even if the shelves are reorganized, the marker keeps your page so you can carry on reading.",
    ),
    inToonstudio: t(
      "페이지 스트립은 순서를 바꾼 뒤 옮겨진 페이지 버튼에 focus({ preventScroll: true }) 로 초점을 되돌립니다. 새 순서가 화면에 반영된 렌더에서만 되돌리고, REFOCUS_GIVE_UP_MS = 1,000ms 가 지나면 포기합니다. 초점이 이미 캔버스 등 다른 곳에 있으면 훔치지 않습니다(StudioPageSequenceStrip.tsx).",
      "After a reorder, the page strip returns focus to the moved page's button with focus({ preventScroll: true }). It restores only in the render where the new order is on screen, gives up after REFOCUS_GIVE_UP_MS = 1,000 ms, and never steals focus that already sits elsewhere, such as on the canvas (StudioPageSequenceStrip.tsx).",
    ),
    chapters: ["quality", "quality-gates"],
    atlasIds: ["page-strip-keyboard-reorder"],
  },
  {
    id: "hit-test-canvas",
    category: "input",
    term: t("히트 테스트 (무엇을 눌렀나 찾기)", "Hit testing"),
    definition: t(
      "화면의 어느 점을 눌렀을 때 그 아래에 어떤 물체가 있는지 찾아내는 일입니다. 그림이 겹쳐 있어도 맨 위의 대상을 골라냅니다.",
      "Finding which object lies under a point the user pressed, picking the topmost one even when drawings overlap.",
    ),
    analogy: t(
      "사진 위에 투명 방안지를 대고 ‘이 칸은 누구 자리’인지 번호를 적어 둔 표와 같습니다. 눌린 칸의 번호만 읽으면 누구인지 바로 압니다.",
      "Like laying see-through graph paper over a photo with each square labelled by its owner: read the pressed square's label and you know who it is.",
    ),
    inToonstudio: t(
      "Konva 가 입력(pointer-input)과 히트 테스트를 맡고(docs/engines/renderer-roles.md), 눈에 보이지 않는 별도 ‘hit-test 캔버스’를 따로 둡니다. 이 캔버스는 픽셀을 자주 되읽으므로 willReadFrequently: true, 라이브 잉크 캔버스는 반대 힌트 desynchronized 라서 둘을 한 캔버스에 섞지 않는 것이 원칙입니다. 역할별 규칙은 정책 모듈(studio-lowlatency-surface-policy.ts)에 있으나 아직 제품에 연결되지 않았습니다.",
      "Konva owns pointer input and hit testing (docs/engines/renderer-roles.md) and keeps a separate invisible ‘hit-test’ canvas. That canvas reads pixels back often, so it is willReadFrequently: true, while live-ink canvases use the opposite hint, desynchronized, so the two are not meant to be mixed on one canvas. The per-role rules live in a policy module (studio-lowlatency-surface-policy.ts) that is not yet wired into the product.",
    ),
    chapters: ["brush-render-authority", "performance"],
    atlasIds: ["konva-transform-snap"],
  },
  {
    id: "touch-action",
    category: "input",
    term: t("touch-action (터치 스크롤과 끌기 구분)", "touch-action (scroll versus drag on touch)"),
    definition: t(
      "터치로 화면을 건드렸을 때 브라우저가 스크롤·확대 같은 기본 동작을 할지, 코드가 직접 끌기를 처리할지 정하는 CSS 속성입니다.",
      "A CSS property deciding whether a touch triggers the browser's default scrolling and zooming or is left for your code to handle as a drag.",
    ),
    analogy: t(
      "엘리베이터 문 센서와 같습니다. 센서를 켜 두면 사람이 지나가는 걸 문이 알아서 처리하고, 끄면 직접 버튼으로 조작합니다.",
      "Like an elevator door sensor: leave it on and the door handles passers-by itself; turn it off and you work the buttons yourself.",
    ),
    inToonstudio: t(
      "칸반 카드는 본문에서 손가락이 자연스럽게 스크롤되도록 두고, 끌기 손잡이에만 touch-action: none 을 줍니다(ProductionBoardTaskCard.tsx, production-workboard.css). 손잡이는 터치 최소 크기 44px(min-h-11 min-w-11)로 잡아 손끝으로도 누르기 쉽게 합니다.",
      "Kanban cards leave finger scrolling natural on the body and apply touch-action: none only to the drag handle (ProductionBoardTaskCard.tsx, production-workboard.css). The handle is at least 44 px (min-h-11 min-w-11) so a fingertip can hit it easily.",
    ),
    chapters: ["quality", "performance"],
    atlasIds: ["pointer-drag-kanban"],
  },
];
