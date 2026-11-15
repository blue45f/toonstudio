// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioVrmJointHandles } from "./StudioVrmJointHandles";

import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";
import type { ReactNode } from "react";

const fiberMock = vi.hoisted(() => ({
  state: null as unknown,
}));
const rafCallbacks = new Map<number, FrameRequestCallback>();
let nextRafId = 1;

vi.mock("@react-three/fiber", () => ({
  useFrame: () => undefined,
  useThree: (selector: (state: unknown) => unknown) => selector(fiberMock.state),
}));

vi.mock("@react-three/drei/web/Html.js", () => ({
  Html: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

function makeTestVrm(bones: Partial<Record<VRMHumanBoneName, THREE.Object3D>>): Pick<VRM, "humanoid"> {
  return {
    humanoid: {
      getNormalizedBoneNode: (name: VRMHumanBoneName) => bones[name] ?? null,
    },
  } as unknown as Pick<VRM, "humanoid">;
}

function flushRaf() {
  const pending = [...rafCallbacks.entries()];
  rafCallbacks.clear();
  for (const [, cb] of pending) cb(16);
}

beforeEach(() => {
  nextRafId = 1;
  rafCallbacks.clear();
  vi.stubGlobal("requestAnimationFrame", vi.fn((cb: FrameRequestCallback) => {
    const id = nextRafId++;
    rafCallbacks.set(id, cb);
    return id;
  }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn((id: number) => {
    rafCallbacks.delete(id);
  }));
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  fiberMock.state = {
    camera,
    scene: new THREE.Scene(),
    gl: {
      domElement: {
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 400 }),
      },
    },
  };
});

afterEach(() => {
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  cleanup();
  vi.unstubAllGlobals();
});

describe("VRM joint handle tab deactivation rollback", () => {
  it("rolls back uncommitted IK pole and FK joint drags when the tab becomes hidden", () => {
    const onPoleCommit = vi.fn();
    const onPoleRollback = vi.fn();
    const onBoneRotationGesture = vi.fn();
    const onInteractionActiveChange = vi.fn();
    const rightFoot = new THREE.Object3D();
    const neck = new THREE.Object3D();
    const vrm = makeTestVrm({ rightFoot, neck });

    render(
      <StudioVrmJointHandles
        vrm={vrm}
        selectedBone="neck"
        poleSceneTargets={{ rightFoot: [-0.2, 0.6, 0.4] }}
        onPoleCommit={onPoleCommit}
        onPoleRollback={onPoleRollback}
        onBoneRotationGesture={onBoneRotationGesture}
        onInteractionActiveChange={onInteractionActiveChange}
      />,
    );

    const pole = screen.getByRole("button", { name: "오른발목 IK 폴 방향 이동" });
    fireEvent.pointerDown(pole, { pointerId: 41, pointerType: "mouse", button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(pole, { pointerId: 41, pointerType: "mouse", clientX: 145, clientY: 125 });

    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(onPoleCommit).not.toHaveBeenCalled();
    expect(onPoleRollback).toHaveBeenCalledOnce();
    expect(onPoleRollback).toHaveBeenCalledWith("rightFoot", [-0.2, 0.6, 0.4]);

    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    fireEvent.pointerMove(pole, { pointerId: 41, pointerType: "mouse", clientX: 200, clientY: 180 });
    expect(onPoleCommit).not.toHaveBeenCalled();

    const fkBtn = screen.getByRole("button", { name: "목 관절 미세 조정" });
    fireEvent.pointerDown(fkBtn, { pointerId: 42, pointerType: "mouse", button: 0, clientX: 120, clientY: 120 });
    fireEvent.pointerMove(fkBtn, { pointerId: 42, pointerType: "mouse", clientX: 160, clientY: 85 });
    act(() => flushRaf());
    expect(onBoneRotationGesture.mock.calls.map((c) => c[2])).toEqual(["start", "move"]);

    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(onBoneRotationGesture.mock.calls.map((c) => c[2])).toEqual(["start", "move", "cancel"]);
    expect(onInteractionActiveChange).toHaveBeenLastCalledWith(false);
  });
});
