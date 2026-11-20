import { describe, expect, it } from "vitest";
import {
  addMoodboardCard,
  connectMoodboardCards,
  createMoodboard,
} from "../studio-moodboard";
import {
  addSpatialRemixEdge,
  auditSpatialMoodboardRights,
  extractWorkStyleDnaToken,
  fromColumnMoodboardToSpatial,
  toColumnMoodboard,
  type RgbaPixelSample,
} from "./studio-spatial-moodboard-dna";

describe("studio-spatial-moodboard-dna", () => {
  it("기존 컬럼 무드보드와 무한 2D 공간 무드보드 간 무손실 양방향 변환을 보장한다", () => {
    let board = createMoodboard({
      id: "mb-ep01",
      projectId: "proj-1",
      title: "1화 무드보드",
      columnTitles: ["색감 레퍼런스", "콘티 메모"],
    });
    const col0 = board.columns[0].id;
    const col1 = board.columns[1].id;

    board = addMoodboardCard(board, col0, {
      id: "card-web-ref",
      kind: "image",
      ref: "https://example.com/sunset-photo.jpg",
      text: "노을 하늘 참고",
    });
    board = addMoodboardCard(board, col1, {
      id: "card-note",
      kind: "note",
      text: "주인공 외투는 진남색 유지",
    });
    board = connectMoodboardCards(board, "card-web-ref", "card-note");

    let spatial = fromColumnMoodboardToSpatial(board);
    expect(spatial.nodes).toHaveLength(2);
    expect(spatial.clusters).toHaveLength(2);
    expect(spatial.nodes[0]?.rightsTag).toBe("reference-only");
    expect(spatial.nodes[1]?.rightsTag).toBe("creator-original");

    spatial = addSpatialRemixEdge(spatial, {
      fromNodeId: spatial.nodes[0].id,
      toNodeId: spatial.nodes[1].id,
      kind: "color-source",
      weight01: 0.75,
    });
    expect(spatial.remixEdges).toHaveLength(1);

    const restored = toColumnMoodboard(spatial);
    expect(restored.version).toBe(1);
    expect(restored.id).toBe(board.id);
    expect(restored.columns.map((c) => c.title)).toEqual(["색감 레퍼런스", "콘티 메모"]);
    expect(restored.cards["card-web-ref"]?.ref).toBe("https://example.com/sunset-photo.jpg");
    expect(restored.cards["card-note"]?.text).toBe("주인공 외투는 진남색 유지");
    expect(restored.connections).toHaveLength(1);
  });

  it("결정론적 Median-Cut Style DNA 추출기가 5~8색 팔레트·휘도 곡선·MToon 힌트를 산출한다", () => {
    const samples: RgbaPixelSample[] = [
      [18, 24, 48, 255],
      [22, 28, 56, 255],
      [230, 120, 80, 255],
      [240, 145, 92, 255],
      [250, 232, 200, 255],
      [88, 124, 178, 255],
      [140, 72, 96, 255],
      [42, 62, 88, 255],
      [0, 0, 0, 0], // 투명 픽셀 제외 확인
    ];

    const dna1 = extractWorkStyleDnaToken({
      id: "dna-sunset",
      sourceLabel: "노을 옥상 씬",
      rgbaSamples: samples,
      targetPaletteSize: 6,
    });
    const dna2 = extractWorkStyleDnaToken({
      id: "dna-sunset",
      sourceLabel: "노을 옥상 씬",
      rgbaSamples: samples,
      targetPaletteSize: 6,
    });

    expect(dna1).toEqual(dna2);
    expect(dna1.paletteHex.length).toBeGreaterThanOrEqual(5);
    expect(dna1.paletteHex.length).toBeLessThanOrEqual(8);
    expect(dna1.luminanceContrastCurve[0]).toBeLessThan(dna1.luminanceContrastCurve[2]);
    expect(dna1.saturationBand.min01).toBeLessThanOrEqual(dna1.saturationBand.mean01);
    expect(dna1.saturationBand.mean01).toBeLessThanOrEqual(dna1.saturationBand.max01);
    expect([2, 3, 4]).toContain(dna1.celShadingStepHint);
    expect(dna1.mtoonShadeToony).toBeGreaterThanOrEqual(0.5);
  });

  it("Rights BOM 감사가 외부 미검증 웹 핀을 reference-only로 차단 경고한다", () => {
    let board = createMoodboard({
      id: "mb-rights",
      title: "권리 감사 테스트",
      columnTitles: ["참고"],
    });
    const colId = board.columns[0].id;
    board = addMoodboardCard(board, colId, {
      id: "ext-1",
      kind: "link",
      ref: "https://pinterest.example/pin/123",
    });
    board = addMoodboardCard(board, colId, {
      id: "orig-1",
      kind: "sketch",
      text: "직접 그린 구도 스케치",
    });

    const spatial = fromColumnMoodboardToSpatial(board);
    const audit = auditSpatialMoodboardRights(spatial);
    expect(audit.totalNodeCount).toBe(2);
    expect(audit.commercialSafeCount).toBe(1);
    expect(audit.referenceOnlyCount).toBe(1);
    expect(audit.canMergeAllIntoCommercialExport).toBe(false);
    expect(audit.warningBadges[0]?.cardId).toBe("ext-1");
    expect(audit.warningBadges[0]?.canMergeIntoCommercialExport).toBe(false);
  });
});
