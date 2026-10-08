import { describe, expect, it } from "vitest";

import { LaneUnavailableError } from "../engine/core/errors";
import { PRESET_CATALOG, presetById } from "../engine/presets/catalog";

import {
  assertProgramSupported,
  equivalentHardness,
  mapProgramToMypaint,
  rgbToHsv,
  unsupportedProgramReason,
} from "./mypaint-settings-map";

describe("mypaint-settings-map: 프로그램 → .myb 설정", () => {
  it("지름·경도·흐름·간격이 설정으로 옮겨진다(G펜 예)", () => {
    const program = presetById("ink-g-pen");
    const { document, compose, receipt } = mapProgramToMypaint(program);
    const s = document.settings;
    expect(s["radius_logarithmic"]?.base_value).toBeCloseTo(Math.log(program.tip.sizePx / 2), 5);
    expect(s["hardness"]?.base_value).toBeCloseTo(1, 5);
    expect(s["opaque"]?.base_value).toBe(program.deposition.flow);
    expect(s["opaque_linearize"]?.base_value).toBe(0);
    expect(s["dabs_per_basic_radius"]?.base_value).toBe(0);
    expect(s["dabs_per_actual_radius"]?.base_value).toBeCloseTo(1 / program.deposition.spacing, 4);
    expect(s["dabs_per_second"]?.base_value).toBe(program.deposition.timeDabsPerSecond);
    expect(s["anti_aliasing"]?.base_value).toBe(1);
    expect(compose).toEqual({ opacity: 1, blend: "normal" });
    expect(receipt.mapped.length).toBeGreaterThan(5);
  });

  it("색 옵션은 HSV로 들어가고 기본은 검정(v = 0)이다", () => {
    expect(mapProgramToMypaint(presetById("pencil-hb")).document.settings["color_v"]?.base_value).toBe(0);
    const red = mapProgramToMypaint(presetById("pencil-hb"), { color: [1, 0, 0, 0.5] });
    expect(red.document.settings["color_h"]?.base_value).toBe(0);
    expect(red.document.settings["color_s"]?.base_value).toBe(1);
    expect(red.document.settings["color_v"]?.base_value).toBe(1);
    // 색 알파는 획 레이어 합성 불투명도에 곱해진다.
    expect(red.compose.opacity).toBeCloseTo(0.5 * presetById("pencil-hb").deposition.opacity, 6);
    expect(rgbToHsv(0, 1, 0)).toEqual([1 / 3, 1, 1]);
    expect(rgbToHsv(0, 0, 1)[0]).toBeCloseTo(2 / 3, 6);
    expect(rgbToHsv(0.5, 0.5, 0.5)).toEqual([0, 0, 0.5]);
  });

  it("압력 크기 동역학은 radius_logarithmic 입력 곡선(배율의 로그)이 되고 압력 1에서 0이다", () => {
    const program = structuredClone(presetById("marker-alcohol"));
    program.strokeDynamics.size = [{ input: "pressure", curve: [0.25, 1], min: 0, max: 1 }];
    const curve = mapProgramToMypaint(program).document.settings["radius_logarithmic"]?.inputs["pressure"];
    expect(curve).toBeDefined();
    expect(curve?.[0]).toEqual([0, Math.log(0.25)]);
    expect(curve?.[curve.length - 1]).toEqual([1, 0]);
    // 중간 점은 선형 배율의 로그(0.625)다.
    const mid = curve?.find(([x]) => x === 0.5);
    expect(mid?.[1]).toBeCloseTo(Math.log(0.625), 9);
  });

  it("흐름 동역학은 opaque_multiply(0 기준) 곡선이 되고 상수 입력은 기준값에 접힌다", () => {
    const program = structuredClone(presetById("airbrush"));
    program.strokeDynamics.flow = [
      { input: "pressure", curve: [0.2, 1], min: 0, max: 1 },
      { input: "constant", curve: [1], min: 0.5, max: 0.5 },
    ];
    const { document } = mapProgramToMypaint(program);
    expect(document.settings["opaque"]?.base_value).toBeCloseTo(0.05 * 0.5, 6);
    expect(document.settings["opaque_multiply"]?.base_value).toBe(0);
    expect(document.settings["opaque_multiply"]?.inputs["pressure"]).toEqual([
      [0, 0.2],
      [1, 1],
    ]);
  });

  it("엔진 입력 축과 다른 입력(속도·기울기)은 옮기지 않고 영수증 unmapped에 남긴다", () => {
    const program = structuredClone(presetById("ink-g-pen"));
    program.strokeDynamics.size = [{ input: "velocity", curve: [1, 0.5], min: 0, max: 1 }];
    program.strokeDynamics.flow = [{ input: "tiltAltitude", curve: [1, 0.5], min: 0, max: 1 }];
    const { document, receipt } = mapProgramToMypaint(program);
    expect(document.settings["radius_logarithmic"]?.inputs).toEqual({});
    expect(document.settings["opaque_multiply"]).toBeUndefined();
    const joined = receipt.unmapped.join("\n");
    expect(joined).toContain("strokeDynamics.size[velocity]");
    expect(joined).toContain("strokeDynamics.flow[tiltAltitude]");
  });

  it("배율 0은 하한으로 올리고 근사로 기록한다(ln 0 방지)", () => {
    const program = structuredClone(presetById("marker-alcohol"));
    program.strokeDynamics.size = [{ input: "pressure", curve: [0, 1], min: 0, max: 1 }];
    const { document, receipt } = mapProgramToMypaint(program);
    expect(document.settings["radius_logarithmic"]?.inputs["pressure"]?.[0]?.[1]).toBeCloseTo(Math.log(1 / 64), 9);
    expect(receipt.approximated.join("\n")).toContain("하한");
  });

  it("같은 프로그램은 같은 문서·영수증을 만든다(결정적)", () => {
    for (const program of PRESET_CATALOG) {
      expect(JSON.stringify(mapProgramToMypaint(program))).toBe(JSON.stringify(mapProgramToMypaint(program)));
    }
  });

  it("모든 프리셋의 설정값이 유한하고 곡선 점이 입력 오름차순이다", () => {
    for (const program of PRESET_CATALOG) {
      for (const [name, setting] of Object.entries(mapProgramToMypaint(program).document.settings)) {
        expect(Number.isFinite(setting.base_value), `${program.id}.${name}`).toBe(true);
        for (const points of Object.values(setting.inputs)) {
          expect(points.length).toBeGreaterThanOrEqual(2);
          for (let i = 0; i < points.length; i += 1) {
            expect(Number.isFinite(points[i]?.[1] ?? Number.NaN), `${program.id}.${name}`).toBe(true);
            if (i > 0) expect(points[i]?.[0] ?? 0).toBeGreaterThan(points[i - 1]?.[0] ?? 0);
          }
        }
      }
    }
  });
});

describe("mypaint-settings-map: 등가 경도", () => {
  it("경도 1은 1, 0은 1/3, 단조 증가이고 [1/3, 1] 안이다", () => {
    const program = structuredClone(presetById("marker-alcohol"));
    const at = (h: number): number => {
      program.tip.hardness = h;
      return equivalentHardness(program);
    };
    expect(at(1)).toBeCloseTo(1, 12);
    expect(at(0)).toBeCloseTo(1 / 3, 12);
    let previous = at(0);
    for (let i = 1; i <= 20; i += 1) {
      const value = at(i / 20);
      expect(value).toBeGreaterThanOrEqual(previous);
      expect(value).toBeLessThanOrEqual(1);
      previous = value;
    }
  });

  it("엔진 불투명도 곡선에서 반 불투명 반경이 Sumi와 일치한다(정의 검증)", () => {
    const engineOpacity = (h: number, rr: number): number => (rr <= h ? 1 - (1 / h - 1) * rr : (h / (1 - h)) * (1 - rr));
    const program = structuredClone(presetById("marker-alcohol"));
    for (const sumiHardness of [0, 0.25, 0.5, 0.8, 1]) {
      program.tip.hardness = sumiHardness;
      const h = equivalentHardness(program);
      const rr0 = ((1 + sumiHardness) / 2) ** 2;
      if (sumiHardness < 1) expect(engineOpacity(h, rr0)).toBeCloseTo(0.5, 9);
    }
    // 에어브러시는 가우시안 exp(−2·dn²) = 0.5가 되는 제곱 반경에서 맞춘다.
    const airbrush = presetById("airbrush");
    expect(engineOpacity(equivalentHardness(airbrush), Math.exp(0) * (Math.LN2 / 2))).toBeCloseTo(0.5, 9);
  });
});

describe("mypaint-settings-map: 미지원 프로그램", () => {
  it.each([
    ["watercolor-wet", "습식"],
    ["watercolor-dry", "습식"],
    ["sumi-ink-wet", "습식"],
    ["gouache", "습식"],
    ["oil-impasto", "임파스토"],
    ["smudge-blend", "smudge"],
  ])("%s는 사유와 함께 거부된다", (id, keyword) => {
    const reason = unsupportedProgramReason(presetById(id));
    expect(reason).toContain(keyword);
    expect(reason).toContain(id);
    expect(() => assertProgramSupported("libmypaint", presetById(id))).toThrow(LaneUnavailableError);
  });

  it("건식·에어브러시·지우개는 거부하지 않는다", () => {
    for (const id of ["pencil-hb", "ink-g-pen", "airbrush", "charcoal", "eraser-soft", "marker-alcohol"]) {
      expect(unsupportedProgramReason(presetById(id)), id).toBeNull();
    }
  });

  it("거부 오류는 not-implemented 코드와 레인·프리셋 상세를 담는다", () => {
    try {
      assertProgramSupported("hokusai", presetById("oil-impasto"));
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(LaneUnavailableError);
      expect((error as LaneUnavailableError).code).toBe("not-implemented");
      expect((error as LaneUnavailableError).details).toEqual({ laneId: "hokusai", presetId: "oil-impasto" });
    }
  });
});

describe("mypaint-settings-map: 영수증(무음 손실 없음)", () => {
  it("활성인 미대응 기능을 빠짐없이 적는다(연필: 종이·접촉 물리·테이퍼·산포 등)", () => {
    const program = structuredClone(presetById("pencil-hb"));
    program.strokeDynamics.scatter = { positionPx: 2, angleRad: 0.1, scale: 0.1, countJitter: 0.1 };
    program.colorDynamics = { ...program.colorDynamics, hueJitter: 0.1 };
    program.strokeDynamics.rotationFollow = "direction";
    program.tip.aspect = 2;
    const joined = mapProgramToMypaint(program).receipt.unmapped.join("\n");
    for (const key of ["program.input", "paper", "physics.contact=graphite", "edge.taperStartPx", "colorDynamics", "strokeDynamics.scatter", "rotationFollow=direction", "tip.aspect"]) {
      expect(joined, key).toContain(key);
    }
  });

  it("기본값인 기능은 미대응으로 적지 않는다(지터 0·테이퍼 0·종이 없음)", () => {
    const program = structuredClone(presetById("airbrush"));
    const joined = mapProgramToMypaint(program).receipt.unmapped.join("\n");
    expect(joined).not.toContain("paper");
    expect(joined).not.toContain("edge.taper");
    expect(joined).not.toContain("colorDynamics");
    expect(joined).not.toContain("physics.contact");
  });

  it("opacity·블렌드는 엔진 밖 합성 규약으로 옮기고 지우개는 destination-out 근사를 적는다", () => {
    const eraser = mapProgramToMypaint(presetById("eraser-hard"));
    expect(eraser.compose.blend).toBe("erase");
    expect(eraser.receipt.approximated.join("\n")).toContain("destination-out");
    const marker = mapProgramToMypaint(presetById("marker-alcohol"));
    expect(marker.compose).toEqual({ opacity: 0.6, blend: "multiply" });
  });
});
