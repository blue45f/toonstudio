/**
 * `toonstudio-kit-v2` 16종 손포즈·제스처 VRMA 지연 로더 및 프로시저럴 휴머노이드 폴백.
 *
 * - 경계 규칙: `apps/character-lab/src`를 절대 import하지 않고, 배포 public URL
 *   (`/assets/characters/toonstudio-kit-v2/gestures/<id>.vrma`)만 런타임에 지연 fetch한다.
 * - `.vrma` 바이너리가 없는 환경이나 오프라인에서는 내장 16종 손가락·팔 관절 프로시저럴 포즈로 즉시 폴백한다.
 */
import type { StudioVrmHandPoseType } from "../../vrm/studio-vrm-hand-poses";
import { createStudioVrmHandPose } from "../../vrm/studio-vrm-hand-poses";
import type { StudioThreeActorNode } from "./studio-virtual-space-three-scene";

export const STUDIO_THREE_KIT_V2_PUBLIC_BASE_URL = "/assets/characters/toonstudio-kit-v2" as const;

export interface StudioThreeKitV2GestureSpec {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly handPose: StudioVrmHandPoseType;
  readonly vrmaUrl: string;
  readonly emoteAliases: readonly string[];
  readonly durationMs: number;
  readonly rightUpperArmEuler: readonly [number, number, number];
  readonly rightLowerArmEuler: readonly [number, number, number];
  readonly leftUpperArmEuler?: readonly [number, number, number];
  readonly leftLowerArmEuler?: readonly [number, number, number];
  readonly waveSpeedHz?: number;
}

function defineGesture(
  id: string,
  labelKo: string,
  labelEn: string,
  handPose: StudioVrmHandPoseType,
  emoteAliases: readonly string[],
  rightUpperArmEuler: readonly [number, number, number],
  rightLowerArmEuler: readonly [number, number, number],
  options: {
    readonly leftUpperArmEuler?: readonly [number, number, number];
    readonly leftLowerArmEuler?: readonly [number, number, number];
    readonly waveSpeedHz?: number;
    readonly durationMs?: number;
  } = {},
): StudioThreeKitV2GestureSpec {
  return Object.freeze({
    id,
    labelKo,
    labelEn,
    handPose,
    vrmaUrl: `${STUDIO_THREE_KIT_V2_PUBLIC_BASE_URL}/gestures/${id}.vrma`,
    emoteAliases: Object.freeze([...emoteAliases]),
    durationMs: options.durationMs ?? 2_400,
    rightUpperArmEuler,
    rightLowerArmEuler,
    ...(options.leftUpperArmEuler ? { leftUpperArmEuler: options.leftUpperArmEuler } : {}),
    ...(options.leftLowerArmEuler ? { leftLowerArmEuler: options.leftLowerArmEuler } : {}),
    ...(options.waveSpeedHz !== undefined ? { waveSpeedHz: options.waveSpeedHz } : {}),
  });
}

/** `toonstudio-kit-v2` 16종 손포즈·제스처 레지스트리. */
export const STUDIO_THREE_KIT_V2_GESTURES: readonly StudioThreeKitV2GestureSpec[] = Object.freeze([
  defineGesture("wave-hello", "손 흔들기", "Wave Hello", "open", ["wave"], [-0.38, 0.1, 0.65], [0, 0.18, 0.35], { waveSpeedHz: 2.6 }),
  defineGesture("thumbs-up", "좋아요", "Thumbs Up", "thumbsUp", ["thumbs-up"], [-0.85, -0.15, -0.45], [-0.4, 0.25, 0]),
  defineGesture("peace-sign", "브이 포즈", "Peace Sign", "peace", ["sparkles", "party"], [-0.95, 0.1, -0.35], [-0.55, 0.3, 0.1]),
  defineGesture("finger-heart", "손가락 하트", "Finger Heart", "fingerHeart", ["heart"], [-0.78, -0.22, -0.42], [-0.62, 0.36, 0.08]),
  defineGesture("ok-sign", "오케이", "OK Sign", "okSign", ["idea"], [-0.72, -0.1, -0.5], [-0.48, 0.24, 0.05]),
  defineGesture("point-board", "보드 지목", "Point Board", "point", ["exclaim", "question"], [-1.18, 0.08, -0.25], [-0.12, 0.08, 0]),
  defineGesture("clap-cheers", "박수 환호", "Clap & Cheers", "open", ["clap", "cheers"], [-0.68, -0.38, -0.58], [-0.55, 0.42, 0], {
    leftUpperArmEuler: [-0.68, 0.38, 0.58],
    leftLowerArmEuler: [-0.55, -0.42, 0],
    waveSpeedHz: 3.4,
  }),
  defineGesture("fist-pump", "파이팅 주먹", "Fist Pump", "fist", ["fireworks"], [-1.32, 0.05, -0.22], [-0.62, 0.2, 0.12], { waveSpeedHz: 2.0 }),
  defineGesture("pen-sketch", "드로잉 펜 그립", "Pen Sketch Grip", "penGrip", ["draw", "sketch"], [-0.55, -0.26, -0.68], [-0.72, 0.34, 0]),
  defineGesture("cup-sip", "커피 한 잔", "Coffee Cup Sip", "cupGrip", ["coffee"], [-0.62, -0.28, -0.64], [-0.88, 0.38, 0]),
  defineGesture("phone-check", "폰 확인", "Phone Check", "phoneGrip", ["phone"], [-0.48, -0.24, -0.72], [-0.78, 0.35, 0]),
  defineGesture("call-me", "전화해", "Call Me", "callMe", ["call"], [-0.92, -0.18, -0.38], [-1.05, 0.4, 0.12]),
  defineGesture("rock-on", "락앤롤", "Rock On", "rockRoll", ["music", "dance"], [-1.25, 0.14, -0.18], [-0.32, 0.15, 0.1], { waveSpeedHz: 2.2 }),
  defineGesture("pinch-detail", "디테일 줌", "Pinch Detail", "pinch", ["think"], [-0.64, -0.22, -0.62], [-0.75, 0.3, 0]),
  defineGesture("claw-focus", "집중 모드", "Claw Focus", "claw", ["wow", "laugh"], [-0.84, 0.12, -0.46], [-0.42, 0.22, 0.15]),
  defineGesture("relaxed-idle", "자연스러운 휴식", "Relaxed Idle", "relaxed", ["yoga", "sleep", "tai-chi"], [0.06, 0, -1.16], [0, 0.14, 0]),
]);

const GESTURE_BY_ID = new Map<string, StudioThreeKitV2GestureSpec>(
  STUDIO_THREE_KIT_V2_GESTURES.map((spec) => [spec.id, spec] as const),
);
const GESTURE_BY_EMOTE = new Map<string, StudioThreeKitV2GestureSpec>(
  STUDIO_THREE_KIT_V2_GESTURES.flatMap((spec) => spec.emoteAliases.map((alias) => [alias, spec] as const)),
);

export interface StudioThreeLoadedVrmaGesture {
  readonly spec: StudioThreeKitV2GestureSpec;
  readonly source: "vrma-asset" | "procedural-fallback";
  readonly vrmaBytes: Uint8Array | null;
}

const loadedGestureCache = new Map<string, Promise<StudioThreeLoadedVrmaGesture>>();

export function findKitV2GestureById(id: string | null | undefined): StudioThreeKitV2GestureSpec | null {
  if (!id) return null;
  return GESTURE_BY_ID.get(id) ?? null;
}

export function resolveKitV2GestureForEmote(emoteId: string | null | undefined): StudioThreeKitV2GestureSpec | null {
  if (!emoteId) return null;
  return GESTURE_BY_ID.get(emoteId) ?? GESTURE_BY_EMOTE.get(emoteId) ?? null;
}

/**
 * public URL(`/assets/characters/toonstudio-kit-v2/gestures/<id>.vrma`)을 지연 fetch한다.
 * 네트워크/404/미배포 시 예외로 무대를 깨지 않고 프로시저럴 폴백을 반환한다.
 */
export async function loadStudioThreeVrmaGesture(
  gestureId: string,
  options: {
    readonly signal?: AbortSignal;
    readonly fetchImpl?: typeof fetch;
    readonly bypassCache?: boolean;
  } = {},
): Promise<StudioThreeLoadedVrmaGesture | null> {
  const spec = findKitV2GestureById(gestureId);
  if (!spec) return null;
  if (!options.bypassCache && !options.fetchImpl && !options.signal) {
    const cached = loadedGestureCache.get(spec.id);
    if (cached) return cached;
  }

  const run = async (): Promise<StudioThreeLoadedVrmaGesture> => {
    const fetcher = options.fetchImpl ?? globalThis.fetch;
    if (typeof fetcher !== "function") {
      return { spec, source: "procedural-fallback", vrmaBytes: null };
    }
    try {
      const response = await fetcher(spec.vrmaUrl, {
        credentials: "same-origin",
        redirect: "error",
        signal: options.signal,
      });
      if (!response.ok) {
        return { spec, source: "procedural-fallback", vrmaBytes: null };
      }
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength < 12) {
        return { spec, source: "procedural-fallback", vrmaBytes: null };
      }
      return { spec, source: "vrma-asset", vrmaBytes: new Uint8Array(buffer) };
    } catch {
      return { spec, source: "procedural-fallback", vrmaBytes: null };
    }
  };

  const promise = run();
  if (!options.bypassCache && !options.fetchImpl && !options.signal) {
    loadedGestureCache.set(spec.id, promise);
  }
  return promise;
}

/** VRM 휴머노이드 손가락 본 + 팔 본에 `toonstudio-kit-v2` 16종 손포즈·제스처를 적용한다. */
export function applyStudioThreeVrmaGesturePose(
  node: StudioThreeActorNode,
  gestureIdOrEmote: string,
  elapsedSeconds = 0,
): boolean {
  const spec = resolveKitV2GestureForEmote(gestureIdOrEmote);
  if (!spec) return false;

  const waveOffset = spec.waveSpeedHz
    ? Math.sin(elapsedSeconds * Math.PI * 2 * spec.waveSpeedHz) * 0.22
    : 0;

  if (node.vrmRightUpperArm) {
    node.vrmRightUpperArm.rotation.set(
      spec.rightUpperArmEuler[0],
      spec.rightUpperArmEuler[1],
      spec.rightUpperArmEuler[2] + waveOffset,
    );
  }
  if (node.vrmRightLowerArm) {
    node.vrmRightLowerArm.rotation.set(
      spec.rightLowerArmEuler[0],
      spec.rightLowerArmEuler[1],
      spec.rightLowerArmEuler[2] + waveOffset * 0.65,
    );
  }
  if (spec.leftUpperArmEuler && node.vrmLeftUpperArm) {
    node.vrmLeftUpperArm.rotation.set(
      spec.leftUpperArmEuler[0],
      spec.leftUpperArmEuler[1],
      spec.leftUpperArmEuler[2] - waveOffset,
    );
  }
  if (spec.leftLowerArmEuler && node.vrmLeftLowerArm) {
    node.vrmLeftLowerArm.rotation.set(
      spec.leftLowerArmEuler[0],
      spec.leftLowerArmEuler[1],
      spec.leftLowerArmEuler[2] - waveOffset * 0.65,
    );
  }

  const humanoid = node.vrm?.humanoid;
  if (humanoid) {
    const rightHand = createStudioVrmHandPose("right", spec.handPose);
    for (const [boneName, euler] of Object.entries(rightHand)) {
      const bone = humanoid.getNormalizedBoneNode(boneName as Parameters<typeof humanoid.getNormalizedBoneNode>[0]);
      if (bone) bone.rotation.set(euler[0], euler[1], euler[2]);
    }
    if (spec.leftUpperArmEuler) {
      const leftHand = createStudioVrmHandPose("left", spec.handPose);
      for (const [boneName, euler] of Object.entries(leftHand)) {
        const bone = humanoid.getNormalizedBoneNode(boneName as Parameters<typeof humanoid.getNormalizedBoneNode>[0]);
        if (bone) bone.rotation.set(euler[0], euler[1], euler[2]);
      }
    }
  }

  return true;
}

export function clearStudioThreeVrmaGestureCacheForTests(): void {
  loadedGestureCache.clear();
}
