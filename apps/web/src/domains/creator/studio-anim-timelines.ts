/**
 * Studio Anim Timelines — 이름 있는 다중 타임라인 + 셀 클립 노출 구간 모델 (순수 모듈).
 *
 * 배경: studio-frame-animation.ts는 요소 하나의 프레임 배열(최대 60장) + 프레임별
 * durationMs 단일 목록 모델이고, studio-anim-tracks.ts의 AnimationTimelineDoc은
 * 페이지 하나의 공유 타임라인(키프레임 트랙 + 이름 있는 클립 "구간 라벨")이다.
 * 둘 다 "서로 독립된 타임라인을 여러 개 만들어 이름으로 전환"하는 개념은 없다 —
 * 클립 구간 라벨은 같은 트랙 데이터를 공유하므로 A/B 연출 비교가 불가능하다.
 * 이 모듈이 그 빈틈을 메운다: 타임라인마다 fps·길이·트랙·셀 클립을 독립으로 들고,
 * 집합(AnimTimelineSet)이 활성 타임라인 하나를 가리킨다.
 *
 * 배선 계약:
 * - 마이그레이션: 기존 StudioAnimFrame[] + fps는 framesToTimelineSet()으로 1트랙
 *   타임라인으로 승격한다(durationsToClips 규칙 — durationMs를 fps 프레임 수로 환산).
 * - 역호환: timelineToFrames()로 활성 타임라인 첫 트랙을 기존 프레임 목록으로 되돌릴
 *   수 있어, 기존 내보내기·미리보기 표면은 그대로 동작한다.
 * - 저장/재열기: serializeTimelineSet() ↔ parseTimelineSet()/normalizeTimelineSet().
 *   저장값이 없거나 깨졌으면 resolveTimelineSet()이 레거시 프레임 목록으로 폴백한다.
 * - IR 정합: timelineToAnimationGraph()가 packages/studio-project-model의
 *   AnimationGraphIR와 구조적으로 동일한 그래프(levels/exposures)를 만들고,
 *   fromAnimationGraph()로 되돌릴 수 있다. 패키지 import 대신 구조 타입을 쓰는 것은
 *   studio-anim-tracks.ts가 El 타입을 import하지 않는 것과 같은 순환 회피 관례다.
 *
 * Konva/DOM/React 무의존. 모든 편집 함수는 불변이고, 무효 조작은 원본 참조를 그대로
 * 반환한다(studio-anim-tracks.ts의 no-op 관례와 동일).
 */
import {
  frameDurationMs,
  normalizeFrameFps,
} from "./studio-frame-animation-timing";
import type { StudioAnimFrame } from "./studio-frame-animation";

// ── 데이터 모델 ──────────────────────────────────────────────────────

export interface AnimCelRef {
  /** 셀이 가리키는 그림 소스. page = 원고 페이지, frame = 기존 frame-animation 프레임 id, asset = IR 셀/소재 */
  readonly kind: "page" | "frame" | "asset";
  readonly id: string;
  readonly label: string;
}

export interface AnimCelClip {
  readonly id: string;
  readonly cel: AnimCelRef;
  /** 타임라인 전역 프레임 기준 시작 (0-based) */
  readonly startFrame: number;
  /** 노출 길이 (프레임 수, 1 이상). 같은 셀을 늘이거나(hold) 반복 배치하는 단위 */
  readonly durationFrames: number;
}

export interface AnimTimelineTrack {
  readonly id: string;
  readonly name: string;
  readonly clips: readonly AnimCelClip[];
  readonly muted?: boolean;
}

export interface AnimTimeline {
  readonly id: string;
  readonly name: string;
  readonly fps: number;
  /** 타임라인 전체 길이 (프레임 수). 클립이 이 길이를 넘으면 검증 오류 */
  readonly lengthFrames: number;
  readonly tracks: readonly AnimTimelineTrack[];
}

export interface AnimTimelineSet {
  readonly timelines: readonly AnimTimeline[];
  readonly activeTimelineId: string;
}

export const ANIM_TIMELINE_LIMITS = {
  maxTimelines: 8,
  maxTracksPerTimeline: 16,
  maxClipsPerTrack: 512,
  minFps: 1,
  maxFps: 60,
  maxLengthFrames: 60 * 60 * 30, // 30분 @60fps 상한 (메모리 가드)
} as const;

/** 새 타임라인 기본 길이 — studio-anim-tracks의 DEFAULT_TIMELINE_FRAME_COUNT와 같은 24(12fps 기준 2초). */
export const DEFAULT_ANIM_TIMELINE_LENGTH_FRAMES = 24;
export const DEFAULT_ANIM_TIMELINE_NAME = "타임라인 1";
export const DEFAULT_ANIM_TRACK_NAME = "레이어 1";

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function normalizeTimelineName(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.replace(/\s+/gu, " ").trim().slice(0, 80);
  return trimmed || fallback;
}

/** 집합 안에서 겹치지 않는 이름. base가 비어 있으면 "타임라인", 겹치면 "이름 2", "이름 3"… */
export function uniqueTimelineName(set: AnimTimelineSet, base: string, excludeId?: string): string {
  const wanted = normalizeTimelineName(base, "타임라인");
  const taken = new Set(
    set.timelines.filter((t) => t.id !== excludeId).map((t) => t.name),
  );
  if (!taken.has(wanted)) return wanted;
  for (let suffix = 2; suffix <= ANIM_TIMELINE_LIMITS.maxTimelines + 1; suffix += 1) {
    const candidate = `${wanted} ${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  return wanted;
}

// ── 생성 ─────────────────────────────────────────────────────────────

export function createAnimTimeline(init: {
  id: string;
  name?: string;
  fps?: number;
  lengthFrames?: number;
  tracks?: readonly AnimTimelineTrack[];
  trackId?: string;
}): AnimTimeline {
  return {
    id: init.id,
    name: normalizeTimelineName(init.name, DEFAULT_ANIM_TIMELINE_NAME),
    fps: Math.round(clamp(init.fps ?? 12, ANIM_TIMELINE_LIMITS.minFps, ANIM_TIMELINE_LIMITS.maxFps)),
    lengthFrames: Math.round(
      clamp(init.lengthFrames ?? DEFAULT_ANIM_TIMELINE_LENGTH_FRAMES, 1, ANIM_TIMELINE_LIMITS.maxLengthFrames),
    ),
    tracks:
      init.tracks ??
      [{ id: init.trackId ?? `${init.id}-track-1`, name: DEFAULT_ANIM_TRACK_NAME, clips: [] }],
  };
}

/** 타임라인 1개(이름·빈 트랙 포함)로 시작하는 집합. 새 문서의 기본값. 순수. */
export function createTimelineSet(init: {
  timelineId: string;
  name?: string;
  fps?: number;
  lengthFrames?: number;
}): AnimTimelineSet {
  const timeline = createAnimTimeline({
    id: init.timelineId,
    name: init.name,
    fps: init.fps,
    lengthFrames: init.lengthFrames,
  });
  return { timelines: [timeline], activeTimelineId: timeline.id };
}

export function getActiveTimeline(set: AnimTimelineSet): AnimTimeline | null {
  return set.timelines.find((t) => t.id === set.activeTimelineId) ?? set.timelines[0] ?? null;
}

// ── 집합 편집 (순수 변환) ────────────────────────────────────────────

/**
 * 타임라인 추가. 상한(8개)·id 중복이면 원본 그대로 반환. 이름이 겹치면 자동으로
 * "이름 2"처럼 suffix를 붙여 validateTimelineSet의 duplicate-name을 만들지 않는다.
 * 추가된 타임라인이 새 활성이 된다(만들자마자 그 타임라인을 편집하는 동선). 순수.
 */
export function addTimeline(set: AnimTimelineSet, timeline: AnimTimeline): AnimTimelineSet {
  if (set.timelines.length >= ANIM_TIMELINE_LIMITS.maxTimelines) return set;
  if (set.timelines.some((t) => t.id === timeline.id)) return set;
  const named = { ...timeline, name: uniqueTimelineName(set, timeline.name) };
  return { timelines: [...set.timelines, named], activeTimelineId: named.id };
}

/** 마지막 1개는 삭제 거부(원본 반환). 활성을 지우면 바로 앞(없으면 뒤) 타임라인이 활성이 된다. 순수. */
export function removeTimeline(set: AnimTimelineSet, timelineId: string): AnimTimelineSet {
  if (set.timelines.length <= 1) return set;
  const index = set.timelines.findIndex((t) => t.id === timelineId);
  if (index === -1) return set;
  const timelines = set.timelines.filter((t) => t.id !== timelineId);
  const activeTimelineId =
    set.activeTimelineId === timelineId
      ? (timelines[Math.max(0, index - 1)] ?? timelines[0]!).id
      : set.activeTimelineId;
  return { timelines, activeTimelineId };
}

/** 이름 변경. 빈 이름·다른 타임라인과 겹치는 이름·무변경이면 원본 반환. 순수. */
export function renameTimeline(set: AnimTimelineSet, timelineId: string, name: string): AnimTimelineSet {
  const target = set.timelines.find((t) => t.id === timelineId);
  if (!target) return set;
  const nextName = normalizeTimelineName(name, target.name);
  if (nextName === target.name) return set;
  if (set.timelines.some((t) => t.id !== timelineId && t.name === nextName)) return set;
  return {
    ...set,
    timelines: set.timelines.map((t) => (t.id === timelineId ? { ...t, name: nextName } : t)),
  };
}

/**
 * 타임라인 복제(연출 A/B 비교의 시작점). 트랙·클립까지 깊은 복사이며 모든 id는
 * idFactory("timeline"|"track"|"clip")로 새로 발급받는다. 이름은 unique 규칙으로
 * "이름 2"가 된다. 상한 도달 시 원본 반환. 복제본이 새 활성이 된다. 순수.
 */
export function duplicateTimeline(
  set: AnimTimelineSet,
  timelineId: string,
  idFactory: (kind: "timeline" | "track" | "clip") => string,
): AnimTimelineSet {
  if (set.timelines.length >= ANIM_TIMELINE_LIMITS.maxTimelines) return set;
  const source = set.timelines.find((t) => t.id === timelineId);
  if (!source) return set;
  const copy: AnimTimeline = {
    ...source,
    id: idFactory("timeline"),
    name: uniqueTimelineName(set, source.name),
    tracks: source.tracks.map((track) => ({
      ...track,
      id: idFactory("track"),
      clips: track.clips.map((clip) => ({ ...clip, id: idFactory("clip") })),
    })),
  };
  return { timelines: [...set.timelines, copy], activeTimelineId: copy.id };
}

/** 활성 타임라인 전환. 없는 id거나 이미 활성이면 원본 반환. 순수. */
export function setActiveTimeline(set: AnimTimelineSet, timelineId: string): AnimTimelineSet {
  if (set.activeTimelineId === timelineId) return set;
  if (!set.timelines.some((t) => t.id === timelineId)) return set;
  return { ...set, activeTimelineId: timelineId };
}

/**
 * fps·길이 변경. 길이는 어떤 클립도 잘리지 않도록 "가장 늦게 끝나는 클립 끝" 아래로는
 * 줄지 않는다(조용히 데이터를 버리는 대신 UI가 클립을 먼저 줄이게 한다). 순수.
 */
export function updateTimelineSettings(
  set: AnimTimelineSet,
  timelineId: string,
  patch: { fps?: number; lengthFrames?: number },
): AnimTimelineSet {
  const target = set.timelines.find((t) => t.id === timelineId);
  if (!target) return set;
  const fps =
    patch.fps === undefined
      ? target.fps
      : Math.round(clamp(patch.fps, ANIM_TIMELINE_LIMITS.minFps, ANIM_TIMELINE_LIMITS.maxFps));
  let lengthFrames = target.lengthFrames;
  if (patch.lengthFrames !== undefined) {
    const maxClipEnd = target.tracks.reduce(
      (max, track) =>
        track.clips.reduce((m, clip) => Math.max(m, clip.startFrame + clip.durationFrames), max),
      0,
    );
    lengthFrames = Math.round(
      clamp(patch.lengthFrames, Math.max(1, maxClipEnd), ANIM_TIMELINE_LIMITS.maxLengthFrames),
    );
  }
  if (fps === target.fps && lengthFrames === target.lengthFrames) return set;
  return {
    ...set,
    timelines: set.timelines.map((t) => (t.id === timelineId ? { ...t, fps, lengthFrames } : t)),
  };
}

function mapTimeline(
  set: AnimTimelineSet,
  timelineId: string,
  fn: (timeline: AnimTimeline) => AnimTimeline,
): AnimTimelineSet {
  if (!set.timelines.some((t) => t.id === timelineId)) return set;
  return { ...set, timelines: set.timelines.map((t) => (t.id === timelineId ? fn(t) : t)) };
}

/** 트랙 추가. 트랙 상한(16) 도달·id 중복이면 원본 반환. 순수. */
export function addTrack(
  set: AnimTimelineSet,
  timelineId: string,
  track: AnimTimelineTrack,
): AnimTimelineSet {
  return mapTimeline(set, timelineId, (timeline) => {
    if (timeline.tracks.length >= ANIM_TIMELINE_LIMITS.maxTracksPerTimeline) return timeline;
    if (timeline.tracks.some((t) => t.id === track.id)) return timeline;
    return { ...timeline, tracks: [...timeline.tracks, track] };
  });
}

/** 트랙 삭제. 마지막 트랙도 삭제할 수 있다(빈 타임라인 허용). 없는 id면 원본 반환. 순수. */
export function removeTrack(set: AnimTimelineSet, timelineId: string, trackId: string): AnimTimelineSet {
  return mapTimeline(set, timelineId, (timeline) => {
    if (!timeline.tracks.some((t) => t.id === trackId)) return timeline;
    return { ...timeline, tracks: timeline.tracks.filter((t) => t.id !== trackId) };
  });
}

/**
 * 클립 배치. 시작·길이는 타임라인 범위 안으로 클램프하고, 트랙 클립 상한(512)·클립 id
 * 중복이면 원본 반환. 겹침 자체는 허용한다(해석 규칙: 시작이 늦은 클립이 이긴다). 순수.
 */
export function addClip(
  set: AnimTimelineSet,
  timelineId: string,
  trackId: string,
  clip: AnimCelClip,
): AnimTimelineSet {
  const timeline = set.timelines.find((t) => t.id === timelineId);
  if (!timeline || !timeline.tracks.some((t) => t.id === trackId)) return set;
  return mapTimeline(set, timelineId, (timeline) =>
    mapTrack(timeline, trackId, (track) => {
      if (track.clips.length >= ANIM_TIMELINE_LIMITS.maxClipsPerTrack) return track;
      if (track.clips.some((c) => c.id === clip.id)) return track;
      // 시작 위치를 먼저 보존하고 길이는 남은 구간까지만 줄인다(normalizeClip과 동일
      // 의미론 — 긴 클립을 뒤쪽에 놓아도 사용자가 고른 시작점이 사라지지 않는다).
      const startFrame = Math.max(
        0,
        Math.min(Math.floor(clip.startFrame) || 0, timeline.lengthFrames - 1),
      );
      const durationFrames = Math.max(
        1,
        Math.min(Math.floor(clip.durationFrames) || 1, timeline.lengthFrames - startFrame),
      );
      return { ...track, clips: [...track.clips, { ...clip, startFrame, durationFrames }] };
    }),
  );
}

/** 클립 제거. 없는 id면 원본 반환. 순수. */
export function removeClip(
  set: AnimTimelineSet,
  timelineId: string,
  trackId: string,
  clipId: string,
): AnimTimelineSet {
  return mapTimeline(set, timelineId, (timeline) =>
    mapTrack(timeline, trackId, (track) => {
      if (!track.clips.some((c) => c.id === clipId)) return track;
      return { ...track, clips: track.clips.filter((c) => c.id !== clipId) };
    }),
  );
}

// ── 해석 ────────────────────────────────────────────────────────────────

/** 전역 프레임에서 트랙이 보여야 할 클립. 겹침이 있으면 시작이 늦은(위에 배치된) 클립이 이긴다. */
export function clipAtFrame(track: AnimTimelineTrack, frame: number): AnimCelClip | null {
  let winner: AnimCelClip | null = null;
  for (const clip of track.clips) {
    if (frame >= clip.startFrame && frame < clip.startFrame + clip.durationFrames) {
      if (!winner || clip.startFrame >= winner.startFrame) winner = clip;
    }
  }
  return winner;
}

/** 전역 프레임 → 트랙별 표시 셀 (타임라인 재생·미리보기의 단일 해석 지점) */
export function resolveTimelineFrame(
  timeline: AnimTimeline,
  frame: number,
): readonly { readonly trackId: string; readonly clip: AnimCelClip; readonly celFrameOffset: number }[] {
  if (frame < 0 || frame >= timeline.lengthFrames) return [];
  const out: { trackId: string; clip: AnimCelClip; celFrameOffset: number }[] = [];
  for (const track of timeline.tracks) {
    if (track.muted) continue;
    const clip = clipAtFrame(track, frame);
    if (clip) out.push({ trackId: track.id, clip, celFrameOffset: frame - clip.startFrame });
  }
  return out;
}

export function frameToMs(timeline: AnimTimeline, frame: number): number {
  return (frame / timeline.fps) * 1000;
}

// ── 클립 편집 (순수 변환) ───────────────────────────────────────────────

/** 클립 이동. 다른 클립과 겹치는 것은 허용하되(해석 규칙으로 우선순위 결정) 범위 밖은 거부한다. */
export function moveClip(
  timeline: AnimTimeline,
  trackId: string,
  clipId: string,
  nextStartFrame: number,
): AnimTimeline {
  return mapTrack(timeline, trackId, (track) => ({
    ...track,
    clips: track.clips.map((clip) =>
      clip.id === clipId
        ? { ...clip, startFrame: clampClipStart(timeline, clip, nextStartFrame) }
        : clip,
    ),
  }));
}

/** 클립 노출 길이 변경 (타임시트에서 숫자로 늘이는 조작과 1:1 대응) */
export function setClipDuration(
  timeline: AnimTimeline,
  trackId: string,
  clipId: string,
  durationFrames: number,
): AnimTimeline {
  return mapTrack(timeline, trackId, (track) => ({
    ...track,
    clips: track.clips.map((clip) =>
      clip.id === clipId
        ? { ...clip, durationFrames: Math.max(1, Math.min(Math.floor(durationFrames), timeline.lengthFrames - clip.startFrame)) }
        : clip,
    ),
  }));
}

/**
 * 기존 단일 프레임 목록(frame-animation)을 1트랙 타임라인으로 승격하는 어댑터의 핵심 규칙.
 * durationMs 나열을 fps 기준 프레임 수로 환산해 클립을 잇는다.
 */
export function durationsToClips(
  cels: readonly { readonly cel: AnimCelRef; readonly durationMs: number }[],
  fps: number,
  makeId: (index: number) => string,
): AnimCelClip[] {
  const clips: AnimCelClip[] = [];
  let cursor = 0;
  cels.forEach((entry, index) => {
    const frames = Math.max(1, Math.round((entry.durationMs / 1000) * fps));
    clips.push({ id: makeId(index), cel: entry.cel, startFrame: cursor, durationFrames: frames });
    cursor += frames;
  });
  return clips;
}

// ── 마이그레이션: 기존 프레임 애니메이션 ⇄ 타임라인 ────────────────────

/**
 * StudioAnimFrame[] + fps → 타임라인 1개. 프레임별 노출 시간은 frame-animation과
 * 동일한 규칙(frameDurationMs: durationMs 우선, 없으면 fps 균등)으로 환산하므로
 * 승격 전후 재생 길이가 (프레임 단위 반올림 오차 안에서) 같다. 순수.
 */
export function framesToTimeline(
  frames: readonly StudioAnimFrame[],
  init: {
    timelineId: string;
    trackId: string;
    name?: string;
    fps?: number;
    makeClipId: (index: number) => string;
  },
): AnimTimeline {
  const fps = normalizeFrameFps(init.fps);
  const clips = durationsToClips(
    frames.map((frame) => ({
      cel: { kind: "frame", id: frame.id, label: frame.id } as AnimCelRef,
      durationMs: frameDurationMs(frame as StudioAnimFrame, fps),
    })),
    fps,
    init.makeClipId,
  );
  const totalFrames = clips.reduce((sum, clip) => sum + clip.durationFrames, 0);
  return {
    id: init.timelineId,
    name: normalizeTimelineName(init.name, DEFAULT_ANIM_TIMELINE_NAME),
    fps,
    lengthFrames: Math.max(1, totalFrames),
    tracks: [{ id: init.trackId, name: DEFAULT_ANIM_TRACK_NAME, clips }],
  };
}

/** 레거시 문서(프레임 목록만 있는 요소/페이지)를 타임라인 집합으로 승격. 순수. */
export function framesToTimelineSet(
  frames: readonly StudioAnimFrame[],
  init: {
    timelineId: string;
    trackId: string;
    name?: string;
    fps?: number;
    makeClipId: (index: number) => string;
  },
): AnimTimelineSet {
  const timeline = framesToTimeline(frames, init);
  return { timelines: [timeline], activeTimelineId: timeline.id };
}

/**
 * 타임라인 → 기존 프레임 목록(역호환). trackId 지정이 없으면 첫 트랙을 쓰고,
 * kind:"frame" 셀 클립만 시작 프레임 순으로 편다. src는 프레임 id로 조회하며
 * 조회에 실패하면 빈 문자열(호출측이 원본 프레임 맵을 넘기는 것이 전제).
 * durationMs는 프레임 수 × (1000/fps)로 되돌리므로 반올림 오차가 있을 수 있다. 순수.
 */
export function timelineToFrames(
  timeline: AnimTimeline,
  srcByFrameId: ReadonlyMap<string, string> | Readonly<Record<string, string>>,
  trackId?: string,
): StudioAnimFrame[] {
  const track = trackId
    ? timeline.tracks.find((t) => t.id === trackId)
    : timeline.tracks[0];
  if (!track) return [];
  const srcMap: ReadonlyMap<string, string> | null =
    srcByFrameId instanceof Map ? srcByFrameId : null;
  const srcRecord: Readonly<Record<string, string>> | null = srcMap
    ? null
    : (srcByFrameId as Readonly<Record<string, string>>);
  const lookup = (id: string): string =>
    srcMap ? srcMap.get(id) ?? "" : srcRecord?.[id] ?? "";
  return [...track.clips]
    .filter((clip) => clip.cel.kind === "frame")
    .sort((a, b) => a.startFrame - b.startFrame)
    .map((clip) => ({
      id: clip.cel.id,
      src: lookup(clip.cel.id),
      durationMs: Math.round((clip.durationFrames / timeline.fps) * 1000),
    }));
}

// ── 타임시트 도출 ───────────────────────────────────────────────────────

export interface TimesheetRow {
  readonly trackName: string;
  readonly celLabel: string;
  readonly startFrame: number;
  readonly endFrame: number; // exclusive
  readonly durationFrames: number;
}

/** 인쇄·공유용 노출표: 트랙 순서 → 시작 프레임 순으로 클립을 행으로 편다. */
export function deriveTimesheet(timeline: AnimTimeline): TimesheetRow[] {
  const rows: TimesheetRow[] = [];
  for (const track of timeline.tracks) {
    const sorted = [...track.clips].sort((a, b) => a.startFrame - b.startFrame);
    for (const clip of sorted) {
      rows.push({
        trackName: track.name,
        celLabel: clip.cel.label,
        startFrame: clip.startFrame,
        endFrame: clip.startFrame + clip.durationFrames,
        durationFrames: clip.durationFrames,
      });
    }
  }
  return rows;
}

// ── IR(AnimationGraph) 정합 ────────────────────────────────────────────

/**
 * packages/studio-project-model AnimationGraphIR와 구조적으로 동일한 그래프 모양.
 * exposures는 "노출이 바뀌는 프레임"에만 찍는다(IR resolveExposedCel의 hold 의미론:
 * 해당 프레임 이하 가장 최근 노출이 이긴다). 빈 구간은 celId:null 노출로 닫는다.
 */
export interface AnimationGraphShape {
  version: 1;
  fps: number;
  durationFrames: number;
  levels: { id: string; name: string; cels: { id: string; label: string }[] }[];
  exposures: { frame: number; levelId: string; celId: string | null }[];
  camera: { x: never[]; y: never[]; scale: never[]; rotationDeg: never[] };
  audio: never[];
}

/** 타임라인 → AnimationGraph 모양. resolveTimelineFrame 결과와 프레임 단위로 일치한다. */
export function timelineToAnimationGraph(timeline: AnimTimeline): AnimationGraphShape {
  const levels = timeline.tracks.map((track) => {
    const seen = new Set<string>();
    const cels: { id: string; label: string }[] = [];
    for (const clip of track.clips) {
      if (seen.has(clip.cel.id)) continue;
      seen.add(clip.cel.id);
      cels.push({ id: clip.cel.id, label: clip.cel.label });
    }
    return { id: track.id, name: track.name, cels };
  });
  const exposures: AnimationGraphShape["exposures"] = [];
  for (const track of timeline.tracks) {
    let current: string | null | undefined;
    for (let frame = 0; frame < timeline.lengthFrames; frame += 1) {
      const celId = track.muted ? null : clipAtFrame(track, frame)?.cel.id ?? null;
      if (current === undefined || celId !== current) {
        exposures.push({ frame, levelId: track.id, celId });
        current = celId;
      }
    }
  }
  return {
    version: 1,
    fps: timeline.fps,
    durationFrames: timeline.lengthFrames,
    levels,
    exposures,
    camera: { x: [], y: [], scale: [], rotationDeg: [] },
    audio: [],
  };
}

/**
 * AnimationGraph 모양 → 타임라인 1개. 노출(hold 의미론)을 구간 클립으로 되접는다:
 * celId가 바뀌는 지점마다 이전 클립을 닫고, null 구간은 클립 없이 비운다.
 * IR 셀은 scene node 참조라 kind:"asset"으로 둔다. 순수.
 */
export function fromAnimationGraph(
  graph: {
    fps: number;
    durationFrames: number;
    levels: readonly { id: string; name: string; cels: readonly { id: string; label: string }[] }[];
    exposures: readonly { frame: number; levelId: string; celId: string | null }[];
  },
  init: { timelineId: string; name?: string; makeClipId: (levelId: string, index: number) => string },
): AnimTimeline {
  const tracks: AnimTimelineTrack[] = graph.levels.map((level) => {
    const labelByCelId = new Map(level.cels.map((cel) => [cel.id, cel.label]));
    const sorted = graph.exposures
      .filter((e) => e.levelId === level.id)
      .sort((a, b) => a.frame - b.frame);
    const clips: AnimCelClip[] = [];
    let open: { celId: string; startFrame: number } | null = null;
    const close = (endFrame: number) => {
      if (open && endFrame > open.startFrame) {
        clips.push({
          id: init.makeClipId(level.id, clips.length),
          cel: { kind: "asset", id: open.celId, label: labelByCelId.get(open.celId) ?? open.celId },
          startFrame: open.startFrame,
          durationFrames: endFrame - open.startFrame,
        });
      }
      open = null;
    };
    for (const exposure of sorted) {
      if (open && exposure.celId === open.celId) continue;
      close(exposure.frame);
      if (exposure.celId !== null) open = { celId: exposure.celId, startFrame: exposure.frame };
    }
    close(graph.durationFrames);
    return { id: level.id, name: level.name, clips };
  });
  return {
    id: init.timelineId,
    name: normalizeTimelineName(init.name, DEFAULT_ANIM_TIMELINE_NAME),
    fps: Math.round(clamp(graph.fps, ANIM_TIMELINE_LIMITS.minFps, ANIM_TIMELINE_LIMITS.maxFps)),
    lengthFrames: Math.max(1, Math.round(graph.durationFrames)),
    tracks,
  };
}

// ── 저장 / 재열기 (정규화) ──────────────────────────────────────────────

function normalizeCelRef(value: unknown): AnimCelRef | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const kind = record.kind === "page" || record.kind === "asset" ? record.kind : "frame";
  const id = typeof record.id === "string" ? record.id.trim() : "";
  if (!id) return null;
  return { kind, id, label: typeof record.label === "string" ? record.label : id };
}

function normalizeClip(value: unknown, lengthFrames: number): AnimCelClip | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  const cel = normalizeCelRef(record.cel);
  if (!id || !cel) return null;
  const startFrame = Math.round(clamp(Number(record.startFrame), 0, Math.max(0, lengthFrames - 1)));
  if (!Number.isFinite(startFrame)) return null;
  const durationFrames = Math.max(
    1,
    Math.min(Math.floor(Number(record.durationFrames)) || 1, lengthFrames - startFrame),
  );
  return { id, cel, startFrame, durationFrames };
}

function normalizeTimeline(value: unknown): AnimTimeline | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  if (!id) return null;
  const fps = Math.round(
    clamp(Number(record.fps) || 12, ANIM_TIMELINE_LIMITS.minFps, ANIM_TIMELINE_LIMITS.maxFps),
  );
  const lengthFrames = Math.round(
    clamp(Number(record.lengthFrames) || DEFAULT_ANIM_TIMELINE_LENGTH_FRAMES, 1, ANIM_TIMELINE_LIMITS.maxLengthFrames),
  );
  const rawTracks = Array.isArray(record.tracks) ? record.tracks : [];
  const tracks: AnimTimelineTrack[] = [];
  const seenTrackIds = new Set<string>();
  for (const rawTrack of rawTracks) {
    if (tracks.length >= ANIM_TIMELINE_LIMITS.maxTracksPerTimeline) break;
    if (!rawTrack || typeof rawTrack !== "object" || Array.isArray(rawTrack)) continue;
    const trackRecord = rawTrack as Record<string, unknown>;
    const trackId = typeof trackRecord.id === "string" ? trackRecord.id.trim() : "";
    if (!trackId || seenTrackIds.has(trackId)) continue;
    seenTrackIds.add(trackId);
    const rawClips = Array.isArray(trackRecord.clips) ? trackRecord.clips : [];
    const clips: AnimCelClip[] = [];
    const seenClipIds = new Set<string>();
    for (const rawClip of rawClips) {
      if (clips.length >= ANIM_TIMELINE_LIMITS.maxClipsPerTrack) break;
      const clip = normalizeClip(rawClip, lengthFrames);
      if (!clip || seenClipIds.has(clip.id)) continue;
      seenClipIds.add(clip.id);
      clips.push(clip);
    }
    tracks.push({
      id: trackId,
      name: normalizeTimelineName(trackRecord.name, DEFAULT_ANIM_TRACK_NAME),
      clips,
      ...(trackRecord.muted === true ? { muted: true } : {}),
    });
  }
  return {
    id,
    name: normalizeTimelineName(record.name, DEFAULT_ANIM_TIMELINE_NAME),
    fps,
    lengthFrames,
    tracks,
  };
}

/**
 * 저장된 값(과거·부분·손상 포함)을 안전한 집합으로 정규화. 유효한 타임라인이 하나도
 * 없으면 null — 호출측이 레거시 프레임 목록 마이그레이션으로 폴백하는 신호다.
 * 이름 중복은 unique 규칙으로 풀어 재열기만으로 duplicate-name 경고가 뜨지 않게 한다. 순수.
 */
export function normalizeTimelineSet(value: unknown): AnimTimelineSet | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const rawTimelines = Array.isArray(record.timelines) ? record.timelines : [];
  const timelines: AnimTimeline[] = [];
  const seenIds = new Set<string>();
  for (const raw of rawTimelines) {
    if (timelines.length >= ANIM_TIMELINE_LIMITS.maxTimelines) break;
    const timeline = normalizeTimeline(raw);
    if (!timeline || seenIds.has(timeline.id)) continue;
    seenIds.add(timeline.id);
    timelines.push(timeline);
  }
  if (timelines.length === 0) return null;
  const deduped: AnimTimeline[] = [];
  for (const timeline of timelines) {
    const partial: AnimTimelineSet = { timelines: deduped, activeTimelineId: timeline.id };
    deduped.push({ ...timeline, name: uniqueTimelineName(partial, timeline.name) });
  }
  const activeTimelineId =
    typeof record.activeTimelineId === "string" &&
    deduped.some((t) => t.id === record.activeTimelineId)
      ? record.activeTimelineId
      : deduped[0]!.id;
  return { timelines: deduped, activeTimelineId };
}

/** 문서 JSON에 그대로 넣을 수 있는 직렬화(정규화된 복사본). 순수. */
export function serializeTimelineSet(set: AnimTimelineSet): AnimTimelineSet {
  return JSON.parse(JSON.stringify(set)) as AnimTimelineSet;
}

/** JSON 문자열 → 집합. 파싱 실패·무효면 null. 순수. */
export function parseTimelineSet(json: string): AnimTimelineSet | null {
  try {
    return normalizeTimelineSet(JSON.parse(json) as unknown);
  } catch {
    return null;
  }
}

/**
 * 저장 표면의 단일 진입점: 저장된 집합이 있으면 정규화해 쓰고, 없거나 깨졌으면
 * 레거시 프레임 목록을 승격하고, 그것도 없으면 기본 집합을 만든다. 순수.
 */
export function resolveTimelineSet(
  stored: unknown,
  legacy: { frames: readonly StudioAnimFrame[]; fps?: number } | undefined,
  makeIds: {
    timelineId: () => string;
    trackId: () => string;
    makeClipId: (index: number) => string;
  },
): AnimTimelineSet {
  const normalized = normalizeTimelineSet(stored);
  if (normalized) return normalized;
  if (legacy && legacy.frames.length > 0) {
    return framesToTimelineSet(legacy.frames, {
      timelineId: makeIds.timelineId(),
      trackId: makeIds.trackId(),
      fps: legacy.fps,
      makeClipId: makeIds.makeClipId,
    });
  }
  return createTimelineSet({ timelineId: makeIds.timelineId() });
}

// ── 검증 ────────────────────────────────────────────────────────────────

export interface AnimTimelineIssue {
  readonly code:
    | "fps-out-of-range"
    | "length-out-of-range"
    | "clip-out-of-bounds"
    | "clip-overlap"
    | "too-many-timelines"
    | "too-many-tracks"
    | "too-many-clips"
    | "duplicate-name"
    | "duplicate-id"
    | "missing-active";
  readonly timelineId?: string;
  readonly trackId?: string;
  readonly clipId?: string;
  readonly message: string;
}

export function validateTimelineSet(set: AnimTimelineSet): AnimTimelineIssue[] {
  const issues: AnimTimelineIssue[] = [];
  if (set.timelines.length > ANIM_TIMELINE_LIMITS.maxTimelines) {
    issues.push({ code: "too-many-timelines", message: `타임라인은 최대 ${ANIM_TIMELINE_LIMITS.maxTimelines}개까지 만들 수 있어요.` });
  }
  if (!set.timelines.some((t) => t.id === set.activeTimelineId)) {
    issues.push({ code: "missing-active", message: "선택된 타임라인이 없어요. 타임라인을 하나 선택해 주세요." });
  }
  const names = new Set<string>();
  const ids = new Set<string>();
  for (const timeline of set.timelines) {
    if (ids.has(timeline.id)) {
      issues.push({ code: "duplicate-id", timelineId: timeline.id, message: "타임라인 식별자가 겹쳐요." });
    }
    ids.add(timeline.id);
    if (names.has(timeline.name)) {
      issues.push({ code: "duplicate-name", timelineId: timeline.id, message: `타임라인 이름이 겹쳐요: ${timeline.name}` });
    }
    names.add(timeline.name);
    if (timeline.fps < ANIM_TIMELINE_LIMITS.minFps || timeline.fps > ANIM_TIMELINE_LIMITS.maxFps) {
      issues.push({ code: "fps-out-of-range", timelineId: timeline.id, message: "프레임 속도가 허용 범위를 벗어났어요." });
    }
    if (timeline.lengthFrames < 1 || timeline.lengthFrames > ANIM_TIMELINE_LIMITS.maxLengthFrames) {
      issues.push({ code: "length-out-of-range", timelineId: timeline.id, message: "타임라인 길이가 허용 범위를 벗어났어요." });
    }
    if (timeline.tracks.length > ANIM_TIMELINE_LIMITS.maxTracksPerTimeline) {
      issues.push({ code: "too-many-tracks", timelineId: timeline.id, message: "한 타임라인의 트랙이 너무 많아요." });
    }
    for (const track of timeline.tracks) {
      if (track.clips.length > ANIM_TIMELINE_LIMITS.maxClipsPerTrack) {
        issues.push({ code: "too-many-clips", timelineId: timeline.id, trackId: track.id, message: "한 트랙의 클립이 너무 많아요." });
      }
      const sorted = [...track.clips].sort((a, b) => a.startFrame - b.startFrame);
      for (let i = 0; i < sorted.length; i += 1) {
        const clip = sorted[i]!;
        if (clip.startFrame < 0 || clip.startFrame + clip.durationFrames > timeline.lengthFrames) {
          issues.push({ code: "clip-out-of-bounds", timelineId: timeline.id, trackId: track.id, clipId: clip.id, message: "클립이 타임라인 범위를 벗어났어요." });
        }
        const next = sorted[i + 1];
        if (next && clip.startFrame + clip.durationFrames > next.startFrame) {
          issues.push({ code: "clip-overlap", timelineId: timeline.id, trackId: track.id, clipId: clip.id, message: "클립이 다음 클립과 겹쳐요. 겹친 구간은 나중 클립이 표시돼요." });
        }
      }
    }
  }
  return issues;
}

// ── 내부 ────────────────────────────────────────────────────────────────

function clampClipStart(timeline: AnimTimeline, clip: AnimCelClip, nextStartFrame: number): number {
  const maxStart = Math.max(0, timeline.lengthFrames - clip.durationFrames);
  return Math.max(0, Math.min(Math.floor(nextStartFrame), maxStart));
}

function mapTrack(
  timeline: AnimTimeline,
  trackId: string,
  fn: (track: AnimTimelineTrack) => AnimTimelineTrack,
): AnimTimeline {
  return {
    ...timeline,
    tracks: timeline.tracks.map((track) => (track.id === trackId ? fn(track) : track)),
  };
}
