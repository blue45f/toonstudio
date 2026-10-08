import { INTERACTION_REVIEWED_AT, t } from "./engineering-atlas-interaction-kit";

import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/** interaction · 장면 안 객체 끌기 카드: 캔버스(Konva) 이동·스냅·변형, 3D(three.js) 기즈모와 취소 안전. */

const CREATOR = "apps/web/src/domains/creator";
const STAGE_DRAG = `${CREATOR}/studio-cuttoon-editor/studio-cuttoon-stage-pointers-drag.ts`;

const KONVA_TRANSFORM_SNAP: EngineeringAtlasEntry = {
  id: "konva-transform-snap",
  category: "interaction",
  name: "Konva",
  title: t("캔버스 객체를 끌고, 달라붙게 하고, 변형하기", "Dragging, snapping and transforming canvas objects"),
  status: "live",
  tagline: t(
    "Konva 의 드래그 위에 자석식 스냅과 정렬선을 얹고, 문서에는 놓을 때 한 번만 기록합니다.",
    "Layers magnetic snapping and alignment guides on Konva dragging, and records to the document once, on drop.",
  ),
  background: [
    t(
      "캔버스 위의 말풍선·이미지·글자는 화면에 그려진 그림이라서 브라우저가 알아서 끌어 주는 대상이 아닙니다. Konva 라는 그리기 라이브러리가 마우스·터치 입력을 받아 도형의 좌표를 바꿔 줍니다. 여기에 자석이 철에 달라붙듯 격자선이나 다른 요소의 가장자리 가까이에서만 끌려 들어가는 '스냅'을 얹으면, 손맛은 자유롭고 정렬은 정확해집니다.",
      "Speech bubbles, images and text on the canvas are pictures drawn on screen, so the browser does not drag them for you. A drawing library called Konva takes mouse and touch input and changes each shape's coordinates. Add snapping, which pulls an object in only near a grid line or another element's edge like a magnet pulling iron, and the feel stays free while the alignment is exact.",
    ),
    t(
      "도형에 draggable 을 켜면 Konva 가 끌기를 처리하고, 편집기는 Stage 의 dragmove 핸들러(onStageDragMove) 한 곳에서 스냅을 계산합니다. 캔버스·가이드선·패널 가장자리는 화면 8px, 격자는 화면 6px(min(격자/3, 6/배율)), 다른 요소의 가장자리·중심·간격은 스마트 가이드 6px 이내에서만 끌려가며 가장 가까운 후보를 고릅니다(동률이면 요소 우선). 여러 개를 함께 끌 때는 나머지 노드를 같은 이동량만큼 미리 옮겨 보여 주고 문서에는 끝날 때 한 번만 커밋합니다. 크기·회전은 Transformer 가 맡아 Shift 는 15° 회전 스냅, Alt 는 중심 기준 크기 변경입니다.",
      "With draggable turned on, Konva handles the drag, and the editor computes snapping in a single place, the Stage's dragmove handler (onStageDragMove). Canvas, guide and panel edges attract within 8 screen px, the grid within 6 screen px (min(grid/3, 6/scale)), and other elements' edges, centres and spacing within 6 px via smart guides; the closest candidate wins, and on a tie an element beats a line. When several objects are dragged, the others are previewed with the same offset and the document is committed once at the end. The Transformer handles resizing and rotating: Shift snaps rotation to 15 degrees and Alt scales around the centre.",
    ),
    t(
      "예전에는 Konva 의 dragBoundFunc 에서도 스냅을 해서, 같은 프레임에 노드 원점을 먼저 반올림한 뒤 가장자리를 다시 스냅하는 바람에 포인터가 객체에서 떨어진 듯한 느낌이 났다는 코드 주석이 남아 있습니다. 그래서 지금은 dragBoundFunc 를 값 그대로 돌려주는 함수로 두고 스냅의 권위를 onStageDragMove 한 곳에 모았으며, 소스 계약 테스트가 이를 지킵니다. 단일 객체를 끄는 동안에는 노드를 별도 드래그 레이어로 올려 주 레이어를 매 프레임 다시 그리지 않고, 놓으면 제자리로 되돌립니다.",
      "A code comment records that snapping used to run in Konva's dragBoundFunc too, rounding the node origin first and then snapping its edges again in the same frame, which made the pointer feel detached from the object. So dragBoundFunc now simply returns its input and snapping has one authority, onStageDragMove, which a source-contract test enforces. While a single object is dragged, its node is lifted onto a separate drag layer so the main layer is not redrawn every frame, and it is put back when you let go.",
    ),
    t(
      "한계: 캔버스에 그려진 핸들과 도형은 스크린리더가 읽을 수 없어 변환 수치 입력 필드 같은 DOM 대체물로 보완하며, 그 키보드 동작은 일부만 확인했습니다(미확인). '선택 프레임이 객체와 따로 움직인다'는 제보는 프레임마다 위치를 재는 하니스로 재현·검증했는데, 기록은 2026-08-08 Apple M2 Max 의 headless Chromium 프로덕션 빌드 4개 구간(각 98~103프레임)에서 최대 어긋남 0px 였고 현재 코드에서 다시 잰 값은 아닙니다.",
      "Limits: handles and shapes drawn on the canvas cannot be read by screen readers, so DOM substitutes such as numeric transform fields fill in, and their keyboard behaviour was only partly checked (unconfirmed). The report that the selection frame moves separately from the object was reproduced and checked with a harness that measures positions every frame; the record shows a maximum drift of 0 px across four segments (98 to 103 frames each) on an Apple M2 Max in a headless Chromium production build on 2026-08-08, and was not re-measured on the current code.",
    ),
  ],
  keyPoints: [
    t("스냅은 dragmove 한 곳에서만: 중복 스냅이 손맛을 해쳤음", "Snap in one place only, dragmove: duplicate snapping hurt the feel"),
    t("선·격자·요소 가까이에서만 끌려가는 자석식, 멀면 자유 이동", "Magnetic: pulled only near lines, grid or elements; free when far"),
    t("여러 객체 이동은 미리보기만 옮기고 끝날 때 한 번 커밋", "Multi-object moves preview only and commit once at the end"),
  ],
  diagram: {
    id: "konva-transform-snap-diagram",
    kind: "graph",
    title: t("객체를 끌 때 일어나는 일", "What happens while an object is dragged"),
    caption: t(
      "스냅 후보 셋을 한 곳에서 비교해 가장 가까운 것을 고르고, 문서는 놓을 때 한 번만 바꿉니다.",
      "Three snap candidates are compared in one place and the closest wins; the document changes once, on drop.",
    ),
    alt: t(
      "객체를 끌기 시작하면 단일 객체는 별도 레이어로 올라가고, Stage 의 dragmove 핸들러가 스냅 후보 세 가지를 계산합니다. 선과 가장자리, 격자 자석, 다른 요소와의 정렬 후보 중 가장 가까운 것을 고르고 동률이면 요소를 우선합니다. 고른 값으로 노드 위치만 보정해 미리보기를 보여 주고, 놓으면 한 번 커밋하며 Esc 나 취소는 미리보기를 복원합니다.",
      "When a drag starts, a single object is lifted onto a separate layer and the Stage's dragmove handler computes three snap candidates: lines and edges, the grid magnet, and alignment with other elements. The closest one wins, with elements preferred on a tie, and only the node position is corrected as a preview. Dropping commits once, while Esc or a cancel restores the preview.",
    ),
    nodes: [
      { id: "press", label: t("객체를 끌기", "Drag an object"), sub: t("Konva draggable", "Konva draggable"), tone: "local", shape: "pill", at: [0, 1] },
      { id: "move", label: t("dragmove 핸들러", "dragmove handler"), sub: t("스냅의 유일한 권위", "The only snap authority"), tone: "local", at: [1, 1] },
      { id: "grid", label: t("격자 자석", "Grid magnet"), sub: t("화면 6px 이내에서만", "Within 6 screen px"), tone: "local", at: [2, 0] },
      { id: "lines", label: t("선·가장자리", "Lines and edges"), sub: t("캔버스·가이드·패널 8px", "Canvas, guides, panel: 8 px"), tone: "local", at: [2, 1] },
      { id: "smart", label: t("요소 정렬", "Element alignment"), sub: t("가장자리·중심·간격 6px", "Edges, centres, gaps: 6 px"), tone: "local", at: [2, 2] },
      { id: "pick", label: t("가장 가까운 것", "Closest wins"), sub: t("동률이면 요소", "Ties: elements"), tone: "neutral", shape: "diamond", at: [3, 1] },
      { id: "apply", label: t("노드 위치 보정", "Correct node position"), sub: t("미리보기만, 문서 무변경", "Preview only; no doc change"), tone: "local", at: [4, 1] },
      { id: "commit", label: t("놓을 때 1회 커밋", "One commit on drop"), sub: t("dragend → 스냅샷 한 번", "dragend, one snapshot"), tone: "good", at: [5, 1] },
      { id: "cancel", label: t("Esc·취소", "Esc or cancel"), sub: t("미리보기 복원, 커밋 없음", "Preview restored; no commit"), tone: "warn", at: [4, 2] },
    ],
    edges: [
      { from: "press", to: "move" },
      { from: "move", to: "grid" },
      { from: "move", to: "lines" },
      { from: "move", to: "smart" },
      { from: "grid", to: "pick" },
      { from: "lines", to: "pick" },
      { from: "smart", to: "pick" },
      { from: "pick", to: "apply", label: t("채택", "pick") },
      { from: "apply", to: "commit", label: t("놓기", "drop") },
      { from: "apply", to: "cancel", style: "dashed", label: t("취소", "cancel") },
    ],
    groups: [{ id: "candidates", label: t("스냅 후보 셋", "Three snap candidates"), nodeIds: ["grid", "lines", "smart"], tone: "local" }],
  },
  usage: [
    {
      feature: t("스튜디오 편집기 · 캔버스 객체 끌기와 스냅", "Studio editor · dragging and snapping canvas objects"),
      role: t(
        "말풍선·이미지·텍스트·도형 노드를 끌 때 Stage 의 dragmove 핸들러 한 곳에서 격자 자석(6px)·선과 가장자리(8px)·다른 요소 정렬(6px)을 계산해 노드 위치를 보정합니다. 스냅을 꺼도 정렬선만 보여 주는 경로가 있습니다.",
        "When a bubble, image, text or shape node is dragged, a single Stage dragmove handler computes the grid magnet (6 px), lines and edges (8 px) and alignment with other elements (6 px) and corrects the node position. With snapping off, a path still shows alignment guides only.",
      ),
      paths: [
        `${STAGE_DRAG}#onStageDragMove`,
        `${CREATOR}/studio-object-drag-snap.ts#snapStudioObjectDragPosition`,
        `${CREATOR}/studio-smart-guides.ts`,
        `${CREATOR}/canvas/StudioCanvasViewportStageHost.tsx`,
      ],
      route: "/studio",
    },
    {
      feature: t("여러 객체 이동과 한 번의 커밋", "Moving several objects, one commit"),
      role: t(
        "여러 객체(그룹 단위)를 함께 끌면 나머지 노드와 선택 오버레이를 같은 이동량으로 미리 움직이고 끝날 때 한 스냅샷만 커밋합니다. Alt 를 누른 채 끌면 복제 이동이고, Esc·pointercancel 은 미리보기를 복원하며 커밋하지 않습니다.",
        "Dragging several objects (as a group unit) previews the other nodes and the selection overlay with the same offset and commits one snapshot at the end. Alt-dragging duplicates while moving, and Esc or pointercancel restores the preview without committing.",
      ),
      paths: [
        `${STAGE_DRAG}#onStageDragEnd`,
        `${CREATOR}/studio-group-drag-cancel-runtime-boundary.test.ts`,
      ],
    },
    {
      feature: t("크기·회전 변형 핸들", "Resize and rotate handles"),
      role: t(
        "Konva Transformer 에 Shift=15° 회전 스냅, Alt=중심 기준 크기 변경을 연결하고, 최소 크기(화면 1px 상당)에서는 이전 상자로 튕기지 않고 포인터 경로상의 한계 지점에 멈추게 합니다. 그룹 비율 유지 리사이즈 핸들은 거친 포인터(터치)에서 앵커를 더 크게(클릭 영역 44px) 만듭니다.",
        "The Konva Transformer is wired so Shift snaps rotation to 15 degrees and Alt scales around the centre; at the minimum size (about 1 screen px) the box stops at the limit along the pointer path instead of jumping back. The group proportional-resize handles get larger anchors for coarse pointers such as touch (44 px hit area).",
      ),
      paths: [
        `${CREATOR}/StudioNaturalTransformer.tsx`,
        `${CREATOR}/studio-transform-interaction.ts#constrainStudioTransformBox`,
        `${CREATOR}/StudioGroupUniformResizeProxy.tsx`,
      ],
    },
    {
      feature: t("드래그 레이어와 협업 잠금", "Drag layer and collaboration lock"),
      role: t(
        "단일 객체를 끄는 동안 노드를 별도 드래그 레이어로 올려 주 레이어 재그리기를 줄이고 놓으면 되돌립니다(복구 실패 시 16ms 에서 최대 1초까지 늘려 재시도). 협업 중 다른 사람이 쓰는 객체는 onDragStart 에서 stopDrag 로 막습니다.",
        "While one object is dragged its node is lifted onto a separate drag layer to reduce main-layer redraws and put back afterwards (a failed restore retries from 16 ms up to 1 s). During collaboration, an object someone else is using is blocked with stopDrag in onDragStart.",
      ),
      paths: [
        `${CREATOR}/studio-single-object-drag-layer.ts`,
        `${CREATOR}/studio-node-props.ts#withStudioNodeInteractionGuards`,
      ],
    },
  ],
  samples: [
    {
      kind: "teaching",
      title: t("격자선 근처에서만 달라붙는 자석식 스냅", "Magnetic snapping that only pulls near a grid line"),
      language: "ts",
      code: `/** 격자선 근처(화면 px 기준)에서만 달라붙는 자석식 스냅. 확대/축소와 무관하게 같은 손맛. */
export function magneticSnap(value: number, grid: number, viewportScale: number, screenTolerancePx = 6): number {
  if (!(grid > 0) || !(viewportScale > 0)) return value;
  const tolerance = Math.min(grid / 3, screenTolerancePx / viewportScale); // 문서 좌표계 허용오차
  const nearest = Math.round(value / grid) * grid;
  return Math.abs(nearest - value) <= tolerance ? nearest : value;
}
// magneticSnap(41, 40, 1) → 40,  magneticSnap(50, 40, 1) → 50 (멀면 자유 이동)`,
      codeEn: `/** Magnetic snapping that only pulls near a grid line, measured in screen px, so zoom does not change the feel. */
export function magneticSnap(value: number, grid: number, viewportScale: number, screenTolerancePx = 6): number {
  if (!(grid > 0) || !(viewportScale > 0)) return value;
  const tolerance = Math.min(grid / 3, screenTolerancePx / viewportScale); // tolerance in document coordinates
  const nearest = Math.round(value / grid) * grid;
  return Math.abs(nearest - value) <= tolerance ? nearest : value;
}
// magneticSnap(41, 40, 1) → 40,  magneticSnap(50, 40, 1) → 50 (far away: free movement)`,
      explain: t(
        "항상 가장 가까운 격자로 반올림하면 40px 격자에서 객체가 40px 씩 계단처럼 뛰기 때문에, 허용 거리 안에서만 끌어당깁니다. 허용 거리는 화면 px 기준이라 확대해도 같은 손맛입니다(실제 코드 snapStudioObjectDragPosition 과 같은 계산).",
        "Always rounding to the nearest grid cell makes objects jump in 40 px steps on a 40 px grid, so it pulls only within a tolerance. The tolerance is in screen px, so zoom keeps the same feel (the same calculation as the real snapStudioObjectDragPosition).",
      ),
      verify: "types",
    },
    {
      kind: "simplified",
      title: t("최소 크기에서 튕기지 않고 한계 지점에 멈추기", "Stopping at the limit instead of jumping back at minimum size"),
      language: "ts",
      code: `interface Box { x: number; y: number; width: number; height: number }

/** 최소 크기 아래로 줄이려 하면 이전 상자로 튕기지 않고, 포인터 경로상의 한계 지점에 멈춘다. */
export function constrainBox(oldBox: Box, newBox: Box, minimum: number): Box {
  let progress = 1; // 0 = 이전 상자, 1 = 새 상자
  for (const key of ["width", "height"] as const) {
    if (newBox[key] >= minimum) continue;
    const delta = newBox[key] - oldBox[key];
    if (delta === 0) {
      progress = 0;
      continue;
    }
    progress = Math.min(progress, Math.max(0, Math.min(1, (minimum - oldBox[key]) / delta)));
  }
  if (progress >= 1) return newBox;
  const lerp = (a: number, b: number) => a + (b - a) * progress;
  return {
    x: lerp(oldBox.x, newBox.x),
    y: lerp(oldBox.y, newBox.y),
    width: lerp(oldBox.width, newBox.width),
    height: lerp(oldBox.height, newBox.height),
  };
}`,
      codeEn: `interface Box { x: number; y: number; width: number; height: number }

/** Below the minimum size, stop at the limit along the pointer path instead of jumping back to the old box. */
export function constrainBox(oldBox: Box, newBox: Box, minimum: number): Box {
  let progress = 1; // 0 = old box, 1 = new box
  for (const key of ["width", "height"] as const) {
    if (newBox[key] >= minimum) continue;
    const delta = newBox[key] - oldBox[key];
    if (delta === 0) {
      progress = 0;
      continue;
    }
    progress = Math.min(progress, Math.max(0, Math.min(1, (minimum - oldBox[key]) / delta)));
  }
  if (progress >= 1) return newBox;
  const lerp = (a: number, b: number) => a + (b - a) * progress;
  return {
    x: lerp(oldBox.x, newBox.x),
    y: lerp(oldBox.y, newBox.y),
    width: lerp(oldBox.width, newBox.width),
    height: lerp(oldBox.height, newBox.height),
  };
}`,
      explain: t(
        "constrainStudioTransformBox 의 핵심만 줄인 것입니다(유한값 검사와 이미 아주 작은 옛 문서 처리는 생략). 이전 상자를 그대로 돌려주면 핸들이 한계에서 끈적하게 달라붙는 느낌이 나므로, 이전·새 상자 사이를 보간해 한계 지점에서 멈춥니다.",
        "A trimmed version of the core of constrainStudioTransformBox (finite-value checks and handling of already tiny legacy objects are omitted). Returning the old box would make the handle feel sticky at the limit, so it interpolates between the old and new boxes and stops at the limit.",
      ),
      source: `${CREATOR}/studio-transform-interaction.ts`,
      verify: "types",
    },
  ],
  links: [
    {
      title: "Konva · Drag and Drop",
      url: "https://konvajs.org/docs/drag_and_drop/Drag_and_Drop.html",
      kind: "docs",
      note: t("draggable · dragmove · dragBoundFunc", "draggable, dragmove and dragBoundFunc"),
    },
    {
      title: "Konva · Transformer (basic demo)",
      url: "https://konvajs.org/docs/select_and_transform/Basic_demo.html",
      kind: "docs",
    },
    {
      title: "Konva · Performance tips",
      url: "https://konvajs.org/docs/performance/All_Performance_Tips.html",
      kind: "docs",
      note: t("드래그 레이어 분리 같은 최적화", "Optimizations such as a separate drag layer"),
    },
    {
      title: "W3C · Understanding SC 2.5.8 Target Size (Minimum)",
      url: "https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html",
      kind: "guide",
      note: t("터치 앵커를 크게 만드는 근거가 되는 기준", "The criterion behind larger touch anchors"),
    },
  ],
  chapterIds: ["performance", "brush-engine"],
  talk: {
    pitch: t(
      "캔버스 위의 말풍선이나 이미지를 끌면 격자선이나 다른 요소의 가장자리 가까이에서만 자석처럼 달라붙고, 멀리 있을 때는 손이 가는 대로 자유롭게 움직입니다. 스냅 계산을 한 곳에서만 해서 포인터와 객체가 따로 노는 느낌을 없앴고, 문서에는 놓는 순간 한 번만 기록합니다. 선택 프레임이 객체와 어긋나지 않는지는 프레임 단위 측정 하니스로 확인했습니다.",
      "Drag a speech bubble or image on the canvas and it clings like a magnet only near a grid line or another element's edge; far away it moves freely with your hand. Snapping is computed in one place, which removed the feeling of the pointer being detached from the object, and the document is written once, on drop. Whether the selection frame drifts from the object was checked with a frame-by-frame measurement harness.",
    ),
    analogy: t(
      "철가루가 자석 가까이에서만 끌려가듯, 선 가까이 갔을 때만 달라붙는 느낌입니다. 멀리서는 자유롭습니다.",
      "Like iron filings pulled only near a magnet: it clings only when you are close to a line, and is free from afar.",
    ),
    questions: [
      {
        question: t("스냅을 끌 수 있나요?", "Can snapping be turned off?"),
        answer: t(
          "예. 스냅이 꺼져 있으면 노드 좌표는 바꾸지 않고 정렬선만 미리 보여 주는 코드 경로가 있습니다. 정렬선 표시와 위치 스냅은 서로 다른 설정입니다.",
          "Yes. With snapping off there is a code path that leaves node coordinates alone and only previews alignment guides. Showing guides and snapping positions are separate settings.",
        ),
      },
      {
        question: t("Figma·PowerPoint 와 같은 동작인가요?", "Does it behave like Figma or PowerPoint?"),
        answer: t(
          "코드 주석이 'Figma/PowerPoint 식 정밀 회전'처럼 목표로 삼은 손맛을 적었지만 동일성은 주장할 수 없습니다. 공개된 작업 개념을 참고한 독자 구현입니다.",
          "Code comments name a Figma or PowerPoint style feel as the goal, but sameness cannot be claimed. It is an independent implementation inspired by publicly known workflow concepts.",
        ),
      },
      {
        question: t("성능은 어떻게 확인했나요?", "How was performance checked?"),
        answer: t(
          "제품 오너의 '객체 이동 시 선택 영역이 따로 움직인다'는 제보를, 실제 Konva 장면 그래프의 프레임별 위치를 재는 하니스로 재현·검증했습니다. 2026-08-08 Apple M2 Max, headless Chromium, 프로덕션 빌드에서 4개 구간 모두 최대 어긋남 0px 였지만 현재 코드에서 다시 잰 값은 아닙니다.",
          "The product owner's report that the selection area moves separately from the object was reproduced and checked with a harness that measures per-frame positions in the real Konva scene graph. On 2026-08-08, on an Apple M2 Max with headless Chromium and a production build, all four segments showed a maximum drift of 0 px, but this was not re-measured on the current code.",
        ),
      },
    ],
    pitfall: t(
      "'모든 기기에서 어긋남 0'이라고 말하지 마세요. 위 기록은 한 대의 Mac, headless Chromium 에서 2026-08-08 에 남긴 값입니다. 'dragBoundFunc 로 스냅한다'고 설명하지 마세요. 코드에서는 값을 그대로 돌려주고 스냅은 dragmove 에서 합니다. 변환 수치 입력 필드 같은 DOM 대체물의 키보드 동작은 일부만 확인했습니다(미확인).",
      "Do not say there is zero drift on every device: the record comes from one Mac and headless Chromium on 2026-08-08. Do not explain snapping as dragBoundFunc; in the code it returns its input and snapping happens in dragmove. Keyboard behaviour of DOM substitutes such as numeric transform fields was only partly checked (unconfirmed).",
    ),
  },
  technologies: ["Konva", "React", "Pointer Events"],
  facts: [
    {
      value: "6 px",
      label: t("격자 자석 스냅의 화면 허용 거리(실제 허용은 min(격자/3, 6/배율))", "On-screen reach of the grid magnet (actual tolerance min(grid/3, 6/scale))"),
      source: `${CREATOR}/studio-object-drag-snap.ts`,
    },
    {
      value: "8 px",
      label: t("캔버스·가이드선·패널 가장자리 스냅의 화면 허용 거리", "On-screen reach of canvas, guide and panel edge snapping"),
      source: STAGE_DRAG,
    },
    {
      value: "15°",
      label: t("Shift 를 누를 때의 회전 스냅 단위", "Rotation snap step while Shift is held"),
      source: `${CREATOR}/studio-transform-interaction.ts`,
    },
    {
      value: "22 px / 44 px",
      label: t("그룹 리사이즈 앵커의 클릭 영역(데스크톱 / 거친 포인터)", "Group resize anchor hit area (desktop / coarse pointer)"),
      source: `${CREATOR}/StudioGroupUniformResizeProxy.tsx`,
    },
    {
      value: "0 px",
      label: t(
        "선택 프레임과 객체의 최대 어긋남(2026-08-08, Apple M2 Max, headless Chromium, 프로덕션 빌드, 4개 구간 98~103프레임; 현재 코드 재측정 아님)",
        "Maximum drift between selection frame and object (2026-08-08, Apple M2 Max, headless Chromium, production build, four segments of 98 to 103 frames; not re-measured on current code)",
      ),
      source: "tests/benchmarks/results/drag-selection-sync.json",
    },
  ],
  reviewedAt: INTERACTION_REVIEWED_AT,
};

const THREE_TRANSFORM_CONTROLS: EngineeringAtlasEntry = {
  id: "three-transform-controls",
  category: "interaction",
  name: "three.js TransformControls",
  title: t("3D 물체를 기즈모로 끌고, 취소하면 원래대로", "Dragging 3D objects with a gizmo, and restoring on cancel"),
  status: "live",
  tagline: t(
    "3D 기즈모를 끄는 동안 카메라 조작을 임대해 끄고, 취소하면 원본 자세와 카메라를 되돌립니다.",
    "While a 3D gizmo is dragged the camera control is leased off, and a cancel restores the original pose and camera.",
  ),
  background: [
    t(
      "3D 장면에서 마우스로 물체를 옮기려면 화면의 2차원 점을 3차원 공간의 위치로 바꿔야 합니다. 3D 편집기에는 화살표·고리·상자가 달린 조작 손잡이(기즈모)가 있어서, 화살표를 끌면 그 축으로만 움직입니다. three.js 는 이 기즈모를 TransformControls 라는 예제 도구로 제공하고, ToonStudio 는 3D 배경 편집기와 정밀 3D 작업대에서 씁니다.",
      "To move an object with the mouse in a 3D scene, a 2D screen point must become a 3D position. 3D editors have manipulation handles (gizmos) with arrows, rings and boxes, so dragging an arrow moves along that axis only. three.js offers this gizmo as an example tool called TransformControls, and ToonStudio uses it in the 3D background editor and the precision 3D workbench.",
    ),
    t(
      "기즈모를 잡으면(mouseDown) 원래 변환을 기록하고, 같은 드래그가 카메라도 돌리지 않도록 OrbitControls 를 잠시 끕니다. 끄는 동안 이동·회전·크기 스냅값이 적용되고, 놓으면(mouseUp) 값이 달라졌을 때만 변경 요청을 문서로 보냅니다. 정밀 3D 작업대는 취소를 꼼꼼히 다룹니다. Esc·창 blur·pointercancel·탭 숨김·WebGL 컨텍스트 손실이면 제스처를 먼저 비우고 pointerUp(null) 로 정리한 뒤 원본 자세와 카메라 조작을 복원하며 편집 기록을 만들지 않습니다.",
      "When the gizmo is grabbed (mouseDown) the original transform is recorded and OrbitControls is switched off so the same drag does not also spin the camera. While dragging, move, rotate and scale snap values apply, and on release (mouseUp) a change request goes to the document only if the values changed. The precision 3D workbench handles cancellation carefully: on Esc, window blur, pointercancel, a hidden tab or a lost WebGL context it clears the gesture first, cleans up with pointerUp(null), restores the original pose and camera control, and adds no edit history.",
    ),
    t(
      "3D 배경 편집기는 @react-three/drei 의 TransformControls 래퍼로 빠르게 연결하고, 여러 개를 고르면 첫 선택(드라이버)의 변환 변화량을 나머지에 적용합니다. 정밀 3D 작업대는 three.js TransformControls 를 직접 만들어 취소·원본 복원·카메라 임대를 세밀하게 제어하며, 여러 물체 동시 변환은 아직 구현하지 않았습니다. 두 방식을 고른 이유를 적은 결정 문서는 찾지 못했고 코드 구조에서 읽은 해석입니다(미확인).",
      "The 3D background editor hooks in quickly through the @react-three/drei TransformControls wrapper, and with several objects selected it applies the first selection's (the driver's) transform change to the rest. The precision 3D workbench builds three.js TransformControls directly for fine control over cancellation, original-pose restore and camera leasing, and does not yet transform several objects at once. I found no decision document explaining the two choices, so this is an interpretation read from the code structure (unconfirmed).",
    ),
    t(
      "VRM 포즈 편집기의 손 마커(손 IK 가 켜졌을 때)는 기즈모 대신 R3F 포인터 이벤트로 끕니다. 카메라가 보는 방향을 법선으로 하는 평면과 포인터 레이의 교점을 목표점으로 삼고, 포인터 캡처와 window 폴백 리스너로 모든 종료 경로를 한 함수에 모아 정상 종료만 커밋합니다. 한계: WebGL 기즈모는 스크린리더가 읽을 수 없어 모드 버튼과 정밀 수치 입력 도구로 보완하며 그 키보드 동작은 일부만 확인했습니다(미확인).",
      "The VRM pose editor's hand markers (when hand IK is on) are dragged with R3F pointer events instead of a gizmo. The target is the intersection of the pointer ray with a plane whose normal is the camera's viewing direction; pointer capture and window fallback listeners funnel every exit path into one function, and only a normal end commits. Limit: a WebGL gizmo cannot be read by screen readers, so mode buttons and precision numeric input fill in, and their keyboard behaviour was only partly checked (unconfirmed).",
    ),
  ],
  keyPoints: [
    t("끄는 동안 카메라 조작을 임대해 끄고, 끝나면 복원", "Lease the camera control off while dragging, and restore it afterwards"),
    t("취소하면 제스처를 먼저 비우고 원본 자세로 복원", "On cancel, clear the gesture first and restore the original pose"),
    t("문서가 권위: 표시 자세는 되돌리고 변경 요청만 보냄", "The document is the authority: reset the preview pose and only send a request"),
  ],
  diagram: {
    id: "three-transform-controls-diagram",
    kind: "sequence",
    title: t("기즈모 끌기와 취소", "Gizmo drag and cancel"),
    caption: t(
      "정상 종료는 변경 요청 한 번, 취소는 제스처를 먼저 비우고 원본을 복원합니다.",
      "A normal end sends one change request; a cancel clears the gesture first and restores the original.",
    ),
    alt: t(
      "사용자가 기즈모를 잡으면 제스처 런타임이 원본 변환을 기록하고 카메라 조작을 임대해 끕니다. 끄는 동안 변화가 알려져 다시 그려지고, 놓으면 표시 자세를 원본으로 되돌린 뒤 문서에 변경을 요청합니다. Esc·blur·컨텍스트 손실이면 제스처를 먼저 비운 뒤 pointerUp(null) 로 정리하고 원본 자세와 카메라를 복원하며 편집 기록은 추가하지 않습니다.",
      "When the user grabs the gizmo, the gesture runtime records the original transform and leases the camera control off. Changes are reported and redrawn while dragging, and on release the preview pose is reset to the original before the change is requested from the document. On Esc, blur or a lost context, the gesture is cleared first, cleanup runs through pointerUp(null), the original pose and camera are restored, and no edit history is added.",
    ),
    actors: [
      { id: "user", label: t("사용자", "User"), sub: t("마우스·펜", "Mouse or pen"), tone: "neutral" },
      { id: "control", label: t("기즈모", "Gizmo"), sub: t("TransformControls", "TransformControls"), tone: "local" },
      { id: "runtime", label: t("제스처 런타임", "Gesture runtime"), sub: t("취소·임대·1회 전달", "Cancel, lease, once"), tone: "local" },
      { id: "orbit", label: t("카메라 조작", "Camera control"), sub: t("OrbitControls", "OrbitControls"), tone: "neutral" },
      { id: "doc", label: t("편집 문서", "Document"), sub: t("정본(비동기 명령)", "Authority; async commands"), tone: "server" },
    ],
    messages: [
      { from: "user", to: "control", label: t("기즈모를 잡음 (mouseDown)", "Grab the gizmo (mouseDown)"), note: t("이동·회전·크기, 월드/로컬", "Move, rotate, scale; world or local") },
      { from: "control", to: "runtime", label: t("제스처 시작", "Gesture begins"), note: t("취소 때 되돌릴 원본 변환을 기록", "Records the original transform to restore") },
      { from: "runtime", to: "orbit", label: t("카메라 조작을 임대(끔)", "Lease camera control (off)"), note: t("끝나면 내가 껐을 때만 복원", "Restored only if this runtime turned it off") },
      { from: "user", to: "control", label: t("끌기 (objectChange)", "Drag (objectChange)"), note: t("스냅을 끄면 null 을 전달", "Snap off is passed as null") },
      { from: "control", to: "runtime", style: "dashed", label: t("변화 알림 → 다시 그리기", "Change → redraw") },
      { from: "user", to: "control", label: t("놓기 (mouseUp)", "Release (mouseUp)") },
      { from: "runtime", to: "doc", label: t("변경 요청 (onCommit)", "Request the change (onCommit)"), note: t("표시 자세는 먼저 원본으로 되돌림", "The preview pose is reset first") },
      { from: "doc", to: "runtime", style: "dashed", label: t("문서가 새 자세를 확정", "Document settles the new pose"), note: t("비동기 실패해도 가짜 위치가 안 남음", "A failed async command leaves no fake pose") },
      { from: "user", to: "runtime", label: t("Esc · blur · 컨텍스트 손실", "Esc, blur, context lost"), note: t("취소 경로 (webglcontextlost 포함)", "The cancel path (incl. webglcontextlost)") },
      { from: "runtime", to: "control", label: t("제스처를 비우고 pointerUp(null)", "Clear gesture, pointerUp(null)"), note: t("동기 mouseUp 이 커밋하지 못하게", "So a synchronous mouseUp cannot commit") },
      { from: "runtime", to: "runtime", label: t("원본 자세·카메라 복원", "Restore pose and camera"), note: t("편집 기록은 추가하지 않음", "No undo entry is added") },
    ],
  },
  usage: [
    {
      feature: t("정밀 3D 작업대 · 이동·회전·크기 기즈모", "Precision 3D workbench · move, rotate, scale gizmo"),
      role: t(
        "three.js TransformControls 를 직접 만들어 정본 오브젝트에 붙이고, 스냅 값(끄면 null)을 설정합니다. Esc·blur·pointercancel·탭 숨김·WebGL 컨텍스트 손실을 모두 취소로 처리합니다.",
        "It creates three.js TransformControls directly, attaches it to the canonical object and sets the snap values (null when snapping is off). Esc, blur, pointercancel, a hidden tab and a lost WebGL context are all treated as cancels.",
      ),
      paths: [
        `${CREATOR}/hybrid-dcc/StudioHybridDccTransformGizmo.tsx`,
        `${CREATOR}/hybrid-dcc/studio-hybrid-dcc-viewport-interaction.ts#resolveStudioHybridDccGizmoSnaps`,
      ],
      route: "/studio",
    },
    {
      feature: t("제스처 수명주기 · 임대와 취소", "Gesture lifecycle · leasing and cancel"),
      role: t(
        "시작·끝·취소를 한 곳이 소유합니다. OrbitControls 는 임대해 끄고 내가 끈 경우에만 복원하며, 끝나면 표시 자세를 원본으로 되돌린 뒤 변경 요청을 한 번 보냅니다. 무변경이면 편집 기록을 만들지 않습니다.",
        "One place owns start, end and cancel. OrbitControls is leased off and restored only if this runtime turned it off, and at the end the preview pose is reset to the original before one change request is sent. No change means no edit history.",
      ),
      paths: [
        `${CREATOR}/hybrid-dcc/studio-hybrid-dcc-transform-runtime.ts#createStudioHybridDccTransformRuntime`,
        `${CREATOR}/hybrid-dcc/studio-hybrid-dcc-transform-runtime.test.ts`,
      ],
    },
    {
      feature: t("3D 배경 편집기 · drei 래퍼와 다중 선택", "3D background editor · drei wrapper and multi-selection"),
      role: t(
        "선택한 오브젝트에 drei TransformControls 를 붙이고, 여러 개를 고르면 첫 선택의 변환 변화량을 나머지에 적용합니다. 모드 버튼은 aria-pressed 로 상태를 알립니다.",
        "A drei TransformControls is attached to the selected object, and with several selected the first selection's transform change is applied to the rest. The mode buttons expose their state through aria-pressed.",
      ),
      paths: [
        `${CREATOR}/bg3d/StudioBg3dEditorSceneGraph.tsx`,
        `${CREATOR}/bg3d/studio-bg3d-editor-transform-host.ts#applyMultiSelectDelta`,
      ],
    },
    {
      feature: t("VRM 포즈 편집기 · 손 마커 끌기", "VRM pose editor · dragging hand markers"),
      role: t(
        "손 IK 가 켜졌을 때 손 마커를 R3F 포인터 이벤트로 끌어 카메라 평면과 레이의 교점으로 목표를 정합니다. 취소·캡처 상실·blur·언마운트는 롤백, 정상 pointerup 만 커밋합니다.",
        "With hand IK on, a hand marker is dragged through R3F pointer events and its target is the intersection of the ray with the camera-facing plane. Cancel, lost capture, blur and unmount roll back, and only a normal pointerup commits.",
      ),
      paths: [`${CREATOR}/vrm/StudioVrmPoseBoneOverlay.tsx`],
    },
  ],
  samples: [
    {
      kind: "simplified",
      title: t("카메라 조작 임대: 내가 끈 경우에만 되돌리기", "Camera-control lease: restore only if you turned it off"),
      language: "ts",
      code: `interface Nav {
  enabled: boolean;
}

/** 기즈모를 끄는 동안만 카메라 조작을 끄고, 끝나면 '내가 끈 경우에만' 되돌린다. */
export function leaseNavigation(nav: Nav) {
  let before: boolean | null = null;
  return {
    acquire(): void {
      if (before === null) {
        before = nav.enabled;
        nav.enabled = false;
      }
    },
    release(): void {
      if (before !== null && nav.enabled === false) nav.enabled = before; // 다른 소유자가 켰다면 덮어쓰지 않음
      before = null;
    },
  };
}`,
      codeEn: `interface Nav {
  enabled: boolean;
}

/** Turn camera control off only while the gizmo is dragged, and restore it only if you turned it off. */
export function leaseNavigation(nav: Nav) {
  let before: boolean | null = null;
  return {
    acquire(): void {
      if (before === null) {
        before = nav.enabled;
        nav.enabled = false;
      }
    },
    release(): void {
      if (before !== null && nav.enabled === false) nav.enabled = before; // do not overwrite a later owner's enable
      before = null;
    },
  };
}`,
      explain: t(
        "createStudioHybridDccTransformRuntime 안의 draggingChanged·releaseOrbit 을 줄인 것입니다. 같은 드래그가 카메라를 함께 돌리면 안 되므로 끄고, 끝나면 되돌리되 그 사이 다른 코드가 켠 값은 덮어쓰지 않습니다.",
        "A reduction of draggingChanged and releaseOrbit inside createStudioHybridDccTransformRuntime. The camera must not spin with the same drag, so it is switched off, then restored afterwards without overwriting a value another piece of code enabled in between.",
      ),
      source: `${CREATOR}/hybrid-dcc/studio-hybrid-dcc-transform-runtime.ts`,
      verify: "types",
    },
    {
      kind: "teaching",
      title: t("카메라 평면과 레이의 교점으로 3D 끌기 목표 구하기", "Finding a 3D drag target from the ray and a camera-facing plane"),
      language: "ts",
      code: `import { Plane, Ray, Vector3 } from "three";

/** 카메라가 보는 방향을 법선으로 하는 평면 위에서 레이 교점을 구해 3D 드래그 목표점을 얻는다. */
export function dragTarget(ray: Ray, cameraDir: Vector3, anchor: Vector3, out = new Vector3()): Vector3 | null {
  const plane = new Plane().setFromNormalAndCoplanarPoint(cameraDir, anchor);
  const hit = ray.intersectPlane(plane, out); // 평행이면 null
  return hit && Number.isFinite(hit.x + hit.y + hit.z) ? hit : null; // 비유한 값은 버린다
}`,
      codeEn: `import { Plane, Ray, Vector3 } from "three";

/** Intersect the ray with a plane whose normal is the camera direction to get a 3D drag target. */
export function dragTarget(ray: Ray, cameraDir: Vector3, anchor: Vector3, out = new Vector3()): Vector3 | null {
  const plane = new Plane().setFromNormalAndCoplanarPoint(cameraDir, anchor);
  const hit = ray.intersectPlane(plane, out); // null when the ray is parallel
  return hit && Number.isFinite(hit.x + hit.y + hit.z) ? hit : null; // discard non-finite values
}`,
      explain: t(
        "3D 에서 '마우스로 끌기'는 화면 점 → 레이 → 가상 드래그 평면과의 교점입니다. 평면을 카메라 정면으로 잡으면 물체가 화면에서 손을 따라옵니다. 손 마커가 쓰는 방식과 같은 아이디어입니다.",
        "Dragging with the mouse in 3D means a screen point, then a ray, then its intersection with a virtual drag plane. A camera-facing plane makes the object follow your hand on screen, the same idea the hand marker uses.",
      ),
      verify: "types",
    },
  ],
  links: [
    {
      title: "three.js docs · TransformControls",
      url: "https://threejs.org/docs/pages/TransformControls.html",
      kind: "docs",
      note: t("이동·회전·크기 기즈모와 이벤트", "The move, rotate and scale gizmo and its events"),
    },
    {
      title: "three.js examples · misc_controls_transform",
      url: "https://threejs.org/examples/#misc_controls_transform",
      kind: "docs",
      note: t("공식 예제: dragging-changed 에서 orbit.enabled 를 끔", "Official example: turning orbit off on dragging-changed"),
    },
    {
      title: "three.js docs · Ray.intersectPlane",
      url: "https://threejs.org/docs/pages/Ray.html#intersectPlane",
      kind: "docs",
    },
    {
      title: "React Three Fiber · Events",
      url: "https://r3f.docs.pmnd.rs/api/events",
      kind: "docs",
      note: t("3D 객체의 포인터 이벤트와 event.ray", "Pointer events on 3D objects and event.ray"),
    },
    {
      title: "drei · TransformControls",
      url: "https://drei.docs.pmnd.rs/gizmos/transform-controls",
      kind: "docs",
    },
  ],
  chapterIds: ["web-3d-engine"],
  talk: {
    pitch: t(
      "3D 장면에서 물체를 화살표 손잡이로 끌어 옮길 수 있습니다. 끄는 동안에는 카메라가 같이 돌지 않도록 카메라 조작을 잠시 끄고, 놓을 때 값이 달라졌으면 문서에 변경을 한 번 요청합니다. Esc 나 창 전환으로 취소하면 원래 자세와 카메라를 되돌리고 편집 기록은 남기지 않습니다. 실제 위치는 언제나 문서가 정하고 화면의 임시 자세는 되돌립니다.",
      "In the 3D scene you can drag an object by its arrow handles. While dragging, camera control is switched off so the camera does not spin with it, and on release a single change request goes to the document if the values changed. Cancelling with Esc or a window switch restores the original pose and camera and leaves no edit history. The document always decides the real position and the temporary on-screen pose is reset.",
    ),
    analogy: t(
      "무대에서 소품을 옮기는 동안 조명 기사가 카메라 팬을 잠시 멈추는 것과 같습니다. 끝나면 원래 상태로 돌려놓습니다.",
      "Like a stagehand pausing the camera pan while a prop is moved, then putting the camera back as it was.",
    ),
    questions: [
      {
        question: t("여러 물체를 한꺼번에 변환할 수 있나요?", "Can several objects be transformed at once?"),
        answer: t(
          "3D 배경 편집기는 여러 개를 고르면 첫 선택의 변환 변화량을 나머지에 적용합니다. 정밀 3D 작업대(하이브리드 DCC)는 설계 문서가 '다중 오브젝트 동시 변환'을 미구현으로 명시합니다. 둘을 섞어 말하지 마세요.",
          "The 3D background editor applies the first selection's transform change to the rest when several are selected. The precision 3D workbench (hybrid DCC) is documented as not yet supporting simultaneous multi-object transforms. Do not mix the two up.",
        ),
      },
      {
        question: t("취소해도 되돌리기(Undo) 기록이 늘지 않나요?", "Does cancelling still add to the undo history?"),
        answer: t(
          "아니요. 취소와 무변경은 편집 기록을 추가하지 않도록 만들어져 있고, 런타임 테스트가 이를 시험합니다.",
          "No. Cancels and no-change drags are built not to add edit history, and the runtime tests exercise that.",
        ),
      },
      {
        question: t("스크린리더를 쓰는 사람은 3D 를 어떻게 조작하나요?", "How does a screen-reader user work in 3D?"),
        answer: t(
          "WebGL 기즈모는 스크린리더가 읽을 수 없어서 모드 버튼(DOM)과 정밀 수치 입력 도구로 보완합니다. VRM 관절은 DOM 버튼 오버레이로 올려 화살표 키 조작을 지원합니다. 3D 장면 자체의 대체 텍스트는 없다는 한계도 함께 말합니다.",
          "A WebGL gizmo cannot be read by screen readers, so DOM mode buttons and precision numeric input fill in, and VRM joints are lifted into a DOM button overlay that supports arrow-key control. The 3D scene itself has no text alternative, which is a limit worth stating.",
        ),
      },
    ],
    pitfall: t(
      "'3D 에서도 키보드로 모든 조작이 된다'고 말하지 마세요. 기즈모 끌기 자체는 포인터 조작이고 대체 수단(모드 버튼·수치 입력)의 키보드 동작은 일부만 확인했습니다(미확인). 손 마커는 손 IK 가 켜졌을 때 손에만 있어 팔·다리 전체를 끄는 기능이 아닙니다. 실제 브라우저·기기별 3D 입력 검증은 확인하지 못했습니다(미확인).",
      "Do not say everything in 3D works by keyboard. Dragging a gizmo is pointer interaction, and the keyboard behaviour of the substitutes (mode buttons, numeric input) was only partly checked (unconfirmed). The hand markers exist only for the hands when hand IK is on, so this is not a way to drag every arm and leg. Verification of 3D input across real browsers and devices was not found (unconfirmed).",
    ),
  },
  technologies: ["Three.js", "React Three Fiber", "Drei", "@pixiv/three-vrm"],
  facts: [
    {
      value: "5",
      label: t(
        "기즈모 제스처를 취소하는 신호 수(Esc, 창 blur, pointercancel, 탭 숨김, webglcontextlost)",
        "Signals that cancel a gizmo gesture (Esc, window blur, pointercancel, hidden tab, webglcontextlost)",
      ),
      source: `${CREATOR}/hybrid-dcc/StudioHybridDccTransformGizmo.tsx`,
    },
    {
      value: "0.024 - 0.065",
      label: t("손 마커 크기 범위(카메라 거리 × 0.011 을 이 범위로 제한)", "Hand marker scale range (camera distance × 0.011, clamped to this range)"),
      source: `${CREATOR}/vrm/StudioVrmPoseBoneOverlay.tsx`,
    },
  ],
  reviewedAt: INTERACTION_REVIEWED_AT,
};

export const ENGINEERING_ATLAS_INTERACTION_CANVAS3D: readonly EngineeringAtlasEntry[] = [
  KONVA_TRANSFORM_SNAP,
  THREE_TRANSFORM_CONTROLS,
];
