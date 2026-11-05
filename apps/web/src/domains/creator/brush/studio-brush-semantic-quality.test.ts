import { describe, expect, it } from "vitest";

import {
  STUDIO_DEFAULT_QUALITY_BRUSH_CATALOG_ITEMS,
  STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS,
} from "./studio-brush-catalog";
import { studioBrushPackDescriptorById } from "./studio-brush-pack-index";
import {
  auditStudioBrushSemanticClaims,
  describeStudioBrushRuntimeSemantics,
} from "./studio-brush-semantic-quality";
import { STUDIO_BRUSH_ENGINE_PROGRAM_SET_VERSION } from "./studio-brush-engine-program-set";
import { STUDIO_WET_PAPER_BAKE_PROGRAMS } from "./wet-paper/studio-wet-paper-programs";
import {
  profileStudioWetPaperSemanticEvidence,
  studioWetPaperProgramSupportsPigmentGranulation,
} from "./wet-paper/studio-wet-paper-semantic-evidence";

describe("Studio brush runtime semantics", () => {
  it("names the exact renderer tip, texture and input model instead of guessing from preview style", () => {
    expect(describeStudioBrushRuntimeSemantics("pen")).toMatchObject({
      engine: "causal-ink",
      tip: "round",
      texture: "none",
      dynamics: "causal-pressure",
      tipLabelKo: "원형 촉",
      textureLabelKo: "매끈",
      dynamicsLabelKo: "필압 추종",
    });
    expect(describeStudioBrushRuntimeSemantics("brush")).toMatchObject({
      engine: "angled-ribbon",
      tip: "angled-ribbon",
      dynamics: "ribbon-pressure",
      tipLabelKo: "방향성 리본 촉",
      dynamicsLabelKo: "리본 필압",
    });
    expect(describeStudioBrushRuntimeSemantics("watercolor")).toMatchObject({
      engine: "watercolor-dabs",
      texture: "wet-edge",
      dynamics: "watercolor-pressure",
      textureLabelKo: "웻 엣지",
    });
    expect(describeStudioBrushRuntimeSemantics("oil")).toMatchObject({
      engine: "oil-ribbon",
      tip: "bristle",
      texture: "procedural-bristle",
      dynamics: "bristle-pressure",
    });
    expect(describeStudioBrushRuntimeSemantics("screentone")).toMatchObject({
      engine: "screentone-dots",
      texture: "tone-grid",
      dynamics: "global-grid",
      textureLabelKo: "문서 고정 망점",
    });
  });

  it("keeps procedural catalogue identity separate from its generic runtime carrier", () => {
    const descriptor = studioBrushPackDescriptorById("heart-stamp");
    expect(descriptor).not.toBeNull();
    const presentation = describeStudioBrushRuntimeSemantics(
      descriptor!.catalogId,
      descriptor!.runtimeBrushId,
    );
    expect(presentation).toMatchObject({
      catalogId: "heart-stamp",
      runtimeBrushId: "ink-particle",
      engine: "dynamic-dabs",
      tip: "soft-particle",
      texture: "custom-alpha-capable",
      dynamics: "mapped-dabs",
    });
  });
});

describe("Studio brush semantic-claim audit", () => {
  it("detects material promises that the selected runtime does not support", () => {
    const wet = auditStudioBrushSemanticClaims({
      catalogId: "synthetic-watercolor",
      runtimeBrushId: "pen",
      name: "프로 수채 번짐",
      operation: "paint",
    });
    expect(wet.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "wet-claim-without-wet-response" }),
    ]));

    const bristle = auditStudioBrushSemanticClaims({
      catalogId: "synthetic-filbert",
      runtimeBrushId: "pen",
      name: "필버트 강모 평붓",
      operation: "paint",
      previewStyle: "solid",
    });
    expect(bristle.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "bristle-claim-without-bristle-response" }),
      expect.objectContaining({ code: "directional-claim-without-directional-tip" }),
    ]));
  });

  it("treats paint/erase contradictions as hard errors", () => {
    const result = auditStudioBrushSemanticClaims({
      catalogId: "synthetic-eraser",
      runtimeBrushId: "pen",
      name: "고무 지우개",
      operation: "paint",
    });
    expect(result.errorCount).toBe(1);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: "error",
        code: "eraser-name-operation-mismatch",
      }),
    ]));
  });

  it("accepts runtime-backed wet, bristle, particle, glow and tone promises", () => {
    const cases = [
      ["watercolor", "수채 워시"],
      ["oil", "필버트 강모 붓"],
      ["glitter", "글리터 반짝 입자"],
      ["neon", "네온 후광"],
      ["screentone", "스크린톤 망점"],
    ] as const;
    for (const [id, name] of cases) {
      const result = auditStudioBrushSemanticClaims({
        catalogId: id,
        name,
        operation: "paint",
      });
      expect(
        result.issues,
        `${id}: ${result.issues.map(({ code }) => code).join(", ")}`,
      ).toEqual([]);
    }
  });

  it("젖은 종이의 실제 안료 침전과 일반 그레인 계약을 구분한다", () => {
    const item = STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS.find(({ id }) => id === "watercolor--granulating-bake");
    if (!item) throw new Error("입자 침전 브러시 누락");
    const evidence = profileStudioWetPaperSemanticEvidence(item.id);
    expect(evidence).toEqual({ programId: "curtis-granulating-wash", pigmentGranulationResponse: true });
    const result = auditStudioBrushSemanticClaims({
      ...item,
      catalogId: item.id,
      pigmentGranulationResponse: evidence?.pigmentGranulationResponse,
    });
    expect(result.issues).toEqual([]);
    expect(auditStudioBrushSemanticClaims({ ...item, catalogId: item.id }).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "particle-claim-without-particle-response" }),
    ]));
    for (const runtimeBrushId of ["pen", "watercolor", "watercolor--granulating", "dry-media"]) {
      expect(profileStudioWetPaperSemanticEvidence(runtimeBrushId)).toBeNull();
      expect(auditStudioBrushSemanticClaims({
        catalogId: "synthetic-pigment", runtimeBrushId, name: "안료 입자 침전",
      }).issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "particle-claim-without-particle-response" }),
      ]));
    }
  });

  it("안료 침전 근거로 스프레이·산포·장식 입자 약속을 대신하지 않는다", () => {
    for (const hint of ["산포", "스프레이", "스플래터", "흩어짐", "글리터", "반짝", "spray", "scatter", "splatter", "glitter"]) {
      expect(auditStudioBrushSemanticClaims({
        catalogId: "watercolor--granulating-bake", name: "안료 입자 침전", hint,
        pigmentGranulationResponse: true,
      }).issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "particle-claim-without-particle-response" }),
      ]));
    }
  });

  it("비활성 안료·종이 무늬와 다른 웻 프로그램은 침전 근거가 아니다", () => {
    const program = STUDIO_WET_PAPER_BAKE_PROGRAMS["curtis-granulating-wash"];
    const [coarse, fine] = program.pigments;
    expect(studioWetPaperProgramSupportsPigmentGranulation({
      ...program, pigments: [{ ...coarse, granulation: 0 }, { ...fine, granulation: 0 }],
    })).toBe(false);
    expect(studioWetPaperProgramSupportsPigmentGranulation({
      ...program, pigments: [{ ...coarse, share: 0 }, { ...fine, share: 0 }],
    })).toBe(false);
    expect(studioWetPaperProgramSupportsPigmentGranulation({
      ...program, pigments: [{ ...coarse, settleRate: 0 }, { ...fine, settleRate: 0 }],
    })).toBe(false);
    for (const watercolor of [{ wetEdgeBloomProgramId: "edge-bloom" }, { livingInkBakeProgramId: "sumi-flow-bake" }] as const) {
      expect(profileStudioWetPaperSemanticEvidence("watercolor--granulating-bake", {
        version: STUDIO_BRUSH_ENGINE_PROGRAM_SET_VERSION, watercolor,
      })).toBeNull();
    }
  });

  it("keeps every default quality-portfolio item connected to a real runtime operation", () => {
    const results = STUDIO_DEFAULT_QUALITY_BRUSH_CATALOG_ITEMS.map((item) => {
      const descriptor = studioBrushPackDescriptorById(item.id);
      return auditStudioBrushSemanticClaims({
        catalogId: item.id,
        runtimeBrushId: descriptor?.runtimeBrushId ?? item.id,
        name: item.name,
        shortName: item.shortName,
        hint: item.hint,
        operation: item.operation,
        previewStyle: item.previewStyle,
      });
    });
    expect(results).toHaveLength(95);
    expect(results.flatMap(({ issues }) => (
      issues.filter(({ severity }) => severity === "error")
    ))).toEqual([]);
  });
});
