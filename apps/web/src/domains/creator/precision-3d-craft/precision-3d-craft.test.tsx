// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PRECISION_PBR_MATERIAL_PRESETS,
  StudioPrecision3dCraftPanel,
  applyPrecisionTopologyAutoSnap,
  auditPrecisionMeshTopology,
  evaluatePrecisionGlbBudget,
  generateCustomPrecisionAssetSpec,
  validatePrecisionRigAssembly,
  type CustomPrecisionAssetSpec,
  type PrecisionMeshTopologyInput,
} from "./index";

afterEach(cleanup);

describe("precision-3d-mesh-quality-engine (매니폴드 0 · 베벨 · SubD · PBR · 리깅 · GLB 예산)", () => {
  it("비매니폴드 0 · 루즈 0 · 0면적 0 · 바닥 접지(Y=0) · 미터(1.0=1m) 메시를 히어로 합격 판정한다", () => {
    const cleanMesh: PrecisionMeshTopologyInput = {
      meshName: "atelier_cafe_counter_v1",
      vertexCount: 5400,
      triangleCount: 9800,
      quadRatio: 0.96,
      nonManifoldEdges: 0,
      boundaryEdges: 0,
      looseVertices: 0,
      zeroAreaTriangles: 0,
      minY: 0,
      unitScaleMeters: 1,
      boundingBoxMeters: [2.4, 1.05, 0.85],
    };

    const report = auditPrecisionMeshTopology(cleanMesh);
    expect(report.passed).toBe(true);
    expect(report.grade).toBe("hero-ready");
    expect(report.score).toBe(100);
    expect(report.isManifoldClean).toBe(true);
    expect(report.isWatertight).toBe(true);
    expect(report.isFloorGrounded).toBe(true);
    expect(report.isMetricScaleValid).toBe(true);
    expect(report.repairPlanKo).toHaveLength(0);
  });

  it("결함 메시의 비매니폴드·루즈·0면적·접지 오차·단위 불일치를 정확히 진단하고 1클릭 자동 스냅으로 복구한다", () => {
    const brokenMesh: PrecisionMeshTopologyInput = {
      meshName: "imported_cm_chair",
      vertexCount: 2400,
      triangleCount: 4100,
      quadRatio: 0.58,
      nonManifoldEdges: 4,
      boundaryEdges: 6,
      looseVertices: 3,
      zeroAreaTriangles: 2,
      minY: 0.125,
      unitScaleMeters: 0.01,
      boundingBoxMeters: [0.6, 0.9, 0.6],
    };

    const before = auditPrecisionMeshTopology(brokenMesh);
    expect(before.passed).toBe(false);
    expect(before.grade).toBe("blocked");
    expect(before.isManifoldClean).toBe(false);
    expect(before.isFloorGrounded).toBe(false);
    expect(before.isMetricScaleValid).toBe(false);
    expect(before.floorSnapDeltaY).toBe(-0.125);
    expect(before.recommendedScaleFactor).toBe(100);
    expect(before.repairPlanKo.length).toBeGreaterThanOrEqual(5);

    const snapped = applyPrecisionTopologyAutoSnap(brokenMesh);
    const after = auditPrecisionMeshTopology(snapped);
    expect(after.passed).toBe(true);
    expect(after.grade).toBe("hero-ready");
    expect(after.isManifoldClean).toBe(true);
    expect(after.isFloorGrounded).toBe(true);
    expect(after.isMetricScaleValid).toBe(true);
    expect(after.score).toBe(100);
  });

  it("물리 PBR 4종 재질은 모두 이진 금속도(0 또는 1)와 coat/sheen/roughness 정밀 수치를 준수한다", () => {
    const presets = Object.values(PRECISION_PBR_MATERIAL_PRESETS);
    expect(presets).toHaveLength(4);
    for (const preset of presets) {
      expect([0, 1]).toContain(preset.metallic);
      expect(preset.roughness).toBeGreaterThanOrEqual(0);
      expect(preset.roughness).toBeLessThanOrEqual(1);
      expect(preset.coat).toBeGreaterThanOrEqual(0);
      expect(preset.sheen).toBeGreaterThanOrEqual(0);
      expect(preset.aoStrength).toBeGreaterThan(0);
      expect(preset.normalStrength).toBeGreaterThan(0);
    }
    expect(PRECISION_PBR_MATERIAL_PRESETS["brushed-brass"].metallic).toBe(1);
    expect(PRECISION_PBR_MATERIAL_PRESETS["ceramic-glaze"].metallic).toBe(0);
    expect(PRECISION_PBR_MATERIAL_PRESETS["ceramic-glaze"].coat).toBeGreaterThan(0.8);
    expect(PRECISION_PBR_MATERIAL_PRESETS["matte-fabric"].sheen).toBeGreaterThan(0.7);
  });

  it("파라메트릭 빌더가 마이크로 베벨(1-2)·SubD·NPR 선화·GLB 경량 예산을 정확히 계산한다", () => {
    const mobileLight = generateCustomPrecisionAssetSpec({
      archetypeId: "atelier-ceramic-vase",
      materialPresetId: "ceramic-glaze",
      lightingPresetId: "studio-neutral-ao",
      microBevelSegments: 1,
      microBevelWidthMm: 1.4,
      subdLevel: 1,
      weightedNormalChamfer: true,
      nprOutlineWidthPx: 1.2,
      nprCreaseAngleDeg: 35,
      nprCreaseWeight: 0.8,
      targetProfile: "mobile-hero@1",
    });

    expect(mobileLight.geometry.microBevelSegments).toBe(1);
    expect(mobileLight.topologyAudit.passed).toBe(true);
    expect(mobileLight.rigAssembly.passed).toBe(true);
    expect(mobileLight.glbBudget.passed).toBe(true);
    expect(mobileLight.nprPreset.outlineWidthPx).toBe(1.2);

    const heavySubd = generateCustomPrecisionAssetSpec({
      archetypeId: "rofan-brass-chandelier",
      materialPresetId: "brushed-brass",
      lightingPresetId: "rofan-candle-warm",
      microBevelSegments: 2,
      microBevelWidthMm: 2.2,
      subdLevel: 3,
      weightedNormalChamfer: true,
      nprOutlineWidthPx: 2.8,
      nprCreaseAngleDeg: 42,
      nprCreaseWeight: 0.65,
      targetProfile: "mobile-hero@1",
    });

    expect(heavySubd.geometry.estimatedTriangles).toBeGreaterThan(mobileLight.geometry.estimatedTriangles);
    expect(heavySubd.glbBudget.passed).toBe(false);
    expect(heavySubd.glbBudget.violationsKo.length).toBeGreaterThan(0);

    const desktopOk = evaluatePrecisionGlbBudget(
      {
        triangles: 48_000,
        estimatedBytes: 4_200_000,
        drawCalls: 4,
        materials: 3,
        textureSize: 2048,
      },
      "desktop-hero@1",
    );
    expect(desktopOk.passed).toBe(true);
    expect(desktopOk.score).toBeGreaterThanOrEqual(85);
  });

  it("리깅/소품 소켓 조립 검증기가 고아·순환·음수 스케일·바닥 관통을 탐지한다", () => {
    const invalidRig = validatePrecisionRigAssembly([
      { id: "root", labelKo: "루트", parentId: null, localPositionMeters: [0, 0, 0], scale: [1, 1, 1], allowPropSnap: false },
      { id: "orphan", labelKo: "고아", parentId: "missing_parent", localPositionMeters: [0, 0.5, 0], scale: [1, 1, 1], allowPropSnap: true },
      { id: "cyc_a", labelKo: "순환A", parentId: "cyc_b", localPositionMeters: [0, 0.5, 0], scale: [-1, 1, 1], allowPropSnap: true },
      { id: "cyc_b", labelKo: "순환B", parentId: "cyc_a", localPositionMeters: [0, -0.2, 0], scale: [1, 1, 1], allowPropSnap: true },
    ]);

    expect(invalidRig.passed).toBe(false);
    expect(invalidRig.orphanSocketIds).toContain("orphan");
    expect(invalidRig.cyclicSocketIds).toEqual(expect.arrayContaining(["cyc_a", "cyc_b"]));
    expect(invalidRig.negativeScaleSocketIds).toContain("cyc_a");
    expect(invalidRig.belowFloorSocketIds).toContain("cyc_b");
  });
});

describe("StudioPrecision3dCraftPanel (3D 정밀 모델링 스튜디오 패널 UI)", () => {
  it("tool-bg3d.webp 스프라이트 · 매니폴드 신호등 · PBR 4종 · SubD 예산 경고를 인터랙티브하게 표시한다", () => {
    const onApplySpec = vi.fn<(spec: CustomPrecisionAssetSpec) => void>();
    render(<StudioPrecision3dCraftPanel onApplySpec={onApplySpec} />);

    const spriteImg = document.querySelector('img[src="/assets/studio/vibrant-sprites/tool-bg3d.webp"]');
    expect(spriteImg).toBeTruthy();
    expect(screen.getByTestId("p3d-manifold-traffic-badge").textContent).toContain("매니폴드 0 · 히어로 합격");

    // 브러시드 황동 선택 -> Metallic 1 표시 확인
    fireEvent.click(screen.getByTestId("p3d-material-brushed-brass"));
    expect(screen.getByTestId("p3d-pbr-readout").textContent).toContain("Metallic 1");

    // 모바일 프로파일에서 SubD 3 선택 -> GLB 예산 초과 경고 노출
    fireEvent.click(screen.getByTestId("p3d-subd-3"));
    expect(screen.getByTestId("p3d-glb-budget-alert")).toBeTruthy();

    // SubD 1로 복귀 + 웹툰 NPR 선화 두께 조정 후 적용 콜백 검증
    fireEvent.click(screen.getByTestId("p3d-subd-1"));
    expect(screen.queryByTestId("p3d-glb-budget-alert")).toBeNull();
    fireEvent.change(screen.getByTestId("p3d-npr-outline-slider"), { target: { value: "2.4" } });
    fireEvent.click(screen.getByTestId("p3d-apply-spec-btn"));

    expect(onApplySpec).toHaveBeenCalledTimes(1);
    expect(onApplySpec.mock.calls[0]?.[0].material.id).toBe("brushed-brass");
    expect(onApplySpec.mock.calls[0]?.[0].nprPreset.outlineWidthPx).toBe(2.4);
    expect(screen.getByTestId("p3d-apply-status")).toBeTruthy();
  });

  it("결함 메시 주입 시 자동 보정·바닥 접지(Y=0) 버튼으로 즉시 합격 복구한다", () => {
    render(
      <StudioPrecision3dCraftPanel
        inspectedMeshOverride={{
          nonManifoldEdges: 3,
          looseVertices: 2,
          zeroAreaTriangles: 1,
          minY: 0.25,
          unitScaleMeters: 0.01,
        }}
      />,
    );

    expect(screen.getByTestId("p3d-manifold-traffic-badge").textContent).toContain("정밀 보정 필요");
    fireEvent.click(screen.getByTestId("p3d-auto-repair-btn"));
    expect(screen.getByTestId("p3d-manifold-traffic-badge").textContent).toContain("매니폴드 0 · 히어로 합격");
    expect(screen.queryByTestId("p3d-auto-repair-btn")).toBeNull();
  });

  it("스프라이트 실파일 존재 · 원시 HEX/RGB 0건 · 저장소 직접 호출 0건 · 44px · keep-all 계약을 지킨다", () => {
    const spriteFile = resolve(process.cwd(), "apps/web/public/assets/studio/vibrant-sprites/tool-bg3d.webp");
    const aiSpriteFile = resolve(process.cwd(), "apps/web/public/assets/studio/vibrant-sprites/tool-ai-compass.webp");
    expect(existsSync(spriteFile)).toBe(true);
    expect(existsSync(aiSpriteFile)).toBe(true);

    const cssPath = resolve(process.cwd(), "apps/web/src/domains/creator/precision-3d-craft/precision-3d-craft.css");
    const tsxPath = resolve(process.cwd(), "apps/web/src/domains/creator/precision-3d-craft/StudioPrecision3dCraftPanel.tsx");
    const enginePath = resolve(process.cwd(), "apps/web/src/domains/creator/precision-3d-craft/precision-3d-mesh-quality-engine.ts");
    const css = readFileSync(cssPath, "utf8");
    const tsx = readFileSync(tsxPath, "utf8");
    const engine = readFileSync(enginePath, "utf8");

    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
    expect(css).not.toMatch(/\brgba?\(/u);
    expect(css).not.toMatch(/transition\s*:\s*all/u);
    expect(css).toContain("min-height: 44px");
    expect(css).toContain("word-break: keep-all");
    expect(css).toContain("tabular-nums");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("forced-colors: active");

    expect(tsx).not.toMatch(/\b(localStorage|sessionStorage|indexedDB)\b/u);
    expect(engine).not.toMatch(/\b(localStorage|sessionStorage|indexedDB)\b/u);
    expect(tsx).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
  });
});
