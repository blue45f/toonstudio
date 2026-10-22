import { useT } from "@/shared/lib/i18n";
import { MapPin, Mic, Pause, Play, Square } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

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
  /** 재생·탐색 시 해당 위치로 자동 이동 — 호스트가 비교/원고 화면에 view를 적용한다. */
  readonly onApplyView?: (view: VoiceViewSnapshot, pinThreadIds: readonly string[]) => void;
  readonly onOpenPin?: (threadId: string) => void;
}

type RecorderState =
  | { readonly kind: "idle" }
  | { readonly kind: "recording"; readonly startedAtMs: number }
  | { readonly kind: "unsupported"; readonly reason: string }
  | { readonly kind: "error"; readonly message: string };

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
  onApplyView,
  onOpenPin,
}: ReviewVoiceCommentaryPanelProps) {
  const t = useT();
  const [recorder, setRecorder] = useState<RecorderState>({ kind: "idle" });
  const [elapsedMs, setElapsedMs] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playheadMs, setPlayheadMs] = useState(0);
  const [activePins, setActivePins] = useState<readonly string[]>([]);

  const sessionRef = useRef<VoiceRecordingSession | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastAppliedRef = useRef<string>("");
  const lastKeyframeRef = useRef<number>(-1);

  const selected = useMemo(
    () => tracks.find((t) => t.id === selectedId) ?? tracks[tracks.length - 1] ?? null,
    [tracks, selectedId],
  );

  // 녹화 중: 500ms마다 현재 화면을 샘플링해 키프레임을 찍고, 경과 시간을 표시한다.
  useEffect(() => {
    if (recorder.kind !== "recording") return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setElapsedMs(now - recorder.startedAtMs);
      const session = sessionRef.current;
      const capture = captureView?.();
      if (session && capture) {
        sessionRef.current = recordVoiceKeyframe(session, now - recorder.startedAtMs, capture.view, capture.pinThreadIds);
      }
    }, 500);
    return () => window.clearInterval(timer);
  }, [recorder, captureView]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

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

  const startRecording = async () => {
    if (!recorderSupported()) {
      setRecorder({ kind: "unsupported", reason: t("productionHub.status.voiceRecordingUnsupported", "이 브라우저에서는 음성 녹음을 지원하지 않아 해설을 녹화할 수 없어요. 핀으로 남겨 주세요.") });
      return;
    }
    const capture = captureView?.();
    if (!capture) {
      setRecorder({ kind: "error", message: t("productionHub.status.voiceCaptureStateFailed", "현재 화면 상태를 읽지 못해 녹화를 시작할 수 없어요. 화면을 새로고침한 뒤 다시 시도해 주세요.") });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      mr.onstop = () => {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      };
      sessionRef.current = startVoiceRecording({
        episodeId,
        startedAt: new Date().toISOString(),
        initialView: capture.view,
        initialPinThreadIds: capture.pinThreadIds,
      });
      mediaRecorderRef.current = mr;
      mr.start(500);
      setElapsedMs(0);
      setRecorder({ kind: "recording", startedAtMs: Date.now() });
    } catch {
      setRecorder({ kind: "error", message: t("productionHub.status.voiceMicPermissionFailed", "마이크 권한을 얻지 못해 녹화를 시작하지 못했어요. 브라우저 권한을 확인해 주세요.") });
    }
  };

  const stopRecording = () => {
    const session = sessionRef.current;
    const mr = mediaRecorderRef.current;
    if (!session || recorder.kind !== "recording") return;
    const durationMs = Date.now() - recorder.startedAtMs;
    const capture = captureView?.();
    const finalSession = capture
      ? recordVoiceKeyframe(session, durationMs, capture.view, capture.pinThreadIds)
      : session;
    const mimeType = mr?.mimeType ?? null;
    mr?.stop();
    mediaRecorderRef.current = null;
    sessionRef.current = null;
    const blob = chunksRef.current.length > 0 ? new Blob(chunksRef.current, mimeType ? { type: mimeType } : undefined) : null;
    // 저장 상한(정책 상수)을 넘긴 녹음은 서버가 거부해 공유할 수 없다 — 조용히
    // 세션 폴백으로만 남기지 않고, 나눠 녹화해야 한다는 것을 그 자리에서 알린다.
    // 이 탭 안에서는 세션 보관으로 그대로 들을 수 있다.
    if (blob && voiceCommentaryAudioSizeProblem(blob.size) === "too-large") {
      setRecorder({
        kind: "error",
        message: t("productionHub.status.voiceRecordingTooLarge", { mb: Math.round(VOICE_COMMENTARY_MAX_AUDIO_BYTES / (1024 * 1024)) }, "녹음이 저장 상한({mb}MB)을 넘어 서버에 저장·공유할 수 없습니다. 더 짧게 나눠 녹화해 주세요. 방금 녹음은 이 탭에서만 들을 수 있습니다."),
      });
    } else {
      setRecorder({ kind: "idle" });
    }
    const track = finishVoiceRecording({
      session: finalSession,
      id: `voice-${episodeId}-${Date.now()}`,
      authorId,
      authorName,
      durationMs,
      audio: blob
        ? { kind: "blob", url: URL.createObjectURL(blob), mimeType, byteSize: blob.size }
        : null,
    });
    onSaveTrack?.(track, blob);
    setSelectedId(track.id);
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!selected) return;
    if (!audio || !selected.audio) {
      // 오디오 참조가 없는 트랙(서버 저장 전 등)도 키프레임 이동만으로 해설 순서를 따라갈 수 있게 첫 위치로 이동한다.
      applyCue(selected, 0, true);
      return;
    }
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      void audio.play();
      setPlaying(true);
      applyCue(selected, playheadMs, true);
    }
  };

  const onSeek = (valueMs: number) => {
    setPlayheadMs(valueMs);
    if (audioRef.current) audioRef.current.currentTime = valueMs / 1000;
    if (selected) applyCue(selected, valueMs, true);
  };

  return (
    <section aria-label="비동기 검수 해설" style={{ display: "grid", gap: 12 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Mic size={16} aria-hidden />
        <strong>음성 해설</strong>
        <span style={{ opacity: 0.7, fontSize: 12 }}>화면을 이동하며 말로 남기면, 듣는 쪽 화면이 그 위치로 따라갑니다.</span>
      </header>

      <p style={{ fontSize: 12, opacity: 0.7, margin: 0 }}>
        저장 정책: 해설 음성은 1건 최대 {Math.round(VOICE_COMMENTARY_MAX_AUDIO_BYTES / (1024 * 1024))}MB,
        서버 보관 기본 {VOICE_COMMENTARY_DEFAULT_RETENTION_DAYS}일·최대 {VOICE_COMMENTARY_MAX_RETENTION_DAYS}일입니다.
        기존 서버 저장소에만 보관하고 외부 유료 저장소는 쓰지 않습니다.
        서버 저장에 실패한 녹음은 이 탭에서만 들을 수 있고 새로고침하면 사라집니다.
      </p>

      {loading ? <p role="status">{t("productionHub.status.loadingCommentary", "해설을 불러오는 중…")}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {recorder.kind === "unsupported" ? <p role="alert">{recorder.reason}</p> : null}
      {recorder.kind === "error" ? <p role="alert">{recorder.message}</p> : null}

      {!readOnly ? (
        recorder.kind === "recording" ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button type="button" onClick={stopRecording}>
              <Square size={14} aria-hidden /> 녹화 종료 ({formatVoiceTime(elapsedMs)})
            </button>
            <span aria-live="polite">녹화 중 — 비교·원고 화면을 이동하면 그 위치가 해설에 함께 기록됩니다.</span>
          </div>
        ) : (
          <div>
            <button type="button" onClick={() => void startRecording()} disabled={!captureView}>
              <Mic size={14} aria-hidden /> 해설 녹화 시작
            </button>
            {!captureView ? <p style={{ fontSize: 12, opacity: 0.7 }}>{t("productionHub.status.voiceCaptureUnavailable", "이 표면에서는 아직 화면 위치 기록을 연결하지 않아 녹화를 시작할 수 없습니다. 핀은 종전대로 남길 수 있습니다.")}</p> : null}
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
                  setSelectedId(track.id);
                  setPlayheadMs(0);
                  setPlaying(false);
                  lastKeyframeRef.current = -1;
                  applyCue(track, 0, true);
                }}
              >
                {track.authorName} · {formatVoiceTime(track.durationMs)} · 위치 {track.keyframes.length}곳
                {track.pinThreadIds.length > 0 ? ` · 핀 ${track.pinThreadIds.length}개` : ""}
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
              src={selected.audio.url}
              onTimeUpdate={(event) => {
                const ms = event.currentTarget.currentTime * 1000;
                setPlayheadMs(ms);
                applyCue(selected, ms, false);
              }}
              onEnded={() => setPlaying(false)}
              onPause={() => setPlaying(false)}
              onPlay={() => setPlaying(true)}
            >
              <track
                kind="captions"
                src={commentaryCaptionTrack(`${selected.authorName} · 음성 해설`, selected.durationMs)}
                srcLang="ko"
                label="해설 정보"
                default
              />
            </audio>
          ) : (
            <p style={{ fontSize: 12, opacity: 0.7 }}>{t("productionHub.status.voiceNotStored", "이 해설의 음성은 아직 서버에 저장되지 않아 재생할 수 없습니다. 위치 기록은 아래 목록으로 확인할 수 있습니다.")}</p>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* 오디오가 없어도 버튼은 살아 있어야 한다 — togglePlay가 첫 키프레임
                위치로 이동시켜 위치 기록만으로도 해설 순서를 따라갈 수 있다. */}
            <button type="button" onClick={togglePlay}>
              {playing ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />}
              {playing ? "일시정지" : selected.audio ? "해설 듣기" : "위치 따라가기"}
            </button>
            <span>
              {formatVoiceTime(playheadMs)} / {formatVoiceTime(selected.durationMs)}
            </span>
          </div>
          <input
            type="range"
            aria-label="해설 재생 위치"
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
                  {kf.view.surface === "compare" ? "비교 화면" : "원고 화면"}
                  {kf.view.poolItemId ? ` · ${kf.view.poolItemId}` : ""}
                  {kf.view.pageId ? ` · ${kf.view.pageId}` : ""} · {kf.view.scale.toFixed(2)}배
                </button>
                {kf.pinThreadIds.map((threadId) => (
                  <button key={threadId} type="button" onClick={() => onOpenPin?.(threadId)}>
                    핀 열기
                  </button>
                ))}
              </li>
            ))}
          </ol>
          {activePins.length > 0 ? (
            <p aria-live="polite">
              지금 해설이 가리키는 핀 {activePins.length}개
              {onOpenPin
                ? activePins.map((threadId) => (
                    <button key={threadId} type="button" onClick={() => onOpenPin(threadId)}>
                      핀 열기
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
