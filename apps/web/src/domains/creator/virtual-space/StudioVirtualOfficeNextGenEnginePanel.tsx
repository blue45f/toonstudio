"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Compass, Flame, Ghost, Headphones, Layers, Sparkles, SunMedium, Volume2, Wand2 } from "lucide-react";

import { StudioVirtualDynamicSpriteAvatar } from "./StudioVirtualDynamicSpriteAvatar";
import { StudioVirtualOfficePracticalWorkbenchSection } from "./StudioVirtualOfficePracticalWorkbenchSection";
import { getDynamicCreatorPersonaSpec } from "./studio-virtual-space-dynamic-sprite-engine";
import {
  NEXTGEN_COMPETITOR_REA_BENCHMARKS, PIPELINE_STAGE_LABELS_KO, STUDIO_LIGHTING_MOODS,
  advanceDeskEpisodeCutStage, applyStudioLightingMood, approachCutDeskAndInspect,
  computeCharacterSecondaryMotion, computeSpatialAudioGainAndPan,
  createInitialNextGenStudioEngineState, navigateAvatarClickToWalk,
  selectNanoBananaCreatorPersona, selectNanoBananaStudioTheme,
  setSoundscapeChannelGain, stepAvatarPhysicsTick, toggleGatherGhostModeGKey,
  triggerNearestObjectWithXKey, triggerWebAudioSynthesizerPing,
  type CreatorPersonaPose, type NanoBananaCreatorPersonaId,
  type NanoBananaStudioThemeId, type StudioLightingMoodId,
} from "./studio-virtual-office-nextgen-engine-model";

export interface StudioVirtualOfficeNextGenEnginePanelProps {
  readonly onBannerChange?: (banner: string) => void;
}

export function StudioVirtualOfficeNextGenEnginePanel({
  onBannerChange,
}: StudioVirtualOfficeNextGenEnginePanelProps) {
  const [state, setState] = useState(createInitialNextGenStudioEngineState);
  const [wallBarriers, setWallBarriers] = useState<0 | 1>(0);
  const [offscreenSkipped, setOffscreenSkipped] = useState(false);
  const sectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el || typeof document === "undefined") return;
    if ("contentVisibility" in document.documentElement.style) {
      const handleVisibility = (event: Event) => {
        setOffscreenSkipped(Boolean((event as Event & { readonly skipped?: boolean }).skipped));
      };
      el.addEventListener("contentvisibilityautostatechange", handleVisibility);
      return () => el.removeEventListener("contentvisibilityautostatechange", handleVisibility);
    }
    if (typeof IntersectionObserver !== "undefined") {
      const observer = new IntersectionObserver(
        (entries) => setOffscreenSkipped(!entries[0]?.isIntersecting),
        { rootMargin: "200px" },
      );
      observer.observe(el);
      return () => observer.disconnect();
    }
  }, []);

  const activeTheme = useMemo(
    () => state.themes.find((t) => t.id === state.activeThemeId) ?? state.themes[0],
    [state.themes, state.activeThemeId],
  );
  const activePersona = useMemo(
    () => state.personas.find((p) => p.id === state.activePersonaId) ?? state.personas[0],
    [state.personas, state.activePersonaId],
  );
  const activeDesk = useMemo(
    () => state.cutDesks.find((d) => d.deskId === state.selectedCutDeskId) ?? state.cutDesks[0],
    [state.cutDesks, state.selectedCutDeskId],
  );
  const secondaryMotion = useMemo(
    () => computeCharacterSecondaryMotion(state.elapsedSimulationMs, state.physics.speedPxPerSec, state.activePersonaPose),
    [state.elapsedSimulationMs, state.physics.speedPxPerSec, state.activePersonaPose],
  );
  const spatialAudio = useMemo(
    () => computeSpatialAudioGainAndPan(
      { x: state.physics.x, y: state.physics.y, facingAngleRad: state.physics.facingAngleRad },
      { x: activeDesk.x, y: activeDesk.y },
      wallBarriers,
    ),
    [state.physics.x, state.physics.y, state.physics.facingAngleRad, activeDesk.x, activeDesk.y, wallBarriers],
  );
  const activeSpriteUrl = state.activePersonaPose === "idle" ? activePersona.idleSpriteUrl : activePersona.workSpriteUrl;

  return (
    <section
      ref={sectionRef}
      data-testid="virtual-office-nextgen-engine-panel"
      data-studio-theme={state.activeThemeId}
      data-lighting-mood={state.lightingMoodId}
      style={{
        contentVisibility: "auto",
        containIntrinsicSize: "auto none auto 520px",
      }}
      className="space-y-4 rounded-xl border border-accent bg-card/85 p-4"
    >
      {/* Top Header: Multi-Theme + Smart AI Spatial Studio Engine */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="flex items-center gap-2 text-xs font-bold text-fg">
            <Wand2 className="h-4 w-4 text-accent" />
            차세대 웹툰 가상 스튜디오 엔진 (12대 장르 테마 · 8인 개성파 캐릭터/마스코트 · 4종 이모트/가구 · 60fps 물리 · WebAudio HRTF)
          </h4>
          <p className="mt-0.5 text-[11px] text-fg-2">
            스마트 AI 공간 보조 · 2.5D 아이소메트릭 테마 · 60fps 서브타일 물리 · HRTF 공간 오디오 통합 엔진
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full border border-accent bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent">
            12 테마 × 8 캐스트 × 4 이모트 × 60fps 물리 × WebAudio 신스
          </span>
          <span className="rounded-full border border-line bg-panel px-2 py-0.5 text-[10px] text-fg-2">
            렌더 루프: {offscreenSkipped ? "백그라운드 절전" : "실시간 60fps 활성"}
          </span>
        </div>
      </div>

      {/* 1. Webtoon Studio Themes + Time-of-Day / Deadline Crunch Lighting */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <div className="rounded-lg border border-line bg-panel p-3 lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="flex items-center gap-1.5 text-xs text-fg">
              <Sparkles className="h-3.5 w-3.5 text-accent" />
              12대 웹툰 스튜디오 장르 테마 아틀리에 전환 (2.5D Isometric · v11~v13)
            </strong>
            <span className="text-[11px] text-fg-2">
              {activeTheme.atmosphereTagKo}
            </span>
          </div>

          {/* Theme Selector Buttons */}
          <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {state.themes.map((theme) => {
              const isSelected = theme.id === state.activeThemeId;
              return (
                <button
                  key={theme.id}
                  type="button"
                  data-testid={`nextgen-theme-${theme.id}-btn`}
                  onClick={() => {
                    const next = selectNanoBananaStudioTheme(
                      state,
                      theme.id as NanoBananaStudioThemeId,
                    );
                    setState(next);
                    onBannerChange?.(
                      `[스튜디오 테마 전환] ${theme.titleKo} (${theme.atmosphereTagKo})`,
                    );
                  }}
                  className={`rounded-lg border p-2 text-left text-[11px] transition ${
                    isSelected
                      ? "border-accent bg-accent-soft text-accent font-semibold"
                      : "border-line bg-card text-fg-2 hover:text-fg"
                  }`}
                >
                  <div className="truncate">{theme.titleKo}</div>
                  <div className="mt-0.5 truncate text-[10px] text-fg-3">
                    {theme.atmosphereTagKo}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Active Theme Hero Viewport + Interactive 2.5D Avatar/Desk Overlay */}
          <div className="relative mt-2.5 overflow-hidden rounded-lg border border-line bg-card">
            {/* modern-web-guidance: optimize-image-priority — Hero image uses fetchPriority="high" without loading="lazy" */}
            <img
              src={activeTheme.assetUrl}
              alt={activeTheme.titleKo}
              data-testid="nextgen-active-theme-hero-img"
              fetchPriority="high"
              className="h-52 w-full object-cover"
            />
            <div className="border-t border-line bg-panel/95 p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-bold text-fg">
                    {activeTheme.titleKo}
                  </div>
                  <div className="text-[11px] text-fg-2">
                    {activeTheme.subtitleKo} · {activeTheme.acousticReverbProfileKo}
                  </div>
                </div>
                <span className="rounded border border-accent bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent">
                  {state.deadlineCrunchFeverEnabled
                    ? "마감 피버 네온 점등"
                    : "표준 스튜디오 채광"}
                </span>
              </div>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {activeTheme.signatureFeaturesKo.map((feat) => (
                  <li
                    key={feat}
                    className="rounded border border-line bg-card px-2 py-0.5 text-[10px] text-fg-2"
                  >
                    {feat}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Time-of-Day & Deadline Crunch Fever Lighting Sync */}
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-1.5 rounded-lg border border-line bg-card p-2">
            <span className="flex items-center gap-1 text-[11px] font-semibold text-fg">
              <SunMedium className="h-3.5 w-3.5 text-accent" />
              시간대별 채광 & 마감 피버 동기화:
            </span>
            <div className="flex flex-wrap gap-1">
              {STUDIO_LIGHTING_MOODS.map((mood) => {
                const active = mood.id === state.lightingMoodId;
                return (
                  <button
                    key={mood.id}
                    type="button"
                    data-testid={`nextgen-lighting-${mood.id}-btn`}
                    onClick={() => {
                      const next = applyStudioLightingMood(
                        state,
                        mood.id as StudioLightingMoodId,
                      );
                      setState(next);
                      onBannerChange?.(
                        `[스튜디오 채광 & 사운드 프리셋] ${mood.labelKo} 적용`,
                      );
                    }}
                    className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${
                      active
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line bg-panel text-fg-2"
                    }`}
                  >
                    {mood.id === "midnight-crunch-fever" && (
                      <Flame className="mr-0.5 inline h-3 w-3" />
                    )}
                    {mood.labelKo}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* 2. 4 Diverse Creator Cast Personas + Smooth Procedural Secondary Motion */}
        <div className="rounded-lg border border-line bg-panel p-3 lg:col-span-5">
          <div className="flex items-center justify-between gap-2">
            <strong className="text-xs text-fg">
              8직군 개성파 캐릭터·마스코트 캐스트 & 프로시저럴 2차 모션
            </strong>
            <div className="flex gap-1">
              {(["idle", "work"] as const).map((poseKey: CreatorPersonaPose) => (
                <button
                  key={poseKey}
                  type="button"
                  data-testid={`nextgen-pose-${poseKey}-btn`}
                  onClick={() => {
                    const next = selectNanoBananaCreatorPersona(
                      state,
                      state.activePersonaId,
                      poseKey,
                    );
                    setState(next);
                    onBannerChange?.(
                      `[캐릭터 모션 전환] ${activePersona.nameKo} — ${
                        poseKey === "idle" ? "스탠딩 호흡(Idle)" : "몰입 작업(Work)"
                      }`,
                    );
                  }}
                  className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${
                    state.activePersonaPose === poseKey
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-card text-fg-2"
                  }`}
                >
                  {poseKey === "idle" ? "스탠딩 (Idle)" : "집중 작화·검수 (Work)"}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {state.personas.map((persona) => {
              const selected = persona.id === state.activePersonaId;
              return (
                <button
                  key={persona.id}
                  type="button"
                  data-testid={`nextgen-persona-${persona.id}-btn`}
                  onClick={() => {
                    const next = selectNanoBananaCreatorPersona(
                      state,
                      persona.id as NanoBananaCreatorPersonaId,
                      state.activePersonaPose,
                    );
                    setState(next);
                    onBannerChange?.(
                      `[웹툰 크리에이터 캐스트 선택] ${persona.nameKo} (${persona.roleTitleKo})`,
                    );
                  }}
                  className={`flex items-center gap-2 rounded-lg border p-1.5 text-left text-[11px] transition ${
                    selected
                      ? "border-accent bg-accent-soft text-fg"
                      : "border-line bg-card text-fg-2 hover:text-fg"
                  }`}
                >
                  <img
                    src={persona.idleSpriteUrl}
                    alt={persona.nameKo}
                    loading="lazy"
                    className="h-10 w-10 shrink-0 rounded border border-line bg-panel object-contain"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-fg">
                      {persona.nameKo}
                    </div>
                    <div className="truncate text-[10px] text-fg-3">
                      {persona.roleTitleKo}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Active Persona Smooth Procedural Motion Stage */}
          <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <figure className="flex flex-col items-center justify-center rounded-lg border border-line bg-card p-2.5">
              <div className="flex items-center gap-2">
                <img
                  src={activeSpriteUrl}
                  alt={`${activePersona.nameKo} (${state.activePersonaPose})`}
                  data-testid="nextgen-active-persona-sprite-img"
                  loading="lazy"
                  style={{
                    transform: `translateY(${secondaryMotion.bobOffsetYPx}px) scale(${secondaryMotion.breathScaleX}, ${secondaryMotion.breathScaleY})`,
                  }}
                  className="h-24 w-24 object-contain transition-transform duration-150"
                />
                <StudioVirtualDynamicSpriteAvatar
                  personaId={activePersona.id}
                  actionId={
                    state.activePersonaPose === "idle"
                      ? "idle-breathe"
                      : getDynamicCreatorPersonaSpec(activePersona.id).defaultActionId
                  }
                  expressionId={
                    state.deadlineCrunchFeverEnabled
                      ? "caffeine-overdrive"
                      : getDynamicCreatorPersonaSpec(activePersona.id).defaultExpressionId
                  }
                  vfxId={getDynamicCreatorPersonaSpec(activePersona.id).defaultVfxId}
                  sizePx={96}
                  testId="nextgen-active-dynamic-sprite-avatar"
                />
              </div>
              <figcaption className="mt-1 text-center text-[11px] font-semibold text-fg">
                {activePersona.nameKo}
              </figcaption>
              <span className="text-center text-[10px] text-fg-2">
                {activePersona.signatureGearKo}
              </span>
            </figure>

            <div className="flex flex-col justify-between rounded-lg border border-line bg-card p-2.5 text-[11px]">
              <div>
                <div className="font-semibold text-fg">
                  프로시저럴 2차 모션 텔레메트리
                </div>
                <div className="mt-1 text-[10px] text-accent">
                  {secondaryMotion.motionPhaseLabelKo}
                </div>
                <dl className="mt-1.5 space-y-1 text-[10px] text-fg-2">
                  <div className="flex justify-between">
                    <dt>수직 바운스 (Bob Y):</dt>
                    <dd className="font-mono text-fg">
                      {secondaryMotion.bobOffsetYPx}px
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>호흡 스케일 (X/Y):</dt>
                    <dd className="font-mono text-fg">
                      {secondaryMotion.breathScaleX} / {secondaryMotion.breathScaleY}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>펜 드로잉 진동각:</dt>
                    <dd className="font-mono text-fg">
                      {secondaryMotion.stylusTiltDeg}°
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>눈깜빡임 프레임:</dt>
                    <dd className="font-mono text-fg">
                      {secondaryMotion.isBlinking ? "BLINK (감음)" : "OPEN (뜸)"}
                    </dd>
                  </div>
                </dl>
              </div>
              <div className="mt-2 border-t border-line pt-1.5 text-[10px] text-fg-3">
                특화 역량: {activePersona.specialtyKo}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. 60fps Sub-Tile Physics, Corner-Sliding Collision, Gather 'G' Ghost & 'X' Trigger + HRTF Soundscape */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        {/* Left: 60fps Physics & Collision Engine */}
        <div className="rounded-lg border border-line bg-panel p-3 lg:col-span-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="flex items-center gap-1.5 text-xs text-fg">
              <Compass className="h-3.5 w-3.5 text-accent" />
              60fps 서브타일 물리 · 모서리 슬라이딩 충돌 · Gather &apos;G&apos;/&apos;X&apos; 엔진
            </strong>
            <div className="flex items-center gap-1">
              <button
                type="button"
                data-testid="nextgen-ghost-mode-g-btn"
                onClick={() => {
                  const next = toggleGatherGhostModeGKey(state);
                  setState(next);
                  onBannerChange?.(
                    `[Gather 'G'키 고스트 모드] ${
                      next.physics.ghostModeGKey
                        ? "활성 — 혼잡 복도·책상 충돌 무시 통과"
                        : "비활성 — 표준 AABB 모서리 슬라이딩 충돌"
                    }`,
                  );
                }}
                className={`flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-semibold ${
                  state.physics.ghostModeGKey
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-card text-fg-2"
                }`}
              >
                <Ghost className="h-3 w-3" />
                &apos;G&apos; 고스트 통과: {state.physics.ghostModeGKey ? "ON" : "OFF"}
              </button>
              <button
                type="button"
                data-testid="nextgen-interact-x-btn"
                onClick={() => {
                  const next = triggerNearestObjectWithXKey(state);
                  setState(next);
                  onBannerChange?.(
                    `[Gather 'X'키 오브젝트 상호작용] 근접 오브젝트(${
                      next.physics.activeProximityObjectId ?? "없음"
                    }) 즉시 활성화`,
                  );
                }}
                className="rounded border border-accent bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent"
              >
                &apos;X&apos; 근접 오브젝트 작동
              </button>
              <button
                type="button"
                data-testid="nextgen-click-to-walk-btn"
                onClick={() => {
                  const next = navigateAvatarClickToWalk(state, 240, 178);
                  setState(next);
                  onBannerChange?.(
                    `[클릭 투 워크 A* 경로탐색] 장애물 우회 웨이포인트(${next.waypointPath.length}노드) 이동 및 마스코트 팔로워 추적 완료`,
                  );
                }}
                className="rounded border border-line bg-card px-2 py-0.5 text-[10px] font-semibold text-fg hover:border-accent"
              >
                홀로그램 라운지 자동 보행
              </button>
            </div>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(
              [
                { id: "left", label: "← 좌측 이동", dx: -1, dy: 0 },
                { id: "right", label: "우측 이동 →", dx: 1, dy: 0 },
                { id: "up", label: "↑ 상단 이동", dx: 0, dy: -1 },
                { id: "down", label: "하단 이동 ↓", dx: 0, dy: 1 },
              ] as const
            ).map((btn) => (
              <button
                key={btn.id}
                type="button"
                data-testid={`nextgen-move-${btn.id}-btn`}
                onClick={() => {
                  const next = stepAvatarPhysicsTick(
                    state,
                    { dx: btn.dx, dy: btn.dy },
                    32,
                  );
                  setState(next);
                }}
                className="rounded border border-line bg-card px-2 py-1 text-[11px] font-medium text-fg hover:border-accent"
              >
                {btn.label}
              </button>
            ))}
          </div>

          <div className="mt-2.5 grid grid-cols-2 gap-2 rounded-lg border border-line bg-card p-2.5 text-[11px] sm:grid-cols-5">
            <div>
              <div className="text-[10px] text-fg-3">서브타일 좌표 (x, y)</div>
              <div
                data-testid="nextgen-physics-coords"
                className="font-mono font-semibold text-fg"
              >
                ({state.physics.x}, {state.physics.y})
              </div>
            </div>
            <div>
              <div className="text-[10px] text-fg-3">이동 속도 (px/s)</div>
              <div className="font-mono font-semibold text-fg">
                {state.physics.speedPxPerSec} px/s
              </div>
            </div>
            <div>
              <div className="text-[10px] text-fg-3">모서리 슬라이딩 보정</div>
              <div
                data-testid="nextgen-corner-slide-count"
                className="font-mono font-semibold text-good"
              >
                {state.physics.cornerSlideEventsCount}회 끼임 방지
              </div>
            </div>
            <div>
              <div className="text-[10px] text-fg-3">&apos;X&apos; 근접 타겟 (≤78px)</div>
              <div className="truncate font-mono font-semibold text-accent">
                {state.physics.activeProximityObjectId ?? "반경 내 없음"}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-fg-3">마스코트 스프링 팔로워</div>
              <div
                data-testid="nextgen-companion-follower-coords"
                className="font-mono font-semibold text-fg"
              >
                ({state.companionFollower.x}, {state.companionFollower.y})
              </div>
            </div>
          </div>
        </div>

        {/* Right: HRTF Spatial Audio & 5-Channel Webtoon Soundscape Mixer */}
        <div className="rounded-lg border border-line bg-panel p-3 lg:col-span-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="flex items-center gap-1.5 text-xs text-fg">
              <Headphones className="h-3.5 w-3.5 text-accent" />
              HRTF 공간 오디오 & 5채널 웹툰 스튜디오 ASMR 사운드스케이프
            </strong>
            <button
              type="button"
              data-testid="nextgen-wall-barrier-toggle-btn"
              onClick={() => {
                const nextWall = wallBarriers === 0 ? 1 : 0;
                setWallBarriers(nextWall);
                onBannerChange?.(
                  `[방음 부스 격벽 시뮬레이션] ${
                    nextWall === 1
                      ? "방음벽 1겹 개입 (-28dB 차음 활성)"
                      : "오픈 스튜디오 플로어 (차음 없음)"
                  }`,
                );
              }}
              className="rounded border border-line bg-card px-2 py-0.5 text-[10px] font-medium text-fg-2 hover:text-fg"
            >
              방음 격벽: {wallBarriers === 1 ? "차음 부스 (-28dB)" : "오픈 플로어 (0dB)"}
            </button>
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-card px-2.5 py-1.5 text-[11px]">
            <span className="text-fg-2">
              선택 데스크 거리:{" "}
              <strong className="font-mono text-fg">
                {spatialAudio.distancePx}px
              </strong>
            </span>
            <span className="text-fg-2">
              최종 수음 이득:{" "}
              <strong
                data-testid="nextgen-spatial-final-gain"
                className="font-mono text-accent"
              >
                {Math.round(spatialAudio.finalGain * 100)}%
              </strong>
            </span>
            <span className="text-fg-2">
              스테레오 패닝:{" "}
              <strong className="font-mono text-fg">
                {spatialAudio.stereoPan}
              </strong>
            </span>
            <span className="rounded bg-panel px-1.5 py-0.5 text-[10px] font-semibold text-good">
              {spatialAudio.audibleStatusKo}
            </span>
          </div>

          <div className="mt-2 space-y-1.5">
            {state.soundscapeChannels.map((ch) => (
              <div
                key={ch.id}
                className="flex items-center justify-between gap-2 rounded border border-line bg-card px-2.5 py-1 text-[11px]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <Volume2 className="h-3 w-3 shrink-0 text-accent" />
                    <span className="truncate font-semibold text-fg">
                      {ch.labelKo}
                    </span>
                  </div>
                  <div className="truncate text-[10px] text-fg-3">
                    {ch.synthWaveformSummary}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={ch.gainPercent}
                    aria-label={ch.labelKo}
                    data-testid={`nextgen-soundscape-${ch.id}-slider`}
                    onChange={(e) => {
                      const next = setSoundscapeChannelGain(
                        state,
                        ch.id,
                        Number(e.target.value),
                      );
                      setState(next);
                    }}
                    className="w-20 accent-current"
                  />
                  <span className="w-8 text-right font-mono text-[10px] font-semibold text-fg">
                    {ch.gainPercent}%
                  </span>
                  <button
                    type="button"
                    data-testid={`nextgen-webaudio-ping-${ch.id}-btn`}
                    onClick={() => {
                      const next = triggerWebAudioSynthesizerPing(state, ch.id);
                      setState(next);
                      onBannerChange?.(
                        `[WebAudio 신디사이저] ${
                          next.lastSynthesizedAudioPing?.statusKo ?? ch.labelKo
                        }`,
                      );
                    }}
                    className="rounded border border-accent bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent"
                  >
                    신스 재생
                  </button>
                </div>
              </div>
            ))}
          </div>
          {state.lastSynthesizedAudioPing ? (
            <div
              data-testid="nextgen-webaudio-ping-status"
              className="mt-1.5 rounded border border-accent bg-accent-soft/40 px-2.5 py-1 text-[10px] font-medium text-accent"
            >
              {state.lastSynthesizedAudioPing.statusKo}
            </div>
          ) : null}
        </div>
      </div>

      {/* 4. Webtoon Studio Specialized Live Episode Cut Tethered Desks (EP.43 C04~C52) */}
      <div className="rounded-lg border border-line bg-panel p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong className="flex items-center gap-1.5 text-xs text-fg">
            <Layers className="h-3.5 w-3.5 text-accent" />
            웹툰 특화: 아바타 작화 데스크 × 실시간 원고 컷(EP.43) 직결 파이프라인
          </strong>
          <span className="text-[11px] text-fg-2">
            데스크 클릭 시 아바타 즉시 이동(&apos;X&apos; 스냅) 및 실시간 원고 컷 공정 검수
          </span>
        </div>

        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {state.cutDesks.map((desk) => {
            const isSelected = desk.deskId === state.selectedCutDeskId;
            return (
              <div
                key={desk.deskId}
                data-testid={`nextgen-cut-desk-card-${desk.deskId}`}
                className={`flex flex-col justify-between rounded-lg border p-2.5 text-[11px] transition ${
                  isSelected
                    ? "border-accent bg-accent-soft/40"
                    : "border-line bg-card"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono font-bold text-accent">
                      {desk.episodeCode} · {desk.cutNumber}
                    </span>
                    <span className="rounded border border-line bg-panel px-1.5 py-0.5 text-[10px] font-semibold text-fg">
                      {PIPELINE_STAGE_LABELS_KO[desk.stage]} ({desk.progressPercent}%)
                    </span>
                  </div>
                  <div className="mt-1 font-semibold text-fg">
                    {desk.cutTitleKo}
                  </div>
                  <p className="mt-1 text-[10px] text-fg-2">
                    {desk.reviewCommentKo}
                  </p>
                </div>

                <div className="mt-2 flex items-center gap-1.5 pt-1.5 border-t border-line">
                  <button
                    type="button"
                    data-testid={`nextgen-approach-desk-${desk.deskId}-btn`}
                    onClick={() => {
                      const next = approachCutDeskAndInspect(state, desk.deskId);
                      setState(next);
                      onBannerChange?.(
                        `[데스크 이동 & 원고 합평] ${desk.episodeCode} ${desk.cutNumber} (${desk.cutTitleKo}) 데스크로 스냅 이동`,
                      );
                    }}
                    className="flex-1 rounded border border-line bg-panel px-2 py-1 text-[10px] font-semibold text-fg hover:border-accent"
                  >
                    데스크 이동 & 합평
                  </button>
                  <button
                    type="button"
                    data-testid={`nextgen-advance-cut-${desk.deskId}-btn`}
                    onClick={() => {
                      const next = advanceDeskEpisodeCutStage(state, desk.deskId);
                      setState(next);
                      onBannerChange?.(
                        `[원고 컷 공정 승인] ${desk.episodeCode} ${desk.cutNumber} 다음 파이프라인 단계로 전환`,
                      );
                    }}
                    className="rounded border border-accent bg-accent-soft px-2 py-1 text-[10px] font-semibold text-accent"
                  >
                    공정 승인 +1
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <StudioVirtualOfficePracticalWorkbenchSection
        engineState={state}
        activeSpriteUrl={activeSpriteUrl}
        onStepPhysics={(vec) => setState((prev) => stepAvatarPhysicsTick(prev, vec, 32))}
        onToggleGhostMode={() => setState((prev) => toggleGatherGhostModeGKey(prev))}
        onTriggerNearestX={() => setState((prev) => triggerNearestObjectWithXKey(prev))}
        onApproachDesk={(deskId) => setState((prev) => approachCutDeskAndInspect(prev, deskId))}
        onAdvanceDeskStage={(deskId) => setState((prev) => advanceDeskEpisodeCutStage(prev, deskId))}
        onBannerChange={onBannerChange}
      />

      {/* 5. REA Competitor Engine Benchmark Table */}
      <div className="rounded-lg border border-line bg-panel p-3">
        <strong className="text-xs text-fg">
          경쟁사 가상 오피스(Gather · ZEP · WorkAdventure · oVice · Topia · Kumospace) REA 역공학 대비 초격차 우위 매트릭스
        </strong>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {NEXTGEN_COMPETITOR_REA_BENCHMARKS.map((item) => (
            <div
              key={item.id}
              className="rounded-lg border border-line bg-card p-2.5 text-[11px]"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-fg">{item.competitorName}</span>
                <span className="rounded border border-accent bg-accent-soft px-1.5 py-0.5 font-mono text-[10px] text-accent">
                  {item.latencyOrPhysicsMetric}
                </span>
              </div>
              <div className="mt-1 text-[10px] text-fg-3">
                기존 역공학 구조: {item.reverseEngineeredMechanism}
              </div>
              <div className="mt-1 text-[11px] font-medium text-good">
                툰스튜디오 초격차 고도화: {item.toonStudioSuperiorUpgradeKo}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
