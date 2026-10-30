// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode, Ref } from "react";
import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioMToonMaterial } from "../mesh-materials/studio-mtoon-webgl-runtime";
import type { StudioBg3dEditableThreeClone } from "../studio-background-3d-model";
import { BgCustomModelMesh } from "./StudioBg3dCustomModelMesh";

type CloneFactory = typeof import("../studio-background-3d-model")["createStudioBg3dEditableThreeClone"];
interface FrameState { readonly clock: { readonly elapsedTime: number }; readonly camera: THREE.PerspectiveCamera; readonly size: { readonly width: number; readonly height: number } }
type Frame = (state: FrameState, delta: number) => void;
const f = vi.hoisted(() => ({ clone: vi.fn<CloneFactory>(), frames: new Set<Frame>() }));
vi.mock("../studio-background-3d-model", async (load) => ({ ...await load<typeof import("../studio-background-3d-model")>(), createStudioBg3dEditableThreeClone: f.clone }));
vi.mock("@react-three/fiber", async () => {
  const { useLayoutEffect } = await import("react");
  return { useFrame: (callback: Frame) => { useLayoutEffect(() => { f.frames.add(callback); return () => { f.frames.delete(callback); }; }, [callback]); } };
});
/** DOM lifecycle와 실제 Three 객체를 연결한다. Fiber renderer·GPU compile 증거는 아니다. */
vi.mock("react/jsx-dev-runtime", async (load) => {
  const actual = await load<typeof import("react/jsx-dev-runtime")>(), react = await import("react"), three = await import("three");
  function GroupHost({ forwardedRef, children }: { readonly forwardedRef: Ref<THREE.Group> | undefined; readonly children: ReactNode }) {
    const [group] = react.useState(() => new three.Group()); react.useImperativeHandle(forwardedRef, () => group);
    return actual.jsxDEV("div", { children }, undefined, false, undefined, undefined);
  }
  const jsxDEV: typeof actual.jsxDEV = (type, props, key, isStaticChildren, source, self) => {
    const record = props && typeof props === "object" ? props as Record<string, unknown> : {};
    if (type === "group") return actual.jsxDEV(GroupHost, { forwardedRef: record.ref as Ref<THREE.Group> | undefined, children: record.children as ReactNode }, key, false, source, self);
    if (type === "primitive") {
      const object = record.object; if (!(object instanceof three.Object3D)) throw new Error("actual clone Object3D가 없습니다.");
      return actual.jsxDEV("span", { "data-testid": "clone-root", "data-object-uuid": object.uuid }, key, false, source, self);
    }
    return actual.jsxDEV(type, props, key, isStaticChildren, source, self);
  };
  return { ...actual, jsxDEV };
});

const releases: Array<() => void> = [];
beforeEach(() => { f.clone.mockReset(); f.frames.clear(); });
afterEach(() => { cleanup(); releases.splice(0).reverse().forEach((release) => release()); vi.restoreAllMocks(); expect(f.frames.size).toBe(0); });
function fixture() {
  const geometry = new THREE.BoxGeometry(), body = new StudioMToonMaterial({ opacity: 1 }); body.uvAnimationScrollXSpeedFactor = .4;
  const root = new THREE.Group(); root.add(new THREE.Mesh(geometry, body));
  const sourceDisposed = vi.fn(), geometryDisposed = vi.fn(); body.addEventListener("dispose", sourceDisposed); geometry.addEventListener("dispose", geometryDisposed);
  releases.push(() => { body.dispose(); geometry.dispose(); });
  return { root, body, sourceDisposed, geometryDisposed };
}
async function actualClone(root: THREE.Group) {
  const actual = await vi.importActual<typeof import("../studio-background-3d-model")>("../studio-background-3d-model");
  const clone = await actual.createStudioBg3dEditableThreeClone(root); releases.push(() => clone.dispose()); return clone;
}
function body(clone: StudioBg3dEditableThreeClone): StudioMToonMaterial {
  const mesh = clone.root.children[0]; if (!(mesh instanceof THREE.Mesh) || !(mesh.material instanceof StudioMToonMaterial)) throw new Error("actual instance 재질이 없습니다.");
  return mesh.material;
}
function mount(root: THREE.Group) {
  const status = vi.fn();
  const element = (cachedRoot: THREE.Group) => <BgCustomModelMesh
    instance={{ id: "placement", modelId: "model", position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }} cachedRoot={cachedRoot}
    animations={[]} selected={false} capturing={false} targetFps={30} lodBias={1} onSelect={vi.fn()} onSurfacePick={() => false}
    registerRef={vi.fn()} registerAnimationTime={vi.fn()} registerRigBake={vi.fn()} onAnimationComplete={vi.fn()} onCloneStatus={status}
  />;
  return { view: render(element(root)), status, element };
}
async function finish(pending: PromiseWithResolvers<StudioBg3dEditableThreeClone>, clone: StudioBg3dEditableThreeClone) {
  await act(async () => { pending.resolve(clone); await pending.promise; });
}

describe("actual BG3D component의 MToon 인스턴스 수명", () => {
  it("골격 animation이 없어도 매 frame delta를 instance 재질에만 전달하고 unmount하면 갱신·소유 자원을 정리한다", async () => {
    const source = fixture(), clone = await actualClone(source.root), sibling = await actualClone(source.root);
    const pending = Promise.withResolvers<StudioBg3dEditableThreeClone>(); f.clone.mockReturnValue(pending.promise);
    const host = mount(source.root); await waitFor(() => expect(f.clone).toHaveBeenCalledOnce()); await finish(pending, clone);
    expect(screen.getByTestId("clone-root").getAttribute("data-object-uuid")).toBe(clone.root.uuid);
    const current = body(clone), siblingBody = body(sibling);
    const sourceOffset = source.body.uniforms.uvAnimationScrollXOffset?.value;
    const siblingOffset = siblingBody.uniforms.uvAnimationScrollXOffset?.value;
    const state: FrameState = { clock: { elapsedTime: 1 }, camera: new THREE.PerspectiveCamera(), size: { width: 100, height: 100 } };
    act(() => { f.frames.forEach((frame) => frame(state, .25)); });
    expect(current.uniforms.uvAnimationScrollXOffset?.value).toBeCloseTo(.1);
    expect(source.body.uniforms.uvAnimationScrollXOffset?.value).toBe(sourceOffset);
    expect(siblingBody.uniforms.uvAnimationScrollXOffset?.value).toBe(siblingOffset);
    const disposed = vi.fn(); current.addEventListener("dispose", disposed); host.view.unmount();
    expect(f.frames.size).toBe(0); expect(disposed).toHaveBeenCalledOnce(); expect(source.sourceDisposed).not.toHaveBeenCalled(); expect(source.geometryDisposed).not.toHaveBeenCalled();
  });

  it("unmount 뒤 도착한 actual clone은 부착하거나 ready를 알리지 않고 instance 재질만 한 번 해제한다", async () => {
    const source = fixture(), clone = await actualClone(source.root), disposed = vi.fn(); body(clone).addEventListener("dispose", disposed);
    const pending = Promise.withResolvers<StudioBg3dEditableThreeClone>(); f.clone.mockReturnValue(pending.promise);
    const host = mount(source.root); await waitFor(() => expect(f.clone).toHaveBeenCalledOnce()); host.view.unmount(); await finish(pending, clone);
    expect(disposed).toHaveBeenCalledOnce(); expect(screen.queryByTestId("clone-root")).toBeNull();
    expect(host.status.mock.calls.some(([, phase]) => phase === "ready")).toBe(false);
    expect(source.sourceDisposed).not.toHaveBeenCalled(); expect(source.geometryDisposed).not.toHaveBeenCalled();
  });

  it("source 교체에서 늦은 A는 해제하고 B만 표시하며 B의 frame/update 수명을 유지한다", async () => {
    const a = fixture(), b = fixture(), cloneA = await actualClone(a.root), cloneB = await actualClone(b.root);
    const pendingA = Promise.withResolvers<StudioBg3dEditableThreeClone>(), pendingB = Promise.withResolvers<StudioBg3dEditableThreeClone>();
    f.clone.mockReturnValueOnce(pendingA.promise).mockReturnValueOnce(pendingB.promise);
    const disposedA = vi.fn(), disposedB = vi.fn(); body(cloneA).addEventListener("dispose", disposedA); body(cloneB).addEventListener("dispose", disposedB);
    const host = mount(a.root); await waitFor(() => expect(f.clone).toHaveBeenCalledOnce()); host.view.rerender(host.element(b.root));
    await waitFor(() => expect(f.clone).toHaveBeenCalledTimes(2)); await finish(pendingB, cloneB); await finish(pendingA, cloneA);
    expect(screen.getByTestId("clone-root").getAttribute("data-object-uuid")).toBe(cloneB.root.uuid);
    expect(disposedA).toHaveBeenCalledOnce(); expect(disposedB).not.toHaveBeenCalled();
    expect(a.sourceDisposed).not.toHaveBeenCalled(); expect(b.sourceDisposed).not.toHaveBeenCalled();
    host.view.unmount(); expect(disposedB).toHaveBeenCalledOnce();
  });
});
