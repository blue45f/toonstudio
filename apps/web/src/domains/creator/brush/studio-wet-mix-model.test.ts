import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getStudioWetMixModelPreference,
  isStudioWetMixModel,
  resetStudioWetMixModelPreference,
  setStudioWetMixModelPreference,
  STUDIO_WET_MIX_MODEL_DEFAULT,
  STUDIO_WET_MIX_MODELS,
  subscribeStudioWetMixModelPreference,
} from "./studio-wet-mix-model";

afterEach(() => resetStudioWetMixModelPreference());

describe("혼색 방식 계약", () => {
  it("네 방식을 패널 순서대로 두고 기본값은 기존 lerp 다", () => {
    expect(STUDIO_WET_MIX_MODELS).toEqual(["lerp", "spectral-wgm", "latent-pigment", "ryb"]);
    expect(STUDIO_WET_MIX_MODEL_DEFAULT).toBe("lerp");
    expect(getStudioWetMixModelPreference()).toBe("lerp");
    expect(Object.isFrozen(STUDIO_WET_MIX_MODELS)).toBe(true);
  });

  it("검증은 정확한 문자열만 받는다", () => {
    for (const model of STUDIO_WET_MIX_MODELS) expect(isStudioWetMixModel(model)).toBe(true);
    for (const value of ["Lerp", "latent", "", null, undefined, 1, {}]) expect(isStudioWetMixModel(value)).toBe(false);
  });
});

describe("탭 단위 현재 선택", () => {
  it("바뀔 때만 구독자에게 알리고 해지 뒤에는 알리지 않는다", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeStudioWetMixModelPreference(listener);
    expect(setStudioWetMixModelPreference("latent-pigment")).toBe("latent-pigment");
    expect(getStudioWetMixModelPreference()).toBe("latent-pigment");
    setStudioWetMixModelPreference("latent-pigment");
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    setStudioWetMixModelPreference("ryb");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("알 수 없는 값은 거부하고 현재 선택을 유지한다", () => {
    setStudioWetMixModelPreference("spectral-wgm");
    expect(() => setStudioWetMixModelPreference("kubelka")).toThrow(TypeError);
    expect(getStudioWetMixModelPreference()).toBe("spectral-wgm");
    resetStudioWetMixModelPreference();
    expect(getStudioWetMixModelPreference()).toBe("lerp");
  });
});
