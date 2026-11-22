/**
 * Fresh Ideas v3 — 열린 원고 실측 텔레메트리 어댑터 (#076–#080).
 *
 * 순수 TypeScript 도메인 모듈 (React/DOM/Konva/외부 네트워크/브라우저 KV 무의존).
 * 열린 원고 페이지·컷 데이터에서 실제 컷 수·평균 대사 글자 수·3D 배경 컷 비율·무대사 액션 컷 비율을
 * 100% 실측 추출하며, 빈 새 문서(0컷)에서는 NaN·0 나눗셈 없이 `첫 1화 오프닝 3컷 설계 모드`로
 * 안전 폴백하고 미측정 항목에 `[측정 필요]`를 명시한다.
 */

export type EpisodeTelemetryMode = "measured-episode" | "first-episode-opening-3cut";
export type EpisodeTelemetryMetricKey =
  | "averageDialogueCharsPerCut"
  | "bg3dCutRatio"
  | "silentActionCutRatio";

export const EPISODE_TELEMETRY_MEASUREMENT_NEEDED_TAG = "[측정 필요]" as const;
export const FIRST_EPISODE_OPENING_3CUT_MODE_LABEL_KO = "첫 1화 오프닝 3컷 설계 모드" as const;
export const MEASURED_EPISODE_MODE_LABEL_KO = "열린 원고 실측 바인딩" as const;

export interface EpisodeTelemetryElementLike {
  readonly id?: string;
  readonly type: string;
  readonly text?: string;
  readonly variant?: string;
  readonly name?: string;
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
  readonly frameId?: string;
  readonly frameClipId?: string;
  readonly groupId?: string;
  readonly hidden?: boolean;
  readonly layerRole?: string;
  readonly stickyNotePresetId?: string;
  readonly bg3dScene?: unknown;
  readonly bg3dLtBundleId?: string;
  readonly bg3dLtBundleReference?: unknown;
  readonly bg3dLtRole?: string;
  readonly bg3dLtRenderMode?: string;
  readonly vrmScene?: unknown;
  readonly isBg3d?: boolean;
  readonly hasBg3d?: boolean;
  readonly points?: readonly number[];
}

export interface EpisodeTelemetryGroupLike {
  readonly id: string;
  readonly hidden?: boolean;
  readonly parentId?: string;
}

export interface EpisodeTelemetryCutLike {
  readonly id?: string;
  readonly cutNumber?: number;
  readonly dialogueTexts?: readonly string[];
  readonly dialogueCharCount?: number;
  readonly hasBg3d?: boolean;
  readonly isSilentAction?: boolean;
  readonly hasVisualAction?: boolean;
  readonly elements?: readonly EpisodeTelemetryElementLike[];
}

export interface EpisodeTelemetryPageLike {
  readonly id: string;
  readonly title?: string;
  readonly elements?: readonly EpisodeTelemetryElementLike[];
  readonly groups?: readonly EpisodeTelemetryGroupLike[];
  readonly cuts?: readonly EpisodeTelemetryCutLike[];
}

export interface EpisodeTelemetrySourceInput {
  readonly episodeTitleKo?: string;
  readonly episodeNumber?: number;
  readonly pages?: readonly EpisodeTelemetryPageLike[];
  readonly cuts?: readonly EpisodeTelemetryCutLike[];
}

export interface EpisodeCutTelemetryEntry {
  readonly cutId: string;
  readonly pageId: string;
  readonly cutIndex: number;
  readonly dialogueCharCount: number;
  readonly dialogueElementCount: number;
  readonly hasBg3d: boolean;
  readonly isSilentAction: boolean;
  readonly hasActionCue: boolean;
}

export interface EpisodeTelemetryMetricsDisplayKo {
  readonly cutCountKo: string;
  readonly averageDialogueCharsKo: string;
  readonly bg3dCutRatioKo: string;
  readonly silentActionCutRatioKo: string;
}

export interface FreshIdeasEpisodeTelemetrySnapshot {
  readonly schemaVersion: 3;
  readonly episodeTitleKo: string;
  readonly episodeNumber: number;
  readonly mode: EpisodeTelemetryMode;
  readonly modeLabelKo: string;
  readonly isEmptyDocument: boolean;
  readonly pageCount: number;
  readonly cutCount: number;
  readonly totalDialogueChars: number;
  readonly dialogueCutCount: number;
  readonly bg3dCutCount: number;
  readonly silentActionCutCount: number;
  readonly averageDialogueCharsPerCut: number | null;
  readonly bg3dCutRatio: number | null;
  readonly bg3dCutPercent: number | null;
  readonly silentActionCutRatio: number | null;
  readonly silentActionCutPercent: number | null;
  readonly unmeasuredFields: readonly EpisodeTelemetryMetricKey[];
  readonly metricsDisplayKo: EpisodeTelemetryMetricsDisplayKo;
  readonly badgeSummaryKo: string;
  readonly diagnosticNoteKo: string;
  readonly sourceMetricsSummaryKo: string;
  readonly cuts: readonly EpisodeCutTelemetryEntry[];
}

interface BoundsRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface IndexedFrame {
  readonly id: string;
  readonly sourceIndex: number;
  readonly rect: BoundsRect | null;
}

const BG3D_LAYER_ROLES = new Set<string>(["bg3d", "background-3d", "bg3d-place", "3d-bg"]);

function isFiniteNum(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function round1(value: number): number {
  return Number(value.toFixed(1));
}

function safeRatio(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return Number(Math.min(1, Math.max(0, numerator / denominator)).toFixed(4));
}

function ratioToPercent1(ratio: number | null): number | null {
  return ratio === null || !Number.isFinite(ratio) ? null : round1(ratio * 100);
}

/** 공백·줄바꿈을 제외한 순수 대사 글자 수를 측정한다. */
export function countEpisodeDialogueChars(text: string): number {
  return text.replace(/\s+/gu, "").length;
}

function isElementVisible(
  el: EpisodeTelemetryElementLike,
  groupMap: ReadonlyMap<string, EpisodeTelemetryGroupLike>,
): boolean {
  if (el.hidden === true) return false;
  let currentId = el.groupId;
  const visited = new Set<string>();
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const group = groupMap.get(currentId);
    if (!group) return true;
    if (group.hidden === true) return false;
    currentId = group.parentId;
  }
  return true;
}

function isDialogueCandidate(el: EpisodeTelemetryElementLike): boolean {
  if (el.stickyNotePresetId || (el.type !== "bubble" && el.type !== "text")) return false;
  return typeof el.text === "string" && countEpisodeDialogueChars(el.text) > 0;
}

function isBg3dElement(el: EpisodeTelemetryElementLike): boolean {
  if (el.type === "bg3d" || el.isBg3d === true || el.hasBg3d === true) return true;
  if (el.bg3dScene != null || el.bg3dLtBundleReference != null) return true;
  if (Boolean(el.bg3dLtBundleId) || Boolean(el.bg3dLtRole) || Boolean(el.bg3dLtRenderMode)) return true;
  return typeof el.layerRole === "string" && BG3D_LAYER_ROLES.has(el.layerRole.toLowerCase());
}

function isActionCueElement(el: EpisodeTelemetryElementLike): boolean {
  return (
    el.type === "draw" || el.type === "focusLines" || el.type === "speedLines" ||
    el.type === "sticker" || el.type === "image" || el.type === "bg3d" ||
    el.vrmScene != null || isBg3dElement(el)
  );
}

function extractElementRect(el: EpisodeTelemetryElementLike): BoundsRect | null {
  if (isFiniteNum(el.x) && isFiniteNum(el.y)) {
    return {
      x: el.x,
      y: el.y,
      width: isFiniteNum(el.width) && el.width > 0 ? el.width : 1,
      height: isFiniteNum(el.height) && el.height > 0 ? el.height : 1,
    };
  }
  if (!Array.isArray(el.points) || el.points.length < 2) return null;
  let minX = Number.POSITIVE_INFINITY, maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY, maxY = Number.NEGATIVE_INFINITY;
  for (let i = 0; i + 1 < el.points.length; i += 2) {
    const px = el.points[i], py = el.points[i + 1];
    if (!isFiniteNum(px) || !isFiniteNum(py)) continue;
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

function resolveFrameIdForElement(
  el: EpisodeTelemetryElementLike,
  frames: readonly IndexedFrame[],
  frameIdSet: ReadonlySet<string>,
): string | null {
  if (el.frameClipId && frameIdSet.has(el.frameClipId)) return el.frameClipId;
  if (el.frameId && frameIdSet.has(el.frameId)) return el.frameId;
  if (frames.length === 0) return null;
  const rect = extractElementRect(el);
  if (!rect) return frames.length === 1 ? frames[0]!.id : null;

  let bestArea = 0;
  let bestFrameId: string | null = null;
  for (const frame of frames) {
    if (!frame.rect) continue;
    const w = Math.min(rect.x + rect.width, frame.rect.x + frame.rect.width) - Math.max(rect.x, frame.rect.x);
    const h = Math.min(rect.y + rect.height, frame.rect.y + frame.rect.height) - Math.max(rect.y, frame.rect.y);
    if (w > 0 && h > 0 && w * h > bestArea) {
      bestArea = w * h;
      bestFrameId = frame.id;
    }
  }
  if (bestFrameId) return bestFrameId;

  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  let nearestId: string | null = null;
  let nearestDistSq = Number.POSITIVE_INFINITY;
  for (const frame of frames) {
    if (!frame.rect) continue;
    const dx = cx - (frame.rect.x + frame.rect.width / 2);
    const dy = cy - (frame.rect.y + frame.rect.height / 2);
    if (dx * dx + dy * dy < nearestDistSq) {
      nearestDistSq = dx * dx + dy * dy;
      nearestId = frame.id;
    }
  }
  return nearestId;
}

function extractCutsFromExplicitList(
  cuts: readonly EpisodeTelemetryCutLike[],
  pageId: string,
  startCutIndex: number,
): readonly EpisodeCutTelemetryEntry[] {
  return cuts.map((cut, idx) => {
    const cutIndex = startCutIndex + idx;
    const visibleEls = (cut.elements ?? []).filter((el) => el.hidden !== true);
    let dialogueCharCount = 0;
    let dialogueElementCount = 0;
    if (Array.isArray(cut.dialogueTexts)) {
      for (const line of cut.dialogueTexts) {
        const count = typeof line === "string" ? countEpisodeDialogueChars(line) : 0;
        if (count > 0) {
          dialogueCharCount += count;
          dialogueElementCount += 1;
        }
      }
    } else if (isFiniteNum(cut.dialogueCharCount) && cut.dialogueCharCount >= 0) {
      dialogueCharCount = Math.round(cut.dialogueCharCount);
      dialogueElementCount = dialogueCharCount > 0 ? 1 : 0;
    } else {
      for (const el of visibleEls) {
        if (!isDialogueCandidate(el)) continue;
        dialogueCharCount += countEpisodeDialogueChars(el.text ?? "");
        dialogueElementCount += 1;
      }
    }
    const hasBg3d = cut.hasBg3d === true || visibleEls.some(isBg3dElement);
    const hasActionCue = cut.hasVisualAction === true || hasBg3d || visibleEls.some(isActionCueElement);
    return Object.freeze({
      cutId: cut.id?.trim() || `${pageId}-cut-${cutIndex}`,
      pageId,
      cutIndex,
      dialogueCharCount,
      dialogueElementCount,
      hasBg3d,
      isSilentAction: dialogueCharCount === 0 && (cut.isSilentAction ?? cut.hasVisualAction ?? true),
      hasActionCue,
    });
  });
}

function extractCutsFromPageElements(
  page: EpisodeTelemetryPageLike,
  startCutIndex: number,
): readonly EpisodeCutTelemetryEntry[] {
  const elements = page.elements ?? [];
  if (elements.length === 0) return [];
  const groupMap = new Map((page.groups ?? []).map((group) => [group.id, group]));
  const visible = elements.filter((el) => isElementVisible(el, groupMap));
  if (visible.length === 0) return [];

  const rawFrames: IndexedFrame[] = [];
  for (let i = 0; i < visible.length; i += 1) {
    const el = visible[i]!;
    if (el.type === "frame") {
      rawFrames.push({ id: el.id?.trim() || `${page.id}-frame-${rawFrames.length + 1}`, sourceIndex: i, rect: extractElementRect(el) });
    }
  }

  if (rawFrames.length === 0) {
    const contentVisible = visible.filter(
      (el) => el.type !== "adjustment" && !el.stickyNotePresetId && (isDialogueCandidate(el) || isActionCueElement(el)),
    );
    if (contentVisible.length === 0) return [];
    let dialogueCharCount = 0;
    let dialogueElementCount = 0;
    for (const el of contentVisible) {
      if (!isDialogueCandidate(el)) continue;
      dialogueCharCount += countEpisodeDialogueChars(el.text ?? "");
      dialogueElementCount += 1;
    }
    return [Object.freeze({
      cutId: `${page.id}-cut-1`, pageId: page.id, cutIndex: startCutIndex,
      dialogueCharCount, dialogueElementCount,
      hasBg3d: contentVisible.some(isBg3dElement),
      isSilentAction: dialogueCharCount === 0,
      hasActionCue: contentVisible.some(isActionCueElement),
    })];
  }

  const sortedFrames = [...rawFrames].sort(
    (a, b) =>
      (a.rect?.y ?? Number.POSITIVE_INFINITY) - (b.rect?.y ?? Number.POSITIVE_INFINITY) ||
      (a.rect?.x ?? Number.POSITIVE_INFINITY) - (b.rect?.x ?? Number.POSITIVE_INFINITY) ||
      a.sourceIndex - b.sourceIndex,
  );
  const frameIdSet = new Set(sortedFrames.map((f) => f.id));
  const buckets = new Map(sortedFrames.map((f) => [f.id, { dialogueCharCount: 0, dialogueElementCount: 0, hasBg3d: false, hasActionCue: false }]));

  for (const el of visible) {
    if (el.type === "frame" || el.type === "adjustment" || el.stickyNotePresetId) continue;
    const frameId = resolveFrameIdForElement(el, sortedFrames, frameIdSet);
    const bucket = frameId ? buckets.get(frameId) : undefined;
    if (!bucket) continue;
    if (isDialogueCandidate(el)) {
      bucket.dialogueCharCount += countEpisodeDialogueChars(el.text ?? "");
      bucket.dialogueElementCount += 1;
    }
    if (isBg3dElement(el)) bucket.hasBg3d = true;
    if (isActionCueElement(el)) bucket.hasActionCue = true;
  }

  return sortedFrames.map((frame, idx) => {
    const bucket = buckets.get(frame.id)!;
    return Object.freeze({
      cutId: frame.id, pageId: page.id, cutIndex: startCutIndex + idx,
      dialogueCharCount: bucket.dialogueCharCount, dialogueElementCount: bucket.dialogueElementCount,
      hasBg3d: bucket.hasBg3d, isSilentAction: bucket.dialogueCharCount === 0, hasActionCue: bucket.hasActionCue,
    });
  });
}

function buildDiagnosticNoteKo(cutCount: number, avgChars: number | null, bg3dPct: number | null, silentPct: number | null): string {
  if (cutCount === 0) {
    return `열린 원고에 배치된 컷이 없어(0컷) ${FIRST_EPISODE_OPENING_3CUT_MODE_LABEL_KO}로 전환했습니다. 평균 대사·3D 배경 비율·무대사 액션 비율은 ${EPISODE_TELEMETRY_MEASUREMENT_NEEDED_TAG} 상태로 유지하며 임의 수치를 채우지 않습니다.`;
  }
  const notes: string[] = [];
  if (avgChars !== null && avgChars >= 28) notes.push(`컷당 평균 대사(${avgChars}자)가 높은 편이라 말풍선 호흡 분리가 유리합니다.`);
  else if (avgChars !== null && avgChars <= 10) notes.push(`컷당 평균 대사(${avgChars}자)가 간결해 시각 연출 중심 전개가 선명합니다.`);
  if (bg3dPct !== null && bg3dPct >= 50) notes.push(`3D 배경 컷 비중(${bg3dPct}%)이 절반 이상이므로 인물 선굵기·조명 톤 정합이 핵심입니다.`);
  if (silentPct !== null && silentPct >= 45) notes.push(`무대사 액션 컷 비중(${silentPct}%)이 높아 시선 유도 구도와 대비 조명이 중요합니다.`);
  return notes.length > 0 ? notes.join(" ") : `열린 원고 ${cutCount}컷의 실측 수치를 그대로 반영해 대사·3D 배경·액션 리듬을 유지합니다.`;
}

/**
 * 현재 열린 원고의 페이지·컷 데이터에서 4대 실측 지표를 순수 추출한다.
 * 빈 새 문서(0컷)는 NaN·0 나눗셈 없이 `첫 1화 오프닝 3컷 설계 모드`로 안전 폴백한다.
 */
export function extractEpisodeTelemetryForFreshIdeas(
  input?: EpisodeTelemetrySourceInput | null,
): FreshIdeasEpisodeTelemetrySnapshot {
  const episodeTitleKo = input?.episodeTitleKo?.trim() || "현재 열린 원고";
  const episodeNumber = isFiniteNum(input?.episodeNumber) && input.episodeNumber >= 1 ? Math.floor(input.episodeNumber) : 1;
  const pages = Array.isArray(input?.pages) ? input.pages : [];
  const cuts: EpisodeCutTelemetryEntry[] = [];

  if (pages.length > 0) {
    for (const page of pages) {
      const nextIndex = cuts.length + 1;
      cuts.push(...(Array.isArray(page.cuts) && page.cuts.length > 0
        ? extractCutsFromExplicitList(page.cuts, page.id, nextIndex)
        : extractCutsFromPageElements(page, nextIndex)));
    }
  } else if (Array.isArray(input?.cuts) && input.cuts.length > 0) {
    cuts.push(...extractCutsFromExplicitList(input.cuts, "episode-root", 1));
  }

  const pageCount = pages.length > 0 ? pages.length : cuts.length > 0 ? 1 : 0;
  const cutCount = cuts.length;
  const isEmptyDocument = cutCount === 0;
  let totalDialogueChars = 0, dialogueCutCount = 0, bg3dCutCount = 0, silentActionCutCount = 0;
  for (const cut of cuts) {
    totalDialogueChars += cut.dialogueCharCount;
    if (cut.dialogueCharCount > 0) dialogueCutCount += 1;
    if (cut.hasBg3d) bg3dCutCount += 1;
    if (cut.isSilentAction) silentActionCutCount += 1;
  }

  const averageDialogueCharsPerCut = isEmptyDocument ? null : round1(totalDialogueChars / cutCount);
  const bg3dCutRatio = safeRatio(bg3dCutCount, cutCount);
  const bg3dCutPercent = ratioToPercent1(bg3dCutRatio);
  const silentActionCutRatio = safeRatio(silentActionCutCount, cutCount);
  const silentActionCutPercent = ratioToPercent1(silentActionCutRatio);
  const need = EPISODE_TELEMETRY_MEASUREMENT_NEEDED_TAG;

  const metricsDisplayKo: EpisodeTelemetryMetricsDisplayKo = Object.freeze({
    cutCountKo: isEmptyDocument ? "0컷 (빈 원고)" : `${cutCount}컷`,
    averageDialogueCharsKo: averageDialogueCharsPerCut === null ? need : `${averageDialogueCharsPerCut}자/컷`,
    bg3dCutRatioKo: bg3dCutPercent === null ? need : `${bg3dCutPercent}% (${bg3dCutCount}/${cutCount}컷)`,
    silentActionCutRatioKo: silentActionCutPercent === null ? need : `${silentActionCutPercent}% (${silentActionCutCount}/${cutCount}컷)`,
  });

  const badgeSummaryKo = isEmptyDocument
    ? `${FIRST_EPISODE_OPENING_3CUT_MODE_LABEL_KO} · 0컷 · 평균 대사 ${need} · 3D 배경 ${need} · 무대사 액션 ${need}`
    : `실측 ${cutCount}컷 · 평균 대사 ${averageDialogueCharsPerCut}자 · 3D 배경 ${bg3dCutPercent}% · 무대사 액션 ${silentActionCutPercent}%`;
  const sourceMetricsSummaryKo = isEmptyDocument
    ? `${FIRST_EPISODE_OPENING_3CUT_MODE_LABEL_KO} · 실측 0컷 · 평균 대사 ${need} · 3D 배경 컷 비율 ${need} · 무대사 액션 컷 비율 ${need}`
    : `열린 원고 실측 ${cutCount}컷 (${pageCount}페이지) · 평균 대사 ${averageDialogueCharsPerCut}자/컷 · 3D 배경 컷 ${bg3dCutPercent}% (${bg3dCutCount}/${cutCount}컷) · 무대사 액션 컷 ${silentActionCutPercent}% (${silentActionCutCount}/${cutCount}컷)`;

  return Object.freeze({
    schemaVersion: 3, episodeTitleKo, episodeNumber,
    mode: isEmptyDocument ? "first-episode-opening-3cut" : "measured-episode",
    modeLabelKo: isEmptyDocument ? FIRST_EPISODE_OPENING_3CUT_MODE_LABEL_KO : MEASURED_EPISODE_MODE_LABEL_KO,
    isEmptyDocument, pageCount, cutCount, totalDialogueChars, dialogueCutCount, bg3dCutCount, silentActionCutCount,
    averageDialogueCharsPerCut, bg3dCutRatio, bg3dCutPercent, silentActionCutRatio, silentActionCutPercent,
    unmeasuredFields: isEmptyDocument
      ? Object.freeze(["averageDialogueCharsPerCut", "bg3dCutRatio", "silentActionCutRatio"] as const)
      : Object.freeze([] as const),
    metricsDisplayKo, badgeSummaryKo,
    diagnosticNoteKo: buildDiagnosticNoteKo(cutCount, averageDialogueCharsPerCut, bg3dCutPercent, silentActionCutPercent),
    sourceMetricsSummaryKo, cuts: Object.freeze(cuts),
  });
}

/** 워크벤치 입력 요약과 실측 원고 텔레메트리를 결합한다(빈 문서 0컷이면 기존 요약을 유지한다). */
export function buildFreshIdeasEpisodeSourceContentKo(params: {
  readonly sourceSummaryKo: string;
  readonly sourceMetricsSummaryKo?: string;
  readonly telemetry: FreshIdeasEpisodeTelemetrySnapshot;
}): string {
  return [
    params.sourceSummaryKo.trim(),
    params.sourceMetricsSummaryKo?.trim() ?? "",
    params.telemetry.isEmptyDocument ? "" : params.telemetry.sourceMetricsSummaryKo,
  ].filter(Boolean).join("\n");
}
