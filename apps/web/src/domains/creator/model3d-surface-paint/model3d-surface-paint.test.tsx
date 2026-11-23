// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Model3dSurfacePaintPanel } from "./Model3dSurfacePaintPanel";
import {
  applyPresetStampToTextureLayer,
  auditUvMeshIntegrity,
  buildUvPropBoxMesh,
  buildUvSphereHeadMesh,
  buildUvTorsoArmorMesh,
  clearSingleTextureLayer,
  composite3dTextureStack,
  createDefault3dTextureStack,
  createPerspectiveRayFromViewport,
  exportBakedUvSheetPng,
  paintBrushDabOnTextureLayer,
  paintBrushStrokeOnTextureLayer,
  rasterizeTexturedMeshPreview,
  raycastMeshToUv,
  type BakedUvSheetPng,
  type TextureLayer3d,
} from "./uv-raycast-surface-painter";

afterEach(cleanup);

function makeSolidLayer(
  role: TextureLayer3d["role"],
  texSize: number,
  rgba: readonly [number, number, number, number],
  overrides: Partial<Pick<TextureLayer3d, "visible" | "opacity" | "blendMode">> = {},
): TextureLayer3d {
  const buf = new Uint8ClampedArray(texSize * texSize * 4);
  for (let i = 0; i < texSize * texSize; i += 1) {
    buf[i * 4] = rgba[0];
    buf[i * 4 + 1] = rgba[1];
    buf[i * 4 + 2] = rgba[2];
    buf[i * 4 + 3] = rgba[3];
  }
  return {
    id: `test-${role}`,
    role,
    nameKo: role,
    nameEn: role,
    visible: overrides.visible ?? true,
    opacity: overrides.opacity ?? 1,
    blendMode: overrides.blendMode ?? "normal",
    rgba: buf,
  };
}

describe("3종 클린 매니폴드 UV 메쉬 무결성 및 UV [0,1] 경계 검증", () => {
  it("두상·상체 아머·소품 박스 3종 메쉬 모두 비매니폴드 0건 · 경계 에지 0건 · 퇴화 삼각형 0건 · UV [0,1]을 만족한다", () => {
    const meshes = [buildUvSphereHeadMesh(), buildUvTorsoArmorMesh(), buildUvPropBoxMesh()];

    for (const mesh of meshes) {
      const report = auditUvMeshIntegrity(mesh);
      expect(report.vertexCount).toBeGreaterThan(20);
      expect(report.triangleCount).toBeGreaterThan(20);
      expect(report.nonManifoldEdgeCount).toBe(0);
      expect(report.boundaryEdgeCount).toBe(0);
      expect(report.inconsistentWindingEdgeCount).toBe(0);
      expect(report.degenerateTriangleCount).toBe(0);
      expect(report.outOfRangeUvCount).toBe(0);
      expect(report.invalidNormalCount).toBe(0);
      expect(report.isCleanManifold).toBe(true);

      // UV 값 전체 전수 범위 [0, 1] 확인
      for (let i = 0; i < mesh.uvs.length; i += 1) {
        const uv = mesh.uvs[i] ?? -1;
        expect(uv).toBeGreaterThanOrEqual(0);
        expect(uv).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("Möller–Trumbore 레이캐스트 히트·미스 및 무게중심 보간 정확도", () => {
  it("정면 중앙 레이는 3종 메쉬를 모두 정확히 히트하고 회전(Yaw/Pitch)에 따라 UV 좌표가 물리적으로 이동한다", () => {
    const head = buildUvSphereHeadMesh();
    const torso = buildUvTorsoArmorMesh();
    const box = buildUvPropBoxMesh();

    const origin = { x: 0, y: 0, z: 2.65 };
    const forward = { x: 0, y: 0, z: -1 };

    const headCenter = raycastMeshToUv(origin, forward, head, 0, 0);
    expect(headCenter).not.toBeNull();
    expect(headCenter?.u).toBeCloseTo(0.5, 1);
    expect(headCenter?.v).toBeCloseTo(0.5, 1);
    expect(headCenter?.normal.z).toBeGreaterThan(0.95);
    expect(headCenter?.depth).toBeCloseTo(2.65 - 0.71, 1);
    const bSum = (headCenter?.barycentric[0] ?? 0) + (headCenter?.barycentric[1] ?? 0) + (headCenter?.barycentric[2] ?? 0);
    expect(bSum).toBeCloseTo(1, 5);

    // Yaw 90° 회전 시 측면이 카메라(+Z)를 향하므로 히트 UV의 u가 ~0.25 이동해야 함
    const headTurned = raycastMeshToUv(origin, forward, head, 90, 0);
    expect(headTurned).not.toBeNull();
    expect(Math.abs((headTurned?.u ?? 0) - (headCenter?.u ?? 0))).toBeGreaterThan(0.2);

    // Pitch 30° 회전 시 히트 v 좌표가 뚜렷하게 변해야 함
    const headTilted = raycastMeshToUv(origin, forward, head, 0, 30);
    expect(headTilted).not.toBeNull();
    expect(Math.abs((headTilted?.v ?? 0) - (headCenter?.v ?? 0))).toBeGreaterThan(0.1);

    // 상체 아머 및 소품 박스 정면 히트 검증
    const torsoHit = raycastMeshToUv(origin, forward, torso, 0, 0);
    expect(torsoHit).not.toBeNull();
    expect(torsoHit?.u).toBeCloseTo(0.5, 1);
    expect(torsoHit?.normal.z).toBeGreaterThan(0.8);

    const boxHit = raycastMeshToUv(origin, forward, box, 0, 0);
    expect(boxHit).not.toBeNull();
    expect(boxHit?.normal.z).toBeCloseTo(1, 4);
    expect(boxHit?.depth).toBeCloseTo(2.65 - 0.62, 4);
    // 소품 박스 정면(+Z) UV 아일랜드 [0.02..0.31, 0.02..0.48] 중앙 히트 확인
    expect(boxHit?.u).toBeCloseTo(0.165, 2);
    expect(boxHit?.v).toBeCloseTo(0.25, 2);
  });

  it("메쉬 바깥으로 빗나간 레이·반대 방향 레이·영벡터 방향은 null을 반환한다", () => {
    const head = buildUvSphereHeadMesh();
    expect(raycastMeshToUv({ x: 3.5, y: 3.5, z: 2.65 }, { x: 0, y: 0, z: -1 }, head, 0, 0)).toBeNull();
    expect(raycastMeshToUv({ x: 0, y: 0, z: 2.65 }, { x: 0, y: 0, z: 1 }, head, 0, 0)).toBeNull();
    expect(raycastMeshToUv({ x: 0, y: 0, z: 2.65 }, { x: 0, y: 0, z: 0 }, head, 0, 0)).toBeNull();

    // 뷰포트 모서리(0.01, 0.01) 원근 레이는 두상 실루엣 바깥이므로 미스
    const cornerRay = createPerspectiveRayFromViewport(0.01, 0.01);
    expect(raycastMeshToUv(cornerRay.origin, cornerRay.dir, head, 0, 0)).toBeNull();
  });
});

describe("UV 브러시 스탬프 · UV 심 래핑 · 4층 비파괴 합성 · 2D UV PNG 베이크", () => {
  it("paintBrushDabOnTextureLayer는 경도 폴오프를 적용해 픽셀을 변화시키고 u=0↔1 UV 심을 끊김 없이 래핑한다", () => {
    const size = 64;
    const layer = new Uint8ClampedArray(size * size * 4);

    // 중앙 부드러운 브러시 스탬프 (hardness=0.3)
    const centerDab = paintBrushDabOnTextureLayer(layer, size, 0.5, 0.5, 6, [194, 54, 62, 255], 0.3);
    expect(centerDab.modifiedPixels).toBeGreaterThan(50);
    expect(centerDab.wrappedSeam).toBe(false);

    const centerOff = (32 * size + 32) * 4;
    const midOff = (32 * size + 36) * 4;
    const farOff = (32 * size + 44) * 4;
    expect(layer[centerOff]).toBe(194);
    expect(layer[centerOff + 3]).toBe(255);
    expect(layer[midOff + 3]).toBeGreaterThan(0);
    expect(layer[midOff + 3]).toBeLessThan(255);
    expect(layer[farOff + 3]).toBe(0);

    // UV 심 경계(u=0.01) 래핑 테스트: 좌단(x=0)과 우단(x=size-1) 모두 채색되어야 함
    const seamLayer = new Uint8ClampedArray(size * size * 4);
    const seamDab = paintBrushDabOnTextureLayer(seamLayer, size, 0.01, 0.5, 5, [54, 108, 184, 255], 0.7, { wrapU: true });
    expect(seamDab.wrappedSeam).toBe(true);
    expect(seamLayer[(32 * size + 0) * 4 + 3]).toBeGreaterThan(200);
    expect(seamLayer[(32 * size + (size - 1)) * 4 + 3]).toBeGreaterThan(150);

    // wrapU: false 일 때는 반대편 심으로 래핑되지 않음
    const clampedLayer = new Uint8ClampedArray(size * size * 4);
    const clampedDab = paintBrushDabOnTextureLayer(clampedLayer, size, 0.01, 0.5, 5, [54, 108, 184, 255], 0.7, { wrapU: false });
    expect(clampedDab.wrappedSeam).toBe(false);
    expect(clampedLayer[(32 * size + (size - 1)) * 4 + 3]).toBe(0);

    // 심 최단 경로 스트로크 (0.97 -> 0.03): u=0.5 중앙을 가로지르지 않아야 함
    const strokeLayer = new Uint8ClampedArray(size * size * 4);
    paintBrushStrokeOnTextureLayer(strokeLayer, size, 0.97, 0.5, 0.03, 0.5, 3, [26, 28, 36, 255], 0.8, { wrapU: true });
    expect(strokeLayer[(32 * size + 0) * 4 + 3]).toBeGreaterThan(200);
    expect(strokeLayer[(32 * size + 32) * 4 + 3]).toBe(0);
  });

  it("4층 텍스처 합성기는 Normal·Multiply·Screen 블렌드 모드와 가시성·불투명도를 정확히 계산한다", () => {
    const size = 8;
    const base = makeSolidLayer("base-pbr", size, [200, 100, 50, 255], { blendMode: "normal", opacity: 1 });
    const pattern = makeSolidLayer("fabric-pattern", size, [128, 255, 128, 255], { blendMode: "multiply", opacity: 1 });
    const decal = makeSolidLayer("decal-scar", size, [100, 100, 100, 255], { blendMode: "screen", opacity: 1 });
    const ink = makeSolidLayer("ink-guide", size, [20, 20, 20, 255], { blendMode: "normal", opacity: 0.5, visible: false });

    // Multiply: base(200,100,50) * pattern(128/255≈0.502, 1, 0.502) ≈ (100, 100, 25)
    const mulOnly = composite3dTextureStack([base, pattern], size);
    expect(mulOnly.visibleLayerCount).toBe(2);
    expect(mulOnly.rgba[0]).toBeGreaterThanOrEqual(99);
    expect(mulOnly.rgba[0]).toBeLessThanOrEqual(101);
    expect(mulOnly.rgba[1]).toBe(100);
    expect(mulOnly.rgba[2]).toBeGreaterThanOrEqual(24);
    expect(mulOnly.rgba[2]).toBeLessThanOrEqual(26);

    // Screen: 1 - (1 - d)(1 - s) 는 기존 색보다 밝아져야 함
    const withScreen = composite3dTextureStack([base, pattern, decal, ink], size);
    expect(withScreen.visibleLayerCount).toBe(3); // ink는 visible: false
    expect(withScreen.activeRoles).toEqual(["base-pbr", "fabric-pattern", "decal-scar"]);
    // dR≈100/255, sR=100/255 → screen ≈ 1 - (155/255)^2 ≈ 0.630 → ~161
    expect(withScreen.rgba[0]).toBeGreaterThan(155);
    expect(withScreen.rgba[0]).toBeLessThan(166);

    // invisible 레이어 복구 + opacity=0.5 normal 합성 확인
    const withInkVisible = composite3dTextureStack([base, pattern, decal, { ...ink, visible: true }], size);
    expect(withInkVisible.visibleLayerCount).toBe(4);
    // 50% 어두운 잉크(20)가 정상 블렌딩되면 R 채널이 뚜렷하게 낮아져야 함 (≈ (161 + 20) / 2 ≈ 90)
    expect(withInkVisible.rgba[0]).toBeGreaterThan(84);
    expect(withInkVisible.rgba[0]).toBeLessThan(96);
  });

  it("1클릭 스탬프·비파괴 단일 레이어 초기화·2D UV PNG 베이크·3D 프리뷰 래스터라이징이 정상 동작한다", () => {
    const size = 64;
    const head = buildUvSphereHeadMesh();
    const stack = createDefault3dTextureStack(size, "sphere-head");
    expect(stack).toHaveLength(4);

    const beforeInk = new Uint8ClampedArray(stack[3]?.rgba ?? []);
    const stampedInk = applyPresetStampToTextureLayer(stack[3] as TextureLayer3d, size, "ink-guide", "sphere-head");
    // 비파괴: 원본 레이어 버퍼는 불변
    expect(stack[3]?.rgba).toEqual(beforeInk);

    const stampedPattern = applyPresetStampToTextureLayer(stack[1] as TextureLayer3d, size, "fabric-pattern", "sphere-head");
    const stampedScar = applyPresetStampToTextureLayer(stack[2] as TextureLayer3d, size, "decal-scar", "sphere-head");
    const populatedStack: readonly TextureLayer3d[] = [stack[0] as TextureLayer3d, stampedPattern, stampedScar, stampedInk];

    const compBefore = composite3dTextureStack(populatedStack, size);
    const pngPlain = exportBakedUvSheetPng(compBefore.rgba, size);
    const pngWire = exportBakedUvSheetPng(compBefore.rgba, size, { meshForWireframe: head });

    // 실제 PNG 매직 헤더(\x89PNG\r\n\x1a\n) 및 data URL 검증
    expect(Array.from(pngPlain.pngBytes.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(pngPlain.dataUrl.startsWith("data:image/png;base64,")).toBe(true);
    expect(pngPlain.width).toBe(size);
    expect(pngPlain.height).toBe(size);
    expect(pngWire.checksumHex).not.toBe(pngPlain.checksumHex);

    // 단일 레이어 초기화는 다른 레이어를 보존한다
    const clearedScar = clearSingleTextureLayer(stampedScar, size, "sphere-head");
    expect(clearedScar.rgba.every((byte) => byte === 0)).toBe(true);
    expect(stampedInk.rgba.some((byte) => byte > 0)).toBe(true);

    // 소프트웨어 3D 래스터라이저: 중앙 픽셀 불투명 + 모서리 픽셀 투명
    const preview = rasterizeTexturedMeshPreview(head, compBefore.rgba, size, 96, 15, -5);
    expect(preview[(48 * 96 + 48) * 4 + 3]).toBe(255);
    expect(preview[3]).toBe(0);
  });
});

describe("Model3dSurfacePaintPanel UI 인터랙션 및 Calm Atelier 위생 계약", () => {
  it("3D 메쉬 전환·회전 슬라이더·직접 포인터 페인팅·4층 레이어 제어·1클릭 스탬프·2D UV PNG 베이크가 연동된다", () => {
    const onExport = vi.fn<(baked: BakedUvSheetPng) => void>();
    const onCompositeChange = vi.fn();

    render(
      <Model3dSurfacePaintPanel
        textureSize={64}
        locale="ko"
        onExportUvSheetPng={onExport}
        onTextureCompositeChange={onCompositeChange}
      />,
    );

    // 4층 스택 렌더링 및 매니폴드 정상 배지 확인
    const stackList = screen.getByTestId("texture-layer-stack");
    expect(within(stackList).getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByTestId("mesh-manifold-badge").textContent).toContain("비매니폴드 0건");

    const initialChecksum = screen.getByTestId("uv-bake-checksum").textContent;

    // 3D 직접 포인터 페인팅 (중앙 클릭 + 드래그)
    const viewport = screen.getByTestId("surface-paint-viewport");
    fireEvent.pointerDown(viewport, { clientX: 96, clientY: 96 });
    fireEvent.pointerMove(viewport, { clientX: 112, clientY: 102 });
    fireEvent.pointerUp(viewport);

    expect(Number(viewport.getAttribute("data-stroke-count"))).toBeGreaterThanOrEqual(2);
    expect(screen.getByTestId("surface-hit-readout").textContent).toContain("UV (");
    expect(screen.getByTestId("uv-bake-checksum").textContent).not.toBe(initialChecksum);
    expect(onCompositeChange).toHaveBeenCalled();

    // Yaw / Pitch 회전 슬라이더 반영
    fireEvent.change(screen.getByLabelText("좌우 회전 (Yaw)"), { target: { value: "-45" } });
    fireEvent.change(screen.getByLabelText("상하 기울기 (Pitch)"), { target: { value: "20" } });
    expect(screen.getByTestId("yaw-value").textContent).toBe("-45°");
    expect(screen.getByTestId("pitch-value").textContent).toBe("20°");

    // 1클릭 선화 가이드 · 의상 패턴 · 흉터 데칼 스탬프 적용
    const beforeStampChecksum = screen.getByTestId("uv-bake-checksum").textContent;
    fireEvent.click(screen.getByTestId("quick-stamp-fabric-pattern"));
    fireEvent.click(screen.getByTestId("quick-stamp-decal-scar"));
    fireEvent.click(screen.getByTestId("quick-stamp-ink-guide"));
    const afterStampChecksum = screen.getByTestId("uv-bake-checksum").textContent;
    expect(afterStampChecksum).not.toBe(beforeStampChecksum);

    // 눈 토글 · 블렌드 모드 · 불투명도 조절 시 2D UV 시트 베이크 즉시 갱신
    fireEvent.click(screen.getByTestId("toggle-visible-ink-guide"));
    expect(screen.getByTestId("toggle-visible-ink-guide").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("uv-bake-checksum").textContent).not.toBe(afterStampChecksum);

    fireEvent.change(screen.getByTestId("blend-mode-fabric-pattern"), { target: { value: "screen" } });
    fireEvent.change(screen.getByTestId("opacity-slider-decal-scar"), { target: { value: "50" } });

    // 메쉬 전환 (상체 아머 → 소품 박스)
    fireEvent.click(screen.getByTestId("mesh-preset-torso-armor"));
    expect(screen.getByTestId("mesh-preset-torso-armor").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByTestId("mesh-preset-prop-box"));
    expect(screen.getByTestId("mesh-preset-prop-box").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("mesh-manifold-badge").textContent).toContain("비매니폴드 0건");

    // 2D UV 시트 PNG 베이크 내보내기
    fireEvent.click(screen.getByTestId("export-uv-png-btn"));
    expect(onExport).toHaveBeenCalledTimes(1);
    const exported = onExport.mock.calls[0]?.[0];
    expect(exported?.dataUrl.startsWith("data:image/png;base64,")).toBe(true);
    expect(screen.getByTestId("surface-paint-status").textContent).toContain("PNG 베이크 완료");
  });

  it("모든 props optional 기본 렌더링 · EN 로케일 · 원시 hex/rgb/hsl 0건 · transition-all 0건 · 500줄 이하 계약을 지킨다", () => {
    render(<Model3dSurfacePaintPanel />);
    expect(screen.getByTestId("model3d-surface-paint-panel")).toBeTruthy();

    cleanup();
    render(<Model3dSurfacePaintPanel locale="en" textureSize={64} />);
    expect(screen.getByText("3D Mesh Direct Painting & 2D UV Bake Studio")).toBeTruthy();

    const panelPath = resolve(
      process.cwd(),
      "apps/web/src/domains/creator/model3d-surface-paint/Model3dSurfacePaintPanel.tsx",
    );
    const source = readFileSync(panelPath, "utf8");
    const lineCount = source.split("\n").length;

    expect(lineCount).toBeLessThanOrEqual(500);
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(source).not.toMatch(/\brgba?\s*\(/i);
    expect(source).not.toMatch(/\bhsla?\s*\(/i);
    expect(source).not.toContain("transition-all");
    expect(source).toContain("[word-break:keep-all]");
    expect(source).toContain("tabular-nums");
  });
});
