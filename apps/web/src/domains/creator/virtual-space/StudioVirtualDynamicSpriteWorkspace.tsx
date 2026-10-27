"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Flame,
  Link2,
  Pause,
  Pin,
  Play,
  Sparkles,
  Users,
  Wand2,
  Zap,
} from "lucide-react";

import {
  StudioVirtualDynamicSpriteAvatar,
  StudioVirtualDynamicSpriteSheetStrip,
} from "./StudioVirtualDynamicSpriteAvatar";
import {
  DYNAMIC_CREATOR_SPRITE_CAST,
  DYNAMIC_SPRITE_ACTIONS,
  DYNAMIC_SPRITE_EXPRESSIONS,
  DYNAMIC_SPRITE_VFX_PRESETS,
  PRACTICAL_COLLAB_ZONES,
  addPracticalCollabPinNote,
  createInitialPracticalSpriteWorkspaceState,
  getDynamicCreatorPersonaSpec,
  toggleCollaboratorSynergyPair,
  triggerCollaboratorTaskAction,
  triggerWorkspaceFeverAwakening,
  updateCollaboratorSpriteConfig,
} from "./studio-virtual-space-dynamic-sprite-engine";

export interface StudioVirtualDynamicSpriteWorkspaceProps {
  readonly onBannerChange?: (messageKo: string) => void;
}

const TASK_STATUS_BADGE_KO = {
  todo: { label: "대기", cls: "border-line bg-card text-fg-2" },
  "in-progress": { label: "작화·조형 중", cls: "border-accent bg-accent-soft text-accent" },
  "review-ready": { label: "검수 대기", cls: "border-warn bg-raised text-warn" },
  approved: { label: "승인 완료", cls: "border-good bg-good-soft text-good" },
} as const;

export function StudioVirtualDynamicSpriteWorkspace({
  onBannerChange,
}: StudioVirtualDynamicSpriteWorkspaceProps) {
  const [ws, setWs] = useState(createInitialPracticalSpriteWorkspaceState);
  const [pinDraft, setPinDraft] = useState("");
  const [inspectFrameIdx, setInspectFrameIdx] = useState(0);

  const activeUnit = useMemo(
    () =>
      ws.collaborators.find((c) => c.personaId === ws.selectedPersonaId) ??
      ws.collaborators[0],
    [ws.collaborators, ws.selectedPersonaId],
  );
  const activePersona = useMemo(
    () => getDynamicCreatorPersonaSpec(activeUnit.personaId),
    [activeUnit.personaId],
  );

  const synergyPairs = useMemo(() => {
    const seen = new Set<string>();
    const pairs: {
      readonly key: string;
      readonly from: typeof activeUnit;
      readonly to: typeof activeUnit;
    }[] = [];
    for (const unit of ws.collaborators) {
      if (!unit.pairedWithPersonaId) continue;
      const partner = ws.collaborators.find(
        (c) => c.personaId === unit.pairedWithPersonaId,
      );
      if (!partner) continue;
      const pairKey = [unit.personaId, partner.personaId].sort().join("--");
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);
      pairs.push({ key: pairKey, from: unit, to: partner });
    }
    return pairs;
  }, [ws.collaborators]);

  const applyConfigPatch = (
    patch: Parameters<typeof updateCollaboratorSpriteConfig>[2],
  ) => {
    const next = updateCollaboratorSpriteConfig(ws, activeUnit.personaId, patch);
    setWs(next);
    onBannerChange?.(next.lastCollabEventKo);
  };

  const handleAddPin = () => {
    const trimmed = pinDraft.trim();
    if (!trimmed) return;
    const next = addPracticalCollabPinNote(
      ws,
      activeUnit.zoneId,
      activeUnit.personaId,
      activeUnit.taskCode,
      trimmed,
    );
    setWs(next);
    setPinDraft("");
    onBannerChange?.(next.lastCollabEventKo);
  };

  return (
    <section
      data-testid="studio-virtual-dynamic-sprite-workspace"
      aria-label="다채로운 소두 다중프레임 캐릭터 스프라이트 및 화려한 특수효과 실무 협업 스튜디오"
      className="space-y-4 rounded-2xl border border-accent bg-card/95 p-4 text-fg shadow-md"
    >
      {/* 1. 상단 헤더: 다중프레임 스프라이트 요약 + 팀 콤보 + FPS/일시정지 + 마감 피버 각성 */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-fg">
            <Wand2 className="h-4 w-4 text-accent" />
            ✨ 다채로운 소두(5.8등신) 다중프레임 캐릭터 스프라이트 · 특수효과(VFX) · 실무 협업 스튜디오
          </h3>
          <p className="mt-0.5 text-xs text-fg-2">
            정적인 이미지 대신 작은 얼굴 비율에 10종 표정 · 10종 8프레임 역동적 동작 · 8종 화려한 특수효과(VFX)를 갖춘 8인 개성파 캐릭터가 실시간으로 업무 협업을 수행합니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span
            data-testid="dynamic-workspace-team-combo"
            className="rounded-full border border-accent bg-accent-soft px-2.5 py-1 font-mono text-xs font-extrabold text-accent"
          >
            ⚡ TEAM COMBO ×{ws.teamComboCount}
          </span>

          {(
            [
              [8, "8fps"],
              [12, "12fps"],
              [24, "24fps"],
            ] as const
          ).map(([fpsVal, label]) => (
            <button
              key={fpsVal}
              type="button"
              data-testid={`dynamic-workspace-fps-${fpsVal}-btn`}
              onClick={() => setWs((prev) => ({ ...prev, globalFps: fpsVal }))}
              className={`rounded-lg border px-2 py-1 font-mono text-[11px] font-semibold transition ${
                ws.globalFps === fpsVal
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-panel text-fg-2"
              }`}
            >
              {label}
            </button>
          ))}

          {/* modern-web-guidance: motion — Provide Pause mechanism for persistent animations */}
          <button
            type="button"
            data-testid="dynamic-workspace-pause-toggle-btn"
            aria-pressed={ws.animationPaused}
            onClick={() =>
              setWs((prev) => ({
                ...prev,
                animationPaused: !prev.animationPaused,
              }))
            }
            className="inline-flex items-center gap-1 rounded-lg border border-line bg-panel px-2.5 py-1 text-xs font-semibold text-fg hover:border-accent"
          >
            {ws.animationPaused ? (
              <>
                <Play className="h-3.5 w-3.5 text-good" />
                모션 재생
              </>
            ) : (
              <>
                <Pause className="h-3.5 w-3.5 text-warn" />
                모션 일시정지
              </>
            )}
          </button>

          <button
            type="button"
            data-testid="dynamic-workspace-fever-btn"
            aria-pressed={ws.feverAwakeningActive}
            onClick={() => {
              const next = triggerWorkspaceFeverAwakening(ws);
              setWs(next);
              onBannerChange?.(next.lastCollabEventKo);
            }}
            className={`inline-flex items-center gap-1 rounded-xl border px-3 py-1 text-xs font-bold shadow-xs transition ${
              ws.feverAwakeningActive
                ? "border-warn bg-raised text-warn"
                : "border-accent bg-accent-soft text-accent hover:opacity-95"
            }`}
          >
            <Flame className="h-3.5 w-3.5" />
            {ws.feverAwakeningActive
              ? "🔥 전 팀원 마감 피버 각성 중 (24fps)"
              : "🔥 전 팀원 마감 피버 각성 발동"}
          </button>
        </div>
      </div>

      {/* 실시간 이벤트 배너 */}
      <div
        role="status"
        aria-live="polite"
        data-testid="dynamic-workspace-event-banner"
        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-panel px-3 py-1.5 text-xs text-fg-2"
      >
        <span>✨ {ws.lastCollabEventKo}</span>
        <span className="font-mono text-[11px] text-accent">
          선택 캐릭터: {activePersona.characterNameKo} ({activeUnit.headTallUnits.toFixed(1)}등신 소두 · {activeUnit.expressionId} · {activeUnit.actionId})
        </span>
      </div>

      {/* 2. 실시간 2.5D 실무 협업 오피스 플로어 (4대 협업 존 + 8인 다중프레임 스프라이트 + 시너지 레이저 빔) */}
      <div
        data-testid="dynamic-collab-office-stage"
        className="relative h-96 w-full overflow-hidden rounded-2xl border border-line bg-panel p-3"
      >
        {/* 시너지 페어링 연결 레이저 빔 SVG 오버레이 */}
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 h-full w-full"
        >
          {synergyPairs.map((pair) => (
            <g key={pair.key}>
              <path
                d={`M ${pair.from.xPct} ${pair.from.yPct} Q ${(pair.from.xPct + pair.to.xPct) / 2} ${Math.min(pair.from.yPct, pair.to.yPct) - 10} ${pair.to.xPct} ${pair.to.yPct}`}
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth="0.6"
                strokeDasharray="1.8 1.2"
                opacity="0.85"
              />
            </g>
          ))}
        </svg>

        {/* 4대 실무 업무 협업 존 카드 */}
        {PRACTICAL_COLLAB_ZONES.map((zone) => {
          const isZoneSelected = ws.selectedZoneId === zone.id;
          const selectZone = () => {
            applyConfigPatch({
              zoneId: zone.id,
              xPct: zone.floorRect.xPct + 20,
              yPct: zone.floorRect.yPct + 22,
              statusBubbleKo: `${zone.titleKo} 합류 완료!`,
            } as Parameters<typeof updateCollaboratorSpriteConfig>[2]);
          };
          return (
            <div
              key={zone.id}
              role="button"
              tabIndex={0}
              data-testid={`dynamic-collab-zone-${zone.id}`}
              onClick={selectZone}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  selectZone();
                }
              }}
              style={{
                left: `${zone.floorRect.xPct}%`,
                top: `${zone.floorRect.yPct}%`,
                width: `${zone.floorRect.widthPct}%`,
                height: `${zone.floorRect.heightPct}%`,
              }}
              className={`absolute cursor-pointer rounded-xl border p-2.5 transition ${
                isZoneSelected
                  ? "border-accent bg-card/90 shadow-sm"
                  : "border-line bg-card/70 hover:border-accent/60"
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <strong className="text-xs font-bold text-fg">{zone.titleKo}</strong>
                <span className="rounded border border-line bg-panel px-1.5 py-0.5 text-[10px] text-fg-2">
                  클릭 시 현재 캐릭터 이동·협업
                </span>
              </div>
              <p className="mt-0.5 text-[10px] text-fg-2">{zone.subtitleKo}</p>
            </div>
          );
        })}

        {/* 8인 개성파 다중프레임 소두 캐릭터 스프라이트 실시간 배치 */}
        {ws.collaborators.map((unit) => {
          const isSelected = unit.personaId === activeUnit.personaId;
          const badgeInfo = TASK_STATUS_BADGE_KO[unit.taskStatus];
          const selectUnit = () => {
            setWs((prev) => ({
              ...prev,
              selectedPersonaId: unit.personaId,
              selectedZoneId: unit.zoneId,
            }));
          };
          return (
            <div
              key={unit.personaId}
              role="button"
              tabIndex={0}
              data-testid={`dynamic-stage-unit-${unit.personaId}`}
              onClick={(e) => {
                e.stopPropagation();
                selectUnit();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  selectUnit();
                }
              }}
              style={{
                left: `${unit.xPct}%`,
                top: `${unit.yPct}%`,
                transform: "translate3d(-50%, -50%, 0)",
              }}
              className={`absolute z-20 flex cursor-pointer flex-col items-center rounded-xl p-1 transition ${
                isSelected
                  ? "ring-2 ring-accent bg-accent-soft/20"
                  : "hover:bg-card/50"
              }`}
            >
              <StudioVirtualDynamicSpriteAvatar
                personaId={unit.personaId}
                actionId={unit.actionId}
                expressionId={unit.expressionId}
                vfxId={unit.vfxId}
                headTallUnits={unit.headTallUnits}
                fps={ws.globalFps}
                paused={ws.animationPaused}
                sizePx={78}
                showVfx={true}
                statusBubbleKo={unit.statusBubbleKo}
                comboCount={unit.taskStatus === "approved" ? 10 : undefined}
                testId={`dynamic-stage-sprite-${unit.personaId}`}
              />
              <div className="mt-0.5 flex items-center gap-1 rounded-md border border-line bg-panel/95 px-1.5 py-0.5 text-[9.5px] shadow-xs">
                <span className="font-bold text-fg">
                  {getDynamicCreatorPersonaSpec(unit.personaId).characterNameKo.split(" (")[0]}
                </span>
                <span className="font-mono text-accent">{unit.taskCode}</span>
                <span className={`rounded border px-1 text-[8.5px] ${badgeInfo.cls}`}>
                  {unit.progressPercent}%
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 3. 중단 2열: [좌] 소두 비율·10종 표정·10종 동작·8종 VFX·8프레임 시트 스튜디오 | [우] 실용적 업무 협업 보드 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* 좌측: 캐릭터 & 다중프레임 스프라이트 커스터마이저 */}
        <div className="space-y-3 rounded-xl border border-line bg-panel p-3.5 lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="flex items-center gap-1.5 text-xs font-bold text-fg">
              <Sparkles className="h-4 w-4 text-accent" />
              8인 개성파 캐릭터 · 소두 비율 · 10종 표정 · 10종 역동적 동작 · 8종 특수효과(VFX) 조합기
            </strong>
            <span className="font-mono text-[11px] text-accent">
              소두 비율: {activeUnit.headTallUnits.toFixed(1)}등신 (얼굴비 {(1 / activeUnit.headTallUnits).toFixed(3)})
            </span>
          </div>

          {/* 8인 캐릭터 선택 버튼 */}
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {DYNAMIC_CREATOR_SPRITE_CAST.map((cast) => {
              const selected = cast.personaId === activeUnit.personaId;
              return (
                <button
                  key={cast.personaId}
                  type="button"
                  data-testid={`dynamic-cast-select-${cast.personaId}-btn`}
                  onClick={() =>
                    setWs((prev) => ({
                      ...prev,
                      selectedPersonaId: cast.personaId,
                    }))
                  }
                  className={`rounded-lg border p-2 text-left text-[11px] transition ${
                    selected
                      ? "border-accent bg-accent-soft font-bold text-accent"
                      : "border-line bg-card text-fg-2 hover:text-fg"
                  }`}
                >
                  <div className="truncate">{cast.characterNameKo}</div>
                  <div className="truncate text-[9.5px] text-fg-3">
                    {cast.signatureWeaponKo}
                  </div>
                </button>
              );
            })}
          </div>

          {/* 메인 클로즈업 프리뷰 + 소두 비율 슬라이더 */}
          <div className="grid grid-cols-1 gap-3 rounded-xl border border-line bg-card p-3 sm:grid-cols-12">
            <div className="flex flex-col items-center justify-center sm:col-span-5">
              <StudioVirtualDynamicSpriteAvatar
                personaId={activeUnit.personaId}
                actionId={activeUnit.actionId}
                expressionId={activeUnit.expressionId}
                vfxId={activeUnit.vfxId}
                headTallUnits={activeUnit.headTallUnits}
                fps={ws.globalFps}
                paused={ws.animationPaused}
                sizePx={136}
                showVfx={true}
                showBadge={true}
                comboCount={ws.teamComboCount}
                testId="dynamic-inspector-hero-sprite"
              />
            </div>

            <div className="flex flex-col justify-between space-y-2 text-xs sm:col-span-7">
              <div>
                <div className="font-bold text-fg">{activePersona.characterNameKo}</div>
                <div className="text-[11px] text-accent">{activePersona.roleTitleKo}</div>
                <p className="mt-1 text-[11px] text-fg-2">
                  {activePersona.personalityTraitKo}
                </p>
              </div>

              <label className="block space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="font-semibold text-fg">
                    작은 얼굴(소두) 등신 비율 조절 (5.2 ~ 6.4등신)
                  </span>
                  <span
                    data-testid="dynamic-head-tall-readout"
                    className="font-mono font-bold text-accent"
                  >
                    {activeUnit.headTallUnits.toFixed(1)}등신
                  </span>
                </div>
                <input
                  type="range"
                  min={5.2}
                  max={6.4}
                  step={0.1}
                  value={activeUnit.headTallUnits}
                  aria-label="작은 얼굴 소두 등신 비율 조절"
                  data-testid="dynamic-head-tall-slider"
                  onChange={(e) =>
                    applyConfigPatch({ headTallUnits: Number(e.target.value) })
                  }
                  className="w-full accent-current"
                />
              </label>

              <div className="rounded-lg border border-line bg-panel px-2.5 py-1.5 text-[10px] text-fg-2">
                시그니처 장비: <strong className="text-fg">{activePersona.signatureWeaponKo}</strong>
              </div>
            </div>
          </div>

          {/* 10종 다양한 표정 선택 */}
          <div>
            <div className="mb-1 text-[11px] font-bold text-fg">
              10종 다채로운 소두 표정 전환 (눈동자 하이라이트 · 눈썹 각도 · 홍조 · 립싱크)
            </div>
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-5">
              {DYNAMIC_SPRITE_EXPRESSIONS.map((expr) => {
                const active = activeUnit.expressionId === expr.id;
                return (
                  <button
                    key={expr.id}
                    type="button"
                    data-testid={`dynamic-expr-${expr.id}-btn`}
                    onClick={() => applyConfigPatch({ expressionId: expr.id })}
                    className={`rounded-lg border px-2 py-1 text-left text-[10px] transition ${
                      active
                        ? "border-accent bg-accent-soft font-bold text-accent"
                        : "border-line bg-card text-fg-2 hover:text-fg"
                    }`}
                  >
                    {expr.badgeEmoji} {expr.labelKo}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 10종 다양한 8프레임 동작 선택 */}
          <div>
            <div className="mb-1 text-[11px] font-bold text-fg">
              10종 역동적 8프레임 연속 동작 전환 (잔상 대시 · 신티크 콤보 · 3D 조형 · 점프 환호 · 각성)
            </div>
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-5">
              {DYNAMIC_SPRITE_ACTIONS.map((act) => {
                const active = activeUnit.actionId === act.id;
                return (
                  <button
                    key={act.id}
                    type="button"
                    data-testid={`dynamic-action-${act.id}-btn`}
                    onClick={() =>
                      applyConfigPatch({
                        actionId: act.id,
                        vfxId: act.recommendedVfxId,
                      })
                    }
                    className={`rounded-lg border px-2 py-1 text-left text-[10px] transition ${
                      active
                        ? "border-accent bg-accent-soft font-bold text-accent"
                        : "border-line bg-card text-fg-2 hover:text-fg"
                    }`}
                  >
                    {act.badgeEmoji} {act.labelKo}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 8종 화려한 특수효과(VFX) 선택 */}
          <div>
            <div className="mb-1 text-[11px] font-bold text-fg">
              8종 화려한 특수효과(VFX) 오라 레이어 전환
            </div>
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
              {DYNAMIC_SPRITE_VFX_PRESETS.map((vfx) => {
                const active = activeUnit.vfxId === vfx.id;
                return (
                  <button
                    key={vfx.id}
                    type="button"
                    data-testid={`dynamic-vfx-${vfx.id}-btn`}
                    onClick={() => applyConfigPatch({ vfxId: vfx.id })}
                    className={`rounded-lg border px-2 py-1 text-left text-[10px] transition ${
                      active
                        ? "border-accent bg-accent-soft font-bold text-accent"
                        : "border-line bg-card text-fg-2 hover:text-fg"
                    }`}
                  >
                    {vfx.badgeEmoji} {vfx.labelKo}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 8프레임 연속 스프라이트 시트 아틀라스 스트립 */}
          <div>
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <strong className="text-fg">
                실시간 8프레임 스프라이트 시트 아틀라스 스트립 (Frame 1 ~ Frame 8)
              </strong>
              <span className="font-mono text-[10px] text-fg-2">
                클릭하여 개별 프레임 관절·표정 정밀 검수
              </span>
            </div>
            <StudioVirtualDynamicSpriteSheetStrip
              personaId={activeUnit.personaId}
              actionId={activeUnit.actionId}
              expressionId={activeUnit.expressionId}
              vfxId={activeUnit.vfxId}
              headTallUnits={activeUnit.headTallUnits}
              activeFrameIndex={inspectFrameIdx}
              onSelectFrame={setInspectFrameIdx}
            />
          </div>
        </div>

        {/* 우측: 실용적 업무 협업 보드 (담당 원고/3D 컷 공정 · 실시간 페어링 · 합평 핀) */}
        <div className="flex flex-col justify-between space-y-3 rounded-xl border border-line bg-panel p-3.5 lg:col-span-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-line pb-2">
              <strong className="flex items-center gap-1.5 text-xs font-bold text-fg">
                <Users className="h-4 w-4 text-accent" />
                실용적 웹툰·3D 제작 업무 협업 워크벤치
              </strong>
              <span className="rounded border border-accent bg-accent-soft px-2 py-0.5 font-mono text-[10px] font-bold text-accent">
                {activeUnit.dccToolBadge}
              </span>
            </div>

            {/* 현재 선택된 캐릭터의 실시간 담당 컷/3D 과업 제어 카드 */}
            <div className="space-y-2 rounded-xl border border-line bg-card p-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-accent">
                  {activeUnit.taskCode}
                </span>
                <span
                  data-testid="dynamic-active-task-status"
                  className={`rounded border px-2 py-0.5 text-[10px] font-bold ${
                    TASK_STATUS_BADGE_KO[activeUnit.taskStatus].cls
                  }`}
                >
                  {TASK_STATUS_BADGE_KO[activeUnit.taskStatus].label} ({activeUnit.progressPercent}%)
                </span>
              </div>
              <div className="text-xs font-bold text-fg">{activeUnit.taskTitleKo}</div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-panel">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-200"
                  style={{ width: `${activeUnit.progressPercent}%` }}
                />
              </div>

              <div className="grid grid-cols-3 gap-1.5 pt-1">
                <button
                  type="button"
                  data-testid="dynamic-task-advance-btn"
                  onClick={() => {
                    const next = triggerCollaboratorTaskAction(
                      ws,
                      activeUnit.personaId,
                      "advance-progress",
                    );
                    setWs(next);
                    onBannerChange?.(next.lastCollabEventKo);
                  }}
                  className="rounded-lg border border-line bg-panel px-2 py-1.5 text-[10px] font-semibold text-fg hover:border-accent"
                >
                  <Zap className="mr-0.5 inline h-3 w-3 text-accent" />
                  공정 +15% 진행
                </button>
                <button
                  type="button"
                  data-testid="dynamic-task-review-btn"
                  onClick={() => {
                    const next = triggerCollaboratorTaskAction(
                      ws,
                      activeUnit.personaId,
                      "request-review",
                    );
                    setWs(next);
                    onBannerChange?.(next.lastCollabEventKo);
                  }}
                  className="rounded-lg border border-line bg-panel px-2 py-1.5 text-[10px] font-semibold text-fg hover:border-accent"
                >
                  합평 검수 요청
                </button>
                <button
                  type="button"
                  data-testid="dynamic-task-approve-btn"
                  onClick={() => {
                    const next = triggerCollaboratorTaskAction(
                      ws,
                      activeUnit.personaId,
                      "approve-cut",
                    );
                    setWs(next);
                    onBannerChange?.(next.lastCollabEventKo);
                  }}
                  className="rounded-lg border border-accent bg-accent-soft px-2 py-1.5 text-[10px] font-bold text-accent"
                >
                  <CheckCircle2 className="mr-0.5 inline h-3 w-3" />
                  승인 (환호 VFX)
                </button>
              </div>
            </div>

            {/* 실시간 공동작업 시너지 페어링 연결 */}
            <div className="space-y-1.5 rounded-xl border border-line bg-card p-3">
              <div className="flex items-center justify-between text-[11px]">
                <strong className="flex items-center gap-1 text-fg">
                  <Link2 className="h-3.5 w-3.5 text-accent" />
                  실시간 공동작업 시너지 페어링 (레이저 빔 연결)
                </strong>
                <span className="text-[10px] text-fg-2">
                  현재 파트너: {activeUnit.pairedWithPersonaId ?? "없음"}
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {DYNAMIC_CREATOR_SPRITE_CAST.filter(
                  (c) => c.personaId !== activeUnit.personaId,
                ).map((partner) => {
                  const isPaired =
                    activeUnit.pairedWithPersonaId === partner.personaId;
                  return (
                    <button
                      key={partner.personaId}
                      type="button"
                      data-testid={`dynamic-pair-partner-${partner.personaId}-btn`}
                      onClick={() => {
                        const next = toggleCollaboratorSynergyPair(
                          ws,
                          activeUnit.personaId,
                          partner.personaId,
                        );
                        setWs(next);
                        onBannerChange?.(next.lastCollabEventKo);
                      }}
                      className={`rounded-lg border px-2 py-1 text-[10px] transition ${
                        isPaired
                          ? "border-accent bg-accent-soft font-bold text-accent"
                          : "border-line bg-panel text-fg-2 hover:text-fg"
                      }`}
                    >
                      🤝 {partner.characterNameKo.split(" (")[0]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 실시간 캔버스 합평 핀 & 리테이크 노트 */}
            <div className="space-y-2 rounded-xl border border-line bg-card p-3">
              <strong className="flex items-center gap-1 text-[11px] font-bold text-fg">
                <Pin className="h-3.5 w-3.5 text-accent" />
                실시간 캔버스 합평 핀 & 파트 간 협업 노트 ({ws.canvasPins.length}건)
              </strong>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={pinDraft}
                  aria-label="실시간 캔버스 합평 핀 코멘트 입력"
                  data-testid="dynamic-pin-input"
                  placeholder="예: EP43-C04 3D 성채 투시선과 캐릭터 검기 이펙트 레이어 병합 요청..."
                  onChange={(e) => setPinDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      handleAddPin();
                    }
                  }}
                  className="flex-1 rounded-lg border border-line bg-panel px-2.5 py-1 text-[11px] text-fg"
                />
                <button
                  type="button"
                  data-testid="dynamic-pin-submit-btn"
                  onClick={handleAddPin}
                  className="rounded-lg border border-accent bg-accent-soft px-2.5 py-1 text-[11px] font-bold text-accent"
                >
                  핀 등록
                </button>
              </div>

              <ul className="max-h-36 space-y-1 overflow-y-auto">
                {ws.canvasPins.map((pin) => (
                  <li
                    key={pin.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-[10px]"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-mono font-bold text-accent">
                        [{pin.targetTaskCode}]{" "}
                      </span>
                      <span className="text-fg">{pin.noteKo}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
