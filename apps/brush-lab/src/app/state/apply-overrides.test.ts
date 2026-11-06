import { describe, expect, it } from "vitest";

import { PRESET_CATALOG, presetById } from "../../engine/presets/catalog";
import { brushConfigHashSync, normalizeProgram } from "../../engine/presets/program-schema";

import { applyOverrides, hasOverrides, stabilizerToOneEuro } from "./apply-overrides";

const base = normalizeProgram({ id: "t", name: "테스트", family: "pencil" });

describe("applyOverrides", () => {
  it("오버라이드가 없으면 같은 프로그램(해시 동일)을 돌려준다", () => {
    const out = applyOverrides(base, {});
    expect(brushConfigHashSync(out)).toBe(brushConfigHashSync(base));
    for (const preset of PRESET_CATALOG) {
      expect(brushConfigHashSync(applyOverrides(preset, {}))).toBe(brushConfigHashSync(preset));
    }
    expect(hasOverrides({})).toBe(false);
    expect(hasOverrides({ sizePx: undefined })).toBe(false);
    expect(hasOverrides({ sizePx: 3 })).toBe(true);
  });

  it("팁·도포·그레인·필터·산포·베타 토글·안정화가 각 필드에 반영되고 해시가 바뀐다", () => {
    const out = applyOverrides(base, {
      sizePx: 40,
      hardness: 0.25,
      spacing: 0.5,
      timeDabsPerSecond: 24,
      opacity: 0.7,
      flow: 0.4,
      kind: "noise",
      grain: false,
      filter: "anisotropic",
      scatterPx: 6,
      wetBeta: true,
      kmBeta: true,
      stabilizer: 1,
    });
    expect(out.tip.sizePx).toBe(40);
    expect(out.tip.hardness).toBe(0.25);
    expect(out.tip.params.hardness).toBe(0.25);
    expect(out.tip.kind).toBe("noise");
    expect(out.deposition.spacing).toBe(0.5);
    expect(out.deposition.timeDabsPerSecond).toBe(24);
    expect(out.deposition.opacity).toBe(0.7);
    expect(out.deposition.flow).toBe(0.4);
    expect(out.paper.enabled).toBe(false);
    expect(out.paper.filter).toBe("anisotropic");
    expect(out.strokeDynamics.scatter.positionPx).toBe(6);
    expect(out.wet).not.toBeNull();
    expect(out.colorDynamics.kmMixing).toBe(true);
    expect(out.input.oneEuro?.position).toEqual({ minCutoff: 0.4, beta: 0.006, dCutoff: 1 });
    expect(brushConfigHashSync(out)).not.toBe(brushConfigHashSync(base));
    // wetBeta false는 wet을 null로 되돌린다
    expect(applyOverrides(out, { wetBeta: false }).wet).toBeNull();
  });

  it("비원형(non-round) 팁 프리셋에서도 경도(hardness)와 종횡비(aspect) 오버라이드가 tip.params에 동기화된다", () => {
    const nonRoundPresets = PRESET_CATALOG.filter((p) => p.tip.kind !== "round");
    expect(nonRoundPresets.length).toBeGreaterThanOrEqual(9);
    for (const preset of nonRoundPresets) {
      const updated = applyOverrides(preset, { hardness: 0.15, aspect: 0.35 });
      expect(updated.tip.hardness).toBe(0.15);
      expect(updated.tip.aspect).toBe(0.35);
      expect(updated.tip.params.hardness).toBe(0.15);
      expect(updated.tip.params.aspect).toBe(0.35);
      // 기존 팁 전용 파라미터(strands·density·frequency 등)는 유지된다
      if (preset.tip.params.strands !== undefined) {
        expect(updated.tip.params.strands).toBe(preset.tip.params.strands);
      }
      if (preset.tip.params.frequency !== undefined) {
        expect(updated.tip.params.frequency).toBe(preset.tip.params.frequency);
      }
    }
    const charcoal = presetById("charcoal");
    const onlyHardness = applyOverrides(charcoal, { hardness: 0.9 });
    expect(onlyHardness.tip.params.hardness).toBe(0.9);
    expect(onlyHardness.tip.params.aspect).toBe(charcoal.tip.aspect);
  });

  it("범위 밖 값은 ZodError로 드러난다(무음 보정 없음)", () => {
    expect(() => applyOverrides(base, { hardness: 2 })).toThrow();
    expect(() => applyOverrides(base, { spacing: 0 })).toThrow();
  });

  it("안정화 강도 매핑은 로그 1€ 척도(0에서 30 Hz/0.12, 1에서 0.4 Hz/0.006)를 쓰며 단조 감소한다", () => {
    expect(stabilizerToOneEuro(0)).toEqual({ minCutoff: 30, beta: 0.12, dCutoff: 1 });
    expect(stabilizerToOneEuro(1)).toEqual({ minCutoff: 0.4, beta: 0.006, dCutoff: 1 });
    const mid = stabilizerToOneEuro(0.5);
    expect(mid.minCutoff).toBeCloseTo(30 * Math.pow(0.4 / 30, 0.5), 10);
    expect(mid.beta).toBeCloseTo(0.12 * Math.pow(0.006 / 0.12, 0.5), 10);
    expect(stabilizerToOneEuro(-1).minCutoff).toBe(30);
    expect(stabilizerToOneEuro(2).minCutoff).toBe(0.4);
  });
});
