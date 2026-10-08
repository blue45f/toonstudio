import { INTERACTION_REVIEWED_AT, t } from "./engineering-atlas-interaction-kit";

import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/** interaction · 목록 순서 바꾸기 카드: 레이어 패널(끌기 + 의도 계산), 페이지 스트립(끌기 + 키보드). */

const CREATOR = "apps/web/src/domains/creator";

const LAYER_PANEL_REORDER_DND: EngineeringAtlasEntry = {
  id: "layer-panel-reorder-dnd",
  category: "interaction",
  name: "Drag-to-reorder",
  title: t("레이어 순서·그룹을 끌어서 바꾸기", "Reordering and grouping layers by dragging"),
  status: "live",
  tagline: t(
    "끄는 동안에는 놓일 자리(의도)만 계산해 보여 주고, 손을 놓는 순간 문서에는 한 번만 반영합니다.",
    "While dragging it only computes and shows the drop target (the intent); the document changes once, when you let go.",
  ),
  background: [
    t(
      "책장에서 책을 옮길 때 손가락으로 빈자리를 가리켜 보다가, 마음이 정해지면 그때 꽂는 것처럼 동작합니다. 레이어 패널은 끌고 있는 레이어가 다른 행의 위쪽 절반에 있는지 아래쪽 절반에 있는지로 놓을 자리를 정하고 삽입선으로 미리 보여 줍니다. 이 단계에서는 문서를 건드리지 않고, 손을 놓는 순간 한 번만 순서를 바꿉니다.",
      "It works like moving a book on a shelf: you point at the gap with a finger, and only when you are sure do you slide the book in. The layer panel decides the drop target by whether the dragged layer is over the upper or lower half of another row, and previews it with an insertion line. The document is untouched at that stage and changes once, when you let go.",
    ),
    t(
      "행의 위·아래 절반은 대상 앞/뒤 삽입, 그룹 행의 가운데(28%~72%)는 '그룹에 넣기', 그룹 가장자리는 그룹 밖 순서 변경입니다. 레이어를 여럿 선택해 끌면(최대 500개) 묶음이 함께 움직입니다. 순서를 정하는 순수 함수 reorderLayerSelectionToTarget 은 같은 그룹이 반드시 연속이어야 한다는 규칙을 지키고, 결과가 같거나 규칙을 확인할 수 없으면 원본 참조를 돌려줘 불필요한 기록을 만들지 않습니다.",
      "The upper or lower half of a row means insert before or after the target, the middle of a group row (28% to 72%) means move into the group, and a group's edges mean reorder outside it. Dragging several selected layers (up to 500) moves them as one bundle. The pure function reorderLayerSelectionToTarget keeps the rule that a group must stay contiguous, and when the result is unchanged or the rule cannot be confirmed it returns the original reference so no needless record is created.",
    ),
    t(
      "대안은 dnd-kit 같은 정렬 라이브러리나 Pointer Events 직접 구현인데, 이 저장소에는 DnD 라이브러리가 없습니다. 레이어 패널이 표준 끌어 놓기를 고른 이유를 직접 비교한 문서는 찾지 못했고, 설계 문서가 밝힌 원칙은 두 가지입니다. 한 번의 드롭은 한 번의 문서 커밋이라는 것, 그리고 행 전체가 아니라 전용 핸들만 draggable 로 두어 표시·잠금·불투명도 버튼과 부딪히지 않게 한다는 것입니다.",
      "The alternatives are a sortable library such as dnd-kit or a hand-written Pointer Events version, but this repository has no drag-and-drop library. I found no document comparing why the layer panel uses standard drag and drop; the design note states two principles: one drop is one document commit, and only a dedicated handle is draggable, not the whole row, so it does not clash with the visibility, lock and opacity controls.",
    ),
    t(
      "한계: 검색·필터 중이거나 읽기 전용이거나 다른 참가자가 편집 중인 레이어는 끌기를 막습니다(필터가 전체 순서를 숨기기 때문). 핸들은 정밀 포인터(마우스)에서만 보이고 터치에는 맨 앞/뒤 일괄 버튼이 있습니다. 데이터 모델이 평면 그룹이라 중첩 폴더는 지원하지 않고, 실제 캔버스 썸네일 미리보기도 없습니다.",
      "Limits: dragging is blocked while searching or filtering, in read-only mode, or when another participant is editing the layer (a filter hides the full order). The handle appears only for fine pointers (a mouse), and touch has bulk bring-to-front and send-to-back buttons. Groups are flat in the data model, so nested folders are not supported, and there are no real canvas thumbnails.",
    ),
  ],
  keyPoints: [
    t("끄는 동안은 의도만 계산하고, 놓을 때 한 번만 커밋", "Compute only the intent while dragging; commit once on drop"),
    t("행 위·아래 절반은 순서, 그룹 가운데 28~72%는 소속 변경", "Row halves set order; the middle 28% to 72% of a group sets membership"),
    t("전용 핸들만 draggable, 키보드·버튼 대체 경로를 함께 둠", "Only a dedicated handle drags; keyboard and button paths exist too"),
  ],
  diagram: {
    id: "layer-panel-reorder-dnd-diagram",
    kind: "graph",
    title: t("레이어를 끌어 놓는 흐름", "How a layer drag flows"),
    caption: t(
      "미리보기는 의도만, 문서 변경은 놓는 순간 한 번만: 두 단계를 나눕니다.",
      "Preview shows only the intent and the document changes once on drop: two separate phases.",
    ),
    alt: t(
      "레이어 행의 핸들을 끌기 시작하면 필터 중인지, 읽기 전용인지, 다른 참가자가 편집 중인지를 먼저 확인하고 막히면 끌기를 취소해 이유를 알립니다. 허용되면 dragover 마다 순수 함수가 의도를 계산해 삽입선과 그룹 강조만 보여 주고 문서는 바꾸지 않습니다. 손을 놓으면 마지막 의도로 onAction 을 한 번 보내 기존 레이어 작업 경로가 문서를 커밋하고, 결과를 aria-live 문구로 알립니다.",
      "When a layer row's handle starts to drag, the panel first checks whether a filter is active, the panel is read-only or another participant is editing; if so, the drag is cancelled with a reason. Otherwise, on every dragover a pure function computes the intent and only the insertion line and group highlight are shown, with no document change. On release, one onAction call with the last intent lets the existing layer-operation path commit the document, and the result is announced through aria-live text.",
    ),
    nodes: [
      { id: "handle", label: t("핸들 끌기", "Drag the handle"), sub: t("24px · 정밀 포인터용", "24 px; fine pointers"), tone: "local", shape: "pill", at: [0, 1] },
      { id: "gate", label: t("끌어도 되나?", "Allowed to drag?"), sub: t("잠금·필터 확인", "Checks locks"), tone: "neutral", shape: "diamond", at: [1, 1] },
      { id: "cancel", label: t("끌기 취소", "Cancel the drag"), sub: t("preventDefault + 안내", "preventDefault + notice"), tone: "warn", at: [1, 2] },
      { id: "intent", label: t("의도 계산", "Compute intent"), sub: t("dragover 마다 계산", "Runs on each dragover"), tone: "local", at: [2, 1] },
      { id: "mark", label: t("삽입선·그룹 강조", "Insertion line"), sub: t("보여 주기만, 문서 무변경", "Display only; no change"), tone: "local", at: [2, 0] },
      { id: "drop", label: t("놓기 (drop)", "Release (drop)"), sub: t("마지막 의도를 확정", "Confirms the last intent"), tone: "neutral", at: [3, 1] },
      { id: "action", label: t("onAction 한 번", "One onAction call"), sub: t("drop-items · assign-items", "drop-items, assign-items"), tone: "local", at: [4, 1] },
      { id: "commit", label: t("문서 커밋", "Document commit"), sub: t("기존 레이어 작업 경로", "Existing layer-ops path"), tone: "server", at: [5, 1] },
      { id: "say", label: t("결과 안내", "Announce result"), sub: t("aria-live 문구", "aria-live text"), tone: "good", at: [4, 0] },
    ],
    edges: [
      { from: "handle", to: "gate", label: t("dragstart", "dragstart") },
      { from: "gate", to: "intent", label: t("허용", "allow") },
      { from: "gate", to: "cancel", label: t("거절", "deny") },
      { from: "intent", to: "mark", style: "dashed", label: t("표시", "preview") },
      { from: "intent", to: "drop", label: t("손 놓음", "release") },
      { from: "drop", to: "action", label: t("확정", "confirm") },
      { from: "action", to: "commit", label: t("1회", "once") },
      { from: "action", to: "say", style: "dashed", label: t("알림", "announce") },
    ],
    groups: [
      { id: "preview", label: t("드래그 중 · 문서 무변경", "While dragging: no change"), nodeIds: ["intent", "mark"], tone: "local" },
      { id: "commit-phase", label: t("놓는 순간 · 한 번", "On drop: once"), nodeIds: ["drop", "action", "commit", "say"], tone: "server" },
    ],
  },
  usage: [
    {
      feature: t("스튜디오 편집기 · 레이어 패널 끌어 순서 바꾸기", "Studio editor · reordering layers in the layer panel"),
      role: t(
        "24px 핸들만 draggable 로 두고, 선택한 레이어(최대 500개)를 한 묶음으로 끕니다. dragover 마다 삽입선과 그룹 강조(의도)만 갱신하며, 타인이 편집 중이면 끌기를 막고 이유를 알립니다.",
        "Only the 24 px handle is draggable, and the selected layers (up to 500) are dragged as one bundle. Each dragover updates only the insertion line and group highlight (the intent), and if someone else is editing, the drag is blocked with a reason.",
      ),
      paths: [
        `${CREATOR}/layer/StudioLayerNavigator.tsx#beginItemLayerDrag`,
        `${CREATOR}/layer/StudioLayerNavigatorItemRow.tsx`,
        `${CREATOR}/layer/StudioLayerNavigatorTree.tsx`,
      ],
      route: "/studio",
    },
    {
      feature: t("드롭 의도 계산 (순수 함수)", "Drop-intent calculation (pure functions)"),
      role: t(
        "행의 위/아래 절반, 그룹 행 가운데 28%~72%, 같은 그룹·다른 그룹·혼합 선택 같은 규칙을 DOM 없이 테스트할 수 있는 함수로 분리했습니다.",
        "Rules such as the upper or lower half of a row, the middle 28% to 72% of a group row, and same-group, other-group or mixed selections live in functions that can be tested without a DOM.",
      ),
      paths: [
        `${CREATOR}/layer/studio-layer-drag.ts#resolveStudioLayerGroupDropIntent`,
        `${CREATOR}/layer/studio-layer-drag.test.ts`,
      ],
    },
    {
      feature: t("한 번의 드롭 = 한 번의 변경", "One drop is one change"),
      role: t(
        "drop 에서 onAction 을 한 번 보내면 레이어 작업 처리부가 평탄 배열에서 같은 그룹이 연속이라는 규칙을 지키며 순서를 바꾸고, 바뀐 것이 있을 때만 commit 합니다.",
        "On drop, a single onAction call lets the layer-operations code reorder the flat array while keeping each group contiguous, and it commits only when something actually changed.",
      ),
      paths: [
        `${CREATOR}/studio-layers.ts#reorderLayerSelectionToTarget`,
        `${CREATOR}/layer/studio-layer-operations.ts`,
      ],
    },
    {
      feature: t("끌지 않는 경로 · 키보드와 일괄 버튼", "Paths without dragging · keyboard and batch buttons"),
      role: t(
        "Alt+↑/↓, Shift+Alt+↑/↓, ⌘/Ctrl+[ ] 로 같은 순서 변경을 하고, 선택 일괄 맨 앞/뒤 버튼은 터치에서도 보입니다. 결과는 aria-live 영역으로 알립니다.",
        "Alt+Up/Down, Shift+Alt+Up/Down and Cmd/Ctrl+[ ] do the same reordering, and the batch bring-to-front and send-to-back buttons are visible on touch too. Results are announced through an aria-live region.",
      ),
      paths: [
        `${CREATOR}/layer/StudioLayerNavigator.tsx#layerOrderShortcutDirection`,
        `${CREATOR}/layer/StudioLayerNavigatorBatchBar.tsx`,
      ],
    },
  ],
  samples: [
    {
      kind: "teaching",
      title: t("앞/뒤 절반으로 슬롯 정하고, 제거 후 삽입으로 옮기기", "Pick a slot by half, then move with remove-then-insert"),
      language: "ts",
      code: `export type Side = "before" | "after";

/** 포인터가 행의 위/아래 절반 어디인지로 삽입 방향을 정한다. */
export function dropSide(clientY: number, rect: { top: number; height: number }): Side {
  return clientY < rect.top + Math.max(1, rect.height) / 2 ? "before" : "after";
}

/** 제거 후 삽입 의미의 reorder. slot 은 "카드 사이 틈" 인덱스(0..length). */
export function reorder<T>(list: readonly T[], from: number, slot: number): T[] {
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(slot > from ? slot - 1 : slot, 0, moved as T); // 하나 빠진 만큼 보정
  return next;
}
// reorder(["a", "b", "c"], 0, 3) → ["b", "c", "a"]`,
      codeEn: `export type Side = "before" | "after";

/** The pointer's upper or lower half of the row decides the insert side. */
export function dropSide(clientY: number, rect: { top: number; height: number }): Side {
  return clientY < rect.top + Math.max(1, rect.height) / 2 ? "before" : "after";
}

/** Remove-then-insert reorder. slot is the "gap between cards" index (0..length). */
export function reorder<T>(list: readonly T[], from: number, slot: number): T[] {
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(slot > from ? slot - 1 : slot, 0, moved as T); // adjust for the removed item
  return next;
}
// reorder(["a", "b", "c"], 0, 3) → ["b", "c", "a"]`,
      explain: t(
        "드롭 위치를 '요소 사이의 틈(슬롯)'으로 생각하면 계산이 쉬워집니다. 앞에서 하나를 빼면 뒤쪽 슬롯 번호가 하나 당겨지므로 slot > from 일 때 1을 뺍니다.",
        "Thinking of the drop position as a gap between elements (a slot) keeps the math simple. Removing an item shifts later slots down by one, so subtract 1 when slot > from.",
      ),
      verify: "types",
    },
    {
      kind: "simplified",
      title: t("그룹 행 위의 드롭 의도: 가운데는 소속, 가장자리는 순서", "Drop intent on a group row: middle sets membership, edges set order"),
      language: "ts",
      code: `type Payload =
  | { kind: "items"; sourceGroupId: string | null | "mixed" }
  | { kind: "group"; groupId: string };
type Intent =
  | { kind: "into-group"; groupId: string } // 그룹 안으로 넣기
  | { kind: "around"; targetId: string; side: "front" | "back" }; // 대상 앞·뒤에 놓기

/** 그룹 행 위에서의 드롭 의도. 문서는 건드리지 않고 의도만 돌려준다. */
export function groupRowIntent(p: Payload, groupId: string, firstChildId: string | null, relativeY: number): Intent | null {
  const y = Math.max(0, Math.min(1, relativeY));
  if (p.kind === "group" && p.groupId === groupId) return null; // 자기 자신 위
  const center = y >= 0.28 && y <= 0.72; // 행 가운데 구간
  if (p.kind === "items" && p.sourceGroupId !== "mixed" && p.sourceGroupId !== groupId && center) {
    return { kind: "into-group", groupId }; // 가운데: 소속 변경
  }
  if (firstChildId === null) return null;
  if (p.kind === "items" && p.sourceGroupId === groupId) return null; // 이미 이 그룹 안
  return { kind: "around", targetId: firstChildId, side: y < 0.5 ? "front" : "back" }; // 가장자리: 순서
}`,
      codeEn: `type Payload =
  | { kind: "items"; sourceGroupId: string | null | "mixed" }
  | { kind: "group"; groupId: string };
type Intent =
  | { kind: "into-group"; groupId: string } // move into the group
  | { kind: "around"; targetId: string; side: "front" | "back" }; // place before or after the target

/** Drop intent over a group row. It leaves the document alone and only returns the intent. */
export function groupRowIntent(p: Payload, groupId: string, firstChildId: string | null, relativeY: number): Intent | null {
  const y = Math.max(0, Math.min(1, relativeY));
  if (p.kind === "group" && p.groupId === groupId) return null; // dropped on itself
  const center = y >= 0.28 && y <= 0.72; // the middle band of the row
  if (p.kind === "items" && p.sourceGroupId !== "mixed" && p.sourceGroupId !== groupId && center) {
    return { kind: "into-group", groupId }; // middle: change membership
  }
  if (firstChildId === null) return null;
  if (p.kind === "items" && p.sourceGroupId === groupId) return null; // already in this group
  return { kind: "around", targetId: firstChildId, side: y < 0.5 ? "front" : "back" }; // edges: change order
}`,
      explain: t(
        "실제 resolveStudioLayerGroupDropIntent 의 뼈대만 남긴 것입니다(내부 mode 구분 units·to-root 는 생략). 같은 입력이면 같은 의도가 나오는 순수 함수라서 DOM 없이 테스트할 수 있습니다.",
        "This keeps only the skeleton of the real resolveStudioLayerGroupDropIntent (the internal units and to-root modes are omitted). It is a pure function, so it can be tested without a DOM.",
      ),
      source: `${CREATOR}/layer/studio-layer-drag.ts`,
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
      title: "MDN · Drag operations",
      url: "https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/Drag_operations",
      kind: "docs",
      note: t("dragstart ~ dragend 이벤트 순서와 효과", "Event order from dragstart to dragend, and effects"),
    },
    {
      title: "W3C · Understanding SC 2.5.7 Dragging Movements",
      url: "https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html",
      kind: "guide",
      note: t("끌기 기능에 끌지 않는 대안을 요구하는 접근성 기준", "The accessibility criterion that asks for a non-dragging alternative"),
    },
  ],
  chapterIds: ["brush-engine", "quality"],
  talk: {
    pitch: t(
      "레이어 패널에서 레이어를 끌면 놓일 자리가 삽입선으로 미리 보이고, 손을 놓는 순간 한 번만 순서가 바뀝니다. 끄는 동안에는 문서를 건드리지 않고 '여기에 놓으면 이렇게 된다'는 계획만 계산하기 때문에 변경 기록과 자동 저장이 드래그 중에 쌓이지 않습니다. 키보드와 버튼으로도 같은 일을 할 수 있어 끌기가 어려운 환경에서도 쓸 수 있습니다.",
      "Drag a layer in the layer panel and the drop target appears as an insertion line; the order changes once, the moment you let go. While dragging, the document is untouched and only a plan of what would happen is computed, so change history and autosave do not pile up during a drag. Keyboard shortcuts and buttons do the same job, so it also works where dragging is hard.",
    ),
    analogy: t(
      "책꽂이에서 책을 옮길 때 빈자리를 손가락으로 가리켜 보다가, 마음이 정해지면 그때 꽂는 것과 같습니다.",
      "Like pointing a finger at a gap on a bookshelf and only sliding the book in once you have decided.",
    ),
    questions: [
      {
        question: t("왜 dragover 에서 바로 순서를 바꾸지 않나요?", "Why not change the order directly during dragover?"),
        answer: t(
          "미리보기마다 문서를 바꾸면 변경 기록과 자동 저장이 드래그 중에 쌓입니다. 설계 문서는 '한 드롭은 한 번의 문서 커밋'을 원칙으로 두었고, 미리보기는 의도(삽입선·강조)만 갱신합니다.",
          "Changing the document on every preview would pile up change history and autosaves during the drag. The design note makes one drop one document commit, and the preview updates only the intent (the line and highlight).",
        ),
      },
      {
        question: t("터치에서는 어떻게 하나요?", "How does this work on touch devices?"),
        answer: t(
          "핸들은 정밀 포인터(마우스)에서만 보입니다. 터치에서는 선택 레이어의 맨 앞/뒤 버튼과 작업 메뉴를 씁니다. 터치 끌기의 브라우저 편차를 억지로 숨기지 않고 별도 명령 경로를 둔 것이 설계 결정입니다.",
          "The handle appears only for fine pointers (a mouse). On touch you use the bring-to-front and send-to-back buttons and the action menu. The design decision is to keep a separate command path rather than hide browser differences in touch dragging.",
        ),
      },
      {
        question: t("중첩 폴더도 되나요?", "Are nested folders supported?"),
        answer: t(
          "아니요. 현재 데이터 모델은 평면 그룹이고 중첩 폴더는 설계 문서가 의도적으로 제외했습니다. 실제 캔버스 썸네일 미리보기와 복제도 이 변경에 넣지 않았습니다.",
          "No. The current data model has flat groups, and the design note deliberately leaves nested folders out. Real canvas thumbnails and duplication were also left out of this change.",
        ),
      },
    ],
    pitfall: t(
      "Clip Studio Paint·Krita·ibisPaint 와 같은 동작이라고 말하지 마세요. 설계 문서는 그 제품들의 공개된 작업 개념을 참고했다고만 밝힙니다. 실제 브라우저·터치 기기별 동작은 확인하지 못했습니다(미확인).",
      "Do not say it behaves like Clip Studio Paint, Krita or ibisPaint; the design note says only that it drew on their publicly known workflow concepts. Behaviour across real browsers and touch devices was not verified.",
    ),
  },
  technologies: ["HTML Drag and Drop", "WAI-ARIA", "React"],
  facts: [
    {
      value: "500",
      label: t("한 번에 끌 수 있는 레이어 수 상한", "Maximum number of layers dragged at once"),
      source: `${CREATOR}/layer/StudioLayerNavigator.tsx`,
    },
    {
      value: "28% - 72%",
      label: t("그룹 행에서 '그룹에 넣기'로 보는 가운데 구간", "Middle band of a group row treated as move into the group"),
      source: `${CREATOR}/layer/studio-layer-drag.ts`,
    },
    {
      value: "24 px (size-6)",
      label: t("레이어 끌기 핸들의 크기", "Size of the layer drag handle"),
      source: `${CREATOR}/layer/StudioLayerNavigatorItemRow.tsx`,
    },
  ],
  reviewedAt: INTERACTION_REVIEWED_AT,
};

const PAGE_STRIP_KEYBOARD_REORDER: EngineeringAtlasEntry = {
  id: "page-strip-keyboard-reorder",
  category: "interaction",
  name: "Keyboard reorder",
  title: t("페이지 순서를 끌어서도, 키보드로도 바꾸기", "Reordering pages by dragging or by keyboard"),
  status: "live",
  tagline: t(
    "페이지 스트립은 끌기와 Alt+←/→ 가 같은 이동 함수를 쓰고, 결과를 말로 알려 주며 포커스를 되돌립니다.",
    "In the page strip, dragging and Alt+Left/Right share one move function, announce the result aloud and restore focus.",
  ),
  background: [
    t(
      "마우스를 쓰기 어려운 사람도, 트랙패드로 정밀하게 끌기 어려운 사람도 있습니다. 웹 접근성 기준 WCAG 2.2 의 2.5.7(끌기 동작)은 끌어서 하는 기능에 끌지 않고 클릭·탭으로 할 수 있는 대안을 요구하고, 2.1.1(키보드)은 키보드로도 할 수 있어야 한다고 요구합니다. 하단 페이지 스트립은 썸네일을 끌어 순서를 바꾸고, 같은 일을 Alt+←/→ 로도 할 수 있습니다.",
      "Some people cannot use a mouse and some cannot drag precisely on a trackpad. WCAG 2.2's 2.5.7 (Dragging Movements) asks for an alternative that needs a click or tap instead of dragging, and 2.1.1 (Keyboard) asks that everything work from a keyboard. The bottom page strip lets you drag a thumbnail to reorder it, and do the same with Alt+Left/Right.",
    ),
    t(
      "썸네일을 끌 때는 카드 안 포인터 위치(왼쪽·오른쪽 절반)로 '카드 사이 틈'(슬롯)을 정하고, 놓을 때 '제거 후 삽입' 인덱스로 바꿉니다. 키보드는 ←/→ 로 초점 이동, Home/End 로 처음·끝, Alt+←/→ 로 한 칸, Shift+Alt+←/→ 로 맨 앞·뒤 이동입니다. 두 입력은 같은 reorderPage 를 거쳐 commitPages 로 문서에 반영되고, 결과('3번 페이지를 2번째로 옮겼어요')는 role=status 영역으로 읽어 줍니다. 포커스는 새 순서가 그려진 뒤에만 되돌립니다.",
      "While dragging a thumbnail, the pointer's position inside the card (left or right half) selects a gap between cards (a slot), which becomes a remove-then-insert index on drop. On the keyboard, Left/Right move focus, Home/End jump to the ends, Alt+Left/Right moves one place and Shift+Alt+Left/Right moves to the very front or back. Both inputs go through the same reorderPage into commitPages, and the result ('moved page 3 to position 2') is read out through a role=status region. Focus is restored only after the new order has rendered.",
    ),
    t(
      "대안은 목록에 위/아래 버튼만 두거나 스트립에 끌기만 두는 것입니다. 이 저장소는 페이지 목록에 ↑/↓/맨 위/맨 아래 버튼과 다중 선택 일괄 이동을 따로 두어 끌지 않는 경로를 보장하고, 스트립에는 PPT 방식의 끌기와 키보드를 더했습니다. 슬롯 계산 순수 함수(computeDropSlot 등)는 세로 목록 훅과 가로 스트립 훅이 함께 씁니다.",
      "The alternatives are putting only up and down buttons on a list, or only dragging on the strip. This repository keeps a non-dragging path in the page list with up, down, to-top and to-bottom buttons plus bulk move for a multi-selection, and adds PowerPoint-style dragging and the keyboard to the strip. The pure slot functions such as computeDropSlot are shared by the vertical list hook and the horizontal strip hook.",
    ),
    t(
      "한계: 스트립은 데스크톱 폭(lg 이상)에서만 보이고, 코드 주석은 끌기를 '마우스·펜' 대상으로 밝힙니다. 터치에서는 페이지 목록의 이동 버튼을 쓰며, 터치로 길게 눌러 끌기는 이 경로에서 확인하지 못했습니다(미확인). 협업 잠금 등에서는 이동 함수를 주지 않아 탐색 전용이 되고, 검색·필터 중인 목록에서는 끌기가 잠깁니다.",
      "Limits: the strip is visible only at desktop widths (lg and up), and a code comment states that dragging targets 'mouse and pen'. On touch you use the page list's move buttons; press-and-hold dragging on touch was not found on this path (unconfirmed). Under a collaboration lock the move function is withheld so the strip becomes navigation-only, and dragging is locked in the page list while searching or filtering.",
    ),
  ],
  keyPoints: [
    t("끌기와 Alt+←/→ 가 같은 이동 함수·같은 커밋 경로를 사용", "Dragging and Alt+Left/Right share one move function and commit path"),
    t("이동 결과를 role=status 로 읽어 주고 포커스를 되돌림", "The result is read via role=status and focus is restored"),
    t("끌기만 있는 기능에 끌지 않는 경로를 함께 둠(WCAG 2.5.7)", "Dragging always has a non-dragging path (WCAG 2.5.7)"),
  ],
  diagram: {
    id: "page-strip-keyboard-reorder-diagram",
    kind: "sequence",
    title: t("키 한 번이 페이지 순서가 되기까지", "From one key press to a new page order"),
    caption: t(
      "끌기와 Alt+방향키는 같은 이동 함수와 커밋 길을 쓰고, 결과는 말로도 알려 줍니다.",
      "Dragging and Alt+arrow keys share one move function and commit path, and the result is also spoken.",
    ),
    alt: t(
      "사용자가 썸네일 버튼에서 Alt+→ 를 누르면 UI 가 키 규칙 순수 함수에 입력을 넘기고, 함수는 이동 또는 초점 이동 같은 행동을 돌려줍니다. UI 는 onReorderPage 로 페이지 관리 컨트롤러에 순서 변경을 요청하고 컨트롤러는 commitPages 로 문서를 바꿉니다. 이어서 이동 결과를 role=status 로 알리고, 새 순서가 그려지면 포커스를 되돌립니다.",
      "When the user presses Alt+Right on a thumbnail button, the UI passes the input to a pure key-rule function, which returns an action such as reorder or focus. The UI asks the page-management controller to reorder through onReorderPage, and the controller changes the document with commitPages. The UI then announces the result through role=status and restores focus once the new order has rendered.",
    ),
    actors: [
      { id: "user", label: t("사용자", "User"), sub: t("키보드 또는 마우스", "Keyboard or mouse"), tone: "neutral" },
      { id: "strip", label: t("페이지 스트립", "Page strip"), sub: t("썸네일 버튼 목록", "Thumbnail buttons"), tone: "local" },
      { id: "rules", label: t("키 규칙", "Key rules"), sub: t("순수 함수", "Pure function"), tone: "neutral" },
      { id: "controller", label: t("페이지 컨트롤러", "Page controller"), sub: t("reorderPage → commitPages", "reorderPage, commitPages"), tone: "server" },
      { id: "reader", label: t("스크린리더", "Screen reader"), sub: t("role=status 안내", "role=status updates"), tone: "good" },
    ],
    messages: [
      { from: "user", to: "strip", label: t("Alt+→ 누름", "Press Alt+Right"), note: t("썸네일 버튼에 초점이 있을 때", "While a thumbnail button has focus") },
      { from: "strip", to: "rules", label: t("키·수정키·rtl·잠금 전달", "Pass key, modifiers, rtl, lock"), note: t("Ctrl/Meta 조합은 건드리지 않음", "Ctrl and Meta combos are left alone") },
      { from: "rules", to: "strip", style: "dashed", label: t("reorder → 새 자리", "reorder, new position"), note: t("끝이면 edge: 키만 소비", "At an end: edge, key consumed only") },
      { from: "strip", to: "controller", label: t("onReorderPage(from, to)", "onReorderPage(from, to)"), note: t("마우스 놓기도 같은 함수", "A mouse drop calls it too") },
      { from: "controller", to: "controller", label: t("commitPages 로 커밋", "Commit via commitPages"), note: t("문서 변경은 이 한 길", "The one path that changes the document") },
      { from: "strip", to: "reader", label: t("이동 결과 문구", "Move result text"), note: t("'3번 페이지를 2번째로 옮겼어요'", "'Moved page 3 to position 2'") },
      { from: "controller", to: "strip", style: "dashed", label: t("새 순서 렌더", "New order rendered") },
      { from: "strip", to: "strip", label: t("포커스 복구", "Restore focus"), note: t("그려진 뒤에만, 1초 안에", "Only after render, within 1 s") },
    ],
  },
  usage: [
    {
      feature: t("스튜디오 편집기 · 하단 페이지 스트립", "Studio editor · bottom page strip"),
      role: t(
        "각 썸네일 버튼에 aria-keyshortcuts 로 키 조합을 선언하고, ←/→·Home/End 로 초점 이동, Alt+←/→ 로 순서 변경을 합니다. 결과는 role=status 로 읽어 주고, 새 순서가 그려진 뒤 포커스를 되돌립니다.",
        "Each thumbnail button declares its key combinations with aria-keyshortcuts; Left/Right and Home/End move focus and Alt+Left/Right changes the order. The result is read out through role=status and focus returns once the new order has rendered.",
      ),
      paths: [
        `${CREATOR}/StudioPageSequenceStrip.tsx`,
        `${CREATOR}/page/studio-page-strip-keyboard.ts#resolveStudioPageStripKeyAction`,
      ],
      route: "/studio",
    },
    {
      feature: t("페이지 스트립 · 끌어서 순서 변경", "Page strip · drag to reorder"),
      role: t(
        "썸네일을 끌면 가로 위치 절반으로 슬롯을 정해 삽입선을 보이고, 놓을 때 제거 후 삽입 인덱스로 바꿔 onReorder 를 부릅니다. Firefox 는 text 데이터가 없으면 끌기를 시작하지 않아 text/plain 도 함께 씁니다.",
        "Dragging a thumbnail picks a slot from the horizontal half, shows an insertion line, and on drop converts it to a remove-then-insert index and calls onReorder. Firefox does not start a drag without text data, so text/plain is written as well.",
      ),
      paths: [
        `${CREATOR}/page/studio-page-strip-dnd.ts`,
        `${CREATOR}/studio-page-dnd.ts#computeDropSlot`,
      ],
    },
    {
      feature: t("페이지 목록 · 끌지 않는 경로", "Page list · paths without dragging"),
      role: t(
        "↑/↓/맨 위/맨 아래 버튼과 다중 선택 일괄 이동으로 끌지 않고도 순서를 바꿉니다. 검색·필터 중에는 끌기를 잠가 일부만 보이는 목록에서 순서가 꼬이지 않게 합니다.",
        "Up, down, to-top and to-bottom buttons and bulk move for a multi-selection reorder pages without dragging. Dragging is locked while searching or filtering so a partially visible list cannot be mis-ordered.",
      ),
      paths: [
        `${CREATOR}/StudioPageListPaneBase.tsx`,
        `${CREATOR}/page/studio-page-management-controller.ts#reorderPage`,
      ],
    },
    {
      feature: t("협업 잠금 · 이동 전용으로 낮추기", "Collaboration lock · degrade to navigation only"),
      role: t(
        "문서가 잠긴 상태에서는 onReorderPage 를 주지 않아 끌기와 Alt 조합이 모두 꺼지고 탐색만 남습니다.",
        "While the document is locked, onReorderPage is not provided, so dragging and the Alt combinations both switch off and only navigation remains.",
      ),
      paths: [
        `${CREATOR}/canvas/StudioCanvasModalsOverlay.tsx`,
        `${CREATOR}/page/StudioPageSequenceStrip.reorder.test.tsx`,
      ],
    },
  ],
  samples: [
    {
      kind: "teaching",
      title: t("Alt+←/→ 로 한 칸 옮기고 안내 문구 만들기", "Move one place with Alt+Left/Right and build the announcement"),
      language: "ts",
      code: `export interface Moved<T> {
  readonly list: T[];
  readonly message: string; // role="status" aria-live="polite" 영역에 넣는다
}

/** Alt+←/→ 로 한 칸 이동하고, 스크린리더용 안내 문구까지 만든다. */
export function moveByKey<T>(list: readonly T[], index: number, e: KeyboardEvent): Moved<T> | null {
  if (!e.altKey || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return null;
  const to = index + (e.key === "ArrowRight" ? 1 : -1);
  if (to < 0 || to >= list.length) return null; // 끝: 키는 소비하되 변경 없음
  const next = [...list];
  const [item] = next.splice(index, 1);
  next.splice(to, 0, item as T);
  return { list: next, message: \`\${index + 1}번째 항목을 \${to + 1}번째로 옮겼어요. 전체 \${list.length}개.\` };
}`,
      codeEn: `export interface Moved<T> {
  readonly list: T[];
  readonly message: string; // put it in a role="status" aria-live="polite" region
}

/** Move one place with Alt+Left/Right and build the screen-reader announcement too. */
export function moveByKey<T>(list: readonly T[], index: number, e: KeyboardEvent): Moved<T> | null {
  if (!e.altKey || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return null;
  const to = index + (e.key === "ArrowRight" ? 1 : -1);
  if (to < 0 || to >= list.length) return null; // at an end: swallow the key, change nothing
  const next = [...list];
  const [item] = next.splice(index, 1);
  next.splice(to, 0, item as T);
  return { list: next, message: \`Moved item \${index + 1} to position \${to + 1} of \${list.length}.\` };
}`,
      explain: t(
        "키 입력을 '다음 목록'과 '읽어 줄 문장'으로 바꾸는 순수 함수입니다. 문장은 aria-live 영역에 넣으면 스크린리더가 이동 결과를 읽어 줍니다.",
        "A pure function that turns a key press into the next list and a sentence to read aloud. Put the sentence in an aria-live region and a screen reader will speak the move.",
      ),
      verify: "types",
    },
    {
      kind: "simplified",
      title: t("키 규칙을 순수 함수로: 초점 이동·순서 변경·끝", "Key rules as a pure function: focus, reorder, edge"),
      language: "ts",
      code: `type KeyAction =
  | { kind: "focus"; index: number } // 초점만 옮긴다
  | { kind: "reorder"; index: number } // 페이지를 index 자리로 옮긴다
  | { kind: "edge"; edge: "start" | "end" }; // 끝이라 옮길 곳이 없다: 키만 소비

export function stripKeyAction(
  e: { key: string; altKey: boolean; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean },
  index: number,
  count: number,
  rtl: boolean,
  canReorder: boolean,
): KeyAction | null {
  if (e.ctrlKey || e.metaKey || index < 0 || index >= count) return null; // 전역 단축키는 건드리지 않는다
  const horizontal = e.key === "ArrowLeft" || e.key === "ArrowRight";
  const forward = (e.key === "ArrowRight") !== rtl; // 오른쪽→왼쪽 문서에서는 앞뒤가 뒤집힌다
  if (e.altKey) {
    if (!horizontal || !canReorder) return null; // 잠금 중에는 브라우저 기본 동작에 맡긴다
    const target = e.shiftKey ? (forward ? count - 1 : 0) : index + (forward ? 1 : -1);
    if (target < 0 || target >= count || target === index) return { kind: "edge", edge: forward ? "end" : "start" };
    return { kind: "reorder", index: target };
  }
  if (horizontal) return { kind: "focus", index: Math.max(0, Math.min(count - 1, index + (forward ? 1 : -1))) };
  return null;
}`,
      codeEn: `type KeyAction =
  | { kind: "focus"; index: number } // only move focus
  | { kind: "reorder"; index: number } // move the page to position index
  | { kind: "edge"; edge: "start" | "end" }; // already at an end: only swallow the key

export function stripKeyAction(
  e: { key: string; altKey: boolean; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean },
  index: number,
  count: number,
  rtl: boolean,
  canReorder: boolean,
): KeyAction | null {
  if (e.ctrlKey || e.metaKey || index < 0 || index >= count) return null; // leave global shortcuts alone
  const horizontal = e.key === "ArrowLeft" || e.key === "ArrowRight";
  const forward = (e.key === "ArrowRight") !== rtl; // in right-to-left documents forward and back swap
  if (e.altKey) {
    if (!horizontal || !canReorder) return null; // while locked, leave it to the browser default
    const target = e.shiftKey ? (forward ? count - 1 : 0) : index + (forward ? 1 : -1);
    if (target < 0 || target >= count || target === index) return { kind: "edge", edge: forward ? "end" : "start" };
    return { kind: "reorder", index: target };
  }
  if (horizontal) return { kind: "focus", index: Math.max(0, Math.min(count - 1, index + (forward ? 1 : -1))) };
  return null;
}`,
      explain: t(
        "실제 resolveStudioPageStripKeyAction 을 줄인 것입니다(Home/End 처리 생략). 키 해석을 컴포넌트 밖 순수 함수로 두면 rtl·잠금·끝 같은 경계 조건을 DOM 없이 테스트할 수 있습니다.",
        "A trimmed version of the real resolveStudioPageStripKeyAction (Home and End handling omitted). Keeping key interpretation in a pure function outside the component lets edge cases such as rtl, locks and ends be tested without a DOM.",
      ),
      source: `${CREATOR}/page/studio-page-strip-keyboard.ts`,
      verify: "types",
    },
  ],
  links: [
    {
      title: "W3C · Understanding SC 2.5.7 Dragging Movements",
      url: "https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html",
      kind: "guide",
    },
    {
      title: "WAI-ARIA 1.2 · aria-keyshortcuts",
      url: "https://www.w3.org/TR/wai-aria-1.2/#aria-keyshortcuts",
      kind: "spec",
      note: t("키 조합을 보조기기에 선언하는 속성", "The attribute that declares key combinations to assistive technology"),
    },
    {
      title: "MDN · ARIA live regions",
      url: "https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Guides/Live_regions",
      kind: "docs",
      note: t("이동 결과를 읽어 주는 방법", "How to have a result read aloud"),
    },
    {
      title: "WAI-ARIA APG · Developing a Keyboard Interface",
      url: "https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/",
      kind: "guide",
    },
  ],
  chapterIds: ["quality", "brush-engine"],
  talk: {
    pitch: t(
      "페이지 순서는 썸네일을 끌어서 바꿀 수 있고, 같은 일을 키보드 Alt+방향키로도 할 수 있습니다. 두 방법은 같은 함수와 같은 저장 경로를 쓰기 때문에 결과가 같고, 키보드로 옮기면 '3번 페이지를 2번째로 옮겼어요'처럼 스크린리더가 읽어 줍니다. 끌기가 어려운 사람을 위한 대안을 처음부터 같이 만든 사례입니다.",
      "You can reorder pages by dragging a thumbnail, and do the same with Alt plus the arrow keys. Both use the same function and the same save path, so the result is identical, and a keyboard move is read aloud by a screen reader, for example 'moved page 3 to position 2'. It is an example of building the alternative for people who cannot drag at the same time as the drag itself.",
    ),
    analogy: t(
      "엘리베이터에 층 버튼과 음성 안내가 함께 있는 것과 같습니다. 같은 층으로 가지만 누르는 방법과 알려 주는 방법이 여러 가지입니다.",
      "Like an elevator with both floor buttons and a voice announcement: the same destination, with several ways to ask and to be told.",
    ),
    questions: [
      {
        question: t("WCAG 2.5.7 을 만족한다고 말해도 되나요?", "Can we say this meets WCAG 2.5.7?"),
        answer: t(
          "스트립만으로는 그렇게 말하기 어렵습니다. 2.5.7 은 끌지 않고 클릭·탭으로 할 수 있는 방법을 요구하는데 그 역할은 페이지 목록의 ↑/↓ 버튼과 오거나이저 이동 버튼이 하고, 스트립의 Alt+방향키는 키보드 접근(2.1.1) 쪽입니다. 외부 감사나 인증 기록은 확인하지 못했습니다.",
          "Not on the strip alone. 2.5.7 asks for a click or tap alternative to dragging, which the page list's up and down buttons and the organizer's move buttons provide, while the strip's Alt+arrow keys serve keyboard access (2.1.1). I found no record of an external audit or certification.",
        ),
      },
      {
        question: t("모바일(터치)에서는요?", "What about mobile (touch)?"),
        answer: t(
          "스트립은 데스크톱 폭에서만 보이고 코드는 끌기를 마우스·펜 대상으로 밝힙니다. 터치에서는 페이지 목록의 이동 버튼을 쓰며, 길게 눌러 끌기는 구현을 확인하지 못했습니다.",
          "The strip appears only at desktop widths and the code says dragging targets mouse and pen. On touch you use the page list's move buttons, and I could not confirm press-and-hold dragging.",
        ),
      },
      {
        question: t("맨 끝에서 더 옮기면 어떻게 되나요?", "What happens if I move past the end?"),
        answer: t(
          "키는 소비하되 문서를 바꾸지 않고 '이미 맨 앞 페이지예요' 같은 안내만 읽어 줍니다.",
          "The key is consumed without changing the document, and a notice such as 'this page is already first' is read out.",
        ),
      },
    ],
    pitfall: t(
      "'완벽한 접근성'이라고 말하지 마세요. 확인한 것은 키보드 경로, 안내 문구, 포커스 복구와 단위 테스트입니다. 실제 스크린리더(NVDA·VoiceOver 등)로 들어 본 검증은 이 저장소에서 확인하지 못했습니다(미확인).",
      "Do not call it perfectly accessible. What was verified is the keyboard path, the announcement text, focus restoration and unit tests. Verification with real screen readers such as NVDA or VoiceOver was not found in this repository (unconfirmed).",
    ),
  },
  technologies: ["HTML Drag and Drop", "WAI-ARIA", "React"],
  facts: [
    {
      value: "1,000 ms",
      label: t("순서 변경 뒤 포커스 복구를 포기하는 시간", "Time after which a pending focus restore is abandoned"),
      source: `${CREATOR}/StudioPageSequenceStrip.tsx`,
    },
  ],
  reviewedAt: INTERACTION_REVIEWED_AT,
};

export const ENGINEERING_ATLAS_INTERACTION_REORDER: readonly EngineeringAtlasEntry[] = [
  LAYER_PANEL_REORDER_DND,
  PAGE_STRIP_KEYBOARD_REORDER,
];
