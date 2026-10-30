import metadata from "./office2d-expression-metadata.json";
import type { Office2dAtlasPoint, Office2dAtlasRect } from "./office2d-generated-atlases";
import type { Office2dCharacterKey } from "./office2d-sprite-catalog";

export interface Office2dExpressionAtlasFrame {
  readonly source: Office2dAtlasRect;
  /** 발 anchor 188에 맞춘 전신 bbox의 128×192 논리셀 좌표. */
  readonly target: Office2dAtlasRect;
  /** 기존 referenceHead에 대한 이 전신 프레임의 머리 위치 차이. target에는 더하지 않는다. */
  readonly accessoryOffset: Office2dAtlasPoint;
  /** 눈 높이에 맞춘 안경·선글라스 전용 차이. 모자·헤드폰에는 적용하지 않는다. */
  readonly eyewearOffset: Office2dAtlasPoint;
}

export interface Office2dExpressionSheet {
  readonly role: string;
  readonly url: string;
  readonly width: number;
  readonly height: number;
  readonly columns: number;
  readonly rows: number;
  readonly frames: readonly Office2dExpressionAtlasFrame[];
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rectWithin(rect: unknown, width: number, height: number, minY = 0): rect is Office2dAtlasRect {
  return record(rect) && typeof rect.x === "number" && typeof rect.y === "number"
    && typeof rect.width === "number" && typeof rect.height === "number"
    && [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)
    && rect.x >= 0 && rect.y >= minY && rect.width > 0 && rect.height > 0
    && rect.x + rect.width <= width && rect.y + rect.height <= height;
}

function offsetWithin(value: unknown): value is Office2dAtlasPoint {
  return record(value) && typeof value.x === "number" && Number.isFinite(value.x) && Math.abs(value.x) <= 128
    && typeof value.y === "number" && Number.isFinite(value.y) && Math.abs(value.y) <= 192;
}

/** 이전 얼굴 패치나 잘못된 전신 좌표는 선택하지 않고 기존 몸체를 유지한다. */
export function office2dExpressionSheetIsValid(sheet: unknown): sheet is Office2dExpressionSheet {
  if (!record(sheet) || typeof sheet.role !== "string" || typeof sheet.url !== "string"
    || !sheet.url.startsWith("/assets/virtual-studio/office-standing-expressions-v1/")
    || typeof sheet.width !== "number" || !Number.isInteger(sheet.width) || sheet.width <= 0
    || typeof sheet.height !== "number" || !Number.isInteger(sheet.height) || sheet.height <= 0
    || sheet.columns !== 4 || sheet.rows !== 2 || !Array.isArray(sheet.frames) || sheet.frames.length !== 8) return false;
  const width = sheet.width, height = sheet.height;
  return sheet.frames.every((frame: unknown) => record(frame) && rectWithin(frame.source, width, height)
    // 기존 몸키와 상단 padding을 줄이지 않고 논리셀 위쪽의 작은 overscan을 보존한다.
    && rectWithin(frame.target, 128, 192, -8) && offsetWithin(frame.accessoryOffset) && offsetWithin(frame.eyewearOffset));
}

export function readOffice2dExpressionSheets(value: unknown): readonly Office2dExpressionSheet[] {
  if (!record(value) || value.version !== 2 || !Array.isArray(value.sheets)) return [];
  const sheets: readonly unknown[] = value.sheets;
  return sheets.filter(office2dExpressionSheetIsValid);
}

const expressionSheets = new Map(readOffice2dExpressionSheets(metadata).map((sheet) => [sheet.role, sheet]));

export function office2dExpressionSheet(character: Office2dCharacterKey): Office2dExpressionSheet | null {
  return expressionSheets.get(character) ?? null;
}

/** 등록된 표정만 자기 직군 우선으로 후속 로드한다. 없는 직군의 URL을 추측하지 않는다. */
export function office2dExpressionAssetUrls(preferred: Office2dCharacterKey): readonly string[] {
  const own = office2dExpressionSheet(preferred);
  const remaining = [...expressionSheets.values()].filter((sheet) => sheet.role !== preferred).map((sheet) => sheet.url);
  return own ? [own.url, ...remaining] : remaining;
}
