"use client";

import { useEffect, useState } from "react";
import { Compass, Layers, MapPin, Sparkles, UserCheck, Wand2, X } from "lucide-react";

import { StudioVirtualOfficeNextGenEnginePanel } from "./StudioVirtualOfficeNextGenEnginePanel";
import { StudioVirtualOfficeSpatialCanvasHud } from "./StudioVirtualOfficeSpatialCanvasHud";
import {
  NANO_BANANA_V11_CREATOR_PERSONAS,
  NANO_BANANA_V11_STUDIO_THEMES,
  NANO_BANANA_V13_CREATOR_EMOTES,
  NANO_BANANA_V13_STUDIO_PROPS,
  type NanoBananaCreatorPersonaId,
  type NanoBananaStudioThemeId,
  type NanoBananaV13EmoteId,
} from "./studio-virtual-office-nextgen-engine-data";
import { NANO_BANANA_V14_WALK_SPRITES } from "./studio-virtual-office-nextgen-engine-model";
import {
  requestStudioActiveBridgeEmote,
  requestStudioActiveBridgeTeleport,
} from "./studio-virtual-space-engine-bridge";
import {
  NANO_BANANA_2D_WORKSTATIONS,
  triggerNanoBanana2dEmote,
  triggerNanoBanana2dWalkPreview,
  updateNanoBanana2dRuntimeState,
} from "./studio-virtual-space-nano-banana-2d-runtime";
import { writeStudioSpaceTheme, type StudioSpaceThemeKey } from "./studio-virtual-space-theme";

const NANO_BANANA_TO_2D_SPACE_THEME: Readonly<Record<NanoBananaStudioThemeId, StudioSpaceThemeKey>> = {
  "seoul-editorial-hq": "webtoon-atelier",
  "cyber-neon-lab": "neon-night",
  "hanok-botanical-atelier": "garden-terrace",
  "lofi-cat-storyhouse": "cozy-wood",
  "romance-palace-conservatory": "sakura-campus",
  "murim-bamboo-pavilion": "cozy-wood",
  "scifi-orbital-command": "celestial-observatory",
  "brooklyn-indie-comics-loft": "modern-office",
  "dolby-sound-dubbing-studio": "cinema-screening",
  "magic-academy-astral-library": "library",
  "rooftop-sunset-screening-stage": "sunset-harbor",
  "abyssal-bioluminescent-worldlab": "celestial-observatory",
};

export type NanoBananaWalkDirection = keyof typeof NANO_BANANA_V14_WALK_SPRITES;

export type NanoBananaV14RoomModuleId =
  | "story-tarot-oracle-pavilion"
  | "retro-arcade-gacha-lounge"
  | "recruit-interview-conservatory"
  | "global-ip-pitch-boardroom";

export interface NanoBananaV14RoomModuleSpec {
  readonly id: NanoBananaV14RoomModuleId;
  readonly nameKo: string;
  readonly imageUrl: string;
}

const NANO_BANANA_V14_DIRECTIONAL_WALK_SPRITES: readonly {
  readonly direction: NanoBananaWalkDirection;
  readonly labelKo: string;
  readonly spriteUrl: string;
}[] = [
  {
    direction: "down",
    labelKo: "정면 보행 (DOWN)",
    spriteUrl: NANO_BANANA_V14_WALK_SPRITES.down,
  },
  {
    direction: "left",
    labelKo: "좌측 보행 (LEFT)",
    spriteUrl: NANO_BANANA_V14_WALK_SPRITES.left,
  },
  {
    direction: "right",
    labelKo: "우측 보행 (RIGHT)",
    spriteUrl: NANO_BANANA_V14_WALK_SPRITES.right,
  },
  {
    direction: "up",
    labelKo: "후면 보행 (UP)",
    spriteUrl: NANO_BANANA_V14_WALK_SPRITES.up,
  },
];

const NANO_BANANA_V14_ROOM_MODULES: readonly NanoBananaV14RoomModuleSpec[] = [
  {
    id: "story-tarot-oracle-pavilion",
    nameKo: "스토리 타로·로어 파빌리온",
    imageUrl:
      "/assets/virtual-studio/nano-banana-v14/rooms/tarot-story-oracle-pavilion.webp",
  },
  {
    id: "retro-arcade-gacha-lounge",
    nameKo: "레트로 아케이드·가챠 라운지",
    imageUrl:
      "/assets/virtual-studio/nano-banana-v14/rooms/retro-arcade-gacha-lounge.webp",
  },
  {
    id: "recruit-interview-conservatory",
    nameKo: "포트폴리오·채용 인터뷰 온실",
    imageUrl:
      "/assets/virtual-studio/nano-banana-v14/rooms/recruit-interview-conservatory.webp",
  },
  {
    id: "global-ip-pitch-boardroom",
    nameKo: "글로벌 IP 피칭·드라마 보드룸",
    imageUrl:
      "/assets/virtual-studio/nano-banana-v14/rooms/global-ip-pitch-boardroom.webp",
  },
];

const NANO_BANANA_STAGE_STORAGE_KEY =
  "toonspectrum:nano-banana-studio-selection:v1";

export interface NanoBananaPersistedSelection {
  readonly themeId: NanoBananaStudioThemeId;
  readonly personaId: NanoBananaCreatorPersonaId;
  readonly walkDirection: NanoBananaWalkDirection;
  readonly roomModuleId: NanoBananaV14RoomModuleId;
  readonly emoteId: NanoBananaV13EmoteId;
}

const DEFAULT_SELECTION: NanoBananaPersistedSelection = {
  themeId: "seoul-editorial-hq",
  personaId: "line-artist",
  walkDirection: "down",
  roomModuleId: "story-tarot-oracle-pavilion",
  emoteId: "crunch-flame-focus",
};

function readNanoBananaPersistedSelection(): NanoBananaPersistedSelection {
  if (typeof window === "undefined") return DEFAULT_SELECTION;
  try {
    const raw = window.localStorage.getItem(NANO_BANANA_STAGE_STORAGE_KEY);
    if (!raw) return DEFAULT_SELECTION;
    const parsed = JSON.parse(raw) as Partial<NanoBananaPersistedSelection>;
    const validTheme = NANO_BANANA_V11_STUDIO_THEMES.some(
      (t) => t.id === parsed.themeId,
    );
    const validPersona = NANO_BANANA_V11_CREATOR_PERSONAS.some(
      (p) => p.id === parsed.personaId,
    );
    return {
      themeId:
        validTheme && parsed.themeId ? parsed.themeId : DEFAULT_SELECTION.themeId,
      personaId:
        validPersona && parsed.personaId
          ? parsed.personaId
          : DEFAULT_SELECTION.personaId,
      walkDirection: parsed.walkDirection ?? DEFAULT_SELECTION.walkDirection,
      roomModuleId: parsed.roomModuleId ?? DEFAULT_SELECTION.roomModuleId,
      emoteId: parsed.emoteId ?? DEFAULT_SELECTION.emoteId,
    };
  } catch {
    return DEFAULT_SELECTION;
  }
}

function writeNanoBananaPersistedSelection(
  next: NanoBananaPersistedSelection,
): void {
  updateNanoBanana2dRuntimeState({
    themeId: next.themeId,
    personaId: next.personaId,
  });
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      NANO_BANANA_STAGE_STORAGE_KEY,
      JSON.stringify(next),
    );
    const mappedTheme = NANO_BANANA_TO_2D_SPACE_THEME[next.themeId];
    if (mappedTheme) {
      writeStudioSpaceTheme(mappedTheme);
      window.dispatchEvent(
        new CustomEvent<StudioSpaceThemeKey>("toonspectrum:space-theme-change", {
          detail: mappedTheme,
        }),
      );
    }
  } catch {
    // Ignore storage quota errors
  }
}

/**
 * 입장 로비(/studio/space 첫 화면)에서 12대 나노바나나 2.5D 스튜디오 테마, 8인 크리에이터 캐스트,
 * 4종 스튜디오 룸 모듈(v14), 4방향 보행 스프라이트(v14)를 즉시 확인하고 선택하는 쇼케이스 카드.
 */
export function StudioVirtualSpaceNanoBananaLobbyShowcase() {
  const [selection, setSelection] = useState<NanoBananaPersistedSelection>(
    readNanoBananaPersistedSelection,
  );

  const updateSelection = (patch: Partial<NanoBananaPersistedSelection>) => {
    setSelection((prev) => {
      const next = { ...prev, ...patch };
      writeNanoBananaPersistedSelection(next);
      return next;
    });
  };

  const activeTheme =
    NANO_BANANA_V11_STUDIO_THEMES.find((t) => t.id === selection.themeId) ??
    NANO_BANANA_V11_STUDIO_THEMES[0];
  const activePersona =
    NANO_BANANA_V11_CREATOR_PERSONAS.find((p) => p.id === selection.personaId) ??
    NANO_BANANA_V11_CREATOR_PERSONAS[0];
  const activeWalk =
    NANO_BANANA_V14_DIRECTIONAL_WALK_SPRITES.find(
      (w) => w.direction === selection.walkDirection,
    ) ?? NANO_BANANA_V14_DIRECTIONAL_WALK_SPRITES[0];
  const activeRoom =
    NANO_BANANA_V14_ROOM_MODULES.find((r) => r.id === selection.roomModuleId) ??
    NANO_BANANA_V14_ROOM_MODULES[0];
  const activeEmote =
    NANO_BANANA_V13_CREATOR_EMOTES.find((e) => e.id === selection.emoteId) ??
    NANO_BANANA_V13_CREATOR_EMOTES[0];

  return (
    <section
      data-testid="lobby-nano-banana-showcase"
      aria-label="스마트 AI 2.5D 스튜디오 테마 및 크리에이터 스프라이트 쇼케이스"
      className="mt-4 space-y-3 rounded-2xl border border-accent bg-card/90 p-3.5 text-fg shadow-sm backdrop-blur-md"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Wand2 className="h-4 w-4 text-accent" />
          <strong className="text-xs font-bold text-fg">
            스마트 AI 2.5D 스튜디오 아틀리에 (12대 테마 · 8인 캐스트 · 4방향 보행 · 4룸 모듈)
          </strong>
        </div>
        <span className="rounded-full border border-accent bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent">
          ✦ 스마트 AI 보조 연동
        </span>
      </div>

      {/* Live Preview Grid: Theme Hero + Cast Sprite + 4-Dir Walk + v14 Room Module */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-12">
        <div className="overflow-hidden rounded-xl border border-line bg-panel p-2 sm:col-span-6">
          <div className="relative h-28 w-full overflow-hidden rounded-lg border border-line bg-card">
            <img
              data-testid="lobby-nano-banana-theme-hero-img"
              src={activeTheme.assetUrl}
              alt={activeTheme.titleKo}
              className="h-full w-full object-cover"
            />
            <span className="absolute bottom-1.5 left-1.5 rounded bg-panel/90 px-2 py-0.5 text-[10px] font-bold text-fg backdrop-blur-sm">
              {activeTheme.titleKo}
            </span>
          </div>
          <p className="mt-1.5 line-clamp-1 text-[11px] text-fg-2">
            {activeTheme.atmosphereTagKo} · {activeTheme.subtitleKo}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:col-span-6">
          <div className="flex flex-col items-center justify-between rounded-xl border border-line bg-panel p-2 text-center">
            <span className="text-[10px] font-semibold text-fg-2">8인 크리에이터</span>
            <img
              data-testid="lobby-nano-banana-cast-img"
              src={activePersona.workSpriteUrl}
              alt={activePersona.nameKo}
              className="h-16 w-16 rounded border border-line bg-card object-contain p-0.5"
            />
            <strong className="line-clamp-1 text-[10px] text-fg">
              {activePersona.nameKo}
            </strong>
          </div>

          <div className="flex flex-col items-center justify-between rounded-xl border border-line bg-panel p-2 text-center">
            <span className="text-[10px] font-semibold text-fg-2">4방향 보행(v14)</span>
            <img
              data-testid="lobby-nano-banana-walk-img"
              src={activeWalk.spriteUrl}
              alt={activeWalk.labelKo}
              className="h-16 w-16 rounded border border-line bg-card object-contain p-0.5"
            />
            <div className="flex gap-1">
              {NANO_BANANA_V14_DIRECTIONAL_WALK_SPRITES.map((w) => (
                <button
                  key={w.direction}
                  type="button"
                  data-testid={`lobby-walk-dir-${w.direction}-btn`}
                  onClick={() => updateSelection({ walkDirection: w.direction })}
                  className={`rounded px-1 py-0.5 text-[9px] font-bold ${
                    selection.walkDirection === w.direction
                      ? "bg-accent-soft text-accent"
                      : "bg-card text-fg-2"
                  }`}
                >
                  {w.direction.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col items-center justify-between rounded-xl border border-line bg-panel p-2 text-center">
            <span className="text-[10px] font-semibold text-fg-2">특화 룸(v14)</span>
            <img
              data-testid="lobby-nano-banana-room-img"
              src={activeRoom.imageUrl}
              alt={activeRoom.nameKo}
              className="h-16 w-full rounded border border-line bg-card object-cover"
            />
            <strong className="line-clamp-1 text-[10px] text-fg">
              {activeRoom.nameKo}
            </strong>
          </div>
        </div>
      </div>

      {/* 12 Studio Themes Selector Pills */}
      <div>
        <div className="mb-1 flex items-center justify-between text-[10px] text-fg-2">
          <span className="font-semibold text-fg">12대 스튜디오 테마 선택 (입장 시 연동)</span>
          <span>선택 테마: {activeTheme.titleKo}</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {NANO_BANANA_V11_STUDIO_THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              data-testid={`lobby-theme-${theme.id}-btn`}
              onClick={() => updateSelection({ themeId: theme.id })}
              className={`rounded-lg border px-2 py-1 text-[10px] font-medium transition ${
                selection.themeId === theme.id
                  ? "border-accent bg-accent-soft font-bold text-accent"
                  : "border-line bg-panel text-fg-2 hover:text-fg"
              }`}
            >
              {theme.titleKo}
            </button>
          ))}
        </div>
      </div>

      {/* 8 Creator Cast + 4 Room Modules Selector Pills */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <span className="mb-1 block text-[10px] font-semibold text-fg">
            8인 개성파 웹툰 크리에이터 & 마스코트
          </span>
          <div className="flex flex-wrap gap-1">
            {NANO_BANANA_V11_CREATOR_PERSONAS.map((persona) => (
              <button
                key={persona.id}
                type="button"
                data-testid={`lobby-persona-${persona.id}-btn`}
                onClick={() => updateSelection({ personaId: persona.id })}
                className={`rounded-lg border px-2 py-0.5 text-[10px] transition ${
                  selection.personaId === persona.id
                    ? "border-accent bg-accent-soft font-bold text-accent"
                    : "border-line bg-panel text-fg-2"
                }`}
              >
                {persona.nameKo.split(" (")[0]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="mb-1 block text-[10px] font-semibold text-fg">
            4종 웹툰 특화 스튜디오 룸 모듈 (v14) · 이모트 ({activeEmote.labelKo})
          </span>
          <div className="flex flex-wrap gap-1">
            {NANO_BANANA_V14_ROOM_MODULES.map((room) => (
              <button
                key={room.id}
                type="button"
                data-testid={`lobby-room-${room.id}-btn`}
                onClick={() => updateSelection({ roomModuleId: room.id })}
                className={`rounded-lg border px-2 py-0.5 text-[10px] transition ${
                  selection.roomModuleId === room.id
                    ? "border-accent bg-accent-soft font-bold text-accent"
                    : "border-line bg-panel text-fg-2"
                }`}
              >
                {room.nameKo}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * 메인 스튜디오 무대(/studio/space 입장 후 3D/2D 스테이지 및 꾸미기 패널) 상단에 상시 노출되는
 * 나노 바나나 2.5D 스튜디오 & 실무 워크벤치 플로팅 도크 및 원클릭 전체 워크벤치 오버레이.
 */
export function StudioVirtualSpaceNanoBananaStageHud() {
  const [selection, setSelection] = useState<NanoBananaPersistedSelection>(
    readNanoBananaPersistedSelection,
  );
  const [workbenchOpen, setWorkbenchOpen] = useState(false);
  const [activeWorkstationId, setActiveWorkstationId] = useState<string>(
    NANO_BANANA_2D_WORKSTATIONS[0]?.id ?? "nb-plaza-cintiq-pod",
  );

  useEffect(() => {
    updateNanoBanana2dRuntimeState({
      enabled: true,
      themeId: selection.themeId,
      personaId: selection.personaId,
    });
  }, [selection.personaId, selection.themeId]);

  const activeTheme =
    NANO_BANANA_V11_STUDIO_THEMES.find((t) => t.id === selection.themeId) ??
    NANO_BANANA_V11_STUDIO_THEMES[0];
  const activePersona =
    NANO_BANANA_V11_CREATOR_PERSONAS.find((p) => p.id === selection.personaId) ??
    NANO_BANANA_V11_CREATOR_PERSONAS[0];
  const activeWalk =
    NANO_BANANA_V14_DIRECTIONAL_WALK_SPRITES.find(
      (w) => w.direction === selection.walkDirection,
    ) ?? NANO_BANANA_V14_DIRECTIONAL_WALK_SPRITES[0];
  const activeEmote =
    NANO_BANANA_V13_CREATOR_EMOTES.find((e) => e.id === selection.emoteId) ??
    NANO_BANANA_V13_CREATOR_EMOTES[0];
  const activeProp = NANO_BANANA_V13_STUDIO_PROPS[0];

  const cycleTheme = () => {
    const idx = NANO_BANANA_V11_STUDIO_THEMES.findIndex(
      (t) => t.id === selection.themeId,
    );
    const nextTheme =
      NANO_BANANA_V11_STUDIO_THEMES[
        (idx + 1) % NANO_BANANA_V11_STUDIO_THEMES.length
      ] ?? NANO_BANANA_V11_STUDIO_THEMES[0];
    const next = { ...selection, themeId: nextTheme.id };
    setSelection(next);
    writeNanoBananaPersistedSelection(next);
  };

  const cyclePersona = () => {
    const idx = NANO_BANANA_V11_CREATOR_PERSONAS.findIndex(
      (p) => p.id === selection.personaId,
    );
    const nextPersona =
      NANO_BANANA_V11_CREATOR_PERSONAS[
        (idx + 1) % NANO_BANANA_V11_CREATOR_PERSONAS.length
      ] ?? NANO_BANANA_V11_CREATOR_PERSONAS[0];
    const next = { ...selection, personaId: nextPersona.id };
    setSelection(next);
    writeNanoBananaPersistedSelection(next);
  };

  const cycleEmote = () => {
    const idx = NANO_BANANA_V13_CREATOR_EMOTES.findIndex(
      (e) => e.id === selection.emoteId,
    );
    const nextEmote =
      NANO_BANANA_V13_CREATOR_EMOTES[
        (idx + 1) % NANO_BANANA_V13_CREATOR_EMOTES.length
      ] ?? NANO_BANANA_V13_CREATOR_EMOTES[0];
    const next = { ...selection, emoteId: nextEmote.id };
    setSelection(next);
    writeNanoBananaPersistedSelection(next);
    triggerNanoBanana2dEmote(nextEmote.id, 4_000);
    requestStudioActiveBridgeEmote("sparkles");
  };

  const cycleWalkDirection = () => {
    const dirs: readonly NanoBananaWalkDirection[] = ["down", "left", "right", "up"];
    const idx = dirs.indexOf(selection.walkDirection);
    const nextDir = dirs[(idx + 1) % dirs.length] ?? "down";
    const next = { ...selection, walkDirection: nextDir };
    setSelection(next);
    writeNanoBananaPersistedSelection(next);
    triggerNanoBanana2dWalkPreview(nextDir, 2_800);
  };

  const teleportToWorkstation = (stationId: string) => {
    const station = NANO_BANANA_2D_WORKSTATIONS.find((s) => s.id === stationId);
    if (!station) return;
    setActiveWorkstationId(station.id);
    requestStudioActiveBridgeTeleport(station.spawnPoint);
  };

  return (
    <>
      <div
        data-testid="main-stage-nano-banana-hud"
        data-space-interactive="true"
        className="pointer-events-auto absolute left-4 top-[4.25rem] z-10 flex max-w-[calc(100vw-2rem)] flex-col gap-1.5 rounded-2xl border border-accent bg-panel/95 px-3 py-2 text-xs text-fg shadow-lg backdrop-blur-md md:max-w-[calc(100vw-20.5rem)]"
      >
        <div className="flex flex-wrap items-center gap-2">
          <img
            src={activeTheme.assetUrl}
            alt={activeTheme.titleKo}
            className="h-9 w-12 rounded-lg border border-line object-cover"
          />
          <img
            src={activePersona.workSpriteUrl}
            alt={activePersona.nameKo}
            className="h-9 w-9 rounded-lg border border-line bg-card object-contain p-0.5"
          />
          <img
            src={activeWalk.spriteUrl}
            alt={activeWalk.labelKo}
            className="h-9 w-9 rounded-lg border border-line bg-card object-contain p-0.5"
          />
          <div className="flex flex-col">
            <span className="flex items-center gap-1 text-[11px] font-bold text-fg">
              <Sparkles className="h-3 w-3 text-accent" />
              {activeTheme.titleKo}
            </span>
            <span className="text-[10px] text-fg-2">
              {activePersona.nameKo.split(" (")[0]} · 보행 {selection.walkDirection.toUpperCase()} · {activeEmote.labelKo} · {activeProp.labelKo}
            </span>
          </div>

          <button
            type="button"
            data-testid="main-stage-cycle-theme-btn"
            onClick={cycleTheme}
            className="rounded-lg border border-line bg-card px-2 py-1 text-[11px] font-medium text-fg hover:border-accent"
          >
            테마 전환 (12종)
          </button>
          <button
            type="button"
            data-testid="main-stage-cycle-persona-btn"
            onClick={cyclePersona}
            className="rounded-lg border border-line bg-card px-2 py-1 text-[11px] font-medium text-fg hover:border-accent"
          >
            <UserCheck className="mr-1 inline h-3 w-3 text-accent" />
            캐릭터 전환 (8인)
          </button>
          <button
            type="button"
            data-testid="main-stage-cycle-walk-btn"
            onClick={cycleWalkDirection}
            className="rounded-lg border border-line bg-card px-2 py-1 text-[11px] font-medium text-fg hover:border-accent"
          >
            <Compass className="mr-1 inline h-3 w-3 text-accent" />
            4방향 보행
          </button>
          <button
            type="button"
            data-testid="main-stage-cycle-emote-btn"
            onClick={cycleEmote}
            className="rounded-lg border border-line bg-card px-2 py-1 text-[11px] font-medium text-fg hover:border-accent"
          >
            이모트 ({activeEmote.labelKo})
          </button>
          <button
            type="button"
            data-testid="main-stage-open-nano-banana-workbench-btn"
            onClick={() => setWorkbenchOpen((prev) => !prev)}
            className="flex items-center gap-1 rounded-xl border border-accent bg-accent-soft px-3 py-1.5 text-xs font-bold text-accent shadow-sm transition hover:opacity-95"
          >
            <Layers className="h-3.5 w-3.5" />
            {workbenchOpen
              ? "2.5D 스튜디오 워크벤치 닫기"
              : "✦ 스마트 AI 2.5D 스튜디오 & 실무 워크벤치 열기"}
          </button>
        </div>

        {/* 2D 월드 내 2.5D 웹툰 워크스테이션 즉시 이동 바 */}
        <div className="flex flex-wrap items-center gap-1 border-t border-line/70 pt-1.5">
          <span className="mr-1 flex items-center gap-1 text-[10px] font-bold text-accent">
            <MapPin className="h-3 w-3" />
            2D 워크스테이션 이동:
          </span>
          {NANO_BANANA_2D_WORKSTATIONS.slice(0, 8).map((station) => (
            <button
              key={station.id}
              type="button"
              data-testid={`main-stage-teleport-${station.id}-btn`}
              onClick={() => teleportToWorkstation(station.id)}
              className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition ${
                activeWorkstationId === station.id
                  ? "border-accent bg-accent-soft font-bold text-accent"
                  : "border-line bg-card text-fg-2 hover:border-accent hover:text-fg"
              }`}
            >
              {station.titleKo}
            </button>
          ))}
        </div>
      </div>

      {workbenchOpen ? (
        <div
          data-testid="main-stage-nano-banana-workbench-drawer"
          data-space-interactive="true"
          role="dialog"
          aria-label="스마트 AI 2.5D 차세대 웹툰 가상 스튜디오 및 실무 마감 워크벤치"
          className="pointer-events-auto absolute inset-4 z-30 overflow-y-auto rounded-2xl border border-accent bg-panel/95 p-4 text-fg shadow-2xl backdrop-blur-xl"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-bold text-fg">
                <Wand2 className="h-4 w-4 text-accent" />
                스마트 AI 2.5D 차세대 웹툰 가상 스튜디오 & 실무 마감 워크벤치
              </h2>
              <p className="text-xs text-fg-2">
                12대 장르 스튜디오 테마 · 8인 개성파 캐릭터/마스코트 · 4방향 보행(v14) · 4종 특화 룸(v14) · 60fps 물리엔진 · WebAudio HRTF 사운드 · 일일 원고 마감 워크벤치
              </p>
            </div>
            <button
              type="button"
              data-testid="main-stage-close-nano-banana-workbench-btn"
              onClick={() => setWorkbenchOpen(false)}
              className="flex items-center gap-1 rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-bold text-fg hover:border-accent"
            >
              <X className="h-4 w-4" />
              3D/2D 무대로 돌아가기
            </button>
          </div>

          <div className="space-y-4">
            <StudioVirtualOfficeNextGenEnginePanel />
            <StudioVirtualOfficeSpatialCanvasHud />
          </div>
        </div>
      ) : null}
    </>
  );
}
