// @vitest-environment jsdom
// 숨긴(visible:false) 도형은 클릭을 받지 않는다.
//
// 배경: three 의 Raycaster 는 visible 을 보지 않아, 자동 단면이나 눈 아이콘으로 숨긴 앞벽이 그대로 클릭을
// 가로챘다 — 보이는 책상을 눌러도 보이지 않는 벽이 선택됐다. 실제 BgPrimitiveMesh 를 R3F 에 올리고
// 포인터 이벤트를 보내 어느 도형이 선택되는지 본다(WebGL 은 쓰지 않고 렌더러만 가짜로 둔다).

import { createRoot, events, extend } from "@react-three/fiber";
import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { BgPrimitiveMesh } from "./StudioBg3dSceneNodes";

import type { BgPrimitive } from "../studio-background-3d-metadata";

extend(THREE as never);

const noop = () => undefined;

function fakeRenderer(canvas: HTMLCanvasElement): never {
  return {
    domElement: canvas,
    render: noop,
    setSize: noop,
    setPixelRatio: noop,
    setClearAlpha: noop,
    setClearColor: noop,
    getPixelRatio: () => 1,
    getSize: (target: { set: (width: number, height: number) => void }) => target.set(100, 100),
    dispose: noop,
    forceContextLoss: noop,
    compile: noop,
    setAnimationLoop: noop,
    shadowMap: { enabled: false, type: 0 },
    xr: { enabled: false, addEventListener: noop, removeEventListener: noop, setAnimationLoop: noop, isPresenting: false },
    capabilities: {},
    info: { autoReset: true, reset: noop },
    outputColorSpace: "srgb",
    toneMapping: 0,
  } as never;
}

function pointerEvent(type: string, x: number, y: number): Event {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
  Object.defineProperty(event, "offsetX", { value: x });
  Object.defineProperty(event, "offsetY", { value: y });
  Object.defineProperty(event, "pointerId", { value: 1 });
  return event;
}

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 60));

// 카메라(z=8)에서 화면 가운데를 보면 앞벽(z=3)이 책상(z=0)보다 가깝고, 둘 다 가운데에 걸친다.
const wall = (visible: boolean): BgPrimitive =>
  ({
    id: "wall",
    kind: "box",
    name: "앞벽 벽체",
    position: [0, 0, 3],
    rotation: [0, 0, 0],
    scale: [8, 6, 0.15],
    color: "#ffffff",
    visible,
  }) as BgPrimitive;
const desk = {
  id: "desk",
  kind: "box",
  name: "책상 상판",
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
  color: "#d9c9a3",
} as BgPrimitive;

async function mountScene() {
  const canvas = document.createElement("canvas");
  document.body.appendChild(canvas);
  const root = createRoot(canvas);
  await root.configure({
    gl: fakeRenderer(canvas),
    size: { width: 100, height: 100, top: 0, left: 0 },
    events,
    frameloop: "never",
    dpr: 1,
    camera: { position: [0, 0, 8], fov: 50, near: 0.1, far: 100 },
  } as never);
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const pool = { get: () => ({ geometry, edges: new THREE.EdgesGeometry(geometry) }) };
  const selected: string[] = [];
  const groups = new Map<string, THREE.Object3D>();

  async function render(prims: readonly BgPrimitive[]) {
    root.render(
      <>
        {prims.map((prim) => (
          <BgPrimitiveMesh
            key={prim.id}
            prim={prim}
            geometryPool={pool as never}
            lineArt={false}
            showEdges={false}
            selected={false}
            onSelect={(id: string) => selected.push(id)}
            onSurfacePick={() => false}
            registerRef={(id: string, group: THREE.Object3D | null) => {
              if (group) groups.set(id, group);
            }}
          />
        ))}
      </>,
    );
    await settle();
    // 렌더 루프를 돌리지 않으므로 월드 행렬을 직접 갱신해야 광선이 도형의 실제 위치에 닿는다.
    for (const group of groups.values()) {
      let top: THREE.Object3D = group;
      while (top.parent) top = top.parent;
      top.updateMatrixWorld(true);
    }
  }

  /** 화면 가운데를 눌러(포인터 다운 + 클릭) 선택된 id 를 돌려준다. */
  async function clickCenter(): Promise<readonly string[]> {
    selected.length = 0;
    canvas.dispatchEvent(pointerEvent("pointerdown", 50, 50));
    canvas.dispatchEvent(pointerEvent("click", 50, 50));
    await settle();
    return [...selected];
  }

  return {
    render,
    clickCenter,
    dispose: () => {
      root.unmount();
      canvas.remove();
    },
  };
}

describe("숨긴 도형은 클릭을 가로채지 않는다", () => {
  it("대조군: 보이는 앞벽은 뒤의 책상보다 먼저 클릭을 받는다(이 시험의 클릭이 실제로 도달한다)", async () => {
    const scene = await mountScene();
    try {
      await scene.render([wall(true), desk]);
      expect(await scene.clickCenter()).toEqual(["wall"]);
    } finally {
      scene.dispose();
    }
  });

  it("숨긴 앞벽(visible:false) 뒤의 보이는 책상이 선택된다", async () => {
    const scene = await mountScene();
    try {
      await scene.render([wall(false), desk]);
      expect(await scene.clickCenter()).toEqual(["desk"]);
    } finally {
      scene.dispose();
    }
  });

  it("같은 도형을 숨겼다 되살리면 클릭 대상이 따라 바뀐다(핸들러가 붙었다 떨어진다)", async () => {
    const scene = await mountScene();
    try {
      await scene.render([wall(true), desk]);
      expect(await scene.clickCenter()).toEqual(["wall"]);
      await scene.render([wall(false), desk]);
      expect(await scene.clickCenter()).toEqual(["desk"]);
      await scene.render([wall(true), desk]);
      expect(await scene.clickCenter()).toEqual(["wall"]);
    } finally {
      scene.dispose();
    }
  });

  it("숨긴 도형만 있는 곳을 눌러도 아무것도 선택되지 않는다", async () => {
    const scene = await mountScene();
    try {
      await scene.render([wall(false)]);
      expect(await scene.clickCenter()).toEqual([]);
    } finally {
      scene.dispose();
    }
  });
});
