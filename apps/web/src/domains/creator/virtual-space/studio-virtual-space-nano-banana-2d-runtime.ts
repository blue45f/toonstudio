/**
 * 나노 바나나(Nano Banana v10~v15) 2D Phaser 월드·캐릭터·워크스테이션·특수효과(VFX) 통합 런타임.
 *
 * - 2D Phaser 캔버스(StudioCampusRuntime + StudioSpriteVisualApplier)에서 평면 도형 가구와 구형 v8 스프라이트를
 *   나노 바나나 2.5D 웹툰 제작 워크스테이션·룸 모듈·v15 슬림 소두(5.5등신) 다중 프레임 캐릭터·4방향 보행 스프라이트로 실시간 업그레이드한다.
 * - 단일 정적 이미지 대신 시간에 따라 `v15 슬림 액션/표정 프레임 ↔ work ↔ idle` 다중 프레임을 순환하고,
 *   파트너 대사/표정 말풍선과 2D Phaser 특수효과(홀로그램 오라·스타라이트·코믹 의성어 팝업)를 렌더링한다.
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
import {
  emitNanoBanana2dVfxBurstEvent,
  getPartnerDynamicExpressionLine,
  NANO_BANANA_V15_ACTION_LABELS_KO,
  NANO_BANANA_V15_ACTION_SPRITES,
  nanoBananaV15ActionTextureKey,
  requestOpenNanoBananaWorkstationModal,
  resolveMultiFramePersonaTextureKey,
  StudioNanoBanana2dVfxEngine,
  subscribeNanoBanana2dVfxBurst,
  subscribeNanoBananaWorkstationModal,
  type NanoBananaV15ActionId,
} from "./studio-virtual-space-nano-banana-2d-vfx";

export {
  NANO_BANANA_V15_ACTION_LABELS_KO,
  NANO_BANANA_V15_ACTION_SPRITES,
  nanoBananaV15ActionTextureKey,
  requestOpenNanoBananaWorkstationModal,
  subscribeNanoBanana2dVfxBurst,
  subscribeNanoBananaWorkstationModal,
  type NanoBananaV15ActionId,
};

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
  readonly activeV15ActionId: NanoBananaV15ActionId | null;
  readonly activeV15ActionUntilMs: number;
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
  activeV15ActionId: null,
  activeV15ActionUntilMs: 0,
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

export function triggerNanoBanana2dVfxBurst(
  label: string,
  color = 0x38bdf8,
  actionId?: NanoBananaV15ActionId,
  worldX?: number,
  worldY?: number,
): NanoBanana2dRuntimeState {
  if (actionId) {
    updateNanoBanana2dRuntimeState({
      activeV15ActionId: actionId,
      activeV15ActionUntilMs: Date.now() + 4_200,
    });
  }
  emitNanoBanana2dVfxBurstEvent(label, color, actionId, worldX, worldY);
  return currentState;
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
  originY: 0.91,
  displayHeightRatio: 1.34,
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
 * 플레이어(self) 및 캠퍼스 NPC의 현재 방향·상태에 맞는 나노 바나나 다중 프레임 2D 스프라이트를 결정한다.
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
  const useMultiFrame = input.nowMs !== undefined;

  if (input.owner === "self") {
    if (state.activeV15ActionId && now < state.activeV15ActionUntilMs) {
      const v15Key = nanoBananaV15ActionTextureKey(state.activeV15ActionId);
      if (textures.exists(v15Key)) {
        return {
          textureKey: v15Key,
          flipX: input.facing === "left",
          presentation: NANO_BANANA_CHARACTER_PRESENTATION,
        };
      }
    }
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
      if (useMultiFrame) {
        const stridePhase = Math.floor(now / 220) % 2;
        const strideV15Key = nanoBananaV15ActionTextureKey("stride-draw");
        if (stridePhase === 1 && input.facing !== "up" && textures.exists(strideV15Key)) {
          return {
            textureKey: strideV15Key,
            flipX: input.facing === "left",
            presentation: NANO_BANANA_CHARACTER_PRESENTATION,
          };
        }
      }
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
    if (useMultiFrame) {
      const multiKey = resolveMultiFramePersonaTextureKey(textures, state.personaId, pose, now, 0);
      if (multiKey) {
        return {
          textureKey: multiKey,
          flipX: input.facing === "left",
          presentation: NANO_BANANA_CHARACTER_PRESENTATION,
        };
      }
    }
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
  if (useMultiFrame) {
    const npcSeed = input.skinKey.charCodeAt(input.skinKey.length - 1) || 1;
    const npcMultiKey = resolveMultiFramePersonaTextureKey(textures, mappedPersona, npcPose, now, npcSeed);
    if (npcMultiKey) {
      return {
        textureKey: npcMultiKey,
        flipX: input.facing === "left",
        presentation: NANO_BANANA_CHARACTER_PRESENTATION,
      };
    }
  }
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
  readonly partnerPersonaId: NanoBananaCreatorPersonaId;
  readonly partnerPose: CreatorPersonaPose;
  readonly partnerLabelKo: string;
  readonly partnerOffsetX: number;
  readonly partnerOffsetY: number;
}

/**
 * 2D 캠퍼스 전역(광장 스폰 주변 + 10개 룸)에 배치되는 나노 바나나 2.5D 웹툰 특화 워크스테이션 & 전담 파트너 캐스트.
 */
export const NANO_BANANA_2D_WORKSTATIONS: readonly NanoBanana2dWorkstationPlacement[] = Object.freeze([
  { id: "nb-plaza-cintiq-pod", zoneId: "creator-plaza", titleKo: "🎨 듀얼 신티크 원고 피드백 포드", subtitleKo: "Wacom 5K 실시간 레드라인 합평 · 클릭 시 협업창 오픈", textureKey: nanoBananaPropTextureKey("dual-cintiq-critique-pod"), x: 1272, y: 1068, width: 142, height: 128, spawnPoint: { x: 1272, y: 1126 }, accentColor: 0x38bdf8, partnerPersonaId: "line-artist", partnerPose: "work", partnerLabelKo: "✒️ 펜선 메인 작가", partnerOffsetX: -82, partnerOffsetY: 14 },
  { id: "nb-plaza-hologram-table", zoneId: "creator-plaza", titleKo: "🧊 3D 블렌더 배경 홀로그램 테이블", subtitleKo: "판타지 성채 360° 턴테이블 · 클릭 시 협업창 오픈", textureKey: nanoBananaPropTextureKey("blender-hologram-stage-table"), x: 1672, y: 1068, width: 144, height: 128, spawnPoint: { x: 1672, y: 1126 }, accentColor: 0xfbbf24, partnerPersonaId: "cgi-director", partnerPose: "work", partnerLabelKo: "🧊 3D 배경 감독", partnerOffsetX: 84, partnerOffsetY: 14 },
  { id: "nb-plaza-foley-booth", zoneId: "creator-plaza", titleKo: "🎧 웹툰 사운드 & 효과음 폴리 부스", subtitleKo: "Dolby Atmos 의성어(SFX) 믹싱 · 클릭 시 협업창 오픈", textureKey: nanoBananaPropTextureKey("webtoon-sound-foley-booth"), x: 1272, y: 1264, width: 140, height: 126, spawnPoint: { x: 1272, y: 1316 }, accentColor: 0xa855f7, partnerPersonaId: "sound-letterer", partnerPose: "work", partnerLabelKo: "🎧 효과음·식자", partnerOffsetX: -82, partnerOffsetY: 14 },
  { id: "nb-plaza-espresso-cat-lounge", zoneId: "creator-plaza", titleKo: "☕ 마감 에스프레소 & 캣 해먹 라운지", subtitleKo: "바리스타 스팀 라떼 & 치즈냥 힐링 · 클릭 시 협업창 오픈", textureKey: nanoBananaPropTextureKey("deadline-espresso-cat-lounge"), x: 1672, y: 1264, width: 142, height: 126, spawnPoint: { x: 1672, y: 1316 }, accentColor: 0x34d399, partnerPersonaId: "studio-cat-mascot", partnerPose: "idle", partnerLabelKo: "🐱 치즈냥 마스코트", partnerOffsetX: 82, partnerOffsetY: 14 },
  { id: "nb-studio-main-cintiq", zoneId: "personal-atelier", titleKo: "✒️ 메인 신티크 작화 아틀리에", subtitleKo: "선화·채색·식자 전담 프로덕션 데스크", textureKey: nanoBananaPropTextureKey("cintiq-drawing-desk"), x: 1000, y: 564, width: 148, height: 132, spawnPoint: { x: 1000, y: 618 }, accentColor: 0x38bdf8, partnerPersonaId: "colorist", partnerPose: "work", partnerLabelKo: "🎨 수석 채색 아티스트", partnerOffsetX: -88, partnerOffsetY: 14 },
  { id: "nb-cowork-tarot-pavilion", zoneId: "story-lab", titleKo: "🔮 웹툰 스토리 타로 & 세계관 파빌리온", subtitleKo: "플롯 분기점·회귀물 설정 오라클 테이블", textureKey: nanoBananaPropTextureKey("hologram-pedestal"), x: 1940, y: 548, width: 138, height: 126, spawnPoint: { x: 1984, y: 604 }, accentColor: 0xc084fc, partnerPersonaId: "story-writer", partnerPose: "work", partnerLabelKo: "📖 메인 스토리 작가", partnerOffsetX: 84, partnerOffsetY: 14 },
  { id: "nb-cafe-lofi-storyhouse", zoneId: "creator-cafe", titleKo: "📚 로파이 스토리보드 북카페 라운지", subtitleKo: "원고 콘티 열람 & 에스프레소 휴식존", textureKey: nanoBananaPropTextureKey("lofi-bookshelf-lounge"), x: 2536, y: 648, width: 148, height: 132, spawnPoint: { x: 2620, y: 648 }, accentColor: 0xf59e0b, partnerPersonaId: "chief-pd", partnerPose: "idle", partnerLabelKo: "🎬 총괄 웹툰 PD", partnerOffsetX: -86, partnerOffsetY: 14 },
  { id: "nb-lobby-recruit-conservatory", zoneId: "skyport", titleKo: "🌿 작가 포트폴리오 & 채용 인터뷰 온실", subtitleKo: "신규 어시스턴트·작가 영입 미팅 라운지", textureKey: nanoBananaPropTextureKey("biophilic-planter-set"), x: 312, y: 492, width: 128, height: 114, spawnPoint: { x: 448, y: 576 }, accentColor: 0x10b981, partnerPersonaId: "action-mocap-actor", partnerPose: "idle", partnerLabelKo: "⚡ 모션캡처 디렉터", partnerOffsetX: -72, partnerOffsetY: 12 },
  { id: "nb-talk-ip-boardroom", zoneId: "team-meeting", titleKo: "🎬 글로벌 웹툰 IP 드라마 피칭 보드룸", subtitleKo: "OTT 영상화·해외 연재 런칭 프레젠테이션", textureKey: nanoBananaPropTextureKey("on-air-critique-booth"), x: 566, y: 1124, width: 138, height: 124, spawnPoint: { x: 448, y: 1116 }, accentColor: 0x60a5fa, partnerPersonaId: "chief-pd", partnerPose: "work", partnerLabelKo: "📡 글로벌 IP PD", partnerOffsetX: 84, partnerOffsetY: 14 },
  { id: "nb-game-retro-arcade", zoneId: "arcade", titleKo: "🕹️ 레트로 픽셀 아케이드 & 캣 가챠 라운지", subtitleKo: "마감 후 팀원 미니게임 & 굿즈 캡슐 뽑기", textureKey: nanoBananaPropTextureKey("hologram-pedestal"), x: 560, y: 1684, width: 136, height: 120, spawnPoint: { x: 448, y: 1588 }, accentColor: 0xf472b6, partnerPersonaId: "studio-cat-mascot", partnerPose: "work", partnerLabelKo: "🕹️ 아케이드 마스코트", partnerOffsetX: -82, partnerOffsetY: 14 },
]);

/** 기존 캠퍼스 평면 오브젝트 ID → 나노 바나나 고해상도 2.5D 텍스처 교체 매핑. */
export const NANO_BANANA_CAMPUS_OBJECT_UPGRADES: Readonly<
  Record<string, { readonly textureKey: string; readonly widthScale?: number; readonly heightScale?: number }>
> = Object.freeze({
  "studio-monitor-desk": { textureKey: nanoBananaPropTextureKey("cintiq-drawing-desk"), widthScale: 1.25, heightScale: 1.55 },
  "studio-green-screen": { textureKey: nanoBananaPropTextureKey("on-air-critique-booth"), widthScale: 0.82, heightScale: 1.18 },
  "cowork-focus-desk-west": { textureKey: nanoBananaPropTextureKey("cintiq-drawing-desk"), widthScale: 1.22, heightScale: 1.52 },
  "cowork-focus-desk-east": { textureKey: nanoBananaPropTextureKey("blender-hologram-stage-table"), widthScale: 1.28, heightScale: 1.58 },
  "lobby-phone-booth-west": { textureKey: nanoBananaPropTextureKey("webtoon-sound-foley-booth"), widthScale: 1.35, heightScale: 1.12 },
  "lobby-phone-booth-east": { textureKey: nanoBananaPropTextureKey("on-air-critique-booth"), widthScale: 1.35, heightScale: 1.12 },
  "cafe-counter": { textureKey: nanoBananaPropTextureKey("deadline-espresso-cat-lounge"), widthScale: 0.78, heightScale: 1.45 },
  "talk-meeting-table": { textureKey: nanoBananaPropTextureKey("blender-hologram-stage-table"), widthScale: 0.82, heightScale: 1.52 },
  "game-claw": { textureKey: nanoBananaPropTextureKey("hologram-pedestal"), widthScale: 1.35, heightScale: 1.18 },
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
  for (const [actionId, url] of Object.entries(NANO_BANANA_V15_ACTION_SPRITES)) {
    entries.push({ key: nanoBananaV15ActionTextureKey(actionId as NanoBananaV15ActionId), url });
  }
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
  readonly partnerTextureKey: string;
  readonly partnerShadow: Phaser.GameObjects.Graphics;
  readonly partnerImage: Phaser.GameObjects.Image;
  readonly partnerBadge: Phaser.GameObjects.Text;
  readonly partnerX: number;
  readonly partnerY: number;
  currentPartnerKey: string;
  currentBadgeText: string;
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
  private readonly vfxEngine: StudioNanoBanana2dVfxEngine | null = null;
  private disposed = false;
  private lastThemeId: NanoBananaStudioThemeId | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly scene: CampusSceneLike) {
    if (typeof Image === "undefined" || typeof scene.textures?.addImage !== "function") return;
    this.buildWorkstations(scene);
    this.vfxEngine = new StudioNanoBanana2dVfxEngine(
      scene,
      NANO_BANANA_2D_WORKSTATIONS.map((w) => ({ x: w.x, y: w.y, accentColor: w.accentColor })),
    );
    this.loadAllTextures(scene);
    this.unsubscribe = subscribeNanoBanana2dRuntimeState((next) => {
      if (this.disposed) return;
      this.syncVisibilityAndTheme(scene, next);
    });
  }

  registerCampusObjectImage(objectId: string, image: Phaser.GameObjects.Image, width: number, height: number): void {
    if (this.disposed || typeof Image === "undefined") return;
    if (objectId === "event-screen") {
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

  private attachClickToOpenWorkstation(target: Phaser.GameObjects.Image, spec: NanoBanana2dWorkstationPlacement): void {
    if (typeof target.setInteractive !== "function") return;
    try {
      target.setInteractive({ useHandCursor: true });
      target.on("pointerdown", () => {
        requestOpenNanoBananaWorkstationModal(spec.id);
        triggerNanoBanana2dVfxBurst(`${spec.titleKo} 협업 오픈! ✨`, spec.accentColor, undefined, spec.x, spec.y - 44);
      });
    } catch {
      // Ignore interactive registration in headless unit tests
    }
  }

  private buildWorkstations(scene: CampusSceneLike): void {
    for (const spec of NANO_BANANA_2D_WORKSTATIONS) {
      const depth = Math.round(spec.y) + 860;
      const shadow = scene.add.graphics().setDepth(-895).setPosition(spec.x, spec.y - 6);
      shadow.fillStyle(0x060913, 0.34).fillEllipse(0, 0, spec.width * 0.92, 34);
      const ring = scene.add
        .graphics()
        .setDepth(-894)
        .setPosition(spec.x, spec.y - 4)
        .setBlendMode("ADD")
        .setAlpha(0.42);
      ring.fillStyle(spec.accentColor, 0.24).fillEllipse(0, 0, spec.width * 1.08, 44);
      ring.lineStyle(2.4, spec.accentColor, 0.85).strokeEllipse(0, 0, spec.width * 0.98, 38);

      const initialKey = scene.textures.exists(spec.textureKey) ? spec.textureKey : "__DEFAULT";
      const image = scene.add
        .image(spec.x, spec.y, initialKey)
        .setOrigin(0.5, 1)
        .setDisplaySize(spec.width, spec.height)
        .setDepth(depth)
        .setVisible(scene.textures.exists(spec.textureKey));
      this.attachClickToOpenWorkstation(image, spec);

      const titleText = scene.add
        .text(spec.x, spec.y - spec.height - 8, spec.titleKo, {
          fontFamily: "Pretendard, 'Noto Sans KR', Inter, sans-serif",
          fontSize: "10.5px",
          fontStyle: "bold",
          color: "#f8fafc",
          backgroundColor: "#090d1ae6",
          padding: { x: 7, y: 2 },
        })
        .setOrigin(0.5, 1)
        .setDepth(depth + 2);

      const subText = scene.add
        .text(spec.x, spec.y + 6, spec.subtitleKo, {
          fontFamily: "Pretendard, 'Noto Sans KR', Inter, sans-serif",
          fontSize: "9px",
          fontStyle: "600",
          color: "#bae6fd",
          backgroundColor: "#090d1acc",
          padding: { x: 6, y: 2 },
        })
        .setOrigin(0.5, 0)
        .setDepth(depth + 1)
        .setAlpha(0);

      const partnerX = spec.x + spec.partnerOffsetX;
      const partnerY = spec.y + spec.partnerOffsetY;
      const partnerDepth = Math.round(partnerY) + 862;
      const partnerTextureKey = nanoBananaPersonaTextureKey(spec.partnerPersonaId, spec.partnerPose);
      const partnerReady = scene.textures.exists(partnerTextureKey);
      const partnerShadow = scene.add.graphics().setDepth(-893).setPosition(partnerX, partnerY - 2);
      partnerShadow.fillStyle(0x060913, 0.36).fillEllipse(0, 0, 52, 16);
      const partnerImage = scene.add
        .image(partnerX, partnerY, partnerReady ? partnerTextureKey : "__DEFAULT")
        .setOrigin(0.5, 0.91)
        .setDisplaySize(108, 108)
        .setDepth(partnerDepth)
        .setVisible(partnerReady);
      this.attachClickToOpenWorkstation(partnerImage, spec);

      const partnerBadge = scene.add
        .text(partnerX, partnerY + 4, spec.partnerLabelKo, {
          fontFamily: "Pretendard, 'Noto Sans KR', Inter, sans-serif",
          fontSize: "9.5px",
          fontStyle: "bold",
          color: "#fde68a",
          backgroundColor: "#090d1ae6",
          padding: { x: 6, y: 2 },
        })
        .setOrigin(0.5, 0)
        .setDepth(partnerDepth + 2);

      this.objects.push(shadow, ring, image, titleText, subText, partnerShadow, partnerImage, partnerBadge);
      this.workstations.push({
        spec,
        shadow,
        ring,
        image,
        titleText,
        subText,
        partnerTextureKey,
        partnerShadow,
        partnerImage,
        partnerBadge,
        partnerX,
        partnerY,
        currentPartnerKey: partnerTextureKey,
        currentBadgeText: spec.partnerLabelKo,
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
      if (item.partnerTextureKey === loadedKey && scene.textures.exists(loadedKey)) {
        item.partnerImage
          .setTexture(loadedKey)
          .setDisplaySize(108, 108)
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
      const partnerReady = scene.textures.exists(item.currentPartnerKey) || scene.textures.exists(item.partnerTextureKey);
      item.image.setVisible(state.enabled && ready);
      item.shadow.setVisible(state.enabled);
      item.ring.setVisible(state.enabled);
      item.titleText.setVisible(state.enabled);
      item.subText.setVisible(state.enabled);
      item.partnerShadow.setVisible(state.enabled);
      item.partnerImage.setVisible(state.enabled && partnerReady);
      item.partnerBadge.setVisible(state.enabled);
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
    const nowMs = Date.now();
    this.vfxEngine?.update(time, playerX, playerY, reducedMotion);

    for (let idx = 0; idx < this.workstations.length; idx += 1) {
      const item = this.workstations[idx];
      const dist = Math.hypot(playerX - item.spec.x, playerY - item.spec.y);
      const targetLevel = dist < 180 ? Math.max(0, Math.min(1, 1 - (dist - 56) / 124)) : 0;
      item.proximityLevel += (targetLevel - item.proximityLevel) * (reducedMotion ? 1 : 0.16);

      const pulse = reducedMotion ? 0 : Math.sin(time / 320 + item.spec.x * 0.01) * 0.04;
      const scaleBoost = 1 + item.proximityLevel * 0.08 + pulse * 0.4;
      const liftY = reducedMotion ? 0 : item.proximityLevel * -4 + Math.sin(time / 400 + item.spec.y * 0.01) * 1.6;

      item.image
        .setPosition(item.spec.x, item.spec.y + liftY)
        .setDisplaySize(item.spec.width * scaleBoost, item.spec.height * scaleBoost);
      item.ring
        .setAlpha(0.32 + item.proximityLevel * 0.58 + pulse * 2)
        .setScale(1 + item.proximityLevel * 0.15 + pulse);
      item.titleText
        .setPosition(item.spec.x, item.spec.y - item.spec.height * scaleBoost - 8 + liftY)
        .setScale(1 + item.proximityLevel * 0.08);
      item.subText.setAlpha(item.proximityLevel > 0.12 ? item.proximityLevel * 0.95 : 0);

      // 다중 프레임 파트너 캐릭터 순환 (v15 슬림 소두 액션 ↔ work ↔ idle)
      const nextPartnerKey = resolveMultiFramePersonaTextureKey(
        this.scene.textures,
        item.spec.partnerPersonaId,
        item.spec.partnerPose,
        nowMs,
        idx + 1,
      );
      if (nextPartnerKey && nextPartnerKey !== item.currentPartnerKey && this.scene.textures.exists(nextPartnerKey)) {
        item.currentPartnerKey = nextPartnerKey;
        item.partnerImage.setTexture(nextPartnerKey).setVisible(true);
      }

      // 실시간 표정 & 작업 대사 말풍선 순환
      const nextBadgeText = getPartnerDynamicExpressionLine(item.spec.partnerPersonaId, nowMs, idx + 1);
      if (nextBadgeText !== item.currentBadgeText) {
        item.currentBadgeText = nextBadgeText;
        item.partnerBadge.setText(nextBadgeText);
      }

      const partnerBreath = reducedMotion ? 0 : Math.sin(time / 280 + item.partnerX * 0.02) * 2.5;
      const partnerScale = 1 + item.proximityLevel * 0.09;
      item.partnerImage
        .setPosition(item.partnerX, item.partnerY + partnerBreath)
        .setDisplaySize(108 * partnerScale, (108 - partnerBreath * 0.35) * partnerScale);
    }
  }

  destroy(): void {
    this.disposed = true;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.vfxEngine?.destroy();
    for (const obj of this.objects.splice(0)) obj.destroy();
    this.workstations.splice(0);
    this.upgradedTargets.clear();
    this.themeBannerTargets.splice(0);
  }
}
