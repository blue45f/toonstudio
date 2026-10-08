import type { StudioFaceSetName } from "./studio-virtual-space-character-motion";
import {
  studioCharacterWalkClip,
  studioCharacterActionClip,
  type StudioCharacterMotionState,
  type StudioCharacterSkin,
  type StudioCharacterFramePresentation,
  type StudioCharacterAtlasClip,
  type StudioCharacterPoseSheet,
} from "./studio-virtual-space-character-skins";
import { studioCharacterAtlasFrameCount, studioCharacterAtlasSheetMatches } from "./studio-virtual-space-character-atlas";
import type { StudioVirtualSpaceFacing } from "./studio-virtual-space-model";
import { STUDIO_CHARACTER_FOOT_ORIGIN } from "./studio-virtual-space-presentation";

export interface StudioCharacterTextureAsset {
  readonly key: string;
  readonly url: string;
  readonly type: "image" | "spritesheet";
  readonly frameWidth?: number;
  readonly frameHeight?: number;
  readonly animationKey?: string;
  /** 공통 atlas를 해제할 때 함께 정리할 방향별 animation 목록. */
  readonly animationKeys?: readonly string[];
  /** 정지 자세도 원본 atlas의 한 셀과 동일한 기하 정보를 사용한다. */
  readonly frame?: number;
  readonly presentation?: StudioCharacterFramePresentation;
  readonly atlas?: StudioCharacterAtlasClip["atlas"];
  /**
   * 픽셀 아트 스킨(LPC)은 텍스처를 최근접(NEAREST) 필터로 샘플링해야 픽셀 경계가 번지지 않는다.
   * 렌더러는 이 값이 "nearest"면 텍스처 필터를 바꾼다(없으면 장면 기본 필터).
   */
  readonly textureFilter?: "nearest";
  /**
   * "feet"면 로드 직후 알파 외곽(발바닥·몸통 중심·키)을 재 frame registration에 쓴다. 정지 방향 그림은 기준으로,
   * register 클립의 시트는 정렬 대상으로 측정한다.
   */
  readonly registration?: "feet";
}

/** 등록 대상 표시. 아니면 필드를 만들지 않는다(기존 자산 설명자는 그대로다). */
const registrationMark = (enabled: boolean | undefined): Pick<StudioCharacterTextureAsset, "registration"> =>
  enabled ? { registration: "feet" } : {};

/** 픽셀 아트 스킨의 모든 텍스처 자산에 최근접 필터 힌트를 붙인다. */
const pixelTextureFilter = (skin: StudioCharacterSkin): Pick<StudioCharacterTextureAsset, "textureFilter"> =>
  skin.pixelArt ? { textureFilter: "nearest" } : {};

function idleAtlas(skin: StudioCharacterSkin, facing: StudioVirtualSpaceFacing) {
  const clip = studioCharacterWalkClip(skin, facing);
  const frame = skin.idleFrames?.[facing];
  if (!clip || frame === undefined || !Number.isSafeInteger(frame) || frame < 0) return undefined;
  if (frame >= clip.start && frame <= clip.end) return { clip, frame, presentation: clip.frames?.[frame - clip.start] };
  // 걷기 순환 밖의 서기 셀은 같은 격자 안이고 표시 좌표가 명시된 경우만 쓴다(LPC 걷기 시트 0열).
  return skin.idlePresentation && clip.atlas?.slicing && frame < studioCharacterAtlasFrameCount(clip.atlas)
    ? { clip, frame, presentation: skin.idlePresentation } : undefined;
}

export function studioCharacterStaticTextureKey(
  skin: StudioCharacterSkin,
  facing: StudioVirtualSpaceFacing,
  state: StudioCharacterMotionState = "idle",
): string {
  if ((state === "talk" || state === "draw" || state === "review") && skin.state?.[state]) {
    return `studio-player-${skin.key}-state-${state}`;
  }
  return idleAtlas(skin, facing) ? studioCharacterWalkTextureKey(skin, facing) : `studio-player-${skin.key}-direction-${facing}`;
}

/** 동작별 공유 시트는 방향 접미사 없이 한 텍스처 키를 쓴다(같은 원본을 방향마다 따로 올리지 않는다). */
const motionSheetSuffix = (skin: StudioCharacterSkin, facing: StudioVirtualSpaceFacing) =>
  skin.sharedMotionSheets ? "" : `-${facing}`;

export const studioCharacterWalkTextureKey = (skin: StudioCharacterSkin, facing: StudioVirtualSpaceFacing) =>
  skin.sharedAtlas ? `studio-player-${skin.key}-atlas` : `studio-player-${skin.key}-walk-sheet${motionSheetSuffix(skin, facing)}`;
export const studioCharacterWalkAnimationKey = (skin: StudioCharacterSkin, facing: StudioVirtualSpaceFacing) =>
  `studio-player-${skin.key}-walk-animation-${facing}`;
export const studioCharacterPoseTextureKey = (skin: StudioCharacterSkin, state: "sit" | "wave" | "lie") =>
  skin.sharedAtlas ? `studio-player-${skin.key}-atlas` : `studio-player-${skin.key}-pose-sheet-${state}`;
export const studioCharacterFaceTextureKey = (skin: StudioCharacterSkin, name: StudioFaceSetName) =>
  skin.sharedAtlas ? `studio-player-${skin.key}-atlas` : `studio-player-${skin.key}-${name}-sheet`;
export const studioCharacterActionTextureKey = (skin: StudioCharacterSkin, facing: StudioVirtualSpaceFacing, state: StudioCharacterMotionState) =>
  skin.sharedAtlas ? `studio-player-${skin.key}-atlas` : `studio-player-${skin.key}-${state}-sheet${motionSheetSuffix(skin, facing)}`;

/** 네 방향 걷기 애니메이션이 한 텍스처를 쓰면 텍스처를 내릴 때 함께 정리한다. */
function sharedAtlasAnimations(skin: StudioCharacterSkin) {
  return skin.sharedAtlas || skin.sharedMotionSheets ? { animationKeys: (["down", "right", "left", "up"] as const)
    .map((facing) => studioCharacterWalkAnimationKey(skin, facing)) } : {};
}

/** Local scene time drives actions; floor distance only drives walking. */
export function studioCharacterActionFrame(clip: StudioCharacterAtlasClip, elapsedMs: number, reducedMotion: boolean): number {
  if (reducedMotion || !Number.isFinite(elapsedMs) || elapsedMs <= 0) return clip.start;
  return clip.start + Math.floor(elapsedMs * clip.frameRate / 1_000) % (clip.end - clip.start + 1);
}

/** Never infer a different cell grid from an unexpected CDN/source image. */
export function studioCharacterActionSheetMatches(clip: StudioCharacterAtlasClip, width: number, height: number): boolean {
  return studioCharacterAtlasSheetMatches(clip, width, height)
    && Number.isSafeInteger(clip.start) && Number.isSafeInteger(clip.end)
    && clip.start >= 0 && clip.end >= clip.start && clip.end < studioCharacterAtlasFrameCount(clip.atlas);
}

export function studioCharacterPoseSheetMatches(pose: StudioCharacterPoseSheet, width: number, height: number): boolean {
  return studioCharacterAtlasSheetMatches(pose, width, height)
    && Object.values(pose.directionFrames).every((frame) => Number.isSafeInteger(frame)
      && frame >= 0 && frame < studioCharacterAtlasFrameCount(pose.atlas) && pose.frames[frame] !== undefined);
}

/** 로더는 선언된 원본 크기와 격자를 검증한 뒤 프레임을 등록한다. */
export function studioCharacterTextureSheetMatches(asset: StudioCharacterTextureAsset, width: number, height: number): boolean {
  return asset.type === "spritesheet" && asset.frameWidth !== undefined && asset.frameHeight !== undefined
    && studioCharacterAtlasSheetMatches({ frameWidth: asset.frameWidth, frameHeight: asset.frameHeight, atlas: asset.atlas }, width, height);
}

export function studioCharacterFrameGeometry(
  frame: StudioCharacterFramePresentation | undefined,
  frameWidth: number,
  frameHeight: number,
  visualWidth: number,
  visualHeight: number,
  seatAttached = false,
) {
  if (!frame) return { width: visualWidth, height: visualHeight, originX: 0.5, originY: STUDIO_CHARACTER_FOOT_ORIGIN };
  const height = visualHeight * frame.displayHeightRatio;
  return { width: height * frameWidth / frameHeight, height, originX: frame.originX,
    originY: seatAttached && frame.seatOriginY !== undefined ? frame.seatOriginY : frame.originY };
}

/** 원본 atlas 크기가 달라지면 전체 시트나 잘못된 셀을 정지 자세로 표시하지 않는다. */
export function studioCharacterStaticSheetMatches(asset: StudioCharacterTextureAsset, width: number, height: number): boolean {
  return asset.frame === undefined || (asset.atlas !== undefined && studioCharacterTextureSheetMatches(asset, width, height)
    && Number.isSafeInteger(asset.frame) && asset.frame >= 0 && asset.frame < studioCharacterAtlasFrameCount(asset.atlas));
}

export function studioCharacterStaticAsset(
  skin: StudioCharacterSkin,
  facing: StudioVirtualSpaceFacing,
  state: StudioCharacterMotionState = "idle",
): StudioCharacterTextureAsset {
  const stateUrl = state === "talk" || state === "draw" || state === "review" ? skin.state?.[state] : undefined;
  const idle = stateUrl ? undefined : idleAtlas(skin, facing);
  if (idle) return {
    key: studioCharacterWalkTextureKey(skin, facing), url: idle.clip.textureUrl, type: "spritesheet",
    frameWidth: idle.clip.frameWidth, frameHeight: idle.clip.frameHeight,
    animationKey: studioCharacterWalkAnimationKey(skin, facing), frame: idle.frame,
    presentation: idle.presentation,
    atlas: idle.clip.atlas,
    ...sharedAtlasAnimations(skin),
    ...pixelTextureFilter(skin),
  };
  return {
    key: studioCharacterStaticTextureKey(skin, facing, state), url: stateUrl ?? skin.directional[facing], type: "image",
    ...pixelTextureFilter(skin),
    // 상태 그림(대화·그리기·검토)은 기준이 아니다. 방향별 정지 그림만 측정한다.
    ...registrationMark(skin.registerFrames && !stateUrl),
  };
}

/** Only the displayed direction/state is needed. Never make unrelated skins block entry. */
export function studioCharacterVisualAssets(
  skin: StudioCharacterSkin,
  facing: StudioVirtualSpaceFacing,
  state: StudioCharacterMotionState,
): readonly StudioCharacterTextureAsset[] {
  const idle = studioCharacterStaticAsset(skin, facing);
  const current = studioCharacterStaticAsset(skin, facing, state);
  const assets = current.key === idle.key ? [idle] : [idle, current];
  const clip = state === "walk" ? studioCharacterWalkClip(skin, facing) : undefined;
  if (clip && !assets.some((asset) => asset.key === studioCharacterWalkTextureKey(skin, facing))) assets.push({ key: studioCharacterWalkTextureKey(skin, facing), url: clip.textureUrl,
    type: "spritesheet", frameWidth: clip.frameWidth, frameHeight: clip.frameHeight,
    animationKey: studioCharacterWalkAnimationKey(skin, facing), atlas: clip.atlas, ...sharedAtlasAnimations(skin), ...pixelTextureFilter(skin),
    ...registrationMark(clip.register) });
  const action = studioCharacterActionClip(skin, facing, state);
  if (action && !assets.some((asset) => asset.key === studioCharacterActionTextureKey(skin, facing, state))) assets.push({ key: studioCharacterActionTextureKey(skin, facing, state), url: action.textureUrl,
    type: "spritesheet", frameWidth: action.frameWidth, frameHeight: action.frameHeight, atlas: action.atlas, ...pixelTextureFilter(skin),
    ...registrationMark(action.register) });
  const pose = state === "sit" || state === "wave" || state === "lie" ? skin.poses?.[state] : undefined;
  if (pose && (state === "sit" || state === "wave" || state === "lie") && !assets.some((asset) => asset.key === studioCharacterPoseTextureKey(skin, state))) assets.push({ key: studioCharacterPoseTextureKey(skin, state), url: pose.textureUrl,
    type: "spritesheet", frameWidth: pose.frameWidth, frameHeight: pose.frameHeight, atlas: pose.atlas, ...pixelTextureFilter(skin) });
  // 표정 세트는 상태와 무관하게 상주시킨다: 감정은 이모트·상태 변화로 언제든
  // 바뀔 수 있어, 바뀌는 순간 텍스처가 이미 준비돼 있어야 교체가 끊기지 않는다.
  for (const [faceName, faceSheet] of Object.entries(skin.faces ?? {})) {
    if (!faceSheet) continue;
    const key = studioCharacterFaceTextureKey(skin, faceName as StudioFaceSetName);
    if (!assets.some((asset) => asset.key === key)) assets.push({ key, url: faceSheet.textureUrl,
      type: "spritesheet", frameWidth: faceSheet.frameWidth, frameHeight: faceSheet.frameHeight, atlas: faceSheet.atlas, ...pixelTextureFilter(skin) });
  }
  return assets;
}

const WARM_FACINGS: readonly StudioVirtualSpaceFacing[] = ["down", "left", "right", "up"];

/**
 * 내 캐릭터가 처음 움직이거나 처음 방향을 바꿀 때 에셋이 늦게 도착해 정지 그림이 미끄러지고
 * 방향이 한 박자 늦는 일이 없도록 미리 받아 두는 에셋: 네 방향의 정지 그림과 걷기 시트.
 * (예전에는 움직이는 순간에야 걷기 시트를 요청해 이동 시작 약 0.6초 동안 걷기 프레임 없이 미끄러졌다.)
 * 대화·그리기·앉기 같은 상태 에셋은 그 상태가 될 때 기존처럼 필요한 만큼만 받는다.
 */
export function studioCharacterWarmAssets(skin: StudioCharacterSkin): readonly StudioCharacterTextureAsset[] {
  const assets = new Map<string, StudioCharacterTextureAsset>();
  for (const facing of WARM_FACINGS) {
    for (const state of ["idle", "walk"] as const) {
      for (const asset of studioCharacterVisualAssets(skin, facing, state)) assets.set(asset.key, asset);
    }
  }
  return [...assets.values()];
}

/** 선적재(warm) 에셋을 보유하는 소유자 이름의 접미사. `release(owner)`는 같은 소유자의 선적재분도 함께 반납한다. */
const WARM_OWNER_SUFFIX = ":warm";
export const studioCharacterWarmOwner = (owner: string): string => `${owner}${WARM_OWNER_SUFFIX}`;

/** 선적재 대상 구분: 내 캐릭터는 항상, 다른 참가자는 예산 안에서만, 그 밖의 소유자(NPC·배경 배우)는 하지 않는다. */
export type StudioCharacterWarmKind = "self" | "peer";
export function studioCharacterWarmKind(owner: string): StudioCharacterWarmKind | null {
  if (owner === "self") return "self";
  return owner.startsWith("peer:") ? "peer" : null;
}

/** 크기를 모르는 정지 그림 한 장의 GPU 텍스처 추정치(실측: 스타일 팩 160px 0.1MB, 드로잉 원본 384×512 0.75MB). */
const IMAGE_ESTIMATE_BYTES = 512 * 1024;
/** 다른 참가자 한 명의 스킨을 선적재해도 되는 GPU 텍스처 추정 상한. 기본 스타일 팩(160px 정지 그림 3장 + 640×160 걷기 시트 4장 추가)은 약 3.1MB로 추정된다. */
export const STUDIO_PEER_WARM_MAX_BYTES = 8 * 1024 * 1024;

/**
 * 선적재로 새로 올라올 텍스처의 GPU 크기 추정(바이트). 시트는 선언한 원본 크기(atlas)를 쓰고, 선언이 없으면 로더 검증과 같이 2×2 격자로 본다.
 * 어느 방향·상태에서든 이미 올라와 있는 기준 에셋(아래를 보는 정지 그림, 표정 시트)은 선적재 때문에 늘어나지 않으므로 뺀다.
 * 드로잉 원본(1122×1402 시트 약 6MB)이나 네이티브 시트(1254×1254)로 방향 네 장을 받으면 수십 MB라 이 값으로 걸러 낸다.
 */
export function studioCharacterWarmBytes(skin: StudioCharacterSkin): number {
  const baseline = new Set(studioCharacterVisualAssets(skin, "down", "idle").map((asset) => asset.key));
  let bytes = 0;
  for (const asset of studioCharacterWarmAssets(skin)) {
    if (baseline.has(asset.key)) continue;
    if (asset.type === "image") bytes += IMAGE_ESTIMATE_BYTES;
    else if (asset.atlas) bytes += asset.atlas.width * asset.atlas.height * 4;
    else bytes += (asset.frameWidth ?? 0) * 2 * (asset.frameHeight ?? 0) * 2 * 4;
  }
  return bytes;
}

interface TextureRecord {
  readonly asset: StudioCharacterTextureAsset;
  readonly owners: Set<string>;
  state: "loading" | "ready" | "failed";
  unusedAt: number | null;
  dispose?: () => void;
}

export interface StudioCharacterTextureBackend {
  readonly has: (asset: StudioCharacterTextureAsset) => boolean;
  /** Complete exactly once; dispose removes loader listeners without mutating any actor. */
  readonly load: (asset: StudioCharacterTextureAsset, complete: (success: boolean) => void) => () => void;
  readonly remove: (asset: StudioCharacterTextureAsset) => void;
}

/** Scene-local residency; completion never retains a sprite or writes to a departed actor. */
export class StudioCharacterAssetResidency {
  private readonly owners = new Map<string, Set<string>>();
  private readonly records = new Map<string, TextureRecord>();
  private closed = false;

  constructor(
    private readonly backend: StudioCharacterTextureBackend,
    private readonly now: () => number = () => performance.now(),
    private readonly idleRetentionMs = 30_000,
  ) {}

  use(owner: string, assets: readonly StudioCharacterTextureAsset[], displayedKey?: string): void {
    if (this.closed) return;
    const desired = new Map(assets.map((asset) => [asset.key, asset]));
    // Retain the previous visible frame until the new skin/direction has loaded and is applied.
    const displayed = displayedKey ? this.records.get(displayedKey)?.asset : undefined;
    if (displayed) desired.set(displayed.key, displayed);
    const previous = this.owners.get(owner) ?? new Set<string>();
    const keys = new Set(desired.keys());
    for (const key of previous) {
      if (!keys.has(key)) this.unref(owner, key);
    }
    this.owners.set(owner, keys);
    for (const asset of desired.values()) {
      let record = this.records.get(asset.key);
      if (record) {
        record.owners.add(owner);
        record.unusedAt = null;
        continue;
      }
      record = { asset, owners: new Set([owner]), state: this.backend.has(asset) ? "ready" : "loading", unusedAt: null };
      this.records.set(asset.key, record);
      if (record.state !== "loading") continue;
      const current = record;
      const dispose = this.backend.load(asset, (success) => {
        // The closure belongs to one scene generation and one request record only.
        if (this.closed || this.records.get(asset.key) !== current || current.state !== "loading") return;
        current.state = success ? "ready" : "failed";
        current.dispose?.();
        current.dispose = undefined;
        if (current.owners.size === 0) {
          if (success) this.backend.remove(asset);
          this.records.delete(asset.key);
        }
      });
      if (current.state === "loading") current.dispose = dispose;
      else dispose();
    }
  }

  /** 소유자가 쓰던 에셋과 그 소유자의 선적재분(`<owner>:warm`)을 함께 반납한다. */
  release(owner: string): void {
    for (const target of [owner, studioCharacterWarmOwner(owner)]) {
      for (const key of this.owners.get(target) ?? []) this.unref(target, key);
      this.owners.delete(target);
    }
  }

  private unref(owner: string, key: string): void {
    const record = this.records.get(key);
    if (!record) return;
    record.owners.delete(owner);
    if (record.owners.size === 0) record.unusedAt = this.now();
  }

  /** A short cache prevents repeated direction changes from downloading the same atlas. */
  collect(): void {
    if (this.closed) return;
    for (const [key, record] of this.records) {
      if (record.owners.size > 0 || record.unusedAt === null || record.state === "loading"
        || this.now() - record.unusedAt < this.idleRetentionMs) continue;
      if (record.state === "ready") this.backend.remove(record.asset);
      this.records.delete(key);
    }
  }

  close(): void {
    this.closed = true;
    for (const record of this.records.values()) record.dispose?.();
    this.records.clear();
    this.owners.clear();
    // Phaser's Game owns final GPU destruction; don't touch a replacement scene's textures.
  }
}
