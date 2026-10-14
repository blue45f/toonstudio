/**
 * 비동기 검수 해설 (Miro Talktrack 격차 G9) — 순수 모델.
 *
 * 검수자가 비교·원고 화면을 이동하며 음성 해설을 녹화하면, 그 순간의
 * 화면 상태(표면·소스/페이지·모드·뷰포트)와 그 시점에 화면에 있던 핀 묶음이
 * 키프레임으로 함께 남는다. 받는 쪽은 해설을 재생하면 키프레임 시점마다
 * 해당 위치로 자동 이동한다.
 *
 * 오디오 자체의 저장(서버 업로드 정책)은 이 모델의 관심사가 아니다:
 * audioRef는 불투명 참조(kind+url)만 들고, 녹화 직후에는 "blob" 참조,
 * 서버 정책이 확정되면 "server" 참조로 교체해 저장한다. 해설이 없는
 * 기존 핀 흐름과는 완전히 독립이라, 트랙이 없어도 핀은 종전대로 동작한다.
 */

export type VoiceCommentarySurface = "compare" | "manuscript";

/** 해설 한 시점의 화면 상태. 비교 세션(CompareSession+공유 뷰포트)과 원고 화면 모두를 담는 최소 계약. */
export interface VoiceViewSnapshot {
  readonly surface: VoiceCommentarySurface;
  /** 비교 표면: 현재 앞 페인의 풀 항목 id. 원고 표면에서는 null. */
  readonly poolItemId: string | null;
  /** 원고 표면: 페이지 id. 비교 표면에서는 null일 수 있다. */
  readonly pageId: string | null;
  /** 비교 모드(panes/slider/blink/overlay) 등 표면별 모드 문자열. 없으면 null. */
  readonly mode: string | null;
  readonly scale: number;
  readonly tx: number;
  readonly ty: number;
}

export interface VoiceCommentaryKeyframe {
  /** 녹화 시작 기준 경과(ms). 0 이상, 트랙 안에서 단조 증가로 정규화된다. */
  readonly atMs: number;
  readonly view: VoiceViewSnapshot;
  /** 이 시점에 해설자가 보고 있던(활성) 핀 스레드 id 묶음. */
  readonly pinThreadIds: readonly string[];
}

export type VoiceAudioRefKind = "blob" | "server" | "external";

export interface VoiceAudioRef {
  readonly kind: VoiceAudioRefKind;
  readonly url: string;
  readonly mimeType: string | null;
  /** 바이트 수(알면). 서버 정책 확정 전 로컬 blob에서는 실측값을 넣는다. */
  readonly byteSize: number | null;
}

export interface VoiceCommentaryTrack {
  readonly version: 1;
  readonly id: string;
  readonly episodeId: string;
  readonly authorId: string | null;
  readonly authorName: string;
  readonly createdAt: string;
  readonly durationMs: number;
  readonly audio: VoiceAudioRef | null;
  readonly keyframes: readonly VoiceCommentaryKeyframe[];
  /** 트랙 전체에서 언급된 핀 스레드(중복 제거, 첫 등장 순서). */
  readonly pinThreadIds: readonly string[];
}

const SCALE_MIN = 0.25;
const SCALE_MAX = 8;

function clampScale(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, value));
}
function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}
function clampPan(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(-1, value));
}

export function normalizeVoiceView(view: VoiceViewSnapshot): VoiceViewSnapshot {
  return {
    surface: view.surface === "manuscript" ? "manuscript" : "compare",
    poolItemId: view.poolItemId ?? null,
    pageId: view.pageId ?? null,
    mode: view.mode ?? null,
    scale: clampScale(view.scale),
    tx: clampPan(view.tx),
    ty: clampPan(view.ty),
  };
}

function uniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (typeof v !== "string" || v.length === 0 || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

/** 키프레임을 시각 순으로 정렬하고, 같은 atMs는 나중 항목이 이기며, 음수·비유한 시각은 0으로 붙인다. */
export function normalizeVoiceKeyframes(
  keyframes: readonly VoiceCommentaryKeyframe[],
  durationMs: number,
): VoiceCommentaryKeyframe[] {
  const byAt = new Map<number, VoiceCommentaryKeyframe>();
  for (const kf of keyframes) {
    const atMs = Math.min(Math.max(0, finiteOr(kf.atMs, 0)), Math.max(0, finiteOr(durationMs, 0)));
    byAt.set(atMs, {
      atMs,
      view: normalizeVoiceView(kf.view),
      pinThreadIds: uniqueStrings(kf.pinThreadIds ?? []),
    });
  }
  return [...byAt.values()].sort((a, b) => a.atMs - b.atMs);
}

export interface CreateVoiceCommentaryTrackInput {
  readonly id: string;
  readonly episodeId: string;
  readonly authorId?: string | null;
  readonly authorName: string;
  readonly createdAt: string;
  readonly durationMs: number;
  readonly audio?: VoiceAudioRef | null;
  readonly keyframes: readonly VoiceCommentaryKeyframe[];
}

export function createVoiceCommentaryTrack(input: CreateVoiceCommentaryTrackInput): VoiceCommentaryTrack {
  const durationMs = Math.max(0, finiteOr(input.durationMs, 0));
  const keyframes = normalizeVoiceKeyframes(input.keyframes, durationMs);
  const pinThreadIds = uniqueStrings(keyframes.flatMap((kf) => kf.pinThreadIds));
  return {
    version: 1,
    id: input.id,
    episodeId: input.episodeId,
    authorId: input.authorId ?? null,
    authorName: input.authorName,
    createdAt: input.createdAt,
    durationMs,
    audio: input.audio ?? null,
    keyframes,
    pinThreadIds,
  };
}

// ── 녹화 세션 (순수 리듀서) ─────────────────────────────────────────────

export interface VoiceRecordingSession {
  readonly episodeId: string;
  readonly startedAt: string;
  readonly keyframes: readonly VoiceCommentaryKeyframe[];
}

/** 녹화 시작: 시작 시점의 화면을 0ms 키프레임으로 반드시 남긴다(재생 즉시 첫 위치로 이동). */
export function startVoiceRecording(input: {
  readonly episodeId: string;
  readonly startedAt: string;
  readonly initialView: VoiceViewSnapshot;
  readonly initialPinThreadIds?: readonly string[];
}): VoiceRecordingSession {
  return {
    episodeId: input.episodeId,
    startedAt: input.startedAt,
    keyframes: [
      { atMs: 0, view: normalizeVoiceView(input.initialView), pinThreadIds: uniqueStrings(input.initialPinThreadIds ?? []) },
    ],
  };
}

/** 녹화 중 화면 이동·핀 변화가 있을 때 키프레임을 찍는다. 직전 키프레임과 화면+핀이 같으면 찍지 않는다(중복 방지). */
export function recordVoiceKeyframe(
  session: VoiceRecordingSession,
  atMs: number,
  view: VoiceViewSnapshot,
  pinThreadIds: readonly string[] = [],
): VoiceRecordingSession {
  const normalized = normalizeVoiceView(view);
  const pins = uniqueStrings(pinThreadIds);
  const last = session.keyframes[session.keyframes.length - 1];
  if (
    last &&
    last.view.surface === normalized.surface &&
    last.view.poolItemId === normalized.poolItemId &&
    last.view.pageId === normalized.pageId &&
    last.view.mode === normalized.mode &&
    last.view.scale === normalized.scale &&
    last.view.tx === normalized.tx &&
    last.view.ty === normalized.ty &&
    last.pinThreadIds.length === pins.length &&
    last.pinThreadIds.every((id, i) => id === pins[i])
  ) {
    return session;
  }
  const clampedAt = Math.max(0, finiteOr(atMs, 0));
  return { ...session, keyframes: [...session.keyframes, { atMs: clampedAt, view: normalized, pinThreadIds: pins }] };
}

export function finishVoiceRecording(input: {
  readonly session: VoiceRecordingSession;
  readonly id: string;
  readonly authorId?: string | null;
  readonly authorName: string;
  readonly durationMs: number;
  readonly audio?: VoiceAudioRef | null;
}): VoiceCommentaryTrack {
  return createVoiceCommentaryTrack({
    id: input.id,
    episodeId: input.session.episodeId,
    authorId: input.authorId ?? null,
    authorName: input.authorName,
    createdAt: input.session.startedAt,
    durationMs: input.durationMs,
    audio: input.audio ?? null,
    keyframes: input.session.keyframes,
  });
}

// ── 재생 큐 (자동 이동) ─────────────────────────────────────────────────

export interface VoicePlaybackCue {
  /** 현재 시각이 속한 키프레임 인덱스. 키프레임이 없으면 -1. */
  readonly keyframeIndex: number;
  /** 호스트가 적용할 화면 상태(같은 소스·페이지 안에서는 다음 키프레임까지 뷰포트를 보간). */
  readonly view: VoiceViewSnapshot | null;
  readonly pinThreadIds: readonly string[];
  /** 다음 키프레임까지 남은 ms. 없으면 null. */
  readonly nextKeyframeInMs: number | null;
}

function interpolateView(a: VoiceViewSnapshot, b: VoiceViewSnapshot, ratio: number): VoiceViewSnapshot {
  // 표면·소스·페이지·모드가 다르면 보간하지 않고 현재 키프레임 화면을 유지한다(점프는 다음 키프레임에서).
  if (a.surface !== b.surface || a.poolItemId !== b.poolItemId || a.pageId !== b.pageId || a.mode !== b.mode) return a;
  const t = Math.min(1, Math.max(0, ratio));
  return {
    ...a,
    scale: clampScale(a.scale + (b.scale - a.scale) * t),
    tx: clampPan(a.tx + (b.tx - a.tx) * t),
    ty: clampPan(a.ty + (b.ty - a.ty) * t),
  };
}

export function voicePlaybackCueAt(track: VoiceCommentaryTrack, atMs: number): VoicePlaybackCue {
  const t = Math.min(Math.max(0, finiteOr(atMs, 0)), track.durationMs);
  const frames = track.keyframes;
  if (frames.length === 0) return { keyframeIndex: -1, view: null, pinThreadIds: [], nextKeyframeInMs: null };
  let idx = 0;
  for (let i = 0; i < frames.length; i += 1) {
    if (frames[i].atMs <= t) idx = i;
    else break;
  }
  const current = frames[idx];
  const next = frames[idx + 1] ?? null;
  const view = next ? interpolateView(current.view, next.view, (t - current.atMs) / Math.max(1, next.atMs - current.atMs)) : current.view;
  return {
    keyframeIndex: idx,
    view,
    pinThreadIds: current.pinThreadIds,
    nextKeyframeInMs: next ? next.atMs - t : null,
  };
}

/** 탐색(seek) 시 호스트가 즉시 적용할 큐. 재생 중 큐와 같은 계산을 쓴다. */
export function voiceSeekCue(track: VoiceCommentaryTrack, atMs: number): VoicePlaybackCue {
  return voicePlaybackCueAt(track, atMs);
}

/** 트랙을 핀 묶음과 함께 공유할 때의 직렬화(오디오 URL은 참조만; blob URL은 공유 불가라 parse에서 탈락시킨다). */
export function serializeVoiceCommentaryTrack(track: VoiceCommentaryTrack): string {
  return JSON.stringify(track);
}

export function parseVoiceCommentaryTrack(raw: string | null): VoiceCommentaryTrack | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Record<string, unknown>;
  if (p.version !== 1 || typeof p.id !== "string" || typeof p.episodeId !== "string") return null;
  if (typeof p.authorName !== "string" || typeof p.createdAt !== "string") return null;
  const durationMs = typeof p.durationMs === "number" ? p.durationMs : NaN;
  if (!Number.isFinite(durationMs) || durationMs < 0) return null;
  const rawFrames = Array.isArray(p.keyframes) ? p.keyframes : [];
  const keyframes: VoiceCommentaryKeyframe[] = [];
  for (const entry of rawFrames) {
    if (!entry || typeof entry !== "object") return null;
    const kf = entry as Record<string, unknown>;
    const view = kf.view as Record<string, unknown> | null;
    if (!view || typeof kf.atMs !== "number") return null;
    keyframes.push({
      atMs: kf.atMs,
      view: {
        surface: view.surface === "manuscript" ? "manuscript" : "compare",
        poolItemId: typeof view.poolItemId === "string" ? view.poolItemId : null,
        pageId: typeof view.pageId === "string" ? view.pageId : null,
        mode: typeof view.mode === "string" ? view.mode : null,
        scale: typeof view.scale === "number" ? view.scale : 1,
        tx: typeof view.tx === "number" ? view.tx : 0,
        ty: typeof view.ty === "number" ? view.ty : 0,
      },
      pinThreadIds: Array.isArray(kf.pinThreadIds) ? kf.pinThreadIds.filter((v): v is string => typeof v === "string") : [],
    });
  }
  let audio: VoiceAudioRef | null = null;
  if (p.audio && typeof p.audio === "object") {
    const a = p.audio as Record<string, unknown>;
    // blob: URL은 만든 기기에서만 유효하므로 공유·복원 대상에서 제외한다(조용히 깨진 링크를 남기지 않음).
    if ((a.kind === "server" || a.kind === "external") && typeof a.url === "string" && a.url.length > 0) {
      audio = {
        kind: a.kind,
        url: a.url,
        mimeType: typeof a.mimeType === "string" ? a.mimeType : null,
        byteSize: typeof a.byteSize === "number" ? a.byteSize : null,
      };
    }
  }
  return createVoiceCommentaryTrack({
    id: p.id,
    episodeId: p.episodeId,
    authorId: typeof p.authorId === "string" ? p.authorId : null,
    authorName: p.authorName,
    createdAt: p.createdAt,
    durationMs,
    audio,
    keyframes,
  });
}

/** 해설 없는 기존 핀 흐름과의 공존 판정: 트랙이 없어도(null/빈 목록) 핀 표시는 그대로 — 이 헬퍼는 그 계약을 고정한다. */
export function voiceTracksForEpisode(
  tracks: readonly VoiceCommentaryTrack[],
  episodeId: string,
): VoiceCommentaryTrack[] {
  return tracks.filter((t) => t.episodeId === episodeId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function formatVoiceTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(finiteOr(ms, 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
