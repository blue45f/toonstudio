/**
 * 전 페이지·드로잉 툴 "누르기 전 예측 가능" 리치 액션 프리뷰 사전(28종) 및 순수 매처.
 * 명시적 `data-tooltip-description`·`data-tooltip-outcome`을 최우선 존중하고,
 * 없을 때만 요소 속성·텍스트·경로를 분석해 1줄 예측 안내와 시맨틱 범위 배지를 보강한다.
 */

export type ActionScope = "undoable" | "local-save" | "navigate" | "panel" | "safe-view";
export type ActionPreviewEntry = Readonly<{
  id: string; scope: ActionScope; defaultShortcut?: string; keys: readonly string[];
  hrefPrefixes?: readonly string[]; pattern: RegExp; ko: string; en: string;
}>;
export type ActionPreviewInput = Readonly<{ title?: string; shortcut?: string; korean: boolean }>;
export type PredictableActionPreview = Readonly<{
  id?: string; description?: string; actionScope?: ActionScope;
  actionBadge?: string; reversible: boolean; shortcut?: string;
}>;
type ScopeMeta = Readonly<{ ko: string; en: string; reversible: boolean; badgeClass: string }>;

const ACTION_SCOPE_META: Readonly<Record<ActionScope, ScopeMeta>> = {
  undoable: { ko: "되돌리기 가능 (⌘Z)", en: "Undoable (⌘Z)", reversible: true, badgeClass: "border-accent/40 bg-accent-soft text-accent" },
  "local-save": { ko: "이 기기 저장", en: "Saved locally", reversible: false, badgeClass: "border-success/40 bg-success-soft text-success" },
  navigate: { ko: "화면 이동", en: "Opens page", reversible: false, badgeClass: "border-info/40 bg-info-soft text-info" },
  panel: { ko: "미리보기 열기", en: "Opens panel", reversible: false, badgeClass: "border-line-strong/65 bg-raised/85 text-fg-2" },
  "safe-view": { ko: "원본 유지", en: "Non-destructive", reversible: false, badgeClass: "border-line-strong/65 bg-canvas/85 text-fg-2" },
};

function def(
  id: string, scope: ActionScope, keys: readonly string[], pattern: RegExp,
  ko: string, en: string, extra?: Readonly<{ shortcut?: string; hrefs?: readonly string[] }>,
): ActionPreviewEntry {
  return { id, scope, keys, pattern, ko, en, defaultShortcut: extra?.shortcut, hrefPrefixes: extra?.hrefs };
}

/** 드로잉 툴·레이어·필터·3D·저장/출고·탐색 핵심 동작 28종 사전(구체 매처 우선). */
export const PREDICTABLE_ACTION_CATALOG: readonly ActionPreviewEntry[] = Object.freeze([
  def("redo", "undoable", ["redo", "edit-redo"], /다시\s*실행|다시실행|^다시(?:\s*[·(/]|$)|\bredo\b/iu,
    "방금 되돌린 작업을 다시 적용합니다.", "Reapplies the edit you just undid.", { shortcut: "⌘⇧Z" }),
  def("undo", "undoable", ["undo", "edit-undo"], /실행\s*취소|실행취소|되돌리기|\bundo\b/iu,
    "방금 한 작업을 한 단계 이전 상태로 되돌립니다.", "Reverts the most recent edit one step back.", { shortcut: "⌘Z" }),
  def("pose-vrm", "panel", ["pose", "vrm", "3d-pose", "character-pose"], /\bvrm\b|3d\s*포즈|캐릭터\s*포즈|인체\s*포즈|포즈\s*(?:편집|열기|도구|프리셋)|마네킹|\bpose\b/iu,
    "3D 인체·VRM 캐릭터 포즈를 열어 관절과 각도를 맞춥니다.", "Opens 3D figure and VRM pose controls for character reference."),
  def("bg3d", "panel", ["bg3d", "3d-bg", "3d-stage", "stage-3d"], /\bbg3d\b|3d\s*배경|3d\s*무대|3d\s*스테이지|3d\s*공간|3d\s*(?:background|stage|scene)/iu,
    "3D 배경 무대를 열어 카메라 구도와 선화 추출을 준비합니다.", "Opens the 3D stage to frame camera angles and background lines."),
  def("color-picker", "panel", ["color", "color-picker", "color-wheel", "swatch"], /색상\s*선택|컬러\s*(?:휠|피커|팔레트)|색상환|color\s*(?:picker|wheel)/iu,
    "색상환과 팔레트를 열어 그리기 색을 고릅니다.", "Opens the color wheel and swatches to choose a drawing color."),
  def("eyedropper", "safe-view", ["eyedropper", "dropper", "color-sample", "tool-eyedropper"], /스포이트|색\s*추출|eyedropper|color\s*sampler/iu,
    "캔버스의 색을 찍어 현재 브러시 색으로 가져옵니다.", "Samples a color from the canvas without changing artwork.", { shortcut: "I" }),
  def("vector-edit", "undoable", ["vector-edit", "vector-line", "node-edit", "path-edit"], /벡터\s*선|벡터\s*노드|선\s*수정|경로\s*(?:편집|정리)|vector\s*(?:edit|line|node)|path\s*edit/iu,
    "그린 벡터 선의 제어점과 굵기를 다시 다듬습니다.", "Adjusts control points and stroke weight on existing vector lines."),
  def("ruler-perspective", "undoable", ["ruler", "perspective", "symmetry-ruler", "tool-ruler"], /투시선|투시자|대칭자|스냅\s*자|자\s*·\s*투시|자\/투시|^자(?:\s*[·(/]|$)|자\s*도구|\bruler\b|perspective\s*(?:guide|ruler)/iu,
    "투시선·대칭자 가이드를 켜서 선이 반듯하게 붙도록 돕습니다.", "Places perspective or symmetry guides that snap your strokes.", { shortcut: "R" }),
  def("screentone", "undoable", ["screentone", "halftone", "tone"], /스크린톤|만화\s*망점|망점|하프톤|톤\s*붙이기|screentone|halftone/iu,
    "선택 영역이나 레이어에 만화 망점·톤 패턴을 입힙니다.", "Applies manga halftone dots and tone patterns to the artwork."),
  def("eraser", "undoable", ["eraser", "tool-eraser"], /지우개|\beraser\b/iu,
    "현재 레이어의 선과 색을 문질러 지웁니다.", "Erases strokes and paint on the active layer.", { shortcut: "E" }),
  def("pen-brush", "undoable", ["pen", "brush", "pen-brush", "pencil", "tool-pen", "tool-brush"], /브러시|연필|만년필|잉크\s*펜|지펜|g펜|^펜(?:\s*[·(/]|$)|펜\s*도구|\bpen\b|\bbrush\b|\bpencil\b/iu,
    "필압과 손떨림 보정으로 캔버스에 선화·스케치를 그립니다.", "Draws pressure-sensitive ink lines and sketches on the canvas.", { shortcut: "B" }),
  def("lasso", "undoable", ["lasso", "free-select", "tool-lasso"], /올가미|자유\s*선택|다각형\s*선택|\blasso\b/iu,
    "원하는 윤곽을 직접 그려 특정 영역만 선택합니다.", "Draws a freehand outline to isolate an area for editing.", { shortcut: "L" }),
  def("magic-wand", "undoable", ["magic-wand", "wand", "auto-select", "tool-wand"], /마법봉|매직\s*완드|자동\s*선택|magic\s*wand|\bwand\b/iu,
    "비슷한 색이 이어진 영역을 한 번에 선택합니다.", "Selects connected regions of similar color in one click.", { shortcut: "W" }),
  def("select-transform", "undoable", ["select", "transform", "move-object", "tool-select"], /^선택(?:\s*[·(/]|$)|선택\s*도구|오브젝트\s*선택|개체\s*선택|\bselect\b|\btransform\b/iu,
    "요소를 선택해 위치를 옮기거나 크기·각도를 조절합니다.", "Selects elements to move, resize, or rotate on the canvas.", { shortcut: "V" }),
  def("fill-bucket", "undoable", ["fill", "bucket", "paint-bucket", "tool-fill"], /채우기|버킷|페인트\s*통|틈\s*닫기|\bfill\b|\bbucket\b/iu,
    "닫힌 선화 안쪽을 현재 색으로 한 번에 채웁니다.", "Fills an enclosed area inside line art with the active color.", { shortcut: "G" }),
  def("hand-pan", "safe-view", ["hand", "pan", "hand-pan", "tool-hand"], /손바닥|화면\s*이동|캔버스\s*이동|손\s*도구|패닝|\bhand\b|\bpan\b/iu,
    "그림을 건드리지 않고 캔버스 화면 위치만 옮깁니다.", "Pans the canvas view without editing any strokes.", { shortcut: "H" }),
  def("text-bubble", "undoable", ["text", "bubble", "speech-bubble", "lettering", "tool-text"], /말풍선|텍스트|대사\s*(?:입력|추가|편집)|식자|레터링|speech\s*bubble|\bbubble\b|\btext\b|lettering/iu,
    "말풍선이나 대사 텍스트를 캔버스에 추가해 편집합니다.", "Adds and edits speech bubbles or dialogue text on the canvas.", { shortcut: "T" }),
  def("shape-frame", "undoable", ["shape", "frame", "cut-split", "cut-frame", "tool-shape"], /컷\s*분할|컷\s*프레임|프레임\s*(?:나누기|추가|편집)|칸\s*나누기|도형|\bshape\b|cut\s*frame|panel\s*frame/iu,
    "도형이나 웹툰 컷 프레임을 반듯하게 그려 나눕니다.", "Draws clean geometric shapes or splits comic panel frames.", { shortcut: "U" }),
  def("layers", "panel", ["layers", "layer", "layer-panel"], /레이어|\blayers?\b/iu,
    "선화·채색·배경 레이어의 순서와 투명도를 관리합니다.", "Opens layer order, visibility, blending, and opacity controls."),
  def("smart-filter", "undoable", ["smart-filter", "filter", "adjustment"], /스마트\s*필터|필터|색감\s*보정|보정\s*효과|흐림\s*효과|smart\s*filter|\bfilter\b/iu,
    "원본을 유지한 채 색감·흐림·선명도 필터를 적용합니다.", "Applies color, blur, or sharpening filters non-destructively."),
  def("offline-sync", "local-save", ["offline", "sync", "cloud-sync", "offline-sync"], /오프라인|클라우드\s*동기화|동기화|\boffline\b|cloud\s*sync|\bsync\b/iu,
    "오프라인 저장본과 클라우드 동기화 상태를 확인·맞춥니다.", "Checks local offline storage and syncs updates with the cloud."),
  def("export-work", "local-save", ["export", "download", "deliver", "publish-export"], /내보내기|출고|원본\s*다운로드|다운로드|\bexport\b|\bdownload\b/iu,
    "완성본을 이미지·PDF·웹툰 규격 파일로 저장해 내보냅니다.", "Exports your artwork as image, PDF, or webtoon-ready files."),
  def("save-local", "local-save", ["save", "autosave", "local-save"], /자동\s*저장|로컬\s*저장|임시\s*저장|^저장(?:\s*[·(/]|$)|저장하기|autosave|auto-save|\bsave\b/iu,
    "현재 작업 내용을 이 기기에 안전하게 기록합니다.", "Saves your current work safely on this device.", { shortcut: "⌘S" }),
  def("ai-assistant", "panel", ["ai", "ai-assistant", "assistant", "copilot"], /ai\s*(?:도우미|어시스턴트|채팅|상담|보조|assistant|copilot|helper)/iu,
    "AI 도우미 패널을 열어 작업 제안과 질문을 확인합니다.", "Opens the AI assistant panel for workflow help and suggestions."),
  def("search", "panel", ["search", "command-palette", "quick-find"], /검색|명령\s*팔레트|빠른\s*찾기|\bsearch\b|command\s*palette/iu,
    "작품·소재·도구 명령을 키워드로 한 번에 찾습니다.", "Opens quick search for works, assets, and studio commands.", { shortcut: "⌘K" }),
  def("new-work", "navigate", ["new-work", "create", "new-project"], /새\s*작품|작품\s*시작|새\s*프로젝트|새\s*캔버스|new\s*(?:work|project|canvas)|start\s*creating/iu,
    "새 캔버스나 템플릿을 골라 작품을 시작하는 화면으로 이동합니다.", "Opens the setup screen to start a new canvas or template.", { hrefs: ["/create", "/studio/new"] }),
  def("explore-discover", "navigate", ["explore", "discover", "ranking"], /작품\s*찾기|작품\s*탐색|^탐색(?:\s*[·(/]|$)|랭킹|\bdiscover\b|\bexplore\b|\branking\b/iu,
    "장르·태그·인기순으로 다른 창작자의 작품을 둘러봅니다.", "Opens the discovery feed to browse works by genre and ranking.", { hrefs: ["/discover", "/explore", "/ranking"] }),
  def("market-assets", "navigate", ["market", "assets", "asset-market"], /소재\s*찾기|소재\s*마켓|에셋\s*마켓|^소재(?:\s*[·(/]|$)|asset\s*market|\bmarketplace\b/iu,
    "브러시·배경·3D 소재를 찾아 작업실로 가져오는 마켓으로 이동합니다.", "Opens the asset market to find brushes, backgrounds, and 3D props.", { hrefs: ["/market", "/studio/assets"] }),
]);

const ENTRY_BY_KEY = new Map<string, ActionPreviewEntry>();
const ENTRY_BY_SHORTCUT = new Map<string, ActionPreviewEntry>();
for (const entry of PREDICTABLE_ACTION_CATALOG) {
  ENTRY_BY_KEY.set(entry.id, entry);
  for (const key of entry.keys) ENTRY_BY_KEY.set(key.toLowerCase(), entry);
  if (entry.defaultShortcut) ENTRY_BY_SHORTCUT.set(entry.defaultShortcut.toUpperCase(), entry);
}

function cleanText(value: string | null | undefined): string | undefined {
  const normalized = value?.replace(/\s+/gu, " ").trim();
  return normalized || undefined;
}

function normalizeHrefPath(href: string | null | undefined): string | undefined {
  const raw = cleanText(href);
  if (!raw || raw.startsWith("#")) return undefined;
  const path = raw.replace(/^https?:\/\/[^/]+/iu, "").split(/[?#]/u)[0]?.toLowerCase();
  return path?.startsWith("/") ? path : undefined;
}

function shortcutAlreadyInTitle(title: string | undefined, shortcut: string): boolean {
  if (!title) return false;
  const upperTitle = title.toUpperCase();
  const upperKey = shortcut.toUpperCase();
  if (upperTitle.includes(upperKey)) return true;
  if (upperKey === "⌘⇧Z") return /SHIFT\s*\+\s*Z/iu.test(title);
  if (upperKey === "⌘Z") return /(?:CTRL|CMD|META|⌘)[^A-Z]*\+?\s*Z(?![A-Z])/iu.test(title);
  if (upperKey === "⌘K") return /(?:CTRL|CMD|META|⌘)[^A-Z]*\+?\s*K(?![A-Z])/iu.test(title);
  if (upperKey === "⌘S") return /(?:CTRL|CMD|META|⌘)[^A-Z]*\+?\s*S(?![A-Z])/iu.test(title);
  return /^[A-Z]$/u.test(upperKey) && new RegExp(`(?:[·(/-]|\\s)${upperKey}(?:\\)|$)`, "u").test(upperTitle);
}

function matchByShortcut(shortcut: string | undefined): ActionPreviewEntry | undefined {
  const raw = cleanText(shortcut);
  if (!raw) return undefined;
  if (/shift\+z/iu.test(raw) || raw.includes("⌘⇧Z")) return ENTRY_BY_KEY.get("redo");
  if (/(?:control|meta|mod)\+z/iu.test(raw) || raw.includes("⌘Z")) return ENTRY_BY_KEY.get("undo");
  if (/(?:control|meta|mod)\+k/iu.test(raw) || raw.includes("⌘K")) return ENTRY_BY_KEY.get("search");
  if (/(?:control|meta|mod)\+s/iu.test(raw) || raw.includes("⌘S")) return ENTRY_BY_KEY.get("save-local");
  const single = raw.split(/\s+/u)[0]?.toUpperCase();
  return single?.length === 1 ? ENTRY_BY_SHORTCUT.get(single) : undefined;
}

/** 시맨틱 OKLCH 토큰 전용 범위 배지 클래스를 반환한다(원시 색상 0건). */
export function actionScopeBadgeClass(scope: ActionScope | undefined): string {
  return scope ? ACTION_SCOPE_META[scope].badgeClass : "border-line/80 bg-raised/85 text-fg-2";
}

export function actionScopeLabel(scope: ActionScope, korean: boolean): string {
  return korean ? ACTION_SCOPE_META[scope].ko : ACTION_SCOPE_META[scope].en;
}

export function matchPredictableActionEntry(
  target: HTMLElement,
  input: Pick<ActionPreviewInput, "title" | "shortcut"> = {},
): ActionPreviewEntry | undefined {
  for (const attr of ["data-action-preview", "data-tool", "data-studio-rail-tool-id", "data-navigation-entry"]) {
    const token = cleanText(target.getAttribute(attr))?.toLowerCase();
    const byKey = token ? ENTRY_BY_KEY.get(token) : undefined;
    if (byKey) return byKey;
  }

  const hrefPath = normalizeHrefPath(target.getAttribute("href"));
  if (hrefPath) {
    const byHref = PREDICTABLE_ACTION_CATALOG.find((entry) =>
      entry.hrefPrefixes?.some((prefix) => hrefPath === prefix || hrefPath.startsWith(`${prefix}/`)),
    );
    if (byHref) return byHref;
  }

  for (const text of [cleanText(input.title), cleanText(target.getAttribute("aria-label"))]) {
    if (!text) continue;
    const found = PREDICTABLE_ACTION_CATALOG.find((entry) => entry.pattern.test(text));
    if (found) return found;
  }

  return matchByShortcut(input.shortcut);
}

function resolveAriaStateFallback(
  target: HTMLElement,
  korean: boolean,
  isNavigationLink: boolean,
): Readonly<{ description?: string; scope?: ActionScope }> {
  const pressed = target.getAttribute("aria-pressed");
  if (pressed === "true") return { description: korean ? "현재 선택되어 있습니다. 누르면 해제합니다." : "Selected. Activate to turn it off." };
  if (pressed === "false") return { description: korean ? "누르면 선택합니다." : "Activate to select." };
  const checked = target.getAttribute("aria-checked");
  if (checked === "true") return { description: korean ? "현재 켜져 있습니다. 누르면 끕니다." : "On. Activate to turn it off." };
  if (checked === "false") return { description: korean ? "현재 꺼져 있습니다. 누르면 켭니다." : "Off. Activate to turn it on." };
  const expanded = target.getAttribute("aria-expanded");
  if (!isNavigationLink && expanded === "true") {
    return { description: korean ? "현재 열려 있습니다. 누르면 닫습니다." : "Open. Activate to close.", scope: "panel" };
  }
  if (!isNavigationLink && expanded === "false") {
    return { description: korean ? "누르면 관련 메뉴나 패널을 엽니다." : "Activate to open the related menu or panel.", scope: "panel" };
  }
  const selected = target.getAttribute("aria-selected");
  if (selected === "true") return { description: korean ? "현재 선택된 항목입니다." : "Currently selected." };
  if (selected === "false") return { description: korean ? "누르면 이 항목으로 전환합니다." : "Activate to switch to this item." };
  const hasPopup = target.getAttribute("aria-haspopup");
  if (!isNavigationLink && hasPopup && hasPopup !== "false") return { scope: "panel" };
  if (isNavigationLink) return { description: korean ? "누르면 해당 화면으로 이동합니다." : "Opens the destination page.", scope: "navigate" };
  return {};
}

function toPreview(
  korean: boolean,
  fields: Readonly<{ id?: string; description?: string; scope?: ActionScope; badge?: string; shortcut?: string }>,
): PredictableActionPreview {
  const { id, description, scope, badge, shortcut } = fields;
  return {
    id, description, actionScope: scope, shortcut,
    actionBadge: badge ?? (scope ? actionScopeLabel(scope, korean) : undefined),
    reversible: scope ? ACTION_SCOPE_META[scope].reversible : false,
  };
}

export function resolvePredictableActionPreview(
  target: HTMLElement,
  input: ActionPreviewInput,
): PredictableActionPreview {
  const { korean, title, shortcut } = input;
  const isNavigationLink = target instanceof HTMLAnchorElement && target.hasAttribute("href");
  const matched = matchPredictableActionEntry(target, { title, shortcut });
  const explicitDescription = cleanText(target.getAttribute("data-tooltip-description") ?? target.getAttribute("aria-description"));
  const explicitOutcome = cleanText(target.getAttribute("data-tooltip-outcome"));
  const rawPreview = cleanText(target.getAttribute("data-action-preview"));
  const customPreview = rawPreview && !ENTRY_BY_KEY.has(rawPreview.toLowerCase()) ? rawPreview : undefined;
  const disabledReason = cleanText(target.getAttribute("data-tooltip-disabled-reason") ?? target.getAttribute("data-studio-disabled-reason"));
  const isDisabled = target.hasAttribute("disabled") || target.getAttribute("aria-disabled") === "true";

  // 1. 명시적 data-tooltip-description / data-tooltip-outcome 최우선 존중
  if (explicitDescription || explicitOutcome) {
    const scope = isDisabled ? undefined : matched?.scope ?? (isNavigationLink ? "navigate" : undefined);
    return toPreview(korean, {
      id: matched?.id, description: explicitDescription ?? explicitOutcome, scope,
      badge: explicitDescription && explicitOutcome ? explicitOutcome : undefined, shortcut,
    });
  }

  // 2. 비활성 사유 우선 (실행 불가 컨트롤에 오해 유발 배지를 표시하지 않음)
  if (disabledReason || isDisabled) {
    return toPreview(korean, { id: matched?.id, description: disabledReason ?? (korean ? "현재 사용할 수 없습니다." : "Unavailable right now."), shortcut });
  }

  // 3. 핵심 동작 28종 사전 또는 커스텀 data-action-preview 적용
  if (matched || customPreview) {
    const scope = matched?.scope ?? (isNavigationLink ? "navigate" : undefined);
    const resolvedShortcut = shortcut
      ?? (matched?.defaultShortcut && !shortcutAlreadyInTitle(title, matched.defaultShortcut) ? matched.defaultShortcut : undefined);
    return toPreview(korean, {
      id: matched?.id, description: customPreview ?? (matched ? (korean ? matched.ko : matched.en) : undefined),
      scope, shortcut: resolvedShortcut,
    });
  }

  // 4. ARIA 상태·내비게이션 링크 기본 예측 안내
  const fallback = resolveAriaStateFallback(target, korean, isNavigationLink);
  return toPreview(korean, { description: fallback.description, scope: fallback.scope, shortcut });
}
