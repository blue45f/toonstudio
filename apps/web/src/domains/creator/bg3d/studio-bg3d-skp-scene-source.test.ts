import { create, parseSkp } from "openskp";
import { describe, expect, it, vi } from "vitest";

import { extractStudioBg3dSkpSceneManifest } from "./studio-bg3d-skp-scene-manifest";
import {
  applyStudioBg3dSkpSceneSourceUnit, legacyStudioBg3dSkpSceneSource, parseStudioBg3dSkpSceneSource,
  studioBg3dSkpGeometryTransform, unavailableStudioBg3dSkpSceneSource,
} from "./studio-bg3d-skp-scene-source";
import { studioBg3dSkpUnitScaleFactor } from "./studio-bg3d-skp-unit";

import type { StudioBg3dSkpSceneSource, StudioBg3dSkpSceneSourceReason } from "./studio-bg3d-skp-scene-source";
import type { StudioBg3dSkpUnit } from "./studio-bg3d-skp-unit";

function availableSource(): Extract<StudioBg3dSkpSceneSource, { readonly status: "available" }> {
  const builder = create();
  builder.addFace([[0, 0, 0], [100, 0, 0], [0, 100, 0]]);
  const bytes = new Uint8Array(builder.toBytes());
  const extracted = extractStudioBg3dSkpSceneManifest(parseSkp(bytes.buffer));
  if (!extracted.ok) throw new Error(extracted.detail);
  return { version: 1, status: "available", manifest: extracted.value, reason: null, geometryTransform: studioBg3dSkpGeometryTransform() };
}

describe("SKP 장면 출처의 신뢰 경계", () => {
  it("원본 manifest와 한계·진단을 Worker/JSON 경계 뒤에도 동일하게 보존하고 입력과 분리한다", () => {
    const source = availableSource();
    const result = parseStudioBg3dSkpSceneSource(JSON.parse(JSON.stringify(source)));
    expect(result).toEqual({ ok: true, value: source });
    if (!result.ok || result.value.status !== "available") throw new Error("출처 검증에 실패했습니다.");
    expect(result.value.manifest).not.toBe(source.manifest);
    expect(result.value.manifest.definitions.sourceTotal).toBeNull();
    expect(result.value.manifest.coverage).toBe("parser-exposed-metadata-only");
  });

  it("누락된 구 Worker·자산은 알려지지 않은 좌표 권위를 가진 legacy로 구분한다", () => {
    expect(parseStudioBg3dSkpSceneSource(undefined)).toEqual({ ok: true, value: legacyStudioBg3dSkpSceneSource() });
    expect(parseStudioBg3dSkpSceneSource(null).ok).toBe(false);
  });

  const reasons: readonly StudioBg3dSkpSceneSourceReason[] = ["metadata-pass-size-limit", "parser-unavailable", "metadata-parse-failed", "manifest-invalid-source", "manifest-budget-exceeded"];
  it.each(reasons)("형상만 확보한 원인 %s을 숨기거나 빈 manifest로 바꾸지 않는다", (reason) => {
    const source = unavailableStudioBg3dSkpSceneSource(reason);
    expect(parseStudioBg3dSkpSceneSource(source)).toEqual({ ok: true, value: source });
    expect(source.status).toBe("unavailable");
    expect(source.manifest).toBeNull();
  });

  it("지원하지 않는 버전·상태·추가 필드·잘못된 manifest와 false legacy를 거부한다", () => {
    const source = availableSource();
    for (const value of [{}, { ...source, version: 2 }, { ...source, status: "complete" }, { ...source, extra: true },
      { ...source, manifest: {} }, { ...source, reason: "not-recorded" },
      { ...legacyStudioBg3dSkpSceneSource(), geometryTransform: studioBg3dSkpGeometryTransform() },
      { ...unavailableStudioBg3dSkpSceneSource("parser-unavailable"), manifest: source.manifest }]) {
      expect(parseStudioBg3dSkpSceneSource(value).ok).toBe(false);
    }
  });

  it("wrapper 접근자를 실행하지 않으며 원본 manifest의 예산 초과를 그대로 거부한다", () => {
    const getter = vi.fn(() => "available");
    const accessor = Object.defineProperty({}, "status", { enumerable: true, get: getter });
    expect(parseStudioBg3dSkpSceneSource(accessor).ok).toBe(false);
    expect(getter).not.toHaveBeenCalled();
    const source = availableSource();
    const result = parseStudioBg3dSkpSceneSource({ ...source, manifest: { ...source.manifest,
      pages: { total: 257, stored: 257, sourceTotal: null, items: Array.from({ length: 257 }, () => ({})) },
    } });
    expect(result).toMatchObject({ ok: false, code: "budget-exceeded" });
  });
});

describe("실제 형상의 단위·축 변환 권위", () => {
  const units: readonly StudioBg3dSkpUnit[] = ["inch", "m", "cm", "mm"];
  it.each(units)("선택한 %s 보정과 x,z,-y 축 변환만 기록하고 원본 인치 manifest는 바꾸지 않는다", (unit) => {
    const source = availableSource();
    const factor = studioBg3dSkpUnitScaleFactor(unit);
    const updated = applyStudioBg3dSkpSceneSourceUnit(source, { appliedUnit: unit, scaleFactor: factor, userSelected: true });
    expect(updated.manifest).toBe(source.manifest);
    expect(updated.geometryTransform).toMatchObject({ status: "known", sourceUnit: "inch", sourceUpAxis: "z", outputUnit: "meter", outputUpAxis: "y",
      axisMapping: "x,z,-y", appliedUnit: unit, unitScaleFactor: factor, userSelectedUnit: true, metersPerSourceUnit: 0.0254 * factor });
    expect(parseStudioBg3dSkpSceneSource(updated)).toEqual({ ok: true, value: updated });
  });

  it("형상과 다른 배율·축·허위 사용자 단위 선택을 거부한다", () => {
    const source = availableSource();
    for (const geometryTransform of [{ ...source.geometryTransform, metersPerSourceUnit: 1 }, { ...source.geometryTransform, axisMapping: "x,y,z" },
      { ...studioBg3dSkpGeometryTransform("m", true), userSelectedUnit: false }]) {
      expect(parseStudioBg3dSkpSceneSource({ ...source, geometryTransform }).ok).toBe(false);
    }
    expect(() => applyStudioBg3dSkpSceneSourceUnit(source, { appliedUnit: "mm", scaleFactor: 1, userSelected: true })).toThrow("inconsistent-unit-authority");
    const legacy = legacyStudioBg3dSkpSceneSource();
    expect(applyStudioBg3dSkpSceneSourceUnit(legacy, { appliedUnit: "m", scaleFactor: studioBg3dSkpUnitScaleFactor("m"), userSelected: true })).toBe(legacy);
  });
});
