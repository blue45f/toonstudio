/**
 * 사진 → 선화 배경 변환 (사진 LT) 배치 계획.
 *
 * 배경 가져오기 경로 전용 순수 모듈이다. 기존 LT 엔진
 * (`convertStudioLtImage`, Sobel 선화+톤 분리)과 레이어 페이로드 빌더
 * (`createStudioLtConvertLayerPayloads`)는 그대로 재사용하고, 이 모듈은
 * "사진 1장 → 선화 배경으로 캔버스 배치" 판정에 필요한 것만 담당한다.
 *
 * - 배경 프리셋 5종: 엔진 옵션 + 톤 포함 여부를 한 번에 고른다.
 * - 캔버스 배치 기하: 배경은 캔버스를 꽉 채우는 것(cover)이 기본이고,
 *   사진 전체를 보여야 하면 contain을 고른다. 두 경우 모두 가운데 정렬.
 * - 레이어 스택 순서: 톤(맨 아래) → 선화(위). 선화만 두면 흰 바탕이
 *   필요하다는 사실을 `needsWhiteBacking`으로 호스트에 알린다.
 * - 직렬화(data URL 등)는 주입받는다. 실제 문서 커밋은 호출 측
 *   (StudioPage 권한 영역)이 페이로드의 src·좌표로 `ImageEl`을 만든다.
 *   (`studio-lt-convert-layer.ts`의 연동 메모와 같은 경계)
 */

import {
  normalizeStudioLtConvertOptions,
  StudioLtConvertError,
  type NormalizedStudioLtConvertOptions,
  type StudioLtConvertOptions,
  type StudioLtConvertResult,
} from "./studio-lt-convert";
import {
  createStudioLtConvertLayerPayloads,
  type StudioLtConvertLayerKind,
} from "./studio-lt-convert-layer";

export type StudioPhotoLtBackgroundPresetId =
  | "clean"
  | "bold"
  | "detail"
  | "screentone"
  | "line-only";

export interface StudioPhotoLtBackgroundPreset {
  readonly id: StudioPhotoLtBackgroundPresetId;
  /** 칩·목록에 표시될 쉬운 말 이름. */
  readonly label: string;
  /** 프리셋이 어떤 배경에 맞는지 한 줄 설명. */
  readonly description: string;
  readonly options: StudioLtConvertOptions;
  /** 톤 레이어를 함께 깔지 여부 (기본값, 사용자가 바꿀 수 있다). */
  readonly includeTone: boolean;
}

/**
 * 배경용 프리셋. 인물 선과 경쟁하지 않도록 기본값(clean)은 LT 다이얼로그
 * 기본값과 같은 선 설정을 쓰고, bold는 선을 굵게·톤을 단순하게 해
 * 먼 배경에, detail은 선을 가늘게 해 가까운 배경에 맞춘다.
 */
export const STUDIO_PHOTO_LT_BACKGROUND_PRESETS: readonly StudioPhotoLtBackgroundPreset[] =
  Object.freeze([
    {
      id: "clean",
      label: "기본 배경",
      description: "선과 명암을 골고루 남겨요",
      options: { toneDensity: 4, lineThickness: 2, lineThreshold: 0.25, screentone: false },
      includeTone: true,
    },
    {
      id: "bold",
      label: "굵은 선",
      description: "먼 배경용 — 선이 굵고 단순해요",
      options: { toneDensity: 3, lineThickness: 4, lineThreshold: 0.18, screentone: false },
      includeTone: true,
    },
    {
      id: "detail",
      label: "촘촘한 선",
      description: "가까운 배경용 — 가는 선까지 잡아요",
      options: { toneDensity: 6, lineThickness: 1, lineThreshold: 0.12, screentone: false },
      includeTone: true,
    },
    {
      id: "screentone",
      label: "도트 톤",
      description: "명암을 만화 도트 톤으로 바꿔요",
      options: { toneDensity: 4, lineThickness: 2, lineThreshold: 0.25, screentone: true },
      includeTone: true,
    },
    {
      id: "line-only",
      label: "선만",
      description: "선화만 깔고 색은 직접 칠해요",
      options: { toneDensity: 4, lineThickness: 2, lineThreshold: 0.25, screentone: false },
      includeTone: false,
    },
  ]);

export const STUDIO_PHOTO_LT_BACKGROUND_DEFAULT_PRESET_ID: StudioPhotoLtBackgroundPresetId =
  "clean";

/** 알 수 없는 프리셋 id는 기본 프리셋으로 해석한다 (fail-soft). */
export function resolveStudioPhotoLtBackgroundPreset(
  presetId: string | null | undefined,
): StudioPhotoLtBackgroundPreset {
  return (
    STUDIO_PHOTO_LT_BACKGROUND_PRESETS.find((preset) => preset.id === presetId)
    ?? STUDIO_PHOTO_LT_BACKGROUND_PRESETS[0]!
  );
}

export type StudioPhotoLtBackgroundFit = "cover" | "contain";

export interface StudioPhotoLtBackgroundPlanInput {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  /** LT 변환에 투입된(축소 포함) 소스 픽셀 크기. */
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  /** 사진 파일 이름. 레이어 이름의 바탕이 된다. */
  readonly sourceName?: string;
  readonly presetId?: StudioPhotoLtBackgroundPresetId;
  /** 프리셋 옵션 덮어쓰기 (부분 지정 가능). */
  readonly options?: Partial<StudioLtConvertOptions>;
  /** 프리셋의 톤 포함 기본값 덮어쓰기. */
  readonly includeTone?: boolean;
  readonly fit?: StudioPhotoLtBackgroundFit;
}

export type StudioPhotoLtBackgroundLayerRole = "background-tone" | "background-line";

export interface StudioPhotoLtBackgroundLayerSpec {
  readonly kind: StudioLtConvertLayerKind;
  readonly role: StudioPhotoLtBackgroundLayerRole;
  readonly name: string;
  /** 스택 순서. 0이 맨 아래다. */
  readonly stackIndex: number;
  /** 캔버스 좌표. cover에서는 음수가 될 수 있다(넘친 만큼 잘라 낸다). */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface StudioPhotoLtBackgroundPlan {
  readonly presetId: StudioPhotoLtBackgroundPresetId;
  readonly options: NormalizedStudioLtConvertOptions;
  readonly includeTone: boolean;
  readonly fit: StudioPhotoLtBackgroundFit;
  /** 선화만 깔 때 true — 호스트는 페이지 바탕을 흰색으로 유지해야 한다. */
  readonly needsWhiteBacking: boolean;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  /** 레이어 이름의 바탕 (확장자를 뗀 파일 이름). */
  readonly baseName: string;
  /** 맨 아래 → 위 순서의 레이어 스펙. */
  readonly layers: readonly StudioPhotoLtBackgroundLayerSpec[];
}

const BASE_NAME_MAX_LENGTH = 40;
const FALLBACK_BASE_NAME = "사진 배경";

function assertPositiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new StudioLtConvertError(
      "invalid-input",
      `${label} 크기가 올바르지 않습니다(${String(value)}).`,
    );
  }
  return value;
}

/** 파일 이름 → 레이어 이름 바탕. 확장자를 떼고, 비면 기본 이름을 쓴다. */
export function studioPhotoLtBackgroundBaseName(sourceName?: string): string {
  if (typeof sourceName !== "string") return FALLBACK_BASE_NAME;
  const trimmed = sourceName.trim();
  if (!trimmed) return FALLBACK_BASE_NAME;
  const withoutExtension = trimmed.replace(/\.[^.\\/:*?"<>|]+$/u, "").trim();
  const base = withoutExtension || FALLBACK_BASE_NAME;
  return base.length > BASE_NAME_MAX_LENGTH
    ? base.slice(0, BASE_NAME_MAX_LENGTH)
    : base;
}

export function studioPhotoLtBackgroundLayerName(
  baseName: string,
  kind: StudioLtConvertLayerKind,
): string {
  return kind === "lt-convert-line" ? `${baseName} 배경 선화` : `${baseName} 배경 톤`;
}

/**
 * 사진 1장의 선화 배경 배치 계획을 만든다.
 *
 * @throws {StudioLtConvertError} 캔버스·소스 크기가 올바르지 않으면 발생.
 */
export function planStudioPhotoLtBackground(
  input: StudioPhotoLtBackgroundPlanInput,
): StudioPhotoLtBackgroundPlan {
  if (!input || typeof input !== "object") {
    throw new StudioLtConvertError("invalid-input", "선화 배경 배치 입력이 필요합니다.");
  }
  const canvasWidth = assertPositiveInteger(input.canvasWidth, "캔버스 너비");
  const canvasHeight = assertPositiveInteger(input.canvasHeight, "캔버스 높이");
  const sourceWidth = assertPositiveInteger(input.sourceWidth, "사진 너비");
  const sourceHeight = assertPositiveInteger(input.sourceHeight, "사진 높이");

  const preset = resolveStudioPhotoLtBackgroundPreset(input.presetId);
  const options = normalizeStudioLtConvertOptions({
    ...preset.options,
    ...(input.options ?? {}),
  });
  const includeTone = input.includeTone ?? preset.includeTone;
  const fit: StudioPhotoLtBackgroundFit = input.fit === "contain" ? "contain" : "cover";

  const scale =
    fit === "cover"
      ? Math.max(canvasWidth / sourceWidth, canvasHeight / sourceHeight)
      : Math.min(canvasWidth / sourceWidth, canvasHeight / sourceHeight);
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const x = Math.round((canvasWidth - width) / 2);
  const y = Math.round((canvasHeight - height) / 2);

  const baseName = studioPhotoLtBackgroundBaseName(input.sourceName);
  const geometry = { x, y, width, height } as const;
  const layers: StudioPhotoLtBackgroundLayerSpec[] = [];
  if (includeTone) {
    layers.push({
      kind: "lt-convert-tone",
      role: "background-tone",
      name: studioPhotoLtBackgroundLayerName(baseName, "lt-convert-tone"),
      stackIndex: 0,
      ...geometry,
    });
  }
  layers.push({
    kind: "lt-convert-line",
    role: "background-line",
    name: studioPhotoLtBackgroundLayerName(baseName, "lt-convert-line"),
    stackIndex: layers.length,
    ...geometry,
  });

  return {
    presetId: preset.id,
    options,
    includeTone,
    fit,
    needsWhiteBacking: !includeTone,
    canvasWidth,
    canvasHeight,
    sourceWidth,
    sourceHeight,
    baseName,
    layers,
  };
}

/** 호스트가 문서에 커밋할 직렬화된 선화 배경 레이어 1장. */
export interface StudioPhotoLtBackgroundPlacedLayer extends StudioPhotoLtBackgroundLayerSpec {
  /** 직렬화된 이미지 주소 (data URL 등). */
  readonly src: string;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
}

/** `onPlace` 콜백 페이로드 — 사진 1장분의 선화 배경 배치 전체. */
export interface StudioPhotoLtBackgroundPlacement {
  readonly plan: StudioPhotoLtBackgroundPlan;
  /** 맨 아래 → 위 순서. 호스트는 이 순서대로 배경 스택에 커밋한다. */
  readonly layers: readonly StudioPhotoLtBackgroundPlacedLayer[];
}

/**
 * LT 변환 결과 + 배치 입력을 호스트 커밋용 페이로드로 조립한다.
 * `serialize`는 ImageData → src 변환이며, 호출 측(패널)이 캔버스
 * 직렬화를 주입한다. 톤을 빼면 선화 1장만 나간다.
 */
export function buildStudioPhotoLtBackgroundPlacement(
  result: StudioLtConvertResult,
  input: StudioPhotoLtBackgroundPlanInput,
  serialize: (imageData: ImageData) => string,
): StudioPhotoLtBackgroundPlacement {
  if (typeof serialize !== "function") {
    throw new StudioLtConvertError("invalid-input", "이미지 직렬화 함수가 필요합니다.");
  }
  const plan = planStudioPhotoLtBackground(input);
  const payloads = createStudioLtConvertLayerPayloads(result, {
    lineName: studioPhotoLtBackgroundLayerName(plan.baseName, "lt-convert-line"),
    toneName: studioPhotoLtBackgroundLayerName(plan.baseName, "lt-convert-tone"),
  });
  const payloadByKind = new Map(payloads.map((payload) => [payload.kind, payload]));
  const layers = plan.layers.map((spec) => {
    const payload = payloadByKind.get(spec.kind);
    if (!payload) {
      throw new StudioLtConvertError("invalid-input", "LT 변환 결과에 필요한 레이어가 없습니다.");
    }
    return {
      ...spec,
      src: serialize(payload.imageData),
      sourceWidth: payload.width,
      sourceHeight: payload.height,
    };
  });
  return { plan, layers };
}
