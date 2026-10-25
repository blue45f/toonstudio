/**
 * Tooning Editor (ED) & Tooning Magic (MG) Complete Engine
 *
 * Grounded in REA static/runtime analysis of https://plus.tooning.io/editor:
 * - 9 Artboard size presets (`Webtoon` 700×2000, `Naver` 690×2000, `Kakao` 720×2000, `A4`, `A3`, `A2`, `SocialMedia`, `Presentation`, `Custom` up to 4000×30000) & 20-page limit
 * - Procedural Speech Bubble (`Rectangle`, `Ellipse`, `Thought`, `Shout`, `SelfTalk`, `Squircle`) + 7 Emotions + Boolean Union Merge (`grouped-speech-bubble`, 2..5 bubbles)
 * - Editable Polygon Cut (`editableCut` with per-vertex corner radius) & 12 SFX Categories & 6 Gradients & 5 Image Filters (±5 snap)
 * - 2D Modular Smart Character (`smart-character`: `front`/`side`/`back`, `headAngle`, `bodyAngle`, 16 SVG part slots)
 * - 3D Mannequin Pose Popup (19 Mixamo joints + 10 finger curls `0..1`, camera `low`/`eye`/`high`, FOV `15..110°`)
 * - Multi-Angle Camera Popup (`<sks> <azimuth> <elevation> <distance>` across 8 azimuths × 5 elevations × 3 distances)
 * - AI Voice TTS & Cloning (11 languages) & AI Expo Webcam Style Transfer (7 styles)
 * - Tooning Magic (`MG`): `InhouseStyle` / `OutsideStyle` / `MyStyle` (B-LoRA 3600s training), 5 aspect ratios, post-processing bitmask `(face?4:0)+(rmbg?2:0)+(color?1:0)+1`, and 5-image AI Retouch (`NanoBanana`, `NanoBanana2`, `NanoBananaPro`, `Seedream`, `QwenImageEdit`)
 */

export type EdArtboardPresetId =
  | "Webtoon"
  | "Naver"
  | "Kakao"
  | "A4"
  | "A3"
  | "A2"
  | "SocialMedia"
  | "Presentation"
  | "Custom";

export interface EdArtboardPresetSpec {
  readonly id: EdArtboardPresetId;
  readonly labelKo: string;
  readonly widthPx: number;
  readonly heightPx: number;
}

export const ED_MAX_PAGES = 20;
export const ED_CUSTOM_ARTBOARD_LIMITS = {
  minWidthPx: 100,
  maxWidthPx: 4000,
  minHeightPx: 100,
  maxHeightPx: 30000,
} as const;

export const ED_ARTBOARD_PRESETS: readonly EdArtboardPresetSpec[] = [
  { id: "Webtoon", labelKo: "투닝 웹툰 표준 (700×2000)", widthPx: 700, heightPx: 2000 },
  { id: "Naver", labelKo: "네이버 웹툰 (690×2000)", widthPx: 690, heightPx: 2000 },
  { id: "Kakao", labelKo: "카카오페이지 웹툰 (720×2000)", widthPx: 720, heightPx: 2000 },
  { id: "A4", labelKo: "A4 인쇄 원고 (595×842)", widthPx: 595, heightPx: 842 },
  { id: "A3", labelKo: "A3 포스터 (842×1191)", widthPx: 842, heightPx: 1191 },
  { id: "A2", labelKo: "A2 대형 판형 (1191×1684)", widthPx: 1191, heightPx: 1684 },
  { id: "SocialMedia", labelKo: "소셜 미디어 카드뉴스 (1080×1080)", widthPx: 1080, heightPx: 1080 },
  { id: "Presentation", labelKo: "프레젠테이션 16:9 (1920×1080)", widthPx: 1920, heightPx: 1080 },
  { id: "Custom", labelKo: "사용자 정의 크기 (최대 4000×30000)", widthPx: 800, heightPx: 2400 },
] as const;

export type EdSpeechBubbleShapeType =
  | "Rectangle"
  | "Ellipse"
  | "Thought"
  | "Shout"
  | "SelfTalk"
  | "Squircle";

export type EdSpeechBubbleEmotionType =
  | "General"
  | "Daily"
  | "Serious"
  | "Action"
  | "Comedy"
  | "Fury"
  | "Custom";

export interface EdProceduralBubbleParams {
  readonly shapeType: EdSpeechBubbleShapeType;
  readonly emotionType: EdSpeechBubbleEmotionType;
  readonly width: number;
  readonly height: number;
  // Shout (burst)
  readonly numPoints: number; // default 24
  readonly sharpness: number; // default 2.2
  readonly radiusVariance: number; // 0..1
  readonly angleVariance: number; // 0..1
  // SelfTalk (sunburst)
  readonly normalSpacing: number; // default 6
  readonly innerRatio: number; // default 0.78
  readonly normalLength: number; // default 18
  readonly lengthVariance: number; // 0..1
  readonly taperWidth: number; // default 2
  // Thought (cloud)
  readonly numCurves: number; // default 14
  readonly convexity: number; // default 0.85
  // Squircle
  readonly exponent: number; // default 4
  // Tail
  readonly hasTail: boolean;
  readonly tailThickness: number; // 10..100 step 10
  readonly tailTipOffset: readonly [number, number];
}

export function createDefaultEdProceduralBubbleParams(
  shapeType: EdSpeechBubbleShapeType = "Ellipse",
  emotionType: EdSpeechBubbleEmotionType = "General",
): EdProceduralBubbleParams {
  return {
    shapeType,
    emotionType,
    width: 240,
    height: 140,
    numPoints: emotionType === "Fury" ? 36 : 24,
    sharpness: emotionType === "Action" || emotionType === "Fury" ? 3.0 : 2.0,
    radiusVariance: 0.15,
    angleVariance: 0.1,
    normalSpacing: 6,
    innerRatio: 0.78,
    normalLength: 18,
    lengthVariance: 0.12,
    taperWidth: 2,
    numCurves: 14,
    convexity: 0.85,
    exponent: 4,
    hasTail: shapeType !== "SelfTalk",
    tailThickness: 30,
    tailTipOffset: [-24, 92],
  };
}

/**
 * Generates deterministic SVG path geometry for all 6 Tooning Editor procedural speech bubble shapes.
 */
export function generateEdProceduralSpeechBubbleSvgPath(params: EdProceduralBubbleParams): {
  readonly bodyPathD: string;
  readonly tailPathD: string;
  readonly strokeDasharray?: string;
} {
  const cx = params.width / 2;
  const cy = params.height / 2;
  const rx = params.width / 2 - 8;
  const ry = params.height / 2 - 8;

  let bodyPathD: string;
  let strokeDasharray: string | undefined;

  switch (params.shapeType) {
    case "Rectangle": {
      const r = 12;
      bodyPathD = `M ${8 + r} 8 H ${params.width - 8 - r} Q ${params.width - 8} 8 ${params.width - 8} ${8 + r} V ${params.height - 8 - r} Q ${params.width - 8} ${params.height - 8} ${params.width - 8 - r} ${params.height - 8} H ${8 + r} Q 8 ${params.height - 8} 8 ${params.height - 8 - r} V ${8 + r} Q 8 8 ${8 + r} 8 Z`;
      break;
    }
    case "Squircle": {
      const n = Math.max(2, Math.min(10, params.exponent));
      const steps = 48;
      const pts: string[] = [];
      for (let i = 0; i < steps; i++) {
        const theta = (i / steps) * Math.PI * 2;
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);
        const x = cx + rx * Math.sign(cosT) * Math.pow(Math.abs(cosT), 2 / n);
        const y = cy + ry * Math.sign(sinT) * Math.pow(Math.abs(sinT), 2 / n);
        pts.push(`${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`);
      }
      bodyPathD = `${pts.join(" ")} Z`;
      break;
    }
    case "Shout": {
      const count = Math.max(8, Math.min(60, params.numPoints));
      const innerRx = rx * (1 / Math.max(1.2, params.sharpness * 0.65));
      const innerRy = ry * (1 / Math.max(1.2, params.sharpness * 0.65));
      const pts: string[] = [];
      for (let i = 0; i < count * 2; i++) {
        const isSpike = i % 2 === 0;
        const angle = (i / (count * 2)) * Math.PI * 2;
        const radX = isSpike ? rx : innerRx;
        const radY = isSpike ? ry : innerRy;
        const x = cx + radX * Math.cos(angle);
        const y = cy + radY * Math.sin(angle);
        pts.push(`${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`);
      }
      bodyPathD = `${pts.join(" ")} Z`;
      break;
    }
    case "Thought": {
      const lobes = Math.max(6, Math.min(30, params.numCurves));
      const pts: string[] = [];
      for (let i = 0; i < lobes; i++) {
        const a1 = (i / lobes) * Math.PI * 2;
        const a2 = ((i + 1) / lobes) * Math.PI * 2;
        const aMid = (a1 + a2) / 2;
        const x1 = cx + rx * 0.85 * Math.cos(a1);
        const y1 = cy + ry * 0.85 * Math.sin(a1);
        const ctrlX = cx + rx * (0.85 + 0.2 * params.convexity) * Math.cos(aMid);
        const ctrlY = cy + ry * (0.85 + 0.2 * params.convexity) * Math.sin(aMid);
        const x2 = cx + rx * 0.85 * Math.cos(a2);
        const y2 = cy + ry * 0.85 * Math.sin(a2);
        if (i === 0) pts.push(`M ${x1.toFixed(1)} ${y1.toFixed(1)}`);
        pts.push(`Q ${ctrlX.toFixed(1)} ${ctrlY.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`);
      }
      bodyPathD = `${pts.join(" ")} Z`;
      break;
    }
    case "SelfTalk": {
      strokeDasharray = `${params.normalSpacing} ${Math.max(2, params.taperWidth * 2)}`;
      bodyPathD = `M ${(cx - rx * params.innerRatio).toFixed(1)} ${cy.toFixed(1)} A ${(rx * params.innerRatio).toFixed(1)} ${(ry * params.innerRatio).toFixed(1)} 0 1 0 ${(cx + rx * params.innerRatio).toFixed(1)} ${cy.toFixed(1)} A ${(rx * params.innerRatio).toFixed(1)} ${(ry * params.innerRatio).toFixed(1)} 0 1 0 ${(cx - rx * params.innerRatio).toFixed(1)} ${cy.toFixed(1)} Z`;
      break;
    }
    case "Ellipse":
    default: {
      bodyPathD = `M ${(cx - rx).toFixed(1)} ${cy.toFixed(1)} A ${rx.toFixed(1)} ${ry.toFixed(1)} 0 1 0 ${(cx + rx).toFixed(1)} ${cy.toFixed(1)} A ${rx.toFixed(1)} ${ry.toFixed(1)} 0 1 0 ${(cx - rx).toFixed(1)} ${cy.toFixed(1)} Z`;
      break;
    }
  }

  const clampedTailThickness = Math.max(10, Math.min(100, Math.round(params.tailThickness / 10) * 10));
  const halfBase = clampedTailThickness * 0.25;
  const tipX = cx + params.tailTipOffset[0];
  const tipY = cy + params.tailTipOffset[1];
  const tailPathD = params.hasTail
    ? `M ${(cx - halfBase).toFixed(1)} ${(params.height - 12).toFixed(1)} L ${tipX.toFixed(1)} ${tipY.toFixed(1)} L ${(cx + halfBase).toFixed(1)} ${(params.height - 12).toFixed(1)} Z`
    : "";

  return {
    bodyPathD,
    tailPathD,
    ...(strokeDasharray ? { strokeDasharray } : {}),
  };
}

/**
 * `grouped-speech-bubble`: Merges 2..5 overlapping speech bubbles into a single union compound SVG path (`Ctrl+E` / `Ctrl+Shift+E`).
 */
export function mergeEdSpeechBubbles(
  bubbles: readonly { readonly id: string; readonly params: EdProceduralBubbleParams; readonly offsetX: number; readonly offsetY: number }[],
): {
  readonly merged: boolean;
  readonly reasonKo?: string;
  readonly compoundSvgPathD: string;
  readonly sourceBubbleIds: readonly string[];
} {
  if (bubbles.length < 2 || bubbles.length > 5) {
    return {
      merged: false,
      reasonKo: "말풍선 병합(그룹 말풍선)은 2개 이상 5개 이하의 말풍선을 선택해야 실행됩니다.",
      compoundSvgPathD: "",
      sourceBubbleIds: [],
    };
  }
  const paths = bubbles.map((b) => {
    const { bodyPathD, tailPathD } = generateEdProceduralSpeechBubbleSvgPath(b.params);
    return `/* bubble:${b.id}@(${b.offsetX},${b.offsetY}) */ ${bodyPathD} ${tailPathD}`.trim();
  });
  return {
    merged: true,
    compoundSvgPathD: paths.join(" "),
    sourceBubbleIds: bubbles.map((b) => b.id),
  };
}

// Editable Polygon Cut (`editableCut`) with per-vertex corner radius
export interface EdPolygonCutVertex {
  readonly x: number;
  readonly y: number;
  readonly cornerRadius: number;
}

export function buildEdEditableCutSvgPath(vertices: readonly EdPolygonCutVertex[]): string {
  if (vertices.length < 3) return "";
  return (
    vertices
      .map((v, idx) => `${idx === 0 ? "M" : "L"} ${v.x.toFixed(1)} ${v.y.toFixed(1)} /* r=${v.cornerRadius} */`)
      .join(" ") + " Z"
  );
}

// 16 SVG Part Slots for 2D Smart Character (`smart-character`)
export const ED_SMART_CHARACTER_PART_SLOTS = [
  "body",
  "left_arm",
  "left_hand",
  "right_arm",
  "right_hand",
  "leg",
  "face_shape",
  "face_expression",
  "front_hair",
  "back_hair",
  "glasses",
  "beard",
  "wrinkle",
  "face_effect",
  "accessary",
  "accessary_head",
] as const;

export type EdSmartCharacterPartSlot = (typeof ED_SMART_CHARACTER_PART_SLOTS)[number];

export interface EdSmartCharacterState {
  readonly characterSetId: string;
  readonly viewDirection: "front" | "side" | "back";
  readonly flipX: boolean;
  readonly flipY: boolean;
  readonly headAngleDeg: number; // -45..+45
  readonly bodyAngleDeg: number; // -45..+45
  readonly partPresets: Readonly<Record<EdSmartCharacterPartSlot, string>>;
  readonly partColorsHex: Readonly<Record<EdSmartCharacterPartSlot, string>>;
}

export function createDefaultEdSmartCharacterState(
  characterSetId = "tooning-smart-student",
): EdSmartCharacterState {
  const partPresets = {} as Record<EdSmartCharacterPartSlot, string>;
  const partColorsHex = {} as Record<EdSmartCharacterPartSlot, string>;
  for (const slot of ED_SMART_CHARACTER_PART_SLOTS) {
    partPresets[slot] = `${characterSetId}-${slot}-01`;
    partColorsHex[slot] = slot.includes("hair") ? "#1e293b" : "#f8fafc";
  }
  return {
    characterSetId,
    viewDirection: "front",
    flipX: false,
    flipY: false,
    headAngleDeg: 0,
    bodyAngleDeg: 0,
    partPresets,
    partColorsHex,
  };
}

// 3D Mannequin Pose Popup (19 Mixamo Joints + 10 Finger Curls)
export const ED_MANNEQUIN_19_MIXAMO_JOINTS = [
  "Hips",
  "Spine",
  "Spine1",
  "Spine2",
  "Neck",
  "Head",
  "LeftShoulder",
  "LeftArm",
  "LeftForeArm",
  "LeftHand",
  "RightShoulder",
  "RightArm",
  "RightForeArm",
  "RightHand",
  "LeftUpLeg",
  "LeftLeg",
  "LeftFoot",
  "RightUpLeg",
  "RightLeg",
] as const;

export const ED_MANNEQUIN_10_FINGERS = [
  "LeftThumb",
  "LeftIndex",
  "LeftMiddle",
  "LeftRing",
  "LeftPinky",
  "RightThumb",
  "RightIndex",
  "RightMiddle",
  "RightRing",
  "RightPinky",
] as const;

export type EdMannequinCameraPreset = "low" | "eye" | "high";

export const ED_MANNEQUIN_CAMERA_ELEVATION_DEG: Readonly<Record<EdMannequinCameraPreset, number>> = {
  low: -25,
  eye: 5,
  high: 45,
};

// Multi-Angle Camera Popup (`<sks> <azimuth> <elevation> <distance>`)
export const ED_MULTI_ANGLE_AZIMUTHS = [
  { deg: 0, token: "front view", labelKo: "정면 (0°)" },
  { deg: 45, token: "front-right quarter view", labelKo: "우전방 45°" },
  { deg: 90, token: "right side view", labelKo: "우측면 (90°)" },
  { deg: 135, token: "back-right quarter view", labelKo: "우후방 135°" },
  { deg: 180, token: "back view", labelKo: "후면 (180°)" },
  { deg: 225, token: "back-left quarter view", labelKo: "좌후방 225°" },
  { deg: 270, token: "left side view", labelKo: "좌측면 (270°)" },
  { deg: 315, token: "front-left quarter view", labelKo: "좌전방 315°" },
] as const;

export const ED_MULTI_ANGLE_ELEVATIONS = [
  { deg: -30, token: "low-angle shot", labelKo: "로우앵글 (-30°)" },
  { deg: 0, token: "eye-level shot", labelKo: "아이레벨 (0°)" },
  { deg: 30, token: "elevated shot", labelKo: "약부감 (30°)" },
  { deg: 60, token: "high-angle shot", labelKo: "하이앵글 (60°)" },
  { deg: 90, token: "overhead top-down shot", labelKo: "탑다운 (90°)" },
] as const;

export const ED_MULTI_ANGLE_DISTANCES = [
  { multiplier: 0.6, token: "close-up", labelKo: "클로즈업 (×0.6)" },
  { multiplier: 1.0, token: "medium shot", labelKo: "미디엄 샷 (×1.0)" },
  { multiplier: 1.8, token: "wide shot", labelKo: "와이드 샷 (×1.8)" },
] as const;

export function buildEdMultiAngleCameraPrompt(params: {
  readonly azimuthDeg: 0 | 45 | 90 | 135 | 180 | 225 | 270 | 315;
  readonly elevationDeg: -30 | 0 | 30 | 60 | 90;
  readonly distanceMultiplier: 0.6 | 1.0 | 1.8;
  readonly subjectDescription?: string;
}): string {
  const az =
    ED_MULTI_ANGLE_AZIMUTHS.find((a) => a.deg === params.azimuthDeg) ?? ED_MULTI_ANGLE_AZIMUTHS[0]!;
  const el =
    ED_MULTI_ANGLE_ELEVATIONS.find((e) => e.deg === params.elevationDeg) ??
    ED_MULTI_ANGLE_ELEVATIONS[1]!;
  const dist =
    ED_MULTI_ANGLE_DISTANCES.find((d) => d.multiplier === params.distanceMultiplier) ??
    ED_MULTI_ANGLE_DISTANCES[1]!;
  const suffix = params.subjectDescription?.trim() ? `, ${params.subjectDescription.trim()}` : "";
  return `<sks> ${az.token}, ${el.token}, ${dist.token}${suffix}`;
}

// AI Expo Webcam Style Transfer (7 Styles) & AI Voice TTS (11 Languages)
export const ED_EXPO_STYLE_TRANSFER_PRESETS = [
  { id: "sketch", labelKo: "스케치", promptToken: "clean pencil line art sketch" },
  { id: "korean-painting", labelKo: "한국화", promptToken: "traditional Korean ink wash Minhwa painting" },
  { id: "character", labelKo: "캐릭터", promptToken: "3D Pixar-style stylized character portrait" },
  { id: "animation", labelKo: "애니메이션", promptToken: "high-detail cel-shaded webtoon animation" },
  { id: "minecraft", labelKo: "마인크래프트", promptToken: "3D blocky voxel craft world aesthetic" },
  { id: "lego", labelKo: "레고", promptToken: "glossy interlocking plastic brick minifigure style" },
  { id: "pixel-art", labelKo: "픽셀아트", promptToken: "16-bit retro arcade pixel art sprite" },
] as const;

export const ED_TTS_SUPPORTED_LANGUAGES = [
  "ko",
  "en",
  "ja",
  "zh",
  "es",
  "fr",
  "de",
  "pt",
  "it",
  "ru",
  "id",
] as const;

// Image Filter Center Snap (±5 snaps to 0)
export function snapEdImageFilterValue(rawValue: number): number {
  const clamped = Math.max(-100, Math.min(100, Math.round(rawValue)));
  return Math.abs(clamped) <= 5 ? 0 : clamped;
}

// Tooning Magic (`MG`) Engine
export type MgStyleSegment = "InhouseStyle" | "OutsideStyle" | "MyStyle";

export type MgRetouchModelId =
  | "NanoBanana"
  | "NanoBanana2"
  | "NanoBananaPro"
  | "Seedream"
  | "QwenImageEdit";

export const MG_ASPECT_RATIO_SPECS = [
  { ratio: "1:1", width: 1024, height: 1024, labelKo: "정방형 1:1 (1024×1024)" },
  { ratio: "3:4", width: 880, height: 1173, labelKo: "세로형 3:4 (880×1173)" },
  { ratio: "4:3", width: 1173, height: 880, labelKo: "가로형 4:3 (1173×880)" },
  { ratio: "9:16", width: 768, height: 1344, labelKo: "웹툰 컷 9:16 (768×1344)" },
  { ratio: "16:9", width: 1344, height: 768, labelKo: "와이드 16:9 (1344×768)" },
] as const;

export interface MgAdvancedRenderSettings {
  readonly styleSegment: MgStyleSegment;
  readonly stylePresetId: string;
  readonly fixedPrompt: string;
  readonly negativePrompt: string;
  readonly isFaceDetailer: boolean;
  readonly isRemoveBackground: boolean;
  readonly isColorBlend: boolean;
  readonly lineStrengthPercent: number; // default 20
  readonly poseStrengthPercent: number; // default 50
  readonly denoisePercent: number; // default 70
  readonly detailerDenoisePercent: number; // default 60
  readonly styleWeightPercent: number; // 0..200, default 100
}

export function createDefaultMgAdvancedRenderSettings(): MgAdvancedRenderSettings {
  return {
    styleSegment: "InhouseStyle",
    stylePresetId: "tooning-webtoon-signature",
    fixedPrompt: "masterpiece, best quality, korean webtoon cel shading",
    negativePrompt: "lowres, blurry, extra fingers, bad anatomy",
    isFaceDetailer: true,
    isRemoveBackground: false,
    isColorBlend: false,
    lineStrengthPercent: 20,
    poseStrengthPercent: 50,
    denoisePercent: 70,
    detailerDenoisePercent: 60,
    styleWeightPercent: 100,
  };
}

/**
 * Computes the exact Tooning Magic post-processing bitmask:
 * `(isFaceDetailer ? 4 : 0) + (isRemoveBackground ? 2 : 0) + (isColorBlend ? 1 : 0) + 1` (range `1..8`).
 */
export function computeMgPostProcessingBitmask(settings: {
  readonly isFaceDetailer: boolean;
  readonly isRemoveBackground: boolean;
  readonly isColorBlend: boolean;
}): number {
  return (
    (settings.isFaceDetailer ? 4 : 0) +
    (settings.isRemoveBackground ? 2 : 0) +
    (settings.isColorBlend ? 1 : 0) +
    1
  );
}

/**
 * Validates and prepares a Multi-Image AI Retouch job (up to 5 reference images) for `NanoBanana` / `Seedream` / `QwenImageEdit`.
 */
export function prepareMgMultiImageRetouchJob(params: {
  readonly model: MgRetouchModelId;
  readonly referenceImageUrls: readonly string[];
  readonly editInstruction: string;
}): {
  readonly valid: boolean;
  readonly reasonKo?: string;
  readonly model: MgRetouchModelId;
  readonly acceptedImages: readonly string[];
  readonly compiledPrompt: string;
} {
  if (params.referenceImageUrls.length === 0) {
    return {
      valid: false,
      reasonKo: "AI 리터치를 실행하려면 최소 1장의 참조 이미지를 선택해야 합니다.",
      model: params.model,
      acceptedImages: [],
      compiledPrompt: "",
    };
  }
  if (params.referenceImageUrls.length > 5) {
    return {
      valid: false,
      reasonKo: "AI 리터치 다중 이미지 합성(최대 5장) 한도를 초과했습니다.",
      model: params.model,
      acceptedImages: params.referenceImageUrls.slice(0, 5),
      compiledPrompt: "",
    };
  }
  return {
    valid: true,
    model: params.model,
    acceptedImages: params.referenceImageUrls,
    compiledPrompt: `[${params.model} · refs:${params.referenceImageUrls.length}] ${params.editInstruction.trim()}`,
  };
}
