/**
 * studio-procreate-superpowers.ts
 *
 * REA(`reverse-engineer-anything`)를 통해 역공학한 Procreate 핵심 워크플로우 슈퍼파워 전 영역:
 * 1. Color Harmony (5모드 색상 조화 레티클), ColorDrop (드래그 임계값 + Reference Layer + Continue Filling 연속 채우기),
 *    Color Naming Notifications & Eyedropper Color Reader (접근성 색상 이름 설명)
 * 2. QuickMenu (6슬롯 방사형 플릭 메뉴 + 다중 프로필 + Page Assist 페이지 넘김 액션)
 * 3. Drawing Guides & Drawing Assist (`2D Grid`, `Isometric`, `Perspective` 1/2/3소실점, `Symmetry` 미러/회전 대칭)
 * 4. Animation Assist (전경 `Foreground`/배경 `Background` 고정 핀, 프레임 Hold, 커스텀 어니언 스킨 색상, `Ping-Pong`)
 * 5. Page Assist (마스터 배경 레이어 + 다중 페이지 스토리보드/PDF 덱 구성)
 * 6. 3D Lighting Studio · Single-Touch Gestures · `.swatches`/`.brush`/`.procreate` 네이티브 코덱 (`studio-procreate-silica-codecs.ts` 연동)
 */

const clamp = (v: number, min: number, max: number): number =>
  !Number.isFinite(v) ? min : v < min ? min : v > max ? max : v;

function hsvToRgb01(h01: number, s01: number, v01: number): { r: number; g: number; b: number } {
  const h = ((h01 % 1) + 1) % 1;
  const s = clamp(s01, 0, 1);
  const v = clamp(v01, 0, 1);
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0:
      return { r: v, g: t, b: p };
    case 1:
      return { r: q, g: v, b: p };
    case 2:
      return { r: p, g: v, b: t };
    case 3:
      return { r: p, g: q, b: v };
    case 4:
      return { r: t, g: p, b: v };
    default:
      return { r: v, g: p, b: q };
  }
}

function rgb01ToHex(rgb: { readonly r: number; readonly g: number; readonly b: number }): string {
  const toHex = (c: number) =>
    Math.max(0, Math.min(255, Math.round(c * 255)))
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

/* ============================================================================
 * 1. Color Harmony, Accessible Color Naming & ColorDrop (Continue Filling)
 * ========================================================================== */

export type ProcreateColorHarmonyMode =
  | "complementary"
  | "split-complementary"
  | "analogous"
  | "triadic"
  | "tetradic";

export interface ProcreateHarmonyNode {
  readonly role: "primary" | "secondary";
  readonly hue01: number;
  readonly saturation01: number;
  readonly brightness01: number;
  readonly hex: string;
  readonly reticleX: number;
  readonly reticleY: number;
}

export function computeProcreateColorHarmony(input: {
  readonly hue01: number;
  readonly saturation01: number;
  readonly brightness01: number;
  readonly mode: ProcreateColorHarmonyMode;
}): readonly ProcreateHarmonyNode[] {
  const h = ((input.hue01 % 1) + 1) % 1;
  const s = clamp(input.saturation01, 0, 1);
  const v = clamp(input.brightness01, 0, 1);

  const offsetsDeg: Record<ProcreateColorHarmonyMode, readonly number[]> = {
    complementary: [0, 180],
    "split-complementary": [0, 150, 210],
    analogous: [0, -30, 30],
    triadic: [0, 120, 240],
    tetradic: [0, 90, 180, 270],
  };

  return offsetsDeg[input.mode].map((deg, idx) => {
    const nodeHue01 = (((h + deg / 360) % 1) + 1) % 1;
    const angleRad = nodeHue01 * Math.PI * 2;
    const rgb = hsvToRgb01(nodeHue01, s, v);
    return {
      role: idx === 0 ? "primary" : "secondary",
      hue01: nodeHue01,
      saturation01: s,
      brightness01: v,
      hex: rgb01ToHex(rgb),
      reticleX: Math.round(Math.cos(angleRad) * s * 1000) / 1000,
      reticleY: Math.round(Math.sin(angleRad) * s * 1000) / 1000,
    };
  });
}

export function describeProcreateAccessibleColorName(input: {
  readonly hue01: number;
  readonly saturation01: number;
  readonly brightness01: number;
}): {
  readonly nameEn: string;
  readonly nameKo: string;
  readonly shadeModifierKo: string;
  readonly hueFamilyKo: string;
} {
  const hDeg = (((input.hue01 % 1) + 1) % 1) * 360;
  const s = clamp(input.saturation01, 0, 1);
  const v = clamp(input.brightness01, 0, 1);

  if (v <= 0.08) {
    return {
      nameEn: "Pitch Black",
      nameKo: "칠흑 같은 블랙",
      shadeModifierKo: "칠흑 같은",
      hueFamilyKo: "블랙",
    };
  }
  if (s <= 0.08) {
    if (v >= 0.92) {
      return {
        nameEn: "Pure White",
        nameKo: "순수한 화이트",
        shadeModifierKo: "순수한",
        hueFamilyKo: "화이트",
      };
    }
    const grayEn = v >= 0.65 ? "Light Gray" : v >= 0.35 ? "Medium Gray" : "Charcoal Gray";
    const grayKo = v >= 0.65 ? "밝은 그레이" : v >= 0.35 ? "미디엄 그레이" : "차콜 그레이";
    return {
      nameEn: grayEn,
      nameKo: grayKo,
      shadeModifierKo: v >= 0.65 ? "밝은" : v >= 0.35 ? "미디엄" : "차콜",
      hueFamilyKo: "그레이",
    };
  }

  let shadeEn = "Vivid";
  let shadeKo = "선명한";
  if (v < 0.35) {
    shadeEn = "Deep Dark";
    shadeKo = "깊고 어두운";
  } else if (v > 0.82 && s < 0.45) {
    shadeEn = "Pale Pastel";
    shadeKo = "은은한 파스텔";
  } else if (s < 0.45) {
    shadeEn = "Muted";
    shadeKo = "차분한";
  } else if (v > 0.85) {
    shadeEn = "Bright";
    shadeKo = "밝고 선명한";
  }

  const hueTable: readonly { readonly maxDeg: number; readonly en: string; readonly ko: string }[] = [
    { maxDeg: 18, en: "Crimson Red", ko: "크림슨 레드" },
    { maxDeg: 45, en: "Amber Orange", ko: "앰버 오렌지" },
    { maxDeg: 70, en: "Golden Yellow", ko: "골든 옐로우" },
    { maxDeg: 155, en: "Emerald Green", ko: "에메랄드 그린" },
    { maxDeg: 195, en: "Teal Cyan", ko: "틸 시안" },
    { maxDeg: 255, en: "Cobalt Blue", ko: "코발트 블루" },
    { maxDeg: 295, en: "Royal Violet", ko: "로열 바이올렛" },
    { maxDeg: 340, en: "Rose Magenta", ko: "로즈 마젠타" },
    { maxDeg: 360, en: "Crimson Red", ko: "크림슨 레드" },
  ];

  const matched = hueTable.find((item) => hDeg <= item.maxDeg) ?? hueTable[0]!;
  return {
    nameEn: `${shadeEn} ${matched.en}`,
    nameKo: `${shadeKo} ${matched.ko}`,
    shadeModifierKo: shadeKo,
    hueFamilyKo: matched.ko,
  };
}

export interface ProcreateColorDropOptions {
  readonly width: number;
  readonly height: number;
  readonly threshold01: number;
  readonly fillColorRgba: readonly [number, number, number, number];
  readonly seeds: readonly { readonly x: number; readonly y: number }[];
  readonly referenceLayerRgba?: Uint8ClampedArray;
}

export interface ProcreateColorDropResult {
  readonly filledRgba: Uint8ClampedArray;
  readonly filledPixelCount: number;
  readonly effectiveThresholdDist: number;
}

export function executeProcreateColorDrop(
  targetLayerRgba: Uint8ClampedArray,
  options: ProcreateColorDropOptions,
): ProcreateColorDropResult {
  const { width, height, fillColorRgba, seeds } = options;
  const out = new Uint8ClampedArray(targetLayerRgba);
  const boundarySource = options.referenceLayerRgba ?? targetLayerRgba;
  const threshold01 = clamp(options.threshold01, 0, 1);
  const maxDist = threshold01 * 441.67;
  const visited = new Uint8Array(width * height);
  let filledPixelCount = 0;

  for (const seed of seeds) {
    const sx = Math.round(seed.x);
    const sy = Math.round(seed.y);
    if (sx < 0 || sx >= width || sy < 0 || sy >= height) continue;

    const startIdx = sy * width + sx;
    if (visited[startIdx] === 1) continue;

    const refBase = startIdx * 4;
    const seedR = boundarySource[refBase] ?? 0;
    const seedG = boundarySource[refBase + 1] ?? 0;
    const seedB = boundarySource[refBase + 2] ?? 0;
    const seedA = boundarySource[refBase + 3] ?? 0;

    const queue: number[] = [startIdx];
    visited[startIdx] = 1;

    while (queue.length > 0) {
      const curr = queue.pop()!;
      const dstBase = curr * 4;
      out[dstBase] = fillColorRgba[0];
      out[dstBase + 1] = fillColorRgba[1];
      out[dstBase + 2] = fillColorRgba[2];
      out[dstBase + 3] = fillColorRgba[3];
      filledPixelCount += 1;

      const cx = curr % width;
      const cy = Math.floor(curr / width);
      const neighbors = [
        cx > 0 ? curr - 1 : -1,
        cx < width - 1 ? curr + 1 : -1,
        cy > 0 ? curr - width : -1,
        cy < height - 1 ? curr + width : -1,
      ];

      for (const nIdx of neighbors) {
        if (nIdx < 0 || visited[nIdx] === 1) continue;
        const nBase = nIdx * 4;
        const dr = (boundarySource[nBase] ?? 0) - seedR;
        const dg = (boundarySource[nBase + 1] ?? 0) - seedG;
        const db = (boundarySource[nBase + 2] ?? 0) - seedB;
        const da = (boundarySource[nBase + 3] ?? 0) - seedA;
        const dist = Math.hypot(dr, dg, db, da * 0.5);
        if (dist <= maxDist + 1e-3) {
          visited[nIdx] = 1;
          queue.push(nIdx);
        }
      }
    }
  }

  return {
    filledRgba: out,
    filledPixelCount,
    effectiveThresholdDist: Math.round(maxDist * 100) / 100,
  };
}

/* ============================================================================
 * 2. QuickMenu 6-Slot Radial Flick & Profiles
 * ========================================================================== */

export type ProcreateQuickMenuSlotDirection =
  | "top"
  | "top-right"
  | "bottom-right"
  | "bottom"
  | "bottom-left"
  | "top-left";

export type ProcreateQuickMenuActionId =
  | "flip-horizontally"
  | "flip-vertically"
  | "fit-to-screen"
  | "clear-layer"
  | "alpha-lock"
  | "drawing-assist"
  | "merge-down"
  | "next-page"
  | "previous-page"
  | "recolor"
  | "reference-companion"
  | "actual-size";

export interface ProcreateQuickMenuProfile {
  readonly id: string;
  readonly nameKo: string;
  readonly slots: Readonly<Record<ProcreateQuickMenuSlotDirection, ProcreateQuickMenuActionId>>;
}

export const DEFAULT_PROCREATE_QUICK_MENU_PROFILES: readonly ProcreateQuickMenuProfile[] = [
  {
    id: "procreate-inking-default",
    nameKo: "기본 작화 프로필",
    slots: {
      top: "fit-to-screen",
      "top-right": "flip-horizontally",
      "bottom-right": "alpha-lock",
      bottom: "clear-layer",
      "bottom-left": "drawing-assist",
      "top-left": "reference-companion",
    },
  },
  {
    id: "procreate-page-assist-storyboard",
    nameKo: "페이지 어시스트 콘티 프로필",
    slots: {
      top: "fit-to-screen",
      "top-right": "next-page",
      "bottom-right": "recolor",
      bottom: "clear-layer",
      "bottom-left": "previous-page",
      "top-left": "flip-horizontally",
    },
  },
] as const;

export function resolveProcreateQuickMenuFlickSlot(input: {
  readonly originX: number;
  readonly originY: number;
  readonly flickX: number;
  readonly flickY: number;
  readonly minFlickDistancePx?: number;
  readonly profile?: ProcreateQuickMenuProfile;
}): {
  readonly triggered: boolean;
  readonly slot: ProcreateQuickMenuSlotDirection | null;
  readonly actionId: ProcreateQuickMenuActionId | null;
} {
  const dx = input.flickX - input.originX;
  const dy = input.flickY - input.originY;
  const dist = Math.hypot(dx, dy);
  const minDist = input.minFlickDistancePx ?? 24;
  const profile = input.profile ?? DEFAULT_PROCREATE_QUICK_MENU_PROFILES[0]!;

  if (dist < minDist) {
    return { triggered: false, slot: null, actionId: null };
  }

  const deg = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
  let slot: ProcreateQuickMenuSlotDirection;
  if (deg >= 240 && deg < 300) {
    slot = "top";
  } else if (deg >= 300 || deg < 0) {
    slot = "top-right";
  } else if (deg >= 0 && deg < 60) {
    slot = "bottom-right";
  } else if (deg >= 60 && deg < 120) {
    slot = "bottom";
  } else if (deg >= 120 && deg < 180) {
    slot = "bottom-left";
  } else {
    slot = "top-left";
  }

  return {
    triggered: true,
    slot,
    actionId: profile.slots[slot],
  };
}

/* ============================================================================
 * 3. Drawing Guides & Drawing Assist (2D Grid, Isometric, Perspective, Symmetry)
 * ========================================================================== */

export type ProcreateDrawingGuideMode =
  | "2d-grid"
  | "isometric"
  | "perspective"
  | "symmetry";

export type ProcreateSymmetryKind = "vertical" | "horizontal" | "quadrant" | "radial";

export interface ProcreateDrawingGuideConfig {
  readonly mode: ProcreateDrawingGuideMode;
  readonly gridSizePx: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly vanishingPoints?: readonly { readonly x: number; readonly y: number }[];
  readonly symmetryKind?: ProcreateSymmetryKind;
  readonly rotationalSymmetry?: boolean;
}

export function evaluateProcreateDrawingGuideAssist(
  anchor: { readonly x: number; readonly y: number },
  point: { readonly x: number; readonly y: number },
  config: ProcreateDrawingGuideConfig,
): {
  readonly snappedPoint: { readonly x: number; readonly y: number };
  readonly symmetryPoints: readonly { readonly x: number; readonly y: number }[];
} {
  const dx = point.x - anchor.x;
  const dy = point.y - anchor.y;
  const len = Math.hypot(dx, dy);

  if (config.mode === "2d-grid") {
    const snappedPoint =
      Math.abs(dx) >= Math.abs(dy)
        ? { x: point.x, y: anchor.y }
        : { x: anchor.x, y: point.y };
    return { snappedPoint, symmetryPoints: [snappedPoint] };
  }

  if (config.mode === "isometric") {
    const isoAngles = [Math.PI / 6, Math.PI / 2, (5 * Math.PI) / 6];
    let bestPt = { x: point.x, y: point.y };
    let bestProj = -1;
    for (const a of isoAngles) {
      const ux = Math.cos(a);
      const uy = Math.sin(a);
      const dot = dx * ux + dy * uy;
      if (Math.abs(dot) > bestProj) {
        bestProj = Math.abs(dot);
        bestPt = { x: anchor.x + ux * dot, y: anchor.y + uy * dot };
      }
    }
    return { snappedPoint: bestPt, symmetryPoints: [bestPt] };
  }

  if (config.mode === "perspective" && (config.vanishingPoints?.length ?? 0) > 0) {
    let bestPt = { x: point.x, y: point.y };
    let bestCos = -1;
    for (const vp of config.vanishingPoints!) {
      const vx = vp.x - anchor.x;
      const vy = vp.y - anchor.y;
      const vLen = Math.hypot(vx, vy);
      if (vLen < 1e-4 || len < 1e-4) continue;
      const ux = vx / vLen;
      const uy = vy / vLen;
      const dot = dx * ux + dy * uy;
      const cos = Math.abs(dot) / len;
      if (cos > bestCos) {
        bestCos = cos;
        bestPt = { x: anchor.x + ux * dot, y: anchor.y + uy * dot };
      }
    }
    return { snappedPoint: bestPt, symmetryPoints: [bestPt] };
  }

  const cx = config.centerX;
  const cy = config.centerY;
  const rx = point.x - cx;
  const ry = point.y - cy;
  const kind = config.symmetryKind ?? "vertical";
  const rotational = config.rotationalSymmetry ?? false;

  if (kind === "vertical") {
    return {
      snappedPoint: point,
      symmetryPoints: [
        point,
        rotational ? { x: cx - rx, y: cy - ry } : { x: cx - rx, y: cy + ry },
      ],
    };
  }
  if (kind === "horizontal") {
    return {
      snappedPoint: point,
      symmetryPoints: [
        point,
        rotational ? { x: cx - rx, y: cy - ry } : { x: cx + rx, y: cy - ry },
      ],
    };
  }
  if (kind === "quadrant") {
    const pts = rotational
      ? [
          { x: cx + rx, y: cy + ry },
          { x: cx - ry, y: cy + rx },
          { x: cx - rx, y: cy - ry },
          { x: cx + ry, y: cy - rx },
        ]
      : [
          { x: cx + rx, y: cy + ry },
          { x: cx - rx, y: cy + ry },
          { x: cx + rx, y: cy - ry },
          { x: cx - rx, y: cy - ry },
        ];
    return { snappedPoint: point, symmetryPoints: pts };
  }

  const radialPts: { x: number; y: number }[] = [];
  for (let k = 0; k < 4; k += 1) {
    const angle = (k * Math.PI) / 2;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const rotX = rx * cosA - ry * sinA;
    const rotY = rx * sinA + ry * cosA;
    radialPts.push({ x: cx + rotX, y: cy + rotY });
    radialPts.push(
      rotational
        ? {
            x: cx + (rx * Math.cos(angle + Math.PI / 4) - ry * Math.sin(angle + Math.PI / 4)),
            y: cy + (rx * Math.sin(angle + Math.PI / 4) + ry * Math.cos(angle + Math.PI / 4)),
          }
        : { x: cx - rotX, y: cy + rotY },
    );
  }
  return { snappedPoint: point, symmetryPoints: radialPts };
}

/* ============================================================================
 * 4. Animation Assist & Page Assist
 * ========================================================================== */

export interface ProcreateAnimationFrameSpec {
  readonly id: string;
  readonly label: string;
  readonly holdCount?: number;
  readonly isBackgroundPinned?: boolean;
  readonly isForegroundPinned?: boolean;
}

export interface ProcreateAnimationAssistPlan {
  readonly backgroundFrameId: string | null;
  readonly foregroundFrameId: string | null;
  readonly playbackTickOrder: readonly string[];
  readonly onionSkinsForActiveFrame: readonly {
    readonly frameId: string;
    readonly temporalRole: "past" | "future";
    readonly opacity01: number;
    readonly tintHex: string;
  }[];
}

export function buildProcreateAnimationAssistPlan(input: {
  readonly frames: readonly ProcreateAnimationFrameSpec[];
  readonly activeFrameId: string;
  readonly playbackMode: "loop" | "ping-pong" | "one-shot";
  readonly onionSkinCount: number;
  readonly onionSkinMaxOpacity01?: number;
  readonly pastFrameHex?: string;
  readonly futureFrameHex?: string;
}): ProcreateAnimationAssistPlan {
  const bgFrame = input.frames.find((f) => f.isBackgroundPinned) ?? null;
  const fgFrame = input.frames.find((f) => f.isForegroundPinned) ?? null;
  const animFrames = input.frames.filter(
    (f) => f.id !== bgFrame?.id && f.id !== fgFrame?.id,
  );

  const forwardTicks: string[] = [];
  for (const frame of animFrames) {
    const repeats = 1 + Math.max(0, Math.min(120, Math.floor(frame.holdCount ?? 0)));
    for (let r = 0; r < repeats; r += 1) {
      forwardTicks.push(frame.id);
    }
  }

  let playbackTickOrder = forwardTicks;
  if (input.playbackMode === "ping-pong" && forwardTicks.length > 2) {
    const reverseMiddle = forwardTicks.slice(1, -1).reverse();
    playbackTickOrder = [...forwardTicks, ...reverseMiddle];
  }

  const maxSkins = Math.max(0, Math.min(12, Math.floor(input.onionSkinCount)));
  const maxOpacity = clamp(input.onionSkinMaxOpacity01 ?? 0.65, 0.05, 1);
  const pastHex = input.pastFrameHex ?? "#ff3b30";
  const futureHex = input.futureFrameHex ?? "#34c759";

  const activeIdx = animFrames.findIndex((f) => f.id === input.activeFrameId);
  const onionSkins: {
    frameId: string;
    temporalRole: "past" | "future";
    opacity01: number;
    tintHex: string;
  }[] = [];

  if (activeIdx >= 0 && maxSkins > 0) {
    for (let step = 1; step <= maxSkins; step += 1) {
      const opacity01 =
        Math.round(maxOpacity * ((maxSkins - step + 1) / (maxSkins + 1)) * 100) / 100;
      const pastIdx = activeIdx - step;
      if (pastIdx >= 0 && animFrames[pastIdx]) {
        onionSkins.push({
          frameId: animFrames[pastIdx]!.id,
          temporalRole: "past",
          opacity01,
          tintHex: pastHex,
        });
      }
      const futureIdx = activeIdx + step;
      if (futureIdx < animFrames.length && animFrames[futureIdx]) {
        onionSkins.push({
          frameId: animFrames[futureIdx]!.id,
          temporalRole: "future",
          opacity01,
          tintHex: futureHex,
        });
      }
    }
  }

  return {
    backgroundFrameId: bgFrame?.id ?? null,
    foregroundFrameId: fgFrame?.id ?? null,
    playbackTickOrder,
    onionSkinsForActiveFrame: onionSkins,
  };
}

export function buildProcreatePageAssistDeck(input: {
  readonly layers: readonly { readonly id: string; readonly name: string; readonly visible: boolean }[];
  readonly pinBottomLayerAsMasterBackground: boolean;
}): {
  readonly masterBackgroundLayerId: string | null;
  readonly pages: readonly {
    readonly pageNumber: number;
    readonly layerId: string;
    readonly title: string;
  }[];
} {
  const visibleLayers = input.layers.filter((l) => l.visible);
  if (visibleLayers.length === 0) {
    return { masterBackgroundLayerId: null, pages: [] };
  }

  const masterBg =
    input.pinBottomLayerAsMasterBackground && visibleLayers.length > 1
      ? visibleLayers[0]!
      : null;
  const pageLayers = masterBg ? visibleLayers.slice(1) : visibleLayers;

  return {
    masterBackgroundLayerId: masterBg?.id ?? null,
    pages: pageLayers.map((layer, idx) => ({
      pageNumber: idx + 1,
      layerId: layer.id,
      title: layer.name,
    })),
  };
}

export {
  evaluateProcreate3dLightingStudio,
  evaluateProcreateSingleTouchGesture,
  parseProcreateSilicaBrushArchiveDescriptor,
  parseProcreateSilicaDocumentDescriptor,
  parseProcreateSwatchesJson,
  serializeProcreateSwatchesJson,
  type Procreate3dEnvironmentPresetId,
  type Procreate3dStudioLight,
  type ProcreateSwatchEntry,
  type ProcreateSwatchesPalette,
} from "./studio-procreate-silica-codecs";
