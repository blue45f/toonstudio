/**
 * 혼색 브러시(Studio Wet Mix)의 "섞는 방식" 계약과 현재 선택.
 *
 * - 방식 id 와 검증은 순수 상수다. Worker 프로토콜 검증·혼색 코어·패널·호스트가 같은 목록을 쓴다.
 * - 현재 선택은 탭 안 메모리 상태 하나다(문서·브러시 스냅샷에 저장하지 않는다). 패널이 바꾸고, 호스트는
 *   획을 Worker 로 보낼 때 이 값을 읽어 `WetMixSettings.mixModel` 에 담는다. 반경·혼색율 같은 다른 혼색
 *   설정처럼 세션 동안만 유지된다. React 를 가져오지 않으므로 Worker 번들에 섞여도 가볍다.
 * - 기본값은 기존 동작인 `lerp` 이다.
 */

/** 패널 표시 순서이기도 하다. */
export const STUDIO_WET_MIX_MODELS = Object.freeze(["lerp", "spectral-wgm", "latent-pigment", "ryb"] as const);

export type StudioWetMixModel = (typeof STUDIO_WET_MIX_MODELS)[number];

export const STUDIO_WET_MIX_MODEL_DEFAULT: StudioWetMixModel = "lerp";

export function isStudioWetMixModel(value: unknown): value is StudioWetMixModel {
  return typeof value === "string" && (STUDIO_WET_MIX_MODELS as readonly string[]).includes(value);
}

let currentModel: StudioWetMixModel = STUDIO_WET_MIX_MODEL_DEFAULT;
const listeners = new Set<() => void>();

/** 지금 선택된 섞는 방식(안정 스냅샷 — useSyncExternalStore 의 getSnapshot 으로 쓴다). */
export function getStudioWetMixModelPreference(): StudioWetMixModel {
  return currentModel;
}

/** 섞는 방식을 바꾼다. 알 수 없는 값은 거부하고 현재 값을 그대로 둔다. 바뀐 경우에만 구독자에게 알린다. */
export function setStudioWetMixModelPreference(value: unknown): StudioWetMixModel {
  if (!isStudioWetMixModel(value)) {
    throw new TypeError(`알 수 없는 혼색 방식입니다(받은 값: ${String(value)}).`);
  }
  if (value === currentModel) return currentModel;
  currentModel = value;
  for (const listener of listeners) listener();
  return currentModel;
}

export function subscribeStudioWetMixModelPreference(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 시험·세션 초기화용: 기본값으로 되돌린다. */
export function resetStudioWetMixModelPreference(): void {
  setStudioWetMixModelPreference(STUDIO_WET_MIX_MODEL_DEFAULT);
}
