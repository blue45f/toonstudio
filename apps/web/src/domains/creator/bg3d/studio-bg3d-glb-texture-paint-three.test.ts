import { describe, expect, it } from "vitest";
import * as THREE from "three";

import {
  applyStudioBg3dGlbTexturePaint,
  collectStudioBg3dGlbTexturePaintTargets,
} from "./studio-bg3d-glb-texture-paint-three";
import type {
  StudioBg3dGlbPaintCanvas,
  StudioBg3dGlbPaintCanvas2d,
  StudioBg3dModelTexturePaint,
} from "./studio-bg3d-glb-texture-paint";

function stubContext(): StudioBg3dGlbPaintCanvas2d {
  const noop = () => undefined;
  return {
    fillStyle: "",
    strokeStyle: "",
    globalAlpha: 1,
    lineWidth: 1,
    lineCap: "round",
    lineJoin: "round",
    fillRect: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    stroke: noop,
    arc: noop,
    fill: noop,
    clearRect: noop,
    drawImage: noop,
  };
}

function stubCanvas(width: number, height: number): StudioBg3dGlbPaintCanvas {
  return { width, height, getContext: () => stubContext(), toDataURL: () => "data:image/png;base64,x" };
}

function fakeTexture(width: number, height: number): THREE.Texture {
  const texture = new THREE.Texture();
  (texture as THREE.Texture & { image: unknown }).image = { width, height };
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function fakeMesh(options: {
  withUv?: boolean;
  map?: THREE.Texture | null;
  skinned?: boolean;
}): THREE.Object3D {
  const geometry = new THREE.BufferGeometry();
  if (options.withUv !== false) {
    geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array([0, 0, 1, 1]), 2));
  }
  const material = new THREE.MeshStandardMaterial();
  material.map = options.map === undefined ? fakeTexture(256, 256) : options.map;
  const mesh = options.skinned ? new THREE.SkinnedMesh(geometry, material) : new THREE.Mesh(geometry, material);
  return mesh;
}

const paint: StudioBg3dModelTexturePaint = {
  version: 1,
  targets: [{
    targetKey: "mesh-0",
    paint: {
      version: 1,
      strokes: [{ color: "#ff0000", size: 0.04, opacity: 1, points: [[0.5, 0.5]] }],
    },
  }],
};

describe("collectStudioBg3dGlbTexturePaintTargets", () => {
  it("UV + map이 있는 메시만 대상으로 수집하고 순서를 매긴다", () => {
    const root = new THREE.Group();
    root.add(fakeMesh({}));
    root.add(fakeMesh({ withUv: false }));
    root.add(fakeMesh({ map: null }));
    const collection = collectStudioBg3dGlbTexturePaintTargets(root);
    expect(collection.targets.map((target) => target.targetKey)).toEqual(["mesh-0"]);
    expect(collection.meshCount).toBe(3);
    expect(collection.meshesWithoutUv).toBe(1);
    expect(collection.slotsWithoutTexture).toBe(1);
    expect(collection.targets[0]?.textureWidth).toBe(256);
  });

  it("스키닝 메시는 skinned로 표시된다", () => {
    const root = new THREE.Group();
    root.add(fakeMesh({ skinned: true }));
    const collection = collectStudioBg3dGlbTexturePaintTargets(root);
    expect(collection.targets[0]?.skinned).toBe(true);
  });
});

describe("applyStudioBg3dGlbTexturePaint", () => {
  it("재질의 map을 합성 텍스처로 교체하고 dispose에서 원본으로 복원한다", () => {
    const root = new THREE.Group();
    const mesh = fakeMesh({});
    root.add(mesh);
    const material = (mesh as THREE.Mesh).material as THREE.MeshStandardMaterial;
    const originalMap = material.map;
    const collection = collectStudioBg3dGlbTexturePaintTargets(root);
    const application = applyStudioBg3dGlbTexturePaint(collection.targets, paint, {
      createCanvas: stubCanvas,
    });
    expect(application.appliedTargetKeys).toEqual(["mesh-0"]);
    expect(material.map).not.toBe(originalMap);
    // glTF 텍스처 계약: flipY는 원본(false 기본 Texture 아님 — 원본 값을 그대로 잇는다)
    expect(material.map?.flipY).toBe(originalMap?.flipY);
    application.dispose();
    expect(material.map).toBe(originalMap);
  });

  it("페인트가 없으면 아무것도 교체하지 않는다", () => {
    const root = new THREE.Group();
    root.add(fakeMesh({}));
    const collection = collectStudioBg3dGlbTexturePaintTargets(root);
    const application = applyStudioBg3dGlbTexturePaint(collection.targets, null, {
      createCanvas: stubCanvas,
    });
    expect(application.appliedTargetKeys).toEqual([]);
  });

  it("원본이 2048보다 크면 resolutionCapped를 알린다", () => {
    const root = new THREE.Group();
    root.add(fakeMesh({ map: fakeTexture(4096, 4096) }));
    const collection = collectStudioBg3dGlbTexturePaintTargets(root);
    const application = applyStudioBg3dGlbTexturePaint(collection.targets, paint, {
      createCanvas: stubCanvas,
    });
    expect(application.resolutionCapped).toBe(true);
    application.dispose();
  });
});
