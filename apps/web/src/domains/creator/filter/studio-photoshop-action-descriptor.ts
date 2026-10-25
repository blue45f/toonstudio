/**
 * Adobe Photoshop Web (v2026.21.0.0) Action Descriptor (BatchPlay) 인터프리터,
 * 25종 블렌드 모드 컴포지터 및 NGE 씬 임포터 엔진
 *
 * REA 정적·라이브 번들 역공학(`ev_0fb6b10eccb962217a3bc3ff81417f7676422fa68a1e356b4b72b34f4007a9fa`,
 * `ev_1389c786e149edcb794d7345acc24456164a5b89c20bc5cac89540e43f7f60ff`,
 * `IntentHandler.chunk.KyQXWjcf.js`, `QuickActionsManager.chunk.OMsFMydh.js`,
 * `ag-psd/dist/descriptor.js`, `ag-psd/dist/additionalInfo.js`, `ag-psd/dist/helpers.js`)에서 추출한:
 * 1. `IntentHandler.Kt` 25종 블렌드 모드 매핑(`calculation_add` -> `plus`, `calculation_subtract` -> `minus` 포함)
 *    및 8BIM 4바이트 코드 양방향 변환 + 결정론적 RGBA 픽셀 합성기
 * 2. Photoshop Action Descriptor (`_obj`, `_target`, `_ref`, `_enum`, `_unit`, `_value`) 빌더 및 인터프리터
 *    (`make` adjustmentLayer/channel/layerSection, `select`, `set`, `hide`, `transform`, `gaussianBlur`)
 * 3. `IntentHandler.importNGEScene` 멀티레이어 NGE 씬(선택 마스크·필터 스택·트랜스폼·그룹화) 임포터를 클린룸 구현한다.
 */

export const PHOTOSHOP_BLEND_MODES = [
  "normal",
  "passThrough",
  "dissolve",
  "darken",
  "multiply",
  "colorburn",
  "linearburn",
  "darkercolor",
  "lighten",
  "screen",
  "colordodge",
  "lineardodge",
  "lightercolor",
  "overlay",
  "softlight",
  "hardlight",
  "vividlight",
  "linearlight",
  "pinlight",
  "hardmix",
  "difference",
  "exclusion",
  "divide",
  "plus",
  "minus",
] as const;

export type PhotoshopBlendMode = (typeof PHOTOSHOP_BLEND_MODES)[number];

/**
 * `IntentHandler.chunk.KyQXWjcf.js`의 `Kt` 블렌드 모드 정규화 테이블.
 */
export const PHOTOSHOP_INTENT_BLEND_MODE_MAP: Readonly<
  Record<string, PhotoshopBlendMode>
> = Object.freeze({
  normal: "normal",
  passThrough: "passThrough",
  dissolve: "dissolve",
  darken: "darken",
  multiply: "multiply",
  colorburn: "colorburn",
  linearburn: "linearburn",
  darkercolor: "darkercolor",
  lighten: "lighten",
  screen: "screen",
  colordodge: "colordodge",
  lineardodge: "lineardodge",
  lightercolor: "lightercolor",
  overlay: "overlay",
  softlight: "softlight",
  hardlight: "hardlight",
  vividlight: "vividlight",
  linearlight: "linearlight",
  pinlight: "pinlight",
  hardmix: "hardmix",
  difference: "difference",
  exclusion: "exclusion",
  divide: "divide",
  calculation_add: "plus",
  calculation_subtract: "minus",
  plus: "plus",
  minus: "minus",
});

/**
 * PSD 8BIM 4바이트 블렌드 모드 시그니처 매핑 (`ag-psd/dist/helpers.js` 준거).
 */
export const PHOTOSHOP_BLEND_MODE_TO_8BIM: Readonly<
  Record<PhotoshopBlendMode, string>
> = Object.freeze({
  normal: "norm",
  passThrough: "pass",
  dissolve: "diss",
  darken: "dark",
  multiply: "mul ",
  colorburn: "idiv",
  linearburn: "lbrn",
  darkercolor: "dkCl",
  lighten: "lite",
  screen: "scrn",
  colordodge: "div ",
  lineardodge: "lddg",
  lightercolor: "lgCl",
  overlay: "over",
  softlight: "sLit",
  hardlight: "hLit",
  vividlight: "vLit",
  linearlight: "lLit",
  pinlight: "pLit",
  hardmix: "hMix",
  difference: "diff",
  exclusion: "smud",
  divide: "fdiv",
  plus: "add ",
  minus: "fsub",
});

export function resolvePhotoshopBlendMode(rawMode: string | undefined): PhotoshopBlendMode {
  if (!rawMode) return "normal";
  if (Object.hasOwn(PHOTOSHOP_INTENT_BLEND_MODE_MAP, rawMode)) {
    return PHOTOSHOP_INTENT_BLEND_MODE_MAP[rawMode]!;
  }
  const by8Bim = (Object.entries(PHOTOSHOP_BLEND_MODE_TO_8BIM) as Array<
    [PhotoshopBlendMode, string]
  >).find(([, code]) => code === rawMode);
  return by8Bim ? by8Bim[0] : "normal";
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function clampByte(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(255, Math.max(0, Math.round(value)));
}

function blendSingleChannel(base: number, top: number, mode: PhotoshopBlendMode): number {
  const b = clamp01(base);
  const s = clamp01(top);
  switch (mode) {
    case "normal":
    case "passThrough":
    case "dissolve":
      return s;
    case "darken":
      return Math.min(b, s);
    case "multiply":
      return b * s;
    case "colorburn":
      return s <= 0.0001 ? 0 : 1 - Math.min(1, (1 - b) / s);
    case "linearburn":
      return Math.max(0, b + s - 1);
    case "lighten":
      return Math.max(b, s);
    case "screen":
      return 1 - (1 - b) * (1 - s);
    case "colordodge":
      return s >= 0.9999 ? 1 : Math.min(1, b / (1 - s));
    case "lineardodge":
    case "plus":
      return Math.min(1, b + s);
    case "overlay":
      return b < 0.5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s);
    case "softlight":
      return s <= 0.5
        ? b - (1 - 2 * s) * b * (1 - b)
        : b + (2 * s - 1) * ((b <= 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b)) - b);
    case "hardlight":
      return s < 0.5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s);
    case "vividlight":
      return s <= 0.5
        ? s <= 0.0001
          ? 0
          : 1 - Math.min(1, (1 - b) / (2 * s))
        : s >= 0.9999
          ? 1
          : Math.min(1, b / (2 * (1 - s)));
    case "linearlight":
      return clamp01(b + 2 * s - 1);
    case "pinlight":
      return s < 0.5 ? Math.min(b, 2 * s) : Math.max(b, 2 * (s - 0.5));
    case "hardmix":
      return b + s >= 1 ? 1 : 0;
    case "difference":
      return Math.abs(b - s);
    case "exclusion":
      return b + s - 2 * b * s;
    case "divide":
      return s <= 0.0001 ? 1 : Math.min(1, b / s);
    case "minus":
      return Math.max(0, b - s);
    case "darkercolor":
    case "lightercolor":
      return s;
  }
}

/**
 * 25종 포토샵 블렌드 모드를 사용해 두 RGBA 버퍼를 결정론적으로 합성한다.
 */
export function blendPhotoshopPixelsRgba(
  baseRgba: Uint8ClampedArray,
  blendRgba: Uint8ClampedArray,
  mode: PhotoshopBlendMode,
  opacity01 = 1,
): Uint8ClampedArray {
  const length = Math.min(baseRgba.length, blendRgba.length);
  const out = new Uint8ClampedArray(length);
  const alphaScale = clamp01(opacity01);

  for (let i = 0; i < length; i += 4) {
    const br = (baseRgba[i] ?? 0) / 255;
    const bg = (baseRgba[i + 1] ?? 0) / 255;
    const bb = (baseRgba[i + 2] ?? 0) / 255;
    const ba = (baseRgba[i + 3] ?? 255) / 255;

    const sr = (blendRgba[i] ?? 0) / 255;
    const sg = (blendRgba[i + 1] ?? 0) / 255;
    const sb = (blendRgba[i + 2] ?? 0) / 255;
    const sa = ((blendRgba[i + 3] ?? 255) / 255) * alphaScale;

    if (mode === "dissolve") {
      const pixelIndex = i / 4;
      const pseudoRand = Math.abs(Math.sin(pixelIndex * 12.9898 + 78.233) * 43758.5453) % 1;
      const pickTop = pseudoRand <= sa;
      out[i] = clampByte((pickTop ? sr : br) * 255);
      out[i + 1] = clampByte((pickTop ? sg : bg) * 255);
      out[i + 2] = clampByte((pickTop ? sb : bb) * 255);
      out[i + 3] = clampByte((pickTop ? 1 : ba) * 255);
      continue;
    }

    let cr: number;
    let cg: number;
    let cb: number;
    if (mode === "darkercolor" || mode === "lightercolor") {
      const baseLuma = 0.2126 * br + 0.7152 * bg + 0.0722 * bb;
      const topLuma = 0.2126 * sr + 0.7152 * sg + 0.0722 * sb;
      const chooseTop = mode === "darkercolor" ? topLuma < baseLuma : topLuma > baseLuma;
      cr = chooseTop ? sr : br;
      cg = chooseTop ? sg : bg;
      cb = chooseTop ? sb : bb;
    } else {
      cr = blendSingleChannel(br, sr, mode);
      cg = blendSingleChannel(bg, sg, mode);
      cb = blendSingleChannel(bb, sb, mode);
    }

    const rr = br * (1 - sa) + cr * sa;
    const rg = bg * (1 - sa) + cg * sa;
    const rb = bb * (1 - sa) + cb * sa;
    const ra = ba + sa * (1 - ba);

    out[i] = clampByte(rr * 255);
    out[i + 1] = clampByte(rg * 255);
    out[i + 2] = clampByte(rb * 255);
    out[i + 3] = clampByte(ra * 255);
  }

  return out;
}

// ---------------------------------------------------------------------------
// Action Descriptor (BatchPlay) JSON 생성기 (`IntentHandler.chunk.KyQXWjcf.js` 준거)
// ---------------------------------------------------------------------------

export interface PhotoshopActionDescriptor {
  readonly _obj: string;
  readonly _target?: ReadonlyArray<Record<string, unknown>>;
  readonly [key: string]: unknown;
}

export function buildBlackAndWhiteAdjustmentAction(params: {
  readonly red: number;
  readonly yellow: number;
  readonly green: number;
  readonly cyan: number;
  readonly blue: number;
  readonly magenta: number;
  readonly useTint?: boolean;
  readonly tintColor?: { readonly r: number; readonly g: number; readonly b: number };
}): PhotoshopActionDescriptor {
  const tintColor = params.tintColor ?? { r: 225.000458, g: 211.000671, b: 179.00116 };
  return {
    _obj: "make",
    _target: [{ _ref: "adjustmentLayer" }],
    using: {
      _obj: "adjustmentLayer",
      type: {
        _obj: "blackAndWhite",
        presetKind: {
          _enum: "presetKindType",
          _value: "presetKindDefault",
        },
        red: params.red,
        yellow: params.yellow,
        green: params.green,
        cyan: params.cyan,
        blue: params.blue,
        magenta: params.magenta,
        useTint: params.useTint ?? false,
        tintColor: {
          _obj: "RGBColor",
          red: tintColor.r,
          grain: tintColor.g,
          blue: tintColor.b,
        },
      },
    },
  };
}

export function buildBrightnessContrastAdjustmentAction(params: {
  readonly brightness: number;
  readonly contrast: number;
  readonly useLegacy?: boolean;
}): PhotoshopActionDescriptor {
  return {
    _obj: "make",
    _target: [{ _ref: "adjustmentLayer" }],
    using: {
      _obj: "adjustmentLayer",
      type: {
        _obj: "brightnessEvent",
        brightness: params.brightness,
        center: params.contrast,
        useLegacy: params.useLegacy ?? false,
      },
    },
  };
}

export function buildHueSaturationAdjustmentAction(params: {
  readonly hue: number;
  readonly saturation: number;
  readonly lightness: number;
  readonly colorize?: boolean;
}): PhotoshopActionDescriptor {
  return {
    _obj: "make",
    _target: [{ _ref: "adjustmentLayer" }],
    using: {
      _obj: "adjustmentLayer",
      type: {
        _obj: "hueSaturation",
        presetKind: {
          _enum: "presetKindType",
          _value: "presetKindDefault",
        },
        colorize: params.colorize ?? false,
        adjustment: [
          {
            _obj: "hueSatAdjustmentV2",
            hue: params.hue,
            saturation: params.saturation,
            lightness: params.lightness,
          },
        ],
      },
    },
  };
}

export function buildVibranceAdjustmentAction(params: {
  readonly vibrance: number;
  readonly saturation: number;
}): PhotoshopActionDescriptor {
  return {
    _obj: "make",
    _target: [{ _ref: "adjustmentLayer" }],
    using: {
      _obj: "adjustmentLayer",
      type: {
        _obj: "vibrance",
        vibrance: params.vibrance,
        saturation: params.saturation,
      },
    },
  };
}

export function buildExposureAdjustmentAction(params: {
  readonly exposure: number;
  readonly offset: number;
  readonly gammaCorrection: number;
}): PhotoshopActionDescriptor {
  return {
    _obj: "make",
    _target: [{ _ref: "adjustmentLayer" }],
    using: {
      _obj: "adjustmentLayer",
      type: {
        _obj: "exposure",
        presetKind: {
          _enum: "presetKindType",
          _value: "presetKindDefault",
        },
        exposure: params.exposure,
        offset: params.offset,
        gammaCorrection: params.gammaCorrection,
      },
    },
  };
}

export function buildGaussianBlurAction(radiusPx: number): PhotoshopActionDescriptor {
  return {
    _obj: "gaussianBlur",
    radius: {
      _unit: "pixelsUnit",
      _value: radiusPx,
    },
  };
}

export function buildRevealSelectionMaskAction(): PhotoshopActionDescriptor {
  return {
    _obj: "make",
    at: { _enum: "channel", _ref: "channel", _value: "mask" },
    new: { _class: "channel" },
    using: { _enum: "userMaskEnabled", _value: "revealSelection" },
  };
}

export function buildFreeTransformAction(params: {
  readonly offsetX: number;
  readonly offsetY: number;
  readonly widthPct: number;
  readonly heightPct: number;
  readonly angleDeg: number;
}): PhotoshopActionDescriptor {
  return {
    _obj: "transform",
    _target: [{ _enum: "ordinal", _ref: "layer", _value: "targetEnum" }],
    freeTransformCenterState: {
      _enum: "quadCenterState",
      _value: "QCSAverage",
    },
    offset: {
      _obj: "offset",
      horizontal: { _unit: "pixelsUnit", _value: params.offsetX },
      vertical: { _unit: "pixelsUnit", _value: params.offsetY },
    },
    width: { _unit: "percentUnit", _value: params.widthPct },
    height: { _unit: "percentUnit", _value: params.heightPct },
    angle: { _unit: "angleUnit", _value: params.angleDeg },
    interfaceIconFrameDimmed: {
      _enum: "interpolationType",
      _value: "bicubic",
    },
  };
}

export function buildGroupSelectedLayersAction(
  layerNames: readonly string[],
  groupName: string,
): readonly PhotoshopActionDescriptor[] {
  if (layerNames.length === 0) return [];
  const first = layerNames[0]!;
  const last = layerNames[layerNames.length - 1]!;
  return [
    {
      _obj: "select",
      _target: [{ _name: first, _ref: "layer" }],
      makeVisible: false,
    },
    {
      _obj: "select",
      _target: [{ _name: last, _ref: "layer" }],
      makeVisible: false,
      selectionModifier: {
        _enum: "selectionModifierType",
        _value: "addToSelectionContinuous",
      },
    },
    {
      _obj: "make",
      _target: [{ _ref: "layerSection" }],
      from: { _enum: "ordinal", _ref: "layer", _value: "targetLayers" },
      using: { _obj: "layerSection", name: groupName },
    },
  ];
}

// ---------------------------------------------------------------------------
// Action Descriptor 인터프리터 및 NGE Scene 임포터
// ---------------------------------------------------------------------------

export interface PhotoshopBatchPlayLayerNode {
  readonly id: string;
  readonly name: string;
  readonly kind: "pixel" | "adjustment" | "layerSection";
  readonly adjustmentType?: string;
  readonly visible: boolean;
  readonly blendMode: PhotoshopBlendMode;
  readonly opacity: number;
  readonly hasRevealSelectionMask: boolean;
  readonly gaussianBlurRadiusPx?: number;
  readonly transform?: {
    readonly offsetX: number;
    readonly offsetY: number;
    readonly widthPct: number;
    readonly heightPct: number;
    readonly angleDeg: number;
  };
  readonly childLayerIds?: readonly string[];
}

export interface PhotoshopBatchPlayDocumentState {
  readonly layers: readonly PhotoshopBatchPlayLayerNode[];
  readonly selectedLayerIds: readonly string[];
}

export function executePhotoshopActionDescriptors(
  initialState: PhotoshopBatchPlayDocumentState,
  descriptors: readonly PhotoshopActionDescriptor[],
): PhotoshopBatchPlayDocumentState {
  const layers = [...initialState.layers];
  let selectedIds = [...initialState.selectedLayerIds];

  const getTargetIndex = (target: ReadonlyArray<Record<string, unknown>> | undefined): number => {
    const first = target?.[0];
    if (!first) return layers.findIndex((l) => l.id === selectedIds[0]);
    if (typeof first._name === "string") {
      return layers.findIndex((l) => l.name === first._name);
    }
    if (first._value === "previous") {
      const curr = layers.findIndex((l) => l.id === selectedIds[0]);
      return curr > 0 ? curr - 1 : -1;
    }
    return layers.findIndex((l) => l.id === selectedIds[0]);
  };

  descriptors.forEach((desc, stepIdx) => {
    switch (desc._obj) {
      case "make": {
        const targetRef = desc._target?.[0]?._ref;
        if (targetRef === "adjustmentLayer") {
          const usingObj = desc.using as Record<string, unknown> | undefined;
          const typeObj = usingObj?.type as Record<string, unknown> | undefined;
          const adjType = typeof typeObj?._obj === "string" ? typeObj._obj : "curves";
          const newId = `adj-${adjType}-${layers.length + 1}-${stepIdx}`;
          const newNode: PhotoshopBatchPlayLayerNode = {
            id: newId,
            name: `${adjType} ${layers.length + 1}`,
            kind: "adjustment",
            adjustmentType: adjType,
            visible: true,
            blendMode: "normal",
            opacity: 100,
            hasRevealSelectionMask: false,
          };
          layers.push(newNode);
          selectedIds = [newId];
        } else if (desc.at && (desc.at as Record<string, unknown>)._value === "mask") {
          const idx = getTargetIndex(desc._target);
          if (idx >= 0) {
            layers[idx] = { ...layers[idx]!, hasRevealSelectionMask: true };
          }
        } else if (targetRef === "layerSection") {
          const usingObj = desc.using as Record<string, unknown> | undefined;
          const groupName = typeof usingObj?.name === "string" ? usingObj.name : "Group";
          const groupId = `group-${layers.length + 1}-${stepIdx}`;
          const groupNode: PhotoshopBatchPlayLayerNode = {
            id: groupId,
            name: groupName,
            kind: "layerSection",
            visible: true,
            blendMode: "passThrough",
            opacity: 100,
            hasRevealSelectionMask: false,
            childLayerIds: [...selectedIds],
          };
          layers.push(groupNode);
          selectedIds = [groupId];
        }
        break;
      }
      case "select": {
        const idx = getTargetIndex(desc._target);
        if (idx >= 0) {
          const targetId = layers[idx]!.id;
          const modifier = (desc.selectionModifier as Record<string, unknown> | undefined)?._value;
          if (modifier === "addToSelectionContinuous" && selectedIds.length > 0) {
            const startIdx = layers.findIndex((l) => l.id === selectedIds[0]);
            if (startIdx >= 0) {
              const lo = Math.min(startIdx, idx);
              const hi = Math.max(startIdx, idx);
              selectedIds = layers.slice(lo, hi + 1).map((l) => l.id);
            }
          } else {
            selectedIds = [targetId];
          }
        }
        break;
      }
      case "set": {
        const idx = getTargetIndex(desc._target);
        if (idx >= 0) {
          const toObj = desc.to as Record<string, unknown> | undefined;
          const nextName = typeof toObj?.name === "string" ? toObj.name : layers[idx]!.name;
          layers[idx] = { ...layers[idx]!, name: nextName };
        }
        break;
      }
      case "hide": {
        const idx = getTargetIndex(desc._target);
        if (idx >= 0) {
          layers[idx] = { ...layers[idx]!, visible: false };
        }
        break;
      }
      case "transform": {
        const idx = getTargetIndex(desc._target);
        if (idx >= 0) {
          const offsetObj = desc.offset as Record<string, Record<string, number>> | undefined;
          const widthObj = desc.width as Record<string, number> | undefined;
          const heightObj = desc.height as Record<string, number> | undefined;
          const angleObj = desc.angle as Record<string, number> | undefined;
          layers[idx] = {
            ...layers[idx]!,
            transform: {
              offsetX: offsetObj?.horizontal?._value ?? 0,
              offsetY: offsetObj?.vertical?._value ?? 0,
              widthPct: widthObj?._value ?? 100,
              heightPct: heightObj?._value ?? 100,
              angleDeg: angleObj?._value ?? 0,
            },
          };
        }
        break;
      }
      case "gaussianBlur": {
        const idx = getTargetIndex(desc._target);
        if (idx >= 0) {
          const radiusObj = desc.radius as Record<string, number> | undefined;
          layers[idx] = {
            ...layers[idx]!,
            gaussianBlurRadiusPx: radiusObj?._value ?? 0,
          };
        }
        break;
      }
    }
  });

  return {
    layers,
    selectedLayerIds: selectedIds,
  };
}

export interface PhotoshopNgeSceneFilterSpec {
  readonly type:
    | "blackAndWhite"
    | "brightnessContrast"
    | "hueSaturation"
    | "vibrance"
    | "exposure"
    | "gaussianBlur";
  readonly params: Record<string, number | boolean>;
}

export interface PhotoshopNgeSceneLayerSpec {
  readonly name: string;
  readonly visible?: boolean;
  readonly opacity?: number;
  readonly blendMode?: string;
  readonly hasSelectionMask?: boolean;
  readonly transform?: {
    readonly offsetX: number;
    readonly offsetY: number;
    readonly widthPct: number;
    readonly heightPct: number;
    readonly angleDeg: number;
  };
  readonly filters?: readonly PhotoshopNgeSceneFilterSpec[];
}

/**
 * `IntentHandler.importNGEScene` 멀티레이어 씬 임포트 파이프라인을 실행한다.
 */
export function importPhotoshopNgeScene(
  sceneLayers: readonly PhotoshopNgeSceneLayerSpec[],
): {
  readonly documentState: PhotoshopBatchPlayDocumentState;
  readonly descriptors: readonly PhotoshopActionDescriptor[];
} {
  let state: PhotoshopBatchPlayDocumentState = {
    layers: [],
    selectedLayerIds: [],
  };
  const allDescriptors: PhotoshopActionDescriptor[] = [];

  for (const spec of sceneLayers) {
    const baseId = `nge-layer-${state.layers.length + 1}`;
    const baseNode: PhotoshopBatchPlayLayerNode = {
      id: baseId,
      name: spec.name,
      kind: "pixel",
      visible: spec.visible ?? true,
      blendMode: resolvePhotoshopBlendMode(spec.blendMode),
      opacity: spec.opacity ?? 100,
      hasRevealSelectionMask: false,
    };
    state = {
      layers: [...state.layers, baseNode],
      selectedLayerIds: [baseId],
    };

    const layerBatch: PhotoshopActionDescriptor[] = [];
    if (spec.hasSelectionMask) {
      layerBatch.push(buildRevealSelectionMaskAction());
    }
    if (spec.transform) {
      layerBatch.push(buildFreeTransformAction(spec.transform));
    }

    const groupableNames: string[] = [spec.name];
    for (const filter of spec.filters ?? []) {
      switch (filter.type) {
        case "blackAndWhite":
          layerBatch.push(
            buildBlackAndWhiteAdjustmentAction({
              red: Number(filter.params.red ?? 40),
              yellow: Number(filter.params.yellow ?? 60),
              green: Number(filter.params.green ?? 40),
              cyan: Number(filter.params.cyan ?? 60),
              blue: Number(filter.params.blue ?? 20),
              magenta: Number(filter.params.magenta ?? 80),
              useTint: Boolean(filter.params.useTint ?? false),
            }),
          );
          break;
        case "brightnessContrast":
          layerBatch.push(
            buildBrightnessContrastAdjustmentAction({
              brightness: Number(filter.params.brightness ?? 0),
              contrast: Number(filter.params.contrast ?? 0),
            }),
          );
          break;
        case "hueSaturation":
          layerBatch.push(
            buildHueSaturationAdjustmentAction({
              hue: Number(filter.params.hue ?? 0),
              saturation: Number(filter.params.saturation ?? 0),
              lightness: Number(filter.params.lightness ?? 0),
            }),
          );
          break;
        case "vibrance":
          layerBatch.push(
            buildVibranceAdjustmentAction({
              vibrance: Number(filter.params.vibrance ?? 0),
              saturation: Number(filter.params.saturation ?? 0),
            }),
          );
          break;
        case "exposure":
          layerBatch.push(
            buildExposureAdjustmentAction({
              exposure: Number(filter.params.exposure ?? 0),
              offset: Number(filter.params.offset ?? 0),
              gammaCorrection: Number(filter.params.gammaCorrection ?? 1),
            }),
          );
          break;
        case "gaussianBlur":
          layerBatch.push(buildGaussianBlurAction(Number(filter.params.radius ?? 5)));
          break;
      }
    }

    state = executePhotoshopActionDescriptors(state, layerBatch);
    allDescriptors.push(...layerBatch);

    if ((spec.filters ?? []).some((f) => f.type !== "gaussianBlur")) {
      const latestLayer = state.layers[state.layers.length - 1]!;
      groupableNames.push(latestLayer.name);
      const groupBatch = buildGroupSelectedLayersAction(
        groupableNames,
        `${spec.name} Group`,
      );
      state = executePhotoshopActionDescriptors(state, groupBatch);
      allDescriptors.push(...groupBatch);
    }
  }

  return {
    documentState: state,
    descriptors: allDescriptors,
  };
}
