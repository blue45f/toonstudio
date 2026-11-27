// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_VRM_PROP_RIG_METRICS } from "./studio-vrm-prop-rig";
import { createPropInstance } from "./studio-vrm-props";
import { StudioVrmPropAttachment } from "./StudioVrmWardrobePropsProjection";

import type { VRM } from "@pixiv/three-vrm";

const runtime = vi.hoisted(() => ({
  acquire: vi.fn(),
  frame: null as ((state: unknown, delta: number) => void) | null,
}));
vi.mock("@react-three/fiber", async (original) => ({
  ...await original<typeof import("@react-three/fiber")>(),
  useFrame: (frame: NonNullable<typeof runtime.frame>) => { runtime.frame = frame; },
}));
vi.mock("./studio-vrm-prop-asset-runtime", () => ({ acquireStudioVrmPropAsset: runtime.acquire }));
afterEach(() => { cleanup(); runtime.acquire.mockReset(); runtime.frame = null; });

function mount() {
  const bone = new THREE.Bone();
  bone.position.set(2, 3, 4);
  const scene = new THREE.Group();
  scene.add(bone);
  const vrm = { scene, humanoid: { getNormalizedBoneNode: () => bone } } as unknown as VRM;
  const instance = createPropInstance("glasses", "glasses-1")!;
  const report = vi.fn();
  // Hold the actual R3F group's ref open so its commit can be delayed independently of the GLB.
  const view = renderHook(() => StudioVrmPropAttachment({
    vrm, instance, metrics: DEFAULT_VRM_PROP_RIG_METRICS, onAttachmentStatus: report,
  }));
  return { view, report };
}

describe("one-point smart prop capture receipt", () => {
  it("reports readiness only after the real bone transform, recovering from an absent group", async () => {
    const asset = new THREE.Group();
    let finish!: () => void;
    runtime.acquire.mockImplementation(() => new Promise((resolve) => {
      finish = () => resolve({ object: asset, released: false, release: vi.fn() });
    }));
    const { view, report } = mount();
    await act(async () => finish());
    runtime.frame?.({}, 1 / 60);
    expect(report).toHaveBeenLastCalledWith("glasses-1", "glasses", "unavailable");
    expect(report.mock.calls.some(([, , status]) => status === "ready")).toBe(false);

    const group = new THREE.Group();
    const element = view.result.current as { props: { ref: { current: THREE.Group | null } } } | null;
    expect(element).not.toBeNull();
    element!.props.ref.current = group;
    new THREE.Scene().add(group);
    group.add(asset);
    runtime.frame?.({}, 1 / 60);
    expect(group.position.length()).toBeGreaterThan(4);
    expect(report).toHaveBeenLastCalledWith("glasses-1", "glasses", "ready");
  });

  it("retains the failed GLB identity and never emits ready without its mesh", async () => {
    runtime.acquire.mockRejectedValue(new Error("404"));
    const { view, report } = mount();
    await act(async () => {});
    runtime.frame?.({}, 1 / 60);
    expect(view.result.current).toBeNull();
    expect(report).toHaveBeenCalledWith("glasses-1", "glasses", "unavailable", "asset-load-failed");
    expect(report.mock.calls.some(([, , status]) => status === "ready")).toBe(false);
  });
});
