"use client";

import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  CheckCircle2,
  Film,
  Layers,
  Mic2,
  MousePointerClick,
  Palette,
  Sparkles,
  Stamp,
  Users,
  Volume2,
  X,
} from "lucide-react";

import {
  ILLUSTRATED_V11_CREATOR_PERSONAS,
  type IllustratedCreatorPersonaId,
} from "./studio-virtual-office-nextgen-engine-data";
import {
  ILLUSTRATED_2D_WORKSTATIONS,
  ILLUSTRATED_V15_ACTION_SPRITES,
  triggerIllustrated2dVfxBurst,
  type Illustrated2dWorkstationPlacement,
} from "./studio-virtual-space-illustrated-2d-runtime";

import { readOffice2dSoundMuted } from "./office2d/office2d-stage-extensions";
import { canvasPoint, drawWorkstationSheet, drawWorkstationStroke } from "./studio-workstation-drawing";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { WORKSTATION_STAGES, WORKSTATION_STAMPS, type WorkstationCutId, type WorkstationStroke } from "./studio-workstation-notebook";
import { useWorkstationNotebook, useWorkstationOwner } from "./use-studio-workstation-notebook";

export type WorkstationSuiteTab = "redline" | "kanban" | "turntable-sfx";

export interface CutPipelineItem {
  readonly id: WorkstationCutId;
  readonly cutNumber: number;
  readonly titleKo: string;
  readonly stage: "storyboard" | "line" | "color" | "bg3d" | "done";
  readonly assigneeId: IllustratedCreatorPersonaId;
  readonly verdict: "PASS" | "RETAKE" | "TYPE" | "VFX" | null;
}

const INITIAL_CUT_PIPELINE: readonly CutPipelineItem[] = [
  { id: "cut-17", cutNumber: 17, titleKo: "옥상 비바람 대치 와이드 샷", stage: "bg3d", assigneeId: "cgi-director", verdict: "PASS" },
  { id: "cut-18", cutNumber: 18, titleKo: "주인공 검기 각성 클로즈업 (메인 피드백 컷)", stage: "line", assigneeId: "line-artist", verdict: "VFX" },
  { id: "cut-19", cutNumber: 19, titleKo: "역광 마법진 폭발 투샷", stage: "color", assigneeId: "colorist", verdict: null },
  { id: "cut-20", cutNumber: 20, titleKo: "콰아앙! 건물 붕괴 사운드 연출컷", stage: "bg3d", assigneeId: "sound-letterer", verdict: "TYPE" },
  { id: "cut-21", cutNumber: 21, titleKo: "회귀 직전 시계탑 독백 씬", stage: "storyboard", assigneeId: "story-writer", verdict: null },
  { id: "cut-22", cutNumber: 22, titleKo: "엔딩 클리프행어 눈빛 컷", stage: "done", assigneeId: "chief-pd", verdict: "PASS" },
];



const STAGE_LABEL_KO: Readonly<Record<CutPipelineItem["stage"], string>> = {
  storyboard: "1. 콘티·연출",
  line: "2. 선화·펜터치",
  color: "3. 밑색·명암",
  bg3d: "4. 3D배경·식자",
  done: "5. 검수 완료",
};

const SFX_PROFILES: Readonly<
  Record<
    "pen" | "stamp" | "boom" | "slash" | "heartbeat" | "espresso" | "handoff",
    { readonly type: OscillatorType; readonly f0: number; readonly f1: number; readonly gain: number; readonly dur: number }
  >
> = {
  pen: { type: "triangle", f0: 920, f1: 1480, gain: 0.08, dur: 0.07 },
  stamp: { type: "sine", f0: 240, f1: 620, gain: 0.15, dur: 0.16 },
  boom: { type: "sawtooth", f0: 140, f1: 38, gain: 0.18, dur: 0.34 },
  slash: { type: "sine", f0: 1800, f1: 320, gain: 0.14, dur: 0.16 },
  heartbeat: { type: "sine", f0: 75, f1: 92, gain: 0.2, dur: 0.26 },
  espresso: { type: "triangle", f0: 520, f1: 780, gain: 0.11, dur: 0.24 },
  handoff: { type: "sine", f0: 587.33, f1: 880, gain: 0.12, dur: 0.2 },
};

function playProceduralWorkstationSfx(
  kind: "pen" | "stamp" | "boom" | "slash" | "heartbeat" | "espresso" | "handoff",
): void {
  if (typeof window === "undefined" || readOffice2dSoundMuted()) return;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;
  try {
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const p = SFX_PROFILES[kind];
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = p.type;
    osc.frequency.setValueAtTime(p.f0, now);
    osc.frequency.exponentialRampToValueAtTime(p.f1, now + Math.max(0.02, p.dur - 0.01));
    gain.gain.setValueAtTime(p.gain, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + p.dur);
    osc.start(now);
    osc.stop(now + p.dur);
    setTimeout(() => {
      void ctx.close().catch(() => undefined);
    }, 500);
  } catch {
    // Ignore WebAudio autoplay restrictions in headless tests
  }
}

export interface StudioVirtualSpaceWorkstationLiveModalProps {
  readonly station: Illustrated2dWorkstationPlacement;
  readonly onClose: () => void;
  readonly onSelectStation: (stationId: string) => void;
  /** 실프로젝트 공정 데이터가 있으면 기본 예시 파이프라인 대신 실데이터를 표시한다. */
  readonly projectCuts?: readonly CutPipelineItem[];
  /** 워크스테이션 레드라인 스트로크를 상위 Yjs 공간 보드로 동기화할 때 호출한다. */
  readonly onSyncStroke?: (stroke: WorkstationStroke) => void;
}

export function StudioVirtualSpaceWorkstationLiveModal(props: StudioVirtualSpaceWorkstationLiveModalProps) {
  const owner = useWorkstationOwner(props.station.id);
  return <WorkstationNotebookEditor key={owner.key ?? props.station.id} {...props} owner={owner} />;
}

function WorkstationNotebookEditor({ station, onClose, onSelectStation, projectCuts, onSyncStroke, owner }: StudioVirtualSpaceWorkstationLiveModalProps & {
  readonly owner: ReturnType<typeof useWorkstationOwner>;
}) {
  const bt = useBilingual("StudioVirtualSpaceWorkstationLiveModal");
  const { marks, status, append, retry } = useWorkstationNotebook(owner.key, owner.current);
  const blocked = owner.waiting || status === "loading" || status === "read-error";
  const strokes = marks.filter(mark => mark.kind === "stroke");
  const activeStamp = marks.filter(mark => mark.kind === "stamp").at(-1)?.stamp ?? null;
  const baseCuts = projectCuts?.length ? projectCuts : INITIAL_CUT_PIPELINE;
  const cuts = baseCuts.map(cut => {
    const advances = marks.filter(mark => mark.kind === "stage" && mark.cutId === cut.id).length;
    const stage = WORKSTATION_STAGES[(WORKSTATION_STAGES.indexOf(cut.stage) + advances) % WORKSTATION_STAGES.length] ?? cut.stage;
    return { ...cut, stage };
  });
  void onSyncStroke;
  const [activeTab, setActiveTab] = useState<WorkstationSuiteTab>("redline");
  const [layers, setLayers] = useState({
    storyboard: true,
    line: true,
    color: true,
    sfx: true,
  });
  const [penColor, setPenColor] = useState<string>("#f43f5e");
  const [cameraYaw, setCameraYaw] = useState(42);
  const [cameraFov, setCameraFov] = useState<number>(35);
  const [lightingPreset, setLightingPreset] = useState<string>("사이버 네온 역광");
  const [effectNotice, setEffectNotice] = useState("");
  const [leave, setLeave] = useState<(() => void) | null>(null);
  const guardedLeave = (action: () => void) => {
    if (status === "write-error" || status === "saving") setLeave(() => action);
    else action();
  };
  useEffect(() => { if (status === "ready" && leave) leave(); }, [leave, status]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef<{ pointer: number; stroke: WorkstationStroke } | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const partnerPersona =
    ILLUSTRATED_V11_CREATOR_PERSONAS.find((p) => p.id === station.partnerPersonaId) ??
    ILLUSTRATED_V11_CREATOR_PERSONAS[0];

  // Draw base webtoon cut preview whenever layer toggles or station changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    drawWorkstationSheet(ctx, canvas, activeStamp, layers);
    for (const mark of marks) if (mark.kind === "stroke") drawWorkstationStroke(ctx, mark);
    if (drawingRef.current) drawWorkstationStroke(ctx, drawingRef.current.stroke);
  }, [activeStamp, activeTab, layers, marks, station.id]);

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (blocked || drawingRef.current || !e.isPrimary || e.button !== 0) return;
    const canvas = e.currentTarget;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const stroke = { kind: "stroke" as const, id: crypto.randomUUID(), color: penColor, points: [canvasPoint(e)] };
    drawingRef.current = { pointer: e.pointerId, stroke };
    canvas.setPointerCapture(e.pointerId);
    drawWorkstationStroke(ctx, stroke);
    playProceduralWorkstationSfx("pen");
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const active = drawingRef.current;
    if (!active || active.pointer !== e.pointerId) return;
    const point = canvasPoint(e);
    const previous = active.stroke.points.at(-1);
    if (!previous || (previous[0] === point[0] && previous[1] === point[1])) return;
    active.stroke.points.push(point);
    const ctx = e.currentTarget.getContext("2d");
    if (ctx) drawWorkstationStroke(ctx, { ...active.stroke, points: [previous, point] });
  };

  const finishStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const active = drawingRef.current;
    if (!active || active.pointer !== e.pointerId) return;
    if (e.type === "pointerup") handleCanvasPointerMove(e);
    drawingRef.current = null;
    append(active.stroke);
  };

  const applyVerdictStamp = (stamp: typeof WORKSTATION_STAMPS[number]) => {
    append({ kind: "stamp", id: crypto.randomUUID(), stamp });
    playProceduralWorkstationSfx("stamp");
    triggerIllustrated2dVfxBurst(stamp, station.accentColor);
  };
  const advanceCutStage = (cutId: WorkstationCutId) => {
    append({ kind: "stage", id: crypto.randomUUID(), cutId });
    playProceduralWorkstationSfx("handoff");
    triggerIllustrated2dVfxBurst("공정 변경", 0x38bdf8);
  };

  const triggerWorldSfxBurst = (
    label: string,
    sfxKind: "boom" | "slash" | "heartbeat" | "espresso",
    color: number,
  ) => {
    playProceduralWorkstationSfx(sfxKind);
    triggerIllustrated2dVfxBurst(label, color);
    setEffectNotice(label);
  };

  const doneCount = cuts.filter(c => c.stage === "done").length;
  const progressPercent = Math.round(doneCount / cuts.length * 100);
  const collabLog = marks.slice(-6).reverse().map(mark => mark.kind === "stroke"
    ? bt("스케치 한 획 추가", "Stroke added") : mark.kind === "stamp" ? mark.stamp
      : bt(`${mark.cutId.replace("cut-", "")}컷 다음 공정으로 이동`, `Cut ${mark.cutId.slice(4)} moved to its next stage`));

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) guardedLeave(onClose); }}>
    <Dialog.Portal>
    <Dialog.Overlay
      data-space-interactive="true"
      className="pointer-events-auto fixed inset-0 z-[1200] flex items-center justify-center bg-black/55 p-3 backdrop-blur-sm sm:p-6"
    >
    <Dialog.Content asChild aria-describedby={undefined}
      onOpenAutoFocus={() => {
        const active = document.activeElement;
        returnFocusRef.current = active instanceof HTMLElement ? active : null;
      }}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus({ preventScroll: true });
      }}>
    <div
      data-testid="workstation-live-collab-modal"
      data-space-interactive="true"
      aria-modal="true"
      aria-label={`${station.titleKo} 개인 작업대`}
      className="pointer-events-auto relative z-10 flex max-h-[88dvh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-accent bg-panel/95 text-fg shadow-2xl backdrop-blur-xl"
    >
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-card/80 px-4 py-3">
        <div className="flex items-center gap-3">
          <img
            src={ILLUSTRATED_V15_ACTION_SPRITES["stride-draw"]}
            alt={station.titleKo}
            className="h-11 w-11 rounded-xl border border-accent bg-panel object-contain p-0.5"
          />
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-bold text-accent">
                개인 작업대
              </span>
              <Dialog.Title asChild><h2 className="text-sm font-bold text-fg">{station.titleKo}</h2></Dialog.Title>
            </div>
            <p className="text-xs text-fg-2">
              {station.subtitleKo} · 전담 파트너: {partnerPersona.nameKo} ({station.partnerLabelKo})
            </p>
          </div>
        </div>

        {/* Station Switcher Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          <select
            aria-label="워크스테이션 전환"
            data-testid="workstation-live-select"
            value={station.id}
            onChange={(e) => { const next = e.target.value; guardedLeave(() => onSelectStation(next)); }}
            className="rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs font-semibold text-fg"
          >
            {ILLUSTRATED_2D_WORKSTATIONS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.titleKo}
              </option>
            ))}
          </select>

          <button
            type="button"
            data-testid="workstation-live-close-btn"
            onClick={() => guardedLeave(onClose)}
            className="flex items-center gap-1 rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-bold text-fg hover:border-accent"
          >
            <X className="h-3.5 w-3.5" />
            닫기 (2D 월드로)
          </button>
        </div>
      </div>

      <div className="border-b border-line px-4 py-2 text-xs text-fg-2">
        <p role={status.includes("error") ? "alert" : "status"} data-workstation-save={status}>
          {owner.waiting || status === "loading" ? bt("작업대 기록을 여는 중…", "Opening your notebook…")
            : status === "read-error" ? bt("기기 기록을 열지 못했습니다. 다른 탭에서 원고를 열었다면 닫고 다시 시도해 주세요.", "Could not open the notebook. Close other editor tabs and retry.")
            : status === "write-error" ? bt("기기에 저장하지 못했습니다. 이 창에 수정 내용이 남아 있습니다.", "Could not save on this device. Your edits are still open.")
            : status === "saving" ? bt("기기에 저장 중…", "Saving on this device…")
            : status === "local" ? bt("임시 작업대입니다. 닫으면 기록이 사라집니다.", "Temporary notebook. Changes last until you close it.")
            : bt("이 기기의 개인 작업대에 저장됩니다. 팀 원고와 공정표에는 전송되지 않습니다.", "Saved to your private notebook on this device. Team documents and boards are separate.")}
          {status.includes("error") ? <button type="button" className="ml-2 underline" onClick={retry}>{bt("다시 시도", "Retry")}</button> : null}
        </p>
        {leave ? <div role="alert">{bt("저장 전 변경이 있습니다.", "You have unsaved edits.")}
          <button type="button" className="ml-2 underline" onClick={() => setLeave(null)}>{bt("계속 작업", "Keep editing")}</button>
          <button type="button" className="ml-2 underline" onClick={leave}>{bt("저장 확인 없이 이동", "Leave without waiting")}</button>
        </div> : null}
      </div>
      {/* Mode Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-panel/60 px-4 py-2">
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            data-testid="workstation-tab-redline"
            onClick={() => setActiveTab("redline")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              activeTab === "redline"
                ? "bg-accent text-on-accent shadow-sm"
                : "bg-card text-fg-2 hover:text-fg"
            }`}
          >
            <Palette className="h-3.5 w-3.5" />
            스케치·검수
          </button>
          <button
            type="button"
            data-testid="workstation-tab-kanban"
            onClick={() => setActiveTab("kanban")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              activeTab === "kanban"
                ? "bg-accent text-on-accent shadow-sm"
                : "bg-card text-fg-2 hover:text-fg"
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            컷 공정 ({doneCount}/{cuts.length})
          </button>
          <button
            type="button"
            data-testid="workstation-tab-turntable-sfx"
            onClick={() => setActiveTab("turntable-sfx")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              activeTab === "turntable-sfx"
                ? "bg-accent text-on-accent shadow-sm"
                : "bg-card text-fg-2 hover:text-fg"
            }`}
          >
            <Volume2 className="h-3.5 w-3.5" />
            카메라·효과음
          </button>
        </div>

        <span className="text-[11px] font-semibold text-accent">
          ✦ 2D 스튜디오 효과 · 사운드 실시간 연동 중
        </span>
      </div>

      {/* Main Content Area */}
      <div className="grid flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 lg:grid-cols-12">
        <div className="space-y-3 lg:col-span-8">
          {activeTab === "redline" && !blocked ? (
            <div className="space-y-3 rounded-xl border border-line bg-card p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      ["storyboard", "1. 콘티 그리드"],
                      ["line", "2. 펜선(선화)"],
                      ["color", "3. 채색·조명"],
                      ["sfx", "4. 식자·효과음"],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      data-testid={`redline-layer-${key}-btn`}
                      onClick={() =>
                        setLayers((prev) => ({ ...prev, [key]: !prev[key] }))
                      }
                      className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${
                        layers[key]
                          ? "border-accent bg-accent-soft text-accent"
                          : "border-line bg-panel text-fg-2"
                      }`}
                    >
                      {label} {layers[key] ? "ON" : "OFF"}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1">
                  {[
                    { color: "#f43f5e", label: "레드라인" },
                    { color: "#38bdf8", label: "구도선" },
                    { color: "#fbbf24", label: "역광펜" },
                    { color: "#34d399", label: "승인펜" },
                  ].map((item) => (
                    <button
                      key={item.color}
                      type="button"
                      onClick={() => setPenColor(item.color)}
                      className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${
                        penColor === item.color
                          ? "border-fg bg-panel text-fg"
                          : "border-line text-fg-2"
                      }`}
                    >
                      <span
                        className="mr-1 inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="relative overflow-hidden rounded-xl border border-line bg-panel">
                <canvas
                  ref={canvasRef}
                  width={560}
                  height={270}
                  data-testid="workstation-redline-canvas"
                  onPointerDown={handleCanvasPointerDown}
                  onPointerMove={handleCanvasPointerMove}
                  onPointerUp={finishStroke}
                  onPointerCancel={finishStroke}
                  onLostPointerCapture={finishStroke}
                  className="block h-auto w-full cursor-crosshair touch-none"
                />
                <div className="flex items-center justify-between border-t border-line bg-card/90 px-3 py-1.5 text-[11px] text-fg-2">
                  <span>
                    <MousePointerClick className="mr-1 inline h-3.5 w-3.5 text-accent" />
                    캔버스 위에 직접 마우스/펜으로 레드라인 피드백을 그리세요 (누적 피드백 획수: {strokes.length}회)
                  </span>
                  <span className="font-bold text-accent">현재 판정: {activeStamp ?? bt("미판정", "Unmarked")}</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 flex items-center gap-1 text-xs font-bold text-fg">
                  <Stamp className="h-3.5 w-3.5 text-accent" />
                  PD 검수 스탬프 날인 (2D 월드 특수효과 동시 발동):
                </span>
                {WORKSTATION_STAMPS.map((stamp) => (
                  <button
                    key={stamp}
                    type="button"
                    data-testid={`workstation-stamp-${stamp}-btn`}
                    onClick={() => applyVerdictStamp(stamp)}
                    className="rounded-lg border border-line bg-panel px-2.5 py-1 text-xs font-semibold text-fg hover:border-accent hover:text-accent"
                  >
                    {stamp}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {activeTab === "kanban" && !blocked ? (
            <div className="space-y-3 rounded-xl border border-line bg-card p-3">
              <div className="flex items-center justify-between">
                <strong className="text-xs font-bold text-fg">
                  예시 컷 공정표
                </strong>
                <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-bold text-accent">
                  마감 달성률 {progressPercent}%
                </span>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {cuts.map((cut) => {
                  const assignee =
                    ILLUSTRATED_V11_CREATOR_PERSONAS.find((p) => p.id === cut.assigneeId) ??
                    ILLUSTRATED_V11_CREATOR_PERSONAS[0];
                  return (
                    <div
                      key={cut.id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-line bg-panel p-2.5"
                    >
                      <div className="flex items-center gap-2">
                        <img
                          src={assignee.workSpriteUrl}
                          alt={assignee.nameKo}
                          className="h-10 w-10 rounded-lg border border-line bg-card object-contain p-0.5"
                        />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-bold text-accent">
                              #{cut.cutNumber}컷
                            </span>
                            <strong className="text-xs text-fg">{cut.titleKo}</strong>
                          </div>
                          <p className="text-[11px] text-fg-2">
                            담당: {assignee.nameKo.split(" (")[0]} · 공정:{" "}
                            <span className="font-bold text-accent">
                              {STAGE_LABEL_KO[cut.stage]}
                            </span>
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        data-testid={`kanban-advance-${cut.id}-btn`}
                        onClick={() => advanceCutStage(cut.id)}
                        className="shrink-0 rounded-lg border border-accent bg-accent-soft px-2.5 py-1 text-[11px] font-bold text-accent hover:opacity-90"
                      >
                        {cut.stage === "done" ? bt("콘티로 되돌리기", "Return to storyboard") : bt("다음 공정으로", "Advance stage")}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {activeTab === "turntable-sfx" ? (
            <div className="space-y-3 rounded-xl border border-line bg-card p-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2 rounded-xl border border-line bg-panel p-3">
                  <strong className="flex items-center gap-1.5 text-xs font-bold text-fg">
                    <Film className="h-3.5 w-3.5 text-accent" />
                    3D 배경 턴테이블 · 카메라 화각 제어
                  </strong>
                  <div className="flex items-center gap-3">
                    <img
                      src={ILLUSTRATED_V15_ACTION_SPRITES["bg3d-holo"]}
                      alt="3D 배경 홀로그램"
                      className="h-16 w-16 rounded-xl border border-line bg-card object-contain p-1"
                    />
                    <div className="flex-1 space-y-1.5 text-xs">
                      <label className="block text-[11px] text-fg-2">
                        턴테이블 회전각: <strong className="text-fg">{cameraYaw}°</strong>
                        <input
                          type="range"
                          min={0}
                          max={360}
                          value={cameraYaw}
                          onChange={(e) => setCameraYaw(Number(e.target.value))}
                          className="mt-1 w-full accent-accent"
                        />
                      </label>
                      <div className="flex gap-1">
                        {[18, 35, 50, 85].map((fov) => (
                          <button
                            key={fov}
                            type="button"
                            onClick={() => setCameraFov(fov)}
                            className={`rounded border px-2 py-0.5 text-[10px] font-bold ${
                              cameraFov === fov
                                ? "border-accent bg-accent-soft text-accent"
                                : "border-line bg-card text-fg-2"
                            }`}
                          >
                            {fov}mm
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {[
                      "사이버 네온 역광",
                      "서울 루프탑 노을",
                      "대마법 아스트랄",
                      "무협 달빛 안개",
                    ].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          setLightingPreset(preset);
                          triggerWorldSfxBurst(`조명: ${preset}`, "slash", 0x38bdf8);
                        }}
                        className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold ${
                          lightingPreset === preset
                            ? "border-accent bg-accent-soft text-accent"
                            : "border-line bg-card text-fg-2"
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2 rounded-xl border border-line bg-panel p-3">
                  <strong className="flex items-center gap-1.5 text-xs font-bold text-fg">
                    <Mic2 className="h-3.5 w-3.5 text-accent" />
                    웹툰 효과음 · {effectNotice}
                  </strong>
                  <p className="text-[11px] text-fg-2">
                    클릭 시 실시간 효과음과 함께 2D 캐릭터 머리 위에 역동적인 코믹 효과음 스탬프·파티클이 터집니다.
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      data-testid="sfx-pad-boom-btn"
                      onClick={() =>
                        triggerWorldSfxBurst("콰아앙—!! 💥", "boom", 0xf43f5e)
                      }
                      className="rounded-lg border border-line bg-card px-2.5 py-2 text-left text-xs font-bold text-fg hover:border-accent"
                    >
                      💥 콰아앙! 폭발음
                    </button>
                    <button
                      type="button"
                      data-testid="sfx-pad-slash-btn"
                      onClick={() =>
                        triggerWorldSfxBurst("스으윽—⚡ 검기!", "slash", 0x38bdf8)
                      }
                      className="rounded-lg border border-line bg-card px-2.5 py-2 text-left text-xs font-bold text-fg hover:border-accent"
                    >
                      ⚡ 스으윽! 검기 발도
                    </button>
                    <button
                      type="button"
                      data-testid="sfx-pad-heart-btn"
                      onClick={() =>
                        triggerWorldSfxBurst("두근두근 💓 클로즈업", "heartbeat", 0xf472b6)
                      }
                      className="rounded-lg border border-line bg-card px-2.5 py-2 text-left text-xs font-bold text-fg hover:border-accent"
                    >
                      💓 두근두근 심장음
                    </button>
                    <button
                      type="button"
                      data-testid="sfx-pad-coffee-btn"
                      onClick={() =>
                        triggerWorldSfxBurst("치이익—☕ 에스프레소!", "espresso", 0x34d399)
                      }
                      className="rounded-lg border border-line bg-card px-2.5 py-2 text-left text-xs font-bold text-fg hover:border-accent"
                    >
                      ☕ 마감 라떼 스팀
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Right Column: Sleek Expressive Team Cast & Live Collaboration Feed */}
        <div className="space-y-3 lg:col-span-4">
          <div className="rounded-xl border border-line bg-card p-3">
            <strong className="mb-2 flex items-center gap-1.5 text-xs font-bold text-fg">
              <Users className="h-3.5 w-3.5 text-accent" />
              다중 표정·액션 크리에이터 캐스트
            </strong>
            <div className="grid grid-cols-4 gap-1.5">
              {(
                [
                  ["stride-draw", "총총 스케치"],
                  ["action-slash", "네온 펜슬래시"],
                  ["focus-overdrive", "초집중 각성"],
                  ["cheer-coffee", "라떼 치어스"],
                  ["pd-approve", "PD 승인도장"],
                  ["colorist-magic", "컬러 리본"],
                  ["bg3d-holo", "3D 홀로그램"],
                  ["writer-oracle", "스토리 오라클"],
                ] as const
              ).map(([actionKey, label]) => (
                <button
                  key={actionKey}
                  type="button"
                  data-testid={`workstation-v15-action-${actionKey}-btn`}
                  onClick={() => {
                    playProceduralWorkstationSfx("handoff");
                    triggerIllustrated2dVfxBurst(`${label} 발동! ✨`, station.accentColor, actionKey);
                  }}
                  className="flex flex-col items-center rounded-lg border border-line bg-panel p-1.5 text-center transition hover:border-accent"
                >
                  <img
                    src={ILLUSTRATED_V15_ACTION_SPRITES[actionKey]}
                    alt={label}
                    className="h-12 w-12 object-contain"
                  />
                  <span className="mt-1 line-clamp-1 text-[10px] font-semibold text-fg">
                    {label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-line bg-card p-3">
            <strong className="mb-2 flex items-center gap-1.5 text-xs font-bold text-fg">
              <Sparkles className="h-3.5 w-3.5 text-accent" />
              작업대 기록
            </strong>
            <ul className="space-y-1.5 text-[11px] text-fg-2">
              {!collabLog.length ? <li>{bt("아직 스케치·검수·공정 기록이 없습니다.", "No sketches, stamps or stage changes yet.")}</li> : null}
              {collabLog.map((entry, idx) => (
                <li
                  key={`${idx}-${entry}`}
                  className=" flex items-start gap-1.5 rounded-lg border border-line/70 bg-panel px-2.5 py-1.5"
                >
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                  <span>{entry}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
    </Dialog.Content>
    </Dialog.Overlay>
    </Dialog.Portal>
    </Dialog.Root>
  );
}
