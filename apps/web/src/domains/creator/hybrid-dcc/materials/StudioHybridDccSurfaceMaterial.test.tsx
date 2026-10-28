// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { MToonMaterial } from "@pixiv/three-vrm";
import { Component, type ReactNode } from "react";
import { BackSide, BoxGeometry } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioHybridDccSurfaceMaterial } from "./StudioHybridDccSurfaceMaterial";
import { createStudioHybridDccDefaultToonMaterial, type StudioHybridDccToonMaterial } from "./studio-hybrid-dcc-toon-material";

/** R3F attach가 넘기는 실제 객체의 uuid만 DOM으로 관측한다. GPU shader compile 검증은 아니다. */
vi.mock("react/jsx-dev-runtime", async (load) => {
  const actual = await load<typeof import("react/jsx-dev-runtime")>();
  const wrap: typeof actual.jsxDEV = (type, props, key, isStaticChildren, source, self) => {
    const record = props && typeof props === "object" ? props as Record<string, unknown> : {};
    if (typeof type === "string") {
      if (type === "primitive") {
        const material = record.object;
        if (!material || typeof material !== "object" || !("uuid" in material) || typeof material.uuid !== "string") throw new Error("부착된 실제 재질 객체가 없습니다.");
        return actual.jsxDEV("span", { "data-testid": "attached-body", "data-material-uuid": material.uuid, "data-material-type": "type" in material ? material.type : "unknown", "data-attach": record.attach }, key, false, source, self);
      }
      if (type === "mesh") {
        const materials = record.material; const geometry = record.geometry;
        if (!Array.isArray(materials) || !geometry || typeof geometry !== "object" || !("uuid" in geometry)) throw new Error("외곽선의 geometry·재질 배열이 없습니다.");
        return actual.jsxDEV("span", { "data-testid": "attached-outline", "data-material-uuids": materials.map((material: unknown) => {
          if (!material || typeof material !== "object" || !("uuid" in material)) throw new Error("외곽선 재질 uuid가 없습니다.");
          return material.uuid;
        }).join(","), "data-geometry-uuid": geometry.uuid, "data-managed-dispose": record.dispose === null ? "false" : "true", "data-raycast-disabled": typeof record.raycast === "function" ? "true" : "false" }, key, false, source, self);
      }
      if (type === "meshPhysicalMaterial") return actual.jsxDEV("span", { "data-testid": "pending-pbr" }, key, false, source, self);
      if (type === "meshStandardMaterial") return actual.jsxDEV("span", { "data-testid": "wire-material" }, key, false, source, self);
    }
    return actual.jsxDEV(type, props, key, isStaticChildren, source, self);
  };
  return { ...actual, jsxDEV: wrap };
});
vi.mock("../StudioHybridDccUvCheckerMaterial", () => ({ StudioHybridDccUvCheckerMaterial: () => <span data-testid="uv-checker" /> }));

function deferred() {
  let resolve: () => void = () => { throw new Error("Promise 초기화 전입니다."); };
  let reject: (cause: Error) => void = () => { throw new Error("Promise 초기화 전입니다."); };
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function resource(input: StudioHybridDccToonMaterial) {
  const body = new MToonMaterial({ color: input.baseColorSrgb });
  const outline = input.outline.enabled ? new MToonMaterial({ side: BackSide, isOutline: true }) : null;
  const bodyDisposed = vi.fn(); const outlineDisposed = vi.fn();
  body.addEventListener("dispose", bodyDisposed); outline?.addEventListener("dispose", outlineDisposed);
  let disposed = false;
  return { input, body, outline, bodyDisposed, outlineDisposed, dispose: vi.fn(() => {
    if (disposed) return; disposed = true; body.dispose(); outline?.dispose();
  }) };
}
type MockResource = ReturnType<typeof resource>;
let created: MockResource[] = [];
let gate = deferred(); let entered = deferred();
let geometry: BoxGeometry;
let factory = vi.fn((input: StudioHybridDccToonMaterial) => { const result = resource(input); created.push(result); return result; });
beforeEach(async () => {
  created = []; gate = deferred(); entered = deferred(); geometry = new BoxGeometry();
  factory = vi.fn((input: StudioHybridDccToonMaterial) => { const result = resource(input); created.push(result); return result; });
  // Vitest의 동시 dynamic import가 실제 namespace를 반환해도 동일 factory 관측 경계를 유지한다.
  const actual = await vi.importActual<typeof import("./studio-hybrid-dcc-toon-material-runtime")>("./studio-hybrid-dcc-toon-material-runtime");
  vi.spyOn(actual, "createStudioHybridDccToonMaterialRuntime").mockImplementation(factory);
  const thisGate = gate, thisEntered = entered, thisFactory = factory;
  vi.doMock("./studio-hybrid-dcc-toon-material-runtime", async () => {
    thisEntered.resolve(); await thisGate.promise; return { createStudioHybridDccToonMaterialRuntime: thisFactory };
  });
});
afterEach(() => {
  cleanup(); created.forEach((entry) => entry.dispose()); geometry.dispose(); vi.restoreAllMocks();
});

const a = createStudioHybridDccDefaultToonMaterial();
const b: StudioHybridDccToonMaterial = { ...a, baseColorSrgb: "#405060" };
function surface(material = a, uvChecker = false, showMaterial = true, slots = [0]) {
  return <StudioHybridDccSurfaceMaterial geometry={geometry} slots={slots} bindings={Object.fromEntries(slots.map((slot) => [String(slot), material]))} color="#a0a0a0" wireColor="#202020" showMaterial={showMaterial} uvChecker={uvChecker} hasUv />;
}
const bodies = () => screen.queryAllByTestId("attached-body").map((node) => node.getAttribute("data-material-uuid"));
function entry(index = 0): MockResource { const value = created[index]; if (!value) throw new Error("생성된 실제 Three 재질이 없습니다."); return value; }
async function settleModule() { await act(async () => { gate.resolve(); }); }
async function ready() {
  const view = render(surface()); await entered.promise; await settleModule();
  await waitFor(() => expect(bodies()).toEqual([entry().body.uuid])); return view;
}
class ErrorBoundary extends Component<{ readonly children: ReactNode }, { readonly error: string }> {
  state = { error: "" };
  static getDerivedStateFromError(error: Error) { return { error: error.message }; }
  render() { return this.state.error ? <p role="alert">{this.state.error}</p> : this.props.children; }
}

describe("툰 Surface의 비동기 재질 수명 · DOM/Fiber 부착 관측", () => {
  it("실제 Three 본체의 material-N과 공유 geometry 외곽선을 부착하고 소유 재질만 한 번 폐기한다", async () => {
    const disposedGeometry = vi.fn(); geometry.addEventListener("dispose", disposedGeometry);
    const view = render(surface(a, false, true, [3, 7])); await entered.promise; await settleModule();
    await waitFor(() => expect(bodies()).toEqual(created.map(({ body }) => body.uuid)));
    expect(created).toHaveLength(2); expect(entry().body).toBeInstanceOf(MToonMaterial);
    expect(screen.getAllByTestId("attached-body").map((node) => node.getAttribute("data-attach"))).toEqual(["material-0", "material-1"]);
    const outline = screen.getByTestId("attached-outline");
    expect(outline.getAttribute("data-material-uuids")).toBe(created.map((value) => value.outline?.uuid).join(","));
    expect(outline.getAttribute("data-geometry-uuid")).toBe(geometry.uuid);
    expect(outline.getAttribute("data-managed-dispose")).toBe("false"); expect(outline.getAttribute("data-raycast-disabled")).toBe("true");
    view.unmount();
    for (const value of created) { expect(value.dispose).toHaveBeenCalledTimes(1); expect(value.bodyDisposed).toHaveBeenCalledTimes(1); expect(value.outlineDisposed).toHaveBeenCalledTimes(1); }
    expect(disposedGeometry).not.toHaveBeenCalled();
  });

  it.each(["uv", "wire"] as const)("Toon→%s→Toon 동기 재진입은 새 build 전에 폐기한 본체·외곽선을 재부착하지 않는다", async (mode) => {
    const view = await ready(); const old = entry();
    view.rerender(surface(a, mode === "uv", mode !== "wire"));
    expect(old.bodyDisposed).toHaveBeenCalledTimes(1); expect(old.outlineDisposed).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId(mode === "uv" ? "uv-checker" : "wire-material")).toBeTruthy();
    view.rerender(surface());
    expect(bodies()).toEqual([]); expect(screen.queryByTestId("attached-outline")).toBeNull();
    expect(screen.getByTestId("pending-pbr")).toBeTruthy();
    await waitFor(() => expect(bodies()).toEqual([entry(1).body.uuid]));
    expect(bodies()).not.toContain(old.body.uuid); expect(entry(1).outline?.uuid).not.toBe(old.outline?.uuid);
    expect(old.bodyDisposed).toHaveBeenCalledTimes(1);
  });

  it("A→B→A를 기다림 없이 연속 렌더해도 폐기한 A를 새 Promise 대기 중 재부착하지 않는다", async () => {
    const view = await ready(); const old = entry();
    // 이미 로드한 모듈의 동시 import는 동기 mock export로 고정한다. import 자체의 Promise는 유지된다.
    vi.doMock("./studio-hybrid-dcc-toon-material-runtime", () => ({ createStudioHybridDccToonMaterialRuntime: factory }));
    await import("./studio-hybrid-dcc-toon-material-runtime");
    view.rerender(surface(b)); view.rerender(surface(a));
    expect(old.bodyDisposed).toHaveBeenCalledTimes(1); expect(old.outlineDisposed).toHaveBeenCalledTimes(1);
    expect(bodies()).toEqual([]); expect(screen.queryByTestId("attached-outline")).toBeNull(); expect(screen.getByTestId("pending-pbr")).toBeTruthy();
    await act(async () => { await vi.dynamicImportSettled(); });
    await waitFor(() => expect(bodies()).toHaveLength(1));
    const attached = created.find(({ body }) => bodies().includes(body.uuid)); if (!attached) throw new Error("부착된 재질을 실제 생성 객체로 찾지 못했습니다.");
    // 지연 완료 순서는 계약이 아니다. 화면에 부착된 uuid의 실제 입력과 색을 확인한다.
    expect(attached.input).toEqual(a); expect(attached.body.color.getHexString()).toBe(a.baseColorSrgb.slice(1));
    expect(bodies()).not.toContain(old.body.uuid); expect(attached.bodyDisposed).not.toHaveBeenCalled();
    for (const value of created.filter((value) => value !== attached)) { expect(value.bodyDisposed).toHaveBeenCalledTimes(1); expect(value.outlineDisposed).toHaveBeenCalledTimes(1); }
  });

  it("A→B 대기 중 A로 즉시 재진입해도 이전 A를 재사용하지 않고 늦은 B를 폐기한다", async () => {
    const view = await ready(); const original = entry();
    const pending = deferred(), pendingEntered = deferred();
    vi.doMock("./studio-hybrid-dcc-toon-material-runtime", async () => {
      pendingEntered.resolve(); await pending.promise; return { createStudioHybridDccToonMaterialRuntime: factory };
    });
    view.rerender(surface(b)); await pendingEntered.promise;
    expect(created).toHaveLength(1); view.rerender(surface(a));
    expect(original.bodyDisposed).toHaveBeenCalledTimes(1); expect(original.outlineDisposed).toHaveBeenCalledTimes(1);
    expect(bodies()).toEqual([]); expect(screen.queryByTestId("attached-outline")).toBeNull();
    await act(async () => { pending.resolve(); });
    await waitFor(() => expect(created).toHaveLength(3));
    expect(factory.mock.calls.map(([value]) => value.baseColorSrgb)).toEqual([a.baseColorSrgb, b.baseColorSrgb, a.baseColorSrgb]);
    await waitFor(() => expect(bodies()).toEqual([entry(2).body.uuid]));
    expect(entry(1).bodyDisposed).toHaveBeenCalledTimes(1); expect(entry(1).outlineDisposed).toHaveBeenCalledTimes(1);
    expect(entry(2).bodyDisposed).not.toHaveBeenCalled(); expect(bodies()).not.toContain(original.body.uuid);
  });

  it.each(["unmount", "uv", "wire"] as const)("lazy module 대기 중 %s이면 늦게 생성된 실제 재질을 부착하지 않고 폐기한다", async (mode) => {
    const view = render(surface()); await entered.promise;
    expect(created).toHaveLength(0); expect(bodies()).toEqual([]);
    if (mode === "unmount") view.unmount(); else view.rerender(surface(a, mode === "uv", mode !== "wire"));
    await settleModule(); await waitFor(() => expect(created).toHaveLength(1));
    expect(entry().bodyDisposed).toHaveBeenCalledTimes(1); expect(entry().outlineDisposed).toHaveBeenCalledTimes(1);
    expect(bodies()).toEqual([]); expect(screen.queryByTestId("attached-outline")).toBeNull();
  });

  it("lazy module 실패는 PBR 완료로 숨기지 않고 오류 경계에 전달한다", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ErrorBoundary>{surface()}</ErrorBoundary>); await entered.promise;
    const original = new Error("툰 재질 모듈 로드 실패");
    const failedImport = import("./studio-hybrid-dcc-toon-material-runtime").catch((cause: unknown) => cause);
    await act(async () => { gate.reject(original); });
    const observed = await failedImport; if (!(observed instanceof Error)) throw new Error("예정된 모듈 로드 실패가 발생하지 않았습니다.");
    // Vitest가 mock factory rejection을 감싸므로 loader의 실제 오류와 원본 cause를 함께 확인한다.
    expect(observed.cause).toBe(original);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(observed.message));
    expect(screen.queryByTestId("pending-pbr")).toBeNull(); expect(bodies()).toEqual([]); expect(created).toHaveLength(0); expect(consoleError).toHaveBeenCalled();
  });

  it("두 번째 슬롯 factory 실패는 앞서 생성한 본체·외곽선을 폐기하고 오류를 노출한다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    factory.mockImplementationOnce((input) => { const value = resource(input); created.push(value); return value; }).mockImplementationOnce(() => { throw new Error("두 번째 툰 재질 검증 실패"); });
    render(<ErrorBoundary>{surface(a, false, true, [0, 1])}</ErrorBoundary>); await entered.promise; await settleModule();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("두 번째 툰 재질 검증 실패"));
    expect(entry().bodyDisposed).toHaveBeenCalledTimes(1); expect(entry().outlineDisposed).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("pending-pbr")).toBeNull(); expect(bodies()).toEqual([]);
  });
});
