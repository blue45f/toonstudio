/**
 * 나노 바나나(Nano Banana v10~v14) 2D Phaser 월드·캐릭터·워크스테이션 통합 런타임.
 *
 * - 2D Phaser 캔버스(StudioCampusRuntime + StudioSpriteVisualApplier)에서 평면 도형 가구와 구형 v8 스프라이트를
 *   나노 바나나 2.5D 웹툰 제작 워크스테이션·룸 모듈·8인 전문 창작자 페르소나·4방향 보행 스프라이트로 실시간 업그레이드한다.
 * - StudioVirtualSpaceNanoBananaStageHud에서 테마·페르소나·포즈·이모트·4방향 보행·존 텔레포트를 조작하면
 *   즉시 2D Phaser 월드 안의 내 캐릭터(localSprite), NPC, 광장/룸 테마 배너, 워크스테이션 오라에 반영된다.
 */
import type * as Phaser from "phaser";

import {
  NANO_BANANA_V11_CREATOR_PERSONAS,
  NANO_BANANA_V11_STUDIO_THEMES,
  NANO_BANANA_V13_CREATOR_EMOTES,
  type CreatorPersonaPose,
  type NanoBananaCreatorPersonaId,
  type NanoBananaStudioThemeId,
  type NanoBananaV13EmoteId,
  type NanoBananaV13PropId,
} from "./studio-virtual-office-nextgen-engine-data";
import { NANO_BANANA_V14_WALK_SPRITES } from "./studio-virtual-office-nextgen-engine-model";
import type { StudioCharacterFramePresentation, StudioCharacterMotionState } from "./studio-virtual-space-character-skins";
import type { StudioVirtualSpaceFacing, StudioVirtualSpacePoint } from "./studio-virtual-space-model";

export type NanoBanana2dWalkDirection = keyof typeof NANO_BANANA_V14_WALK_SPRITES;

export type NanoBanana2dExtraPropId =
  | NanoBananaV13PropId
  | "cintiq-drawing-desk"
  | "hologram-pedestal"
  | "lofi-bookshelf-lounge"
  | "on-air-critique-booth"
  | "biophilic-planter-set";

export type NanoBanana2dRoomModuleId =
  | "tarot-story-oracle-pavilion"
  | "retro-arcade-gacha-lounge"
  | "recruit-interview-conservatory"
  | "global-ip-pitch-boardroom";

export interface NanoBanana2dRuntimeState {
  readonly enabled: boolean;
  readonly themeId: NanoBananaStudioThemeId;
  readonly personaId: NanoBananaCreatorPersonaId;
  readonly pose: CreatorPersonaPose;
  readonly activeEmoteId: NanoBananaV13EmoteId | null;
  readonly activeEmoteUntilMs: number;
  readonly walkDirectionOverride: NanoBanana2dWalkDirection | null;
  readonly walkDirectionOverrideUntilMs: number;
  readonly pendingTeleportPoint: StudioVirtualSpacePoint | null;
  readonly activeWorkstationId: string | null;
}

let currentState: NanoBanana2dRuntimeState = Object.freeze({
  enabled: true,
  themeId: "seoul-editorial-hq",
  personaId: "line-artist",
  pose: "idle",
  activeEmoteId: null,
  activeEmoteUntilMs: 0,
  walkDirectionOverride: null,
  walkDirectionOverrideUntilMs: 0,
  pendingTeleportPoint: null,
  activeWorkstationId: null,
});

const listeners = new Set<(state: NanoBanana2dRuntimeState) => void>();

export function getNanoBanana2dRuntimeState(): NanoBanana2dRuntimeState {
  return currentState;
}

export function updateNanoBanana2dRuntimeState(patch: Partial<NanoBanana2dRuntimeState>): NanoBanana2dRuntimeState {
  currentState = Object.freeze({ ...currentState, ...patch });
  for (const listener of listeners) listener(currentState);
  return currentState;
}

export function subscribeNanoBanana2dRuntimeState(listener: (state: NanoBanana2dRuntimeState) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function triggerNanoBanana2dEmote(emoteId: NanoBananaV13EmoteId, durationMs = 3_600): NanoBanana2dRuntimeState {
  return updateNanoBanana2dRuntimeState({
    activeEmoteId: emoteId,
    activeEmoteUntilMs: Date.now() + Math.max(500, durationMs),
  });
}

export function triggerNanoBanana2dWalkPreview(
  direction: NanoBanana2dWalkDirection | null,
  durationMs = 2_800,
): NanoBanana2dRuntimeState {
  return updateNanoBanana2dRuntimeState({
    walkDirectionOverride: direction,
    walkDirectionOverrideUntilMs: direction ? Date.now() + Math.max(400, durationMs) : 0,
  });
}

export function requestNanoBanana2dTeleport(
  point: StudioVirtualSpacePoint,
  workstationId: string | null = null,
): NanoBanana2dRuntimeState {
  return updateNanoBanana2dRuntimeState({
    pendingTeleportPoint: { x: Math.round(point.x), y: Math.round(point.y) },
    activeWorkstationId: workstationId,
  });
}

export function consumeNanoBanana2dTeleport(): StudioVirtualSpacePoint | null {
  const target = currentState.pendingTeleportPoint;
  if (!target) return null;
  currentState = Object.freeze({ ...currentState, pendingTeleportPoint: null });
  return target;
}

/** 나노 바나나 정사각형(256×256·320×320) 캐릭터 스프라이트의 표준 접지 프레젠테이션. */
export const NANO_BANANA_CHARACTER_PRESENTATION: StudioCharacterFramePresentation = Object.freeze({
  originX: 0.5,
  originY: 0.94,
  displayHeightRatio: 1.04,
  seatOriginY: 0.82,
});

export const nanoBananaWalkTextureKey = (direction: NanoBanana2dWalkDirection): string =>
  `nb-walk-${direction}`;
export const nanoBananaPersonaTextureKey = (personaId: NanoBananaCreatorPersonaId, pose: CreatorPersonaPose): string =>
  `nb-cast-${personaId}-${pose}`;
export const nanoBananaEmoteTextureKey = (emoteId: NanoBananaV13EmoteId): string =>
  `nb-emote-${emoteId}`;
export const nanoBananaPropTextureKey = (propId: NanoBanana2dExtraPropId): string =>
  `nb-prop-${propId}`;
export const nanoBananaRoomTextureKey = (roomId: NanoBanana2dRoomModuleId): string =>
  `nb-room-${roomId}`;
export const nanoBananaThemeTextureKey = (themeId: NanoBananaStudioThemeId): string =>
  `nb-theme-${themeId}`;

/** 캠퍼스 8인 상주 NPC를 나노 바나나 8인 웹툰 전문 창작자 캐스트에 1:1 매핑한다. */
export const NANO_BANANA_NPC_CAST_MAP: Readonly<Record<string, NanoBananaCreatorPersonaId>> = Object.freeze({
  "npc-concierge": "chief-pd",
  "npc-artist": "line-artist",
  "npc-producer": "story-writer",
  "npc-archivist": "cgi-director",
  "npc-cafe": "studio-cat-mascot",
  "npc-security": "action-mocap-actor",
  "npc-host": "sound-letterer",
  "npc-editor": "colorist",
});

export interface NanoBanana2dActorVisualMatch {
  readonly textureKey: string;
  readonly flipX: boolean;
  readonly presentation: StudioCharacterFramePresentation;
}

/**
 * 플레이어(self) 및 캠퍼스 NPC의 현재 방향·상태에 맞는 나노 바나나 2D 스프라이트 텍스처를 결정한다.
 * 텍스처가 아직 로드되지 않았거나(유닛 테스트 포함) 비활성화된 경우 null을 반환해 기존 경로로 폴백한다.
 */
export function resolveNanoBanana2dActorTexture(
  textures: { exists(key: string): boolean },
  input: {
    readonly owner: string;
    readonly skinKey: string;
    readonly facing: StudioVirtualSpaceFacing;
    readonly state: StudioCharacterMotionState;
    readonly nowMs?: number;
  },
): NanoBanana2dActorVisualMatch | null {
  const state = currentState;
  if (!state.enabled) return null;
  const now = input.nowMs ?? Date.now();

  if (input.owner === "self") {
    if (state.activeEmoteId && now < state.activeEmoteUntilMs) {
      const emoteKey = nanoBananaEmoteTextureKey(state.activeEmoteId);
      if (textures.exists(emoteKey)) {
        return {
          textureKey: emoteKey,
          flipX: input.facing === "left",
          presentation: NANO_BANANA_CHARACTER_PRESENTATION,
        };
      }
    }
    if (state.walkDirectionOverride && now < state.walkDirectionOverrideUntilMs) {
      const overrideWalkKey = nanoBananaWalkTextureKey(state.walkDirectionOverride);
      if (textures.exists(overrideWalkKey)) {
        return {
          textureKey: overrideWalkKey,
          flipX: false,
          presentation: NANO_BANANA_CHARACTER_PRESENTATION,
        };
      }
    }
    if (input.state === "walk") {
      const walkKey = nanoBananaWalkTextureKey(input.facing);
      if (textures.exists(walkKey)) {
        return {
          textureKey: walkKey,
          flipX: false,
          presentation: NANO_BANANA_CHARACTER_PRESENTATION,
        };
      }
    }
    const isWorkingState =
      input.state === "draw" || input.state === "review" || input.state === "talk" || state.pose === "work";
    const pose: CreatorPersonaPose = isWorkingState ? "work" : "idle";
    const personaKey = nanoBananaPersonaTextureKey(state.personaId, pose);
    if (textures.exists(personaKey)) {
      return {
        textureKey: personaKey,
        flipX: input.facing === "left",
        presentation: NANO_BANANA_CHARACTER_PRESENTATION,
      };
    }
    return null;
  }

  const mappedPersona = NANO_BANANA_NPC_CAST_MAP[input.skinKey];
  if (!mappedPersona) return null;
  const npcPose: CreatorPersonaPose =
    input.state === "draw" || input.state === "review" || input.state === "talk" ? "work" : "idle";
  const npcKey = nanoBananaPersonaTextureKey(mappedPersona, npcPose);
  if (textures.exists(npcKey)) {
    return {
      textureKey: npcKey,
      flipX: input.facing === "left",
      presentation: NANO_BANANA_CHARACTER_PRESENTATION,
    };
  }
  return null;
}

export interface NanoBanana2dWorkstationPlacement {
  readonly id: string;
  readonly zoneId: string;
  readonly titleKo: string;
  readonly subtitleKo: string;
  readonly textureKey: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly spawnPoint: StudioVirtualSpacePoint;
  readonly accentColor: number;
}

/**
 * 2D 캠퍼스 전역(광장 스폰 주변 + 10개 룸)에 배치되는 나노 바나나 2.5D 웹툰 특화 워크스테이션 & 룸 쇼케이스.
 * 광장(PLAZA) 4대 워크스테이션은 입장 즉시(1472, 1290) 한눈에 보이도록 분수대 대각선 4방위에 배치한다.
 */
export const NANO_BANANA_2D_WORKSTATIONS: readonly NanoBanana2dWorkstationPlacement[] = Object.freeze([
  {
    id: "nb-plaza-cintiq-pod",
    zoneId: "creator-plaza",
    titleKo: "🎨 듀얼 신티크 원고 피드백 포드",
    subtitleKo: "Wacom 5K 실시간 레드라인 합평 데스크",
    textureKey: nanoBananaPropTextureKey("dual-cintiq-critique-pod"),
    x: 1272,
    y: 1068,
    width: 148,
    height: 136,
    spawnPoint: { x: 1272, y: 1126 },
    accentColor: 0x38bdf8,
  },
  {
    id: "nb-plaza-hologram-table",
    zoneId: "creator-plaza",
    titleKo: "🧊 3D 블렌더 배경 홀로그램 테이블",
    subtitleKo: "판타지 성채·등장인물 360° 턴어라운드",
    textureKey: nanoBananaPropTextureKey("blender-hologram-stage-table"),
    x: 1672,
    y: 1068,
    width: 152,
    height: 138,
    spawnPoint: { x: 1672, y: 1126 },
    accentColor: 0xfbbf24,
  },
  {
    id: "nb-plaza-foley-booth",
    zoneId: "creator-plaza",
    titleKo: "🎧 웹툰 사운드 & 효과음 폴리 부스",
    subtitleKo: "Dolby Atmos 보이스 더빙·의성어 믹싱",
    textureKey: nanoBananaPropTextureKey("webtoon-sound-foley-booth"),
    x: 1272,
    y: 1264,
    width: 144,
    height: 134,
    spawnPoint: { x: 1272, y: 1316 },
    accentColor: 0xa855f7,
  },
  {
    id: "nb-plaza-espresso-cat-lounge",
    zoneId: "creator-plaza",
    titleKo: "☕ 마감 에스프레소 & 캣 해먹 라운지",
    subtitleKo: "바리스타 스팀 라떼 & 치즈태비 힐링석",
    textureKey: nanoBananaPropTextureKey("deadline-espresso-cat-lounge"),
    x: 1672,
    y: 1264,
    width: 148,
    height: 136,
    spawnPoint: { x: 1672, y: 1316 },
    accentColor: 0x34d399,
  },
  {
    id: "nb-studio-main-cintiq",
    zoneId: "personal-atelier",
    titleKo: "✒️ 메인 신티크 작화 아틀리에",
    subtitleKo: "선화·채색·식자 전담 프로덕션 데스크",
    textureKey: nanoBananaPropTextureKey("cintiq-drawing-desk"),
    x: 1000,
    y: 564,
    width: 164,
    height: 148,
    spawnPoint: { x: 1000, y: 618 },
    accentColor: 0x38bdf8,
  },
  {
    id: "nb-cowork-tarot-pavilion",
    zoneId: "story-lab",
    titleKo: "🔮 웹툰 스토리 타로 & 세계관 파빌리온",
    subtitleKo: "플롯 분기점·회귀물 설정 오라클 테이블",
    textureKey: nanoBananaRoomTextureKey("tarot-story-oracle-pavilion"),
    x: 1984,
    y: 528,
    width: 196,
    height: 156,
    spawnPoint: { x: 1984, y: 604 },
    accentColor: 0xc084fc,
  },
  {
    id: "nb-cafe-lofi-storyhouse",
    zoneId: "creator-cafe",
    titleKo: "📚 로파이 스토리보드 북카페 라운지",
    subtitleKo: "원고 콘티 열람 & 에스프레소 휴식존",
    textureKey: nanoBananaPropTextureKey("lofi-bookshelf-lounge"),
    x: 2536,
    y: 648,
    width: 168,
    height: 148,
    spawnPoint: { x: 2620, y: 648 },
    accentColor: 0xf59e0b,
  },
  {
    id: "nb-lobby-recruit-conservatory",
    zoneId: "skyport",
    titleKo: "🌿 작가 포트폴리오 & 채용 인터뷰 온실",
    subtitleKo: "신규 어시스턴트·작가 영입 미팅 라운지",
    textureKey: nanoBananaRoomTextureKey("recruit-interview-conservatory"),
    x: 448,
    y: 492,
    width: 192,
    height: 152,
    spawnPoint: { x: 448, y: 576 },
    accentColor: 0x10b981,
  },
  {
    id: "nb-talk-ip-boardroom",
    zoneId: "team-meeting",
    titleKo: "🎬 글로벌 웹툰 IP 드라마 피칭 보드룸",
    subtitleKo: "OTT 영상화·해외 연재 런칭 프레젠테이션",
    textureKey: nanoBananaRoomTextureKey("global-ip-pitch-boardroom"),
    x: 448,
    y: 1042,
    width: 210,
    height: 154,
    spawnPoint: { x: 448, y: 1116 },
    accentColor: 0x60a5fa,
  },
  {
    id: "nb-game-retro-arcade",
    zoneId: "arcade",
    titleKo: "🕹️ 레트로 픽셀 아케이드 & 캣 가챠 라운지",
    subtitleKo: "마감 후 팀원 미니게임 & 굿즈 캡슐 뽑기",
    textureKey: nanoBananaRoomTextureKey("retro-arcade-gacha-lounge"),
    x: 448,
    y: 1684,
    width: 198,
    height: 152,
    spawnPoint: { x: 448, y: 1588 },
    accentColor: 0xf472b6,
  },
]);

/** 기존 캠퍼스 평면 오브젝트 ID → 나노 바나나 고해상도 2.5D 텍스처 교체 매핑. */
export const NANO_BANANA_CAMPUS_OBJECT_UPGRADES: Readonly<
  Record<string, { readonly textureKey: string; readonly widthScale?: number; readonly heightScale?: number }>
> = Object.freeze({
  "studio-monitor-desk": { textureKey: nanoBananaPropTextureKey("dual-cintiq-critique-pod"), widthScale: 1.38, heightScale: 1.85 },
  "studio-green-screen": { textureKey: nanoBananaPropTextureKey("on-air-critique-booth"), widthScale: 0.82, heightScale: 1.18 },
  "cowork-focus-desk-west": { textureKey: nanoBananaPropTextureKey("dual-cintiq-critique-pod"), widthScale: 1.35, heightScale: 1.82 },
  "cowork-focus-desk-east": { textureKey: nanoBananaPropTextureKey("blender-hologram-stage-table"), widthScale: 1.38, heightScale: 1.85 },
  "lobby-phone-booth-west": { textureKey: nanoBananaPropTextureKey("webtoon-sound-foley-booth"), widthScale: 1.45, heightScale: 1.15 },
  "lobby-phone-booth-east": { textureKey: nanoBananaPropTextureKey("on-air-critique-booth"), widthScale: 1.45, heightScale: 1.15 },
  "cafe-counter": { textureKey: nanoBananaPropTextureKey("deadline-espresso-cat-lounge"), widthScale: 0.78, heightScale: 1.55 },
  "talk-meeting-table": { textureKey: nanoBananaPropTextureKey("blender-hologram-stage-table"), widthScale: 0.82, heightScale: 1.65 },
  "game-claw": { textureKey: nanoBananaRoomTextureKey("retro-arcade-gacha-lounge"), widthScale: 1.65, heightScale: 1.25 },
  "gallery-frame-1": { textureKey: nanoBananaThemeTextureKey("seoul-editorial-hq"), widthScale: 1.12, heightScale: 1.08 },
  "gallery-frame-2": { textureKey: nanoBananaThemeTextureKey("cyber-neon-lab"), widthScale: 1.12, heightScale: 1.08 },
  "gallery-frame-3": { textureKey: nanoBananaThemeTextureKey("murim-bamboo-pavilion"), widthScale: 1.12, heightScale: 1.08 },
  "gallery-frame-4": { textureKey: nanoBananaThemeTextureKey("magic-academy-astral-library"), widthScale: 1.12, heightScale: 1.08 },
});

const EXTRA_PROP_URLS: Readonly<Record<NanoBanana2dExtraPropId, string>> = Object.freeze({
  "dual-cintiq-critique-pod": "/assets/virtual-studio/nano-banana-v13/props/dual-cintiq-critique-pod.webp",
  "blender-hologram-stage-table": "/assets/virtual-studio/nano-banana-v13/props/blender-hologram-stage-table.webp",
  "webtoon-sound-foley-booth": "/assets/virtual-studio/nano-banana-v13/props/webtoon-sound-foley-booth.webp",
  "deadline-espresso-cat-lounge": "/assets/virtual-studio/nano-banana-v13/props/deadline-espresso-cat-lounge.webp",
  "cintiq-drawing-desk": "/assets/virtual-studio/nano-banana-v10/props/cintiq-drawing-desk.webp",
  "hologram-pedestal": "/assets/virtual-studio/nano-banana-v10/props/hologram-pedestal.webp",
  "lofi-bookshelf-lounge": "/assets/virtual-studio/nano-banana-v10/props/lofi-bookshelf-lounge.webp",
  "on-air-critique-booth": "/assets/virtual-studio/nano-banana-v10/props/on-air-critique-booth.webp",
  "biophilic-planter-set": "/assets/virtual-studio/nano-banana-v10/props/biophilic-planter-set.webp",
});

const ROOM_MODULE_URLS: Readonly<Record<NanoBanana2dRoomModuleId, string>> = Object.freeze({
  "tarot-story-oracle-pavilion": "/assets/virtual-studio/nano-banana-v14/rooms/tarot-story-oracle-pavilion.webp",
  "retro-arcade-gacha-lounge": "/assets/virtual-studio/nano-banana-v14/rooms/retro-arcade-gacha-lounge.webp",
  "recruit-interview-conservatory": "/assets/virtual-studio/nano-banana-v14/rooms/recruit-interview-conservatory.webp",
  "global-ip-pitch-boardroom": "/assets/virtual-studio/nano-banana-v14/rooms/global-ip-pitch-boardroom.webp",
});

export function buildNanoBanana2dAssetManifest(): readonly { readonly key: string; readonly url: string }[] {
  const entries: { readonly key: string; readonly url: string }[] = [];
  for (const [dir, url] of Object.entries(NANO_BANANA_V14_WALK_SPRITES)) {
    entries.push({ key: nanoBananaWalkTextureKey(dir as NanoBanana2dWalkDirection), url });
  }
  for (const persona of NANO_BANANA_V11_CREATOR_PERSONAS) {
    entries.push({ key: nanoBananaPersonaTextureKey(persona.id, "idle"), url: persona.idleSpriteUrl });
    entries.push({ key: nanoBananaPersonaTextureKey(persona.id, "work"), url: persona.workSpriteUrl });
  }
  for (const emote of NANO_BANANA_V13_CREATOR_EMOTES) {
    entries.push({ key: nanoBananaEmoteTextureKey(emote.id), url: emote.spriteUrl });
  }
  for (const [propId, url] of Object.entries(EXTRA_PROP_URLS)) {
    entries.push({ key: nanoBananaPropTextureKey(propId as NanoBanana2dExtraPropId), url });
  }
  for (const [roomId, url] of Object.entries(ROOM_MODULE_URLS)) {
    entries.push({ key: nanoBananaRoomTextureKey(roomId as NanoBanana2dRoomModuleId), url });
  }
  for (const theme of NANO_BANANA_V11_STUDIO_THEMES) {
    entries.push({ key: nanoBananaThemeTextureKey(theme.id), url: theme.assetUrl });
  }
  return entries;
}

type CampusSceneLike = Pick<Phaser.Scene, "add" | "textures">;

interface WorkstationVisual {
  readonly spec: NanoBanana2dWorkstationPlacement;
  readonly shadow: Phaser.GameObjects.Graphics;
  readonly ring: Phaser.GameObjects.Graphics;
  readonly image: Phaser.GameObjects.Image;
  readonly titleText: Phaser.GameObjects.Text;
  readonly subText: Phaser.GameObjects.Text;
  proximityLevel: number;
}

export class StudioNanoBanana2dCampusRuntime {
  private readonly objects: Phaser.GameObjects.GameObject[] = [];
  private readonly workstations: WorkstationVisual[] = [];
  private readonly upgradedTargets = new Map<
    string,
    { readonly image: Phaser.GameObjects.Image; readonly baseWidth: number; readonly baseHeight: number }
  >();
  private readonly themeBannerTargets: {
    readonly image: Phaser.GameObjects.Image;
    readonly width: number;
    readonly height: number;
  }[] = [];
  private disposed = false;
  private lastThemeId: NanoBananaStudioThemeId | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(scene: CampusSceneLike) {
    if (typeof Image === "undefined" || typeof scene.textures?.addImage !== "function") return;
    this.buildWorkstations(scene);
    this.loadAllTextures(scene);
    this.unsubscribe = subscribeNanoBanana2dRuntimeState((next) => {
      if (this.disposed) return;
      this.syncVisibilityAndTheme(scene, next);
    });
  }

  /** 기존 캠퍼스 오브젝트 이미지를 등록해 나노 바나나 텍스처 로드 즉시 고해상도 2.5D 프롭으로 교체한다. */
  registerCampusObjectImage(objectId: string, image: Phaser.GameObjects.Image, width: number, height: number): void {
    if (this.disposed || typeof Image === "undefined") return;
    if (objectId === "plaza-billboard" || objectId === "event-screen") {
      this.themeBannerTargets.push({ image, width, height });
    }
    const upgrade = NANO_BANANA_CAMPUS_OBJECT_UPGRADES[objectId];
    if (!upgrade) return;
    this.upgradedTargets.set(objectId, { image, baseWidth: width, baseHeight: height });
    this.applyObjectUpgradeIfLoaded(image.scene?.textures, objectId);
  }

  private applyObjectUpgradeIfLoaded(
    textures: Phaser.Textures.TextureManager | undefined,
    objectId: string,
  ): void {
    if (!textures) return;
    const target = this.upgradedTargets.get(objectId);
    const upgrade = NANO_BANANA_CAMPUS_OBJECT_UPGRADES[objectId];
    if (!target || !upgrade || !textures.exists(upgrade.textureKey)) return;
    target.image
      .setTexture(upgrade.textureKey)
      .setDisplaySize(
        Math.round(target.baseWidth * (upgrade.widthScale ?? 1)),
        Math.round(target.baseHeight * (upgrade.heightScale ?? 1)),
      );
  }

  private buildWorkstations(scene: CampusSceneLike): void {
    for (const spec of NANO_BANANA_2D_WORKSTATIONS) {
      const depth = Math.round(spec.y) + 1_000;
      const shadow = scene.add.graphics().setDepth(-895).setPosition(spec.x, spec.y - 6);
      shadow.fillStyle(0x060913, 0.34).fillEllipse(0, 0, spec.width * 0.92, 34);
      const ring = scene.add
        .graphics()
        .setDepth(-894)
        .setPosition(spec.x, spec.y - 4)
        .setBlendMode("ADD")
        .setAlpha(0.38);
      ring.fillStyle(spec.accentColor, 0.22).fillEllipse(0, 0, spec.width * 1.05, 42);
      ring.lineStyle(2.2, spec.accentColor, 0.78).strokeEllipse(0, 0, spec.width * 0.96, 36);

      const initialKey = scene.textures.exists(spec.textureKey) ? spec.textureKey : "__DEFAULT";
      const image = scene.add
        .image(spec.x, spec.y, initialKey)
        .setOrigin(0.5, 1)
        .setDisplaySize(spec.width, spec.height)
        .setDepth(depth)
        .setVisible(scene.textures.exists(spec.textureKey));

      const titleText = scene.add
        .text(spec.x, spec.y - spec.height - 16, spec.titleKo, {
          fontFamily: "Pretendard, 'Noto Sans KR', Inter, sans-serif",
          fontSize: "11px",
          fontStyle: "bold",
          color: "#f8fafc",
          backgroundColor: "#090d1ae6",
          padding: { x: 8, y: 3 },
        })
        .setOrigin(0.5, 1)
        .setDepth(depth + 3);

      const subText = scene.add
        .text(spec.x, spec.y + 8, spec.subtitleKo, {
          fontFamily: "Pretendard, 'Noto Sans KR', Inter, sans-serif",
          fontSize: "9.5px",
          fontStyle: "600",
          color: "#bae6fd",
          backgroundColor: "#090d1acc",
          padding: { x: 6, y: 2 },
        })
        .setOrigin(0.5, 0)
        .setDepth(depth + 2)
        .setAlpha(0.85);

      this.objects.push(shadow, ring, image, titleText, subText);
      this.workstations.push({
        spec,
        shadow,
        ring,
        image,
        titleText,
        subText,
        proximityLevel: 0,
      });
    }
  }

  private loadAllTextures(scene: CampusSceneLike): void {
    for (const entry of buildNanoBanana2dAssetManifest()) {
      if (scene.textures.exists(entry.key)) {
        this.onTextureReady(scene, entry.key);
        continue;
      }
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        if (this.disposed) return;
        if (!scene.textures.exists(entry.key)) {
          scene.textures.addImage(entry.key, img);
        }
        this.onTextureReady(scene, entry.key);
      };
      img.src = entry.url;
    }
  }

  private onTextureReady(scene: CampusSceneLike, loadedKey: string): void {
    for (const item of this.workstations) {
      if (item.spec.textureKey === loadedKey && scene.textures.exists(loadedKey)) {
        item.image
          .setTexture(loadedKey)
          .setDisplaySize(item.spec.width, item.spec.height)
          .setVisible(currentState.enabled);
      }
    }
    for (const [objectId, upgrade] of Object.entries(NANO_BANANA_CAMPUS_OBJECT_UPGRADES)) {
      if (upgrade.textureKey === loadedKey) {
        this.applyObjectUpgradeIfLoaded(scene.textures, objectId);
      }
    }
    this.syncVisibilityAndTheme(scene, currentState);
  }

  private syncVisibilityAndTheme(scene: CampusSceneLike, state: NanoBanana2dRuntimeState): void {
    for (const item of this.workstations) {
      const ready = scene.textures.exists(item.spec.textureKey);
      item.image.setVisible(state.enabled && ready);
      item.shadow.setVisible(state.enabled);
      item.ring.setVisible(state.enabled);
      item.titleText.setVisible(state.enabled);
      item.subText.setVisible(state.enabled);
    }
    if (this.lastThemeId !== state.themeId) {
      const themeKey = nanoBananaThemeTextureKey(state.themeId);
      if (scene.textures.exists(themeKey)) {
        this.lastThemeId = state.themeId;
        for (const banner of this.themeBannerTargets) {
          banner.image.setTexture(themeKey).setDisplaySize(banner.width, banner.height);
        }
      }
    }
  }

  update(time: number, playerX: number, playerY: number, reducedMotion: boolean): void {
    if (this.disposed || !currentState.enabled) return;
    for (const item of this.workstations) {
      const dist = Math.hypot(playerX - item.spec.x, playerY - item.spec.y);
      const targetLevel = dist < 170 ? Math.max(0, Math.min(1, 1 - (dist - 54) / 116)) : 0;
      item.proximityLevel += (targetLevel - item.proximityLevel) * (reducedMotion ? 1 : 0.16);

      const pulse = reducedMotion ? 0 : Math.sin(time / 340 + item.spec.x * 0.01) * 0.035;
      const scaleBoost = 1 + item.proximityLevel * 0.075 + pulse * 0.4;
      const liftY = reducedMotion ? 0 : item.proximityLevel * -4 + Math.sin(time / 420 + item.spec.y * 0.01) * 1.5;

      item.image
        .setPosition(item.spec.x, item.spec.y + liftY)
        .setDisplaySize(item.spec.width * scaleBoost, item.spec.height * scaleBoost);
      item.ring
        .setAlpha(0.28 + item.proximityLevel * 0.58 + pulse * 2)
        .setScale(1 + item.proximityLevel * 0.14 + pulse);
      item.titleText
        .setPosition(item.spec.x, item.spec.y - item.spec.height * scaleBoost - 14 + liftY)
        .setScale(1 + item.proximityLevel * 0.08);
      item.subText.setAlpha(0.65 + item.proximityLevel * 0.35);
    }
  }

  destroy(): void {
    this.disposed = true;
    this.unsubscribe?.();
    this.unsubscribe = null;
    for (const obj of this.objects.splice(0)) obj.destroy();
    this.workstations.splice(0);
    this.upgradedTargets.clear();
    this.themeBannerTargets.splice(0);
  }
}
