import { describe, expect, it } from "vitest";

import { LOOK_V2_IDENTITY } from "./art-style";
import { DEFAULT_SHADING, QUALITY_PRESETS, applyQualityPreset, mergeShadingProfile, shadingProfileSchema, shadingProfileSchemaV2, upgradeShadingV2 } from "./shading";

import type { ShadingProfileV2 } from "./shading";

function v2Profile(): ShadingProfileV2 {
  const { look: _look, ...rest } = structuredClone(DEFAULT_SHADING);
  void _look;
  return rest;
}

describe("contracts/shading v3", () => {
  it("기본 프로파일은 v3 스키마를 통과하고 look은 v2 항등이다", () => {
    expect(shadingProfileSchema.safeParse(DEFAULT_SHADING).success).toBe(true);
    expect(DEFAULT_SHADING.look).toEqual(LOOK_V2_IDENTITY);
    for (const preset of Object.values(QUALITY_PRESETS)) expect(shadingProfileSchema.safeParse(preset).success).toBe(true);
  });

  it("v3 스키마는 look이 필수, v2 스키마는 look을 거부한다(무음 마이그레이션 금지)", () => {
    expect(shadingProfileSchema.safeParse(v2Profile()).success).toBe(false);
    expect(shadingProfileSchemaV2.safeParse(v2Profile()).success).toBe(true);
    expect(shadingProfileSchemaV2.safeParse(DEFAULT_SHADING).success).toBe(false);
  });

  it("upgradeShadingV2는 v2 값을 그대로 두고 v2 항등 look 사본을 더한다", () => {
    const v2 = { ...v2Profile(), mode: "toon" as const, toon: { ...v2Profile().toon, rampSteps: 2 as const, rim: false } };
    const v3 = upgradeShadingV2(v2);
    const { look, ...rest } = v3;
    expect(rest).toEqual(v2);
    expect(look).toEqual(LOOK_V2_IDENTITY);
    expect(look).not.toBe(LOOK_V2_IDENTITY);
    expect(Object.isFrozen(look)).toBe(false);
    expect(shadingProfileSchema.safeParse(v3).success).toBe(true);
  });

  it("mergeShadingProfile은 look을 그룹별로 병합하고(line.inner 한 단계 더) look이 없으면 그대로 둔다", () => {
    const merged = mergeShadingProfile(DEFAULT_SHADING, { look: { line: { widthMm: 3, inner: { enabled: true } }, paper: { kind: "print", strength: 0.15 } } });
    expect(merged.look.line).toMatchObject({ widthMm: 3, method: "engine-hull" });
    expect(merged.look.line.inner).toEqual({ ...LOOK_V2_IDENTITY.line.inner, enabled: true });
    expect(merged.look.paper).toEqual({ ...LOOK_V2_IDENTITY.paper, kind: "print", strength: 0.15 });
    expect(merged.look.shade).toEqual(LOOK_V2_IDENTITY.shade);
    expect(mergeShadingProfile(DEFAULT_SHADING, { mode: "toon" }).look).toBe(DEFAULT_SHADING.look);
    // v2 부분 프로파일(하위 객체 통째) 의미는 그대로
    const v2Style = mergeShadingProfile(DEFAULT_SHADING, { toon: { ...DEFAULT_SHADING.toon, rim: false } });
    expect(v2Style.toon.rim).toBe(false);
    expect(v2Style.look).toEqual(LOOK_V2_IDENTITY);
  });

  it("applyQualityPreset은 look을 유지한다", () => {
    const custom = mergeShadingProfile(DEFAULT_SHADING, { look: { rim: { strength: 0.3 } } });
    expect(applyQualityPreset(custom, "hero").look).toBe(custom.look);
  });

  it("강조 채널은 색 채널 어휘 안이어야 한다(v3 스키마 대조)", () => {
    const look = { ...structuredClone(LOOK_V2_IDENTITY), grade: { saturation: 0.12, lightness: 0, accentChannels: ["accessory", "hair-tip"] } };
    expect(shadingProfileSchema.safeParse({ ...DEFAULT_SHADING, look }).success).toBe(true);
    const bad = { ...look, grade: { ...look.grade, accentChannels: ["cape"] } };
    const result = shadingProfileSchema.safeParse({ ...DEFAULT_SHADING, look: bad });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("강조 채널");
  });
});
