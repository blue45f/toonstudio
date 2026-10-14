/**
 * 라이선스 P0 회귀 테스트 — 상용 배포에서 비상업 제공자 차단 확정.
 *
 * mixbox@2.0.0은 CC-BY-NC-4.0(비상업 전용)이다. Brush Studio V6의 라이선스
 * 프로필을 지정하지 않은 프로그램은 BRUSH_STUDIO_V6_DEFAULT_LICENSE_PROFILE로
 * 판정되므로, 기본값이 permissive-only가 아니면 상용 빌드에 비상업 제공자가
 * 무지정으로 들어간다. 이 테스트는 그 기본값과 게이트 동작을 고정한다.
 * 근거: 라이선스 감사 REPORT.md 문제 1 (2026-10-13), P0 확정 (2026-10-14).
 */
import { describe, expect, it } from "vitest";

import {
  BRUSH_STUDIO_V6_DEFAULT_LICENSE_PROFILE,
  BRUSH_STUDIO_V6_PROVIDER_MANIFEST,
  brushStudioV6LicenseProfileAllows,
} from "./brush-studio-v6-license-profile";
import { planBrushStudioV6ProviderRuntime } from "./brush-studio-v6-provider-runtime";
import type { BrushStudioV6NodeDescriptor } from "./brush-studio-v6-engine";

function node(id: string): BrushStudioV6NodeDescriptor {
  // planBrushStudioV6ProviderRuntime은 노드 id로 매니페스트를 조회해 판정하므로
  // 판정에 필요한 최소 형태만 만든다.
  return { id } as unknown as BrushStudioV6NodeDescriptor;
}

describe("mixbox 상용 배포 차단 (기본 라이선스 프로필)", () => {
  it("기본 프로필은 permissive-only로 고정된다", () => {
    expect(BRUSH_STUDIO_V6_DEFAULT_LICENSE_PROFILE).toBe("permissive-only");
  });

  it("기본 프로필에서 noncommercial·copyleft·private-grant 권리는 거부된다", () => {
    const profile = BRUSH_STUDIO_V6_DEFAULT_LICENSE_PROFILE;
    expect(brushStudioV6LicenseProfileAllows(profile, "internal")).toBe(true);
    expect(brushStudioV6LicenseProfileAllows(profile, "permissive")).toBe(true);
    expect(brushStudioV6LicenseProfileAllows(profile, "copyleft")).toBe(false);
    expect(brushStudioV6LicenseProfileAllows(profile, "noncommercial")).toBe(false);
    expect(brushStudioV6LicenseProfileAllows(profile, "private-grant")).toBe(false);
  });

  it("매니페스트의 mixbox-js-v2(CC-BY-NC-4.0)는 기본 프로필에서 차단되고, 허용형 안료 제공자는 남는다", () => {
    const byId = new Map(BRUSH_STUDIO_V6_PROVIDER_MANIFEST.map((entry) => [entry.id, entry]));
    const mixbox = byId.get("mixbox-js-v2");
    expect(mixbox?.license).toBe("CC-BY-NC-4.0");
    expect(mixbox?.rights).toBe("noncommercial");
    expect(
      brushStudioV6LicenseProfileAllows(
        BRUSH_STUDIO_V6_DEFAULT_LICENSE_PROFILE,
        mixbox!.rights,
      ),
    ).toBe(false);
    for (const id of ["spectral-wgm-v1", "spectral-js-v3", "open-km-spectral-v1"]) {
      const entry = byId.get(id);
      expect(entry, id).toBeDefined();
      expect(
        brushStudioV6LicenseProfileAllows(
          BRUSH_STUDIO_V6_DEFAULT_LICENSE_PROFILE,
          entry!.rights,
        ),
      ).toBe(true);
    }
  });

  it("기본 프로필의 실행 계획에서 pigment-mixbox 노드는 license-profile 사유로 차단된다", () => {
    const plan = planBrushStudioV6ProviderRuntime([node("pigment-mixbox")]);
    expect(plan.bindings.map((binding) => binding.providerId)).not.toContain("mixbox-js-v2");
    expect(plan.blockedNodes).toContainEqual(
      expect.objectContaining({ nodeId: "pigment-mixbox", reason: "license-profile" }),
    );
  });

  it("기본 프로필의 실행 계획에서 허용형 안료 노드는 정상 바인딩된다", () => {
    const plan = planBrushStudioV6ProviderRuntime([node("pigment-spectral")]);
    expect(plan.bindings.map((binding) => binding.providerId)).toContain("spectral-wgm-v1");
    expect(plan.blockedNodes).toHaveLength(0);
  });

  it("noncommercial-full 명시 opt-in에서는 mixbox가 허용된다 (비상업 배포판 경로 보존)", () => {
    const plan = planBrushStudioV6ProviderRuntime(
      [node("pigment-mixbox")],
      "noncommercial-full",
    );
    expect(plan.bindings.map((binding) => binding.providerId)).toContain("mixbox-js-v2");
  });
});
