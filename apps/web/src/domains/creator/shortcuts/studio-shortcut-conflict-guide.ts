import {
  STUDIO_SHORTCUT_ACTIONS,
  formatStudioShortcutChord,
  listStudioShortcutConflicts,
  normalizeStudioShortcutChordKey,
  type StudioShortcutActionId,
} from "../studio-app-settings";

export interface StudioShortcutContextRule {
  readonly id: string;
  readonly keysLabelKo: string;
  readonly keysLabelEn: string;
  readonly canvasBehaviorKo: string;
  readonly canvasBehaviorEn: string;
  readonly textEditBehaviorKo: string;
  readonly textEditBehaviorEn: string;
  readonly visibleAlternativeKo: string;
  readonly visibleAlternativeEn: string;
  readonly searchAliases: readonly string[];
}

export const STUDIO_SHORTCUT_CONTEXT_RULES: readonly StudioShortcutContextRule[] = [
  {
    id: "single-letter-tools",
    keysLabelKo: "B · E · V · G · P · N · O",
    keysLabelEn: "B · E · V · G · P · N · O",
    canvasBehaviorKo: "펜·지우개·선택·채우기 등 도구로 즉시 전환",
    canvasBehaviorEn: "Switch immediately to Pen, Eraser, Select, Fill, or brush tools",
    textEditBehaviorKo: "대사·글자 본문에 문자로 입력 (도구 전환 안 됨)",
    textEditBehaviorEn: "Typed as characters inside text/balloon (does not switch tools)",
    visibleAlternativeKo: "상단 편집 바 「편집 완료 (⌘Enter)」 클릭 또는 좌측 도구막대 직접 클릭",
    visibleAlternativeEn: "Click 'Finish editing (⌘Enter)' on the top bar or click the left tool rail",
    searchAliases: ["펜", "브러시", "지우개", "선택", "채우기", "텍스트", "말풍선", "단일 키", "글자 입력", "b", "e", "v", "g"],
  },
  {
    id: "space-pan-vs-spacebar",
    keysLabelKo: "Space",
    keysLabelEn: "Space",
    canvasBehaviorKo: "누르고 있는 동안 손바닥 도구로 화면 이동(팬)",
    canvasBehaviorEn: "Hold to pan the canvas temporarily (Hand tool)",
    textEditBehaviorKo: "커서 위치에 공백(띄어쓰기) 입력",
    textEditBehaviorEn: "Inserts a space character at the text caret",
    visibleAlternativeKo: "마우스 가운데 드래그·트랙패드 이동 또는 편집 완료 후 Space 드래그",
    visibleAlternativeEn: "Middle-mouse drag / trackpad pan, or finish text editing first",
    searchAliases: ["스페이스", "띄어쓰기", "손바닥", "캔버스 이동", "화면 이동", "pan", "hand", "space"],
  },
  {
    id: "enter-vs-mod-enter",
    keysLabelKo: "Enter / ⌘Enter",
    keysLabelEn: "Enter / ⌘Enter",
    canvasBehaviorKo: "T 또는 말풍선 더블클릭으로 대사 편집 시작",
    canvasBehaviorEn: "Press T or double-click a balloon/text layer to start editing",
    textEditBehaviorKo: "Enter는 줄바꿈 · ⌘Enter(Ctrl+Enter)는 편집 확정 후 캔버스 복귀",
    textEditBehaviorEn: "Enter inserts a line break · ⌘Enter (Ctrl+Enter) commits and returns to canvas",
    visibleAlternativeKo: "캔버스 상단 「편집 완료」 버튼 클릭 또는 말풍선 바깥 캔버스 클릭",
    visibleAlternativeEn: "Click the visible 'Finish editing' button or click outside the balloon",
    searchAliases: ["엔터", "줄바꿈", "대사 확정", "편집 완료", "말풍선 완료", "enter", "return", "commit"],
  },
  {
    id: "escape-cancel",
    keysLabelKo: "Esc",
    keysLabelEn: "Esc",
    canvasBehaviorKo: "진행 중인 획·크롭·도구 미리보기 취소 및 선택 해제",
    canvasBehaviorEn: "Cancel active stroke/crop/tool preview and clear selection",
    textEditBehaviorKo: "입력 중인 변경을 버리고 편집 전 원래 문장으로 복구(한글 조합 보호)",
    textEditBehaviorEn: "Discard unconfirmed edits and restore original text (IME-safe)",
    visibleAlternativeKo: "캔버스 상단 「취소」 버튼 클릭",
    visibleAlternativeEn: "Click the visible 'Cancel' button on the text edit bar",
    searchAliases: ["취소", "되돌리기", "원복", "이스케이프", "escape", "esc", "cancel"],
  },
  {
    id: "delete-backspace",
    keysLabelKo: "Delete · ⌫",
    keysLabelEn: "Delete · ⌫",
    canvasBehaviorKo: "선택한 레이어·오브젝트 또는 픽셀 선택 영역 삭제",
    canvasBehaviorEn: "Delete selected layer/object or active pixel selection",
    textEditBehaviorKo: "커서 앞·뒤 글자만 삭제 (레이어 자체는 삭제되지 않음)",
    textEditBehaviorEn: "Deletes characters around caret only (never deletes the layer)",
    visibleAlternativeKo: "편집 완료 후 Delete 또는 우측 레이어 패널 삭제 버튼",
    visibleAlternativeEn: "Finish editing first or use the Delete button in the Layers panel",
    searchAliases: ["삭제", "백스페이스", "지우기", "레이어 삭제", "delete", "backspace"],
  },
  {
    id: "brackets-and-Undo-save",
    keysLabelKo: "[ · ] / ⌘Z / ⌘S",
    keysLabelEn: "[ · ] / ⌘Z / ⌘S",
    canvasBehaviorKo: "[·] 브러시 두께 조절 · ⌘Z 원고 실행취소 · ⌘S 임시저장",
    canvasBehaviorEn: "[·] Adjust brush size · ⌘Z Undo canvas step · ⌘S Save draft",
    textEditBehaviorKo: "[·] 괄호 입력 · ⌘Z 입력 문장 내 실행취소 · ⌘S 편집 유지한 채 원고 저장",
    textEditBehaviorEn: "[·] Type brackets · ⌘Z Undo typed text · ⌘S Save draft without leaving text",
    visibleAlternativeKo: "상단 빠른 옵션 바 두께(−/+) · 상단 앱바 「실행취소」·「저장」 버튼",
    visibleAlternativeEn: "Top quick bar width (−/+) · top app bar 'Undo' and 'Save' buttons",
    searchAliases: ["브러시 크기", "대괄호", "실행취소", "저장", "임시저장", "undo", "save", "[", "]"],
  },
] as const;

/**
 * 실제 런타임 키 디스패치 우선순위 (`useStudioHandShortcutController.ts` +
 * `studio-page-shortcut-dispatcher.ts` + `studio-drawing-shortcuts.ts`).
 * 동일한 화음에 두 동작이 바인딩되면 목록 앞쪽 동작이 먼저 `preventDefault() + return`을
 * 수행하므로 뒤쪽 동작은 키보드에서 가려진다.
 */
const DISPATCH_ORDER: readonly StudioShortcutActionId[] = [
  "tool-hand",
  "correct-current-stroke",
  "tool-select",
  "tool-pen",
  "tool-eraser",
  "tool-fill",
  "tool-eyedropper",
  "tool-lasso",
  "tool-pixel",
  "tool-marquee",
  "tool-marquee-circle",
  "tool-transform",
  "tool-crop",
  "tool-comment",
  "tool-blend",
  "tool-wet-mix",
  "tool-dodge-burn",
  "tool-liquify",
  "tool-lettering",
  "tool-zoom",
  "tool-rotate-view",
  "flip-canvas",
  "reset-view",
  "zoom-to-selection",
  "flip-selection-h",
  "flip-selection-v",
  "deselect-pixels",
  "invert-pixels",
  "shortcuts-help",
  "undo",
  "redo",
  "swap-colors",
  "toggle-chrome",
  "quick-hud",
  "toggle-transparent-color",
  "brush-smaller",
  "brush-larger",
  "new-layer",
  "merge-layer-down",
  "duplicate-layer",
  "group-layers",
  "fit-view",
  "actual-size-view",
] as const;

const DISPATCH_RANK = new Map<StudioShortcutActionId, number>(
  DISPATCH_ORDER.map((id, index) => [id, index]),
);

const ACTION_META = new Map(
  STUDIO_SHORTCUT_ACTIONS.map((action) => [action.id, action] as const),
);

const VISIBLE_ALTERNATIVE_BY_ACTION: Readonly<
  Record<StudioShortcutActionId, { readonly ko: string; readonly en: string }>
> = {
  "correct-current-stroke": {
    ko: "상단 명령 바 「현재 스트로크 교정」 버튼 또는 ⌘K 통합 명령 검색",
    en: "Top command bar 'Correct current stroke' button or ⌘K Command Search",
  },
  "tool-select": {
    ko: "좌측 도구막대 「선택」 버튼 클릭",
    en: "Left tool rail 'Select' button",
  },
  "tool-hand": {
    ko: "좌측 도구막대 「화면 이동」 버튼 또는 마우스 가운데 드래그",
    en: "Left tool rail 'Pan' button or middle-mouse drag",
  },
  "tool-pen": {
    ko: "좌측 도구막대 「펜」 버튼 클릭",
    en: "Left tool rail 'Pen' button",
  },
  "tool-pixel": {
    ko: "좌측 도구막대 더보기(⋯) ▸ 「픽셀 펜」 또는 ⌘K 검색",
    en: "Left tool rail More (⋯) ▸ 'Pixel Pen' or ⌘K Search",
  },
  "tool-eraser": {
    ko: "좌측 도구막대 「지우개」 버튼 클릭",
    en: "Left tool rail 'Eraser' button",
  },
  "tool-fill": {
    ko: "좌측 도구막대 「색 채우기」 버튼 클릭",
    en: "Left tool rail 'Fill' button",
  },
  "tool-eyedropper": {
    ko: "좌측 도구막대 「색 가져오기」 버튼 또는 그리기 중 Alt 클릭",
    en: "Left tool rail 'Eyedropper' button or Alt-click while drawing",
  },
  "tool-lasso": {
    ko: "좌측 도구막대 「올가미 선택」 버튼 또는 선택 메뉴",
    en: "Left tool rail 'Lasso' button or Select menu",
  },
  "tool-marquee": {
    ko: "좌측 도구막대 「사각 선택」 버튼 클릭",
    en: "Left tool rail 'Rectangular Marquee' button",
  },
  "tool-marquee-circle": {
    ko: "좌측 도구막대 더보기(⋯) ▸ 「원형 선택」 또는 ⌘K 검색",
    en: "Left tool rail More (⋯) ▸ 'Elliptical Marquee' or ⌘K Search",
  },
  "tool-transform": {
    ko: "편집 메뉴 ▸ 「변형」 또는 선택 요소 핸들 드래그",
    en: "Edit menu ▸ 'Transform' or drag selection handles",
  },
  "tool-crop": {
    ko: "좌측 도구막대 더보기(⋯) ▸ 「자르기」 또는 편집 메뉴",
    en: "Left tool rail More (⋯) ▸ 'Crop' or Edit menu",
  },
  "tool-comment": {
    ko: "상단 앱바 「댓글 검토함」 또는 좌측 도구막대 「위치 댓글」",
    en: "Top bar 'Comments' or left tool rail 'Comment Pin'",
  },
  "tool-blend": {
    ko: "좌측 도구막대 더보기(⋯) ▸ 「색 경계 섞기」 또는 브러시 패널",
    en: "Left tool rail More (⋯) ▸ 'Blend / Smudge' or Brush panel",
  },
  "tool-wet-mix": {
    ko: "좌측 도구막대 더보기(⋯) ▸ 「물감처럼 섞어 칠하기」 또는 ⌘K 검색",
    en: "Left tool rail More (⋯) ▸ 'Wet Mix' or ⌘K Search",
  },
  "tool-dodge-burn": {
    ko: "좌측 도구막대 더보기(⋯) ▸ 「밝게·어둡게 칠하기」 또는 ⌘K 검색",
    en: "Left tool rail More (⋯) ▸ 'Dodge / Burn' or ⌘K Search",
  },
  "tool-liquify": {
    ko: "필터 메뉴 ▸ 「밀어서 모양 바꾸기(리퀴파이)」 또는 ⌘K 검색",
    en: "Filter menu ▸ 'Liquify' or ⌘K Search",
  },
  "tool-lettering": {
    ko: "좌측 도구막대 「텍스트」·상단 「말풍선」 버튼 클릭",
    en: "Left tool rail 'Text' or top bar 'Balloons' button",
  },
  "tool-zoom": {
    ko: "하단 상태 바 배율 컨트롤 또는 ⌘+휠 확대·축소",
    en: "Bottom status bar zoom controls or ⌘+wheel",
  },
  "tool-rotate-view": {
    ko: "보기 메뉴 ▸ 「화면 회전」 또는 하단 상태 바 회전 리셋",
    en: "View menu ▸ 'Rotate View' or status bar rotation control",
  },
  undo: {
    ko: "상단 앱바 「실행취소」 버튼 또는 편집 메뉴 ▸ 실행취소",
    en: "Top app bar 'Undo' button or Edit ▸ Undo",
  },
  redo: {
    ko: "상단 앱바 「다시실행」 버튼 또는 편집 메뉴 ▸ 다시실행",
    en: "Top app bar 'Redo' button or Edit ▸ Redo",
  },
  "deselect-pixels": {
    ko: "선택 메뉴 ▸ 「선택 해제」 또는 ⌘K 통합 명령 검색",
    en: "Select menu ▸ 'Deselect' or ⌘K Command Search",
  },
  "invert-pixels": {
    ko: "선택 메뉴 ▸ 「선택 영역 반전」 또는 ⌘K 통합 명령 검색",
    en: "Select menu ▸ 'Invert Selection' or ⌘K Command Search",
  },
  "toggle-chrome": {
    ko: "상단 앱바 「전체 화면 드로잉」 또는 보기 메뉴 ▸ 캔버스만 보기",
    en: "Top bar 'Immersive Drawing' or View ▸ Canvas Only",
  },
  "quick-hud": {
    ko: "보기 메뉴 ▸ 「빠른 작업 HUD」 또는 ⌘K 통합 명령 검색",
    en: "View menu ▸ 'Quick HUD' or ⌘K Command Search",
  },
  "swap-colors": {
    ko: "색상 패널 「주·보조 색 교체」 스와치 버튼 클릭",
    en: "Color panel 'Swap foreground/background' swatch button",
  },
  "brush-smaller": {
    ko: "상단 빠른 옵션 바 브러시 두께 감소(−) 버튼 또는 슬라이더",
    en: "Top quick bar brush size decrease (−) button or slider",
  },
  "brush-larger": {
    ko: "상단 빠른 옵션 바 브러시 두께 증가(+) 버튼 또는 슬라이더",
    en: "Top quick bar brush size increase (+) button or slider",
  },
  "flip-canvas": {
    ko: "보기 메뉴 ▸ 「캔버스 좌우 반전(보기)」 또는 하단 상태 바",
    en: "View menu ▸ 'Flip Canvas Horizontal' or bottom status bar",
  },
  "reset-view": {
    ko: "보기 메뉴 ▸ 「화면 리셋」 또는 하단 상태 바 배율 리셋",
    en: "View menu ▸ 'Reset View' or status bar zoom reset",
  },
  "zoom-to-selection": {
    ko: "보기 메뉴 ▸ 「선택 영역으로 확대」 또는 ⌘K 검색",
    en: "View menu ▸ 'Zoom to Selection' or ⌘K Search",
  },
  "flip-selection-h": {
    ko: "편집 메뉴 ▸ 변형 ▸ 「가로 반전」 또는 우측 선택 속성 패널 · ⌘K 검색",
    en: "Edit ▸ Transform ▸ 'Flip Horizontal', right Inspector, or ⌘K Search",
  },
  "flip-selection-v": {
    ko: "편집 메뉴 ▸ 변형 ▸ 「세로 반전」 또는 우측 선택 속성 패널 · ⌘K 검색",
    en: "Edit ▸ Transform ▸ 'Flip Vertical', right Inspector, or ⌘K Search",
  },
  "shortcuts-help": {
    ko: "상단 앱바 「?」 단축키 도움말 버튼 또는 도움말 메뉴",
    en: "Top app bar '?' Shortcuts Help button or Help menu",
  },
  "toggle-transparent-color": {
    ko: "색상 패널 「투명색」 토글 또는 좌측 「지우개」 도구 버튼",
    en: "Color panel 'Transparent color' toggle or left 'Eraser' tool",
  },
  "new-layer": {
    ko: "우측 레이어 패널 「+ 새 레이어」 버튼 또는 레이어 메뉴",
    en: "Right Layers panel '+ New Layer' button or Layer menu",
  },
  "merge-layer-down": {
    ko: "우측 레이어 패널 메뉴 ▸ 「아래 레이어와 합치기」",
    en: "Right Layers panel menu ▸ 'Merge Down'",
  },
  "duplicate-layer": {
    ko: "우측 레이어 패널 「복제」 버튼 또는 레이어 메뉴",
    en: "Right Layers panel 'Duplicate' button or Layer menu",
  },
  "group-layers": {
    ko: "우측 레이어 패널 「그룹 만들기」 버튼 또는 레이어 메뉴",
    en: "Right Layers panel 'Group Layers' button or Layer menu",
  },
  "fit-view": {
    ko: "상단 명령 바 「화면 폭 맞춤」 또는 하단 상태 바 맞춤 버튼",
    en: "Top command bar 'Fit to Screen' or status bar Fit button",
  },
  "actual-size-view": {
    ko: "보기 메뉴 ▸ 「100% 원본 보기」 또는 하단 상태 바 100% 버튼",
    en: "View menu ▸ '100% Actual Pixels' or status bar 100% button",
  },
};

export interface StudioShortcutConflictActionDetail {
  readonly actionId: StudioShortcutActionId;
  readonly label: string;
  readonly defaultKeys: string;
  readonly visibleAlternativeKo: string;
  readonly visibleAlternativeEn: string;
  readonly canRestoreDefaultWithoutConflict: boolean;
}

export interface StudioShortcutConflictGroup {
  readonly chordKey: string;
  readonly rawChord: string;
  readonly formattedChord: string;
  readonly winner: StudioShortcutConflictActionDetail;
  readonly shadowed: readonly StudioShortcutConflictActionDetail[];
}

function sortByDispatchPriority(
  ids: readonly StudioShortcutActionId[],
): StudioShortcutActionId[] {
  return [...ids].sort((left, right) => {
    const leftRank = DISPATCH_RANK.get(left) ?? 999;
    const rightRank = DISPATCH_RANK.get(right) ?? 999;
    return leftRank - rightRank;
  });
}

function isChordOccupiedByOtherAction(
  shortcuts: Partial<Record<StudioShortcutActionId, string>> | Record<string, string>,
  candidateChord: string,
  ignoreActionId: StudioShortcutActionId,
): boolean {
  const targetKey = normalizeStudioShortcutChordKey(candidateChord);
  if (!targetKey) return false;
  for (const action of STUDIO_SHORTCUT_ACTIONS) {
    if (action.id === ignoreActionId) continue;
    const raw = shortcuts[action.id];
    if (typeof raw !== "string" || !raw.trim()) continue;
    if (normalizeStudioShortcutChordKey(raw) === targetKey) return true;
  }
  return false;
}

function buildActionDetail(
  actionId: StudioShortcutActionId,
  shortcuts: Partial<Record<StudioShortcutActionId, string>> | Record<string, string>,
): StudioShortcutConflictActionDetail {
  const meta = ACTION_META.get(actionId);
  const defaultKeys = meta?.defaultKeys ?? "";
  const alt = VISIBLE_ALTERNATIVE_BY_ACTION[actionId];
  return {
    actionId,
    label: meta?.label ?? actionId,
    defaultKeys,
    visibleAlternativeKo: alt.ko,
    visibleAlternativeEn: alt.en,
    canRestoreDefaultWithoutConflict:
      Boolean(defaultKeys) && !isChordOccupiedByOtherAction(shortcuts, defaultKeys, actionId),
  };
}

export function resolveStudioShortcutConflictDetails(
  shortcuts: Partial<Record<StudioShortcutActionId, string>> | Record<string, string> | undefined,
): readonly StudioShortcutConflictGroup[] {
  if (!shortcuts) return [];
  const rawConflicts = listStudioShortcutConflicts(shortcuts);
  if (rawConflicts.size === 0) return [];

  const groups: StudioShortcutConflictGroup[] = [];
  for (const [chordKey, actionIds] of rawConflicts) {
    const ordered = sortByDispatchPriority(actionIds);
    const winnerId = ordered[0];
    if (!winnerId || ordered.length < 2) continue;
    const rawChord = String(shortcuts[winnerId] ?? chordKey);
    groups.push({
      chordKey,
      rawChord,
      formattedChord: formatStudioShortcutChord(rawChord),
      winner: buildActionDetail(winnerId, shortcuts),
      shadowed: ordered.slice(1).map((id) => buildActionDetail(id, shortcuts)),
    });
  }
  return groups;
}

export interface StudioShortcutRowConflictStatus {
  readonly role: "winner" | "shadowed";
  readonly formattedChord: string;
  readonly winnerLabel: string;
  readonly peerLabels: readonly string[];
  readonly visibleAlternativeKo: string;
  readonly visibleAlternativeEn: string;
  readonly defaultKeys: string;
  readonly formattedDefaultChord: string;
  readonly canRestoreDefaultWithoutConflict: boolean;
}

export function resolveStudioShortcutRowConflictStatus(
  shortcuts: Partial<Record<StudioShortcutActionId, string>> | Record<string, string> | undefined,
  actionId: StudioShortcutActionId,
): StudioShortcutRowConflictStatus | null {
  if (!shortcuts) return null;
  const groups = resolveStudioShortcutConflictDetails(shortcuts);
  for (const group of groups) {
    const all = [group.winner, ...group.shadowed];
    const match = all.find((item) => item.actionId === actionId);
    if (!match) continue;
    return {
      role: group.winner.actionId === actionId ? "winner" : "shadowed",
      formattedChord: group.formattedChord,
      winnerLabel: group.winner.label,
      peerLabels: all.filter((item) => item.actionId !== actionId).map((item) => item.label),
      visibleAlternativeKo: match.visibleAlternativeKo,
      visibleAlternativeEn: match.visibleAlternativeEn,
      defaultKeys: match.defaultKeys,
      formattedDefaultChord: formatStudioShortcutChord(match.defaultKeys),
      canRestoreDefaultWithoutConflict: match.canRestoreDefaultWithoutConflict,
    };
  }
  return null;
}

/**
 * 충돌 그룹마다 실제 우선 실행되는 동작(`winner`)은 유지하고, 가려진 동작(`shadowed`)은
 * 자신의 기본 단축키가 비어 있으면 기본키로 복원하고 이미 점유돼 있으면 비워(`""`) 중복을 즉시 해소한다.
 */
export function autoResolveStudioShortcutConflicts(
  shortcuts: Record<StudioShortcutActionId, string>,
): Record<StudioShortcutActionId, string> {
  const next: Record<StudioShortcutActionId, string> = { ...shortcuts };
  const groups = resolveStudioShortcutConflictDetails(next);
  for (const group of groups) {
    for (const shadowed of group.shadowed) {
      if (
        shadowed.defaultKeys &&
        !isChordOccupiedByOtherAction(next, shadowed.defaultKeys, shadowed.actionId)
      ) {
        next[shadowed.actionId] = shadowed.defaultKeys;
      } else {
        next[shadowed.actionId] = "";
      }
    }
  }
  return next;
}
