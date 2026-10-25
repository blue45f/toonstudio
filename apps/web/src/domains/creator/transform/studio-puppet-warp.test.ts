import { describe, expect, it } from "vitest";

import {
  buildPuppetLatticeMesh,
  computeDeformedPosition,
  createPuppetPin,
  deformPuppetMesh,
  movePuppetPin,
  rasterizePuppetWarpedBuffer,
  removePuppetPin,
  resetPuppetPins,
  rotatePuppetPin,
  scalePuppetPin,
  setPuppetPinDepth,
} from "./studio-puppet-warp";

describe("studio-puppet-warp", () => {
  describe("Pin creation and manipulation", () => {
    it("creates a puppet pin with rest position equal to initial coordinate", () => {
      const pin = createPuppetPin(150, 200, "deform", "arm-pin");
      expect(pin.id).toBe("arm-pin");
      expect(pin.kind).toBe("deform");
      expect(pin.x).toBe(150);
      expect(pin.y).toBe(200);
      expect(pin.restX).toBe(150);
      expect(pin.restY).toBe(200);
      expect(pin.rotationDeg).toBe(0);
      expect(pin.scale).toBe(1);
    });

    it("moves pin to a new coordinate", () => {
      const pins = [createPuppetPin(100, 100, "deform", "p1")];
      const moved = movePuppetPin(pins, "p1", 130, 140);
      expect(moved[0]?.x).toBe(130);
      expect(moved[0]?.y).toBe(140);
      expect(moved[0]?.restX).toBe(100); // Rest position remains preserved!
    });

    it("rotates, scales, updates depth, and resets pins back to rest state", () => {
      const pins = [createPuppetPin(100, 100, "deform", "p1")];
      const moved = movePuppetPin(pins, "p1", 180, 220);
      const rotated = rotatePuppetPin(moved, "p1", 45);
      const scaled = scalePuppetPin(rotated, "p1", 1.5);
      const zOrdered = setPuppetPinDepth(scaled, "p1", 3);
      expect(zOrdered[0]?.rotationDeg).toBe(45);
      expect(zOrdered[0]?.scale).toBe(1.5);
      expect(zOrdered[0]?.depth).toBe(3);

      const reset = resetPuppetPins(zOrdered);
      expect(reset[0]?.x).toBe(100);
      expect(reset[0]?.y).toBe(100);
      expect(reset[0]?.rotationDeg).toBe(0);
      expect(reset[0]?.scale).toBe(1);
      expect(reset[0]?.depth).toBe(3);

      expect(removePuppetPin(reset, "p1")).toHaveLength(0);
    });
  });

  describe("Mesh Generation and Deformation", () => {
    it("builds a regular triangular lattice mesh", () => {
      const mesh = buildPuppetLatticeMesh(200, 200, 4, 4);
      expect(mesh.width).toBe(200);
      expect(mesh.height).toBe(200);
      expect(mesh.vertices).toHaveLength(25); // (4+1) * (4+1)
      expect(mesh.triangles).toHaveLength(32); // 4 * 4 * 2
    });

    it("smoothly deforms vertices near moved pins while keeping anchor pins stationary", () => {
      const pDeform = createPuppetPin(100, 100, "deform", "deform-pin");
      const pAnchor = createPuppetPin(0, 0, "anchor", "anchor-pin");

      // Move the deform pin by +40px X and +20px Y
      const movedPins = movePuppetPin([pDeform, pAnchor], "deform-pin", 140, 120);

      // Point near the deform pin (at 100, 100) should move significantly
      const [nearX, nearY] = computeDeformedPosition(100, 100, movedPins, 100);
      expect(nearX).toBeGreaterThan(125);
      expect(nearY).toBeGreaterThan(110);

      // Point near the anchor (at 0, 0) should remain close to original
      const [anchorX, anchorY] = computeDeformedPosition(0, 0, movedPins, 100);
      expect(Math.abs(anchorX - 0)).toBeLessThan(10);
      expect(Math.abs(anchorY - 0)).toBeLessThan(10);
    });

    it("applies local joint rotation and scaling around a deform pin", () => {
      // Pin at (50, 50) rotated +90 degrees counter-clockwise (in screen coords +X -> +Y)
      const rotatedPins = rotatePuppetPin(
        [createPuppetPin(50, 50, "deform", "joint")],
        "joint",
        90,
      );
      // Point at (70, 50) is +20px on X axis from (50, 50); rotating +90 deg maps it to (50, 70)
      const [rx, ry] = computeDeformedPosition(70, 50, rotatedPins, 120);
      expect(rx).toBeCloseTo(50, 1);
      expect(ry).toBeCloseTo(70, 1);

      // Scaling by 2x around (50, 50) maps (60, 50) to (70, 50)
      const scaledPins = scalePuppetPin(
        [createPuppetPin(50, 50, "deform", "joint")],
        "joint",
        2,
      );
      const [sx, sy] = computeDeformedPosition(60, 50, scaledPins, 120);
      expect(sx).toBeCloseTo(70, 1);
      expect(sy).toBeCloseTo(50, 1);
    });

    it("updates all mesh vertices upon deformPuppetMesh", () => {
      const mesh = buildPuppetLatticeMesh(100, 100, 2, 2);
      const pins = movePuppetPin([createPuppetPin(50, 50, "deform", "center")], "center", 80, 80);

      const deformed = deformPuppetMesh(mesh, pins, 100);
      const centerVertex = deformed.vertices.find((v) => v.restX === 50 && v.restY === 50);
      expect(centerVertex?.currX).toBeGreaterThan(50);
      expect(centerVertex?.currY).toBeGreaterThan(50);
    });

    it("rasterizes deformed mesh via inverse barycentric mapping with bilinear sampling", () => {
      const width = 32;
      const height = 32;
      const source = new Uint8ClampedArray(width * height * 4);
      // Paint a bright red square at [8..16, 8..16]
      for (let y = 8; y <= 16; y++) {
        for (let x = 8; x <= 16; x++) {
          const idx = (y * width + x) * 4;
          source[idx] = 255;
          source[idx + 1] = 20;
          source[idx + 2] = 40;
          source[idx + 3] = 255;
        }
      }

      const mesh = buildPuppetLatticeMesh(width, height, 4, 4);
      // Shift the red square region by +6px X, +4px Y
      const pins = movePuppetPin(
        [createPuppetPin(12, 12, "deform", "p-shift")],
        "p-shift",
        18,
        16,
      );
      const deformed = deformPuppetMesh(mesh, pins, 64);
      const warped = rasterizePuppetWarpedBuffer(source, width, height, deformed, pins);

      // The shifted center at (18, 16) should now contain the red pixel
      const shiftedIdx = (16 * width + 18) * 4;
      expect(warped[shiftedIdx]).toBe(255);
      expect(warped[shiftedIdx + 3]).toBe(255);
    });
  });
});

