import { describe, expect, it } from "vitest";

import { normalizeStudioBrushGrainSettings } from "./studio-brush-material-dynamics";
import { StudioBrushR8GrainRegistry, resolveStudioBrushR8GrainSampler } from "./studio-brush-r8-grain-runtime";
import {
  findStudioBrushGrainSourceEntryV1,
  listStudioBrushGrainSourcesV1,
  registerStudioBrushGrainSourcesV1,
} from "./studio-brush-grain-source-catalog-v1";

describe("listStudioBrushGrainSourcesV1", () => {
  it("종이 6종과 패턴 4종이 함께 10종으로 뜬다", () => {
    const entries = listStudioBrushGrainSourcesV1();
    expect(entries).toHaveLength(10);
    expect(entries.filter((e) => e.kind === "paper")).toHaveLength(6);
    expect(entries.filter((e) => e.kind === "pattern").map((e) => e.styleKey)).toEqual([
      "noise",
      "paper-fibre",
      "canvas-weave",
      "halftone-dots",
    ]);
    // assetId가 전부 다르고 해시 형식이 계약(sha256:)을 따른다.
    expect(new Set(entries.map((e) => e.source.asset.assetId)).size).toBe(10);
    for (const entry of entries) {
      expect(entry.encodedSha256).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(entry.decodedSha256).toBe(entry.source.asset.decodedSha256);
    }
  });

  it("목록은 메모이즈되어 같은 참조를 돌려준다", () => {
    expect(listStudioBrushGrainSourcesV1()).toBe(listStudioBrushGrainSourcesV1());
  });
});

describe("registerStudioBrushGrainSourcesV1", () => {
  it("10종 전부 ready이고 영수증에 소스 해시가 남는다", () => {
    const registry = new StudioBrushR8GrainRegistry();
    const registrations = registerStudioBrushGrainSourcesV1(registry);
    expect(registrations).toHaveLength(10);
    for (const registration of registrations) {
      expect(registration.status).toBe("ready");
      expect(registration.receipt?.assetId).toBe(registration.entry.source.asset.assetId);
      expect(registration.receipt?.decodedSha256).toBe(registration.entry.decodedSha256);
      expect(registration.receipt?.encodedSha256).toBe(registration.entry.encodedSha256);
    }
  });

  it("등록된 패턴 소스는 샘플러로 조회되어 획 질감 샘플을 낸다", () => {
    const registry = new StudioBrushR8GrainRegistry();
    registerStudioBrushGrainSourcesV1(registry);
    const pattern = listStudioBrushGrainSourcesV1().find((e) => e.id === "pattern:halftone-dots");
    expect(pattern).toBeTruthy();
    const sampler = registry.resolve(pattern!.source);
    expect(sampler).not.toBeNull();
    const values = new Set<number>();
    for (let i = 0; i < 32; i += 1) {
      values.add(sampler!.sampleAlphaMultiplierAt({
        x: i * 3,
        y: i * 5,
        strokeOriginX: 0,
        strokeOriginY: 0,
        strokeSeed: 1,
        space: "canvas-fixed",
        scale: 256,
        amount: 1,
        contrast: 0.5,
        seed: 1,
      }));
    }
    expect(values.size).toBeGreaterThan(1);
  });
});

describe("선택 배선", () => {
  it("패턴 엔트리의 source는 그레인 정규화를 통과해 그대로 남는다", () => {
    const entry = listStudioBrushGrainSourcesV1().find((e) => e.id === "pattern:canvas-weave");
    const normalized = normalizeStudioBrushGrainSettings({ amount: 0.6, source: entry!.source });
    expect(normalized.source?.asset.assetId).toBe(entry!.source.asset.assetId);
    expect(findStudioBrushGrainSourceEntryV1(normalized.source)?.id).toBe("pattern:canvas-weave");
  });

  it("source가 없으면 카탈로그 엔트리가 아니다(절차적 기본)", () => {
    expect(findStudioBrushGrainSourceEntryV1(null)).toBeNull();
    expect(findStudioBrushGrainSourceEntryV1(undefined)).toBeNull();
    expect(findStudioBrushGrainSourceEntryV1({ asset: { assetId: "nope" } })).toBeNull();
  });

  it("공유 레지스트리에도 패턴 소스가 등록된다(기본 인자 경로)", () => {
    registerStudioBrushGrainSourcesV1();
    const entry = listStudioBrushGrainSourcesV1().find((e) => e.id === "pattern:noise");
    expect(resolveStudioBrushR8GrainSampler(entry!.source)).not.toBeNull();
  });
});
