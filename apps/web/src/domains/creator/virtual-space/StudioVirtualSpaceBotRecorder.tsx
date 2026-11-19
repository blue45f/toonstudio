import { useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { readStudioLiveRoomQuery } from "../live/studio-live-jam-session";
import { useSession } from "@/domains/auth/public/session/auth-session-store";
import { downloadBlob } from "../export/studio-export";
import { startWorkspaceVideoCapture, type WorkspaceVideoCapture, type WorkspaceVideoSource } from "./studio-workspace-video-capture";
import { listWorkspaceVideos, readWorkspaceVideo, removeWorkspaceVideo, saveWorkspaceVideo } from "./studio-workspace-video-library";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import {
  createBotRecorder,
  formatBotRecordingDuration,
  pauseBotRecording,
  resumeBotRecording,
  startBotRecording,
  stopBotRecording,
  type StudioBotRecording,
  type StudioBotRecordingQuality,
  type StudioBotRecordingState,
  type StudioBotRecordingZone,
} from "./studio-virtual-space-bot-recording";

interface RecorderProps {
  readonly zones: readonly StudioBotRecordingZone[];
  readonly defaultZoneId?: string | null;
  readonly onAssetize?: ((recording: StudioBotRecording) => void) | null;
}

export function StudioVirtualSpaceBotRecorder(props: RecorderProps) {
  const actor = useSession().data?.user?.id ?? null;
  const { workId } = useParams();
  const room = readStudioLiveRoomQuery(useLocation().search);
  const scope = JSON.stringify([actor, workId ?? room]);
  return <WorkspaceRecorder key={scope} {...props} scope={scope} />;
}

function WorkspaceRecorder({ zones, defaultZoneId, onAssetize, scope }: RecorderProps & { readonly scope: string }) {
  const bt = useBilingual("StudioVirtualSpaceBotRecorder");
  const initialZone = zones.find((zone) => zone.id === defaultZoneId) ?? zones[0];
  const [zoneId, setZoneId] = useState(initialZone?.id ?? "");
  const [quality, setQuality] = useState<StudioBotRecordingQuality>("medium");
  const [participants, setParticipants] = useState("0");
  const [recorder, setRecorder] = useState<StudioBotRecordingState | null>(() =>
    initialZone ? createBotRecorder({ zoneId: initialZone.id, zoneName: initialZone.name, quality: "medium" }) : null,
  );
  const [recordings, setRecordings] = useState<readonly StudioBotRecording[]>([]);

  const [source, setSource] = useState<WorkspaceVideoSource>("canvas");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const active = useRef<WorkspaceVideoCapture | null>(null);
  const pending = useRef(false);
  const mounted = useRef(false);
  const state = useRef(recorder);
  const unsaved = useRef(new Map<string, Blob>());
  const idle = !busy && (!recorder || recorder.status === "idle");

  useEffect(() => {
    mounted.current = true;
    let live = true;
    void listWorkspaceVideos(scope, () => {
      if (live) setNotice(bt("이전 녹화 목록을 열지 못했습니다. 녹화 탭을 다시 열어 주세요.", "Could not open older recordings. Reopen the recording tab to try again."));
    }).then(items => {
      if (live) setRecordings(current => {
        const existing = new Set(current.map(item => item.id));
        return [...current, ...items.map(entry => entry.recording).filter(item => !existing.has(item.id))];
      });
    }).catch(() => { if (live) setNotice(bt("이 기기의 녹화 목록을 열지 못했습니다.", "Could not open the recordings on this device.")); });
    return () => { live = false; mounted.current = false; active.current?.stop(); };
  }, [bt, scope]);

  const handleZoneChange = (nextZoneId: string) => {
    const zone = zones.find((candidate) => candidate.id === nextZoneId);
    if (!zone) return;
    setZoneId(zone.id);
    setRecorder(createBotRecorder({ zoneId: zone.id, zoneName: zone.name, quality }));
  };

  const handleQualityChange = (nextQuality: StudioBotRecordingQuality) => {
    setQuality(nextQuality);
    const zone = zones.find((candidate) => candidate.id === zoneId);
    if (!zone) return;
    setRecorder(createBotRecorder({ zoneId: zone.id, zoneName: zone.name, quality: nextQuality }));
  };

  async function finish(video: Blob | null) {
    active.current = null;
    const previous = state.current;
    if (!previous) return;
    const result = stopBotRecording(previous, { stoppedAt: Date.now(), title: bt(`${previous.zoneName} 녹화`, `${previous.zoneName} recording`) });
    state.current = result.state;
    const item = result.session ? { ...result.session, id: crypto.randomUUID() } : null;
    if (mounted.current) { setRecorder(result.state); setBusy(true); }
    try {
      if (!video || !item) {
        if (mounted.current) setNotice(bt("저장할 영상이 없습니다. 화면을 확인하고 다시 녹화해 주세요.", "No video was captured. Check your source and record again."));
        return;
      }
      unsaved.current.set(item.id, video);
      let listed: StudioBotRecording = item;
      try {
        listed = (await saveWorkspaceVideo({ scope, recording: item }, video)).recording;
        unsaved.current.delete(item.id);
        if (mounted.current) setNotice(bt("이 기기에 녹화를 저장했습니다.", "Recording saved on this device."));
      } catch {
        if (mounted.current) setNotice(bt("기기 저장 공간을 확인해 주세요. 창을 닫기 전에 영상을 다운로드할 수 있습니다.", "Device storage failed. Download the recording before closing."));
      }
      if (mounted.current) setRecordings(items => [listed, ...items.filter(entry => entry.id !== listed.id)]);
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function handleStart() {
    if (!recorder || pending.current || active.current) return;
    pending.current = true;
    setBusy(true);
    setNotice("");
    try {
      const canvas = document.querySelector<HTMLCanvasElement>("[data-studio-bg3d-viewport-selected-ids] canvas");
      const capture = await startWorkspaceVideoCapture(source, canvas, quality, video => { void finish(video); });
      if (!mounted.current) { capture.discard(); return; }
      active.current = capture;
      state.current = startBotRecording(recorder, { startedAt: Date.now(), participantCount: Number.parseInt(participants, 10) });
      setRecorder(state.current);
    } catch (error) {
      if (mounted.current) setNotice(typeof error === "object" && error !== null && "name" in error && error.name === "NotAllowedError"
        ? bt("화면 공유가 시작되지 않았습니다. 녹화할 탭이나 창을 선택해 주세요.", "Screen sharing did not start. Select a tab or window to record.")
        : bt("이 소스에서 영상을 받을 수 없습니다. 3D 보기를 연 뒤 다시 시도하거나 탭·창을 선택해 주세요.", "This source is unavailable. Open the 3D viewport or select a tab or window."));
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function handlePause() {
    if (!state.current || !active.current) return;
    active.current.pause();
    state.current = pauseBotRecording(state.current, { pausedAt: Date.now() });
    setRecorder(state.current);
  }
  function handleResume() {
    if (!state.current || !active.current) return;
    active.current.resume();
    state.current = resumeBotRecording(state.current, { resumedAt: Date.now() });
    setRecorder(state.current);
  }
  function handleStop() { setBusy(true); active.current?.stop(); }
  async function download(item: StudioBotRecording) {
    try {
      const video = unsaved.current.get(item.id) ?? await readWorkspaceVideo(scope, item.id);
      if (!mounted.current) return;
      if (!video?.size) throw new Error("empty");
      downloadBlob(video, `${item.title}-${item.startedAt}.${video.type.includes("mp4") ? "mp4" : "webm"}`);
    } catch { if (mounted.current) setNotice(bt("녹화 파일을 열지 못했습니다.", "Could not open this recording.")); }
  }
  async function remove(item: StudioBotRecording) {
    try {
      if (!unsaved.current.has(item.id)) await removeWorkspaceVideo(scope, item.id);
      unsaved.current.delete(item.id);
      if (mounted.current) setRecordings(items => items.filter(entry => entry.id !== item.id));
    } catch { if (mounted.current) setNotice(bt("녹화 파일을 삭제하지 못했습니다.", "Could not delete this recording.")); }
  }

  const statusCopy =
    recorder?.status === "recording"
      ? bt("녹화 중", "Recording")
      : recorder?.status === "paused"
        ? bt("일시정지됨", "Paused")
        : bt("대기 중", "Idle");

  const qualityCopy: Record<StudioBotRecordingQuality, string> = {
    low: bt("저화질", "Low"),
    medium: bt("표준", "Medium"),
    high: bt("고화질", "High"),
  };

  return (
    <section className="vs2-panel studio-vspace-bot-recorder" aria-label={bt("작업 화면 녹화", "Record work session")} data-space-interactive="true">
      <header>
        <div>
          <h2>{bt("작업 화면 녹화", "Record work session")}</h2>
        </div>
        <span aria-live="polite">{statusCopy}</span>
      </header>
      <p role="note">
        {bt(
          "구역별로 작업 영상을 이 기기에 저장합니다. 탭이나 창을 녹화할 때는 브라우저에서 공유할 화면과 소리를 선택하세요.",
          "Record work by room on this device. For a tab or window, choose the screen and audio to share in your browser.",
        )}
      </p>

      {notice && <p role="status">{notice}</p>}
      <div className="studio-vspace-bot-recorder-controls">
        <label>{bt("녹화할 화면", "Recording source")}
          <select value={source} disabled={!idle} onChange={event => setSource(event.target.value === "display" ? "display" : "canvas")}>
            <option value="canvas">{bt("3D 작업 캔버스", "3D work canvas")}</option>
            <option value="display">{bt("탭·창 선택", "Select tab or window")}</option>
          </select>
        </label>
        <label>
          {bt("기록할 구역", "Recording room")}
          <select
            value={zoneId}
            disabled={!idle}
            onChange={(event) => handleZoneChange(event.target.value)}
            aria-label={bt("기록할 구역", "Recording room")}
          >
            {zones.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {bt("녹화 품질", "Recording quality")}
          <select
            value={quality}
            disabled={!idle}
            onChange={(event) => handleQualityChange(event.target.value as StudioBotRecordingQuality)}
            aria-label={bt("녹화 품질", "Recording quality")}
          >
            {(Object.keys(qualityCopy) as StudioBotRecordingQuality[]).map((value) => (
              <option key={value} value={value}>
                {qualityCopy[value]}
              </option>
            ))}
          </select>
        </label>
        <label>
          {bt("참가자 수", "Participants")}
          <input
            type="number"
            min={0}
            step={1}
            value={participants}
            disabled={!idle}
            onChange={(event) => setParticipants(event.target.value)}
            aria-label={bt("참가자 수", "Participants")}
          />
        </label>
      </div>

      <div className="studio-vspace-bot-recorder-actions">
        {recorder?.status === "idle" || recorder === null ? (
          <button type="button" onClick={() => void handleStart()} disabled={!idle || recorder === null}>
            {bt("녹화 시작", "Start recording")}
          </button>
        ) : null}
        {recorder?.status === "recording" ? (
          <>
            <button type="button" onClick={handlePause} disabled={busy}>
              {bt("일시정지", "Pause")}
            </button>
            <button type="button" onClick={handleStop} disabled={busy}>
              {bt("녹화 중지", "Stop recording")}
            </button>
          </>
        ) : null}
        {recorder?.status === "paused" ? (
          <>
            <button type="button" onClick={handleResume} disabled={busy}>
              {bt("다시 녹화", "Resume")}
            </button>
            <button type="button" onClick={handleStop} disabled={busy}>
              {bt("녹화 중지", "Stop recording")}
            </button>
          </>
        ) : null}
      </div>

      <h3>{bt("녹화물 목록", "Recordings")}</h3>
      {recordings.length === 0 ? (
        <p>{bt("아직 녹화물이 없습니다. 녹화를 시작하면 여기에 목록이 쌓입니다.", "No recordings yet. Start a recording and they will be listed here.")}</p>
      ) : (
        <ul>
          {recordings.map(recording => {
            const entry = recording;
            return (
              <li key={recording.id}>
                <div>
                  <strong>{entry.title}</strong>
                  <span>
                    {entry.zoneName} · {formatBotRecordingDuration(entry.durationMs)} ·{" "}
                    {new Date(entry.createdAt).toLocaleString()}
                  </span>
                </div>
                <div>
                  <button type="button" onClick={() => void download(recording)}>{bt("다운로드", "Download")}</button>
                  <button type="button" onClick={() => void remove(recording)}>{bt("기기에서 삭제", "Delete from device")}</button>
                  {onAssetize ? (
                    <button type="button" onClick={() => onAssetize(recording)}>
                      {bt("에셋으로 편입", "Add to assets")}
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
