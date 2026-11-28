/**
 * Wave 117 — 웹툰 원고 레이어 트리 자동 정규화·안전 병합 및 타일-희소 VRAM 다이어트 컴파일러 테스트.
 */

import { describe, expect, it } from "vitest";
import {
  auditLayerTreeHygiene,
  canonicalizeLayerManifestJson,
  compileLayerVramDietPlan,
  escapeXmlText,
  inferStudioLayerRole,
  isCanonicalStudioLayerName,
  isMeaninglessLayerName,
  renderLayerTreeHygieneSvg,
  sha256LayerManifestHex,
  summarizeLayerTreeHygieneKo,
  type LayerTreeNodeInput,
} from "./index";

function makeNode(overrides: Partial<LayerTreeNodeInput> & { readonly id: string }): LayerTreeNodeInput {
  return {
    parentId: null,
    rawName: "레이어 1",
    kind: "raster",
    blendMode: "normal",
    opacity: 1,
    visible: true,
    locked: false,
    clippedToBelow: false,
    nonEmptyTileCount: 20,
    totalTileCount: 100,
    tileSizePx: 256,
    bytesPerPixel: 4,
    hasAlphaMask: false,
    ...overrides,
  };
}

describe("Wave 117 — 레이어 트리 무결성 감사 (Fail-Closed)", () => {
  it("1. 자기 순환(self-cycle) 노드를 fail-closed로 검출하고 컴파일을 차단한다", () => {
    const audit = auditLayerTreeHygiene(
      [makeNode({ id: "f-self", parentId: "f-self", kind: "folder", rawName: "폴더 1", nonEmptyTileCount: 0 })],
      { documentId: "ep117-self-cycle" },
    );
    expect(audit.integrityStatus).toBe("failed-closed");
    expect(audit.safeToCompile).toBe(false);
    expect(audit.issues.some((i) => i.code === "cycle")).toBe(true);

    const plan = compileLayerVramDietPlan(audit);
    expect(plan.status).toBe("blocked-integrity-failure");
    expect(plan.mergedGroupCount).toBe(0);
    expect(plan.prunedEmptyLayerCount).toBe(0);
    expect(plan.metrics.dietMergeSavingsBytes).toBe(0);
  });

  it("2. 2노드 상호 순환(A <-> B) 폴더 그래프를 fail-closed로 차단한다", () => {
    const audit = auditLayerTreeHygiene([
      makeNode({ id: "f-a", parentId: "f-b", kind: "folder", rawName: "폴더 A", nonEmptyTileCount: 0 }),
      makeNode({ id: "f-b", parentId: "f-a", kind: "folder", rawName: "폴더 B", nonEmptyTileCount: 0 }),
    ]);
    expect(audit.integrityStatus).toBe("failed-closed");
    expect(audit.issues.some((i) => i.code === "cycle")).toBe(true);
    expect(compileLayerVramDietPlan(audit).status).toBe("blocked-integrity-failure");
  });

  it("3. 루트와 단절된 3노드 순환(A -> B -> C -> A)과 정상 노드가 섞여도 즉시 차단한다", () => {
    const audit = auditLayerTreeHygiene([
      makeNode({ id: "ok-1", rawName: "밑색 1", orderIndex: 0 }),
      makeNode({ id: "ok-2", rawName: "밑색 2", orderIndex: 1 }),
      makeNode({ id: "c1", parentId: "c3", kind: "folder", rawName: "순환1", nonEmptyTileCount: 0 }),
      makeNode({ id: "c2", parentId: "c1", kind: "folder", rawName: "순환2", nonEmptyTileCount: 0 }),
      makeNode({ id: "c3", parentId: "c2", kind: "folder", rawName: "순환3", nonEmptyTileCount: 0 }),
    ]);
    expect(audit.safeToCompile).toBe(false);
    const plan = compileLayerVramDietPlan(audit);
    expect(plan.status).toBe("blocked-integrity-failure");
    expect(plan.layerCountAfter).toBe(plan.layerCountBefore);
    expect(plan.decisions.every((d) => d.action === "blocked-integrity-failure")).toBe(true);
  });

  it("4. 존재하지 않는 부모를 참조하는 고아 노드(orphan-parent)를 검출하고 차단한다", () => {
    const audit = auditLayerTreeHygiene([
      makeNode({ id: "orphan-1", parentId: "missing-folder-99", rawName: "피부 채색" }),
    ]);
    expect(audit.integrityStatus).toBe("failed-closed");
    expect(audit.issues.some((i) => i.code === "orphan-parent")).toBe(true);
    expect(compileLayerVramDietPlan(audit).status).toBe("blocked-integrity-failure");
  });

  it("5. 폴더가 아닌 래스터를 부모로 지정한 구조(non-folder-parent)를 차단한다", () => {
    const audit = auditLayerTreeHygiene([
      makeNode({ id: "r-parent", kind: "raster", rawName: "03_FLAT_BASE_01" }),
      makeNode({ id: "r-child", parentId: "r-parent", kind: "raster", rawName: "03_FLAT_SUB_01" }),
    ]);
    expect(audit.safeToCompile).toBe(false);
    expect(audit.issues.some((i) => i.code === "non-folder-parent")).toBe(true);
  });

  it("6. 중복 레이어 ID(duplicate-node-id)를 fail-closed로 적발한다", () => {
    const audit = auditLayerTreeHygiene([
      makeNode({ id: "dup-1", rawName: "밑색 A", orderIndex: 0 }),
      makeNode({ id: "dup-1", rawName: "밑색 B", orderIndex: 1 }),
    ]);
    expect(audit.safeToCompile).toBe(false);
    expect(audit.issues.some((i) => i.code === "duplicate-node-id")).toBe(true);
  });
});

describe("Wave 117 — 한국 웹툰 스튜디오 표준 명명 정규화 및 진단", () => {
  it("7. 무의미한 한국어 어시스턴트 레이어명을 정확히 판별한다", () => {
    expect(isMeaninglessLayerName("레이어 1")).toBe(true);
    expect(isMeaninglessLayerName("복사본 복사본")).toBe(true);
    expect(isMeaninglessLayerName("새 레이어 2")).toBe(true);
    expect(isMeaninglessLayerName("무제")).toBe(true);
    expect(isMeaninglessLayerName("임시1")).toBe(true);
    expect(isMeaninglessLayerName("폴더 3")).toBe(true);
  });

  it("8. 영문 자동 생성 및 복사본 체인 레이어명을 정확히 판별한다", () => {
    expect(isMeaninglessLayerName("Layer 1 copy (2)")).toBe(true);
    expect(isMeaninglessLayerName("Copy of Layer 4")).toBe(true);
    expect(isMeaninglessLayerName("Untitled-1")).toBe(true);
    expect(isMeaninglessLayerName("Group 1 copy")).toBe(true);
    expect(isMeaninglessLayerName("   ")).toBe(true);
    expect(isMeaninglessLayerName("피부 복사본 (2)")).toBe(true);
  });

  it("9. 이미 표준 코드명을 따르는 레이어는 무의미 이름 경고를 내지 않고 원명을 유지한다", () => {
    expect(isCanonicalStudioLayerName("05_LINE_HERO_01")).toBe(true);
    expect(isCanonicalStudioLayerName("03_FLAT_주인공_피부")).toBe(true);
    expect(isMeaninglessLayerName("05_LINE_HERO_01")).toBe(false);

    const audit = auditLayerTreeHygiene([
      makeNode({ id: "l1", kind: "vector-line", rawName: "05_LINE_HERO_01", orderIndex: 0 }),
      makeNode({ id: "l2", kind: "raster", rawName: "03_FLAT_주인공_피부", orderIndex: 1 }),
    ]);
    expect(audit.meaninglessNameCount).toBe(0);
    expect(audit.renameMap[0].normalizedName).toBe("05_LINE_HERO_01");
    expect(audit.renameMap[0].reason).toBe("already-canonical");
    expect(audit.renameMap[1].normalizedName).toBe("03_FLAT_주인공_피부");
  });

  it("10. 9단계 스튜디오 역할 코드(01_GUIDE ~ 09_SFX) 전 범위를 정확히 자동 정규화한다", () => {
    const inputs: LayerTreeNodeInput[] = [
      makeNode({ id: "n1", orderIndex: 0, kind: "guide", rawName: "레이어 1", nonEmptyTileCount: 0 }),
      makeNode({ id: "n2", orderIndex: 1, kind: "bg3d-ref", rawName: "Layer 1 copy (2)" }),
      makeNode({ id: "n3", orderIndex: 2, kind: "raster", blendMode: "normal", rawName: "레이어 3" }),
      makeNode({ id: "n4", orderIndex: 3, kind: "raster", blendMode: "multiply", rawName: "복사본 복사본" }),
      makeNode({ id: "n5", orderIndex: 4, kind: "vector-line", rawName: "Layer 5 copy" }),
      makeNode({ id: "n6", orderIndex: 5, kind: "raster", blendMode: "add-glow", rawName: "레이어 6" }),
      makeNode({ id: "n7", orderIndex: 6, kind: "adjustment", rawName: "조정 레이어 1", nonEmptyTileCount: 0 }),
      makeNode({ id: "n8", orderIndex: 7, kind: "text-balloon", rawName: "말풍선 copy" }),
      makeNode({ id: "n9", orderIndex: 8, kind: "text-balloon", rawName: "효과음 쾅 사본" }),
    ];

    const audit = auditLayerTreeHygiene(inputs);
    const byId = new Map(audit.nodes.map((n) => [n.id, n]));

    expect(byId.get("n1")?.normalizedName.startsWith("01_GUIDE_")).toBe(true);
    expect(byId.get("n2")?.normalizedName.startsWith("02_BG3D_")).toBe(true);
    expect(byId.get("n3")?.normalizedName.startsWith("03_FLAT_")).toBe(true);
    expect(byId.get("n4")?.normalizedName.startsWith("04_SHADOW_")).toBe(true);
    expect(byId.get("n5")?.normalizedName.startsWith("05_LINE_")).toBe(true);
    expect(byId.get("n6")?.normalizedName.startsWith("06_LIGHT_")).toBe(true);
    expect(byId.get("n7")?.normalizedName.startsWith("07_EFFECT_")).toBe(true);
    expect(byId.get("n8")?.normalizedName.startsWith("08_BALLOON_")).toBe(true);
    expect(byId.get("n9")?.normalizedName.startsWith("09_SFX_")).toBe(true);
    expect(audit.meaninglessNameCount).toBe(9);
  });

  it("11. 같은 부모 폴더 안에서 동일 이름 충돌 시 _01, _02, _03으로 결정론적 비중복화한다", () => {
    const audit = auditLayerTreeHygiene([
      makeNode({ id: "a", orderIndex: 0, rawName: "레이어 1" }),
      makeNode({ id: "b", orderIndex: 1, rawName: "레이어 2" }),
      makeNode({ id: "c", orderIndex: 2, rawName: "Layer 3 copy" }),
    ]);
    const names = audit.nodes.map((n) => n.normalizedName);
    expect(new Set(names).size).toBe(3);
    expect(names).toEqual(["03_FLAT_BASE_01", "03_FLAT_BASE_02", "03_FLAT_BASE_03"]);
  });

  it("12. 폴더는 하위 자식 레이어의 다수결 역할을 추론해 표준 코드명을 부여한다", () => {
    const audit = auditLayerTreeHygiene([
      makeNode({ id: "fld-1", kind: "folder", rawName: "폴더 1", orderIndex: 0, nonEmptyTileCount: 0 }),
      makeNode({ id: "sh-1", parentId: "fld-1", blendMode: "multiply", rawName: "레이어 1", orderIndex: 0 }),
      makeNode({ id: "sh-2", parentId: "fld-1", blendMode: "multiply", rawName: "레이어 2", orderIndex: 1 }),
    ]);
    const folder = audit.nodes.find((n) => n.id === "fld-1");
    expect(folder?.inferredRole).toBe("shadow");
    expect(folder?.normalizedName).toBe("04_SHADOW_SHADE_GRP_01");
  });

  it("13. inferStudioLayerRole이 roleHint를 최우선으로 존중한다", () => {
    const role = inferStudioLayerRole(
      makeNode({ id: "hinted", rawName: "레이어 1", blendMode: "normal", roleHint: "sfx" }),
    );
    expect(role).toBe("sfx");
  });
});

describe("Wave 117 — 빈·숨김 대용량 레이어 및 클리핑 마스크 진단", () => {
  it("14. 빈 래스터(nonEmptyTileCount === 0)를 감지하고 안전하게 prune-empty-layer로 채택한다", () => {
    const audit = auditLayerTreeHygiene([
      makeNode({ id: "base", orderIndex: 0, rawName: "03_FLAT_BASE_01", nonEmptyTileCount: 30 }),
      makeNode({ id: "empty-vis", orderIndex: 1, rawName: "레이어 2", nonEmptyTileCount: 0, visible: true }),
      makeNode({ id: "empty-hid", orderIndex: 2, rawName: "레이어 3", nonEmptyTileCount: 0, visible: false }),
    ]);
    expect(audit.emptyLayerCount).toBe(2);

    const plan = compileLayerVramDietPlan(audit);
    expect(plan.prunedEmptyLayerCount).toBe(2);
    expect(plan.layerCountBefore).toBe(3);
    expect(plan.layerCountAfter).toBe(1);
    expect(plan.prunedLayers.map((p) => p.layerId)).toEqual(["empty-vis", "empty-hid"]);
  });

  it("15. 숨겨진 대용량 레이어(hidden-heavy-layer)를 적발하되 픽셀을 임의 삭제하지 않고 보호한다", () => {
    // 256*256*4 = 262,144B (0.25 MiB) -> 24 tiles = 6 MiB (>= 4 MiB 기본 임계치)
    const audit = auditLayerTreeHygiene([
      makeNode({ id: "vis-1", orderIndex: 0, rawName: "03_FLAT_CHAR_01", nonEmptyTileCount: 20, visible: true }),
      makeNode({ id: "hid-big", orderIndex: 1, rawName: "예전 채색 백업", nonEmptyTileCount: 24, visible: false }),
    ]);
    expect(audit.hiddenHeavyLayerCount).toBe(1);
    expect(audit.issues.some((i) => i.code === "hidden-heavy-layer" && i.layerId === "hid-big")).toBe(true);

    const plan = compileLayerVramDietPlan(audit);
    expect(plan.prunedEmptyLayerCount).toBe(0);
    expect(plan.mergedGroupCount).toBe(0);
    expect(plan.metrics.hiddenNonEmptyReclaimableVramBytes).toBe(24 * 256 * 256 * 4);
    expect(plan.decisions.find((d) => d.layerId === "hid-big")?.barrierReasons).toContain("hidden-nonempty-layer");
  });

  it("16. 루트 최하단(orderIndex 0)의 고아 클리핑 마스크(dangling-clip-mask)를 적발한다", () => {
    const audit = auditLayerTreeHygiene([
      makeNode({ id: "clip-orphan", orderIndex: 0, rawName: "명암", clippedToBelow: true }),
    ]);
    expect(audit.danglingClipMaskCount).toBe(1);
    expect(audit.issues.some((i) => i.code === "dangling-clip-mask" && i.layerId === "clip-orphan")).toBe(true);
  });

  it("17. 폴더 경계에서 베이스가 끊긴 클리핑 마스크(dangling-clip-mask)를 정확히 적발한다", () => {
    const audit = auditLayerTreeHygiene([
      makeNode({ id: "root-base", parentId: null, orderIndex: 0, rawName: "03_FLAT_BASE_01" }),
      makeNode({ id: "fld", parentId: null, orderIndex: 1, kind: "folder", rawName: "04_SHADOW_GRP", nonEmptyTileCount: 0 }),
      makeNode({ id: "in-folder-clip", parentId: "fld", orderIndex: 0, rawName: "04_SHADOW_CLIP_01", clippedToBelow: true }),
    ]);
    expect(audit.danglingClipMaskCount).toBe(1);
    expect(audit.issues.some((i) => i.code === "dangling-clip-mask" && i.layerId === "in-folder-clip")).toBe(true);
  });

  it("18. 가이드·조정 레이어·pass-through 폴더 위 클리핑은 유효 매트가 없어 dangling-clip-mask로 적발한다", () => {
    const audit = auditLayerTreeHygiene([
      makeNode({ id: "g1", orderIndex: 0, kind: "guide", rawName: "01_GUIDE_GRID", nonEmptyTileCount: 0 }),
      makeNode({ id: "c1", orderIndex: 1, kind: "raster", rawName: "04_SHADOW_A", clippedToBelow: true }),
      makeNode({ id: "f-pt", orderIndex: 2, kind: "folder", blendMode: "pass-through", rawName: "03_FLAT_GRP", nonEmptyTileCount: 0 }),
      makeNode({ id: "c2", orderIndex: 3, kind: "raster", rawName: "04_SHADOW_B", clippedToBelow: true }),
    ]);
    expect(audit.danglingClipMaskCount).toBe(2);
  });

  it("19. 빈 레이어 또는 빈 베이스에 걸린 중복 클리핑(redundant-clip-mask)을 적발한다", () => {
    const audit = auditLayerTreeHygiene([
      makeNode({ id: "empty-base", orderIndex: 0, rawName: "03_FLAT_EMPTY", nonEmptyTileCount: 0 }),
      makeNode({ id: "clip-on-empty", orderIndex: 1, rawName: "04_SHADOW_A", clippedToBelow: true, nonEmptyTileCount: 10 }),
      makeNode({ id: "solid-base", orderIndex: 2, rawName: "03_FLAT_SOLID", nonEmptyTileCount: 25 }),
      makeNode({ id: "empty-clip", orderIndex: 3, rawName: "04_SHADOW_EMPTY", clippedToBelow: true, nonEmptyTileCount: 0 }),
    ]);
    expect(audit.redundantClipMaskCount).toBe(2);
    // 클리핑 베이스로 쓰인 empty-base와 clippedToBelow인 empty-clip 모두 안전 장벽으로 보존된다
    const plan = compileLayerVramDietPlan(audit);
    expect(plan.prunedEmptyLayerCount).toBe(0);
  });
});

describe("Wave 117 — 합성 대수 불변식 안전 장벽 (Safety Barriers)", () => {
  it("20. locked: true 레이어는 인접 동종 래스터 병합과 빈 레이어 정리 모두에서 절대 차단된다", () => {
    const audit = auditLayerTreeHygiene([
      makeNode({ id: "flat-1", orderIndex: 0, rawName: "03_FLAT_SKIN_01", locked: true }),
      makeNode({ id: "flat-2", orderIndex: 1, rawName: "03_FLAT_SKIN_02", locked: false }),
      makeNode({ id: "locked-empty", orderIndex: 2, rawName: "03_FLAT_KEEP", locked: true, nonEmptyTileCount: 0 }),
    ]);
    const plan = compileLayerVramDietPlan(audit);
    expect(plan.mergedGroupCount).toBe(0);
    expect(plan.prunedEmptyLayerCount).toBe(0);
    expect(plan.blockedBarriers.some((b) => b.layerId === "flat-1" && b.reasonCode === "locked-layer")).toBe(true);
    expect(plan.blockedBarriers.some((b) => b.layerId === "locked-empty" && b.reasonCode === "locked-layer")).toBe(true);
  });

  it("21. 비파괴 5종(guide, text-balloon, bg3d-ref, vector-line, adjustment)은 절대 래스터 병합되지 않는다", () => {
    const audit = auditLayerTreeHygiene([
      makeNode({ id: "k1", orderIndex: 0, kind: "guide", rawName: "01_GUIDE_01", nonEmptyTileCount: 0 }),
      makeNode({ id: "k2", orderIndex: 1, kind: "bg3d-ref", rawName: "02_BG3D_01" }),
      makeNode({ id: "k3", orderIndex: 2, kind: "bg3d-ref", rawName: "02_BG3D_02" }),
      makeNode({ id: "k4", orderIndex: 3, kind: "vector-line", rawName: "05_LINE_01" }),
      makeNode({ id: "k5", orderIndex: 4, kind: "vector-line", rawName: "05_LINE_02" }),
      makeNode({ id: "k6", orderIndex: 5, kind: "adjustment", rawName: "07_EFFECT_TONE", nonEmptyTileCount: 0 }),
      makeNode({ id: "k7", orderIndex: 6, kind: "text-balloon", rawName: "08_BALLOON_01" }),
      makeNode({ id: "k8", orderIndex: 7, kind: "text-balloon", rawName: "08_BALLOON_02" }),
    ]);
    const plan = compileLayerVramDietPlan(audit);
    expect(plan.mergedGroupCount).toBe(0);
    expect(plan.prunedEmptyLayerCount).toBe(0);
    expect(plan.layerCountAfter).toBe(8);
    expect(plan.protectedBarrierLayerCount).toBe(8);
  });

  it("22. 클리핑 베이스 레이어와 상위 클리핑 레이어 경계는 인접 동종 normal 래스터라도 병합을 차단한다", () => {
    const audit = auditLayerTreeHygiene([
      makeNode({ id: "flat-before", orderIndex: 0, rawName: "03_FLAT_A" }),
      makeNode({ id: "clip-base", orderIndex: 1, rawName: "03_FLAT_BASE" }),
      makeNode({ id: "clip-child", orderIndex: 2, rawName: "03_FLAT_DETAIL", clippedToBelow: true }),
      makeNode({ id: "flat-after", orderIndex: 3, rawName: "03_FLAT_B" }),
    ]);
    const plan = compileLayerVramDietPlan(audit);
    expect(plan.mergedGroupCount).toBe(0);
    expect(plan.blockedBarriers.some((b) => b.layerId === "clip-base" && b.reasonCode === "clip-chain-base")).toBe(true);
    expect(plan.blockedBarriers.some((b) => b.layerId === "clip-child" && b.reasonCode === "clipped-layer")).toBe(true);
  });

  it("23. 비결합 블렌드 모드 쌍(multiply+screen, overlay+normal, add-glow+normal, multiply+multiply)을 수학적 사유와 함께 차단한다", () => {
    const audit = auditLayerTreeHygiene([
      makeNode({ id: "b1", orderIndex: 0, blendMode: "multiply", rawName: "04_SHADOW_01", roleHint: "shadow" }),
      makeNode({ id: "b2", orderIndex: 1, blendMode: "multiply", rawName: "04_SHADOW_02", roleHint: "shadow" }),
      makeNode({ id: "b3", orderIndex: 2, blendMode: "screen", rawName: "06_LIGHT_01", roleHint: "light" }),
      makeNode({ id: "b4", orderIndex: 3, blendMode: "overlay", rawName: "07_EFFECT_01", roleHint: "effect" }),
      makeNode({ id: "b5", orderIndex: 4, blendMode: "normal", rawName: "07_EFFECT_02", roleHint: "effect" }),
      makeNode({ id: "b6", orderIndex: 5, blendMode: "add-glow", rawName: "06_LIGHT_02", roleHint: "light" }),
    ]);
    const plan = compileLayerVramDietPlan(audit);
    expect(plan.mergedGroupCount).toBe(0);
    const blendBarriers = plan.blockedBarriers.filter((b) => b.reasonCode === "non-normal-blend-mode");
    expect(blendBarriers.length).toBeGreaterThanOrEqual(5);
    expect(blendBarriers.some((b) => b.mathematicalReasonKo.includes("multiply + screen"))).toBe(true);
    expect(blendBarriers.some((b) => b.mathematicalReasonKo.includes("overlay + normal"))).toBe(true);
  });

  it("24. 중간 부분 불투명도(opacity < 1)가 끼면 인접 normal 래스터라도 병합을 차단한다", () => {
    const audit = auditLayerTreeHygiene([
      makeNode({ id: "o1", orderIndex: 0, rawName: "03_FLAT_01", opacity: 1 }),
      makeNode({ id: "o2", orderIndex: 1, rawName: "03_FLAT_02", opacity: 0.72 }),
      makeNode({ id: "o3", orderIndex: 2, rawName: "03_FLAT_03", opacity: 1 }),
    ]);
    const plan = compileLayerVramDietPlan(audit);
    expect(plan.mergedGroupCount).toBe(0);
    expect(plan.blockedBarriers.some((b) => b.layerId === "o2" && b.reasonCode === "partial-opacity")).toBe(true);
  });

  it("25. 서로 다른 스튜디오 역할(flat vs shadow) 또는 다른 폴더 경계는 병합을 차단한다", () => {
    const audit = auditLayerTreeHygiene([
      makeNode({ id: "f1", kind: "folder", orderIndex: 0, rawName: "03_FLAT_GRP_A", nonEmptyTileCount: 0 }),
      makeNode({ id: "a1", parentId: "f1", orderIndex: 0, rawName: "03_FLAT_SKIN_01", roleHint: "flat" }),
      makeNode({ id: "a2", parentId: "f1", orderIndex: 1, rawName: "04_SHADOW_SKIN_01", roleHint: "shadow" }),
      makeNode({ id: "f2", kind: "folder", orderIndex: 1, rawName: "03_FLAT_GRP_B", nonEmptyTileCount: 0 }),
      makeNode({ id: "b1", parentId: "f2", orderIndex: 0, rawName: "03_FLAT_HAIR_01", roleHint: "flat" }),
    ]);
    const plan = compileLayerVramDietPlan(audit);
    expect(plan.mergedGroupCount).toBe(0);
    expect(plan.blockedBarriers.some((b) => b.reasonCode === "different-role")).toBe(true);
  });

  it("26. 타일 규격이나 픽셀당 바이트(bytesPerPixel 4 vs 8)가 다르면 손실 방지를 위해 병합을 차단한다", () => {
    const audit = auditLayerTreeHygiene([
      makeNode({ id: "p8", orderIndex: 0, rawName: "03_FLAT_RGBA8", bytesPerPixel: 4, tileSizePx: 256 }),
      makeNode({ id: "p16", orderIndex: 1, rawName: "03_FLAT_RGBA16", bytesPerPixel: 8, tileSizePx: 256 }),
    ]);
    const plan = compileLayerVramDietPlan(audit);
    expect(plan.mergedGroupCount).toBe(0);
    expect(plan.blockedBarriers.some((b) => b.reasonCode === "mismatched-pixel-format")).toBe(true);
  });
});

describe("Wave 117 — 안전 무손실 병합 · 타일-희소 VRAM/OPFS 정밀도 · 수치 방어", () => {
  it("27. 동일 폴더·동일 역할 연속 normal(opacity=1) 래스터 3개를 단일 safe-lossless-merge로 합친다", () => {
    const audit = auditLayerTreeHygiene([
      makeNode({ id: "f1", orderIndex: 0, rawName: "피부 밑색", nonEmptyTileCount: 50, totalTileCount: 100 }),
      makeNode({ id: "f2", orderIndex: 1, rawName: "옷 밑색", nonEmptyTileCount: 50, totalTileCount: 100 }),
      makeNode({ id: "f3", orderIndex: 2, rawName: "머리 밑색", nonEmptyTileCount: 50, totalTileCount: 100 }),
    ]);
    const plan = compileLayerVramDietPlan(audit);
    expect(plan.status).toBe("optimized");
    expect(plan.mergedGroupCount).toBe(1);
    expect(plan.layerCountBefore).toBe(3);
    expect(plan.layerCountAfter).toBe(1);
    expect(plan.mergeGroups[0].sourceLayerIds).toEqual(["f1", "f2", "f3"]);
    expect(plan.mergeGroups[0].beforeTileCount).toBe(150);
    // 100 * (1 - 0.5^3) = 87.5 -> 88 tiles
    expect(plan.mergeGroups[0].afterTileCount).toBe(88);
    expect(plan.mergeGroups[0].savedTileCount).toBe(62);
    expect(plan.metrics.optimizedVramBytes).toBeLessThan(plan.metrics.sparseVramBytes);
    expect(plan.metrics.sparseVramBytes).toBeLessThan(plan.metrics.denseVramBytes);
    expect(plan.metrics.opfsAfterBytes).toBeLessThan(plan.metrics.opfsBeforeBytes);
  });

  it("28. 두 동종 래스터 사이의 빈 레이어는 정리 후 안전 병합되고, 숨김 비공백 레이어는 병합 구간을 분리한다", () => {
    const audit = auditLayerTreeHygiene([
      makeNode({ id: "a1", orderIndex: 0, rawName: "03_FLAT_A1", nonEmptyTileCount: 40 }),
      makeNode({ id: "empty-mid", orderIndex: 1, rawName: "레이어 2", nonEmptyTileCount: 0 }),
      makeNode({ id: "a2", orderIndex: 2, rawName: "03_FLAT_A2", nonEmptyTileCount: 40 }),
      makeNode({ id: "hidden-wall", orderIndex: 3, rawName: "03_FLAT_WALL", nonEmptyTileCount: 10, visible: false }),
      makeNode({ id: "a3", orderIndex: 4, rawName: "03_FLAT_A3", nonEmptyTileCount: 40 }),
    ]);
    const plan = compileLayerVramDietPlan(audit);
    expect(plan.prunedEmptyLayerCount).toBe(1);
    expect(plan.mergedGroupCount).toBe(1);
    expect(plan.mergeGroups[0].sourceLayerIds).toEqual(["a1", "a2"]);
    expect(plan.decisions.find((d) => d.layerId === "a3")?.action).toBe("keep-preserved");
  });

  it("29. exact activeTileIndices가 주어지면 타일 합집합과 알파 마스크 평면 절감 바이트를 정확히 계산한다", () => {
    const audit = auditLayerTreeHygiene([
      makeNode({
        id: "t1",
        orderIndex: 0,
        rawName: "03_FLAT_T1",
        totalTileCount: 64,
        nonEmptyTileCount: 4,
        activeTileIndices: [0, 1, 2, 3],
        hasAlphaMask: true, // 4+1 = 5 Bpp -> 4 * 65536 * 5 = 1,310,720
      }),
      makeNode({
        id: "t2",
        orderIndex: 1,
        rawName: "03_FLAT_T2",
        totalTileCount: 64,
        nonEmptyTileCount: 4,
        activeTileIndices: [2, 3, 4, 5],
        hasAlphaMask: false, // 4 Bpp -> 4 * 65536 * 4 = 1,048,576
      }),
    ]);
    const plan = compileLayerVramDietPlan(audit);
    expect(plan.mergedGroupCount).toBe(1);
    expect(plan.mergeGroups[0].tileOverlapMode).toBe("exact-tile-set");
    // 합집합 {0,1,2,3,4,5} = 6 타일, RGBA8 4Bpp = 6 * 262,144 = 1,572,864
    expect(plan.mergeGroups[0].afterTileCount).toBe(6);
    expect(plan.metrics.sparseVramBytes).toBe(4 * 65536 * 5 + 4 * 65536 * 4);
    expect(plan.metrics.optimizedVramBytes).toBe(6 * 65536 * 4);
    expect(plan.metrics.dietMergeSavingsBytes).toBe(plan.metrics.sparseVramBytes - 6 * 65536 * 4);
  });

  it("30. NaN·Infinity·음수 타일·범위 초과 불투명도를 안전 보정하고 NaN 전파 0건을 보장한다", () => {
    const audit = auditLayerTreeHygiene([
      makeNode({
        id: "bad-num",
        orderIndex: Number.NaN,
        rawName: "03_FLAT_BAD",
        opacity: Number.POSITIVE_INFINITY,
        nonEmptyTileCount: 500,
        totalTileCount: 100,
        tileSizePx: -64,
        bytesPerPixel: Number.NaN,
      }),
    ]);
    expect(audit.issues.some((i) => i.code === "invalid-numeric-metadata")).toBe(true);
    const plan = compileLayerVramDietPlan(audit);
    expect(Number.isFinite(plan.metrics.denseVramBytes)).toBe(true);
    expect(Number.isFinite(plan.metrics.sparseVramBytes)).toBe(true);
    expect(Number.isFinite(plan.metrics.optimizedVramBytes)).toBe(true);
    expect(Number.isFinite(plan.metrics.totalSavingsFromDensePercent)).toBe(true);
    expect(audit.nodes[0].nonEmptyTileCount).toBe(100);
  });
});

describe("Wave 117 — NIST FIPS 180-4 SHA-256 · 매니페스트 결정론 · OKLCH SVG · 한국어 보고서", () => {
  it("31. 순수 ES2017 SHA-256이 NIST FIPS 180-4 표준 테스트 벡터와 한글 UTF-8에서 정확히 일치한다", () => {
    expect(sha256LayerManifestHex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(sha256LayerManifestHex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(
      sha256LayerManifestHex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"),
    ).toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
    const koHash = sha256LayerManifestHex("툰스튜디오-웨이브117-레이어다이어트");
    expect(koHash).toMatch(/^[0-9a-f]{64}$/);
    expect(koHash).toBe(sha256LayerManifestHex("툰스튜디오-웨이브117-레이어다이어트"));
    expect(canonicalizeLayerManifestJson({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
  });

  it("32. 매니페스트 SHA-256은 입력 배열 순서가 바뀌어도 결정론적으로 동일하며 최적화 전/후 변화를 구분한다", () => {
    const n1 = makeNode({ id: "l-a", orderIndex: 0, rawName: "레이어 1", nonEmptyTileCount: 50 });
    const n2 = makeNode({ id: "l-b", orderIndex: 1, rawName: "Layer 2 copy", nonEmptyTileCount: 50 });
    const n3 = makeNode({ id: "l-c", orderIndex: 2, kind: "vector-line", rawName: "선화", nonEmptyTileCount: 20 });

    const planA = compileLayerVramDietPlan(auditLayerTreeHygiene([n1, n2, n3], { documentId: "ep117" }));
    const planB = compileLayerVramDietPlan(auditLayerTreeHygiene([n3, n1, n2], { documentId: "ep117" }));

    expect(planA.beforeManifestSha256).toBe(planB.beforeManifestSha256);
    expect(planA.afterManifestSha256).toBe(planB.afterManifestSha256);
    expect(planA.beforeManifestSha256).not.toBe(planA.afterManifestSha256);
    expect(planA.beforeManifestSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(planA.afterManifestSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("33. 인쇄 안전 OKLCH SVG가 라이트/다크 테마 모두 순수 oklch만 사용하고 NaN·Infinity·원시 색상이 0건이다", () => {
    const audit = auditLayerTreeHygiene(
      [
        makeNode({ id: "g", orderIndex: 0, kind: "guide", rawName: "콘티", nonEmptyTileCount: 0 }),
        makeNode({ id: "f1", orderIndex: 1, rawName: "레이어 1", nonEmptyTileCount: 55 }),
        makeNode({ id: "f2", orderIndex: 2, rawName: "Layer 1 copy (2)", nonEmptyTileCount: 45 }),
        makeNode({ id: "e1", orderIndex: 3, rawName: "복사본 복사본", nonEmptyTileCount: 0 }),
        makeNode({ id: "s1", orderIndex: 4, blendMode: "multiply", rawName: "명암", nonEmptyTileCount: 30 }),
        makeNode({ id: "ln", orderIndex: 5, kind: "vector-line", locked: true, rawName: "선화", nonEmptyTileCount: 22 }),
      ],
      { documentId: "ep117-ch04" },
    );
    const plan = compileLayerVramDietPlan(audit);

    const rawHexRegex = new RegExp("#[0-9a-fA-F]{3,8}\\b");
    const rawFnRegex = new RegExp("\\b(?:rgba?|hsla?)\\s*\\(", "i");

    for (const theme of ["light", "dark"] as const) {
      const svg = renderLayerTreeHygieneSvg(audit, plan, { theme });
      expect(svg.startsWith("<svg ")).toBe(true);
      expect(svg.endsWith("</svg>")).toBe(true);
      expect(svg).toContain("oklch(");
      expect(rawHexRegex.test(svg)).toBe(false);
      expect(rawFnRegex.test(svg)).toBe(false);
      expect(svg).not.toContain("NaN");
      expect(svg).not.toContain("Infinity");
    }
  });

  it("34. SVG 렌더링과 escapeXmlText가 XSS 및 XML 특수문자(<, >, &, \", ')를 완전히 이스케이프한다", () => {
    const xssPayload = `<script>alert("xss")</script> & 'quote'`;
    expect(escapeXmlText(xssPayload)).toBe(
      "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; &apos;quote&apos;",
    );

    const audit = auditLayerTreeHygiene(
      [makeNode({ id: "xss-1", rawName: xssPayload, nonEmptyTileCount: 12 })],
      { documentId: `doc<1>&"2"` },
    );
    const plan = compileLayerVramDietPlan(audit);
    const svg = renderLayerTreeHygieneSvg(audit, plan, { title: `제목 ${xssPayload}` });

    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).toContain("&amp;");
    expect(svg).toContain("&quot;");
    expect(svg).toContain("&apos;");
  });

  it("35. 한국어 어시스턴트 인계 QA 보고서가 정상·정리권장·차단 판정을 구분하고 번역투를 배제한다", () => {
    const cleanAudit = auditLayerTreeHygiene(
      [
        makeNode({ id: "c1", orderIndex: 0, kind: "vector-line", locked: true, rawName: "05_LINE_HERO_01", nonEmptyTileCount: 25 }),
      ],
      { documentId: "ep117-clean" },
    );
    const cleanPlan = compileLayerVramDietPlan(cleanAudit);
    const cleanReport = summarizeLayerTreeHygieneKo(cleanAudit, cleanPlan);
    expect(cleanReport.verdict).toBe("ready");
    expect(cleanReport.verdictLabelKo).toBe("인계 가능");

    const messyAudit = auditLayerTreeHygiene(
      [
        makeNode({ id: "m1", orderIndex: 0, rawName: "레이어 1", nonEmptyTileCount: 50 }),
        makeNode({ id: "m2", orderIndex: 1, rawName: "Layer 1 copy (2)", nonEmptyTileCount: 50 }),
        makeNode({ id: "m3", orderIndex: 2, rawName: "빈 레이어", nonEmptyTileCount: 0 }),
      ],
      { documentId: "ep117-messy" },
    );
    const messyReport = summarizeLayerTreeHygieneKo(messyAudit, compileLayerVramDietPlan(messyAudit));
    expect(messyReport.verdict).toBe("needs-attention");
    expect(messyReport.verdictLabelKo).toBe("정리 권장");

    const brokenAudit = auditLayerTreeHygiene(
      [makeNode({ id: "cyc", parentId: "cyc", kind: "folder", rawName: "순환", nonEmptyTileCount: 0 })],
      { documentId: "ep117-broken" },
    );
    const brokenReport = summarizeLayerTreeHygieneKo(brokenAudit, compileLayerVramDietPlan(brokenAudit));
    expect(brokenReport.verdict).toBe("blocked");
    expect(brokenReport.verdictLabelKo).toBe("즉시 차단");

    const forbiddenTranslationese = [
      "하는 것을 가능하게",
      "직관적인 경험을 제공",
      "원활한 워크플로우를 보장",
    ];
    for (const report of [cleanReport, messyReport, brokenReport]) {
      for (const phrase of forbiddenTranslationese) {
        expect(report.fullTextKo).not.toContain(phrase);
      }
    }
  });
});
