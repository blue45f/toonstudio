/**
 * 가상 스튜디오 2.5D 리빙 엔진 통합 프리뷰 패널.
 *
 * - 3탭 인터랙티브 스튜디오 UI: 2.5D 스프링 캐릭터 / 시간·날씨·이모트 휠 / 아바타·6테마 방·뽀모도로
 * - 6종 사전 베이크 WebP 썸네일(`<img>`), Calm Atelier 시맨틱 토큰 전용(원시 색·Web Storage·props `= {}` 금지).
 */

import { Clock, CloudRain, Compass, Grid2x2, Pause, Play, RotateCcw, RotateCw, SkipForward, Sparkles, Sun, Timer, Trash2, UserCheck, Users } from "lucide-react";
import { useEffect, useId, useMemo, useState, type ReactElement } from "react";

import {
  PARTICLE_KIND_LABEL_KO, PARTICLE_LAYER_LABEL_KO, RADIAL_EMOTE_SECTORS, TIME_OF_DAY_LIST, TIME_OF_DAY_PROFILES, WEATHER_MOOD_LIST,
  computeDirectionalShadowVector, createAtmosphereParticleSystem, createEmoteWheelState, getEmoteRemainingCooldownMs, mapPointerDeltaToRadialSector,
  spawnCherryBlossomPetal, spawnCoffeeSteamPlume, spawnFocusAuraRing, spawnFootstepDustBurst, spawnWindowRainDrop,
  stepAtmosphereParticles, summarizeParticlesByLayer, triggerRadialEmote,
  type AtmosphereParticleKind, type AtmosphereParticleSystem, type EmoteWheelState, type TimeOfDayId, type WeatherMoodPresetId,
} from "./atmosphere-vfx-engine";
import {
  AVATAR_BOTTOM_OPTIONS, AVATAR_EXPRESSION_OPTIONS, AVATAR_HAIR_OPTIONS, AVATAR_TOP_OPTIONS, DEFAULT_FURNITURE_GRID, FURNITURE_CATALOG,
  GENRE_OUTFIT_PRESETS, POMODORO_PHASE_LABEL_KO, POMODORO_PRESET_LIST, STUDIO_PET_OPTIONS, STUDIO_THEME_ROOMS, USER_WORK_PROTAGONIST_CATALOG,
  applyGenreOutfitPreset, buildAvatarRenderLayers, clearImportedProtagonist, createDefaultDeskLayout, createDefaultLayeredAvatar,
  createTeamPomodoroState, formatPomodoroClock, getEffectiveFurnitureSpan, getFurnitureCatalogItem, getPomodoroRemainingSec, getStudioThemeRoomById,
  importProtagonistToAvatar, pauseTeamPomodoro, placeFurnitureItem, removeFurnitureItem, resetTeamPomodoro, rotateFurnitureItem,
  skipTeamPomodoroPhase, startTeamPomodoro, switchPomodoroPreset, tickTeamPomodoro,
  type GenreOutfitPresetId, type LayeredAvatarConfig, type PlacedFurnitureItem, type PomodoroPresetId, type StudioPetId, type StudioThemeRoomId, type TeamPomodoroState,
} from "./avatar-room-studio-engine";
import {
  FIXED_PHYSICS_DT_SEC, OCTANT_LABEL_KO, createLivingSpriteState, simulateLivingSpriteFrames,
  type LivingSpriteState, type SpriteControlInput, type Vec2,
} from "./sprite-physics-engine";

export type LivingStudioTabId = "sprite-physics" | "atmosphere-wheel" | "avatar-room-pomodoro";

export interface StudioVirtualSpaceLivingPanelProps {
  readonly initialTab?: LivingStudioTabId;
  readonly initialRoomId?: StudioThemeRoomId;
  readonly className?: string;
}

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_OUTLINE = `inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg transition-colors motion-reduce:transition-none hover:border-line-strong hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING} [word-break:keep-all]`;
const BTN_PRIMARY = `inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING} [word-break:keep-all]`;
const BTN_ACTIVE = `inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent-soft px-3 py-2 text-xs font-semibold text-accent transition-colors motion-reduce:transition-none ${FOCUS_RING} [word-break:keep-all]`;
const SELECT_CLASS = `min-h-11 w-full rounded-lg border border-line bg-panel px-2.5 py-2 text-xs font-medium text-fg ${FOCUS_RING}`;

const STAGE_PEERS: readonly { readonly id: string; readonly labelKo: string; readonly position: Vec2 }[] = [
  { id: "peer-left", labelKo: "민서 · 선화", position: { x: 132, y: 124 } },
  { id: "peer-right", labelKo: "도윤 · 채색", position: { x: 432, y: 136 } },
];

const DIRECTION_PAD = [
  { id: "nw", labelKo: "북서", moveX: -1, moveY: -1 },
  { id: "n", labelKo: "북", moveX: 0, moveY: -1 },
  { id: "ne", labelKo: "북동", moveX: 1, moveY: -1 },
  { id: "w", labelKo: "서", moveX: -1, moveY: 0 },
  { id: "stop", labelKo: "정지", moveX: 0, moveY: 0 },
  { id: "e", labelKo: "동", moveX: 1, moveY: 0 },
  { id: "sw", labelKo: "남서", moveX: -1, moveY: 1 },
  { id: "s", labelKo: "남", moveX: 0, moveY: 1 },
  { id: "se", labelKo: "남동", moveX: 1, moveY: 1 },
] as const;

const GAZE_PRESETS = [
  { id: "auto-peer", labelKo: "가까운 동료 자동", pointerTarget: null },
  { id: "pointer-left", labelKo: "좌측 캔버스", pointerTarget: { x: 96, y: 150 } },
  { id: "pointer-top", labelKo: "상단 창가", pointerTarget: { x: 280, y: 42 } },
  { id: "pointer-right", labelKo: "우측 자료함", pointerTarget: { x: 486, y: 162 } },
] as const;

const TABS: readonly { readonly id: LivingStudioTabId; readonly labelKo: string; readonly testId: string }[] = [
  { id: "sprite-physics", labelKo: "2.5D 스프링 캐릭터", testId: "living-tab-sprite" },
  { id: "atmosphere-wheel", labelKo: "시간·날씨·이모트 휠", testId: "living-tab-atmosphere" },
  { id: "avatar-room-pomodoro", labelKo: "아바타·6테마 방·뽀모도로", testId: "living-tab-room" },
];

function formatPolylinePoints(anchor: Vec2, nodes: readonly { readonly x: number; readonly y: number }[]): string {
  return [`${anchor.x.toFixed(1)},${anchor.y.toFixed(1)}`, ...nodes.map((n) => `${n.x.toFixed(1)},${n.y.toFixed(1)}`)].join(" ");
}

function getOccupantAtCell(items: readonly PlacedFurnitureItem[], col: number, row: number): PlacedFurnitureItem | null {
  for (const item of items) {
    const spec = getFurnitureCatalogItem(item.catalogId);
    if (!spec) continue;
    const span = getEffectiveFurnitureSpan(spec, item.rotationDeg);
    if (col >= item.col && col < item.col + span.widthCells && row >= item.row && row < item.row + span.heightCells) return item;
  }
  return null;
}

function emitParticleBurstIntoSystem(
  prev: AtmosphereParticleSystem,
  kind: AtmosphereParticleKind,
  sprite: LivingSpriteState,
): AtmosphereParticleSystem {
  const burst =
    kind === "footstep-dust"
      ? spawnFootstepDustBurst(prev, sprite.position.x, sprite.position.y + 18, sprite.facingVector.x, sprite.facingVector.y, 4)
      : kind === "coffee-steam"
        ? spawnCoffeeSteamPlume(prev, 428, 132)
        : kind === "window-rain"
          ? spawnWindowRainDrop(spawnWindowRainDrop(spawnWindowRainDrop(prev)))
          : kind === "cherry-blossom"
            ? spawnCherryBlossomPetal(spawnCherryBlossomPetal(prev))
            : spawnFocusAuraRing(prev, sprite.position.x, sprite.position.y + 8);
  return stepAtmosphereParticles(burst, 0.08);
}

interface SlotSelectProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly options: readonly { readonly id: string; readonly label: string }[];
  readonly onChange: (next: string) => void;
}

function AvatarSlotSelect({ id, label, value, options, onChange }: SlotSelectProps): ReactElement {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-[11px] font-medium text-fg-2 [word-break:keep-all]">{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={SELECT_CLASS}>
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

export function StudioVirtualSpaceLivingPanel({
  initialTab = "sprite-physics",
  initialRoomId = "wood-atelier",
  className,
}: StudioVirtualSpaceLivingPanelProps): ReactElement {
  const uid = useId();
  const [activeTab, setActiveTab] = useState<LivingStudioTabId>(initialTab);
  const [selectedRoomId, setSelectedRoomId] = useState<StudioThemeRoomId>(initialRoomId);
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDayId>(() => getStudioThemeRoomById(initialRoomId).recommendedTimeOfDay);
  const [statusMessage, setStatusMessage] = useState<string>("2.5D 스프링 물리·분위기 VFX·아바타·6테마 방 엔진이 준비되었습니다.");

  const [sprite, setSprite] = useState<LivingSpriteState>(() => createLivingSpriteState());
  const [moveHeading, setMoveHeading] = useState<Vec2>({ x: 0, y: 0 });
  const [sprinting, setSprinting] = useState<boolean>(false);
  const [gazePresetId, setGazePresetId] = useState<(typeof GAZE_PRESETS)[number]["id"]>("auto-peer");

  const [particles, setParticles] = useState<AtmosphereParticleSystem>(() => {
    const initial = createAtmosphereParticleSystem({ weatherPreset: getStudioThemeRoomById(initialRoomId).recommendedWeather });
    return stepAtmosphereParticles(spawnCoffeeSteamPlume(initial, 430, 128), 0.35);
  });
  const [wheelState, setWheelState] = useState<EmoteWheelState>(() => createEmoteWheelState());
  const [wheelClockMs, setWheelClockMs] = useState<number>(10000);
  const [probeDelta, setProbeDelta] = useState<Vec2>({ x: 0, y: -56 });

  const [avatar, setAvatar] = useState<LayeredAvatarConfig>(() => createDefaultLayeredAvatar());
  const [placedFurniture, setPlacedFurniture] = useState<readonly PlacedFurnitureItem[]>(() => createDefaultDeskLayout());
  const [selectedCatalogId, setSelectedCatalogId] = useState<string>("monstera-pot");
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>("desk-main");
  const [furnitureSeq, setFurnitureSeq] = useState<number>(1);
  const [pomodoro, setPomodoro] = useState<TeamPomodoroState>(() => createTeamPomodoroState());

  const activeRoom = useMemo(() => getStudioThemeRoomById(selectedRoomId), [selectedRoomId]);
  const lightingProfile = TIME_OF_DAY_PROFILES[timeOfDay];
  const shadowProjection = useMemo(() => computeDirectionalShadowVector(lightingProfile, 64), [lightingProfile]);
  const particleSummary = useMemo(() => summarizeParticlesByLayer(particles.particles), [particles.particles]);
  const probeMapping = useMemo(() => mapPointerDeltaToRadialSector(probeDelta.x, probeDelta.y, 18), [probeDelta]);
  const avatarLayers = useMemo(() => buildAvatarRenderLayers(avatar), [avatar]);
  const activeGazePreset = GAZE_PRESETS.find((g) => g.id === gazePresetId) ?? GAZE_PRESETS[0];

  useEffect(() => {
    if (!pomodoro.running) return;
    const timer = window.setInterval(() => {
      setPomodoro((prev) => tickTeamPomodoro(prev, 1).nextState);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [pomodoro.running]);

  const runSpriteFrames = (heading: Vec2, frames: number, nextSprint: boolean, nextGaze: Vec2 | null): void => {
    const input: SpriteControlInput = { moveX: heading.x, moveY: heading.y, sprinting: nextSprint, pointerTarget: nextGaze, peerTargets: STAGE_PEERS };
    const next = simulateLivingSpriteFrames(sprite, input, frames, FIXED_PHYSICS_DT_SEC);
    setSprite(next);
    if (next.stepTriggered || next.speedPxPerSec > 45) {
      setParticles((prevFx) => spawnFootstepDustBurst(prevFx, next.position.x, next.position.y + 18, next.facingVector.x, next.facingVector.y, 3));
    }
  };

  const handleDirectionClick = (moveX: number, moveY: number, labelKo: string): void => {
    const nextHeading = { x: moveX, y: moveY };
    setMoveHeading(nextHeading);
    runSpriteFrames(nextHeading, 15, sprinting, activeGazePreset.pointerTarget);
    setStatusMessage(
      moveX === 0 && moveY === 0
        ? "감속 마찰을 적용해 캐릭터를 부드럽게 정지했습니다."
        : `${labelKo} 방향으로 15프레임 관성 이동 및 2차 스프링 시뮬레이션을 실행했습니다.`,
    );
  };

  const handleSelectGaze = (presetId: (typeof GAZE_PRESETS)[number]["id"]): void => {
    setGazePresetId(presetId);
    const chosen = GAZE_PRESETS.find((g) => g.id === presetId) ?? GAZE_PRESETS[0];
    runSpriteFrames(moveHeading, 10, sprinting, chosen.pointerTarget);
    setStatusMessage(`시선 추적 목표를 '${chosen.labelKo}'로 전환했습니다.`);
  };

  const handleBurstParticle = (kind: AtmosphereParticleKind): void => {
    setParticles((prev) => emitParticleBurstIntoSystem(prev, kind, sprite));
    setStatusMessage(`${PARTICLE_KIND_LABEL_KO[kind]} 파티클 버스트를 방출했습니다.`);
  };

  const handleTriggerRadialSector = (sectorIndex: number): void => {
    const sector = RADIAL_EMOTE_SECTORS[sectorIndex];
    if (sector) {
      const rad = ((sector.centerAngleDeg - 90) * Math.PI) / 180;
      setProbeDelta({ x: Math.round(Math.cos(rad) * 56), y: Math.round(Math.sin(rad) * 56) });
    }
    const nextNow = wheelClockMs + 250;
    setWheelClockMs(nextNow);
    const result = triggerRadialEmote(wheelState, sectorIndex, nextNow);
    setWheelState(result.nextState);
    if (result.accepted && result.sector) {
      const linkedKind = result.sector.linkedParticleKind;
      setParticles((prev) => emitParticleBurstIntoSystem(prev, linkedKind, sprite));
    }
    setStatusMessage(result.announcementKo);
  };

  const handleSelectRoom = (roomId: StudioThemeRoomId): void => {
    const room = getStudioThemeRoomById(roomId);
    setSelectedRoomId(room.id);
    setTimeOfDay(room.recommendedTimeOfDay);
    setParticles((prev) => stepAtmosphereParticles({ ...prev, weatherPreset: room.recommendedWeather }, 0.3));
    setStatusMessage(`테마 스튜디오 '${room.nameKo}'로 전환하고 권장 광원·날씨를 맞췄습니다.`);
  };

  const handleGridCellClick = (col: number, row: number): void => {
    const occupant = getOccupantAtCell(placedFurniture, col, row);
    if (occupant) {
      setSelectedInstanceId(occupant.instanceId);
      const spec = getFurnitureCatalogItem(occupant.catalogId);
      const probe = placeFurnitureItem(placedFurniture, { instanceId: `probe-${furnitureSeq}`, catalogId: selectedCatalogId, col, row, rotationDeg: 0 }, DEFAULT_FURNITURE_GRID);
      setStatusMessage(`${spec?.nameKo ?? occupant.catalogId} 선택됨 · ${probe.collision.messageKo}`);
      return;
    }
    const newId = `furn-${selectedCatalogId}-${furnitureSeq}`;
    const result = placeFurnitureItem(placedFurniture, { instanceId: newId, catalogId: selectedCatalogId, col, row, rotationDeg: 0 }, DEFAULT_FURNITURE_GRID);
    setStatusMessage(result.collision.messageKo);
    if (result.accepted) {
      setPlacedFurniture(result.items);
      setSelectedInstanceId(newId);
      setFurnitureSeq((n) => n + 1);
    }
  };

  const handleStepPomodoro = (deltaSec: number): void => {
    const runningState = pomodoro.running ? pomodoro : startTeamPomodoro(pomodoro);
    const ticked = tickTeamPomodoro(runningState, deltaSec);
    setPomodoro(ticked.nextState);
    setStatusMessage(ticked.announcementKo ?? `팀 뽀모도로를 ${deltaSec}초 진행했습니다.`);
  };

  const hairAnchor: Vec2 = { x: sprite.position.x, y: sprite.position.y - 26 + sprite.breathOffsetPx };
  const capeAnchor: Vec2 = { x: sprite.position.x, y: sprite.position.y - 6 + sprite.breathOffsetPx * 0.5 };
  const hairTip = sprite.hairNodes[sprite.hairNodes.length - 1] ?? hairAnchor;
  const capeTip = sprite.capeNodes[sprite.capeNodes.length - 1] ?? capeAnchor;
  const hairLagPx = Math.round(Math.hypot(hairTip.x - hairAnchor.x, hairTip.y - hairAnchor.y) * 10) / 10;
  const capeLagPx = Math.round(Math.hypot(capeTip.x - capeAnchor.x, capeTip.y - capeAnchor.y) * 10) / 10;

  return (
    <section aria-label="가상 스튜디오 2.5D 리빙 엔진 워크벤치" className={`space-y-4 rounded-xl border border-line bg-canvas p-4 text-fg ${className ?? ""}`}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-0.5">
          <h2 className="text-base font-bold tracking-tight text-fg [word-break:keep-all]">가상 스튜디오 2.5D 리빙 엔진</h2>
          <p className="text-xs text-fg-2 [word-break:keep-all]">60fps 스프링 물리 · 시간/날씨 VFX · 8방사형 이모트 · 6슬롯 아바타 · 6종 테마 방 · 팀 뽀모도로</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 rounded-full border border-line bg-card px-2.5 py-1 font-medium text-fg [word-break:keep-all]">
            <Sparkles className="size-3.5 text-accent" aria-hidden="true" />
            {activeRoom.nameKo}
          </span>
          <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-medium tabular-nums [word-break:keep-all] ${lightingProfile.semanticBadgeClass}`}>
            <Sun className="size-3.5" aria-hidden="true" />
            {lightingProfile.shortLabelKo} · {lightingProfile.colorTemperatureK}K
          </span>
        </div>
      </header>

      <div role="tablist" aria-label="가상 스튜디오 리빙 엔진 기능 탭" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {TABS.map((tab) => (
          <button key={tab.id} type="button" role="tab" id={`${uid}-tab-${tab.id}`} data-testid={tab.testId} aria-selected={activeTab === tab.id} aria-controls={`${uid}-panel-${tab.id}`} onClick={() => setActiveTab(tab.id)} className={activeTab === tab.id ? BTN_ACTIVE : BTN_OUTLINE}>
            {tab.labelKo}
          </button>
        ))}
      </div>

      <div role="status" aria-live="polite" data-testid="living-status-banner" className="rounded-lg border border-line bg-panel px-3 py-2 text-xs text-fg-2 [word-break:keep-all]">
        {statusMessage}
      </div>

      {activeTab === "sprite-physics" ? (
        <div role="tabpanel" id={`${uid}-panel-sprite-physics`} aria-labelledby={`${uid}-tab-sprite-physics`} className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="space-y-3 lg:col-span-7">
            <div className="relative overflow-hidden rounded-xl border border-line bg-panel">
              <img src={activeRoom.imagePath} alt={`${activeRoom.nameKo} 가상 스튜디오 배경`} className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-25" />
              <svg role="img" aria-label="2.5D 스프링 캐릭터 물리 스테이지 프리뷰" viewBox="0 0 560 320" className="relative z-10 block h-auto w-full">
                {[80, 160, 240].map((gy) => (
                  <line key={`r-${gy}`} x1={32} y1={gy} x2={528} y2={gy} className="stroke-line/60" strokeWidth={0.8} />
                ))}
                {[112, 224, 336, 448].map((gx) => (
                  <line key={`c-${gx}`} x1={gx} y1={32} x2={gx} y2={288} className="stroke-line/60" strokeWidth={0.8} />
                ))}
                {STAGE_PEERS.map((peer) => (
                  <g key={peer.id} transform={`translate(${peer.position.x}, ${peer.position.y})`}>
                    <circle r={12} className="fill-card stroke-cool" strokeWidth={1.5} />
                    <text y={25} textAnchor="middle" className="fill-fg-2 text-[10px] font-medium">{peer.labelKo}</text>
                  </g>
                ))}
                {sprite.afterimageTrail.map((ghost, idx) => (
                  <ellipse key={`g-${idx}`} cx={ghost.x} cy={ghost.y} rx={12} ry={16} opacity={ghost.opacity} className="fill-accent-soft stroke-accent/40" />
                ))}
                <ellipse cx={sprite.position.x + shadowProjection.dxPx * 0.25} cy={sprite.position.y + 22 + shadowProjection.dyPx * 0.12} rx={Math.max(14, Math.min(36, shadowProjection.lengthPx * 0.28))} ry={7} opacity={shadowProjection.opacity} className="fill-canvas" />
                <polyline points={formatPolylinePoints(capeAnchor, sprite.capeNodes)} fill="none" className="stroke-accent" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
                <polyline points={formatPolylinePoints(hairAnchor, sprite.hairNodes)} fill="none" className="stroke-fg-2" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
                <g transform={`translate(${sprite.position.x.toFixed(1)}, ${(sprite.position.y + sprite.breathOffsetPx).toFixed(1)}) rotate(${sprite.squashStretch.leanDeg.toFixed(1)}) scale(${sprite.squashStretch.scaleX.toFixed(3)}, ${sprite.squashStretch.scaleY.toFixed(3)})`}>
                  <rect x={-14} y={-8} width={28} height={28} rx={9} className="fill-card stroke-accent" strokeWidth={2} />
                  <circle cx={0} cy={-22} r={14} className="fill-raised stroke-fg" strokeWidth={1.8} />
                  <g transform={`translate(-5, -23) scale(1, ${Math.max(0.08, sprite.blink.eyelidOpenness).toFixed(2)})`}>
                    <circle r={2.4} className="fill-fg" cx={sprite.gaze.pupilOffsetX * 0.4} cy={sprite.gaze.pupilOffsetY * 0.4} />
                  </g>
                  <g transform={`translate(5, -23) scale(1, ${Math.max(0.08, sprite.blink.eyelidOpenness).toFixed(2)})`}>
                    <circle r={2.4} className="fill-fg" cx={sprite.gaze.pupilOffsetX * 0.4} cy={sprite.gaze.pupilOffsetY * 0.4} />
                  </g>
                </g>
              </svg>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-lg border border-line bg-card p-2.5">
                <p className="text-[11px] text-fg-3">관성 속도 · 8방위</p>
                <p data-testid="telemetry-speed" className="text-sm font-bold text-fg tabular-nums">{sprite.speedPxPerSec.toFixed(1)} px/s · {OCTANT_LABEL_KO[sprite.facingOctant]}</p>
              </div>
              <div className="rounded-lg border border-line bg-card p-2.5">
                <p className="text-[11px] text-fg-3">스쿼시·스트레치 (부피)</p>
                <p data-testid="telemetry-squash" className="text-sm font-bold text-accent tabular-nums">{sprite.squashStretch.scaleX.toFixed(3)}×{sprite.squashStretch.scaleY.toFixed(3)} = {sprite.squashStretch.volumeProduct.toFixed(3)}</p>
              </div>
              <div className="rounded-lg border border-line bg-card p-2.5">
                <p className="text-[11px] text-fg-3">시선각 · 눈꺼풀</p>
                <p data-testid="telemetry-gaze" className="text-sm font-bold text-fg tabular-nums">{sprite.gaze.gazeAngleDeg.toFixed(1)}° · {Math.round(sprite.blink.eyelidOpenness * 100)}%</p>
              </div>
              <div className="rounded-lg border border-line bg-card p-2.5">
                <p className="text-[11px] text-fg-3">2차 스프링 변위</p>
                <p data-testid="telemetry-spring" className="text-sm font-bold text-fg tabular-nums">헤어 {hairLagPx} / 망토 {capeLagPx} px</p>
              </div>
            </div>
          </div>

          <div className="space-y-3 lg:col-span-5">
            <div className="space-y-3 rounded-xl border border-line bg-card p-3.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-bold text-fg [word-break:keep-all]">8방향 관성 이동 패드</h3>
                <button
                  type="button"
                  aria-pressed={sprinting}
                  onClick={() => {
                    const next = !sprinting;
                    setSprinting(next);
                    setStatusMessage(next ? "전력 질주(1.55배 가속·잔상 강화)를 켰습니다." : "기본 보행 속도로 전환했습니다.");
                  }}
                  className={sprinting ? BTN_ACTIVE : BTN_OUTLINE}
                >
                  전력 질주 {sprinting ? "ON" : "OFF"}
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {DIRECTION_PAD.map((dir) => (
                  <button key={dir.id} type="button" data-testid={`dir-${dir.id}`} onClick={() => handleDirectionClick(dir.moveX, dir.moveY, dir.labelKo)} className={moveHeading.x === dir.moveX && moveHeading.y === dir.moveY ? BTN_ACTIVE : BTN_OUTLINE}>
                    {dir.labelKo}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  data-testid="step-physics-btn"
                  onClick={() => {
                    runSpriteFrames(moveHeading, 15, sprinting, activeGazePreset.pointerTarget);
                    setStatusMessage("60fps 물리 솔버를 15프레임(0.25초) 추가 진행했습니다.");
                  }}
                  className={BTN_PRIMARY}
                >
                  <Compass className="size-3.5" aria-hidden="true" />
                  15프레임 진행
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMoveHeading({ x: 0, y: 0 });
                    setSprite(createLivingSpriteState());
                    setStatusMessage("스프라이트 좌표·관성·스프링 체인을 초기 상태로 되돌렸습니다.");
                  }}
                  className={BTN_OUTLINE}
                >
                  <RotateCcw className="size-3.5" aria-hidden="true" />
                  초기화
                </button>
              </div>
            </div>

            <div className="space-y-2.5 rounded-xl border border-line bg-card p-3.5">
              <h3 className="text-xs font-bold text-fg [word-break:keep-all]">포인터·동료 시선 추적 대상</h3>
              <p className="text-xs text-fg-2 [word-break:keep-all]">현재 상태: {sprite.gaze.targetLabelKo}</p>
              <div className="grid grid-cols-2 gap-1.5">
                {GAZE_PRESETS.map((preset) => (
                  <button key={preset.id} type="button" onClick={() => handleSelectGaze(preset.id)} className={gazePresetId === preset.id ? BTN_ACTIVE : BTN_OUTLINE}>
                    {preset.labelKo}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "atmosphere-wheel" ? (
        <div role="tabpanel" id={`${uid}-panel-atmosphere-wheel`} aria-labelledby={`${uid}-tab-atmosphere-wheel`} className="space-y-4">
          <div className="space-y-3 rounded-xl border border-line bg-card p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="inline-flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
                <Clock className="size-3.5 text-accent" aria-hidden="true" />
                시간대 4종 광원 색온도 · 그림자 각도 프로파일
              </h3>
              <span data-testid="lighting-readout" className="text-xs font-semibold text-fg tabular-nums">
                {lightingProfile.colorTemperatureK}K · 그림자 {lightingProfile.shadowAngleDeg}° ({shadowProjection.lengthPx}px) · {lightingProfile.ambientLux} lx
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {TIME_OF_DAY_LIST.map((prof) => (
                <button
                  key={prof.id}
                  type="button"
                  data-testid={`tod-${prof.id}`}
                  aria-pressed={timeOfDay === prof.id}
                  onClick={() => {
                    setTimeOfDay(prof.id);
                    setStatusMessage(`${prof.labelKo}(${prof.colorTemperatureK}K) 광원 프로파일을 적용했습니다.`);
                  }}
                  className={timeOfDay === prof.id ? BTN_ACTIVE : BTN_OUTLINE}
                >
                  <span>{prof.shortLabelKo}</span>
                  <span className="text-[11px] opacity-80 tabular-nums">{prof.colorTemperatureK}K</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-fg-2 [word-break:keep-all]">{lightingProfile.moodDescriptionKo}</p>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="space-y-3 rounded-xl border border-line bg-card p-3.5 lg:col-span-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="inline-flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
                  <CloudRain className="size-3.5 text-cool" aria-hidden="true" />
                  날씨·감정 멀티레이어 파티클
                </h3>
                <span data-testid="particle-total" className="text-xs font-semibold text-fg tabular-nums">
                  총 {particleSummary.total}개 ({PARTICLE_LAYER_LABEL_KO.background} {particleSummary.byLayer.background} · {PARTICLE_LAYER_LABEL_KO.midground} {particleSummary.byLayer.midground} · {PARTICLE_LAYER_LABEL_KO.foreground} {particleSummary.byLayer.foreground})
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {WEATHER_MOOD_LIST.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    data-testid={`weather-${preset.id}`}
                    onClick={() => {
                      setParticles((prev) => stepAtmosphereParticles({ ...prev, weatherPreset: preset.id as WeatherMoodPresetId }, 0.5));
                      setStatusMessage(`날씨·감정 파티클 프리셋을 '${preset.labelKo}'로 변경했습니다.`);
                    }}
                    className={particles.weatherPreset === preset.id ? BTN_ACTIVE : BTN_OUTLINE}
                  >
                    {preset.labelKo}
                  </button>
                ))}
              </div>
              <svg role="img" aria-label="멀티레이어 날씨 및 감정 파티클 시뮬레이션 뷰" viewBox="0 0 560 180" className={`block h-auto w-full rounded-lg border ${lightingProfile.semanticSurfaceClass}`}>
                {particles.particles.map((p) => {
                  const yScaled = Math.max(8, Math.min(172, (p.y / particles.viewportHeight) * 180));
                  if (p.kind === "focus-aura-ring") return <circle key={p.id} cx={p.x} cy={yScaled} r={p.radiusPx} opacity={p.opacity} className="fill-none stroke-accent" strokeWidth={2} />;
                  if (p.kind === "window-rain") return <line key={p.id} x1={p.x} y1={yScaled} x2={p.x - 4} y2={yScaled + 14} opacity={p.opacity} className="stroke-cool" strokeWidth={1.6} />;
                  return <circle key={p.id} cx={p.x} cy={yScaled} r={p.radiusPx} opacity={p.opacity} className={p.kind === "cherry-blossom" ? "fill-accent" : p.kind === "coffee-steam" ? "fill-fg-3" : "fill-fg-2"} />;
                })}
              </svg>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(PARTICLE_KIND_LABEL_KO) as AtmosphereParticleKind[]).map((kind) => (
                  <button key={kind} type="button" data-testid={`burst-${kind}`} onClick={() => handleBurstParticle(kind)} className={BTN_OUTLINE}>
                    +{PARTICLE_KIND_LABEL_KO[kind]}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setParticles((prev) => stepAtmosphereParticles(prev, 0.25));
                    setStatusMessage("파티클 물리를 0.25초 진행했습니다.");
                  }}
                  className={BTN_PRIMARY}
                >
                  0.25초 진행
                </button>
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-line bg-card p-3.5 lg:col-span-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-bold text-fg [word-break:keep-all]">8섹터 방사형 이모트/액션 휠</h3>
                <span data-testid="wheel-angle-readout" className="text-xs text-fg-2 tabular-nums">
                  {probeMapping.sector ? `${probeMapping.angleFromNorthDeg}° → 섹터 #${probeMapping.sector.index} (${probeMapping.sector.labelKo})` : "중앙 데드존"}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {RADIAL_EMOTE_SECTORS.map((sector) => {
                  const cooldownMs = getEmoteRemainingCooldownMs(wheelState, sector.id, wheelClockMs);
                  return (
                    <button key={sector.id} type="button" data-testid={`emote-sector-${sector.index}`} aria-label={sector.ariaLabelKo} onClick={() => handleTriggerRadialSector(sector.index)} className={`flex-col py-2 ${wheelState.activeSectorIndex === sector.index ? BTN_ACTIVE : BTN_OUTLINE}`}>
                      <span className="text-xs font-semibold">{sector.labelKo}</span>
                      <span className="text-[11px] opacity-80 tabular-nums">{cooldownMs > 0 ? `대기 ${(cooldownMs / 1000).toFixed(1)}s` : `${sector.clockPositionKo} · ${sector.centerAngleDeg}°`}</span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-fg-3 [word-break:keep-all]">
                누적 발동 <span className="font-semibold text-fg tabular-nums">{wheelState.triggerCount}</span>회 · 각 섹터 클릭 시 연결된 VFX 파티클이 함께 방출되며 개별 쿨다운이 적용됩니다.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "avatar-room-pomodoro" ? (
        <div role="tabpanel" id={`${uid}-panel-avatar-room-pomodoro`} aria-labelledby={`${uid}-tab-avatar-room-pomodoro`} className="space-y-4">
          <div className="space-y-2.5 rounded-xl border border-line bg-card p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-fg [word-break:keep-all]">6종 테마 스튜디오 카탈로그 (사전 베이크 WebP)</h3>
              <span className="text-xs text-fg-2 tabular-nums">정원 {activeRoom.capacityCount}명 · {activeRoom.ambientSoundKo}</span>
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {STUDIO_THEME_ROOMS.map((room) => (
                <button
                  key={room.id}
                  type="button"
                  data-testid={`room-card-${room.id}`}
                  aria-pressed={room.id === selectedRoomId}
                  onClick={() => handleSelectRoom(room.id)}
                  className={`flex min-h-11 cursor-pointer flex-col overflow-hidden rounded-xl border text-left transition-colors motion-reduce:transition-none ${FOCUS_RING} ${
                    room.id === selectedRoomId ? "border-accent bg-accent-soft" : "border-line bg-panel hover:border-line-strong"
                  }`}
                >
                  <img src={room.imagePath} alt={`${room.nameKo} 스튜디오 테마 썸네일`} loading="lazy" className="h-28 w-full object-cover" />
                  <div className="space-y-1 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-fg [word-break:keep-all]">{room.nameKo}</span>
                      <span className="text-[11px] text-fg-3 tabular-nums">{room.capacityCount}인</span>
                    </div>
                    <p className="text-[11px] text-fg-2 [word-break:keep-all]">{room.subtitleKo}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="space-y-3 rounded-xl border border-line bg-card p-3.5 lg:col-span-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="inline-flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
                  <UserCheck className="size-3.5 text-accent" aria-hidden="true" />
                  6슬롯 레이어드 아바타 커스터마이저
                </h3>
                <span className="text-[11px] text-fg-3 tabular-nums">활성 레이어 {avatarLayers.length}층</span>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <AvatarSlotSelect id={`${uid}-hair`} label="1. 헤어" value={avatar.hair} options={AVATAR_HAIR_OPTIONS.map((o) => ({ id: o.id, label: o.labelKo }))} onChange={(v) => setAvatar((p) => ({ ...p, hair: v }))} />
                <AvatarSlotSelect id={`${uid}-expr`} label="2. 표정" value={avatar.expression} options={AVATAR_EXPRESSION_OPTIONS.map((o) => ({ id: o.id, label: o.labelKo }))} onChange={(v) => setAvatar((p) => ({ ...p, expression: v }))} />
                <AvatarSlotSelect id={`${uid}-top`} label="3. 상의" value={avatar.top} options={AVATAR_TOP_OPTIONS.map((o) => ({ id: o.id, label: o.labelKo }))} onChange={(v) => setAvatar((p) => ({ ...p, top: v }))} />
                <AvatarSlotSelect id={`${uid}-bottom`} label="4. 하의" value={avatar.bottom} options={AVATAR_BOTTOM_OPTIONS.map((o) => ({ id: o.id, label: o.labelKo }))} onChange={(v) => setAvatar((p) => ({ ...p, bottom: v }))} />
                <AvatarSlotSelect id={`${uid}-genre`} label="5. 장르 의상 프리셋 (6종)" value={avatar.genreOutfitPreset} options={GENRE_OUTFIT_PRESETS.map((o) => ({ id: o.id, label: `${o.labelKo} (${o.genreTagKo})` }))} onChange={(v) => setAvatar((p) => applyGenreOutfitPreset(p, v as GenreOutfitPresetId, true))} />
                <AvatarSlotSelect id={`${uid}-pet`} label="6. 스튜디오 반려동물 (4종)" value={avatar.studioPet} options={STUDIO_PET_OPTIONS.map((o) => ({ id: o.id, label: o.labelKo }))} onChange={(v) => setAvatar((p) => ({ ...p, studioPet: v as StudioPetId }))} />
              </div>
              <div className="space-y-2 rounded-lg border border-line bg-panel p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-fg [word-break:keep-all]">내 작품 주인공 불러오기</span>
                  {avatar.protagonistImport.active ? (
                    <button
                      type="button"
                      onClick={() => {
                        setAvatar((prev) => clearImportedProtagonist(prev));
                        setStatusMessage("불러온 주인공 연결을 해제하고 기본 아바타로 돌아갔습니다.");
                      }}
                      className={BTN_OUTLINE}
                    >
                      주인공 해제
                    </button>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {USER_WORK_PROTAGONIST_CATALOG.map((work) => (
                    <button
                      key={work.workId}
                      type="button"
                      data-testid={`import-protagonist-${work.workId}`}
                      onClick={() => {
                        setAvatar((prev) => importProtagonistToAvatar(prev, work));
                        setStatusMessage(`내 작품 '${work.workTitleKo}' 주인공 ${work.characterNameKo}(${work.signaturePropKo})를 아바타에 불러왔습니다.`);
                      }}
                      className={avatar.protagonistImport.workId === work.workId ? BTN_ACTIVE : BTN_OUTLINE}
                    >
                      {work.characterNameKo} · {work.workTitleKo}
                    </button>
                  ))}
                </div>
                <p data-testid="protagonist-status" className="text-[11px] text-fg-2 [word-break:keep-all]">
                  {avatar.protagonistImport.active
                    ? `연결됨: ${avatar.protagonistImport.characterNameKo} (${avatar.protagonistImport.workTitleKo} · ${avatar.protagonistImport.signaturePropKo})`
                    : "현재 기본 커스텀 아바타를 사용 중입니다."}
                </p>
              </div>
            </div>

            <div className="space-y-4 lg:col-span-6">
              <div className="space-y-2.5 rounded-xl border border-line bg-card p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="inline-flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
                    <Grid2x2 className="size-3.5 text-accent" aria-hidden="true" />
                    그리드 스냅 책상 가구 배치 (12×8)
                  </h3>
                  <span className="text-xs text-fg-2 tabular-nums">배치 {placedFurniture.length}개</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label htmlFor={`${uid}-furn-catalog`} className="sr-only">배치할 가구 선택</label>
                  <select id={`${uid}-furn-catalog`} value={selectedCatalogId} onChange={(e) => setSelectedCatalogId(e.target.value)} className={`${SELECT_CLASS} max-w-52`}>
                    {FURNITURE_CATALOG.map((item) => (
                      <option key={item.catalogId} value={item.catalogId}>{item.nameKo} ({item.widthCells}×{item.heightCells})</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!selectedInstanceId}
                    onClick={() => {
                      const result = rotateFurnitureItem(placedFurniture, selectedInstanceId, DEFAULT_FURNITURE_GRID);
                      if (result.accepted) setPlacedFurniture(result.items);
                      setStatusMessage(result.collision.messageKo);
                    }}
                    className={BTN_OUTLINE}
                  >
                    <RotateCw className="size-3.5" aria-hidden="true" />
                    90° 회전
                  </button>
                  <button
                    type="button"
                    disabled={!selectedInstanceId}
                    onClick={() => {
                      const next = removeFurnitureItem(placedFurniture, selectedInstanceId);
                      setPlacedFurniture(next);
                      setSelectedInstanceId(next[0]?.instanceId ?? "");
                      setStatusMessage("선택한 책상 가구를 스튜디오 격자에서 제거했습니다.");
                    }}
                    className={BTN_OUTLINE}
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    제거
                  </button>
                </div>
                <div className="grid grid-cols-12 gap-0.5 rounded-lg border border-line bg-panel p-1.5">
                  {Array.from({ length: DEFAULT_FURNITURE_GRID.rows * DEFAULT_FURNITURE_GRID.cols }, (_, idx) => {
                    const col = idx % DEFAULT_FURNITURE_GRID.cols;
                    const row = Math.floor(idx / DEFAULT_FURNITURE_GRID.cols);
                    const occupant = getOccupantAtCell(placedFurniture, col, row);
                    const isSel = occupant !== null && occupant.instanceId === selectedInstanceId;
                    return (
                      <button
                        key={`cell-${col}-${row}`}
                        type="button"
                        data-testid={`grid-cell-${col}-${row}`}
                        aria-label={`책상 격자 ${col}열 ${row}행 ${occupant ? "가구 점유됨" : "비어 있음"}`}
                        onClick={() => handleGridCellClick(col, row)}
                        className={`h-6 cursor-pointer rounded-sm border text-[9px] font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING} ${
                          isSel ? "border-accent bg-accent text-on-accent" : occupant ? "border-accent/40 bg-accent-soft text-accent" : "border-line/60 bg-card text-fg-3 hover:bg-raised"
                        }`}
                      >
                        {occupant ? "■" : "·"}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-3 rounded-xl border border-line bg-card p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="inline-flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
                    <Timer className="size-3.5 text-good" aria-hidden="true" />
                    팀 뽀모도로 스프린트 동기화
                  </h3>
                  <span data-testid="pomodoro-phase-badge" className="rounded-full border border-good/40 bg-good-soft px-2.5 py-0.5 text-[11px] font-semibold text-good [word-break:keep-all]">
                    {POMODORO_PHASE_LABEL_KO[pomodoro.phase]}
                  </span>
                </div>
                <div className="flex flex-wrap items-baseline justify-between gap-3 rounded-lg border border-line bg-panel px-3.5 py-2.5">
                  <span data-testid="pomodoro-clock" className="text-2xl font-bold tracking-tight text-fg tabular-nums">
                    {formatPomodoroClock(getPomodoroRemainingSec(pomodoro))}
                  </span>
                  <span className="text-xs text-fg-2 tabular-nums">완료 {pomodoro.completedSprints}회 · 동기화 rev.{pomodoro.syncRevision}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {POMODORO_PRESET_LIST.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        setPomodoro((prev) => switchPomodoroPreset(prev, preset.id as PomodoroPresetId));
                        setStatusMessage(`팀 뽀모도로 프리셋을 '${preset.labelKo}'로 변경했습니다.`);
                      }}
                      className={pomodoro.presetId === preset.id ? BTN_ACTIVE : BTN_OUTLINE}
                    >
                      {preset.labelKo}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    data-testid="pomodoro-toggle-btn"
                    onClick={() => {
                      setPomodoro((prev) => (prev.running ? pauseTeamPomodoro(prev) : startTeamPomodoro(prev)));
                      setStatusMessage(pomodoro.running ? "팀 뽀모도로를 일시정지했습니다." : "팀 뽀모도로 스프린트를 시작했습니다.");
                    }}
                    className={BTN_PRIMARY}
                  >
                    {pomodoro.running ? <Pause className="size-3.5" aria-hidden="true" /> : <Play className="size-3.5" aria-hidden="true" />}
                    {pomodoro.running ? "일시정지" : "스프린트 시작"}
                  </button>
                  <button type="button" data-testid="pomodoro-step-btn" onClick={() => handleStepPomodoro(60)} className={BTN_OUTLINE}>+60초</button>
                  <button
                    type="button"
                    data-testid="pomodoro-skip-btn"
                    onClick={() => {
                      const skipped = skipTeamPomodoroPhase(pomodoro);
                      setPomodoro(skipped.nextState);
                      if (skipped.announcementKo) setStatusMessage(skipped.announcementKo);
                    }}
                    className={BTN_OUTLINE}
                  >
                    <SkipForward className="size-3.5" aria-hidden="true" />
                    다음 단계
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPomodoro((prev) => resetTeamPomodoro(prev));
                      setStatusMessage("팀 뽀모도로 타이머를 초기화했습니다.");
                    }}
                    className={BTN_OUTLINE}
                  >
                    <RotateCcw className="size-3.5" aria-hidden="true" />
                    초기화
                  </button>
                </div>
                <div className="space-y-1">
                  <p className="inline-flex items-center gap-1 text-[11px] font-semibold text-fg-3">
                    <Users className="size-3" aria-hidden="true" />
                    동기화 참여 동료 ({pomodoro.syncedPeers.length}명)
                  </p>
                  <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
                    {pomodoro.syncedPeers.map((peer) => (
                      <div key={peer.peerId} className="rounded-md border border-line bg-panel px-2 py-1.5 text-[11px]">
                        <p className="font-semibold text-fg [word-break:keep-all]">{peer.nameKo}</p>
                        <p className="text-fg-3 [word-break:keep-all]">{peer.taskKo}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
