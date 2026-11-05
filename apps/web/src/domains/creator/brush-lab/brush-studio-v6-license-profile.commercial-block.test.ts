/** 자체 안료 내재화 뒤에도 다른 제한 제공자의 기존 권리 검사는 유지한다. */
import { describe, expect, it } from "vitest";

import { brushStudioV6Node } from "./brush-studio-v6-engine";
import {
  BRUSH_STUDIO_V6_DEFAULT_LICENSE_PROFILE,
  BRUSH_STUDIO_V6_PROVIDER_MANIFEST,
  brushStudioV6LicenseProfileAllows,
} from "./brush-studio-v6-license-profile";
import { planBrushStudioV6ProviderRuntime } from "./brush-studio-v6-provider-runtime";

describe("자체 안료 내재화와 기본 권리 프로필", () => {
  it("기본 프로필과 제한 권리 차단을 유지한다", () => {
    expect(BRUSH_STUDIO_V6_DEFAULT_LICENSE_PROFILE).toBe("permissive-only");
    const profile = BRUSH_STUDIO_V6_DEFAULT_LICENSE_PROFILE;
    expect(brushStudioV6LicenseProfileAllows(profile, "internal")).toBe(true);
    expect(brushStudioV6LicenseProfileAllows(profile, "permissive")).toBe(true);
    for (const rights of ["copyleft", "noncommercial", "private-grant"] as const) {
      expect(brushStudioV6LicenseProfileAllows(profile, rights)).toBe(false);
    }
  });

  it("외부 Mixbox 제공자를 등록하지 않고 기존 노드를 자체 안료에 연결한다", () => {
    expect(BRUSH_STUDIO_V6_PROVIDER_MANIFEST.find((entry) => entry.id === "mixbox-js-v2"))
      .toBeUndefined();
    for (const profile of ["permissive-only", "source-available", "noncommercial-full"] as const) {
      const plan = planBrushStudioV6ProviderRuntime([brushStudioV6Node("pigment-mixbox")], profile);
      expect(plan.valid).toBe(true);
      expect(plan.bindings).toEqual([expect.objectContaining({
        providerId: "toonstudio-latent-pigment-v1", rights: "internal", license: "Project license",
        nodeIds: ["pigment-mixbox"],
      })]);
    }
  });

  it("기본 프로필에서 허용형 분광 제공자를 계속 실행한다", () => {
    const plan = planBrushStudioV6ProviderRuntime([brushStudioV6Node("pigment-spectral")]);
    expect(plan.bindings.map((binding) => binding.providerId)).toContain("spectral-wgm-v1");
    expect(plan.blockedNodes).toHaveLength(0);
  });
});
