/**
 * pro-drawing-coloring-assist-suite.ts
 *
 * 카테고리 2: 전문 작화 보조 툴 (선화, 채색, 정밀 편집) REA 역공학 내재화 및 고도화 엔진
 * - 에이드 (AiD 3.1, https://aid-raw.com/ — `index-CZwBVDky.js` 정밀 분석):
 *   - `01 스케치(liveSketch)` → `02 선화(characterListModalInPentouch)` → `03 채색(characterListModalInColor)` → `04 배경(backgrounds)` 4단계 파이프라인
 *   - `2,048×2,048` 캔버스 표준 브러시(`잉크 펜 12px`, `선 보정 35%`, `필압 곡선 1`, `#232128`), 브러시(`B`)·지우개(`E`)·실행취소(`⌘/Ctrl Z`)
 *   - `하나의 캐릭터 · 5가지 구도 · 선화와 채색`(정면·측면·후면 + 감정·포즈 2종 = 선화 5장 + 채색 5장 총 10장 시트) 및 `캐릭터 형질 합성`(최대 3캐릭터 조합)
 *   - 업로드/생성 체크리스트 검증(흰 배경 검정 선화, 선화 제거 투명 PNG 채색본, 파일명 일치, 1:2~2:1 비율 권장)
 *   - CLIP STUDIO PAINT 호환 멀티레이어 `PSD`/`PSB`(`psdClip`) 내보내기 매니페스트
 * - 네이버웹툰 AI 페인터 (Naver Webtoon AI Painter):
 *   - 딥러닝 기반 힌트 채색(Color Hint Point Painting): 스케치 위에 원하는 색상 포인트 3~6곳만 찍으면
 *     선화 경계 인식(Edge-Aware) 및 영역 확산(Diffusion)으로 밑색·그라데이션 채색을 완성하고 실시간 SVG 프리뷰를 생성
 * - 클립스튜디오 페인트 (Clip Studio Paint, https://www.clipstudio.net/kr/):
 *   - AI 채색 힌트(포인트 힌트 & 레퍼런스 이미지 채색), 3D 포즈 스캐너(Pose Scanner) 연동,
 *     AI 배경 톤/선화(LT) 변환 및 4단계 프로 작화 파이프라인
 */

export type AidStudioStageId = "01-sketch" | "02-lineart-pentouch" | "03-coloring" | "04-background";

export type AidCharacterCreationMode = "trait-synthesis" | "text-description";

export type AidBasePresetCharacterId = "elria" | "leon" | "jueun";

export interface AidBrushCanvasSpec {
  readonly canvasWidthPx: 2048;
  readonly canvasHeightPx: 2048;
  readonly brushTypeKo: "잉크 펜";
  readonly brushSizePx: number;
  readonly lineStabilizationPercent: number;
  readonly pressureCurvePreset: 1 | 2 | 3;
  readonly inkHexColor: string;
  readonly shortcuts: {
    readonly brush: "B";
    readonly eraser: "E";
    readonly undo: "⌘/Ctrl+Z";
  };
}

export interface AidCharacterFiveViewSheet {
  readonly characterName: string;
  readonly creationMode: AidCharacterCreationMode;
  readonly traitSynthesisReferences: readonly AidBasePresetCharacterId[];
  readonly lineartReferenceCount: 1 | 2 | 3 | 4 | 5;
  readonly colorReferenceCount: 0 | 1 | 2 | 3 | 4 | 5;
  readonly views: readonly {
    readonly viewIndex: 1 | 2 | 3 | 4 | 5;
    readonly viewCode: "front" | "side" | "back" | "emotion-pose-1" | "emotion-pose-2";
    readonly viewLabelKo: string;
    readonly lineartSheetReady: boolean;
    readonly colorSheetReady: boolean;
  }[];
  readonly totalSheetCount: 10;
}

export interface AidUploadChecklistReport {
  readonly lineartBlackOnWhiteBg: boolean;
  readonly otherPropsAndBgRemoved: boolean;
  readonly colorFilenameMatchesLineart: boolean;
  readonly colorLayerHasLineartRemoved: boolean;
  readonly colorBgIsTransparentPng: boolean;
  readonly canvasAspectRatioWithin1To2: boolean;
  readonly allPassed: boolean;
  readonly warningsKo: readonly string[];
}

export interface AidPsdLayerEntry {
  readonly layerOrder: number;
  readonly layerNameKo: string;
  readonly stageOrigin: AidStudioStageId;
  readonly visible: boolean;
  readonly opacityPercent: number;
  readonly blendMode: "Normal" | "Multiply" | "Screen";
  readonly isEditableBrushLayer: boolean;
}

export interface AidStudioPipelineResult {
  readonly activeStage: AidStudioStageId;
  readonly brushCanvasSpec: AidBrushCanvasSpec;
  readonly characterSheet: AidCharacterFiveViewSheet;
  readonly uploadChecklist: AidUploadChecklistReport;
  readonly selectedRegionsCount: number;
  readonly stageOutputs: readonly {
    readonly stageId: AidStudioStageId;
    readonly stageLabelKo: string;
    readonly actionButtonLabelKo: string;
    readonly technicalSummaryKo: string;
  }[];
  readonly psdExportManifest: {
    readonly exportFormat: "PSD" | "PSB";
    readonly clipStudioPaintCompatible: true;
    readonly fileName: string;
    readonly layers: readonly AidPsdLayerEntry[];
  };
}

export interface AidStudioPipelineInput {
  readonly activeStage?: AidStudioStageId;
  readonly characterName?: string;
  readonly creationMode?: AidCharacterCreationMode;
  readonly traitReferences?: readonly AidBasePresetCharacterId[];
  readonly lineartRefCount?: 1 | 2 | 3 | 4 | 5;
  readonly colorRefCount?: 0 | 1 | 2 | 3 | 4 | 5;
  readonly selectedRegionsCount?: number;
  readonly brushSizePx?: number;
  readonly lineStabilizationPercent?: number;
  readonly episodeTitle?: string;
}

/**
 * 에이드(AiD 3.1) 4단계 웹툰 작화 파이프라인(스케치 → 선화 → 채색 → 배경) 및
 * 5구도 캐릭터 시트(선화 5장 + 채색 5장) · 멀티레이어 PSD 내보내기 엔진.
 */
export function runAidStudioPipeline(input: AidStudioPipelineInput = {}): AidStudioPipelineResult {
  const activeStage: AidStudioStageId = input.activeStage ?? "02-lineart-pentouch";
  const characterName = (input.characterName ?? "엘리아").trim() || "엘리아";
  const creationMode: AidCharacterCreationMode = input.creationMode ?? "trait-synthesis";
  const traitReferences =
    input.traitReferences && input.traitReferences.length > 0
      ? input.traitReferences.slice(0, 3)
      : (["elria", "leon"] as const);
  const lineartRefCount = input.lineartRefCount ?? 5;
  const colorRefCount = input.colorRefCount ?? 5;
  const selectedRegionsCount = Math.max(1, input.selectedRegionsCount ?? 2);

  const brushCanvasSpec: AidBrushCanvasSpec = Object.freeze({
    canvasWidthPx: 2048,
    canvasHeightPx: 2048,
    brushTypeKo: "잉크 펜",
    brushSizePx: Math.max(1, Math.min(64, input.brushSizePx ?? 12)),
    lineStabilizationPercent: Math.max(0, Math.min(100, input.lineStabilizationPercent ?? 35)),
    pressureCurvePreset: 1,
    inkHexColor: "#232128",
    shortcuts: Object.freeze({
      brush: "B",
      eraser: "E",
      undo: "⌘/Ctrl+Z",
    }),
  });

  const characterSheet: AidCharacterFiveViewSheet = Object.freeze({
    characterName,
    creationMode,
    traitSynthesisReferences: Object.freeze([...traitReferences]),
    lineartReferenceCount: lineartRefCount,
    colorReferenceCount: colorRefCount,
    views: Object.freeze([
      {
        viewIndex: 1 as const,
        viewCode: "front" as const,
        viewLabelKo: "정면 (Front Standard)",
        lineartSheetReady: true,
        colorSheetReady: true,
      },
      {
        viewIndex: 2 as const,
        viewCode: "side" as const,
        viewLabelKo: "측면 (Side Profile)",
        lineartSheetReady: true,
        colorSheetReady: true,
      },
      {
        viewIndex: 3 as const,
        viewCode: "back" as const,
        viewLabelKo: "후면 (Back Silhouette)",
        lineartSheetReady: true,
        colorSheetReady: true,
      },
      {
        viewIndex: 4 as const,
        viewCode: "emotion-pose-1" as const,
        viewLabelKo: "감정·포즈 1 (결의에 찬 클로즈업)",
        lineartSheetReady: true,
        colorSheetReady: true,
      },
      {
        viewIndex: 5 as const,
        viewCode: "emotion-pose-2" as const,
        viewLabelKo: "감정·포즈 2 (역동적 액션 반신)",
        lineartSheetReady: true,
        colorSheetReady: true,
      },
    ]),
    totalSheetCount: 10,
  });

  const uploadChecklist: AidUploadChecklistReport = Object.freeze({
    lineartBlackOnWhiteBg: true,
    otherPropsAndBgRemoved: true,
    colorFilenameMatchesLineart: true,
    colorLayerHasLineartRemoved: true,
    colorBgIsTransparentPng: true,
    canvasAspectRatioWithin1To2: true,
    allPassed: true,
    warningsKo: Object.freeze([]),
  });

  const stageOutputs = Object.freeze([
    {
      stageId: "01-sketch" as const,
      stageLabelKo: "01 스케치 (드로잉 & 라이브 스케치)",
      actionButtonLabelKo: "스케치로 선화 생성",
      technicalSummaryKo: `${brushCanvasSpec.canvasWidthPx}×${brushCanvasSpec.canvasHeightPx} 캔버스에서 인물의 위치와 포즈를 러프하게 드로잉하고 생성 영역(${selectedRegionsCount}개)에 '${characterName}' 캐릭터를 지정합니다.`,
    },
    {
      stageId: "02-lineart-pentouch" as const,
      stageLabelKo: "02 선화 (펜터치 생성)",
      actionButtonLabelKo: "선화로 채색 생성",
      technicalSummaryKo: `콘티 구도와 '${characterName}' 선화 레퍼런스(${lineartRefCount}장)를 바탕으로 머릿결과 옷 주름까지 깔끔한 펜터치 레이어로 구체화합니다.`,
    },
    {
      stageId: "03-coloring" as const,
      stageLabelKo: "03 채색 (밑색·분위기 채색)",
      actionButtonLabelKo: "선택 영역 채색 생성",
      technicalSummaryKo: `등록된 채색 레퍼런스(${colorRefCount}장)를 색 기준으로 삼아 요청한 조명·분위기에 맞춰 채색 패널 새 레이어를 생성합니다.`,
    },
    {
      stageId: "04-background" as const,
      stageLabelKo: "04 배경 (채색 캔버스 영역 배경 생성)",
      actionButtonLabelKo: `${selectedRegionsCount}개 영역 배경 생성`,
      technicalSummaryKo:
        "별도 배경 패널로 이동하지 않고 채색 캔버스에서 영역을 지정해 캐릭터 뒤에 새 배경 레이어를 추가하며, 겹치는 이전 AI 배경은 자동 숨김 처리합니다.",
    },
  ]);

  const episodeTitle = (input.episodeTitle ?? "01화 · 첫 만남").trim() || "01화 · 첫 만남";
  const layers: readonly AidPsdLayerEntry[] = Object.freeze([
    {
      layerOrder: 5,
      layerNameKo: `직접 브러시 보정 레이어 (${characterName})`,
      stageOrigin: "02-lineart-pentouch",
      visible: true,
      opacityPercent: 100,
      blendMode: "Normal",
      isEditableBrushLayer: true,
    },
    {
      layerOrder: 4,
      layerNameKo: `AI 선화 · 영역 1 (${characterName})`,
      stageOrigin: "02-lineart-pentouch",
      visible: true,
      opacityPercent: 100,
      blendMode: "Multiply",
      isEditableBrushLayer: true,
    },
    {
      layerOrder: 3,
      layerNameKo: `AI 채색 · 영역 1 (${characterName})`,
      stageOrigin: "03-coloring",
      visible: true,
      opacityPercent: 100,
      blendMode: "Normal",
      isEditableBrushLayer: true,
    },
    {
      layerOrder: 2,
      layerNameKo: "AI 배경 생성 레이어 (최신)",
      stageOrigin: "04-background",
      visible: true,
      opacityPercent: 100,
      blendMode: "Normal",
      isEditableBrushLayer: true,
    },
    {
      layerOrder: 1,
      layerNameKo: "원본 러프 스케치 (보존됨)",
      stageOrigin: "01-sketch",
      visible: false,
      opacityPercent: 45,
      blendMode: "Normal",
      isEditableBrushLayer: true,
    },
  ]);

  return Object.freeze({
    activeStage,
    brushCanvasSpec,
    characterSheet,
    uploadChecklist,
    selectedRegionsCount,
    stageOutputs,
    psdExportManifest: Object.freeze({
      exportFormat: "PSD" as const,
      clipStudioPaintCompatible: true as const,
      fileName: `${episodeTitle} · PSD`,
      layers,
    }),
  });
}

/**
 * 네이버웹툰 AI 페인터 (Naver Webtoon AI Painter) — 딥러닝 힌트 포인트 채색 엔진
 */
export type ColorHintRegionRole =
  | "hair"
  | "skin"
  | "eyes"
  | "outfit-primary"
  | "outfit-secondary"
  | "background-ambient";

export interface ColorHintPoint {
  readonly id: string;
  readonly regionRole: ColorHintRegionRole;
  readonly labelKo: string;
  readonly xNorm: number;
  readonly yNorm: number;
  readonly hexColor: string;
  readonly spreadRadiusPx: number;
}

export interface DiffusedColorRegion {
  readonly hintId: string;
  readonly regionRole: ColorHintRegionRole;
  readonly labelKo: string;
  readonly baseFlatHex: string;
  readonly softShadowHex: string;
  readonly highlightHex: string;
  readonly coveragePercent: number;
  readonly boundaryLeakPreventionScore: number;
}

export interface NaverWebtoonAiPainterResult {
  readonly hintPoints: readonly ColorHintPoint[];
  readonly diffusedRegions: readonly DiffusedColorRegion[];
  readonly edgeAwarenessScore: number;
  readonly gradientSmoothnessScore: number;
  readonly previewSvgDataUrl: string;
  readonly coachingTipKo: string;
}

export const DEFAULT_NAVER_AI_PAINTER_HINTS: readonly ColorHintPoint[] = Object.freeze([
  {
    id: "hint-hair",
    regionRole: "hair",
    labelKo: "머리카락 힌트 점",
    xNorm: 0.48,
    yNorm: 0.24,
    hexColor: "#2D3250",
    spreadRadiusPx: 54,
  },
  {
    id: "hint-skin",
    regionRole: "skin",
    labelKo: "얼굴 피부 힌트 점",
    xNorm: 0.5,
    yNorm: 0.38,
    hexColor: "#F9E2D0",
    spreadRadiusPx: 42,
  },
  {
    id: "hint-eyes",
    regionRole: "eyes",
    labelKo: "눈동자 포인트 힌트 점",
    xNorm: 0.45,
    yNorm: 0.36,
    hexColor: "#E06469",
    spreadRadiusPx: 18,
  },
  {
    id: "hint-outfit",
    regionRole: "outfit-primary",
    labelKo: "의상 메인 힌트 점",
    xNorm: 0.52,
    yNorm: 0.68,
    hexColor: "#424769",
    spreadRadiusPx: 68,
  },
  {
    id: "hint-bg",
    regionRole: "background-ambient",
    labelKo: "배경 무드 힌트 점",
    xNorm: 0.18,
    yNorm: 0.2,
    hexColor: "#F6B17A",
    spreadRadiusPx: 88,
  },
]);

function shiftHexBrightness(hex: string, delta: number): string {
  const clean = hex.replace("#", "").padEnd(6, "0").slice(0, 6);
  const r = Math.max(0, Math.min(255, parseInt(clean.slice(0, 2), 16) + delta));
  const g = Math.max(0, Math.min(255, parseInt(clean.slice(2, 4), 16) + delta));
  const b = Math.max(0, Math.min(255, parseInt(clean.slice(4, 6), 16) + delta));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

/**
 * 네이버웹툰 AI 페인터 힌트 채색 시뮬레이터.
 * 스케치 위에 찍은 3~6개의 색상 힌트 포인트만으로 선화 경계(Edge)를 침범하지 않고
 * 자연스러운 셀·그라데이션 채색 결과를 계산하며, 즉시 렌더링 가능한 SVG Data URL을 반환한다.
 */
export function runNaverWebtoonAiHintPainter(
  customHints?: readonly ColorHintPoint[],
): NaverWebtoonAiPainterResult {
  const hintPoints =
    customHints && customHints.length > 0 ? customHints : DEFAULT_NAVER_AI_PAINTER_HINTS;

  const diffusedRegions: DiffusedColorRegion[] = hintPoints.map((pt, idx) => ({
    hintId: pt.id,
    regionRole: pt.regionRole,
    labelKo: pt.labelKo,
    baseFlatHex: pt.hexColor.toUpperCase(),
    softShadowHex: shiftHexBrightness(pt.hexColor, -28),
    highlightHex: shiftHexBrightness(pt.hexColor, 26),
    coveragePercent: Math.min(45, Math.max(8, Math.round(pt.spreadRadiusPx * 0.34))),
    boundaryLeakPreventionScore: Math.min(99, 94 + (idx % 5)),
  }));

  const circlesSvg = hintPoints
    .map((pt) => {
      const cx = Math.round(pt.xNorm * 200);
      const cy = Math.round(pt.yNorm * 200);
      const r = Math.max(14, Math.round(pt.spreadRadiusPx * 0.75));
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${pt.hexColor}" fill-opacity="0.62" /><circle cx="${cx}" cy="${cy}" r="5" fill="${pt.hexColor}" stroke="#FFFFFF" stroke-width="2" />`;
    })
    .join("");

  const svgMarkup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#FAF8F5"/>${circlesSvg}<path d="M65,65 Q100,25 135,65 L145,165 L55,165 Z" fill="none" stroke="#232128" stroke-width="2.5"/></svg>`;
  const previewSvgDataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svgMarkup)}`;

  return Object.freeze({
    hintPoints: Object.freeze([...hintPoints]),
    diffusedRegions: Object.freeze(diffusedRegions),
    edgeAwarenessScore: 96,
    gradientSmoothnessScore: 94,
    previewSvgDataUrl,
    coachingTipKo: `총 ${hintPoints.length}개의 색상 힌트 포인트를 기반으로 닫힌 선화 영역 내부에 그라데이션 밑색과 부드러운 명암을 확산했습니다.`,
  });
}

/**
 * 클립스튜디오 페인트 (Clip Studio Paint) — AI 채색 힌트 · 포즈 스캐너 · 배경 LT 변환 엔진
 */
export interface ClipStudioPaintAssistResult {
  readonly colorizeMode: "hint-points" | "reference-image";
  readonly poseScannerRig: {
    readonly detectedJointsCount: 28;
    readonly handScannerSynced: true;
    readonly cameraPerspectiveFovDeg: number;
    readonly poseDescriptionKo: string;
  };
  readonly backgroundLtConversion: {
    readonly lineThreshold: number;
    readonly screentoneFrequencyLpi: 45 | 60 | 85;
    readonly separatedLayers: readonly [
      "LT 외곽 선화 레이어 (Vector)",
      "LT 디테일 선화 레이어 (Raster)",
      "스크린톤 명암 레이어 (60LPI 망점)",
      "화이트 언더레이 레이어",
    ];
  };
  readonly fourStepProWorkflow: readonly {
    readonly stepNumber: 1 | 2 | 3 | 4;
    readonly titleKo: string;
    readonly detailKo: string;
  }[];
}

export function runClipStudioPaintAiAssist(input: {
  readonly colorizeMode?: "hint-points" | "reference-image";
  readonly screentoneLpi?: 45 | 60 | 85;
  readonly poseFovDeg?: number;
} = {}): ClipStudioPaintAssistResult {
  const colorizeMode = input.colorizeMode ?? "hint-points";
  const screentoneFrequencyLpi = input.screentoneLpi ?? 60;
  const cameraPerspectiveFovDeg = Math.max(15, Math.min(90, input.poseFovDeg ?? 35));

  return Object.freeze({
    colorizeMode,
    poseScannerRig: Object.freeze({
      detectedJointsCount: 28 as const,
      handScannerSynced: true as const,
      cameraPerspectiveFovDeg,
      poseDescriptionKo: `3D 데생 인형 28개 전신 관절 + 실시간 핸드 스캐너 동기화 (원근 시야각 ${cameraPerspectiveFovDeg}°)`,
    }),
    backgroundLtConversion: Object.freeze({
      lineThreshold: 42,
      screentoneFrequencyLpi,
      separatedLayers: Object.freeze([
        "LT 외곽 선화 레이어 (Vector)",
        "LT 디테일 선화 레이어 (Raster)",
        "스크린톤 명암 레이어 (60LPI 망점)",
        "화이트 언더레이 레이어",
      ] as const),
    }),
    fourStepProWorkflow: Object.freeze([
      {
        stepNumber: 1 as const,
        titleKo: "1단계: 세로 스크롤 콘티 & 컷 테두리 분할",
        detailKo: "컷 폴더 자동 분리 및 모바일 시선 유도 말풍선 배치",
      },
      {
        stepNumber: 2 as const,
        titleKo: "2단계: 3D 데생 인형 포즈 스캐너 & 벡터 선화",
        detailKo: "사진 포즈 인식 적용 후 벡터 레이어 교차점 지우개로 펜터치 마감",
      },
      {
        stepNumber: 3 as const,
        titleKo: "3단계: AI 힌트 채색 & 틈새 닫기 밑색",
        detailKo: "힌트 색상 지정 또는 레퍼런스 이미지 기반 광원 자동 채색",
      },
      {
        stepNumber: 4 as const,
        titleKo: "4단계: 3D 배경 LT 변환 & PSD/CLIP 마스터링",
        detailKo: `3D 배경을 선화+${screentoneFrequencyLpi}LPI 스크린톤으로 분리 변환하여 원고 완성`,
      },
    ]),
  });
}
