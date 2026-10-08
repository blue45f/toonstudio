import {
  StudioCharacterAssetResidency,
  studioCharacterActionFrame,
  studioCharacterActionSheetMatches,
  studioCharacterActionTextureKey,
  studioCharacterFaceTextureKey,
  studioCharacterFrameGeometry,
  studioCharacterPoseSheetMatches,
  studioCharacterPoseTextureKey,
  studioCharacterStaticAsset,
  studioCharacterStaticSheetMatches,
  studioCharacterVisualAssets,
  studioCharacterWalkAnimationKey as walkAnimationKey,
  studioCharacterWalkTextureKey as walkSheetKey,
} from "./studio-virtual-space-character-assets";
import type { StudioSpaceEmoteId } from "./studio-virtual-space-emote-catalog";
import {
  resolveStudioFaceSheet,
  studioActorFaceEmotion,
  studioFaceLayerApplies,
  type StudioFaceNpcPhase,
} from "./studio-virtual-space-face-layer";
import type { StudioUserStatus } from "./studio-virtual-space-user-status";
import {
  resolveStudioCharacterAppearance,
  studioCharacterActionClip,
  studioCharacterSkinForArtStyle,
  studioCharacterWalkClip,
  type StudioCharacterMotionState,
  type StudioCharacterSkin,
} from "./studio-virtual-space-character-skins";
import { studioCharacterExpressionFrame } from "./studio-virtual-space-expressions";
import { studioPoseSettleScaleY } from "./studio-virtual-space-sprite-smoothing";
import { STUDIO_ACTOR_EXPRESSION_PRESENTATION } from "./studio-virtual-space-scene-art-runtime";
import { studioEffectiveGaitStride } from "./studio-virtual-space-locomotion-presentation";
import { studioGaitFrame } from "./studio-virtual-space-presentation";
import type { StudioVirtualArtStyleKey } from "./studio-virtual-space-art-style";
import type {
  StudioVirtualSpaceFacing,
  StudioVirtualSpacePeer,
} from "./studio-virtual-space-model";
import type { StudioVirtualSpaceSnapshot } from "./studio-virtual-space-presence";

/**
 * 스프라이트 비주얼 적용 클러스터의 명시적 의존.
 * sceneReady·cancelled·커스텀 시트 스킨은 이펙트 수명 동안 바뀌는 값이라 게터로 읽는다.
 */
export interface StudioSpriteVisualApplierDeps {
  readonly scene: import("phaser").Scene;
  readonly isCancelled: () => boolean;
  readonly isSceneReady: () => boolean;
  readonly characterAssets: StudioCharacterAssetResidency;
  readonly reducedMotion: MediaQueryList;
  readonly artStyle: StudioVirtualArtStyleKey;
  readonly actorExpressionTextureKey: string;
  readonly fallbackAsset: ReturnType<typeof studioCharacterStaticAsset>;
  readonly identityRef: { readonly current: string | undefined };
  readonly getSelfCustomSheetSkin: () => StudioCharacterSkin | null;
}

export function createStudioSpriteVisualApplier(deps: StudioSpriteVisualApplierDeps) {
  const {
    scene,
    characterAssets,
    reducedMotion,
    artStyle,
    actorExpressionTextureKey,
    fallbackAsset,
  } = deps;

  const ensureWalkAnimation = (skin: StudioCharacterSkin, direction: StudioVirtualSpaceFacing) => {
    const clip = studioCharacterWalkClip(skin, direction);
    const key = walkSheetKey(skin, direction);
    if (!clip || deps.isCancelled() || !scene.textures.exists(key) || scene.anims.exists(walkAnimationKey(skin, direction))) return;
    const texture = scene.textures.get(key);
    const source = texture.source[0];
    if (clip.atlas && (!source || !studioCharacterActionSheetMatches(clip, source.width, source.height))) return;
    if (!Number.isSafeInteger(clip.start) || !Number.isSafeInteger(clip.end)
      || clip.end < clip.start || clip.start < 0 || clip.end >= texture.frameTotal - 1) return;
    scene.anims.create({ key: walkAnimationKey(skin, direction), frames: scene.anims.generateFrameNumbers(key, { start: clip.start, end: clip.end }), frameRate: clip.frameRate, repeat: clip.repeat ?? -1 });
  };

  const updateDisplaySize = (sprite: import("phaser").GameObjects.Sprite) => {
    const presentation = sprite.getData("framePresentation") as Parameters<typeof studioCharacterFrameGeometry>[0];
    const geometry = studioCharacterFrameGeometry(presentation, sprite.frame.width, sprite.frame.height,
      Number(sprite.getData("visualWidth") ?? 92), Number(sprite.getData("visualHeight") ?? 123), Boolean(sprite.getData("seatAttached")));
    sprite.setDisplaySize(geometry.width, geometry.height).setOrigin(geometry.originX, geometry.originY);
  };
  const hasStaticAsset = (asset: ReturnType<typeof studioCharacterStaticAsset>) => {
    if (!scene.textures.exists(asset.key)) return false;
    const source = scene.textures.get(asset.key).source[0];
    return Boolean(source && studioCharacterStaticSheetMatches(asset, source.width, source.height));
  };
  const applySpriteVisualBody = (
    sprite: import("phaser").GameObjects.Sprite,
    skin: StudioCharacterSkin,
    nextFacing: StudioVirtualSpaceFacing,
    nextState: StudioCharacterMotionState,
  ) => {
    const owner = sprite.getData("assetOwner") as string;
    if (deps.isSceneReady() && owner) characterAssets.use(owner, studioCharacterVisualAssets(skin, nextFacing, nextState), sprite.texture.key);
    if (sprite.getData("visualMotionState") !== nextState) {
      sprite.setData("visualPreviousMotionState", (sprite.getData("visualMotionState") as StudioCharacterMotionState | undefined) ?? null)
        .setData("visualMotionState", nextState).setData("visualStateStartedAt", scene.time.now);
    }
    sprite.setData("faceTextureUsed", false);
    const action = studioCharacterActionClip(skin, nextFacing, nextState);
    const actionKey = action ? studioCharacterActionTextureKey(skin, nextFacing, nextState) : null;
    const actionSource = actionKey && scene.textures.exists(actionKey) ? scene.textures.get(actionKey).source[0] : undefined;
    if (action && actionKey && scene.textures.exists(actionKey)
      && actionSource && studioCharacterActionSheetMatches(action, actionSource.width, actionSource.height)
      && action.end < scene.textures.get(actionKey).frameTotal - 1) {
      if (sprite.anims.isPlaying) sprite.stop();
      if (sprite.getData("actionKey") !== actionKey) {
        sprite.setData("actionKey", actionKey).setData("actionStartedAt", scene.time.now);
      }
      const frame = studioCharacterActionFrame(action, scene.time.now - Number(sprite.getData("actionStartedAt")), reducedMotion.matches);
      sprite.setTexture(actionKey, frame).setData("framePresentation", action.frames?.[frame - action.start]);
      updateDisplaySize(sprite);
      return;
    }
    sprite.setData("actionKey", null);
    sprite.setData("poseTextureUsed", false);
    // 손 인사는 전신 wave 포즈 시트를 표정 프레임보다 우선한다(몸 전체가 인사하는 편이 멀리서도 읽힌다).
    // 눕기(lie)도 포즈 텍스처가 등록되면(트랙1) 자동 사용, 없으면 idle 프레임+회전 폴백.
    const pose = nextState === "wave" || nextState === "sit" || nextState === "lie" ? skin.poses?.[nextState] : undefined;
    if (pose && (nextState === "wave" || nextState === "sit" || nextState === "lie")) {
      const poseKey = studioCharacterPoseTextureKey(skin, nextState);
      const poseSource = scene.textures.exists(poseKey) ? scene.textures.get(poseKey).getSourceImage() : undefined;
      if (poseSource && studioCharacterPoseSheetMatches(pose, poseSource.width, poseSource.height)) {
        if (sprite.anims.isPlaying) sprite.stop();
        const frame = pose.directionFrames[nextFacing];
        sprite.setTexture(poseKey, frame).setData("framePresentation", pose.frames[frame]);
        sprite.setData("poseTextureUsed", true);
        updateDisplaySize(sprite);
        return;
      }
    }
    // 라이브 표정 레이어: 스킨이 `face-<감정>` 세트를 선언했을 때만 동작하고,
    // 세트가 없거나 텍스처가 준비되지 않았으면 아래 기존 표정 경로로 폴백한다.
    // 우선순위는 동작 클립 > 포즈 시트 > 표정 세트 > 기존 표정 시트 순이다.
    const faceEmotion = studioActorFaceEmotion({
      emote: sprite.getData("actorReaction") as StudioSpaceEmoteId | null | undefined,
      userStatus: sprite.getData("actorUserStatus") as StudioUserStatus | null | undefined,
      npcPhase: sprite.getData("actorNpcPhase") as StudioFaceNpcPhase | null | undefined,
    });
    const face = faceEmotion && studioFaceLayerApplies(nextState) ? resolveStudioFaceSheet(skin, faceEmotion) : null;
    if (face) {
      const faceKey = studioCharacterFaceTextureKey(skin, face.name);
      const faceSource = scene.textures.exists(faceKey) ? scene.textures.get(faceKey).getSourceImage() : undefined;
      if (faceSource && studioCharacterPoseSheetMatches(face.sheet, faceSource.width, faceSource.height)) {
        if (sprite.anims.isPlaying) sprite.stop();
        const frame = face.sheet.directionFrames[nextFacing];
        sprite.setTexture(faceKey, frame).setData("framePresentation", face.sheet.frames[frame]);
        sprite.setData("faceTextureUsed", true);
        updateDisplaySize(sprite);
        return;
      }
    }
    const expression = artStyle === "sky-island" && scene.textures.exists(actorExpressionTextureKey)
      ? studioCharacterExpressionFrame({ skinKey: skin.key, time: scene.time.now,
        idleForMs: scene.time.now - Number(sprite.getData("visualStateStartedAt") ?? scene.time.now),
        moving: nextState === "walk", facing: nextFacing, reducedMotion: reducedMotion.matches,
        motionState: nextState, identity: owner,
        reaction: sprite.getData("actorReaction") as StudioVirtualSpaceSnapshot["selfReaction"] }) : null;
    if (expression !== null) {
      if (sprite.anims.isPlaying) sprite.stop();
      sprite.setTexture(actorExpressionTextureKey, expression).setData("framePresentation", STUDIO_ACTOR_EXPRESSION_PRESENTATION[expression]);
      updateDisplaySize(sprite);
      return;
    }
    if (nextState === "walk") {
      const clip = studioCharacterWalkClip(skin, nextFacing);
      const animationKey = walkAnimationKey(skin, nextFacing);
      ensureWalkAnimation(skin, nextFacing);
      // 크로스페이드 런타임이 방향 전환을 판정할 수 있게 현재 방향 클립을 남긴다.
      sprite.setData("visualWalkClipKey", clip ? animationKey : "");
      if (clip && scene.anims.exists(animationKey)) {
        if (clip.distancePerCycle || reducedMotion.matches) {
          if (sprite.anims.isPlaying) sprite.stop();
          const frame = clip.start + (reducedMotion.matches ? 0 : studioGaitFrame(
            Number(sprite.getData("walkDistance") ?? 0), clip.end - clip.start + 1,
            // 걸음 주기 상한이 계산한 보폭(gaitStrideOverride)이 있으면 그것이 이긴다. 몸 bob·그림자와 같은 값이다.
            studioEffectiveGaitStride(
              (sprite.getData("gaitStrideOverride") ?? sprite.getData("gaitDistancePerCycle")) as number | undefined,
              clip.distancePerCycle),
          ));
          const sheet = walkSheetKey(skin, nextFacing);
          if (sprite.texture.key !== sheet || String(sprite.frame.name) !== String(frame)) sprite.setTexture(sheet, frame);
          sprite.setData("framePresentation", clipPresentation(skin, clip, sheet, nextFacing, frame - clip.start));
        } else {
          sprite.play(animationKey, true);
          sprite.setData("framePresentation", clipPresentation(skin, clip, walkSheetKey(skin, nextFacing), nextFacing, Number(sprite.frame.name) - clip.start));
        }
        updateDisplaySize(sprite);
        return;
      }
    }
    if (sprite.anims.isPlaying) sprite.stop();
    const current = studioCharacterStaticAsset(skin, nextFacing, nextState);
    const standing = studioCharacterStaticAsset(skin, nextFacing);
    const asset = hasStaticAsset(current) ? current
      : hasStaticAsset(standing) ? standing
        : scene.textures.exists(sprite.texture.key) ? undefined : fallbackAsset;
    if (asset && scene.textures.exists(asset.key)) {
      // 걷기와 idle은 같은 텍스처여도 선택 프레임이 다르므로 반드시 함께 비교한다.
      if (sprite.texture.key !== asset.key || (asset.frame !== undefined && String(sprite.frame.name) !== String(asset.frame))) {
        sprite.setTexture(asset.key, asset.frame);
      }
      sprite.setData("framePresentation", asset.presentation);
    }
    updateDisplaySize(sprite);
  };

  /**
   * 본문 적용 뒤 자세 전이 세틀을 얹는다. 앉기·눕기·일어서기는 정적 포즈 교체라
   * 그 자체로는 툭 바뀌는데, 전이 구간의 스쿼시가 무게감을 만든다.
   * 본문이 매 프레임 setDisplaySize로 배율을 되돌리므로 누적되지 않고,
   * 캔버스의 게이트 스쿼시·깜빡임 합성보다 먼저 곱해져 함께 실린다.
   * 로컬·피어·NPC가 전부 이 함수를 거치므로 적용 범위는 전 배우 공통이다.
   */
  const applySpriteVisual = (
    sprite: import("phaser").GameObjects.Sprite,
    skin: StudioCharacterSkin,
    nextFacing: StudioVirtualSpaceFacing,
    nextState: StudioCharacterMotionState,
  ) => {
    applySpriteVisualBody(sprite, skin, nextFacing, nextState);
    const settle = studioPoseSettleScaleY({
      state: nextState,
      previousState: (sprite.getData("visualPreviousMotionState") as StudioCharacterMotionState | null | undefined) ?? null,
      elapsedMs: scene.time.now - Number(sprite.getData("visualStateStartedAt") ?? scene.time.now),
      reducedMotion: reducedMotion.matches,
    });
    if (settle !== 1) sprite.setScale(sprite.scaleX, sprite.scaleY * settle);
  };

  const applyAvatarVisual = (
    sprite: import("phaser").GameObjects.Sprite,
    avatar: Pick<StudioVirtualSpacePeer["state"], "avatarIndex" | "appearance">,
    nextFacing: StudioVirtualSpaceFacing,
    nextState: StudioCharacterMotionState,
    identity?: string,
  ) => {
    // "lie"는 appearance clip 목록에 없다(트랙1이 lie 시트를 추가하면 연결).
    // resolver에는 "idle"로 요청하고, 비주얼 상태는 "lie"로 유지한다.
    const resolved = resolveStudioCharacterAppearance(avatar, identity,
      nextState === "walk" ? `walk-${nextFacing}` : nextState === "lie" ? "idle" : nextState);
    const state = nextState === "lie" ? "lie"
      : resolved.clip.startsWith("walk-") ? "walk" : resolved.clip as StudioCharacterMotionState;
    sprite.setData("appearanceIssues", resolved.issues);
    // 로컬 아바타는 활성 커스텀 시트 스킨을 우선한다 (피어는 프로시저럴 유지).
    const selfSkin = identity === deps.identityRef.current ? deps.getSelfCustomSheetSkin() : null;
    applySpriteVisual(sprite, selfSkin ?? studioCharacterSkinForArtStyle(resolved.skin, artStyle), nextFacing, state);
  };

  return { ensureWalkAnimation, updateDisplaySize, hasStaticAsset, applySpriteVisual, applyAvatarVisual };
}
