// @vitest-environment node
import { describe, expect, it } from "vitest";

import { buildBg3dObjectClusterPrimitives } from "./studio-bg3d-background-object-cluster";
import { createDefaultStudioBg3dSceneDocument, parseStudioBg3dSceneDocument } from "./studio-bg3d-scene-document";
import { adaptStudioBg3dRuntimeToDocument, hydrateStudioBg3dDocumentToRuntime } from "./studio-bg3d-scene-runtime";
import { resolveStudioBg3dPrimitiveSurfaceMaterialProps } from "./studio-bg3d-surface-presets";
import {
  STUDIO_BG3D_V11_UPPER_ARCHETYPES,
  assembleBg3dV11RoomPipeline,
  buildBg3dV11UpperClusterPrimitives,
  resolveBg3dClusterHumanSnapPoints,
} from "./studio-bg3d-v11-upper-and-lived-in-engine";

describe("V11 재질과 실제 가구 접점", () => {
  it("6종 상부 재질을 렌더러 계약과 정본 저장·재열기에 보존한다", () => {
    for (const { id } of STUDIO_BG3D_V11_UPPER_ARCHETYPES) {
      const primitives = buildBg3dV11UpperClusterPrimitives({ archetype: id, density: "lived-in" });
      for (const part of primitives) {
        expect(part.materialOverride?.roughness).toBeTypeOf("number");
        expect(part.materialOverride?.metalness).toBeTypeOf("number");
        const rendered = resolveStudioBg3dPrimitiveSurfaceMaterialProps(part.materialOverride);
        expect(rendered.roughness).toBe(part.materialOverride?.roughness);
        expect(rendered.metalness).toBe(part.materialOverride?.metalness);
      }
      const saved = adaptStudioBg3dRuntimeToDocument({
        baseDocument: createDefaultStudioBg3dSceneDocument(), primitives,
        customModels: [], attachmentByStorageModelId: new Map(),
      });
      const parsed = parseStudioBg3dSceneDocument(saved.serialized);
      if (!parsed) throw new Error("상부 설비의 정본 저장 장면을 읽지 못했습니다.");
      const reopened = hydrateStudioBg3dDocumentToRuntime({ document: parsed, storageModelIdByAttachmentId: new Map() });
      expect(reopened.ok).toBe(true);
      expect(reopened.primitives.map((part) => part.materialOverride))
        .toEqual(primitives.map((part) => part.materialOverride));
    }
    const duct = buildBg3dV11UpperClusterPrimitives({
      archetype: "ceiling-hvac-cassette-duct", density: "lived-in",
    }).find((part) => part.id.endsWith("-spiral-duct-main"));
    expect(duct?.materialOverride).toMatchObject({ roughness: 0.32, metalness: 0.68 });
  });

  it.each(["essential", "detailed"] as const)("%s 밀도에서 없는 파라솔과 테이블의 기준점을 안내하지 않는다", (density) => {
    const assembled = assembleBg3dV11RoomPipeline({
      room: { width: 8, depth: 7, wallHeight: 3 },
      lowerArchetype: "convenience-patio-street-furniture", density,
    });
    expect(assembled.lowerPrimitives.some((part) => part.name?.startsWith("Patio_"))).toBe(false);
    expect(assembled.humanSnapPoints).toEqual([]);
  });

  it("실제 테이블과 파라솔이 있을 때만 각각의 기준점을 제공한다", () => {
    const { primitives } = buildBg3dObjectClusterPrimitives({
      archetype: "convenience-patio-street-furniture", moduleCount: 1,
      clutterDensity: "lived-in", arrangement: "linear-wall", surfaceTheme: "daylight-neutral",
    });
    const resolve = (parts = primitives) => resolveBg3dClusterHumanSnapPoints({
      archetype: "convenience-patio-street-furniture", primitives: parts,
    });
    expect(resolve().map((point) => point.role)).toEqual(["seat", "desk-hands"]);
    expect(resolve(primitives.filter((part) => !part.name?.startsWith("Patio_Round_Table")))
      .map((point) => point.role)).toEqual(["seat"]);
    expect(resolve(primitives.filter((part) => !part.name?.startsWith("Patio_Parasol_Canopy")))
      .map((point) => point.role)).toEqual(["desk-hands"]);
    expect(resolve([])).toEqual([]);
    // 실제 조립 결과를 넘기지 않은 카탈로그 좌표 조회 계약은 유지한다.
    expect(resolveBg3dClusterHumanSnapPoints({ archetype: "convenience-patio-street-furniture" }))
      .toHaveLength(2);
  });

  it.each([
    ["office-creator-workstation", "desk-hands"],
    ["classroom-front-locker-rig", "counter-rest"],
    ["hospital-ward-corridor-set", "seat"],
    ["fantasy-dungeon-alchemy-props", "desk-hands"],
  ] as const)("%s에서도 실제 대상 표면이 없으면 %s 접점을 제외한다", (archetype, role) => {
    expect(resolveBg3dClusterHumanSnapPoints({ archetype, primitives: [] })
      .some((point) => point.role === role)).toBe(false);
  });
});
