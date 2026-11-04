import { normalizeStudioBg3dCaptureAspectRatio } from "../bg3d/studio-bg3d-capture-frame-geometry";
import { parseStudioBg3dSixPassLtSettings } from "./studio-bg3d-six-pass-settings";
import type { StudioBg3dLineOutputSettings, StudioBg3dOutputSettings } from "../bg3d/studio-bg3d-scene-document-types";

const TONE_MODE_SET = new Set<string>(["none", "flat", "cel", "screentone"]);
const TONE_OUTPUT_TYPE_SET = new Set<string>(["color", "grayscale", "pattern"]);
const TONE_PATTERN_SET = new Set<string>(["dot", "line", "crosshatch", "noise"]);
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function hasOwn(value: Record<string, unknown>, key: string): boolean { return Object.prototype.hasOwnProperty.call(value, key); }
function boundedNumber(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback;
}

function boundedInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  return Math.round(boundedNumber(value, fallback, minimum, maximum));
}

function normalizedBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizedEnum<Value extends string>(
  value: unknown,
  allowed: ReadonlySet<string>,
  fallback: Value
): Value {
  return typeof value === "string" && allowed.has(value) ? (value as Value) : fallback;
}


export function normalizeStudioBg3dOutput(value: unknown, normalizeLine: (value: unknown) => StudioBg3dLineOutputSettings): StudioBg3dOutputSettings {
  const candidate = isRecord(value) ? value : {};
  const tone = isRecord(candidate.tone) ? candidate.tone : {};
  // 렌즈 시프트와 같은 선택 필드 규약: 값이 있을 때만 기록한다. 없는 문서는 자동(뷰포트 추종)으로
  // 남아 예전 삽입 결과와 바이트 단위로 동일하고, strict 왕복도 그대로 통과한다.
  const exportAspectRatio = hasOwn(candidate, "exportAspectRatio")
    ? normalizeStudioBg3dCaptureAspectRatio(candidate.exportAspectRatio)
    : null;
  const sixPassLt = hasOwn(candidate, "sixPassLt") ? parseStudioBg3dSixPassLtSettings(candidate.sixPassLt) : undefined;
  if (sixPassLt === null) throw new TypeError("6패스 LT 설정이 손상되었습니다.");
  return {
    transparentBackground: normalizedBoolean(candidate.transparentBackground, false),
    exportHeight: boundedInteger(candidate.exportHeight, 640, 256, 4096),
    ...(exportAspectRatio === null ? {} : { exportAspectRatio }),
    line: normalizeLine(candidate.line),
    tone: {
      mode: normalizedEnum(tone.mode, TONE_MODE_SET, "flat"),
      type: normalizedEnum(tone.type, TONE_OUTPUT_TYPE_SET, "color"),
      pattern: normalizedEnum(tone.pattern, TONE_PATTERN_SET, "dot"),
      levels: boundedInteger(tone.levels, 4, 2, 8),
      opacity: boundedNumber(tone.opacity, 1, 0, 1),
      frequency: boundedNumber(tone.frequency, 60, 1, 200),
      angleDegrees: boundedNumber(tone.angleDegrees, 45, -180, 180),
    },
    ...(sixPassLt ? { sixPassLt } : {}),
  };
}

