/**
 * 스트로크 이벤트 로그 기반 WebM 타임랩스 리플레이 스케줄러(T11 / F10) 및
 * 비파괴 웹툰 4계층(.psd) 레이어 트리 매니페스트 빌더(F09).
 */

export type TimelapsePlaybackRate = 0.5 | 1 | 2 | 4;

export interface RecordedStrokeEvent {
  readonly strokeId: string;
  readonly layerId: string;
  readonly startedAtMs: number;
  readonly durationMs: number;
}

export interface ScheduledTimelapseFrame {
  readonly strokeId: string;
  readonly layerId: string;
  readonly replayAtMs: number;
  readonly replayDurationMs: number;
}

export interface TimelapseScheduleSummary {
  readonly rate: TimelapsePlaybackRate;
  readonly mimeType: string;
  readonly totalFrames: number;
  readonly totalReplayDurationMs: number;
  readonly frames: readonly ScheduledTimelapseFrame[];
}

const PREFERRED_WEBM_MIMES = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
] as const;

/** 브라우저 MediaRecorder 지원 여부를 조회해 최적의 WebM 코덱 MIME을 결정한다. */
export function negotiateTimelapseWebmMimeType(
  isTypeSupported?: (mime: string) => boolean,
): string {
  if (isTypeSupported) {
    for (const candidate of PREFERRED_WEBM_MIMES) {
      if (isTypeSupported(candidate)) return candidate;
    }
  }
  return "video/webm";
}

/**
 * 작가의 긴 유휴 정지 구간(`maxIdleGapMs = 800ms`)을 자동 압축하고
 * `0.5x ~ 4x` 배속을 적용한 결정적 타임랩스 재생 타임라인을 생성한다.
 */
export function buildStrokeTimelapseSchedule(
  events: readonly RecordedStrokeEvent[],
  rate: TimelapsePlaybackRate = 2,
  options: {
    readonly maxIdleGapMs?: number;
    readonly isTypeSupported?: (mime: string) => boolean;
  } = {},
): TimelapseScheduleSummary {
  const maxIdleGapMs = Math.max(80, options.maxIdleGapMs ?? 800);
  const safeRate = rate > 0 ? rate : 1;
  const sorted = [...events].sort((a, b) => a.startedAtMs - b.startedAtMs);
  const frames: ScheduledTimelapseFrame[] = [];

  let timelineCursorMs = 0;
  let prevRawEndMs: number | null = null;

  for (const event of sorted) {
    const rawDuration = Math.max(16, event.durationMs);
    if (prevRawEndMs !== null) {
      const rawGap = Math.max(0, event.startedAtMs - prevRawEndMs);
      const compressedGap = Math.min(rawGap, maxIdleGapMs) / safeRate;
      timelineCursorMs += compressedGap;
    }
    const replayDurationMs = Math.max(8, Math.round(rawDuration / safeRate));
    frames.push({
      strokeId: event.strokeId,
      layerId: event.layerId,
      replayAtMs: Math.round(timelineCursorMs),
      replayDurationMs,
    });
    timelineCursorMs += replayDurationMs;
    prevRawEndMs = event.startedAtMs + rawDuration;
  }

  return Object.freeze({
    rate,
    mimeType: negotiateTimelapseWebmMimeType(options.isTypeSupported),
    totalFrames: frames.length,
    totalReplayDurationMs: Math.round(timelineCursorMs),
    frames: Object.freeze(frames),
  });
}

/* ------------------------------------------------------------------ F09 PSD Layer Group Tree */

export type WebtoonPsdGroupId = "dialogue-sfx" | "line-art" | "color-shading" | "bg3d-stage";

export interface SourceManuscriptLayerForPsd {
  readonly id: string;
  readonly name: string;
  readonly role: "balloon" | "text" | "sfx" | "line" | "color" | "shading" | "bg3d" | "raster";
  readonly visible: boolean;
  readonly opacity: number; // 0..1
  readonly blendMode?: "normal" | "multiply" | "screen" | "overlay";
  readonly clippingMask?: boolean;
  readonly rightsBomAssetId?: string | null;
}

export interface PsdExportLayerEntry {
  readonly id: string;
  readonly name: string;
  readonly visible: boolean;
  readonly opacityByte: number; // 0..255
  readonly blendMode: "normal" | "multiply" | "screen" | "overlay";
  readonly clippingMask: boolean;
  readonly rightsBomAssetId: string | null;
}

export interface PsdExportFolderGroup {
  readonly groupId: WebtoonPsdGroupId;
  readonly folderNameKo: string;
  readonly layers: readonly PsdExportLayerEntry[];
}

export interface WebtoonPsdExportManifest {
  readonly widthPx: number;
  readonly heightPx: number;
  readonly colorDepthBits: 8;
  readonly groups: readonly PsdExportFolderGroup[];
  readonly totalLayerCount: number;
  readonly preservedRightsBomIds: readonly string[];
}

const PSD_GROUP_ORDER: ReadonlyArray<{ readonly id: WebtoonPsdGroupId; readonly folderNameKo: string }> = [
  { id: "dialogue-sfx", folderNameKo: "01_말풍선·식자·효과음" },
  { id: "line-art", folderNameKo: "02_선화(Line)" },
  { id: "color-shading", folderNameKo: "03_밑색·명암(Color)" },
  { id: "bg3d-stage", folderNameKo: "04_3D·배경(BG3D)" },
];

function classifyPsdGroup(role: SourceManuscriptLayerForPsd["role"]): WebtoonPsdGroupId {
  if (role === "balloon" || role === "text" || role === "sfx") return "dialogue-sfx";
  if (role === "line") return "line-art";
  if (role === "bg3d") return "bg3d-stage";
  return "color-shading";
}

/**
 * 웹툰 에이전시·PD 납품 표준에 맞춰 원고 레이어를 4대 비파괴 PSD 폴더 그룹으로 정렬하고
 * 블렌드 모드·불투명도(0..255)·클리핑 마스크·Rights BOM 출처 ID를 보존한다.
 */
export function buildWebtoonPsdExportManifest(input: {
  readonly widthPx: number;
  readonly heightPx: number;
  readonly layers: readonly SourceManuscriptLayerForPsd[];
}): WebtoonPsdExportManifest {
  const buckets = new Map<WebtoonPsdGroupId, PsdExportLayerEntry[]>();
  for (const g of PSD_GROUP_ORDER) buckets.set(g.id, []);
  const rightsSet = new Set<string>();

  for (const layer of input.layers) {
    const groupId = classifyPsdGroup(layer.role);
    const clampedOpacity = Math.max(0, Math.min(1, Number.isFinite(layer.opacity) ? layer.opacity : 1));
    const bomId = layer.rightsBomAssetId?.trim() || null;
    if (bomId) rightsSet.add(bomId);
    buckets.get(groupId)!.push({
      id: layer.id,
      name: layer.name.trim() || layer.id,
      visible: layer.visible,
      opacityByte: Math.round(clampedOpacity * 255),
      blendMode: layer.blendMode ?? "normal",
      clippingMask: Boolean(layer.clippingMask),
      rightsBomAssetId: bomId,
    });
  }

  const groups: PsdExportFolderGroup[] = PSD_GROUP_ORDER.map((g) => ({
    groupId: g.id,
    folderNameKo: g.folderNameKo,
    layers: Object.freeze(buckets.get(g.id) ?? []),
  }));

  return Object.freeze({
    widthPx: Math.max(1, Math.round(input.widthPx)),
    heightPx: Math.max(1, Math.round(input.heightPx)),
    colorDepthBits: 8,
    groups: Object.freeze(groups),
    totalLayerCount: input.layers.length,
    preservedRightsBomIds: Object.freeze([...rightsSet]),
  });
}
