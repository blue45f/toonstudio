import { describe, expect, it } from "vitest";

import {
  measureStudioWetPaperGranulationResponse,
  profileStudioBrushSettledGranulationEvidence,
} from "../../../../../../scripts/lib/studio-brush-settled-granulation-evidence";
import { STUDIO_BRUSH_ENGINE_PROGRAM_SET_VERSION } from "./studio-brush-engine-program-set";
import { STUDIO_WET_PAPER_BAKE_PROGRAMS } from "./wet-paper/studio-wet-paper-programs";

import {
  STUDIO_DEFAULT_QUALITY_BRUSH_CATALOG_ITEMS,
  STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS,
} from "./studio-brush-catalog";
import { studioBrushPackDescriptorById } from "./studio-brush-pack-index";
import {
  auditStudioBrushSemanticClaims,
  describeStudioBrushRuntimeSemantics,
} from "./studio-brush-semantic-quality";

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

  it.each([
    "수채 · 입자 침전 산포", "수채 · 입자 침전 spray", "수채 · 입자 침전 scatter",
    "수채 · 입자 침전 스플래터", "수채 · 입자 침전 일반 입자", "수채 · 산포",
  ])("정착 입자 침전 근거로 분사·산포나 일반 입자 약속을 대신 인정하지 않는다: %s", (name) => {
    const result = auditStudioBrushSemanticClaims({
      catalogId: "watercolor--granulating-bake", name, operation: "paint",
      settledGranulationResponse: true,
    });
    expect(result.issues, name).toContainEqual(expect.objectContaining({
      code: "particle-claim-without-particle-response",
    }));
  });

  it("다른 설명 필드의 분사·장식 입자 약속도 침전 근거로 대신하지 않는다", () => {
    for (const hint of ["산포", "스프레이", "스플래터", "흩어짐", "글리터", "반짝", "spray", "scatter", "splatter", "glitter"]) {
      const result = auditStudioBrushSemanticClaims({
        catalogId: "watercolor--granulating-bake", name: "안료 입자 침전", hint,
        settledGranulationResponse: true,
      });
      expect(result.issues, hint).toContainEqual(expect.objectContaining({
        code: "particle-claim-without-particle-response",
      }));
    }
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

const GRANULATING_BRUSH = "watercolor--granulating-bake";
const GRANULATING_PROGRAM = STUDIO_WET_PAPER_BAKE_PROGRAMS["curtis-granulating-wash"];

describe("정착 수채 입자 침전 감사 증거", () => {
  it("실제 기본 정착 프로그램의 종이 골에 더 많은 안료가 침착됨을 측정한다", () => {
    const evidence = profileStudioBrushSettledGranulationEvidence(GRANULATING_BRUSH);
    expect(evidence).toMatchObject({ programId: "curtis-granulating-wash", responsive: true });
    expect(evidence?.valleyCaptureExcess).toBeGreaterThan(0);
    expect(evidence?.ridgeSettledMass).toBeGreaterThan(0);
  });

  it("실제 연결된 입자 침전 약속을 일반 분사 산포와 구분한다", () => {
    const item = STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS.find(({ id }) => id === GRANULATING_BRUSH);
    if (!item) throw new Error("입자 침전 브러시 누락");
    const evidence = profileStudioBrushSettledGranulationEvidence(item.id);
    const result = auditStudioBrushSemanticClaims({
      ...item, catalogId: item.id,
      settledGranulationResponse: evidence?.responsive,
    });
    expect(result.issues).toEqual([]);
    for (const settledGranulationResponse of [undefined, false]) {
      expect(auditStudioBrushSemanticClaims({
        ...item, catalogId: item.id, settledGranulationResponse,
      }).issues).toContainEqual(expect.objectContaining({
        code: "particle-claim-without-particle-response",
      }));
    }
  });

  it("문구와 기본 watercolor 계약만으로 입자 침전 약속을 인정하지 않는다", () => {
    for (const id of ["watercolor", "pen", "watercolor--granulating", "dry-media"]) {
      expect(profileStudioBrushSettledGranulationEvidence(id)).toBeNull();
      const result = auditStudioBrushSemanticClaims({
        catalogId: id, name: "입자 침전", operation: "paint",
      });
      expect(result.issues).toContainEqual(expect.objectContaining({
        code: "particle-claim-without-particle-response",
      }));
    }
  });

  it("블룸·리빙잉크 오버라이드로 정착 경로가 바뀌면 기본 핀의 근거를 빌리지 않는다", () => {
    for (const watercolor of [
      { wetEdgeBloomProgramId: "edge-bloom" },
      { livingInkBakeProgramId: "sumi-flow-bake" },
    ]) {
      const evidence = profileStudioBrushSettledGranulationEvidence(GRANULATING_BRUSH, {
        version: STUDIO_BRUSH_ENGINE_PROGRAM_SET_VERSION, watercolor,
      });
      expect(evidence).toBeNull();
      expect(auditStudioBrushSemanticClaims({
        catalogId: GRANULATING_BRUSH, name: "수채 · 입자 침전", operation: "paint",
        settledGranulationResponse: evidence?.responsive,
      }).warningCount).toBe(1);
    }
  });

  it("granulation·침착률·활성 안료를 제거한 변형은 같은 종이에서도 침전 근거가 되지 못한다", () => {
    const [coarse, fine] = GRANULATING_PROGRAM.pigments;
    for (const pigments of [
      [{ ...coarse, granulation: 0 }, { ...fine, granulation: 0 }],
      [{ ...coarse, settleRate: 0 }, { ...fine, settleRate: 0 }],
      [{ ...coarse, share: 0 }, { ...fine, share: 0 }],
      [{ ...coarse, share: 0 }, { ...fine, share: 1, granulation: 0 }],
    ] as const) {
      const evidence = measureStudioWetPaperGranulationResponse({
        ...GRANULATING_PROGRAM,
        pigments,
      });
      expect(evidence.valleyCaptureExcess).toBe(0);
      expect(evidence.responsive).toBe(false);
      expect(auditStudioBrushSemanticClaims({
        catalogId: GRANULATING_BRUSH, name: "수채 · 입자 침전", operation: "paint",
        settledGranulationResponse: evidence.responsive,
      }).issues).toContainEqual(expect.objectContaining({
        code: "particle-claim-without-particle-response",
      }));
    }
  });
});
