// @vitest-environment jsdom

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { PuppetWarpStudioPanel } from "./PuppetWarpStudioPanel";
import {
  PUPPET_WARP_PRESETS,
  buildDeformableGridMesh,
  computeMlsRigidDeformation,
  computePuppetWarpMetrics,
  createDefaultWebtoonPuppetPins,
  createDemoCharacterRgba,
  createPuppetWarpPresetPins,
  evaluateMlsRigidPoint,
  interpolatePointOnDeformedMesh,
  warpRgbaImageWithPuppetMesh,
  type PuppetWarpPin,
  type PuppetWarpPresetId,
} from "./puppet-warp-mls-engine";

beforeEach(() => {
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function countOpaquePixels(rgba: Uint8ClampedArray): number {
  let count = 0;
  for (let i = 3; i < rgba.length; i += 4) {
    if ((rgba[i] ?? 0) > 128) count += 1;
  }
  return count;
}

describe("puppet-warp-mls-engine: 메쉬 생성·MLS 강체 변형·고정점 보존", () => {
  it("buildDeformableGridMesh는 셀당 삼각형 2개(2*cols*rows)와 양의 넓이를 가진 격자를 생성한다", () => {
    const mesh = buildDeformableGridMesh(200, 160, 5, 4);
    expect(mesh.vertices).toHaveLength((5 + 1) * (4 + 1));
    expect(mesh.triangles).toHaveLength(2 * 5 * 4);
    expect(mesh.vertices[0]).toEqual({ x: 0, y: 0 });
    expect(mesh.vertices[mesh.vertices.length - 1]).toEqual({ x: 200, y: 160 });

    for (const tri of mesh.triangles) {
      const a = mesh.vertices[tri.i0];
      const b = mesh.vertices[tri.i1];
      const c = mesh.vertices[tri.i2];
      expect(a && b && c).toBeTruthy();
      if (!a || !b || !c) continue;
      const twiceArea = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      expect(twiceArea).toBeGreaterThan(0);
    }
  });

  it("핀 0개 또는 변위 없는 멀티-핀에서는 항등 변환(오차 0)을 유지한다", () => {
    const mesh = buildDeformableGridMesh(120, 120, 4, 4);

    const zeroPinResult = computeMlsRigidDeformation(mesh, []);
    expect(zeroPinResult).toHaveLength(mesh.vertices.length);
    for (let i = 0; i < mesh.vertices.length; i += 1) {
      expect(zeroPinResult[i]?.x).toBeCloseTo(mesh.vertices[i]?.x ?? 0, 8);
      expect(zeroPinResult[i]?.y).toBeCloseTo(mesh.vertices[i]?.y ?? 0, 8);
    }

    const restPins = createDefaultWebtoonPuppetPins(120, 120);
    const restResult = computeMlsRigidDeformation(mesh, restPins);
    for (let i = 0; i < mesh.vertices.length; i += 1) {
      expect(restResult[i]?.x).toBeCloseTo(mesh.vertices[i]?.x ?? 0, 6);
      expect(restResult[i]?.y).toBeCloseTo(mesh.vertices[i]?.y ?? 0, 6);
    }
  });

  it("1-핀은 정확한 강체 평행이동·회전을 수행하며 locked: true 시 기준 위치에 고정된다", () => {
    const mesh = buildDeformableGridMesh(100, 100, 4, 4);

    // 1) 순수 평행이동 (+18, -12)
    const translatePin: PuppetWarpPin = {
      id: "p1", restX: 50, restY: 50, targetX: 68, targetY: 38, rotationDeg: 0, locked: false, label: "중심",
    };
    const translated = computeMlsRigidDeformation(mesh, [translatePin]);
    for (let i = 0; i < mesh.vertices.length; i += 1) {
      expect(translated[i]?.x).toBeCloseTo((mesh.vertices[i]?.x ?? 0) + 18, 6);
      expect(translated[i]?.y).toBeCloseTo((mesh.vertices[i]?.y ?? 0) - 12, 6);
    }

    // 2) 순수 90도 회전 (중심 (50, 50) 기준, (75, 50) -> (50, 75))
    const rotatePin: PuppetWarpPin = {
      id: "p1", restX: 50, restY: 50, targetX: 50, targetY: 50, rotationDeg: 90, locked: false, label: "회전",
    };
    const rotated = computeMlsRigidDeformation(mesh, [rotatePin]);
    const idx75_50 = 2 * 5 + 3; // row=2 (y=50), col=3 (x=75)
    expect(rotated[idx75_50]?.x).toBeCloseTo(50, 5);
    expect(rotated[idx75_50]?.y).toBeCloseTo(75, 5);

    // 거리 보존(강체 특성)
    for (let i = 0; i < mesh.vertices.length; i += 1) {
      const restDist = Math.hypot((mesh.vertices[i]?.x ?? 0) - 50, (mesh.vertices[i]?.y ?? 0) - 50);
      const defDist = Math.hypot((rotated[i]?.x ?? 0) - 50, (rotated[i]?.y ?? 0) - 50);
      expect(defDist).toBeCloseTo(restDist, 5);
    }

    // 3) 1-핀 locked: true는 targetX/targetY/rotationDeg를 무시하고 항등 고정
    const lockedPin: PuppetWarpPin = { ...translatePin, rotationDeg: 45, locked: true };
    const lockedOut = computeMlsRigidDeformation(mesh, [lockedPin]);
    for (let i = 0; i < mesh.vertices.length; i += 1) {
      expect(lockedOut[i]?.x).toBeCloseTo(mesh.vertices[i]?.x ?? 0, 6);
      expect(lockedOut[i]?.y).toBeCloseTo(mesh.vertices[i]?.y ?? 0, 6);
    }
  });

  it("멀티-핀 MLS 강체 변형은 모든 핀 고정점 오차 < 0.5px, locked 핀 고정, 전역 강체 회전 거리 보존을 만족한다", () => {
    const mesh = buildDeformableGridMesh(200, 200, 10, 10);
    const pins: readonly PuppetWarpPin[] = [
      { id: "anchor-base", restX: 100, restY: 160, targetX: 999, targetY: -400, rotationDeg: 110, locked: true, label: "골반" },
      { id: "anchor-neck", restX: 100, restY: 80, targetX: 100, targetY: 80, rotationDeg: 0, locked: true, label: "목" },
      { id: "active-hand", restX: 40, restY: 120, targetX: 28, targetY: 64, rotationDeg: -20, locked: false, label: "오른손" },
    ];

    const deformed = computeMlsRigidDeformation(mesh, pins, 2.0);
    for (const pin of pins) {
      const expectedX = pin.locked ? pin.restX : pin.targetX;
      const expectedY = pin.locked ? pin.restY : pin.targetY;

      // MLS 연속 필드 정밀 검증
      const exact = evaluateMlsRigidPoint(pin.restX, pin.restY, pins, 2.0);
      expect(Math.hypot(exact.x - expectedX, exact.y - expectedY)).toBeLessThan(1e-6);

      // 삼각형 메쉬 상 무게중심 보간 잔차 < 0.5px 검증
      const mapped = interpolatePointOnDeformedMesh(pin.restX, pin.restY, mesh, deformed);
      expect(mapped).not.toBeNull();
      if (mapped) {
        expect(Math.hypot(mapped.x - expectedX, mapped.y - expectedY)).toBeLessThan(0.5);
      }
    }

    // 비격자(off-grid) 핀에서도 고밀도 메쉬 기준 잔차 < 0.5px 검증
    const fineMesh = buildDeformableGridMesh(200, 200, 20, 20);
    const offGridPins: readonly PuppetWarpPin[] = [
      { id: "a", restX: 53.3, restY: 147.2, targetX: 53.3, targetY: 147.2, rotationDeg: 0, locked: true, label: "고정 A" },
      { id: "b", restX: 146.7, restY: 57.4, targetX: 158.7, targetY: 45.4, rotationDeg: 0, locked: false, label: "이동 B" },
    ];
    const fineDeformed = computeMlsRigidDeformation(fineMesh, offGridPins, 2.0);
    for (const pin of offGridPins) {
      const mapped = interpolatePointOnDeformedMesh(pin.restX, pin.restY, fineMesh, fineDeformed);
      expect(mapped).not.toBeNull();
      if (mapped) {
        expect(Math.hypot(mapped.x - pin.targetX, mapped.y - pin.targetY)).toBeLessThan(0.5);
      }
    }

    // 4개 핀을 30도 순수 강체 회전했을 때 메쉬 내부 두 정점 간 유클리드 거리 보존 검증
    const rad = (30 * Math.PI) / 180;
    const rotPt = (x: number, y: number) => ({
      x: 100 + Math.cos(rad) * (x - 100) - Math.sin(rad) * (y - 100),
      y: 100 + Math.sin(rad) * (x - 100) + Math.cos(rad) * (y - 100),
    });
    const corners: readonly [number, number][] = [[40, 40], [160, 40], [40, 160], [160, 160]];
    const rigidPins: PuppetWarpPin[] = corners.map(([rx, ry], idx) => {
      const t = rotPt(rx, ry);
      return { id: `c${idx}`, restX: rx, restY: ry, targetX: t.x, targetY: t.y, rotationDeg: 0, locked: false, label: `코너${idx}` };
    });
    const rigidDeformed = computeMlsRigidDeformation(mesh, rigidPins, 2.0);
    const pA = mesh.vertices[25];
    const pB = mesh.vertices[82];
    const dA = rigidDeformed[25];
    const dB = rigidDeformed[82];
    expect(pA && pB && dA && dB).toBeTruthy();
    if (pA && pB && dA && dB) {
      const restDist = Math.hypot(pB.x - pA.x, pB.y - pA.y);
      const defDist = Math.hypot(dB.x - dA.x, dB.y - dA.y);
      expect(defDist).toBeCloseTo(restDist, 4);
    }
  });

  it("4종 웹툰 포즈 원클릭 프리셋이 모두 유효한 변형과 고정점 보존을 생성한다", () => {
    const expectedKoNames = ["고개 끄덕임", "오른팔 들어 올리기", "허리 역동적 굽힘", "머리카락 바람 날림"];
    expect(PUPPET_WARP_PRESETS.map((p) => p.nameKo)).toEqual(expectedKoNames);

    const mesh = buildDeformableGridMesh(240, 300, 10, 12);
    for (const preset of PUPPET_WARP_PRESETS) {
      const pins = createPuppetWarpPresetPins(preset.id, 240, 300);
      const deformed = computeMlsRigidDeformation(mesh, pins, 2.0);
      expect(deformed.every((v) => Number.isFinite(v.x) && Number.isFinite(v.y))).toBe(true);

      const metrics = computePuppetWarpMetrics(mesh, deformed, pins);
      expect(metrics.maxVertexDisplacementPx).toBeGreaterThan(8);
      for (const pin of pins) {
        if (!pin.locked) continue;
        const exact = evaluateMlsRigidPoint(pin.restX, pin.restY, pins, 2.0);
        expect(Math.hypot(exact.x - pin.restX, exact.y - pin.restY)).toBeLessThan(0.5);
      }
    }
  });
});

describe("warpRgbaImageWithPuppetMesh: 실제 RGBA 픽셀 버퍼 변형 무결성", () => {
  it("항등 메쉬 워프는 모든 불투명 픽셀을 비트 단위로 보존하며 NaN/OOB가 0건이다", () => {
    const width = 48;
    const height = 60;
    const src = createDemoCharacterRgba(width, height);
    const mesh = buildDeformableGridMesh(width, height, 6, 8);
    const identityVerts = computeMlsRigidDeformation(mesh, []);
    const warped = warpRgbaImageWithPuppetMesh(src, width, height, mesh, identityVerts);

    expect(warped).toBeInstanceOf(Uint8ClampedArray);
    expect(warped).toHaveLength(width * height * 4);
    for (let i = 0; i < warped.length; i += 1) {
      expect(Number.isNaN(warped[i])).toBe(false);
      expect(warped[i]).toBe(src[i]);
    }
  });

  it("1-핀 평행이동과 멀티-핀 웹툰 포즈 워프가 실제 RGBA 픽셀을 정확히 이동시키고 NaN/OOB 없이 완료된다", () => {
    const width = 48;
    const height = 48;
    const src = new Uint8ClampedArray(width * height * 4);
    // (16..23, 16..23) 8x8 선명한 주황 블록
    for (let y = 16; y < 24; y += 1) {
      for (let x = 16; x < 24; x += 1) {
        const idx = (y * width + x) * 4;
        src[idx] = 240;
        src[idx + 1] = 110;
        src[idx + 2] = 40;
        src[idx + 3] = 255;
      }
    }

    const mesh = buildDeformableGridMesh(width, height, 6, 6);
    const shiftPin: PuppetWarpPin = {
      id: "shift", restX: 20, restY: 20, targetX: 28, targetY: 26, rotationDeg: 0, locked: false, label: "이동",
    };
    const shiftedVerts = computeMlsRigidDeformation(mesh, [shiftPin]);
    const shiftedRgba = warpRgbaImageWithPuppetMesh(src, width, height, mesh, shiftedVerts);

    expect(shiftedRgba).toHaveLength(width * height * 4);
    // 원래 (18, 18) 블록 픽셀은 비워지고, (26, 24) 위치로 이동해야 함
    const oldCenterIdx = (18 * width + 18) * 4;
    const newCenterIdx = (26 * width + 26) * 4;
    expect(shiftedRgba[oldCenterIdx + 3]).toBe(0);
    expect(shiftedRgba[newCenterIdx]).toBe(240);
    expect(shiftedRgba[newCenterIdx + 1]).toBe(110);
    expect(shiftedRgba[newCenterIdx + 2]).toBe(40);
    expect(shiftedRgba[newCenterIdx + 3]).toBe(255);

    // 멀티-핀 포즈 프리셋 RGBA 캐릭터 워프
    const charW = 64;
    const charH = 80;
    const charRgba = createDemoCharacterRgba(charW, charH);
    const charMesh = buildDeformableGridMesh(charW, charH, 8, 10);
    const posePins = createPuppetWarpPresetPins("raise-right-arm", charW, charH);
    const poseVerts = computeMlsRigidDeformation(charMesh, posePins, 2.0);
    const warpedChar = warpRgbaImageWithPuppetMesh(charRgba, charW, charH, charMesh, poseVerts);

    expect(warpedChar).toHaveLength(charW * charH * 4);
    let diffCount = 0;
    for (let i = 0; i < warpedChar.length; i += 1) {
      const value = warpedChar[i] ?? -1;
      expect(Number.isFinite(value) && value >= 0 && value <= 255).toBe(true);
      if (value !== charRgba[i]) diffCount += 1;
    }
    expect(diffCount).toBeGreaterThan(80);
    expect(countOpaquePixels(warpedChar)).toBeGreaterThan(countOpaquePixels(charRgba) * 0.7);

    // 극단적 범위 이탈(OOB) 핀 및 비정상 버퍼 길이 방어
    const extremePins: readonly PuppetWarpPin[] = [
      { id: "oob", restX: 32, restY: 40, targetX: -5000, targetY: 9999, rotationDeg: 180, locked: false, label: "극단" },
    ];
    const extremeVerts = computeMlsRigidDeformation(charMesh, extremePins);
    const extremeRgba = warpRgbaImageWithPuppetMesh(charRgba, charW, charH, charMesh, extremeVerts);
    expect(extremeRgba).toHaveLength(charW * charH * 4);
    expect(extremeRgba.every((v) => Number.isFinite(v) && v >= 0 && v <= 255)).toBe(true);
    expect(warpRgbaImageWithPuppetMesh(new Uint8ClampedArray(4), charW, charH, charMesh, poseVerts)).toHaveLength(charW * charH * 4);
    expect(warpRgbaImageWithPuppetMesh(charRgba, 0, 0, charMesh, poseVerts)).toHaveLength(0);
  });
});

describe("PuppetWarpStudioPanel: UI 핀 선택·프리셋·잠금·리셋·다국어·위생 계약", () => {
  it("props 없이 기본 렌더링되며 핀 선택·회전·잠금·추가·메쉬 밀도·4종 프리셋·리셋이 모두 동작한다", () => {
    const onPinsChange = vi.fn();
    render(<PuppetWarpStudioPanel onPinsChange={onPinsChange} />);

    // 초기 상태: 7개 핀, 변위 0.0px, 6x8 -> 96 삼각형
    expect(screen.getByTestId("puppet-pin-count").textContent).toContain("7");
    expect(screen.getByTestId("puppet-triangle-count").textContent).toContain("96");
    expect(screen.getByTestId("puppet-max-displacement").textContent).toBe("0.0px");

    // 4종 포즈 프리셋 순회 적용 검증
    const presetIds: readonly PuppetWarpPresetId[] = [
      "head-nod", "raise-right-arm", "dynamic-waist-bend", "wind-blown-hair",
    ];
    for (const presetId of presetIds) {
      fireEvent.click(screen.getByTestId(`puppet-preset-${presetId}`));
      expect(screen.getByTestId(`puppet-preset-${presetId}`).getAttribute("aria-pressed")).toBe("true");
      const maxDisp = Number.parseFloat(screen.getByTestId("puppet-max-displacement").textContent ?? "0");
      expect(maxDisp).toBeGreaterThan(5);
    }

    // 오른손 핀 선택 후 잠금 토글: 잠기면 슬라이더 비활성 + 해제하면 회전 조절 가능
    fireEvent.click(screen.getByTestId("puppet-pin-chip-right-hand"));
    const lockBtn = screen.getByTestId("puppet-pin-lock-btn");
    // wind-blown-hair 직후에는 right-hand가 잠겨 있음
    expect(lockBtn.getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByTestId("puppet-pin-rotation-slider") as HTMLInputElement).disabled).toBe(true);

    // 잠금 해제 후 회전값 변경
    fireEvent.click(lockBtn);
    expect(screen.getByTestId("puppet-pin-lock-btn").getAttribute("aria-pressed")).toBe("false");
    expect((screen.getByTestId("puppet-pin-rotation-slider") as HTMLInputElement).disabled).toBe(false);
    fireEvent.change(screen.getByTestId("puppet-pin-rotation-slider"), { target: { value: "42" } });
    expect(screen.getByTestId("puppet-pin-rotation-value").textContent).toBe("42°");

    // 핀 추가 및 메쉬 밀도 조절
    fireEvent.click(screen.getByTestId("puppet-add-pin-btn"));
    expect(screen.getByTestId("puppet-pin-count").textContent).toContain("8");

    fireEvent.change(screen.getByTestId("puppet-mesh-density-slider"), { target: { value: "10" } });
    expect(screen.getByTestId("puppet-triangle-count").textContent).toContain("10×13");
    expect(screen.getByTestId("puppet-triangle-count").textContent).toContain("260");

    // SVG 포인터 드래그로 추가된 핀 이동 + 잠긴 핀(neck) 드래그 차단 + 키보드 이동 + 삭제
    const svg = screen.getByTestId("puppet-warp-svg");
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({
      left: 0, top: 0, width: 240, height: 300, right: 240, bottom: 300, x: 0, y: 0, toJSON: () => ({}),
    });
    const customSvgPin = screen.getByTestId("puppet-svg-pin-custom-pin-1");
    fireEvent.pointerDown(customSvgPin, { clientX: 90, clientY: 130 });
    fireEvent.pointerMove(svg, { clientX: 150, clientY: 110 });
    fireEvent.pointerUp(svg);
    expect(screen.getByTestId("puppet-status-notice").textContent).toContain("150");

    fireEvent.keyDown(customSvgPin, { key: "ArrowRight" });
    expect(screen.getByTestId("puppet-status-notice").textContent).toContain("키보드");

    // 잠긴 핀 드래그 시도 차단 확인
    fireEvent.pointerDown(screen.getByTestId("puppet-svg-pin-neck"), { clientX: 120, clientY: 102 });
    expect(screen.getByTestId("puppet-status-notice").textContent).toContain("잠겨");

    // 캔버스 찍어 핀 추가 후 삭제
    fireEvent.click(screen.getByTestId("puppet-add-mode-btn"));
    fireEvent.pointerDown(svg, { clientX: 60, clientY: 80 });
    expect(screen.getByTestId("puppet-pin-count").textContent).toContain("9");
    fireEvent.click(screen.getByTestId("puppet-pin-delete-btn"));
    expect(screen.getByTestId("puppet-pin-count").textContent).toContain("8");

    // 초기화 버튼 클릭 -> 기본 7핀 + 변위 0.0px 복원
    fireEvent.click(screen.getByTestId("puppet-reset-btn"));
    expect(screen.getByTestId("puppet-pin-count").textContent).toContain("7");
    expect(screen.getByTestId("puppet-max-displacement").textContent).toBe("0.0px");
    expect(onPinsChange).toHaveBeenCalled();
  });

  it("영어 로케일(en) 전환 시 한글 없이 영어 라벨·핀·프리셋 이름이 정상 출력된다", () => {
    const { container } = render(<PuppetWarpStudioPanel locale="en" />);
    expect(screen.getByText("2D Puppet Warp (MLS Rigid Mesh)")).toBeTruthy();
    expect(screen.getByTestId("puppet-preset-head-nod").textContent).toBe("Head Nod");
    expect(screen.getByTestId("puppet-preset-raise-right-arm").textContent).toBe("Raise Right Arm");
    expect(screen.getByTestId("puppet-preset-dynamic-waist-bend").textContent).toBe("Dynamic Waist Bend");
    expect(screen.getByTestId("puppet-preset-wind-blown-hair").textContent).toBe("Wind-Blown Hair");
    expect(screen.getByTestId("puppet-reset-btn").textContent).toContain("Reset");
    expect(container.textContent).not.toMatch(/[가-힣]/);
  });

  it("PuppetWarpStudioPanel.tsx는 Calm Atelier 위생 계약(원시 색상 0건·transition-all 0건·500줄 이하·배럴 금지)을 준수한다", () => {
    const dir = path.resolve(process.cwd(), "apps/web/src/domains/creator/csp-puppet-warp");
    const panelPath = path.join(dir, "PuppetWarpStudioPanel.tsx");
    const source = readFileSync(panelPath, "utf8");
    const lineCount = source.split(/\r?\n/).length;

    expect(lineCount).toBeLessThanOrEqual(500);
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(source).not.toMatch(/\brgba?\s*\(/i);
    expect(source).not.toMatch(/\bhsla?\s*\(/i);
    expect(source).not.toContain("transition-all");
    expect(source).toContain("[word-break:keep-all]");
    expect(source).toContain("tabular-nums");
    expect(existsSync(path.join(dir, "index.ts"))).toBe(false);
  });
});
