"use client";

import { useState, type KeyboardEvent } from "react";
import {
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FileCheck2,
  MessageSquarePlus,
  Play,
  Send,
  ShieldAlert,
} from "lucide-react";

import { StudioVirtualDynamicSpriteAvatar } from "./StudioVirtualDynamicSpriteAvatar";
import { getDynamicCreatorPersonaSpec } from "./studio-virtual-space-dynamic-sprite-engine";
import {
  PIPELINE_STAGE_LABELS_KO,
  type NextGenVirtualStudioEngineState,
} from "./studio-virtual-office-nextgen-engine-data";
import { resolveAvatarDirectionalWalkSprite } from "./studio-virtual-office-nextgen-engine-model";
import {
  STUDIO_PRACTICAL_WORK_MODES,
  addDeskRetakeNote,
  completePomodoroSprintAndCut,
  createInitialPracticalWorkbenchState,
  generateDailyStudioHandoffMarkdown,
  handoffDeskToNextDepartment,
  setPracticalWorkMode,
  toggleDeskQualityChecklistItem,
  togglePomodoroSprintRunning,
  toggleResolveDeskRetakeNote,
  type StudioPracticalWorkModeId,
} from "./studio-virtual-office-practical-workbench-model";

export interface StudioVirtualOfficePracticalWorkbenchSectionProps {
  readonly engineState: NextGenVirtualStudioEngineState;
  readonly activeSpriteUrl: string;
  readonly onStepPhysics: (vec: { readonly dx: number; readonly dy: number }) => void;
  readonly onToggleGhostMode: () => void;
  readonly onTriggerNearestX: () => void;
  readonly onApproachDesk: (deskId: string) => void;
  readonly onAdvanceDeskStage: (deskId: string) => void;
  readonly onBannerChange?: (banner: string) => void;
}

export function StudioVirtualOfficePracticalWorkbenchSection({
  engineState,
  activeSpriteUrl,
  onStepPhysics,
  onToggleGhostMode,
  onTriggerNearestX,
  onApproachDesk,
  onAdvanceDeskStage,
  onBannerChange,
}: StudioVirtualOfficePracticalWorkbenchSectionProps) {
  const [wbState, setWbState] = useState(createInitialPracticalWorkbenchState);
  const [retakeDraft, setRetakeDraft] = useState("");
  const [selectedV13EmoteId, setSelectedV13EmoteId] = useState(
    engineState.activeV13EmoteId,
  );
  const [selectedV13PropId, setSelectedV13PropId] = useState(
    engineState.activeV13PropId,
  );

  const activeDesk =
    engineState.cutDesks.find((d) => d.deskId === engineState.selectedCutDeskId) ??
    engineState.cutDesks[0];
  const activeDeskWb =
    wbState.deskWorkbenches[activeDesk.deskId] ??
    wbState.deskWorkbenches["desk-ep43-c04"];
  const activeWorkMode =
    STUDIO_PRACTICAL_WORK_MODES.find((m) => m.id === wbState.workModeId) ??
    STUDIO_PRACTICAL_WORK_MODES[0];
  const activeTheme =
    engineState.themes.find((t) => t.id === engineState.activeThemeId) ??
    engineState.themes[0];
  const activePersona =
    engineState.personas.find((p) => p.id === engineState.activePersonaId) ??
    engineState.personas[0];

  const handleFloorKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const key = e.key.toLowerCase();
    if (key === "w" || e.key === "ArrowUp") {
      e.preventDefault();
      onStepPhysics({ dx: 0, dy: -1 });
    } else if (key === "s" || e.key === "ArrowDown") {
      e.preventDefault();
      onStepPhysics({ dx: 0, dy: 1 });
    } else if (key === "a" || e.key === "ArrowLeft") {
      e.preventDefault();
      onStepPhysics({ dx: -1, dy: 0 });
    } else if (key === "d" || e.key === "ArrowRight") {
      e.preventDefault();
      onStepPhysics({ dx: 1, dy: 0 });
    } else if (key === "g") {
      e.preventDefault();
      onToggleGhostMode();
    } else if (key === "x") {
      e.preventDefault();
      onTriggerNearestX();
    }
  };

  const handleAddRetake = () => {
    const trimmed = retakeDraft.trim();
    if (!trimmed) return;
    const next = addDeskRetakeNote(
      wbState,
      activeDesk.deskId,
      activePersona.nameKo,
      trimmed,
    );
    setWbState(next);
    setRetakeDraft("");
    onBannerChange?.(
      `[실무 리테이크 지시 등록] ${activeDesk.episodeCode} ${activeDesk.cutNumber}: "${trimmed}"`,
    );
  };

  const quotaPct = Math.min(
    100,
    Math.round(
      (wbState.pomodoro.todayCompletedCuts /
        Math.max(1, wbState.pomodoro.todayTargetCuts)) *
        100,
    ),
  );

  return (
    <div
      data-testid="practical-studio-workbench-section"
      className="space-y-3 rounded-xl border border-accent bg-panel p-3.5"
    >
      {/* 1. Top Bar: Practical Work Status Mode + Pomodoro Sprint + Daily Cut Quota */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5">
        <div>
          <strong className="flex items-center gap-1.5 text-xs text-fg">
            <ClipboardCheck className="h-4 w-4 text-accent" />
            실무 원고 마감 워크벤치 (인터랙티브 플로어 · 레이어 검수 체크리스트 · 리테이크 지시서 · 일일 인계서)
          </strong>
          <p className="mt-0.5 text-[11px] text-fg-2">
            아바타 이동과 동시에 실제 작업 파일({activeDeskWb.dccFileName}) 검수, 뽀모도로 마감 타이머, 파트간 인계를 한 화면에서 처리합니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {STUDIO_PRACTICAL_WORK_MODES.map((mode) => {
            const active = mode.id === wbState.workModeId;
            return (
              <button
                key={mode.id}
                type="button"
                data-testid={`practical-workmode-${mode.id}-btn`}
                onClick={() => {
                  const next = setPracticalWorkMode(
                    wbState,
                    mode.id as StudioPracticalWorkModeId,
                  );
                  setWbState(next);
                  onBannerChange?.(
                    `[실무 근무 상태 전환] ${mode.labelKo} (${mode.badgeKo})`,
                  );
                }}
                className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
                  active
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-card text-fg-2 hover:text-fg"
                }`}
              >
                {mode.labelKo}
              </button>
            );
          })}
        </div>
      </div>

      {/* Pomodoro Sprint & Daily Quota Strip */}
      <div className="grid grid-cols-1 gap-2 rounded-lg border border-line bg-card p-2.5 sm:grid-cols-12">
        <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-7">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-accent" />
            <div>
              <div className="text-xs font-bold text-fg">
                마감 뽀모도로 스프린트:{" "}
                <span
                  data-testid="practical-pomodoro-readout"
                  className="font-mono text-accent"
                >
                  {wbState.pomodoro.remainingMinutes}:00
                </span>{" "}
                ({wbState.pomodoro.isRunning ? "집중 작화 진행 중" : "일시정지"})
              </div>
              <div className="text-[10px] text-fg-2">
                {activeWorkMode.badgeKo} · 오늘 누적 {wbState.pomodoro.completedSprintsCount}스프린트 완료 · 마감 D-{wbState.pomodoro.deadlineHoursRemaining}h
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              data-testid="practical-pomodoro-toggle-btn"
              onClick={() => {
                const next = togglePomodoroSprintRunning(wbState);
                setWbState(next);
                onBannerChange?.(
                  `[뽀모도로 타이머] ${next.pomodoro.isRunning ? "25분 집중 작화 재개" : "타이머 일시정지"}`,
                );
              }}
              className="flex items-center gap-1 rounded border border-line bg-panel px-2 py-1 text-[10px] font-semibold text-fg hover:border-accent"
            >
              <Play className="h-3 w-3 text-accent" />
              {wbState.pomodoro.isRunning ? "일시정지" : "스프린트 시작"}
            </button>
            <button
              type="button"
              data-testid="practical-pomodoro-complete-cut-btn"
              onClick={() => {
                const next = completePomodoroSprintAndCut(wbState);
                setWbState(next);
                onBannerChange?.(
                  `[원고 1컷 작화 완료] 오늘 누적 ${next.pomodoro.todayCompletedCuts}/${next.pomodoro.todayTargetCuts}컷 달성!`,
                );
              }}
              className="rounded border border-accent bg-accent-soft px-2.5 py-1 text-[10px] font-semibold text-accent"
            >
              +1컷 작화 완료 기록
            </button>
          </div>
        </div>

        <div className="flex flex-col justify-center border-t border-line pt-2 sm:col-span-5 sm:border-t-0 sm:border-l sm:pl-3 sm:pt-0">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold text-fg">오늘의 원고 마감 할당량</span>
            <span
              data-testid="practical-daily-cut-quota"
              className="font-mono font-bold text-good"
            >
              {wbState.pomodoro.todayCompletedCuts}/{wbState.pomodoro.todayTargetCuts}컷 ({quotaPct}%)
            </span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-panel">
            <div
              className="h-full rounded-full bg-accent transition-all duration-200"
              style={{ width: `${quotaPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* 2. Interactive 2.5D Studio Floor Canvas + Selected Desk Practical File/Layer/Retake Workbench */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        {/* Left: Direct Interactive 2.5D Studio Floor Map (Keyboard WASD/Arrows/G/X + Clickable Desks) */}
        <div className="relative flex flex-col justify-between overflow-hidden rounded-lg border border-line bg-card p-2.5 lg:col-span-5">
          <div className="flex items-center justify-between gap-1 text-[11px]">
            <span className="font-semibold text-fg">
              실시간 2.5D 데스크 플로어 맵 (클릭 이동 · WASD/방향키/G/X)
            </span>
            <span className="rounded border border-line bg-panel px-1.5 py-0.5 font-mono text-[10px] text-accent">
              ({engineState.physics.x}, {engineState.physics.y})
            </span>
          </div>
          <input
            type="text"
            readOnly
            value=""
            aria-label="실무 2.5D 가상 스튜디오 키보드 주행 입력창 (WASD·방향키 이동, G 고스트, X 상호작용)"
            data-testid="practical-interactive-floor-map"
            placeholder="여기를 클릭 후 키보드 WASD / 방향키 / G / X 로 아바타 직접 주행"
            onKeyDown={handleFloorKeyDown}
            className="mt-1.5 w-full cursor-pointer rounded border border-line bg-panel px-2 py-1 text-[10px] text-fg-2 focus:border-accent"
          />

          <div
            className="relative mt-2 h-52 w-full overflow-hidden rounded-lg border border-line bg-panel"
            style={{
              backgroundImage: `url(${activeTheme.assetUrl})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            <div className="absolute inset-0 bg-card/55 backdrop-blur-[1px]" />

            {/* Clickable Episode Cut Desks on the 2.5D Floor */}
            {engineState.cutDesks.map((desk) => {
              const selected = desk.deskId === activeDesk.deskId;
              const wb = wbState.deskWorkbenches[desk.deskId];
              const openRetakes = wb
                ? wb.retakeNotes.filter((r) => !r.resolved).length
                : 0;
              const leftPct = Math.round((desk.x / 480) * 100);
              const topPct = Math.round((desk.y / 320) * 100);

              return (
                <button
                  key={desk.deskId}
                  type="button"
                  data-testid={`practical-floor-desk-node-${desk.deskId}`}
                  onClick={() => {
                    onApproachDesk(desk.deskId);
                    onBannerChange?.(
                      `[플로어 데스크 직행] ${desk.episodeCode} ${desk.cutNumber} (${wb?.dccFileName ?? desk.cutTitleKo}) 워크벤치 열기`,
                    );
                  }}
                  style={{ left: `${leftPct}%`, top: `${topPct}%` }}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-lg border px-2 py-1 text-left text-[10px] shadow-xs transition ${
                    selected
                      ? "z-20 border-accent bg-accent-soft font-bold text-accent"
                      : "z-10 border-line bg-panel/95 text-fg hover:border-accent"
                  }`}
                >
                  <div className="flex items-center gap-1">
                    <span className="font-mono">{desk.cutNumber}</span>
                    <span>· {wb?.checklistCompletionPercent ?? 100}%</span>
                    {openRetakes > 0 ? (
                      <span className="rounded bg-card px-1 text-[9px] text-warn">
                        리테이크 {openRetakes}
                      </span>
                    ) : null}
                  </div>
                  <div className="max-w-28 truncate text-[9px] text-fg-2">
                    {wb?.dccFileName}
                  </div>
                </button>
              );
            })}

            {/* Companion Mascot Follower on Floor */}
            <img
              src={engineState.companionFollower.activeSpriteUrl}
              alt={engineState.companionFollower.petNameKo}
              loading="lazy"
              style={{
                left: `${Math.round((engineState.companionFollower.x / 480) * 100)}%`,
                top: `${Math.round((engineState.companionFollower.y / 320) * 100)}%`,
              }}
              className="pointer-events-none absolute z-20 h-8 w-8 -translate-x-1/2 -translate-y-1/2 object-contain"
            />

            {/* Self Creator Avatar on Floor (Live Multi-Frame Small-Face Sprite + VFX) */}
            <div
              data-testid="practical-floor-self-avatar"
              style={{
                left: `${Math.round((engineState.physics.x / 480) * 100)}%`,
                top: `${Math.round((engineState.physics.y / 320) * 100)}%`,
              }}
              className="pointer-events-none absolute z-30 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
            >
              <div className="flex items-center gap-0.5">
                <img
                  src={resolveAvatarDirectionalWalkSprite(
                    engineState.physics.facingAngleRad,
                    engineState.physics.speedPxPerSec,
                    activeSpriteUrl,
                  )}
                  alt={activePersona.nameKo}
                  loading="lazy"
                  data-testid="practical-floor-self-avatar-sprite"
                  className="h-9 w-9 rounded-full border border-accent bg-panel/90 object-contain shadow-xs"
                />
                <StudioVirtualDynamicSpriteAvatar
                  personaId={activePersona.id}
                  actionId={
                    engineState.physics.speedPxPerSec > 8
                      ? "walk-stride"
                      : getDynamicCreatorPersonaSpec(activePersona.id).defaultActionId
                  }
                  expressionId={getDynamicCreatorPersonaSpec(activePersona.id).defaultExpressionId}
                  vfxId={getDynamicCreatorPersonaSpec(activePersona.id).defaultVfxId}
                  sizePx={48}
                  testId="practical-floor-dynamic-sprite"
                />
              </div>
              <span className="mt-0.5 rounded bg-panel/95 px-1.5 py-0.2 text-[9px] font-semibold text-fg">
                {activeWorkMode.dndShieldActive ? "🛡️ DND " : ""}
                {activePersona.nameKo.split(" ")[0]}
              </span>
            </div>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1 text-[10px] text-fg-2">
            <span>단축키: WASD/방향키 주행 · G 유령통과 · X 근접데스크 검수</span>
            <span className="font-mono text-accent">
              현재 선택: {activeDesk.episodeCode} {activeDesk.cutNumber}
            </span>
          </div>
        </div>

        {/* Right: Active Desk DCC File, Layer Quality Checklist, Retake Instructions & Shift Handoff */}
        <div className="flex flex-col justify-between rounded-lg border border-line bg-card p-3 lg:col-span-7">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
              <div>
                <div className="flex items-center gap-1.5">
                  <FileCheck2 className="h-4 w-4 text-accent" />
                  <span
                    data-testid="practical-active-dcc-filename"
                    className="font-mono text-xs font-bold text-fg"
                  >
                    {activeDeskWb.dccFileName}
                  </span>
                  <span className="rounded border border-accent bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                    {activeDeskWb.dccAppBadge}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] text-fg-2">
                  {activeDesk.episodeCode} {activeDesk.cutNumber} ({activeDesk.cutTitleKo}) · 공정:{" "}
                  <strong className="text-fg">
                    {PIPELINE_STAGE_LABELS_KO[activeDesk.stage]} ({activeDesk.progressPercent}%)
                  </strong>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  data-testid="practical-handoff-dept-btn"
                  onClick={() => {
                    const nextWb = handoffDeskToNextDepartment(wbState, activeDesk.deskId);
                    setWbState(nextWb);
                    onAdvanceDeskStage(activeDesk.deskId);
                    onBannerChange?.(
                      `[파트 인계 완료] ${activeDeskWb.dccFileName} → ${activeDeskWb.nextDepartmentKo} (인계 누적 ${
                        nextWb.deskWorkbenches[activeDesk.deskId].handoffCount
                      }회)`,
                    );
                  }}
                  className="flex items-center gap-1 rounded border border-accent bg-accent-soft px-2.5 py-1 text-[10px] font-semibold text-accent"
                >
                  <Send className="h-3 w-3" />
                  다음 파트 인계 ({activeDeskWb.nextDepartmentKo})
                </button>
              </div>
            </div>

            {/* Layer & Deliverable Quality Checklist */}
            <div className="mt-2.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-fg">
                  필수 레이어·해상도 납품 체크리스트
                </span>
                <span
                  data-testid="practical-checklist-percent"
                  className="font-mono font-bold text-good"
                >
                  검수 완료율 {activeDeskWb.checklistCompletionPercent}%
                </span>
              </div>
              <div className="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                {activeDeskWb.checklist.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    data-testid={`practical-checklist-${item.id}-btn`}
                    onClick={() => {
                      const next = toggleDeskQualityChecklistItem(
                        wbState,
                        activeDesk.deskId,
                        item.id,
                      );
                      setWbState(next);
                    }}
                    className={`flex items-center gap-1.5 rounded border p-2 text-left text-[10px] transition ${
                      item.checked
                        ? "border-accent bg-accent-soft/40 font-semibold text-fg"
                        : "border-line bg-panel text-fg-2"
                    }`}
                  >
                    <CheckCircle2
                      className={`h-3.5 w-3.5 shrink-0 ${
                        item.checked ? "text-good" : "text-fg-3"
                      }`}
                    />
                    <span className="line-clamp-2">{item.labelKo}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Live Retake / Review Instructions */}
            <div className="mt-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1 text-[11px] font-semibold text-fg">
                  <MessageSquarePlus className="h-3.5 w-3.5 text-accent" />
                  데스크 실시간 수정 지시서 (리테이크 & PD 코멘트)
                </span>
                <span className="text-[10px] text-fg-2">
                  미해결 리테이크:{" "}
                  <strong className="font-mono text-warn">
                    {activeDeskWb.retakeNotes.filter((r) => !r.resolved).length}건
                  </strong>
                </span>
              </div>

              <div className="mt-1.5 flex gap-1.5">
                <input
                  type="text"
                  value={retakeDraft}
                  aria-label="데스크 리테이크 수정 지시 입력"
                  data-testid="practical-retake-input"
                  placeholder="예: 4컷 말풍선 위치 우측 12px 이동 및 역광 레이어 불투명도 85% 조정..."
                  onChange={(e) => setRetakeDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      handleAddRetake();
                    }
                  }}
                  className="flex-1 rounded border border-line bg-panel px-2.5 py-1 text-[11px] text-fg"
                />
                <button
                  type="button"
                  data-testid="practical-retake-submit-btn"
                  onClick={handleAddRetake}
                  className="rounded border border-accent bg-accent-soft px-2.5 py-1 text-[11px] font-semibold text-accent"
                >
                  지시 등록
                </button>
              </div>

              <ul className="mt-1.5 space-y-1">
                {activeDeskWb.retakeNotes.map((note) => (
                  <li
                    key={note.id}
                    className="flex items-center justify-between gap-2 rounded border border-line bg-panel px-2.5 py-1 text-[10px]"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-semibold text-fg">{note.authorKo}: </span>
                      <span
                        className={
                          note.resolved ? "line-through text-fg-3" : "text-fg-2"
                        }
                      >
                        {note.noteKo}
                      </span>
                    </div>
                    <button
                      type="button"
                      data-testid={`practical-retake-resolve-${note.id}-btn`}
                      onClick={() => {
                        const next = toggleResolveDeskRetakeNote(
                          wbState,
                          activeDesk.deskId,
                          note.id,
                        );
                        setWbState(next);
                      }}
                      className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-semibold ${
                        note.resolved
                          ? "border-line bg-card text-good"
                          : "border-accent bg-accent-soft text-accent"
                      }`}
                    >
                      {note.resolved ? "해결됨" : "수정 완료 처리"}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* 3. One-Click Daily Studio Handoff Briefing Generator */}
          <div className="mt-2.5 border-t border-line pt-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1 text-[11px] font-semibold text-fg">
                <ShieldAlert className="h-3.5 w-3.5 text-accent" />
                교대·마감용 일일 업무 인수인계서 자동 생성 (슬랙·노션·PD 보고용)
              </span>
              <button
                type="button"
                data-testid="practical-generate-handoff-btn"
                onClick={() => {
                  const next = generateDailyStudioHandoffMarkdown(wbState, engineState);
                  setWbState(next);
                  onBannerChange?.(
                    "[일일 업무 인수인계서 생성] 전 데스크 파일·레이어 검수율·리테이크 현황이 마크다운 브리핑으로 요약되었습니다.",
                  );
                }}
                className="rounded border border-accent bg-accent-soft px-2.5 py-1 text-[10px] font-semibold text-accent"
              >
                일일 업무 인수인계서 생성
              </button>
            </div>
            {wbState.lastGeneratedHandoffMarkdown ? (
              <pre
                data-testid="practical-handoff-markdown-box"
                className="mt-1.5 max-h-28 overflow-y-auto whitespace-pre-wrap rounded border border-line bg-panel p-2 font-mono text-[10px] text-fg-2"
              >
                {wbState.lastGeneratedHandoffMarkdown}
              </pre>
            ) : null}
          </div>

          {/* 4. Nano Banana v13 Interactive Studio Props & Creator Dynamic Emotes */}
          <div className="mt-2.5 border-t border-line pt-2.5">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="rounded border border-line bg-panel p-2">
                <div className="text-[10px] font-bold text-fg">
                  크리에이터 다이내믹 이모트 & 보행 스프라이트 (v13 RGBA)
                </div>
                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                  {engineState.v13Emotes.map((emote) => {
                    const active = emote.id === selectedV13EmoteId;
                    return (
                      <button
                        key={emote.id}
                        type="button"
                        data-testid={`nextgen-v13-emote-${emote.id}-btn`}
                        onClick={() => {
                          setSelectedV13EmoteId(emote.id);
                          onBannerChange?.(
                            `[크리에이터 다이내믹 이모트 발동] ${emote.labelKo} — ${emote.descriptionKo}`,
                          );
                        }}
                        className={`flex items-center gap-1.5 rounded border p-1.5 text-left text-[10px] transition ${
                          active
                            ? "border-accent bg-accent-soft text-accent font-semibold"
                            : "border-line bg-card text-fg-2 hover:text-fg"
                        }`}
                      >
                        <img
                          src={emote.spriteUrl}
                          alt={emote.labelKo}
                          loading="lazy"
                          decoding="async"
                          className="h-8 w-8 shrink-0 rounded border border-line bg-panel object-contain"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate">{emote.labelKo}</div>
                          <div className="text-[9px] text-fg-3">
                            단축키 [{emote.shortcutKey}]
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded border border-line bg-panel p-2">
                <div className="text-[10px] font-bold text-fg">
                  2.5D 아이소메트릭 인터랙티브 스튜디오 가구·존 프롭 (v13 RGBA)
                </div>
                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                  {engineState.v13Props.map((prop) => {
                    const active = prop.id === selectedV13PropId;
                    return (
                      <button
                        key={prop.id}
                        type="button"
                        data-testid={`nextgen-v13-prop-${prop.id}-btn`}
                        onClick={() => {
                          setSelectedV13PropId(prop.id);
                          onBannerChange?.(
                            `[스튜디오 인터랙티브 가구 작동] ${prop.labelKo} — ${prop.interactiveHintKo}`,
                          );
                        }}
                        className={`flex items-center gap-1.5 rounded border p-1.5 text-left text-[10px] transition ${
                          active
                            ? "border-accent bg-accent-soft text-accent font-semibold"
                            : "border-line bg-card text-fg-2 hover:text-fg"
                        }`}
                      >
                        <img
                          src={prop.spriteUrl}
                          alt={prop.labelKo}
                          loading="lazy"
                          decoding="async"
                          className="h-8 w-8 shrink-0 rounded border border-line bg-panel object-contain"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate">{prop.labelKo}</div>
                          <div className="truncate text-[9px] text-fg-3">
                            {prop.zoneRoleKo}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
