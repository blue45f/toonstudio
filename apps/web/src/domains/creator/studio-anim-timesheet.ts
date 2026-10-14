/**
 * Studio Animation Timesheet (타임시트/노출표) — 다중 레이어 타임라인 문서
 * (studio-anim-tracks의 AnimationTimelineDoc)를 인쇄·공유용 노출표로 도출하는 순수 모듈.
 *
 * 배경: IR에는 exposure(노출) 개념과 이름 있는 클립 구간(StudioAnimClipRange)이 이미
 * 있었지만, 클립 배치를 "트랙 × 구간" 표로 펼쳐 보여주는 도출 표면이 없었다(REPORT §7).
 * 이 모듈이 그 단일 도출 지점이다 — 패널의 시트 보기, 텍스트/SVG/인쇄(HTML) 내보내기가
 * 전부 같은 derive 결과를 쓰므로 화면·인쇄물·공유 파일이 서로 어긋날 수 없다.
 *
 * 도출 규칙 (패널 그리드·재생과 동일 의미론):
 * - 트랙의 키프레임 셀은 다음 키프레임 직전까지 유지된다(held-until-next —
 *   studio-anim-tracks의 resolveTrackFrameAt와 동일). 첫 키프레임보다 앞 구간은 빈칸.
 * - 구간은 0-based inclusive [startFrame, endFrame]로 기록하고, 표기할 때만 1-based로 바꾼다.
 * - 이름 있는 클립은 타임라인 위의 구간 행으로 함께 도출하고, 셀 구간과 겹치는 클립
 *   이름을 각 구간에 표시한다.
 * - scope: "all"=전체 타임라인, "active-clip"=활성 클립 구간만(활성 클립이 없으면 전체로 폴백).
 *
 * Konva/DOM/React 무의존. 렌더러들은 문자열만 만들며, 다운로드/인쇄 창 열기 같은
 * 브라우저 부수효과는 호출자(패널) 몫이다.
 */
import {
  resolveActiveClipExposure,
  type AnimationTimelineDoc,
  type StudioAnimClipRange,
  type StudioAnimEase,
} from "./studio-anim-tracks";

// ── 도출 결과 모델 ────────────────────────────────────────────────────

/** 노출표의 셀 구간 하나 — 키프레임 1장이 실제로 화면에 노출되는 프레임 범위. */
export interface StudioAnimTimesheetSegment {
  trackId: string;
  /** 키프레임의 frame.id (셀 식별자). */
  celId: string;
  /** 트랙 안에서 몇 번째 셀인지 (1부터, 전체 타임라인 기준 — 구간을 잘라도 번호는 유지). */
  celIndex: number;
  startFrame: number; // 0-based inclusive
  endFrame: number; // 0-based inclusive
  durationFrames: number;
  startSeconds: number;
  durationSeconds: number;
  ease: StudioAnimEase | null;
  /** 이 구간과 겹치는 이름 있는 클립 이름들 (시작 프레임 순). */
  clipNames: readonly string[];
}

export interface StudioAnimTimesheetTrackRow {
  trackId: string;
  label: string;
  segments: readonly StudioAnimTimesheetSegment[];
  /** 구간이 덮는 프레임 수 합계 (빈칸 제외). */
  exposedFrames: number;
}

export interface StudioAnimTimesheetClipRow {
  clipId: string;
  name: string;
  startFrame: number; // 0-based inclusive
  endFrame: number; // 0-based inclusive
  durationFrames: number;
  startSeconds: number;
  durationSeconds: number;
  isActive: boolean;
}

export interface StudioAnimTimesheet {
  fps: number;
  frameCount: number;
  totalSeconds: number;
  /** 실제로 도출된 범위(scope 적용 후, 0-based inclusive). */
  windowStartFrame: number;
  windowEndFrame: number;
  windowSeconds: number;
  scope: "all" | "active-clip";
  /** scope가 "active-clip"일 때 그 클립 이름. 전체 범위면 null. */
  activeClipName: string | null;
  tracks: readonly StudioAnimTimesheetTrackRow[];
  clips: readonly StudioAnimTimesheetClipRow[];
  /** 전 트랙 셀 구간 수 합계. */
  totalSegments: number;
}

export interface StudioAnimTimesheetTrackInput {
  id: string;
  label: string;
}

export interface DeriveStudioAnimTimesheetOptions {
  /** 표시 순서·라벨(패널 rows). 없으면 doc.tracks 키 순서를 쓰고 라벨은 trackId. */
  tracks?: readonly StudioAnimTimesheetTrackInput[];
  scope?: "all" | "active-clip";
}

// ── 도출 ──────────────────────────────────────────────────────────────

function roundSeconds(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function sortedClips(doc: AnimationTimelineDoc): StudioAnimClipRange[] {
  return [...(doc.clips ?? [])].sort(
    (a, b) => a.startFrame - b.startFrame || a.endFrame - b.endFrame || a.name.localeCompare(b.name),
  );
}

function overlappingClipNames(
  clips: readonly StudioAnimClipRange[],
  startFrame: number,
  endFrame: number,
): string[] {
  return clips
    .filter((clip) => clip.startFrame <= endFrame && startFrame <= clip.endFrame)
    .map((clip) => clip.name);
}

/**
 * 타임라인 문서를 노출표로 도출한다. 순수 — 같은 문서는 항상 같은 표를 만든다.
 * 구간의 시작·끝은 resolveTrackFrameAt의 held-until-next 해석과 프레임 단위로 일치한다.
 */
export function deriveStudioAnimTimesheet(
  doc: AnimationTimelineDoc,
  options: DeriveStudioAnimTimesheetOptions = {},
): StudioAnimTimesheet {
  const fps = doc.fps;
  const frameCount = Math.max(1, doc.frameCount);
  const exposure = resolveActiveClipExposure(doc);
  const wantsClipScope = options.scope === "active-clip" && exposure.clip !== null;
  const windowStartFrame = wantsClipScope ? exposure.startFrame : 0;
  const windowEndFrame = wantsClipScope ? exposure.endFrame : frameCount - 1;
  const clips = sortedClips(doc);

  const inputs: StudioAnimTimesheetTrackInput[] = options.tracks
    ? [...options.tracks]
    : Object.keys(doc.tracks).map((id) => ({ id, label: id }));
  const seen = new Set<string>();
  for (const input of inputs) seen.add(input.id);
  for (const trackId of Object.keys(doc.tracks)) {
    if (!seen.has(trackId)) inputs.push({ id: trackId, label: trackId });
  }

  const trackRows: StudioAnimTimesheetTrackRow[] = inputs.map((input) => {
    const keyframes = [...(doc.tracks[input.id] ?? [])].sort((a, b) => a.frameIndex - b.frameIndex);
    const segments: StudioAnimTimesheetSegment[] = [];
    keyframes.forEach((keyframe, index) => {
      const rawStart = keyframe.frameIndex;
      const rawEnd = index + 1 < keyframes.length
        ? keyframes[index + 1]!.frameIndex - 1
        : frameCount - 1;
      const startFrame = Math.max(rawStart, windowStartFrame);
      const endFrame = Math.min(rawEnd, windowEndFrame);
      if (startFrame > endFrame) return;
      segments.push({
        trackId: input.id,
        celId: keyframe.frame.id,
        celIndex: index + 1,
        startFrame,
        endFrame,
        durationFrames: endFrame - startFrame + 1,
        startSeconds: roundSeconds(startFrame / fps),
        durationSeconds: roundSeconds((endFrame - startFrame + 1) / fps),
        ease: keyframe.ease ?? null,
        clipNames: overlappingClipNames(clips, rawStart, rawEnd),
      });
    });
    return {
      trackId: input.id,
      label: input.label,
      segments,
      exposedFrames: segments.reduce((sum, segment) => sum + segment.durationFrames, 0),
    };
  });

  const clipRows: StudioAnimTimesheetClipRow[] = clips.map((clip) => ({
    clipId: clip.id,
    name: clip.name,
    startFrame: clip.startFrame,
    endFrame: clip.endFrame,
    durationFrames: clip.endFrame - clip.startFrame + 1,
    startSeconds: roundSeconds(clip.startFrame / fps),
    durationSeconds: roundSeconds((clip.endFrame - clip.startFrame + 1) / fps),
    isActive: doc.activeClipId === clip.id,
  }));

  return {
    fps,
    frameCount,
    totalSeconds: roundSeconds(frameCount / fps),
    windowStartFrame,
    windowEndFrame,
    windowSeconds: roundSeconds((windowEndFrame - windowStartFrame + 1) / fps),
    scope: wantsClipScope ? "active-clip" : "all",
    activeClipName: wantsClipScope ? exposure.clip!.name : null,
    tracks: trackRows,
    clips: clipRows,
    totalSegments: trackRows.reduce((sum, row) => sum + row.segments.length, 0),
  };
}

// ── 표기 헬퍼 ─────────────────────────────────────────────────────────

/** 0-based inclusive 구간을 사람이 읽는 1-based 표기로: "1–6f". */
export function formatTimesheetFrameRange(startFrame: number, endFrame: number): string {
  return `${startFrame + 1}–${endFrame + 1}f`;
}

export function formatTimesheetSeconds(value: number): string {
  return `${value.toFixed(2)}초`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");
}

function escapeXml(value: string): string {
  return escapeHtml(value).replace(/'/gu, "&apos;");
}

function scopeLabel(sheet: StudioAnimTimesheet): string {
  return sheet.scope === "active-clip" && sheet.activeClipName
    ? `활성 클립 "${sheet.activeClipName}" 구간 ${formatTimesheetFrameRange(sheet.windowStartFrame, sheet.windowEndFrame)}`
    : `전체 타임라인 ${formatTimesheetFrameRange(sheet.windowStartFrame, sheet.windowEndFrame)}`;
}

function sheetHeadline(sheet: StudioAnimTimesheet): string {
  return `타임시트(노출표) — 전체 ${sheet.frameCount}프레임 · ${sheet.fps}fps · ${formatTimesheetSeconds(sheet.totalSeconds)}`;
}

// ── 텍스트 렌더러 (복사·공유·.txt 저장) ───────────────────────────────

export function renderStudioAnimTimesheetText(sheet: StudioAnimTimesheet): string {
  const lines: string[] = [sheetHeadline(sheet), `범위: ${scopeLabel(sheet)}`, ""];
  if (sheet.totalSegments === 0) {
    lines.push("아직 키프레임이 없어 도출할 셀이 없어요.");
  }
  for (const row of sheet.tracks) {
    if (row.segments.length === 0) continue;
    lines.push(`[트랙] ${row.label}`);
    for (const segment of row.segments) {
      const parts = [
        `셀 ${segment.celIndex}`,
        formatTimesheetFrameRange(segment.startFrame, segment.endFrame),
        `${segment.durationFrames}프레임`,
        `${formatTimesheetSeconds(segment.startSeconds)}부터 ${formatTimesheetSeconds(segment.durationSeconds)}`,
      ];
      if (segment.ease) parts.push(`이징 ${segment.ease}`);
      if (segment.clipNames.length > 0) parts.push(`클립 ${segment.clipNames.join(", ")}`);
      lines.push(parts.join(" | "));
    }
    lines.push("");
  }
  if (sheet.clips.length > 0) {
    lines.push("[클립 구간]");
    for (const clip of sheet.clips) {
      const parts = [
        clip.name,
        formatTimesheetFrameRange(clip.startFrame, clip.endFrame),
        `${clip.durationFrames}프레임`,
        `${formatTimesheetSeconds(clip.startSeconds)}부터 ${formatTimesheetSeconds(clip.durationSeconds)}`,
      ];
      if (clip.isActive) parts.push("활성");
      lines.push(parts.join(" | "));
    }
  }
  return lines.join("\n").trimEnd() + "\n";
}

// ── 인쇄용 HTML 렌더러 (브라우저 인쇄 → PDF 저장 경로) ────────────────

export function renderStudioAnimTimesheetPrintHtml(sheet: StudioAnimTimesheet): string {
  const segmentRows = sheet.tracks.flatMap((row) =>
    row.segments.map(
      (segment) =>
        `<tr><td>${escapeHtml(row.label)}</td><td>셀 ${segment.celIndex}</td>` +
        `<td>${formatTimesheetFrameRange(segment.startFrame, segment.endFrame)}</td>` +
        `<td>${segment.durationFrames}</td>` +
        `<td>${formatTimesheetSeconds(segment.startSeconds)}</td>` +
        `<td>${formatTimesheetSeconds(segment.durationSeconds)}</td>` +
        `<td>${segment.ease ? escapeHtml(segment.ease) : "—"}</td>` +
        `<td>${segment.clipNames.length > 0 ? escapeHtml(segment.clipNames.join(", ")) : "—"}</td></tr>`,
    ),
  );
  const clipRows = sheet.clips.map(
    (clip) =>
      `<tr><td>${escapeHtml(clip.name)}${clip.isActive ? " (활성)" : ""}</td>` +
      `<td>${formatTimesheetFrameRange(clip.startFrame, clip.endFrame)}</td>` +
      `<td>${clip.durationFrames}</td>` +
      `<td>${formatTimesheetSeconds(clip.startSeconds)}</td>` +
      `<td>${formatTimesheetSeconds(clip.durationSeconds)}</td></tr>`,
  );
  const body = [
    `<h1>${escapeHtml(sheetHeadline(sheet))}</h1>`,
    `<p>범위: ${escapeHtml(scopeLabel(sheet))}</p>`,
    segmentRows.length > 0
      ? `<table><thead><tr><th>트랙</th><th>셀</th><th>구간</th><th>길이(프레임)</th><th>시작(초)</th><th>길이(초)</th><th>이징</th><th>겹치는 클립</th></tr></thead><tbody>${segmentRows.join("")}</tbody></table>`
      : `<p>아직 키프레임이 없어 도출할 셀이 없어요.</p>`,
    clipRows.length > 0
      ? `<h2>클립 구간</h2><table><thead><tr><th>클립</th><th>구간</th><th>길이(프레임)</th><th>시작(초)</th><th>길이(초)</th></tr></thead><tbody>${clipRows.join("")}</tbody></table>`
      : "",
  ].join("\n");
  return [
    "<!doctype html>",
    '<html lang="ko">',
    "<head>",
    '<meta charset="utf-8" />',
    "<title>타임시트(노출표)</title>",
    "<style>",
    "@page { margin: 12mm; }",
    "body { font-family: sans-serif; color: #111; font-size: 12px; }",
    "h1 { font-size: 16px; margin: 0 0 4px; }",
    "h2 { font-size: 13px; margin: 16px 0 4px; }",
    "table { border-collapse: collapse; width: 100%; margin-top: 8px; }",
    "th, td { border: 1px solid #999; padding: 4px 6px; text-align: left; }",
    "th { background: #eee; }",
    "</style>",
    "</head>",
    "<body>",
    body,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

// ── SVG 이미지 렌더러 (프레임 그리드형 노출표 — .svg 저장) ────────────

const SVG_LABEL_W = 150;
const SVG_FRAME_W = 20;
const SVG_ROW_H = 26;
const SVG_HEADER_H = 64;
const SVG_CLIP_BAND_H = 20;

export function renderStudioAnimTimesheetSvg(sheet: StudioAnimTimesheet): string {
  const frameSpan = sheet.windowEndFrame - sheet.windowStartFrame + 1;
  const width = SVG_LABEL_W + frameSpan * SVG_FRAME_W + 8;
  const clipBand = sheet.clips.length > 0 ? SVG_CLIP_BAND_H : 0;
  const height = SVG_HEADER_H + clipBand + Math.max(1, sheet.tracks.length) * SVG_ROW_H + 8;
  const x = (frame: number): number => SVG_LABEL_W + (frame - sheet.windowStartFrame) * SVG_FRAME_W;
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="타임시트(노출표)">`,
    `<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff" />`,
    `<text x="8" y="20" font-family="sans-serif" font-size="13" font-weight="bold" fill="#111111">${escapeXml(sheetHeadline(sheet))}</text>`,
    `<text x="8" y="38" font-family="sans-serif" font-size="10" fill="#555555">${escapeXml(`범위: ${scopeLabel(sheet)}`)}</text>`,
  ];
  // 프레임 눈금 (5프레임마다 + 양끝)
  for (let frame = sheet.windowStartFrame; frame <= sheet.windowEndFrame; frame += 1) {
    if (frame !== sheet.windowStartFrame && frame !== sheet.windowEndFrame && (frame + 1) % 5 !== 0) continue;
    parts.push(
      `<text x="${x(frame) + 2}" y="${SVG_HEADER_H - 6}" font-family="sans-serif" font-size="9" fill="#555555">${frame + 1}</text>`,
    );
  }
  // 클립 밴드
  if (sheet.clips.length > 0) {
    const bandY = SVG_HEADER_H;
    for (const clip of sheet.clips) {
      const start = Math.max(clip.startFrame, sheet.windowStartFrame);
      const end = Math.min(clip.endFrame, sheet.windowEndFrame);
      if (start > end) continue;
      parts.push(
        `<rect x="${x(start)}" y="${bandY + 2}" width="${(end - start + 1) * SVG_FRAME_W}" height="${SVG_CLIP_BAND_H - 4}" fill="${clip.isActive ? "#f59e0b" : "#d4d4d8"}" />`,
        `<text x="${x(start) + 3}" y="${bandY + SVG_CLIP_BAND_H - 6}" font-family="sans-serif" font-size="9" fill="#111111">${escapeXml(clip.name)}</text>`,
      );
    }
    parts.push(
      `<text x="8" y="${bandY + SVG_CLIP_BAND_H - 6}" font-family="sans-serif" font-size="9" fill="#555555">클립 구간</text>`,
    );
  }
  // 트랙 행
  sheet.tracks.forEach((row, rowIndex) => {
    const rowY = SVG_HEADER_H + clipBand + rowIndex * SVG_ROW_H;
    parts.push(
      `<text x="8" y="${rowY + SVG_ROW_H - 8}" font-family="sans-serif" font-size="10" fill="#111111">${escapeXml(row.label)}</text>`,
      `<rect x="${SVG_LABEL_W}" y="${rowY + 2}" width="${frameSpan * SVG_FRAME_W}" height="${SVG_ROW_H - 4}" fill="none" stroke="#cccccc" />`,
    );
    row.segments.forEach((segment, segmentIndex) => {
      parts.push(
        `<rect x="${x(segment.startFrame)}" y="${rowY + 2}" width="${segment.durationFrames * SVG_FRAME_W}" height="${SVG_ROW_H - 4}" fill="${segmentIndex % 2 === 0 ? "#93c5fd" : "#bfdbfe"}" stroke="#64748b" />`,
        `<text x="${x(segment.startFrame) + 3}" y="${rowY + SVG_ROW_H - 8}" font-family="sans-serif" font-size="9" fill="#111111">${segment.celIndex}</text>`,
      );
    });
  });
  if (sheet.totalSegments === 0) {
    parts.push(
      `<text x="8" y="${SVG_HEADER_H + clipBand + SVG_ROW_H - 8}" font-family="sans-serif" font-size="10" fill="#555555">아직 키프레임이 없어 도출할 셀이 없어요.</text>`,
    );
  }
  parts.push("</svg>", "");
  return parts.join("\n");
}
