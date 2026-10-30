import { CompressedTexture, DataTexture, Matrix3, RGBAFormat, UniformsUtils } from "three";
import { describe, expect, it, vi } from "vitest";

import { cloneStudioMToonTextureSnapshot, shieldStudioMToonTextureSnapshotClone } from "./studio-mtoon-texture-snapshot";

function texture() {
  const source = new DataTexture(new Uint8Array([23, 71, 191, 149]), 1, 1, RGBAFormat);
  source.offset.set(.2, -.3); source.repeat.set(.7, 1.4); source.center.set(.1, .6); source.rotation = .4;
  source.needsUpdate = true;
  return source;
}

describe("원본 TextureSource 시계를 보존하는 sampling snapshot", () => {
  it("DataTexture subclass·image payload를 유지하고 auto matrix는 복제본에서만 고정한다", () => {
    const source = texture(), before = { version: source.version, sourceVersion: source.source.version, uuid: source.uuid,
      matrix: source.matrix.clone(), source: source.source, data: source.image.data };
    const disposed = vi.fn(); source.addEventListener("dispose", disposed);
    const snapshot = cloneStudioMToonTextureSnapshot(source);
    try {
      expect(snapshot).toBeInstanceOf(DataTexture); expect(snapshot).not.toBe(source);
      expect(snapshot.source).not.toBe(source.source); expect(snapshot.source.data).toBe(source.source.data);
      expect(snapshot.matrixAutoUpdate).toBe(false);
      expect(snapshot.matrix).toEqual(new Matrix3().setUvTransform(.2, -.3, .7, 1.4, .4, .1, .6));
      expect(source.matrix).toEqual(before.matrix); expect(source.matrixAutoUpdate).toBe(true);
      source.offset.set(9, 9); source.updateMatrix();
      expect(snapshot.offset.toArray()).toEqual([.2, -.3]);
      expect(snapshot.matrix).not.toEqual(source.matrix);
      expect(source.version).toBe(before.version); expect(source.source.version).toBe(before.sourceVersion);
      expect(source.uuid).toBe(before.uuid); expect(source.source).toBe(before.source); expect(source.image.data).toBe(before.data);
    } finally { snapshot.dispose(); }
    expect(disposed).not.toHaveBeenCalled(); source.dispose();
  });

  it("수동 matrix와 압축 texture의 공개 subclass·sampling 속성을 그대로 보존한다", () => {
    const source = new CompressedTexture([{ data: new Uint8Array([1, 2, 3, 4]), width: 1, height: 1 }], 1, 1);
    source.matrixAutoUpdate = false; source.matrix.set(1, .2, -.3, .4, 1, .6, 0, 0, 1);
    const sourceVersion = source.source.version, snapshot = cloneStudioMToonTextureSnapshot(source);
    try {
      expect(snapshot).toBeInstanceOf(CompressedTexture); expect(snapshot.matrix).toEqual(source.matrix);
      expect(snapshot.matrix).not.toBe(source.matrix); expect(snapshot.mipmaps).toEqual(source.mipmaps);
      expect(snapshot.minFilter).toBe(source.minFilter); expect(snapshot.format).toBe(source.format);
      expect(source.source.version).toBe(sourceVersion);
    } finally { snapshot.dispose(); source.dispose(); }
  });

  it("실제 UniformsUtils.clone이 shield의 clone만 사용하며 원본 source.version을 올리지 않는다", () => {
    const source = texture(), version = source.version, sourceVersion = source.source.version, originalClone = source.clone;
    const clones: ReturnType<typeof cloneStudioMToonTextureSnapshot>[] = [];
    const uniform = UniformsUtils.clone({ map: { value: shieldStudioMToonTextureSnapshotClone(source, (snapshot) => { clones.push(snapshot); }) } });
    try {
      expect(clones).toHaveLength(1); expect(uniform.map?.value).toBe(clones[0]);
      expect(source.clone).toBe(originalClone); expect(source.version).toBe(version); expect(source.source.version).toBe(sourceVersion);
      expect(clones[0]?.source.data).toBe(source.source.data);
    } finally { clones.forEach((snapshot) => snapshot.dispose()); source.dispose(); }
  });

  it("수거 callback 실패에서도 독립 clone만 정리한다", () => {
    const source = texture(), sourceDisposed = vi.fn(), snapshotDisposed = vi.fn(), version = source.source.version;
    source.addEventListener("dispose", sourceDisposed);
    const shield = shieldStudioMToonTextureSnapshotClone(source, (snapshot) => {
      snapshot.addEventListener("dispose", snapshotDisposed); throw new Error("수거 실패 fixture");
    });
    expect(() => shield.clone()).toThrow(/수거 실패/u);
    expect(snapshotDisposed).toHaveBeenCalledOnce(); expect(sourceDisposed).not.toHaveBeenCalled();
    expect(source.source.version).toBe(version); source.dispose();
  });
});
