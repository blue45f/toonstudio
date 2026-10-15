/**
 * 자체 잠재 안료 제공자(toonstudio-latent-pigment-v1)의 등록·어댑터·종단 통합 시험.
 * Mixbox 경계(mixbox-js-v2, 비상업)가 그대로이고, 같은 안료 슬롯에서 permissive-only 프로필이 새 혼합기를
 * 고를 수 있음을 증명한다. 이 시험은 Mixbox 패키지를 호출하지 않는다.
 */
import { describe, expect, it } from "vitest";

import {
  BRUSH_STUDIO_V6_FULL_CAPABILITIES,
  BRUSH_STUDIO_V6_NODES,
  analyzeBrushStudioV6Program,
  createBrushStudioV6Program,
  replaceBrushStudioV6Slot,
} from "../brush-studio-v6-engine";
import {
  BRUSH_STUDIO_V6_DEFAULT_LICENSE_PROFILE,
  brushStudioV6LicenseProfileAllows,
  brushStudioV6MaterialExecutionForNode,
  brushStudioV6ProviderManifestById,
  brushStudioV6ProviderManifestForNode,
} from "../brush-studio-v6-license-profile";
import { createBrushStudioV6ExactEditorProgram, serializeBrushStudioV6Authoring } from "../brush-studio-v6-authoring-document";
import { parseBrushStudioV6Import } from "../brush-studio-v6-experiments";
import { createBrushStudioV6MaterialStroke, mapBrushStudioV6Pressure, mapBrushStudioV6Tilt } from "../brush-studio-v6-material-engine";
import { createBrushStudioV6MaterialReceipt } from "../brush-studio-v6-material-receipt";
import {
  BRUSH_STUDIO_V6_PIGMENT_PROVIDERS,
  BrushStudioV6PigmentProviderUnavailableError,
  brushStudioV6PigmentProviderForNode,
  createBrushStudioV6PigmentPalette,
  mixBrushStudioV6PigmentColors,
} from "../brush-studio-v6-pigment-provider";
import { planBrushStudioV6ProviderRuntime } from "../brush-studio-v6-provider-runtime";
import { planStudioMaterialBrush } from "../../brush/studio-material-brush-runtime";

const PROVIDER_ID = "toonstudio-latent-pigment-v1";
const NODE_ID = "pigment-latent";

function channels(hex: string): readonly [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [value >>> 16, (value >>> 8) & 255, value & 255];
}

function node(id: string) {
  const found = BRUSH_STUDIO_V6_NODES.find((entry) => entry.id === id);
  if (!found) throw new Error(`노드 ${id}가 등록되어 있지 않습니다.`);
  return found;
}

describe("라이선스 프로필과 제공자 매니페스트", () => {
  it("권리 internal · 라이선스 Project license 로 등록되고 material-contact 에 연결된다", () => {
    expect(brushStudioV6ProviderManifestById(PROVIDER_ID)).toMatchObject({
      id: PROVIDER_ID,
      license: "Project license",
      rights: "internal",
      runtime: "javascript",
      integration: "connected",
      productPath: "material-contact",
      materialExecution: "native",
      nodeIds: [NODE_ID],
    });
    expect(brushStudioV6ProviderManifestForNode(NODE_ID)?.id).toBe(PROVIDER_ID);
    expect(brushStudioV6MaterialExecutionForNode(NODE_ID)).toBe("native");
  });

  it("기본 permissive-only 프로필에서 허용되고 실행 계획에 바인딩된다", () => {
    const manifest = brushStudioV6ProviderManifestById(PROVIDER_ID);
    expect(manifest).not.toBeNull();
    expect(brushStudioV6LicenseProfileAllows(BRUSH_STUDIO_V6_DEFAULT_LICENSE_PROFILE, manifest?.rights ?? "noncommercial")).toBe(true);
    const plan = planBrushStudioV6ProviderRuntime([node(NODE_ID)]);
    expect(plan.valid).toBe(true);
    expect(plan.blockedNodes).toHaveLength(0);
    expect(plan.bindings.map((binding) => binding.providerId)).toEqual([PROVIDER_ID]);
  });

  it("세 프로필 모두에서 허용된다(internal 권리는 프로필에 막히지 않는다)", () => {
    for (const profile of ["permissive-only", "source-available", "noncommercial-full"] as const) {
      expect(planBrushStudioV6ProviderRuntime([node(NODE_ID)], profile).valid).toBe(true);
    }
  });

  it("같은 슬롯의 Mixbox 경계는 그대로다(기본 프로필에서 차단, noncommercial-full 에서만 허용)", () => {
    const blocked = planBrushStudioV6ProviderRuntime([node("pigment-mixbox")]);
    expect(blocked.blockedNodes).toContainEqual(expect.objectContaining({ nodeId: "pigment-mixbox", reason: "license-profile" }));
    expect(brushStudioV6ProviderManifestById("mixbox-js-v2")).toMatchObject({ license: "CC-BY-NC-4.0", rights: "noncommercial" });
    expect(planBrushStudioV6ProviderRuntime([node("pigment-mixbox")], "noncommercial-full").bindings.map((binding) => binding.providerId))
      .toContain("mixbox-js-v2");
  });

  it("노드 식별자와 제공자 식별자는 매니페스트 안에서 유일하다", () => {
    const manifestEntries = ["toonstudio-latent-pigment-v1", "mixbox-js-v2"].map((id) => brushStudioV6ProviderManifestById(id)?.nodeIds ?? []);
    expect(new Set(manifestEntries.flat()).size).toBe(manifestEntries.flat().length);
  });
});

describe("안료 슬롯과 엔진 노드", () => {
  it("엔진에 pigment 슬롯 노드로 등록되고 제공자 이름이 연결된다", () => {
    expect(node(NODE_ID)).toMatchObject({ slot: "pigment", rights: "internal", provider: "ToonStudio Latent Pigment", label: "ToonStudio Latent Pigment" });
  });

  it("안료 슬롯에서 선택할 수 있고 기본 프로필의 분석이 유효하며 차단된 노드가 없다", () => {
    const base = createBrushStudioV6Program("oil-hair-mixer");
    const program = replaceBrushStudioV6Slot(base, "pigment", NODE_ID);
    expect(program.slots.pigment).toBe(NODE_ID);
    const analysis = analyzeBrushStudioV6Program(program, BRUSH_STUDIO_V6_FULL_CAPABILITIES);
    expect(analysis.providerPlan.valid).toBe(true);
    expect(analysis.providerPlan.blockedNodes).toHaveLength(0);
    expect(analysis.rightsProfile).toBe("commercial-safe");
    expect(analysis.valid).toBe(true);
  });

  it("같은 프로그램에서 Mixbox 를 고르면 기본 프로필의 계획이 막힌다(경계 대비)", () => {
    const base = createBrushStudioV6Program("oil-hair-mixer");
    const withMixbox = replaceBrushStudioV6Slot(base, "pigment", "pigment-mixbox");
    expect(analyzeBrushStudioV6Program(withMixbox, BRUSH_STUDIO_V6_FULL_CAPABILITIES).providerPlan.valid).toBe(false);
  });

  it("토폴로지 캐리어로 바꿔도 선택한 안료 노드를 유지한다", () => {
    const base = replaceBrushStudioV6Slot(createBrushStudioV6Program("oil-hair-mixer"), "pigment", NODE_ID);
    const topology = BRUSH_STUDIO_V6_NODES.find((entry) => entry.slot === "carrier" && entry.provider === "ToonStudio CPU Topology");
    expect(topology).toBeDefined();
    const switched = replaceBrushStudioV6Slot(base, "carrier", topology?.id ?? "");
    expect(switched.slots.carrier).toBe(topology?.id);
    expect(switched.slots.pigment).toBe(NODE_ID);
  });
});

describe("안료 제공자 어댑터", () => {
  it("제공자 설명자가 노드와 1:1로 연결된다", () => {
    expect(brushStudioV6PigmentProviderForNode(NODE_ID)).toMatchObject({
      id: PROVIDER_ID, nodeId: NODE_ID, rights: "internal", execution: "native", version: "1",
    });
    expect(new Set(BRUSH_STUDIO_V6_PIGMENT_PROVIDERS.map((entry) => entry.nodeId)).size).toBe(BRUSH_STUDIO_V6_PIGMENT_PROVIDERS.length);
  });

  it("팔레트는 33단계이고 양 끝점이 입력 색과 정확히 같으며 동결되고 결정적이다", () => {
    const palette = createBrushStudioV6PigmentPalette("#f4d03f", "#2455d6", PROVIDER_ID);
    expect(palette).toHaveLength(33);
    expect(palette[0]).toBe("#f4d03f");
    expect(palette.at(-1)).toBe("#2455d6");
    expect(Object.isFrozen(palette)).toBe(true);
    expect(palette.every((color) => /^#[0-9a-f]{6}$/u.test(color))).toBe(true);
    expect(createBrushStudioV6PigmentPalette("#f4d03f", "#2455d6", PROVIDER_ID)).toEqual(palette);
  });

  it("노랑과 파랑의 중간 혼색은 초록 쪽이고 RGB·분광 혼색과 다르다", () => {
    const first = "#ffe000";
    const second = "#0050dc";
    const [red, green, blue] = channels(mixBrushStudioV6PigmentColors(first, second, 0.5, PROVIDER_ID));
    expect(green).toBeGreaterThan(red);
    expect(green).toBeGreaterThan(blue);
    expect(mixBrushStudioV6PigmentColors(first, second, 0.5, PROVIDER_ID)).not.toBe(mixBrushStudioV6PigmentColors(first, second, 0.5, "rgb-linear-v1"));
  });

  it("팔레트의 각 단계는 같은 비율의 단일 혼색 호출과 정확히 같다", () => {
    const palette = createBrushStudioV6PigmentPalette("#e53935", "#fdd835", PROVIDER_ID);
    palette.forEach((color, index) => {
      expect(mixBrushStudioV6PigmentColors("#e53935", "#fdd835", index / 32, PROVIDER_ID)).toBe(color);
    });
  });

  it("가중치 0과 1은 정확한 끝점이고 범위 밖 가중치는 0~1로 자르며 유한하지 않으면 거부한다", () => {
    expect(mixBrushStudioV6PigmentColors("#336699", "#cc9933", 0, PROVIDER_ID)).toBe("#336699");
    expect(mixBrushStudioV6PigmentColors("#336699", "#cc9933", 1, PROVIDER_ID)).toBe("#cc9933");
    expect(mixBrushStudioV6PigmentColors("#336699", "#cc9933", -3, PROVIDER_ID)).toBe("#336699");
    expect(mixBrushStudioV6PigmentColors("#336699", "#cc9933", 7, PROVIDER_ID)).toBe("#cc9933");
    expect(() => mixBrushStudioV6PigmentColors("#336699", "#cc9933", Number.NaN, PROVIDER_ID)).toThrow(RangeError);
  });

  it("같은 색 둘을 섞으면 그 색이 나오고 비율이 연속적으로 변한다", () => {
    for (const weight of [0.1, 0.5, 0.9]) {
      expect(mixBrushStudioV6PigmentColors("#4caf50", "#4caf50", weight, PROVIDER_ID)).toBe("#4caf50");
    }
    let previous = channels(mixBrushStudioV6PigmentColors("#ffe000", "#0050dc", 0, PROVIDER_ID));
    for (let step = 1; step <= 64; step += 1) {
      const current = channels(mixBrushStudioV6PigmentColors("#ffe000", "#0050dc", step / 64, PROVIDER_ID));
      expect(Math.max(...current.map((value, index) => Math.abs(value - previous[index])))).toBeLessThan(20);
      previous = current;
    }
  });

  it("알 수 없는 제공자는 계속 닫힌 채로 실패한다", () => {
    expect(() => createBrushStudioV6PigmentPalette("#000000", "#ffffff", "unknown-provider" as never)).toThrow(BrushStudioV6PigmentProviderUnavailableError);
    expect(() => mixBrushStudioV6PigmentColors("#000000", "#ffffff", 0.5, "unknown-provider" as never)).toThrow(BrushStudioV6PigmentProviderUnavailableError);
  });

  it("잘못된 색 문자열은 기존 제공자와 같은 대체 색으로 처리하고 던지지 않는다", () => {
    expect(() => mixBrushStudioV6PigmentColors("not-a-color", "#ffffff", 0.5, PROVIDER_ID)).not.toThrow();
  });
});

describe("재료 엔진 종단 통합", () => {
  it("에디터와 원고 접촉 출력이 같다(영수증 직렬화를 거친 뒤에도 같은 획)", () => {
    const base = createBrushStudioV6Program("oil-hair-mixer");
    const original = createBrushStudioV6MaterialReceipt({ ...base, slots: { ...base.slots, pigment: NODE_ID } });
    const editor = createBrushStudioV6ExactEditorProgram(original, "parity", "원본");
    const samples = Array.from({ length: 33 }, (_, i) => ({
      x: 20 + i * 5, y: 60 + Math.sin(i / 4) * 22, p: i / 32, tx: i, ty: i / 2, twist: i * 4,
    }));
    const stroke = createBrushStudioV6MaterialStroke(editor);
    const expected = samples.flatMap((sample) => stroke.push({
      x: sample.x, y: sample.y,
      pressure: mapBrushStudioV6Pressure(sample.p, editor.input),
      tilt: mapBrushStudioV6Tilt(Math.hypot(sample.tx, sample.ty), editor.input), twist: sample.twist,
    }));
    const material = createBrushStudioV6MaterialReceipt(parseBrushStudioV6Import(serializeBrushStudioV6Authoring(editor)));
    expect(material.slots.pigment).toBe(NODE_ID);
    const actual = planStudioMaterialBrush({
      points: samples.flatMap((p) => [p.x, p.y]),
      pressures: samples.map((p) => p.p), tiltXs: samples.map((p) => p.tx),
      tiltYs: samples.map((p) => p.ty), twists: samples.map((p) => p.twist),
      stroke: material.tuning.primaryColor, strokeWidth: material.tuning.size, opacity: material.tuning.opacity,
      brushEnginePrograms: { version: 1, material },
    });
    expect(actual.length).toBeGreaterThan(0);
    expect(actual).toEqual(expected);
  });

  it("두 색을 섞는 재료 조합에서 다른 안료 모델과 다른 팔레트를 만든다", () => {
    const latent = createBrushStudioV6PigmentPalette("#fcd200", "#002185", PROVIDER_ID);
    const spectral = createBrushStudioV6PigmentPalette("#fcd200", "#002185", "spectral-wgm-v1");
    expect(latent).not.toEqual(spectral);
    expect(latent[0]).toBe(spectral[0]);
    expect(latent[32]).toBe(spectral[32]);
  });
});
