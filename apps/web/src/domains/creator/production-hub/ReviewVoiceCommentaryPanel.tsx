import { getAuthUserId, listeners, type Session } from "@/domains/auth/public/session/auth-session-state";
import { useI18n, useT } from "@/shared/lib/i18n";
import { MapPin, Mic, Pause, Play, Square } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  VOICE_COMMENTARY_DEFAULT_RETENTION_DAYS,
  VOICE_COMMENTARY_MAX_AUDIO_BYTES,
  VOICE_COMMENTARY_MAX_RETENTION_DAYS,
  finishVoiceRecording,
  formatVoiceTime,
  recordVoiceKeyframe,
  startVoiceRecording,
  voiceCommentaryAudioSizeProblem,
  voicePlaybackCueAt,
  type VoiceCommentaryTrack,
  type VoiceRecordingSession,
  type VoiceViewSnapshot,
} from "./review-voice-commentary-model";

export interface VoiceViewCapture {
  readonly view: VoiceViewSnapshot;
  readonly pinThreadIds: readonly string[];
}

export interface ReviewVoiceCommentaryPanelProps {
  readonly episodeId: string;
  readonly tracks: readonly VoiceCommentaryTrack[];
  readonly authorName: string;
  readonly authorId?: string | null;
  readonly loading?: boolean;
  readonly error?: string | null;
  readonly readOnly?: boolean;
  /** 녹화 중 현재 화면을 읽는 호스트 콜백. 없으면 녹화 버튼을 비활성으로 명시한다. */
  readonly captureView?: () => VoiceViewCapture | null;
  /** 녹화 완료 — 호스트가 blob 저장(서버 정책 확정 시 업로드) 후 트랙을 목록에 반영한다. */
  readonly onSaveTrack?: (track: VoiceCommentaryTrack, audioBlob: Blob | null) => void;
  /** 사용자 재생 시 현재 권한을 검사하고 서버 음성 주소를 갱신한다. */
  readonly onPreparePlayback?: (track: VoiceCommentaryTrack, signal: AbortSignal) => Promise<VoiceCommentaryTrack>;
  /** 재생·탐색 시 해당 위치로 자동 이동 — 호스트가 비교/원고 화면에 view를 적용한다. */
  readonly onApplyView?: (view: VoiceViewSnapshot, pinThreadIds: readonly string[]) => void;
  readonly onOpenPin?: (threadId: string) => void;
}

type RecorderState =
  | { readonly kind: "idle" }
  | { readonly kind: "starting" }
  | { readonly kind: "recording"; readonly startedAtMs: number }
  | { readonly kind: "ended" }
  | { readonly kind: "stopping" }
  | { readonly kind: "unsupported"; readonly reason: string }
  | { readonly kind: "error"; readonly message: string };

interface RecordingBoundary {
  readonly session: VoiceRecordingSession;
  readonly durationMs: number;
  readonly endedAtMs: number;
  readonly mimeType: string | null;
}

interface RecordingFinalization extends RecordingBoundary {
  readonly authorId: string | null;
  readonly authorName: string;
  readonly onSaveTrack: ReviewVoiceCommentaryPanelProps["onSaveTrack"];
}

interface RecordingAttempt {
  readonly generation: number;
  readonly authUserId: string | null;
  stream: MediaStream | null;
  mediaRecorder: MediaRecorder | null;
  chunks: Blob[];
  session: VoiceRecordingSession | null;
  startedAtMs: number | null;
  mimeType: string | null;
  observedStop: RecordingBoundary | null;
  finalization: RecordingFinalization | null;
  settled: boolean;
}

function stopAttemptStream(attempt: RecordingAttempt): void {
  const stream = attempt.stream;
  attempt.stream = null;
  stream?.getTracks().forEach((track) => track.stop());
}

function detachAttemptEvents(attempt: RecordingAttempt): void {
  if (!attempt.mediaRecorder) return;
  attempt.mediaRecorder.ondataavailable = null;
  attempt.mediaRecorder.onstart = null;
  attempt.mediaRecorder.onstop = null;
  attempt.mediaRecorder.onerror = null;
}

/** 폐기한 시도는 저장하지 않는다. recorder 종료가 실패해도 그 시도의 마이크는 닫는다. */
function discardRecordingAttempt(attempt: RecordingAttempt): boolean {
  attempt.settled = true;
  attempt.finalization = null;
  attempt.chunks = [];
  detachAttemptEvents(attempt);
  try {
    if (attempt.mediaRecorder && attempt.mediaRecorder.state !== "inactive") {
      attempt.mediaRecorder.stop();
    }
    return true;
  } catch {
    return false;
  } finally {
    stopAttemptStream(attempt);
  }
}

/**
 * 해설에는 전사가 없어, 검수 음성 메모·부스 테이크와 같은 방식으로 "누가 남긴 해설인가"를
 * 해설 길이만큼 한 줄 자막(WebVTT)으로 단다. 말한 내용을 지어내지 않는다.
 */
function commentaryCaptionTrack(label: string, durationMs: number): string {
  const totalSec = Math.max(1, Math.ceil(durationMs / 1000));
  const end = `${String(Math.floor(totalSec / 60)).padStart(2, "0")}:${String(totalSec % 60).padStart(2, "0")}.000`;
  const body = `WEBVTT\n\n00:00.000 --> ${end}\n${label.replace(/[\r\n]+/gu, " ")}\n`;
  return `data:text/vtt;charset=utf-8,${encodeURIComponent(body)}`;
}

function recorderSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined"
  );
}

function readVoiceCapture(capture: ReviewVoiceCommentaryPanelProps["captureView"]): VoiceViewCapture | null {
  try { return capture?.() ?? null; }
  catch { return null; }
}

function syncVoiceAudioSource(audio: HTMLAudioElement, url: string): void {
  if (audio.getAttribute("src") !== url) audio.src = url;
}

export function ReviewVoiceCommentaryPanel({
  episodeId,
  tracks,
  authorName,
  authorId = null,
  loading = false,
  error = null,
  readOnly = false,
  captureView,
  onSaveTrack,
  onPreparePlayback,
  onApplyView,
  onOpenPin,
}: ReviewVoiceCommentaryPanelProps) {
  const t = useT();
  const language = useI18n((state) => state.lang);
  const [recorder, setRecorder] = useState<RecorderState>({ kind: "idle" });
  const [elapsedMs, setElapsedMs] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playheadMs, setPlayheadMs] = useState(0);
  const [activePins, setActivePins] = useState<readonly string[]>([]);
  const [preparingPlayback, setPreparingPlayback] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  const attemptRef = useRef<RecordingAttempt | null>(null);
  const generationRef = useRef(0);
  const mountedRef = useRef(false);
  const captureViewRef = useRef(captureView);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastAppliedRef = useRef<string>("");
  const lastKeyframeRef = useRef<number>(-1);
  const playheadRef = useRef(0);
  const pausedCueRef = useRef(false);
  const playbackRef = useRef<AbortController | null>(null);
  const playbackAudioRef = useRef<string | null>(null);

  const cancelPlayback = useCallback(() => {
    playbackRef.current?.abort();
    playbackRef.current = null;
    playbackAudioRef.current = null;
    audioRef.current?.pause();
  }, []);

  const selected = useMemo(
    () => tracks.find((t) => t.id === selectedId) ?? tracks[tracks.length - 1] ?? null,
    [tracks, selectedId],
  );
  const selectedAudioUrl = selected?.audio?.url;
  useLayoutEffect(() => {
    // 주소 반영을 한 경로로 모아 호스트 재렌더가 준비 중인 재생을 다시 로드하지 않게 한다.
    const audio = audioRef.current;
    if (audio && selectedAudioUrl) syncVoiceAudioSource(audio, selectedAudioUrl);
  }, [selectedAudioUrl]);

  const isCurrentAttempt = useCallback((attempt: RecordingAttempt): boolean => (
    mountedRef.current && !attempt.settled && attemptRef.current === attempt
    && generationRef.current === attempt.generation && getAuthUserId() === attempt.authUserId
  ), []);

  useLayoutEffect(() => { captureViewRef.current = captureView; }, [captureView]);

  // 커밋한 소유자 변경 때 즉시 무효화한다. A→B→A 뒤에도 옛 권한 응답은 되살아나지 않는다.
  useLayoutEffect(() => {
    mountedRef.current = true;
    setRecorder({ kind: "idle" });
    setElapsedMs(0);
    return () => {
      mountedRef.current = false;
      cancelPlayback();
      generationRef.current += 1;
      const attempt = attemptRef.current;
      attemptRef.current = null;
      // 폐기 중 stop 예외의 반환값과 무관하게 finally에서 소유 stream을 닫는다.
      if (attempt) discardRecordingAttempt(attempt);
    };
  }, [episodeId, authorId, readOnly, cancelPlayback]);

  // React 렌더가 A→B→A를 한 번으로 묶어도 실제 UID publication의 소유자 변경은 놓치지 않는다.
  useLayoutEffect(() => {
    let publishedUserId = getAuthUserId();
    const published = (next: Session) => {
      const nextUserId = next?.user.id ?? null;
      // 같은 계정의 프로필·세션 갱신은 녹음 소유자를 바꾸지 않는다.
      if (nextUserId === publishedUserId) return;
      publishedUserId = nextUserId;
      cancelPlayback();
      generationRef.current += 1;
      const attempt = attemptRef.current;
      attemptRef.current = null;
      if (attempt) discardRecordingAttempt(attempt);
      if (mountedRef.current) {
        setRecorder({ kind: "idle" });
        setElapsedMs(0);
        setPlaying(false);
        setPreparingPlayback(false);
      }
    };
    listeners.add(published);
    return () => { listeners.delete(published); };
  }, [cancelPlayback]);

  useLayoutEffect(() => {
    cancelPlayback();
    setPlaying(false);
    setPreparingPlayback(false);
    setPlaybackError(null);
    setPlayheadMs(0);
    playheadRef.current = 0;
    pausedCueRef.current = false;
    lastKeyframeRef.current = -1;
    lastAppliedRef.current = "";
    return cancelPlayback;
  }, [selected?.id, cancelPlayback]);

  // 녹화 중: 500ms마다 현재 화면을 샘플링해 키프레임을 찍고, 경과 시간을 표시한다.
  useEffect(() => {
    if (recorder.kind !== "recording") return;
    const timer = window.setInterval(() => {
      const attempt = attemptRef.current;
      if (!attempt || !attempt.session || attempt.startedAtMs === null || attempt.finalization || attempt.observedStop) return;
      if (!isCurrentAttempt(attempt)) {
        discardRecordingAttempt(attempt);
        if (attemptRef.current === attempt) attemptRef.current = null;
        setRecorder({ kind: "idle" });
        return;
      }
      const elapsed = Date.now() - attempt.startedAtMs;
      setElapsedMs(elapsed);
      const capture = readVoiceCapture(captureView);
      if (capture) {
        attempt.session = recordVoiceKeyframe(attempt.session, elapsed, capture.view, capture.pinThreadIds);
      }
    }, 500);
    return () => window.clearInterval(timer);
  }, [recorder, captureView, isCurrentAttempt]);

  const applyCue = (track: VoiceCommentaryTrack, atMs: number, force: boolean) => {
    const cue = voicePlaybackCueAt(track, atMs);
    setActivePins(cue.pinThreadIds);
    if (!cue.view || !onApplyView) return;
    const key = JSON.stringify(cue.view);
    if (force || cue.keyframeIndex !== lastKeyframeRef.current || key !== lastAppliedRef.current) {
      lastKeyframeRef.current = cue.keyframeIndex;
      lastAppliedRef.current = key;
      onApplyView(cue.view, cue.pinThreadIds);
    }
  };

  const failRecording = (attempt: RecordingAttempt) => {
    const current = isCurrentAttempt(attempt);
    discardRecordingAttempt(attempt);
    if (attemptRef.current !== attempt) return;
    attemptRef.current = null;
    if (!mountedRef.current) return;
    setRecorder(current
      ? { kind: "error", message: t("productionHub.status.voiceRecordingFailed", "녹음을 마치지 못했어요. 마이크 상태를 확인한 뒤 다시 녹화해 주세요.") }
      : { kind: "idle" });
  };

  const finalizeRecording = (attempt: RecordingAttempt) => {
    const finalization = attempt.finalization;
    if (!isCurrentAttempt(attempt) || !finalization) return;
    stopAttemptStream(attempt);
    let blob: Blob | null;
    let finishedTrack: VoiceCommentaryTrack;
    let blobUrl: string | null = null;
    try {
      // stop()의 마지막 dataavailable 뒤에 전체 chunk를 합친다. 종료 경계의 형식도 보존한다.
      const mimeType = finalization.mimeType || attempt.chunks.find((chunk) => chunk.type)?.type || null;
      blob = attempt.chunks.length > 0
        ? new Blob(attempt.chunks, mimeType ? { type: mimeType } : undefined)
        : null;
      if (blob) blobUrl = URL.createObjectURL(blob);
      finishedTrack = finishVoiceRecording({
        session: finalization.session,
        id: `voice-${globalThis.crypto?.randomUUID?.() ?? `${finalization.endedAtMs.toString(36)}-${Math.random().toString(36).slice(2)}`}`,
        authorId: finalization.authorId,
        authorName: finalization.authorName,
        durationMs: finalization.durationMs,
        audio: blob && blobUrl
          ? { kind: "blob", url: blobUrl, mimeType, byteSize: blob.size }
          : null,
      });
    } catch {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      failRecording(attempt);
      return;
    }
    attempt.settled = true;
    attempt.chunks = [];
    detachAttemptEvents(attempt);
    attemptRef.current = null;
    // 상한 초과도 기존 저장 hook으로 전달해 이 탭의 세션 보관을 유지한다.
    if (blob && voiceCommentaryAudioSizeProblem(blob.size) === "too-large") {
      setRecorder({
        kind: "error",
        message: t("productionHub.status.voiceRecordingTooLarge", { mb: Math.round(VOICE_COMMENTARY_MAX_AUDIO_BYTES / (1024 * 1024)) }, "녹음이 저장 상한({mb}MB)을 넘어 서버에 저장·공유할 수 없어요. 더 짧게 나눠 녹화해 주세요. 방금 녹음은 이 탭에서만 들을 수 있어요."),
      });
    } else {
      setRecorder({ kind: "idle" });
    }
    if (!finalization.onSaveTrack) {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      setRecorder({ kind: "error", message: t("productionHub.status.voiceRecordingFailed", "녹음을 마치지 못했어요. 마이크 상태를 확인한 뒤 다시 녹화해 주세요.") });
      return;
    }
    // callback이 정상 반환하면 호스트가 탭 보관본과 URL의 수명을 인수한다.
    try { finalization.onSaveTrack(finishedTrack, blob); }
    catch {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      setRecorder({ kind: "error", message: t("productionHub.status.voiceRecordingFailed", "녹음을 마치지 못했어요. 마이크 상태를 확인한 뒤 다시 녹화해 주세요.") });
      return;
    }
    setSelectedId(finishedTrack.id);
  };

  const startRecording = async () => {
    if (readOnly || !mountedRef.current || attemptRef.current) return;
    if (!recorderSupported()) {
      setRecorder({ kind: "unsupported", reason: t("productionHub.status.voiceRecordingUnsupported", "이 브라우저에서는 음성 녹음을 지원하지 않아 해설을 녹화할 수 없어요. 핀으로 남겨 주세요.") });
      return;
    }
    const capture = readVoiceCapture(captureView);
    if (!capture) {
      setRecorder({ kind: "error", message: t("productionHub.status.voiceCaptureStateFailed", "현재 화면 상태를 읽지 못해 녹화를 시작할 수 없어요. 화면을 새로고침한 뒤 다시 시도해 주세요.") });
      return;
    }
    const attempt: RecordingAttempt = {
      generation: generationRef.current,
      authUserId: getAuthUserId(),
      stream: null,
      mediaRecorder: null,
      chunks: [],
      session: null,
      startedAtMs: null,
      mimeType: null,
      observedStop: null,
      finalization: null,
      settled: false,
    };
    attemptRef.current = attempt;
    setRecorder({ kind: "starting" });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!isCurrentAttempt(attempt)) {
        stream.getTracks().forEach((track) => track.stop());
        if (attemptRef.current === attempt) {
          attemptRef.current = null;
          if (mountedRef.current) setRecorder({ kind: "idle" });
        }
        return;
      }
      attempt.stream = stream;
      // 권한 대기 중 이동한 화면을 이전 위치로 기록하지 않는다.
      const initialCapture = readVoiceCapture(captureViewRef.current);
      if (!initialCapture) {
        discardRecordingAttempt(attempt);
        attemptRef.current = null;
        setRecorder({ kind: "error", message: t("productionHub.status.voiceCaptureStateFailed", "현재 화면 상태를 읽지 못해 녹화를 시작할 수 없어요. 화면을 새로고침한 뒤 다시 시도해 주세요.") });
        return;
      }
      const mr = new MediaRecorder(stream);
      attempt.mediaRecorder = mr;
      attempt.mimeType = mr.mimeType || null;
      mr.onstart = () => {
        if (isCurrentAttempt(attempt)) attempt.mimeType = mr.mimeType || attempt.mimeType;
      };
      mr.ondataavailable = (event) => {
        if (!isCurrentAttempt(attempt) || attempt.observedStop) return;
        attempt.mimeType = mr.mimeType || attempt.mimeType || event.data.type || null;
        if (event.data.size > 0) attempt.chunks.push(event.data);
      };
      mr.onerror = () => failRecording(attempt);
      mr.onstop = () => {
        stopAttemptStream(attempt);
        const finalization = attempt.finalization;
        if (!isCurrentAttempt(attempt)) {
          discardRecordingAttempt(attempt);
          if (attemptRef.current === attempt) {
            attemptRef.current = null;
            if (mountedRef.current) setRecorder({ kind: "idle" });
          }
          return;
        }
        if (finalization) {
          finalizeRecording(attempt);
          return;
        }
        // 입력이 자연 종료되어도 자동 저장하지 않는다. 관측한 종료 경계와 전체 음성을 명시 보관까지 유지한다.
        if (attempt.observedStop) return;
        if (!attempt.session || attempt.startedAtMs === null) {
          failRecording(attempt);
          return;
        }
        try {
          const endedAtMs = Date.now();
          const durationMs = endedAtMs - attempt.startedAtMs;
          const finalCapture = readVoiceCapture(captureViewRef.current);
          attempt.observedStop = {
            session: finalCapture
              ? recordVoiceKeyframe(attempt.session, durationMs, finalCapture.view, finalCapture.pinThreadIds)
              : attempt.session,
            durationMs,
            endedAtMs,
            mimeType: attempt.mimeType || attempt.chunks.find((chunk) => chunk.type)?.type || null,
          };
          setElapsedMs(durationMs);
          setRecorder({ kind: "ended" });
        } catch {
          failRecording(attempt);
        }
      };
      const startedAtMs = Date.now();
      attempt.session = startVoiceRecording({
        episodeId,
        startedAt: new Date(startedAtMs).toISOString(),
        initialView: initialCapture.view,
        initialPinThreadIds: initialCapture.pinThreadIds,
      });
      attempt.startedAtMs = startedAtMs;
      mr.start(500);
      attempt.mimeType = mr.mimeType || attempt.mimeType;
      // 동기 start 오류/이벤트가 시도를 폐기했으면 녹화 상태를 되살리지 않는다.
      if (!isCurrentAttempt(attempt)) return;
      setElapsedMs(0);
      setRecorder({ kind: "recording", startedAtMs });
    } catch {
      const current = isCurrentAttempt(attempt);
      discardRecordingAttempt(attempt);
      if (attemptRef.current !== attempt) return;
      attemptRef.current = null;
      if (!mountedRef.current) return;
      setRecorder(current
        ? { kind: "error", message: t("productionHub.status.voiceMicPermissionFailed", "마이크 권한을 얻지 못해 녹화를 시작하지 못했어요. 브라우저 권한을 확인해 주세요.") }
        : { kind: "idle" });
    }
  };

  const stopRecording = () => {
    const attempt = attemptRef.current;
    if (!attempt || !isCurrentAttempt(attempt) || !attempt.session || attempt.startedAtMs === null
      || !attempt.mediaRecorder || attempt.finalization
      || (recorder.kind !== "recording" && recorder.kind !== "ended")) return;
    let boundary = attempt.observedStop;
    if (!boundary) {
      const endedAtMs = Date.now();
      const durationMs = endedAtMs - attempt.startedAtMs;
      const capture = readVoiceCapture(captureView);
      boundary = {
        session: capture
          ? recordVoiceKeyframe(attempt.session, durationMs, capture.view, capture.pinThreadIds)
          : attempt.session,
        durationMs,
        endedAtMs,
        mimeType: attempt.mediaRecorder.mimeType || attempt.mimeType,
      };
    }
    attempt.finalization = {
      ...boundary,
      authorId,
      authorName,
      onSaveTrack,
    };
    setElapsedMs(boundary.durationMs);
    setRecorder({ kind: "stopping" });
    if (attempt.observedStop) {
      finalizeRecording(attempt);
      return;
    }
    try {
      // 이미 비활성화된 recorder도 큐에 있는 마지막 dataavailable/stop은 그대로 기다린다.
      if (attempt.mediaRecorder.state !== "inactive") attempt.mediaRecorder.stop();
    } catch {
      failRecording(attempt);
    }
  };

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!selected) return;
    if (!audio || !selected.audio) {
      // 오디오 참조가 없는 트랙(서버 저장 전 등)도 키프레임 이동만으로 해설 순서를 따라갈 수 있게 첫 위치로 이동한다.
      applyCue(selected, 0, true);
      return;
    }
    if (playing) {
      cancelPlayback();
      audio.pause();
      setPlaying(false);
      return;
    }
    if (playbackRef.current) return;
    const controller = new AbortController();
    playbackRef.current = controller;
    playbackAudioRef.current = null;
    setPreparingPlayback(true);
    setPlaybackError(null);
    try {
      const playable = selected.audio.kind === "server" && onPreparePlayback
        ? await onPreparePlayback(selected, controller.signal)
        : selected;
      if (controller.signal.aborted || playbackRef.current !== controller || !mountedRef.current) return;
      if (playable.id !== selected.id || playable.episodeId !== episodeId || !playable.audio) {
        throw new Error("voice_playback_source_changed");
      }
      // 호스트의 다음 렌더를 기다리지 않고 권한을 확인한 새 주소로 재생한다.
      syncVoiceAudioSource(audio, playable.audio.url);
      playbackAudioRef.current = playable.audio.url;
      audio.currentTime = playheadRef.current / 1000;
      await audio.play();
      if (controller.signal.aborted || playbackRef.current !== controller || !mountedRef.current) return;
      setPlaying(true);
      setPlaybackError(null);
      applyCue(playable, playheadRef.current, true);
    } catch {
      if (controller.signal.aborted || playbackRef.current !== controller || !mountedRef.current) return;
      setPlaying(false);
      setPlaybackError(t("productionHub.status.voicePlaybackFailed", "해설을 재생하지 못했어요. 접근 권한과 연결을 확인한 뒤 다시 재생해 주세요."));
    } finally {
      if (playbackRef.current === controller) {
        playbackRef.current = null;
        if (mountedRef.current) setPreparingPlayback(false);
      }
    }
  };

  const onSeek = (valueMs: number) => {
    pausedCueRef.current = audioRef.current?.paused ?? true;
    playheadRef.current = valueMs;
    setPlayheadMs(valueMs);
    if (audioRef.current) audioRef.current.currentTime = valueMs / 1000;
    if (selected) applyCue(selected, valueMs, true);
  };

  return (
    <section aria-label={t("productionHub.voice.sectionLabel", "비동기 검수 해설")} style={{ display: "grid", gap: 12 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Mic size={16} aria-hidden />
        <strong>{t("productionHub.voice.title", "음성 해설")}</strong>
        <span style={{ opacity: 0.7, fontSize: 12 }}>{t("productionHub.voice.guide", "화면을 이동하며 말로 남기면, 재생할 때 기록한 화면 위치로 이동합니다.")}</span>
      </header>

      <p style={{ fontSize: 12, opacity: 0.7, margin: 0 }}>
        {t("productionHub.voice.storagePolicy", {
          mb: Math.round(VOICE_COMMENTARY_MAX_AUDIO_BYTES / (1024 * 1024)),
          defaultDays: VOICE_COMMENTARY_DEFAULT_RETENTION_DAYS,
          maxDays: VOICE_COMMENTARY_MAX_RETENTION_DAYS,
        }, "해설 음성은 1건 최대 {mb}MB, 서버 보관 기본 {defaultDays}일·최대 {maxDays}일입니다. 서버 저장에 실패한 녹음은 이 탭에서만 들을 수 있고 새로고침하면 사라집니다.")}
      </p>

      {loading ? <p role="status">{t("productionHub.status.loadingCommentary", "해설을 불러오는 중…")}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {playbackError ? <p role="alert">{playbackError}</p> : null}
      {preparingPlayback ? <p role="status">{t("productionHub.status.voicePlaybackPreparing", "음성 접근 권한과 재생 주소를 확인하는 중…")}</p> : null}
      {recorder.kind === "unsupported" ? <p role="alert">{recorder.reason}</p> : null}
      {recorder.kind === "error" ? <p role="alert">{recorder.message}</p> : null}

      {!readOnly ? (
        recorder.kind === "recording" || recorder.kind === "ended" ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button type="button" onClick={stopRecording}>
              <Square size={14} aria-hidden /> {t("productionHub.voice.recordStop", { elapsed: formatVoiceTime(elapsedMs) }, "녹화 종료 ({elapsed})")}
            </button>
            <span aria-live="polite">{recorder.kind === "ended"
              ? t("productionHub.status.voiceRecordingEnded", "마이크 입력이 종료되었어요. 녹화 종료를 누르면 방금 녹음을 보관해요.")
              : t("productionHub.voice.recording", "녹화 중 — 비교·원고 화면을 이동하면 그 위치가 해설에 함께 기록됩니다.")}</span>
          </div>
        ) : (
          <div>
            <button type="button" onClick={() => void startRecording()}
              disabled={!captureView || recorder.kind === "starting" || recorder.kind === "stopping"}>
              <Mic size={14} aria-hidden /> {t("productionHub.voice.recordStart", "해설 녹화 시작")}
            </button>
            {recorder.kind === "starting" ? <p role="status">{t("productionHub.status.voiceRecordingStarting", "마이크 권한 확인 중…")}</p> : null}
            {recorder.kind === "stopping" ? <p role="status">{t("productionHub.status.voiceRecordingStopping", "녹음을 마무리하는 중…")}</p> : null}
            {!captureView ? <p style={{ fontSize: 12, opacity: 0.7 }}>{t("productionHub.status.voiceCaptureUnavailable", "이 표면에서는 아직 화면 위치 기록을 연결하지 않아 녹화를 시작할 수 없어요. 핀은 종전대로 남길 수 있어요.")}</p> : null}
          </div>
        )
      ) : null}

      {tracks.length === 0 && !loading ? (
        <p>{t("productionHub.status.noVoiceCommentary", "아직 음성 해설이 없어요. 해설이 없어도 핀 검수는 종전대로 동작해요.")}</p>
      ) : null}

      {tracks.length > 0 ? (
        <ul style={{ display: "grid", gap: 6, listStyle: "none", margin: 0, padding: 0 }}>
          {tracks.map((track) => (
            <li key={track.id}>
              <button
                type="button"
                aria-pressed={selected?.id === track.id}
                onClick={() => {
                  cancelPlayback();
                  setSelectedId(track.id);
                  setPlayheadMs(0);
                  playheadRef.current = 0;
                  setPlaying(false);
                  setPreparingPlayback(false);
                  setPlaybackError(null);
                  if (audioRef.current) audioRef.current.currentTime = 0;
                  lastKeyframeRef.current = -1;
                  applyCue(track, 0, true);
                }}
              >
                {t("productionHub.voice.trackSummary", { author: track.authorName, duration: formatVoiceTime(track.durationMs), count: track.keyframes.length }, "{author} · {duration} · 위치 {count}곳")}
                {track.pinThreadIds.length > 0 ? ` · ${t("productionHub.voice.pinCount", { count: track.pinThreadIds.length }, "핀 {count}개")}` : ""}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {selected ? (
        <div style={{ display: "grid", gap: 8 }}>
          {selected.audio ? (
            <audio
              ref={audioRef}
              preload="none"
              onTimeUpdate={(event) => {
                // 정지 중 선택한 큐는 오디오 seek 보정으로 다른 화면에 되돌리지 않는다.
                if (pausedCueRef.current && event.currentTarget.paused) return;
                const ms = event.currentTarget.currentTime * 1000;
                playheadRef.current = ms;
                setPlayheadMs(ms);
                applyCue(selected, ms, false);
              }}
              onEnded={() => setPlaying(false)}
              onPause={() => setPlaying(false)}
              onPlay={() => { pausedCueRef.current = false; setPlaying(true); }}
              onError={() => {
                // 새 읽기 응답을 기다리는 동안 이전 주소의 실패로 새 요청을 취소하지 않는다.
                if (playbackRef.current && playbackAudioRef.current === null) return;
                cancelPlayback();
                setPreparingPlayback(false);
                setPlaying(false);
                setPlaybackError(t("productionHub.status.voicePlaybackFailed", "해설을 재생하지 못했어요. 접근 권한과 연결을 확인한 뒤 다시 재생해 주세요."));
              }}
            >
              <track
                kind="captions"
                src={commentaryCaptionTrack(t("productionHub.voice.captionSummary", { author: selected.authorName }, "{author} · 음성 해설"), selected.durationMs)}
                srcLang={language}
                label={t("productionHub.voice.captionLabel", "해설 정보")}
                default
              />
            </audio>
          ) : (
            <p style={{ fontSize: 12, opacity: 0.7 }}>{t("productionHub.status.voiceNotStored", "이 해설의 음성은 아직 서버에 저장되지 않아 재생할 수 없어요. 위치 기록은 아래 목록으로 확인할 수 있어요.")}</p>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* 오디오가 없어도 버튼은 살아 있어야 한다 — togglePlay가 첫 키프레임
                위치로 이동시켜 위치 기록만으로도 해설 순서를 따라갈 수 있다. */}
            <button type="button" onClick={() => void togglePlay()} disabled={preparingPlayback} aria-busy={preparingPlayback}>
              {playing ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />}
              {playing ? t("productionHub.voice.pause", "일시정지") : selected.audio ? t("productionHub.voice.listen", "해설 듣기") : t("productionHub.voice.followPositions", "위치 따라가기")}
            </button>
            <span>
              {formatVoiceTime(playheadMs)} / {formatVoiceTime(selected.durationMs)}
            </span>
          </div>
          <input
            type="range"
            aria-label={t("productionHub.voice.seekLabel", "해설 재생 위치")}
            min={0}
            max={Math.max(0, selected.durationMs)}
            step={100}
            value={Math.min(playheadMs, selected.durationMs)}
            onChange={(event) => onSeek(Number(event.currentTarget.value))}
          />
          <ol style={{ display: "grid", gap: 4, listStyle: "none", margin: 0, padding: 0 }}>
            {selected.keyframes.map((kf, index) => (
              <li key={`${kf.atMs}-${index}`}>
                <button type="button" onClick={() => onSeek(kf.atMs)}>
                  <MapPin size={12} aria-hidden /> {formatVoiceTime(kf.atMs)} —{" "}
                  {kf.view.surface === "compare" ? t("productionHub.voice.compareSurface", "비교 화면") : t("productionHub.voice.manuscriptSurface", "원고 화면")}
                  {kf.view.poolItemId ? ` · ${kf.view.poolItemId}` : ""}
                  {kf.view.pageId ? ` · ${kf.view.pageId}` : ""} · {t("productionHub.voice.scale", { scale: kf.view.scale.toFixed(2) }, "{scale}배")}
                </button>
                {kf.pinThreadIds.map((threadId) => (
                  <button key={threadId} type="button" onClick={() => onOpenPin?.(threadId)}>
                    {t("productionHub.voice.openPin", "핀 열기")}
                  </button>
                ))}
              </li>
            ))}
          </ol>
          {activePins.length > 0 ? (
            <p aria-live="polite">
              {t("productionHub.voice.activePins", { count: activePins.length }, "지금 해설이 가리키는 핀 {count}개")}
              {onOpenPin
                ? activePins.map((threadId) => (
                    <button key={threadId} type="button" onClick={() => onOpenPin(threadId)}>
                      {t("productionHub.voice.openPin", "핀 열기")}
                    </button>
                  ))
                : null}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
