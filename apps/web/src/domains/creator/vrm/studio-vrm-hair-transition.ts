import {
  AVATAR_FORGE_VERSION,
  sanitizeAvatarForgeState,
  type AvatarForgeHairParams,
} from "./studio-vrm-avatar-forge";
import {
  resolveStudioVrmHairTransitionGuard,
  type StudioVrmHairHighlightRingSpec,
  type StudioVrmHairSwapPolicy,
} from "./studio-vrm-hair-hand-equip-refiner";

export interface StudioVrmHairTransitionPlan {
  readonly version: 1;
  readonly previousIdentity: string | null;
  readonly identity: string;
  readonly styleChanged: boolean;
  readonly geometryChanged: boolean;
  readonly visibilityChanged: boolean;
  readonly shouldRender: boolean;
  /** A style/shape replacement must not reuse spring or geometry state owned by the previous hair. */
  readonly resetDynamicState: boolean;
  /** 교체 전환 시 1프레임 깜빡임 방지 원자적 커밋 정책. */
  readonly swapPolicy: StudioVrmHairSwapPolicy;
  /** 전환 직후 스프링 초기 충격으로 머리가 기울어지지 않도록 안정화하는 프레임 수. */
  readonly springSettleFrames: number;
  /** 새 헤어 마운트 시 루트 로컬 회전 영점 고정 여부. */
  readonly lockNeutralRootBasis: boolean;
  /** 스타일·광택에 맞춘 웹툰 툰 하이라이트 링 정합 스펙. */
  readonly highlightRing: StudioVrmHairHighlightRingSpec;
}

function hash(value: string): string {
  let result = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 0x01000193);
  }
  return (result >>> 0).toString(16).padStart(8, "0");
}

function normalizedHair(hair: AvatarForgeHairParams): AvatarForgeHairParams {
  return sanitizeAvatarForgeState({
    version: AVATAR_FORGE_VERSION,
    hair,
  }).hair;
}

/**
 * Identity of the generated hair surface only. `replaceOriginal` deliberately stays out: toggling
 * the source VRM visibility must not rebuild and reallocate an otherwise identical generated mesh.
 */
export function buildStudioVrmHairGeometryIdentity(
  hairInput: AvatarForgeHairParams,
): string {
  const hair = normalizedHair(hairInput);
  const payload = {
    style: hair.style,
    volume: hair.volume,
    length: hair.length,
    strandWidth: hair.strandWidth,
    fringe: hair.fringe,
    curl: hair.curl,
    shine: hair.shine,
    baseColor: hair.baseColor.toLowerCase(),
    shadowColor: hair.shadowColor?.toLowerCase() ?? null,
    tipColor: hair.tipColor.toLowerCase(),
    bangStyle: hair.bangStyle,
    wave: hair.wave,
    ahoge: hair.ahoge,
    tailHeight: hair.tailHeight,
    // 색 확장은 정점 색에 구워지므로 바뀌면 다시 짓는다. 기본값이면 키가 없어 예전 정체성 그대로다.
    ...(hair.accentMode ? { accentMode: hair.accentMode, accentColor: hair.accentColor ?? null } : {}),
    ...(hair.gradientPosition !== undefined ? { gradientPosition: hair.gradientPosition } : {}),
    ...(hair.gradientSoftness !== undefined ? { gradientSoftness: hair.gradientSoftness } : {}),
  };
  return `hair-geometry-v1:${hash(JSON.stringify(payload))}`;
}

export function planStudioVrmHairTransition(
  previousInput: AvatarForgeHairParams | null | undefined,
  nextInput: AvatarForgeHairParams,
): StudioVrmHairTransitionPlan {
  const next = normalizedHair(nextInput);
  const previous = previousInput ? normalizedHair(previousInput) : null;
  const identity = buildStudioVrmHairGeometryIdentity(next);
  const previousIdentity = previous ? buildStudioVrmHairGeometryIdentity(previous) : null;
  const geometryChanged = previousIdentity !== identity;
  const styleChanged = previous?.style !== next.style;
  const shouldRender = next.style !== "none";
  const guard = resolveStudioVrmHairTransitionGuard({
    style: next.style,
    shine: next.shine,
    shouldRender,
    styleChanged,
    geometryChanged,
  });
  return Object.freeze({
    version: 1,
    previousIdentity,
    identity,
    styleChanged,
    geometryChanged,
    visibilityChanged: previous?.replaceOriginal !== next.replaceOriginal,
    shouldRender,
    resetDynamicState: geometryChanged,
    swapPolicy: guard.swapPolicy,
    springSettleFrames: guard.springSettleFrames,
    lockNeutralRootBasis: guard.lockNeutralRootBasis,
    highlightRing: guard.highlightRing,
  });
}
