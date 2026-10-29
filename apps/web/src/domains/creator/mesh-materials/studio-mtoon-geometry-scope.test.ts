import { MToonMaterial } from "@pixiv/three-vrm";
import { BoxGeometry, DoubleSide, Group, Mesh, MeshDepthMaterial, MeshNormalMaterial, MeshStandardMaterial, Scene } from "three";
import type { Material } from "three";
import { describe, expect, it, vi } from "vitest";

import { beginStudioMToonGeometryScope } from "./studio-mtoon-geometry-scope";
import { StudioMToonMaterial } from "./studio-mtoon-webgl-runtime";

function fixture() {
  const geometry = new BoxGeometry(), body = new StudioMToonMaterial({ side: DoubleSide }), outline = body.clone();
  outline.isOutline = true;
  const ordinary = new MeshStandardMaterial(), invisible = new MeshStandardMaterial({ visible: false });
  const mesh = new Mesh(geometry, [body, outline, ordinary, invisible]);
  const sibling = new Mesh(geometry, body), hidden = new Group(), ignored = new Mesh(geometry, new StudioMToonMaterial());
  hidden.visible = false; hidden.add(ignored);
  const scene = new Scene(); scene.add(mesh, sibling, hidden);
  const fallback = new MeshNormalMaterial();
  return { geometry, body, outline, mesh, sibling, scene, fallback, ordinary, invisible,
    dispose() { geometry.dispose(); body.dispose(); outline.dispose(); ordinary.dispose(); invisible.dispose(); ignored.material.dispose(); fallback.dispose(); } };
}

describe("툰 기하 pass의 본체·group·수명", () => {
  it("본체만 별도 재질로 제출하고 outline·숨긴 slot은 그리지 않으며 원본 group과 배열을 즉시 복원한다", async () => {
    const f = fixture(), original = f.mesh.material, groups = JSON.stringify(f.geometry.groups), beforeOverride = new MeshDepthMaterial();
    f.scene.overrideMaterial = beforeOverride;
    const bodyPass = new MeshNormalMaterial({ side: DoubleSide }), disposed = vi.fn(); bodyPass.addEventListener("dispose", disposed);
    const factory = vi.fn(() => bodyPass), pending = Promise.withResolvers<void>();
    const scope = beginStudioMToonGeometryScope({ scene: f.scene, backend: "webgl", fallbackMaterial: f.fallback, createBodyPass: factory });
    try {
      const result = scope.submit(() => {
        expect(f.scene.overrideMaterial).toBeNull();
        expect(Array.isArray(f.mesh.material)).toBe(true);
        if (!Array.isArray(f.mesh.material)) throw new Error("pass 배열이 없습니다.");
        expect(f.mesh.material[0]).toBe(bodyPass); expect(f.mesh.material[1]?.visible).toBe(false);
        expect(f.mesh.material[2]).toBe(f.fallback); expect(f.mesh.material[3]?.visible).toBe(false);
        expect(f.sibling.material).toBe(bodyPass); expect(bodyPass.side).toBe(DoubleSide);
        return pending.promise;
      });
      expect(factory).toHaveBeenCalledExactlyOnceWith(f.body);
      expect(f.mesh.material).toBe(original); expect(f.sibling.material).toBe(f.body); expect(f.scene.overrideMaterial).toBe(beforeOverride);
      expect(JSON.stringify(f.geometry.groups)).toBe(groups); expect(disposed).not.toHaveBeenCalled();
      pending.resolve(); await result; scope.dispose(); scope.dispose(); expect(disposed).toHaveBeenCalledOnce();
    } finally { scope.dispose(); beforeOverride.dispose(); f.dispose(); }
  });

  it("일반·미등록 레거시는 기존 override 경로를 유지하고 실패한 제출도 원래 재질로 복원한다", () => {
    const geometry = new BoxGeometry(), raw = new MToonMaterial(), mesh = new Mesh(geometry, raw), scene = new Scene(), fallback = new MeshDepthMaterial();
    scene.add(mesh); const factory = vi.fn(() => new MeshDepthMaterial());
    const scope = beginStudioMToonGeometryScope({ scene, backend: "webgl", fallbackMaterial: fallback, createBodyPass: factory });
    try {
      expect(() => scope.submit(() => { expect(scene.overrideMaterial).toBe(fallback); expect(mesh.material).toBe(raw); throw new Error("제출 실패"); })).toThrow("제출 실패");
      expect(scene.overrideMaterial).toBeNull(); expect(mesh.material).toBe(raw); expect(factory).not.toHaveBeenCalled();
    } finally { scope.dispose(); raw.dispose(); geometry.dispose(); fallback.dispose(); }
  });

  it("뒤쪽 본체 준비 실패 시 이미 소유한 임시 재질만 정리한다", () => {
    const f = fixture(), second = new StudioMToonMaterial(); f.scene.add(new Mesh(f.geometry, second));
    const pass = new MeshNormalMaterial(), disposed = vi.fn(), sourceDisposed = vi.fn(); pass.addEventListener("dispose", disposed); f.body.addEventListener("dispose", sourceDisposed);
    const factory = vi.fn<(source: Material) => Material>().mockReturnValueOnce(pass).mockImplementationOnce(() => { throw new Error("준비 실패"); });
    const scope = beginStudioMToonGeometryScope({ scene: f.scene, backend: "webgl", fallbackMaterial: f.fallback, createBodyPass: factory });
    try {
      expect(() => scope.submit(() => {})).toThrow("준비 실패"); scope.dispose();
      expect(disposed).toHaveBeenCalledOnce(); expect(sourceDisposed).not.toHaveBeenCalled(); expect(f.sibling.material).toBe(f.body);
    } finally { scope.dispose(); second.dispose(); f.dispose(); }
  });

  it("준비 후 callback·배열 변경과 중첩 제출·조기 dispose를 거부한다", () => {
    const f = fixture();
    const prepare = () => beginStudioMToonGeometryScope({ scene: f.scene, backend: "webgl", fallbackMaterial: f.fallback, createBodyPass: () => new MeshNormalMaterial() });
    const scope = prepare(), changed = prepare();
    try {
      scope.submit(() => { expect(() => scope.submit(() => {})).toThrow("제출 중"); expect(() => scope.dispose()).toThrow("제출 중"); });
      expect(() => scope.submit(() => {})).toThrow("이미 제출");
      const update = f.body.update; f.body.update = () => {};
      expect(() => changed.submit(() => {})).toThrow("본체·외곽선 재질 계약"); f.body.update = update;
      if (!Array.isArray(f.mesh.material)) throw new Error("원본 배열이 없습니다.");
      f.mesh.material[0] = f.ordinary;
      expect(() => changed.submit(() => {})).toThrow("재질 연결");
    } finally { scope.dispose(); changed.dispose(); f.dispose(); }
  });

  it("새 visible mesh와 ordinary visibility 변경은 거부하고 본체 side는 제출 순간 복제한다", () => {
    const f = fixture(), prepare = () => beginStudioMToonGeometryScope({ scene: f.scene, backend: "webgl", fallbackMaterial: f.fallback,
      createBodyPass: (source) => new MeshNormalMaterial({ side: source.side }) });
    const added = prepare(), visibility = prepare(), fresh = prepare(), newMesh = new Mesh(f.geometry, f.body);
    try {
      f.scene.add(newMesh); expect(() => added.submit(() => {})).toThrow("재질 연결"); f.scene.remove(newMesh);
      f.ordinary.visible = false; expect(() => visibility.submit(() => {})).toThrow("재질 연결"); f.ordinary.visible = true;
      f.body.side = 0;
      fresh.submit(() => { if (!Array.isArray(f.mesh.material)) throw new Error("pass 배열이 없습니다."); expect(f.mesh.material[0]?.side).toBe(0); });
    } finally { added.dispose(); visibility.dispose(); fresh.dispose(); f.dispose(); }
  });
});
