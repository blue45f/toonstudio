import { proposeBalloonSfxLayoutsTop3, type NegativeSpaceGridInput, type ProposeLayoutsInput, type ProtectedZone, type BalloonSfxRecommendationBundle, type PlacementSessionState } from "./balloon-sfx-placement-engine";

function finite(value: number | undefined, limit = 100000): void {
  if (value !== undefined && (!Number.isFinite(value) || Math.abs(value) > limit)) throw new RangeError("배치 수치가 유한 지원 범위를 벗어났습니다.");
}
function text(value: string, max = 4096): void { if (typeof value !== "string" || value.length > max) throw new RangeError("배치 원문 상한을 넘었습니다."); }
function unique(value: string, ids: Set<string>): void {
  text(value, 256);
  if (!value.trim() || ids.has(value)) throw new TypeError("배치 ID는 비어 있지 않고 고유해야 합니다.");
  ids.add(value);
}
export function assertPlacementGridInput(input: NegativeSpaceGridInput): void {
  finite(input.canvasWidth, 4096); finite(input.canvasHeight, 4096);
  const width = Math.max(320, Math.round(input.canvasWidth ?? 800));
  const height = Math.max(480, Math.round(input.canvasHeight ?? 1200));
  if (width * height > 4194304) throw new RangeError("배치 탐색 면적 상한을 넘었습니다.");
  finite(input.cols); finite(input.rows);
  if (input.focusMouth) { finite(input.focusMouth.x); finite(input.focusMouth.y); }
  if (input.preferredBand) { finite(input.preferredBand.minY); finite(input.preferredBand.maxY); }
  if (!Array.isArray(input.protectedZones) || input.protectedZones.length > 64) throw new RangeError("보호 영역 상한은 64개입니다.");
  const ids = new Set<string>();
  for (const zone of input.protectedZones) {
    unique(zone.id, ids); text(zone.labelKo); text(zone.labelEn);
    if (!["face", "eyes", "hand", "prop"].includes(zone.kind)) throw new TypeError("지원하지 않는 보호 영역입니다.");
    for (const value of [zone.box.x, zone.box.y, zone.box.width, zone.box.height, zone.weight]) finite(value);
    if (zone.box.width <= 0 || zone.box.height <= 0 || zone.weight < 0) throw new RangeError("보호 영역 크기·가중치가 유효하지 않습니다.");
  }
}
export function assertPlacementInput(input: ProposeLayoutsInput): void {
  assertPlacementGridInput(input);
  if (!Array.isArray(input.dialogues) || input.dialogues.length > 64) throw new RangeError("원문 대사 상한은 64개입니다. 미리보기는 앞의 3개만 배치합니다.");
  const ids = new Set<string>(); let length = 0;
  for (const item of input.dialogues) {
    unique(item.id, ids); text(item.text); text(item.speakerNameKo, 1024); text(item.speakerNameEn, 1024);
    finite(item.mouthX); finite(item.mouthY);
    if (!["normal", "whisper", "shout", "thought", "tension"].includes(item.emotion)) throw new TypeError("지원하지 않는 감정입니다.");
    length += item.text.length + item.speakerNameKo.length + item.speakerNameEn.length;
    if (length > 32768) throw new RangeError("배치 원문 총량 상한을 넘었습니다.");
  }
}
const numericKeys = new Set(["x", "y", "width", "height", "canvasWidth", "canvasHeight", "safeMargin", "cols", "rows", "col", "row", "cellWidth", "cellHeight", "centerX", "centerY", "mouthX", "mouthY", "tailOriginX", "tailOriginY", "tailTipX", "tailTipY", "tailBaseLeftX", "tailBaseLeftY", "tailBaseRightX", "tailBaseRightY", "mouthDistancePx", "rotationDeg", "fontSize", "order", "rank", "revision", "weight", "occlusionRatio", "faceOcclusionRatio", "safeMarginScore", "mouthProximityScore", "readingFlowScore", "score", "averageScore", "openCellRatio", "faceOcclusionPct", "totalProtectedOcclusionPct", "marginBalanceScore", "balloonOverlapCount", "overallScore"]);
/** 외부 SVG/JSON 값의 비유한 수치·순환·과대 목록을 직렬화 전에 거부한다. */
export function assertPlacementExport(value: unknown): void {
  let nodes = 0; let characters = 0; const seen = new WeakSet<object>();
  function visit(item: unknown, depth: number): void {
    nodes += 1;
    if (nodes > 1000000 || depth > 24) throw new RangeError("배치 결과 크기·깊이 상한을 넘었습니다.");
    if (typeof item === "number") finite(item, 1000000000);
    if (typeof item === "string") { text(item, 32768); characters += item.length; if (characters > 2000000) throw new RangeError("배치 결과 원문 상한을 넘었습니다."); }
    if (!item || typeof item !== "object") return;
    if (seen.has(item)) throw new TypeError("순환 배치 결과는 지원하지 않습니다.");
    seen.add(item);
    if (Array.isArray(item) && item.length > 4096) throw new RangeError("배치 결과 목록 상한을 넘었습니다.");
    const box = Reflect.get(item, "box");
    if (box && typeof box === "object") {
      for (const key of ["x", "y", "width", "height"]) {
        const dimension: unknown = Reflect.get(box, key);
        if (typeof dimension !== "number") throw new TypeError("배치 좌표·크기는 숫자여야 합니다.");
        finite(dimension);
        if ((key === "width" || key === "height") && dimension <= 0) throw new RangeError("배치 크기는 양수여야 합니다.");
      }
    }
    for (const [key, child] of Object.entries(item)) {
      if (numericKeys.has(key) && typeof child !== "number") throw new TypeError("배치 수치 필드에는 숫자가 필요합니다.");
      visit(child, depth + 1);
    }
    seen.delete(item);
  }
  visit(value, 0);
}
function matches(actual: unknown, expected: unknown): boolean {
  if (Object.is(actual, expected)) return true;
  if (Array.isArray(expected)) return Array.isArray(actual) && actual.length === expected.length && expected.every((value, index) => matches(actual[index], value));
  if (!actual || !expected || typeof actual !== "object" || typeof expected !== "object" || Array.isArray(actual)) return false;
  const keys = Object.keys(expected);
  return Object.keys(actual).length === keys.length && keys.every((key) => matches(Reflect.get(actual, key), Reflect.get(expected, key)));
}
export function assertPlacementJson(payload: { readonly safeMargin: number; readonly protectedZones: readonly ProtectedZone[]; readonly bundle: BalloonSfxRecommendationBundle; readonly session: PlacementSessionState }): void {
  assertPlacementExport(payload); finite(payload.safeMargin);
  if (payload.bundle.sourceDialogues) {
    const model = proposeBalloonSfxLayoutsTop3({ canvasWidth: payload.bundle.canvasWidth, canvasHeight: payload.bundle.canvasHeight, safeMargin: payload.safeMargin, protectedZones: payload.protectedZones, dialogues: payload.bundle.sourceDialogues });
    if (!matches(payload.bundle, model)) throw new RangeError("외부 배치 결과가 현재 입력과 일치하지 않습니다.");
  }
}
