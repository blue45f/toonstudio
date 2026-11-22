import { describe, expect, it } from "vitest";

import {
  CleanroomColorDropController,
  computeColorDropPreviewMask,
  computeDeltaE2000,
  computeDeltaE76,
  deltaEToleranceToDragDistance01,
  doesPixelMatchColorDrop,
  mapDragDistanceToColorTolerance,
  recognizeCleanroomQuickShape,
  srgbToCieLab,
  type QuickShapePoint2D,
} from "./studio-quickshape-and-colordrop";
import { snapStrokeToLeastSquaresQuickShape } from "../drawing/studio-quickmenu-and-quickshape";
import {
  createCleanroomColorDropController,
  resolveColorDropToleranceFromDrag,
} from "../drawing/studio-pressure-curve-and-colordrop";

/** 결정적 의사난수 지터(±ampPx)를 추가해 실제 손그림 노이즈를 모사한다. */
function withJitter(
  points: readonly QuickShapePoint2D[],
  ampPx: number,
  seed = 7,
): QuickShapePoint2D[] {
  return points.map((p, idx) => {
    const jx = Math.sin(idx * 12.9898 + seed * 1.31) * ampPx;
    const jy = Math.cos(idx * 78.233 + seed * 2.17) * ampPx;
    return { x: p.x + jx, y: p.y + jy };
  });
}

function samplePolygonPerimeter(
  vertices: readonly QuickShapePoint2D[],
  samplesPerEdge = 18,
): QuickShapePoint2D[] {
  const out: QuickShapePoint2D[] = [];
  for (let e = 0; e < vertices.length; e += 1) {
    const a = vertices[e]!;
    const b = vertices[(e + 1) % vertices.length]!;
    for (let s = 0; s < samplesPerEdge; s += 1) {
      const t = s / samplesPerEdge;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  out.push(vertices[0]!);
  return out;
}

describe("studio-quickshape-and-colordrop", () => {
  describe("Procreate 식 최소자승 QuickShape 6종 도형 인식 정밀도", () => {
    it("노이즈가 섞인 대각선 자유 직선을 직선(line)으로 정확히 스냅한다", () => {
      const raw: QuickShapePoint2D[] = [];
      for (let i = 0; i <= 40; i += 1) {
        const t = i / 40;
        raw.push({ x: 20 + t * 180, y: 30 + t * 110 });
      }
      const res = recognizeCleanroomQuickShape(withJitter(raw, 1.8, 1));
      expect(res).not.toBeNull();
      expect(res!.kind).toBe("line");
      expect(res!.closed).toBe(false);
      expect(res!.confidence).toBeGreaterThan(0.7);
      expect(res!.vertices).toHaveLength(2);
      expect(Math.abs(res!.vertices![0]!.x - 20)).toBeLessThan(2.5);
      expect(Math.abs(res!.vertices![1]!.x - 200)).toBeLessThan(2.5);
    });

    it("손떨림이 있는 자유 원을 원(circle)으로 인식하고 중심·반지름을 3% 오차 이내로 적합한다", () => {
      const raw: QuickShapePoint2D[] = [];
      const cx = 150;
      const cy = 140;
      const r = 60;
      for (let i = 0; i <= 60; i += 1) {
        const a = (i / 60) * Math.PI * 1.96; // 미세하게 덜 닫힌 손그림 원
        raw.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
      }
      const res = recognizeCleanroomQuickShape(withJitter(raw, 1.6, 2));
      expect(res).not.toBeNull();
      expect(res!.kind).toBe("circle");
      expect(res!.closed).toBe(true);
      expect(Math.abs(res!.center!.x - cx)).toBeLessThan(2.5);
      expect(Math.abs(res!.center!.y - cy)).toBeLessThan(2.5);
      expect(Math.abs(res!.radius! - r) / r).toBeLessThan(0.03);
    });

    it("30° 회전된 타원(ellipse)을 정확히 인식하고 장단반경·회전각을 복원한다", () => {
      const cx = 200;
      const cy = 180;
      const rx = 90;
      const ry = 42;
      const rot = Math.PI / 6;
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);

      const raw: QuickShapePoint2D[] = [];
      for (let i = 0; i <= 72; i += 1) {
        const a = (i / 72) * Math.PI * 2;
        const lx = rx * Math.cos(a);
        const ly = ry * Math.sin(a);
        raw.push({ x: cx + lx * cos - ly * sin, y: cy + lx * sin + ly * cos });
      }

      const res = recognizeCleanroomQuickShape(withJitter(raw, 1.5, 3));
      expect(res).not.toBeNull();
      expect(res!.kind).toBe("ellipse");
      expect(res!.closed).toBe(true);
      expect(Math.abs(res!.center!.x - cx)).toBeLessThan(3);
      expect(Math.abs(res!.center!.y - cy)).toBeLessThan(3);
      expect(Math.abs(res!.radiusX! - rx)).toBeLessThan(4);
      expect(Math.abs(res!.radiusY! - ry)).toBeLessThan(4);
      expect(Math.abs(res!.rotationRad! - rot)).toBeLessThan(0.08);
    });

    it("손그림 삼각형(triangle)을 인식하고 3개 꼭짓점을 정확히 스냅한다", () => {
      const verts: QuickShapePoint2D[] = [
        { x: 120, y: 20 },
        { x: 220, y: 190 },
        { x: 30, y: 180 },
      ];
      const noisy = withJitter(samplePolygonPerimeter(verts, 20), 1.6, 4);
      const res = recognizeCleanroomQuickShape(noisy);
      expect(res).not.toBeNull();
      expect(res!.kind).toBe("triangle");
      expect(res!.closed).toBe(true);
      expect(res!.vertices).toHaveLength(3);
      expect(res!.rmseNormalized).toBeLessThan(0.03);
    });

    it("축 정렬 사각형과 35° 회전 사각형(rectangle)을 모두 정확히 인식한다", () => {
      const axisRect = samplePolygonPerimeter([
        { x: 40, y: 40 },
        { x: 200, y: 40 },
        { x: 200, y: 140 },
        { x: 40, y: 140 },
      ]);
      const resAxis = recognizeCleanroomQuickShape(withJitter(axisRect, 1.5, 5));
      expect(resAxis).not.toBeNull();
      expect(resAxis!.kind).toBe("rectangle");
      expect(resAxis!.vertices).toHaveLength(4);

      const angle = (35 * Math.PI) / 180;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const rotCorners: QuickShapePoint2D[] = [
        { x: -70, y: -40 },
        { x: 70, y: -40 },
        { x: 70, y: 40 },
        { x: -70, y: 40 },
      ].map((p) => ({ x: 150 + p.x * cos - p.y * sin, y: 150 + p.x * sin + p.y * cos }));
      const resRot = recognizeCleanroomQuickShape(
        withJitter(samplePolygonPerimeter(rotCorners, 18), 1.5, 6),
      );
      expect(resRot).not.toBeNull();
      expect(resRot!.kind).toBe("rectangle");
      expect(resRot!.vertices).toHaveLength(4);
      expect(resRot!.rmseNormalized).toBeLessThan(0.03);
    });

    it("열린 원호(arc)를 직선이나 닫힌 원과 구분해 정확히 적합한다", () => {
      const cx = 100;
      const cy = 120;
      const r = 75;
      const start = -Math.PI * 0.75;
      const end = Math.PI * 0.1; // 153° 호
      const raw: QuickShapePoint2D[] = [];
      for (let i = 0; i <= 40; i += 1) {
        const a = start + ((end - start) * i) / 40;
        raw.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
      }
      const res = recognizeCleanroomQuickShape(withJitter(raw, 1.4, 9));
      expect(res).not.toBeNull();
      expect(res!.kind).toBe("arc");
      expect(res!.closed).toBe(false);
      expect(res!.counterClockwise).toBe(true);
      expect(Math.abs(res!.center!.x - cx)).toBeLessThan(3);
      expect(Math.abs(res!.center!.y - cy)).toBeLessThan(3);
      expect(Math.abs(res!.radius! - r)).toBeLessThan(3);
    });

    it("무작위 지그재그 낙서는 오인식하지 않고 null을 반환하며 홀드 진입점 조건을 지킨다", () => {
      const scribble: QuickShapePoint2D[] = [
        { x: 10, y: 10 },
        { x: 90, y: 30 },
        { x: 20, y: 70 },
        { x: 140, y: 50 },
        { x: 40, y: 130 },
        { x: 160, y: 120 },
        { x: 80, y: 10 },
      ];
      expect(recognizeCleanroomQuickShape(scribble)).toBeNull();

      // 홀드 시간 미달 시 진입점 래퍼도 null 반환
      const line: QuickShapePoint2D[] = [
        { x: 0, y: 0 },
        { x: 120, y: 0 },
      ];
      expect(snapStrokeToLeastSquaresQuickShape(line, 250, 400)).toBeNull();
      expect(snapStrokeToLeastSquaresQuickShape(line, 450, 400)?.kind).toBe("line");
    });
  });

  describe("Procreate 식 ColorDrop 문턱값 단조성 및 실시간 컨트롤러", () => {
    it("드래그 거리(0..1) 증가에 따라 ΔE 및 RGB 허용치가 엄격히 단조 증가하며 역매핑이 일치한다", () => {
      const steps = Array.from({ length: 21 }, (_, idx) => idx / 20);
      const mapped = steps.map((d) => mapDragDistanceToColorTolerance(d));

      expect(mapped[0]!.deltaETolerance).toBe(0);
      expect(mapped[0]!.rgbTolerance).toBe(0);
      expect(mapped[mapped.length - 1]!.deltaETolerance).toBe(100);
      expect(mapped[mapped.length - 1]!.rgbTolerance).toBe(255);

      for (let i = 1; i < mapped.length; i += 1) {
        expect(mapped[i]!.deltaETolerance).toBeGreaterThan(mapped[i - 1]!.deltaETolerance);
        expect(mapped[i]!.rgbTolerance).toBeGreaterThan(mapped[i - 1]!.rgbTolerance);
        expect(mapped[i]!.rgbEuclideanTolerance).toBeGreaterThan(
          mapped[i - 1]!.rgbEuclideanTolerance,
        );
      }

      // 감마 1.6 기준 역매핑 왕복 정확도
      for (const d of [0, 0.15, 0.35, 0.6, 0.85, 1]) {
        const snap = resolveColorDropToleranceFromDrag(d);
        expect(deltaEToleranceToDragDistance01(snap.deltaETolerance)).toBeCloseTo(d, 5);
      }
    });

    it("CIEDE2000·CIE76 색차와 그라디언트 이미지 실시간 프리뷰 마스크가 드래그 거리에 대해 단조 포함된다", () => {
      const black = srgbToCieLab(0, 0, 0);
      const white = srgbToCieLab(255, 255, 255);
      const red = srgbToCieLab(220, 40, 40);
      const nearRed = srgbToCieLab(224, 46, 44);

      expect(computeDeltaE2000(red, red)).toBeCloseTo(0, 6);
      expect(computeDeltaE76(black, white)).toBeCloseTo(100, 1);
      expect(computeDeltaE2000(red, nearRed)).toBeLessThan(computeDeltaE2000(red, white));

      // 1×64 수평 그라디언트(좌측 진빨강 → 우측 밝은 파랑)
      const width = 64;
      const height = 1;
      const rgba = new Uint8ClampedArray(width * 4);
      for (let x = 0; x < width; x += 1) {
        const t = x / (width - 1);
        rgba[x * 4] = Math.round(230 * (1 - t) + 30 * t);
        rgba[x * 4 + 1] = Math.round(40 * (1 - t) + 180 * t);
        rgba[x * 4 + 2] = Math.round(40 * (1 - t) + 240 * t);
        rgba[x * 4 + 3] = 255;
      }

      let prevCount = 0;
      let prevMask: Uint8Array = new Uint8Array(width);
      for (const d of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
        const tol = mapDragDistanceToColorTolerance(d);
        const preview = computeColorDropPreviewMask(rgba, width, height, 0, 0, tol, "deltaE2000");
        expect(preview.filledPixelCount).toBeGreaterThanOrEqual(prevCount);
        // 이전 드래그 거리에서 채워진 픽셀은 더 큰 거리에서도 반드시 포함되어야 한다(단조 포함성).
        for (let x = 0; x < width; x += 1) {
          if (prevMask[x] === 255) {
            expect(preview.mask[x]).toBe(255);
          }
        }
        prevCount = preview.filledPixelCount;
        prevMask = preview.mask;
      }
      expect(prevCount).toBe(width);

      // RGB 메트릭 일치 판정
      expect(
        doesPixelMatchColorDrop(
          [100, 100, 100, 255],
          [105, 102, 98, 255],
          mapDragDistanceToColorTolerance(0.2),
          "rgb",
        ),
      ).toBe(true);
    });

    it("ColorDrop 컨트롤러 홀드·스크럽·확정(sticky)·취소(원복) 상태 전이가 정확하다", () => {
      const ctrl: CleanroomColorDropController = createCleanroomColorDropController({
        initialDragDistance01: 0.25,
        holdDelayMs: 400,
        fullRangeDragPx: 200,
      });

      const s0 = ctrl.begin(100, 100, 1000);
      expect(s0.phase).toBe("holding");
      expect(s0.dragDistance01).toBeCloseTo(0.25, 6);

      // 홀드 시간 전 이동은 문턱값 변경 없음
      const s1 = ctrl.move(140, 100, 1200);
      expect(s1.phase).toBe("holding");
      expect(s1.dragDistance01).toBeCloseTo(0.25, 6);

      // 홀드 시간 이후 스크럽 진입 (+100px => +0.5 => 0.75)
      ctrl.move(140, 100, 1450);
      const s2 = ctrl.move(240, 100, 1500);
      expect(s2.phase).toBe("scrubbing");
      expect(s2.dragDistance01).toBeCloseTo(0.75, 6);
      expect(s2.deltaETolerance).toBeGreaterThan(s0.deltaETolerance);

      // 확정 시 sticky 값으로 저장
      const committed = ctrl.commit();
      expect(committed.phase).toBe("committed");
      expect(committed.stickyDragDistance01).toBeCloseTo(0.75, 6);

      // 다음 세션에서 변경 후 취소하면 직전 sticky(0.75)로 복원
      ctrl.begin(100, 100, 2000);
      const direct = ctrl.setDragDistance01(0.1);
      expect(direct.dragDistance01).toBeCloseTo(0.1, 6);
      const cancelled = ctrl.cancel();
      expect(cancelled.phase).toBe("cancelled");
      expect(cancelled.dragDistance01).toBeCloseTo(0.75, 6);
    });
  });
});
