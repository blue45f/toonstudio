import { describe, expect, it } from "vitest";

import { applyStrokeStream } from "../../engine/input/stages/chain";
import { polylineSamples } from "../../engine/testing/stage-samples";

import { DEFAULT_STABILIZER_PCT } from "./draw-store";
import { buildInputStage, effectiveStabilizerPct } from "./input-chain";

describe("입력 방식 선택 → 단계 체인", () => {
  it("1€(기본 경로)과 끔은 단계가 없다", () => {
    expect(buildInputStage({ stabilizerMode: "one-euro", stabilizerPct: 50, cornerGate: true })).toBeNull();
    expect(buildInputStage({ stabilizerMode: "off", stabilizerPct: null, cornerGate: true })).toBeNull();
  });

  it("끈 당김·물리 펜은 단계를 만들고 코너 게이트가 켜져 있으면 게이트로 감싼다", () => {
    const lazyGate = buildInputStage({ stabilizerMode: "lazy-brush", stabilizerPct: 60, cornerGate: true });
    const lazyBare = buildInputStage({ stabilizerMode: "lazy-brush", stabilizerPct: 60, cornerGate: false });
    const penGate = buildInputStage({ stabilizerMode: "pen-spring", stabilizerPct: 60, cornerGate: true });
    const penBare = buildInputStage({ stabilizerMode: "pen-spring", stabilizerPct: 60, cornerGate: false });
    expect(lazyGate?.id).toBe("corner-gate(lazy-brush)");
    expect(lazyBare?.id).toBe("lazy-brush");
    expect(penGate?.id).toBe("corner-gate(pen-spring)");
    expect(penBare?.id).toBe("pen-spring");
  });

  it("선택(방식·슬라이더·게이트)이 바뀌면 다른 체인이 나오고 슬라이더 값이 출력에 반영된다", () => {
    const zig = polylineSamples([[20, 120], [80, 20], [140, 120]], 1.2);
    const run = (stabilizerMode: "lazy-brush" | "pen-spring", stabilizerPct: number | null, cornerGate: boolean) => {
      const stage = buildInputStage({ stabilizerMode, stabilizerPct, cornerGate });
      return stage ? applyStrokeStream(stage, zig) : zig;
    };
    const shortRope = run("lazy-brush", 20, false);
    const longRope = run("lazy-brush", 100, false);
    expect(shortRope).not.toEqual(longRope);
    // 끈이 길수록 같은 입력의 중간 표본이 더 뒤처진다(두 번째 표본 이후 x 비교).
    const mid = Math.floor(zig.length / 3);
    expect(longRope[mid]?.y ?? 0).toBeGreaterThan(shortRope[mid]?.y ?? 0);
    expect(run("lazy-brush", 60, true)).not.toEqual(run("lazy-brush", 60, false));
    expect(run("pen-spring", 60, true)).not.toEqual(run("lazy-brush", 60, true));
  });

  it("슬라이더를 정하지 않으면(null) 방식 기본값을 쓴다", () => {
    expect(effectiveStabilizerPct("lazy-brush", null)).toBe(DEFAULT_STABILIZER_PCT["lazy-brush"]);
    expect(effectiveStabilizerPct("pen-spring", null)).toBe(DEFAULT_STABILIZER_PCT["pen-spring"]);
    expect(effectiveStabilizerPct("one-euro", null)).toBeNull();
    expect(effectiveStabilizerPct("lazy-brush", 7)).toBe(7);
    const byDefault = buildInputStage({ stabilizerMode: "lazy-brush", stabilizerPct: null, cornerGate: false });
    const explicit = buildInputStage({ stabilizerMode: "lazy-brush", stabilizerPct: 40, cornerGate: false });
    const zig = polylineSamples([[20, 120], [80, 20], [140, 120]], 1.2);
    expect(byDefault && applyStrokeStream(byDefault, zig)).toEqual(explicit && applyStrokeStream(explicit, zig));
  });

  it("같은 선택이면 매번 새 인스턴스라 상태를 공유하지 않는다", () => {
    const sel = { stabilizerMode: "pen-spring", stabilizerPct: 50, cornerGate: true } as const;
    const a = buildInputStage(sel);
    const b = buildInputStage(sel);
    expect(a).not.toBe(b);
    const zig = polylineSamples([[20, 120], [80, 20], [140, 120]], 1.2);
    expect(a && applyStrokeStream(a, zig)).toEqual(b && applyStrokeStream(b, zig));
  });
});
