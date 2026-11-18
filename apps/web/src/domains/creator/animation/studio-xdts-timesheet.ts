/**
 * Studio XDTS Timesheet — 공개 Toei Animation / CELSYS / OpenToonz 디지털 타임시트(`XDTS` v5)
 * 상호운용 파서·직렬화기 및 트랙 일괄 셀 지정(`batchAssignTrackCels`)·번호 정규화(`normalizeCelsByTimelineOrder`).
 *
 * 공개 포맷 사양:
 * - 첫 줄 헤더: `"exchangeDigitalTimeSheet Save Data"`
 * - JSON 본문: `version: 5`, `header?: { cut, scene }`, `timeTables` 배열
 * - `fieldId`: `0` = cell(셀/원동화), `3` = dialog(대사/사운드), `5` = camera(카메라워크)
 * - 특수 심볼: `"SYMBOL_NULL_CELL"`(빈 셀), `"SYMBOL_HYPHEN"`(노출 홀드 연장),
 *   `"SYMBOL_TICK_1"` / `"SYMBOL_TICK_2"`(동화 중할 참고 마크 ○/●)
 *
 * REA 근거(clean-room math & public spec):
 * - ev_ddb41ced2767b5780b22fb835ba93870d61c17a55583bf40f277aef4d9b6ef68
 * - ev_84e24ea66b2393d0fa57182b4de9dbe3be9c25ee54f982c2dcfc534bf63eddda
 * - ev_853855365e8ebbed8b4f1694c57c2f224a338610827337312b0d42739c4eb4bc
 */
import {
  MAX_TRACK_KEYFRAMES,
  normalizeAnimationTimelineDoc,
  type AnimationTimelineDoc,
  type StudioAnimKeyframe,
} from "../studio-anim-tracks";

import type { StudioAnimFrame } from "../studio-frame-animation";

export const XDTS_MAGIC_HEADER = "exchangeDigitalTimeSheet Save Data";
export const XDTS_SUPPORTED_VERSION = 5;

export const XDTS_FIELD_IDS = Object.freeze({
  cell: 0,
  dialog: 3,
  camera: 5,
} as const);

export type XdtsFieldId = 0 | 3 | 5;
export type XdtsFieldKind = "cell" | "dialog" | "camera";

export const XDTS_SYMBOLS = Object.freeze({
  nullCell: "SYMBOL_NULL_CELL",
  hyphen: "SYMBOL_HYPHEN",
  tick1: "SYMBOL_TICK_1",
  tick2: "SYMBOL_TICK_2",
} as const);

export type XdtsSpecialSymbol =
  | "SYMBOL_NULL_CELL"
  | "SYMBOL_HYPHEN"
  | "SYMBOL_TICK_1"
  | "SYMBOL_TICK_2";

export interface XdtsHeaderInfo {
  readonly cut?: string;
  readonly scene?: string;
}

export interface XdtsFrameDataItem {
  readonly id: number;
  readonly values: readonly string[];
}

export interface XdtsTrackFrameEntry {
  readonly frame: number;
  readonly data: readonly XdtsFrameDataItem[];
}

export interface XdtsTrack {
  readonly trackNo: number;
  readonly frames: readonly XdtsTrackFrameEntry[];
}

export interface XdtsField {
  readonly fieldId: XdtsFieldId;
  readonly tracks: readonly XdtsTrack[];
}

export interface XdtsTimeTableHeader {
  readonly fieldId: XdtsFieldId;
  readonly names: readonly string[];
}

export interface XdtsResolvedExposureSpan {
  readonly trackNo: number;
  readonly trackName: string;
  readonly celLabel: string;
  readonly startFrame: number; // 0-based inclusive
  readonly endFrame: number; // 0-based inclusive
  readonly durationFrames: number;
  readonly inbetweenTicks: readonly {
    readonly frame: number;
    readonly symbol: "SYMBOL_TICK_1" | "SYMBOL_TICK_2";
  }[];
}

export interface XdtsTimeTable {
  readonly name: string;
  readonly duration: number;
  readonly timeTableHeaders: readonly XdtsTimeTableHeader[];
  readonly fields: readonly XdtsField[];
  /** cell(fieldId=0) 트랙에서 해석된 연속 노출(홀드·중할 마크 포함) 구간 목록. */
  readonly resolvedCellExposures: readonly XdtsResolvedExposureSpan[];
}

export interface StudioXdtsDocument {
  readonly version: 5;
  readonly header?: XdtsHeaderInfo;
  readonly timeTables: readonly XdtsTimeTable[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function xdtsFieldIdToKind(fieldId: XdtsFieldId): XdtsFieldKind {
  if (fieldId === 0) return "cell";
  if (fieldId === 3) return "dialog";
  return "camera";
}

export function xdtsFieldKindToId(kind: XdtsFieldKind): XdtsFieldId {
  if (kind === "cell") return 0;
  if (kind === "dialog") return 3;
  return 5;
}

function isSupportedFieldId(value: unknown): value is XdtsFieldId {
  return value === 0 || value === 3 || value === 5;
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.round(Math.min(max, Math.max(min, value)));
}

/** cell 트랙 프레임 이벤트를 순회하여 홀드(`SYMBOL_HYPHEN`), 빈 셀(`SYMBOL_NULL_CELL`), 중할 틱을 해석한다. */
export function resolveXdtsCellExposures(
  track: XdtsTrack,
  trackName: string,
  duration: number,
): XdtsResolvedExposureSpan[] {
  const safeDuration = Math.max(1, Math.floor(duration));
  const sorted = [...track.frames]
    .filter((entry) => entry.frame >= 0 && entry.frame < safeDuration)
    .sort((a, b) => a.frame - b.frame);

  const eventByFrame = new Map<number, string>();
  for (const entry of sorted) {
    const firstVal = entry.data[0]?.values[0];
    if (typeof firstVal === "string" && firstVal.trim().length > 0) {
      eventByFrame.set(entry.frame, firstVal.trim());
    }
  }

  const spans: XdtsResolvedExposureSpan[] = [];
  let activeLabel: string | null = null;
  let activeStart = 0;
  let activeTicks: { frame: number; symbol: "SYMBOL_TICK_1" | "SYMBOL_TICK_2" }[] = [];

  const flushSpan = (endInclusive: number) => {
    if (activeLabel !== null && endInclusive >= activeStart) {
      spans.push({
        trackNo: track.trackNo,
        trackName,
        celLabel: activeLabel,
        startFrame: activeStart,
        endFrame: endInclusive,
        durationFrames: endInclusive - activeStart + 1,
        inbetweenTicks: activeTicks,
      });
    }
    activeLabel = null;
    activeTicks = [];
  };

  for (let f = 0; f < safeDuration; f += 1) {
    const token = eventByFrame.get(f);
    if (token === undefined || token === XDTS_SYMBOLS.hyphen) {
      continue;
    }
    if (token === XDTS_SYMBOLS.tick1 || token === XDTS_SYMBOLS.tick2) {
      if (activeLabel !== null) {
        activeTicks.push({ frame: f, symbol: token });
      }
      continue;
    }
    if (token === XDTS_SYMBOLS.nullCell) {
      flushSpan(f - 1);
      continue;
    }
    flushSpan(f - 1);
    activeLabel = token;
    activeStart = f;
    activeTicks = [];
  }
  flushSpan(safeDuration - 1);
  return spans;
}

function parseTrack(raw: unknown): XdtsTrack {
  if (!isRecord(raw)) throw new Error("XDTS 트랙 항목이 객체 형식이 아닙니다.");
  const trackNo = Number(raw.trackNo);
  if (!Number.isInteger(trackNo) || trackNo < 0) {
    throw new Error("XDTS trackNo는 0 이상의 정수여야 합니다.");
  }
  const rawFrames = Array.isArray(raw.frames) ? raw.frames : [];
  const frames: XdtsTrackFrameEntry[] = rawFrames.map((fRaw) => {
    if (!isRecord(fRaw)) throw new Error("XDTS 프레임 항목이 올바르지 않습니다.");
    const frame = Number(fRaw.frame);
    if (!Number.isInteger(frame) || frame < 0) {
      throw new Error("XDTS frame 번호는 0 이상의 정수여야 합니다.");
    }
    const rawData = Array.isArray(fRaw.data) ? fRaw.data : [];
    const data: XdtsFrameDataItem[] = rawData.map((dRaw) => {
      if (!isRecord(dRaw)) throw new Error("XDTS 프레임 data 항목이 올바르지 않습니다.");
      const id = Number.isInteger(Number(dRaw.id)) ? Number(dRaw.id) : 0;
      const values = Array.isArray(dRaw.values)
        ? dRaw.values.map((v) => String(v))
        : [];
      return { id, values };
    });
    return { frame, data };
  });
  frames.sort((a, b) => a.frame - b.frame);
  return { trackNo, frames };
}

/**
 * XDTS 텍스트(`"exchangeDigitalTimeSheet Save Data\n{...}"`)를 파싱하여 정규화된 문서로 변환한다.
 */
export function parseXdtsTimesheet(rawText: string): StudioXdtsDocument {
  const normalized = rawText.replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n").trim();
  const newlineIdx = normalized.indexOf("\n");
  if (newlineIdx < 0) {
    throw new Error("XDTS 파일 헤더와 JSON 본문이 구분되어 있지 않습니다.");
  }
  const firstLine = normalized.slice(0, newlineIdx).trim();
  if (firstLine !== XDTS_MAGIC_HEADER) {
    throw new Error(`지원하지 않는 XDTS 헤더입니다: "${firstLine}"`);
  }
  const jsonBody = normalized.slice(newlineIdx + 1).trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonBody) as unknown;
  } catch {
    throw new Error("XDTS JSON 본문을 구문 분석할 수 없습니다.");
  }
  if (!isRecord(parsed)) {
    throw new Error("XDTS 루트 구조가 객체가 아닙니다.");
  }
  if (parsed.version !== XDTS_SUPPORTED_VERSION) {
    throw new Error(`지원하지 않는 XDTS 버전입니다(필수: ${XDTS_SUPPORTED_VERSION}, 입력: ${String(parsed.version)}).`);
  }
  if (!Array.isArray(parsed.timeTables) || parsed.timeTables.length === 0) {
    throw new Error("XDTS 문서에 최소 1개의 timeTable이 필요합니다.");
  }

  let header: XdtsHeaderInfo | undefined;
  if (isRecord(parsed.header)) {
    const cut = typeof parsed.header.cut === "string" ? parsed.header.cut : undefined;
    const scene = typeof parsed.header.scene === "string" ? parsed.header.scene : undefined;
    if (cut !== undefined || scene !== undefined) {
      header = { ...(cut !== undefined ? { cut } : {}), ...(scene !== undefined ? { scene } : {}) };
    }
  }

  const timeTables: XdtsTimeTable[] = parsed.timeTables.map((ttRaw, index) => {
    if (!isRecord(ttRaw)) throw new Error(`XDTS timeTables[${index}] 형식이 올바르지 않습니다.`);
    const duration = Number(ttRaw.duration);
    if (!Number.isInteger(duration) || duration <= 0) {
      throw new Error(`XDTS timeTables[${index}].duration은 양의 정수여야 합니다.`);
    }
    const name = typeof ttRaw.name === "string" && ttRaw.name.trim() ? ttRaw.name.trim() : `타임시트 ${index + 1}`;

    const rawHeaders = Array.isArray(ttRaw.timeTableHeaders) ? ttRaw.timeTableHeaders : [];
    const timeTableHeaders: XdtsTimeTableHeader[] = [];
    for (const hRaw of rawHeaders) {
      if (!isRecord(hRaw) || !isSupportedFieldId(hRaw.fieldId)) continue;
      const names = Array.isArray(hRaw.names) ? hRaw.names.map((n) => String(n)) : [];
      timeTableHeaders.push({ fieldId: hRaw.fieldId, names });
    }

    const rawFields = Array.isArray(ttRaw.fields) ? ttRaw.fields : [];
    const fields: XdtsField[] = [];
    for (const fieldRaw of rawFields) {
      if (!isRecord(fieldRaw) || !isSupportedFieldId(fieldRaw.fieldId)) continue;
      const rawTracks = Array.isArray(fieldRaw.tracks) ? fieldRaw.tracks : [];
      const tracks = rawTracks.map(parseTrack).sort((a, b) => a.trackNo - b.trackNo);
      fields.push({ fieldId: fieldRaw.fieldId, tracks });
    }
    fields.sort((a, b) => a.fieldId - b.fieldId);

    const cellHeaderNames = timeTableHeaders.find((h) => h.fieldId === 0)?.names ?? [];
    const cellField = fields.find((f) => f.fieldId === 0);
    const resolvedCellExposures = cellField
      ? cellField.tracks.flatMap((track) => {
          const trackName = cellHeaderNames[track.trackNo] ?? `트랙 ${track.trackNo + 1}`;
          return resolveXdtsCellExposures(track, trackName, duration);
        })
      : [];

    return { name, duration, timeTableHeaders, fields, resolvedCellExposures };
  });

  return {
    version: XDTS_SUPPORTED_VERSION,
    ...(header ? { header } : {}),
    timeTables,
  };
}

/**
 * `StudioXdtsDocument`를 표준 XDTS v5 텍스트 포맷으로 직렬화한다.
 */
export function serializeXdtsTimesheet(doc: StudioXdtsDocument): string {
  const payload = {
    ...(doc.header ? { header: { ...doc.header } } : {}),
    timeTables: doc.timeTables.map((tt) => ({
      duration: Math.max(1, Math.floor(tt.duration)),
      fields: [...tt.fields]
        .sort((a, b) => a.fieldId - b.fieldId)
        .map((field) => ({
          fieldId: field.fieldId,
          tracks: [...field.tracks]
            .sort((a, b) => a.trackNo - b.trackNo)
            .map((track) => ({
              frames: [...track.frames]
                .sort((a, b) => a.frame - b.frame)
                .map((entry) => ({
                  data: entry.data.map((d) => ({ id: d.id, values: [...d.values] })),
                  frame: entry.frame,
                })),
              trackNo: track.trackNo,
            })),
        })),
      name: tt.name,
      timeTableHeaders: [...tt.timeTableHeaders]
        .sort((a, b) => a.fieldId - b.fieldId)
        .map((h) => ({
          fieldId: h.fieldId,
          names: [...h.names],
        })),
    })),
    version: XDTS_SUPPORTED_VERSION,
  };
  return `${XDTS_MAGIC_HEADER}\n${JSON.stringify(payload, null, 2)}\n`;
}

/** Studio `AnimationTimelineDoc`을 XDTS v5 문서로 변환한다. */
export function animationTimelineDocToXdts(
  doc: AnimationTimelineDoc,
  options?: { readonly name?: string; readonly header?: XdtsHeaderInfo; readonly trackLabels?: Readonly<Record<string, string>> },
): StudioXdtsDocument {
  const trackIds = Object.keys(doc.tracks);
  const names = trackIds.map((id) => options?.trackLabels?.[id] ?? id);
  const tracks: XdtsTrack[] = trackIds.map((trackId, trackNo) => {
    const kfs = [...(doc.tracks[trackId] ?? [])].sort((a, b) => a.frameIndex - b.frameIndex);
    const frames: XdtsTrackFrameEntry[] = [];
    for (let i = 0; i < kfs.length; i += 1) {
      const kf = kfs[i]!;
      frames.push({ frame: kf.frameIndex, data: [{ id: 0, values: [kf.frame.id] }] });
      const nextFrame = i + 1 < kfs.length ? kfs[i + 1]!.frameIndex : doc.frameCount;
      for (let hold = kf.frameIndex + 1; hold < nextFrame; hold += 1) {
        frames.push({ frame: hold, data: [{ id: 0, values: [XDTS_SYMBOLS.hyphen] }] });
      }
    }
    return { trackNo, frames };
  });

  const fields: XdtsField[] = [{ fieldId: 0, tracks }];
  const timeTableHeaders: XdtsTimeTableHeader[] = [{ fieldId: 0, names }];
  const resolvedCellExposures = tracks.flatMap((track) =>
    resolveXdtsCellExposures(track, names[track.trackNo] ?? `트랙 ${track.trackNo + 1}`, doc.frameCount),
  );

  return {
    version: XDTS_SUPPORTED_VERSION,
    ...(options?.header ? { header: options.header } : {}),
    timeTables: [
      {
        name: options?.name ?? "타임라인 1",
        duration: Math.max(1, doc.frameCount),
        timeTableHeaders,
        fields,
        resolvedCellExposures,
      },
    ],
  };
}

export interface BatchAssignTrackCelsOptions {
  readonly trackId: string;
  readonly cels: readonly StudioAnimFrame[];
  readonly startFrame?: number;
  readonly endFrame?: number;
  /** 각 셀당 노출 프레임 수 (1=1코마, 2=2코마, 3=3코마…). 기본 2. */
  readonly holdFrames?: number;
  /** 구간 끝까지 셀 목록을 반복 배치할지 여부. 기본 false. */
  readonly loopToEnd?: boolean;
  /** 반복 횟수 지정 (1 이상, loopToEnd가 false일 때 유효). */
  readonly repeatCount?: number;
}

/**
 * CSP `셀 일괄 지정(Specify cels at once)` — 지정 트랙 구간에 셀 배열을 등간격 홀드(1k/2k/3k)와
 * 반복 옵션으로 일괄 배치한다.
 */
export function batchAssignTrackCels(
  doc: AnimationTimelineDoc,
  options: BatchAssignTrackCelsOptions,
): AnimationTimelineDoc {
  if (!options.trackId.trim() || options.cels.length === 0 || doc.frameCount <= 0) {
    return doc;
  }
  const start = clampInt(options.startFrame ?? 0, 0, doc.frameCount - 1);
  const end = clampInt(options.endFrame ?? doc.frameCount - 1, start, doc.frameCount - 1);
  const hold = clampInt(options.holdFrames ?? 2, 1, doc.frameCount);
  const repeatCount = clampInt(options.repeatCount ?? 1, 1, MAX_TRACK_KEYFRAMES);

  const existing = (doc.tracks[options.trackId] ?? []).filter(
    (kf) => kf.frameIndex < start || kf.frameIndex > end,
  );
  const generated: StudioAnimKeyframe[] = [];
  const totalRequested = options.loopToEnd
    ? Math.ceil((end - start + 1) / hold)
    : options.cels.length * repeatCount;

  for (let step = 0; step < totalRequested; step += 1) {
    const frameIndex = start + step * hold;
    if (frameIndex > end) break;
    if (existing.length + generated.length >= MAX_TRACK_KEYFRAMES) break;
    const cel = options.cels[step % options.cels.length]!;
    generated.push({ frameIndex, frame: { ...cel } });
  }

  if (generated.length === 0) return doc;
  const merged = [...existing, ...generated].sort((a, b) => a.frameIndex - b.frameIndex);
  return normalizeAnimationTimelineDoc({
    ...doc,
    tracks: { ...doc.tracks, [options.trackId]: merged },
  });
}

export interface NormalizeCelsResult {
  readonly doc: AnimationTimelineDoc;
  readonly renamedMap: ReadonlyMap<string, string>;
}

/**
 * CSP `타임라인 순서로 번호 정규화(Normalize in timeline order)` — 트랙 내 키프레임 셀 ID를
 * 첫 등장 순서대로 `1, 2, 3...` (또는 접두사 포함 `A1, A2...`)으로 일관되게 재명명한다.
 * 동일 셀을 여러 번 재사용(반복 노출)한 경우 동일한 새 번호를 유지한다.
 */
export function normalizeCelsByTimelineOrder(
  doc: AnimationTimelineDoc,
  trackId: string,
  options?: { readonly prefix?: string },
): NormalizeCelsResult {
  const track = doc.tracks[trackId];
  if (!track || track.length === 0) {
    return { doc, renamedMap: new Map() };
  }
  const prefix = options?.prefix ?? "";
  const sorted = [...track].sort((a, b) => a.frameIndex - b.frameIndex);
  const renamedMap = new Map<string, string>();
  let nextNumber = 1;

  for (const kf of sorted) {
    if (!renamedMap.has(kf.frame.id)) {
      renamedMap.set(kf.frame.id, `${prefix}${nextNumber}`);
      nextNumber += 1;
    }
  }

  let changed = false;
  const nextTrack = sorted.map((kf) => {
    const nextId = renamedMap.get(kf.frame.id) ?? kf.frame.id;
    if (nextId === kf.frame.id) return kf;
    changed = true;
    return {
      ...kf,
      frame: { ...kf.frame, id: nextId },
    };
  });

  if (!changed) {
    return { doc, renamedMap };
  }
  return {
    doc: { ...doc, tracks: { ...doc.tracks, [trackId]: nextTrack } },
    renamedMap,
  };
}
