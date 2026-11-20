/**
 * 확장 전문 도구 워크벤치 24종 UI 패널용 샘플 상태 빌더.
 *
 * 모든 모듈은 `import type`으로만 참조해 정적 그래프(`studio-eager-graph`)를 0바이트도 늘리지 않는다.
 */
import type { StudioAnimCamera2DFolder } from "../animation/studio-anim-camera-2d";
import type { StudioLightTableState } from "../animation/studio-light-table";
import type { Bg3dWallCutawayConfig } from "../bg3d/studio-bg3d-wall-cutaway-runtime";
import type { Studio3dHeadMixerState } from "../character-shaper/studio-3d-head-mixer";
import type {
  HandFingerLockMap,
  StudioWebtoonBodyAndHairState,
} from "../character-shaper/studio-webtoon-21-body-and-3part-hair";
import type { CharacterInlineQuickState } from "../comic/StudioCharacterInlineQuickBar";
import type { StudioAdjustmentLayerSpec } from "../layer/studio-adjustment-layer";
import type { StudioBlendIfConfig } from "../layer/studio-blend-if-compositor";
import type { DialoguePageLike } from "../lettering/studio-dialogue-batch";
import type { StoryLivingSpecState } from "../planning/studio-story-living-spec-types";
import type { StudioShadingImageEl } from "../shading/StudioShadingAssistWiredPanel";
import type { ShadingLightBallState } from "../shading/StudioShadingLightBallOverlay";
import type { FrameEl } from "../studio-element-model";
import type { StudioImageDataLike } from "../studio-filters";
import type { CornerPinQuad } from "../transform/studio-corner-pin-transform";
import type { RasterMeshLattice } from "../transform/studio-raster-mesh-transform";
import type {
  SurfaceBoundStroke,
  SurfaceBoundStrokeToolConfig,
} from "../vrm/studio-surface-bound-stroke-engine";
import type { ConsistencyAssetSlot } from "./StudioConsistencyAssetStrip";
import type { SelectionContextPromptItem } from "./StudioSelectionContextPromptBar";

const SAMPLE_PNG_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

export function encodeSampleWorkbenchPng(): string {
  return SAMPLE_PNG_DATA_URI;
}

export function createSampleShadingImageEl(): StudioShadingImageEl {
  return {
    id: "workbench-sample-image",
    type: "image",
    src: "workbench://sample-character",
    x: 0,
    y: 0,
    width: 320,
    height: 400,
    rotation: 0,
  };
}

export async function decodeSampleShadingImage(): Promise<StudioImageDataLike> {
  const width = 24;
  const height = 24;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = x - 11.5;
      const dy = y - 11.5;
      if (dx * dx + dy * dy <= 81) {
        const off = (y * width + x) * 4;
        data[off] = 224;
        data[off + 1] = 208;
        data[off + 2] = 196;
        data[off + 3] = 255;
      }
    }
  }
  return { width, height, data };
}

export function createSampleLightBallState(): ShadingLightBallState {
  return {
    azimuthDeg: 315,
    elevationDeg: 45,
    shadingModel: "spherical-volume",
    rimLightStrength: 35,
  };
}

export function createSampleKnifeFrame(): FrameEl {
  return {
    id: "workbench-sample-frame",
    type: "frame",
    x: 24,
    y: 24,
    width: 320,
    height: 220,
    strokeWidth: 3,
  };
}

export function createSampleHeadMixerState(): Studio3dHeadMixerState {
  return {
    styleWeights: {
      "anime-classic": 0,
      "rofan-noble": 0,
      "action-sharp": 0,
      "modern-drama": 1,
      "chibi-sd": 0,
      "semi-realistic": 0,
      "boyish-shonen": 0,
      "mature-villain": 0,
      "soft-slice": 0,
    },
    partOffsets: {},
    symmetryMode: "symmetric",
    leftAsymmetryOffsets: {},
    rightAsymmetryOffsets: {},
    showLoomisGuide: true,
  };
}

export function createSampleBodyAndHairState(): StudioWebtoonBodyAndHairState {
  return {
    matrix: { muscularityX: 0, fullnessY: 0 },
    sliderOffsets: {},
    hair: {
      frontId: "front-see-through",
      sideId: "side-layered",
      backId: "back-long-straight",
      mainColorId: "ink-black",
      lockMainColor: true,
      frontColorIdOverride: null,
      sideColorIdOverride: null,
      backColorIdOverride: null,
    },
  };
}

export function createSampleHandFingerLocks(): HandFingerLockMap {
  return { thumb: false, index: false, middle: false, ring: false, little: false };
}

export function createSampleSurfaceStrokeConfig(): SurfaceBoundStrokeToolConfig {
  return {
    enabled: true,
    mirrorX: true,
    liveDeformFollow: true,
    widthMm: 2.4,
    normalOffsetMm: 0.6,
    opacity: 0.95,
    colorToken: "ink-primary",
  };
}

export function createSampleSurfaceStrokes(): readonly SurfaceBoundStroke[] {
  return [
    {
      id: "stroke-sample-1",
      meshId: "head-mesh",
      labelKo: "눈매 윤곽선",
      mirrorX: true,
      colorToken: "ink-primary",
      opacity: 0.95,
      anchors: [
        { meshId: "head-mesh", triangleIndex: 12, barycentric: [0.3, 0.4, 0.3], normalOffsetMm: 0.6, widthMm: 2.2, pressure: 0.9 },
        { meshId: "head-mesh", triangleIndex: 15, barycentric: [0.5, 0.2, 0.3], normalOffsetMm: 0.6, widthMm: 2.4, pressure: 1.0 },
      ],
    },
  ];
}

export function createSampleWallCutawayConfig(): Bg3dWallCutawayConfig {
  return {
    enabled: true,
    preserveExteriorShadows: true,
    autoHideCeiling: true,
    renderMode: "shadow-preserving-material",
    shadowOnlyLayer: 2,
    lockedVisibleWalls: [],
    forcedHiddenWalls: [],
  };
}

export function createSampleSelectionPromptItems(): readonly SelectionContextPromptItem[] {
  return [{ id: "sel-char-1", label: "주인공 서연 레이어", kind: "character" }];
}

export function createSampleConsistencySlots(): readonly ConsistencyAssetSlot[] {
  return [
    { id: "slot-char-1", category: "character", name: "서연 (주인공)", pinnedCutIds: ["cut-01"], styleNotes: "단발 흑발, 교복 자켓" },
    { id: "slot-bg-1", category: "background", name: "학교 옥상 난간", pinnedCutIds: ["cut-01"], styleNotes: "해 질 녘 역광" },
    { id: "slot-prop-1", category: "prop", name: "접힌 편지", pinnedCutIds: [] },
  ];
}

export function createSampleDialoguePages(): readonly DialoguePageLike[] {
  return [
    {
      id: "page-1",
      elements: [
        { id: "dlg-1", type: "bubble", text: "서연아, 여기서 기다리고 있었어.", x: 40, y: 40 },
        { id: "dlg-2", type: "bubble", text: "처음부터 다 알고 있었으면서.", x: 80, y: 180 },
      ],
    },
    {
      id: "page-2",
      elements: [
        { id: "dlg-3", type: "text", text: "옥상 문이 천천히 열렸다.", x: 40, y: 60 },
        { id: "dlg-4", type: "bubble", text: "서연아, 이번엔 도망치지 마.", x: 90, y: 200 },
      ],
    },
  ];
}

export function createSampleStoryLivingSpecState(): StoryLivingSpecState {
  return {
    projectId: "workbench-story-demo",
    targetRating: "15+",
    activeView: "directory",
    selectedNodeKey: "CUT-01",
    nodes: [
      {
        id: { prefix: "ARC", code: "01" },
        key: "ARC-01",
        title: "1부: 옥상의 약속",
        summary: "비밀을 알게 된 두 인물의 대립이 시작된다.",
        parentKey: null,
        order: 1,
        contentHash: "hash-arc-01",
        updatedAt: "2026-11-20T09:00:00Z",
      },
      {
        id: { prefix: "EP", code: "01" },
        key: "EP-01",
        title: "1화: 닫힌 문 너머",
        summary: "방과 후 옥상에서 마주한 서연과 하진.",
        parentKey: "ARC-01",
        order: 1,
        contentHash: "hash-ep-01",
        updatedAt: "2026-11-20T09:05:00Z",
      },
      {
        id: { prefix: "CUT", code: "01" },
        key: "CUT-01",
        title: "옥상 난간 대치 컷",
        summary: "노을 역광 속에서 편지를 내미는 장면.",
        parentKey: "EP-01",
        order: 1,
        contentHash: "hash-cut-01",
        cutSlots: {
          location: "학교 옥상 난간",
          timeLighting: "해 질 녘 역광",
          actors: ["서연", "하진"],
          emotionalBeat: "망설임과 긴장",
          cameraAngleLens: "로우앵글 바스트샷 35mm",
          keyAction: "접힌 편지를 손에 쥠",
          keyDialogue: "처음부터 다 알고 있었어.",
          hiddenSlots: [],
          openQuestions: [
            {
              id: "q-1",
              slot: "propsAndContinuity",
              question: "서연의 왼손 붕대 설정을 이 컷에서도 유지할까요?",
              options: ["왼손 붕대 유지", "붕대 제거 후 흉터만 표시"],
              aiRecommendedIndex: 0,
            },
          ],
        },
        dialogueLines: ["처음부터 다 알고 있었어."],
        updatedAt: "2026-11-20T09:10:00Z",
      },
    ],
    edges: [
      { id: "edge-1", fromKey: "ARC-01", toKey: "EP-01", relation: "parent" },
      { id: "edge-2", fromKey: "EP-01", toKey: "CUT-01", relation: "parent" },
    ],
    proposals: [
      {
        id: "prop-01",
        targetEntityId: "CUT-01",
        op: "update",
        source: "studio_chat",
        title: "옥상 컷 카메라 앵글 강조",
        rationale: "대립 긴장감을 높이기 위해 35mm 로우앵글에서 28mm 더치앵글로 전환을 제안합니다.",
        beforeSnapshot: { title: "옥상 난간 대치 컷", summary: "노을 역광 속에서 편지를 내미는 장면." },
        proposedSnapshot: { title: "옥상 난간 긴장 대치 컷", summary: "28mm 더치앵글 노을 역광 속에서 편지를 내미는 장면." },
        userEdited: false,
        status: "pending",
        evidenceCitations: [{ sourceDocId: "EP-01", quote: "방과 후 옥상에서 마주한 서연과 하진." }],
        createdAt: "2026-11-20T09:12:00Z",
      },
    ],
    driftBadges: {},
    reviewFindings: [
      {
        id: "rev-01",
        perspective: "visual_directing",
        severity: "warning",
        ruleCode: "DIR-01",
        targetNodeKey: "CUT-01",
        evaluatedNodeHash: "hash-cut-01",
        title: "연속 바스트샷 단조로움 주의",
        message: "직전 컷과 같은 눈높이 구도가 이어집니다. 하이앵글 원경 컷을 섞으면 몰입감이 높아집니다.",
        quote: "로우앵글 바스트샷 35mm",
        status: "open",
        isStale: false,
        quickFixOptions: [
          { label: "광각 28mm로 변경", summary: "공간감이 드러나도록 28mm 로우앵글로 조정", patch: { title: "옥상 난간 광각 대치 컷" } },
        ],
      },
      {
        id: "rev-02",
        perspective: "dialogue_readability",
        severity: "suggestion",
        ruleCode: "DLG-02",
        targetNodeKey: "CUT-01",
        evaluatedNodeHash: "hash-cut-01",
        title: "대사 호흡 점검",
        message: "짧은 1문장 대사라 세로 스크롤 말풍선 가독성이 우수합니다.",
        quote: "처음부터 다 알고 있었어.",
        status: "open",
        isStale: false,
        quickFixOptions: [],
      },
    ],
    reviewNodeHashes: { "CUT-01": "hash-cut-01" },
    lastReviewReport: {
      evaluatedAt: "2026-11-20T09:15:00Z",
      preservedNodeKeys: ["ARC-01", "EP-01"],
      reevaluatedNodeKeys: ["CUT-01"],
      openCount: 2,
      resolvedCount: 0,
      deferredCount: 0,
    },
    workLog: [],
    sequence: 1,
  };
}

export function createSampleMeshLattice(width = 240, height = 160, rows = 3, cols = 3): RasterMeshLattice {
  const nodes: { row: number; col: number; restX: number; restY: number; x: number; y: number }[] = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const x = Math.round((c / (cols - 1)) * width);
      const y = Math.round((r / (rows - 1)) * height);
      nodes.push({ row: r, col: c, restX: x, restY: y, x, y });
    }
  }
  return { width, height, rows, cols, nodes };
}

export function createSampleCornerQuad(width = 240, height = 160): CornerPinQuad {
  return {
    topLeft: { x: 0, y: 0 },
    topRight: { x: width, y: 0 },
    bottomRight: { x: width, y: height },
    bottomLeft: { x: 0, y: height },
  };
}

export function createSampleAdjustmentLayers(): readonly StudioAdjustmentLayerSpec[] {
  return [
    {
      id: "adj-sample-curves",
      name: "톤 커브 1",
      adjustment: "curves",
      parameters: { rgbPoints: [0, 0, 128, 128, 255, 255] },
      enabled: true,
      opacity: 1,
      blendMode: "source-over",
      clipToBelow: false,
    },
  ];
}

export function createSampleBlendIfConfig(): StudioBlendIfConfig {
  const identityChannel = {
    thisLayer: [0, 0, 255, 255] as const,
    underlyingLayer: [0, 0, 255, 255] as const,
  };
  return {
    version: 1,
    enabled: true,
    activeChannel: "gray",
    channels: { gray: identityChannel, r: identityChannel, g: identityChannel, b: identityChannel },
    blendClippingElements: true,
    blendInteriorElements: false,
  };
}

export function createSampleCharacterInlineState(): CharacterInlineQuickState {
  return {
    characterId: "char-sample-1",
    characterName: "서연",
    expressionId: "neutral",
    poseId: "standing",
    outfitId: "school-summer",
    flipX: false,
  };
}

export function createSampleLightTableState(): StudioLightTableState {
  return {
    enabled: true,
    globalEntries: [
      {
        id: "lt-global-1",
        sourceKind: "layer",
        sourceId: "러프 기준선",
        visible: true,
        opacity: 0.45,
        tintMode: "none",
        tintHex: "",
        transform: { tx: 0, ty: 0, scale: 1, rotationDeg: 0, flipX: false },
      },
    ],
    celEntriesByCelId: {},
  };
}

export function createSampleAnimCamera(): StudioAnimCamera2DFolder {
  return {
    id: "cam-2d-sample",
    name: "메인 2D 카메라",
    baseWidth: 220,
    baseHeight: 132,
    showLocus: true,
    memberTrackIds: ["cel-1"],
    channels: {
      centerX: {
        channelId: "x",
        defaultValue: 140,
        keyframes: [
          { frame: 1, value: 120, interpolation: "smooth", handleMode: "auto-monotone" },
          { frame: 12, value: 164, interpolation: "smooth", handleMode: "auto-monotone" },
        ],
      },
      centerY: {
        channelId: "y",
        defaultValue: 90,
        keyframes: [
          { frame: 1, value: 86, interpolation: "smooth", handleMode: "auto-monotone" },
          { frame: 12, value: 96, interpolation: "smooth", handleMode: "auto-monotone" },
        ],
      },
      zoom: {
        channelId: "scaleX",
        defaultValue: 1,
        keyframes: [
          { frame: 1, value: 1, interpolation: "linear", handleMode: "auto-monotone" },
          { frame: 12, value: 1.15, interpolation: "linear", handleMode: "auto-monotone" },
        ],
      },
      rotationDeg: { channelId: "rotationDeg", defaultValue: 0, keyframes: [] },
    },
  };
}
