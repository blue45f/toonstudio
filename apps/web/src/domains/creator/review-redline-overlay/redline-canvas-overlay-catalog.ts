/**
 * PD·강사 붉은펜 검수 ↔ 드로잉 캔버스 최상단 비출력(Non-Export) 오버레이 카탈로그 및 초기 시드 데이터.
 *
 * 모든 사용자 표시 텍스트는 KO/EN 이중 언어로 분리하며 EN 문자열에는 한글을 포함하지 않는다.
 */

export const NONPRINT_REDLINE_LAYER_ID = "99_NONPRINT_REDLINE_OVERLAY" as const;
export const REDLINE_OVERLAY_SCHEMA_VERSION = "toonstudio.canvas-redline-overlay.v1" as const;
export const REDLINE_OPACITY_MIN = 0.1;
export const REDLINE_OPACITY_MAX = 1.0;

export type RedlineProcessStage =
  | "lineart"
  | "bg3d"
  | "flatting"
  | "shading"
  | "lettering"
  | "pd-qa";

export type RedlinePinStatus = "open" | "in-progress" | "resolved" | "verified";

export type RedlineStrokeTone = "critical" | "guide" | "callout";

export interface RedlineStrokePoint {
  readonly xPct: number;
  readonly yPct: number;
  readonly pressure?: number;
}

export interface RedlineStroke {
  readonly id: string;
  readonly authorRole: "pd" | "instructor" | "artist";
  readonly strokeWidthPx: number;
  readonly style: "solid" | "dashed" | "arrow";
  readonly tone: RedlineStrokeTone;
  readonly points: readonly RedlineStrokePoint[];
}

export interface RedlineVoiceNoteMeta {
  readonly id: string;
  readonly durationSec: number;
  readonly speakerKo: string;
  readonly speakerEn: string;
  readonly transcriptKo: string;
  readonly transcriptEn: string;
  readonly recordedAtIso: string;
  readonly waveformPeaks?: readonly number[];
}

export interface RedlinePinThread {
  readonly id: string;
  readonly pinNumber: number;
  readonly cutId: string;
  readonly cutIndex: number;
  readonly xPct: number;
  readonly yPct: number;
  readonly stage: RedlineProcessStage;
  readonly priority: "must-fix" | "polish";
  readonly reviewerKo: string;
  readonly reviewerEn: string;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly noteKo: string;
  readonly noteEn: string;
  readonly strokes: readonly RedlineStroke[];
  readonly voiceNote?: RedlineVoiceNoteMeta;
  readonly status: RedlinePinStatus;
  readonly createdAtIso: string;
  readonly resolvedAtIso: string | null;
  readonly resolvedByKo: string | null;
  readonly resolvedByEn: string | null;
  readonly assigneeKo: string;
  readonly assigneeEn: string;
}

export interface CutCanvasMetric {
  readonly cutId: string;
  readonly cutIndex: number;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly offsetY: number;
  readonly width: number;
  readonly height: number;
}

export interface RedlineStageSpec {
  readonly id: RedlineProcessStage;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly shortKo: string;
  readonly shortEn: string;
  readonly ownerKo: string;
  readonly ownerEn: string;
}

export interface RedlineStatusSpec {
  readonly id: RedlinePinStatus;
  readonly labelKo: string;
  readonly labelEn: string;
}

export type ExportFormatKind = "png" | "psd" | "webtoon-slice" | "pdf-print";

export interface NonPrintRedlineOverlayState {
  readonly schemaVersion: typeof REDLINE_OVERLAY_SCHEMA_VERSION;
  readonly episodeId: string;
  readonly episodeTitleKo: string;
  readonly episodeTitleEn: string;
  readonly layerId: typeof NONPRINT_REDLINE_LAYER_ID;
  readonly zIndexOrder: "topmost";
  readonly exportable: false;
  readonly printVisible: false;
  readonly opacity: number;
  readonly visible: boolean;
  readonly activeCutIndex: number;
  readonly activeStageFilter: RedlineProcessStage | "all";
  readonly selectedPinId: string | null;
  readonly pins: readonly RedlinePinThread[];
  readonly cuts: readonly CutCanvasMetric[];
  readonly lastSyncedAtIso: string;
  readonly syncRevision: number;
}

export interface CanvasViewportMetrics {
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly canvasWidth: number;
  readonly canvasTotalHeight: number;
  readonly currentZoom?: number;
  readonly targetZoom?: number;
  readonly minZoom?: number;
  readonly maxZoom?: number;
  readonly cuts: readonly CutCanvasMetric[];
}

export interface ViewportJumpTarget {
  readonly pinId: string;
  readonly cutId: string;
  readonly cutIndex: number;
  readonly focusCanvasX: number;
  readonly focusCanvasY: number;
  readonly zoom: number;
  readonly scrollLeft: number;
  readonly scrollTop: number;
  readonly panOffsetX: number;
  readonly panOffsetY: number;
  readonly clampedX: boolean;
  readonly clampedY: boolean;
}

export interface ExportableCanvasLayer {
  readonly id: string;
  readonly name: string;
  readonly kind:
    | "raster"
    | "vector"
    | "text"
    | "bg3d"
    | "adjustment"
    | "redline-overlay"
    | "guide";
  readonly visible: boolean;
  readonly opacity: number;
  readonly exportable?: boolean;
  readonly printVisible?: boolean;
  readonly nonPrint?: boolean;
  readonly pixelCount?: number;
}

export type NonPrintStripReason =
  | "nonprint-layer-id"
  | "exportable-false"
  | "print-visible-false"
  | "nonprint-flag"
  | "redline-overlay-kind"
  | "nonprint-name-prefix";

export interface StrippedNonPrintLayerRecord {
  readonly id: string;
  readonly name: string;
  readonly reason: NonPrintStripReason;
}

export interface NonPrintExportAuditReport {
  readonly format: ExportFormatKind;
  readonly passed: boolean;
  readonly redlinePixelLeakCount: 0;
  readonly totalInputLayers: number;
  readonly exportedLayerCount: number;
  readonly strippedCount: number;
  readonly strippedLayers: readonly StrippedNonPrintLayerRecord[];
  readonly exportedLayers: readonly ExportableCanvasLayer[];
  readonly checkedAtIso: string;
  readonly summaryKo: string;
  readonly summaryEn: string;
}

export interface StageProgressSummary {
  readonly stage: RedlineProcessStage;
  readonly total: number;
  readonly openCount: number;
  readonly inProgressCount: number;
  readonly resolvedCount: number;
  readonly verifiedCount: number;
  readonly completionPct: number;
}

export interface ReviewBoardMetricsSummary {
  readonly totalCount: number;
  readonly openCount: number;
  readonly pendingOpenCount: number;
  readonly inProgressCount: number;
  readonly resolvedCount: number;
  readonly verifiedCount: number;
  readonly completedCount: number;
  readonly completionPct: number;
  readonly canShip: boolean;
  readonly stageProgress: readonly StageProgressSummary[];
}

export interface ReviewBoardSyncSnapshot extends ReviewBoardMetricsSummary {
  readonly nextState: NonPrintRedlineOverlayState;
  readonly changedPin: RedlinePinThread | null;
  readonly syncEventSummaryKo: string;
  readonly syncEventSummaryEn: string;
}

export interface AddRedlineOverlayPinInput {
  readonly id?: string;
  readonly cutIndex: number;
  readonly xPct: number;
  readonly yPct: number;
  readonly stage: RedlineProcessStage;
  readonly priority?: "must-fix" | "polish";
  readonly reviewerKo?: string;
  readonly reviewerEn?: string;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly noteKo: string;
  readonly noteEn: string;
  readonly strokePoints?: readonly RedlineStrokePoint[];
  readonly strokeTone?: RedlineStrokeTone;
  readonly voiceNote?: RedlineVoiceNoteMeta;
  readonly createdAtIso?: string;
}

export interface OverlayControlPatch {
  readonly opacity?: number;
  readonly visible?: boolean;
  readonly activeCutIndex?: number;
  readonly activeStageFilter?: RedlineProcessStage | "all";
  readonly selectedPinId?: string | null;
}

export interface SyncResolutionOptions {
  readonly actorKo?: string;
  readonly actorEn?: string;
  readonly syncedAtIso?: string;
}

export const REDLINE_STAGE_ORDER: readonly RedlineProcessStage[] = Object.freeze([
  "lineart",
  "bg3d",
  "flatting",
  "shading",
  "lettering",
  "pd-qa",
]);

export const REDLINE_STAGE_SPECS: Readonly<Record<RedlineProcessStage, RedlineStageSpec>> =
  Object.freeze({
    lineart: {
      id: "lineart",
      labelKo: "선화",
      labelEn: "Line Art",
      shortKo: "선화",
      shortEn: "Line",
      ownerKo: "선화 담당",
      ownerEn: "Line Artist",
    },
    bg3d: {
      id: "bg3d",
      labelKo: "3D 배경",
      labelEn: "3D Background",
      shortKo: "3D배경",
      shortEn: "3D BG",
      ownerKo: "배경 담당",
      ownerEn: "3D BG Artist",
    },
    flatting: {
      id: "flatting",
      labelKo: "밑색",
      labelEn: "Flatting",
      shortKo: "밑색",
      shortEn: "Flat",
      ownerKo: "밑색 담당",
      ownerEn: "Flatter",
    },
    shading: {
      id: "shading",
      labelKo: "명암·채색",
      labelEn: "Shading",
      shortKo: "명암",
      shortEn: "Shade",
      ownerKo: "채색 담당",
      ownerEn: "Colorist",
    },
    lettering: {
      id: "lettering",
      labelKo: "식자·말풍선",
      labelEn: "Lettering",
      shortKo: "식자",
      shortEn: "Type",
      ownerKo: "식자 담당",
      ownerEn: "Letterer",
    },
    "pd-qa": {
      id: "pd-qa",
      labelKo: "PD 최종 검수",
      labelEn: "PD Final QA",
      shortKo: "PD검수",
      shortEn: "PD QA",
      ownerKo: "담당 PD",
      ownerEn: "Lead PD",
    },
  });

export const REDLINE_STATUS_SPECS: Readonly<Record<RedlinePinStatus, RedlineStatusSpec>> =
  Object.freeze({
    open: {
      id: "open",
      labelKo: "미해결",
      labelEn: "Open",
    },
    "in-progress": {
      id: "in-progress",
      labelKo: "수정 중",
      labelEn: "In Progress",
    },
    resolved: {
      id: "resolved",
      labelKo: "수정 완료",
      labelEn: "Resolved",
    },
    verified: {
      id: "verified",
      labelKo: "PD 확인",
      labelEn: "Verified",
    },
  });

export function createInitialCutMetrics(): readonly CutCanvasMetric[] {
  return [
    {
      cutId: "CUT-01",
      cutIndex: 1,
      labelKo: "1컷 · 옥상 진입 투시",
      labelEn: "Cut 01 · Rooftop Entry Perspective",
      offsetY: 0,
      width: 800,
      height: 1280,
    },
    {
      cutId: "CUT-02",
      cutIndex: 2,
      labelKo: "2컷 · 주인공 시선 클로즈업",
      labelEn: "Cut 02 · Protagonist Gaze Close-Up",
      offsetY: 1280,
      width: 800,
      height: 1280,
    },
    {
      cutId: "CUT-03",
      cutIndex: 3,
      labelKo: "3컷 · 대치 말풍선 · 림라이트",
      labelEn: "Cut 03 · Standoff Dialogue & Rim Light",
      offsetY: 2560,
      width: 800,
      height: 1280,
    },
  ];
}

export function createInitialRedlinePins(): readonly RedlinePinThread[] {
  return [
    {
      id: "rpin-01",
      pinNumber: 1,
      cutId: "CUT-01",
      cutIndex: 1,
      xPct: 34,
      yPct: 42,
      stage: "lineart",
      priority: "must-fix",
      reviewerKo: "한서윤 PD",
      reviewerEn: "PD Seoyoon Han",
      titleKo: "오른쪽 어깨 외곽 틈새 봉합",
      titleEn: "Seal right shoulder contour gap",
      noteKo: "채우기 시 색 번짐이 생길 수 있는 2px 열린 선을 닫고, 쇄골 필압을 15% 가늘게 정리해 주세요.",
      noteEn: "Close the 2px open contour that leaks during flatting and taper collarbone pressure by 15%.",
      strokes: [
        {
          id: "stroke-01-a",
          authorRole: "pd",
          strokeWidthPx: 3,
          style: "solid",
          tone: "critical",
          points: [
            { xPct: 24, yPct: 37, pressure: 0.5 },
            { xPct: 31, yPct: 35, pressure: 0.78 },
            { xPct: 40, yPct: 41, pressure: 0.84 },
            { xPct: 38, yPct: 48, pressure: 0.62 },
            { xPct: 28, yPct: 47, pressure: 0.55 },
          ],
        },
        {
          id: "stroke-01-b",
          authorRole: "pd",
          strokeWidthPx: 2.4,
          style: "arrow",
          tone: "guide",
          points: [
            { xPct: 18, yPct: 31, pressure: 0.6 },
            { xPct: 29, yPct: 39, pressure: 0.75 },
          ],
        },
      ],
      voiceNote: {
        id: "vn-01",
        durationSec: 18,
        speakerKo: "한서윤 PD",
        speakerEn: "PD Seoyoon Han",
        transcriptKo: "1컷 어깨 외곽이 끊어져 있어서 밑색 자동 채우기할 때 배경으로 흘러요. 펜 끝으로 살짝 이어 주세요.",
        transcriptEn: "The shoulder outline in Cut 01 is open, so auto-flatting leaks into the sky. Close the seam cleanly.",
        recordedAtIso: "2026-11-23T06:10:00Z",
        waveformPeaks: [0.3, 0.68, 0.92, 0.55, 0.74, 0.88, 0.42, 0.61],
      },
      status: "open",
      createdAtIso: "2026-11-23T06:10:00Z",
      resolvedAtIso: null,
      resolvedByKo: null,
      resolvedByEn: null,
      assigneeKo: "김민재 (선화)",
      assigneeEn: "Minjae Kim (Line Art)",
    },
    {
      id: "rpin-02",
      pinNumber: 2,
      cutId: "CUT-01",
      cutIndex: 1,
      xPct: 72,
      yPct: 68,
      stage: "bg3d",
      priority: "must-fix",
      reviewerKo: "강도현 강사",
      reviewerEn: "Instructor Dohyun Kang",
      titleKo: "난간 소실점 눈높이 정렬",
      titleEn: "Align railing vanishing line to eye level",
      noteKo: "3D 난간 투시선이 캐릭터 눈높이보다 8도 낮게 꺾였습니다. 카메라 피치를 +4도 올려 일치시켜 주세요.",
      noteEn: "The 3D railing horizon tilts 8 degrees below character eye level. Raise camera pitch by +4 deg.",
      strokes: [
        {
          id: "stroke-02-a",
          authorRole: "instructor",
          strokeWidthPx: 2.5,
          style: "dashed",
          tone: "guide",
          points: [
            { xPct: 54, yPct: 74, pressure: 0.6 },
            { xPct: 72, yPct: 67, pressure: 0.7 },
            { xPct: 90, yPct: 60, pressure: 0.6 },
          ],
        },
      ],
      status: "in-progress",
      createdAtIso: "2026-11-23T06:18:00Z",
      resolvedAtIso: null,
      resolvedByKo: null,
      resolvedByEn: null,
      assigneeKo: "이소라 (3D 배경)",
      assigneeEn: "Sora Lee (3D BG)",
    },
    {
      id: "rpin-03",
      pinNumber: 3,
      cutId: "CUT-02",
      cutIndex: 2,
      xPct: 52,
      yPct: 33,
      stage: "shading",
      priority: "polish",
      reviewerKo: "한서윤 PD",
      reviewerEn: "PD Seoyoon Han",
      titleKo: "역광 림라이트 채도 보강",
      titleEn: "Boost backlit rim highlight saturation",
      noteKo: "클로즈업 머리카락 외곽에 저녁 역광 하이라이트를 20% 더해 시선이 눈동자로 모이게 해 주세요.",
      noteEn: "Add 20% stronger sunset rim light along the hair silhouette to focus gaze on the eyes.",
      strokes: [
        {
          id: "stroke-03-a",
          authorRole: "pd",
          strokeWidthPx: 3.2,
          style: "solid",
          tone: "callout",
          points: [
            { xPct: 38, yPct: 24, pressure: 0.5 },
            { xPct: 52, yPct: 21, pressure: 0.85 },
            { xPct: 66, yPct: 29, pressure: 0.72 },
            { xPct: 69, yPct: 43, pressure: 0.5 },
          ],
        },
      ],
      voiceNote: {
        id: "vn-03",
        durationSec: 12,
        speakerKo: "한서윤 PD",
        speakerEn: "PD Seoyoon Han",
        transcriptKo: "2컷은 감정 클라이맥스라 머리 테두리에 얇은 주황 림라이트 한 줄만 얹어도 임팩트가 확 삽니다.",
        transcriptEn: "Cut 02 is the emotional climax; a crisp warm rim highlight on the hair edge will make it pop.",
        recordedAtIso: "2026-11-23T06:24:00Z",
        waveformPeaks: [0.45, 0.82, 0.63, 0.91, 0.52, 0.7],
      },
      status: "open",
      createdAtIso: "2026-11-23T06:24:00Z",
      resolvedAtIso: null,
      resolvedByKo: null,
      resolvedByEn: null,
      assigneeKo: "박하린 (채색)",
      assigneeEn: "Harin Park (Shading)",
    },
    {
      id: "rpin-04",
      pinNumber: 4,
      cutId: "CUT-03",
      cutIndex: 3,
      xPct: 68,
      yPct: 26,
      stage: "lettering",
      priority: "must-fix",
      reviewerKo: "한서윤 PD",
      reviewerEn: "PD Seoyoon Han",
      titleKo: "말풍선 꼬리 방향 및 안전 여백 확보",
      titleEn: "Adjust balloon tail and safe margin",
      noteKo: "오른쪽 여백이 18px로 좁습니다. 말풍선을 좌측으로 6% 이동하고 화자 입 방향으로 꼬리를 돌려 주세요.",
      noteEn: "Right margin is only 18px. Shift balloon 6% left and aim the tail directly toward the speaker.",
      strokes: [
        {
          id: "stroke-04-a",
          authorRole: "pd",
          strokeWidthPx: 2.8,
          style: "solid",
          tone: "critical",
          points: [
            { xPct: 58, yPct: 18, pressure: 0.7 },
            { xPct: 79, yPct: 18, pressure: 0.7 },
            { xPct: 79, yPct: 33, pressure: 0.7 },
            { xPct: 58, yPct: 33, pressure: 0.7 },
            { xPct: 58, yPct: 18, pressure: 0.7 },
          ],
        },
        {
          id: "stroke-04-b",
          authorRole: "pd",
          strokeWidthPx: 2.4,
          style: "arrow",
          tone: "guide",
          points: [
            { xPct: 72, yPct: 26, pressure: 0.7 },
            { xPct: 54, yPct: 39, pressure: 0.85 },
          ],
        },
      ],
      status: "open",
      createdAtIso: "2026-11-23T06:31:00Z",
      resolvedAtIso: null,
      resolvedByKo: null,
      resolvedByEn: null,
      assigneeKo: "정유진 (식자)",
      assigneeEn: "Yujin Jung (Lettering)",
    },
    {
      id: "rpin-05",
      pinNumber: 5,
      cutId: "CUT-02",
      cutIndex: 2,
      xPct: 28,
      yPct: 72,
      stage: "flatting",
      priority: "polish",
      reviewerKo: "강도현 강사",
      reviewerEn: "Instructor Dohyun Kang",
      titleKo: "코트 옷깃 밑색 누락 보완 완료",
      titleEn: "Collar flatting gap patched",
      noteKo: "왼쪽 코트 안감 흰색 잔여 픽셀을 지정 톤으로 채워 마감했습니다.",
      noteEn: "Filled stray uncolored pixels inside the left coat collar using the palette swatch.",
      strokes: [
        {
          id: "stroke-05-a",
          authorRole: "instructor",
          strokeWidthPx: 2.6,
          style: "solid",
          tone: "callout",
          points: [
            { xPct: 23, yPct: 68, pressure: 0.65 },
            { xPct: 33, yPct: 72, pressure: 0.75 },
            { xPct: 27, yPct: 78, pressure: 0.65 },
          ],
        },
      ],
      status: "resolved",
      createdAtIso: "2026-11-23T05:50:00Z",
      resolvedAtIso: "2026-11-23T06:40:00Z",
      resolvedByKo: "최지안 (밑색)",
      resolvedByEn: "Jian Choi (Flatting)",
      assigneeKo: "최지안 (밑색)",
      assigneeEn: "Jian Choi (Flatting)",
    },
  ];
}
