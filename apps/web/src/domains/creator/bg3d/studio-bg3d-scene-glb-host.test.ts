// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { writeStudioVrmExportGlb } from "../vrm/studio-vrm-export-glb-container";
import { studioBg3dModalOperationCoordinator } from "./studio-bg3d-modal-operation-coordinator";
import { createStudioBg3dSceneGlbHostPorts } from "./studio-bg3d-scene-glb-host";
import { StudioBg3dSceneGlbError } from "./studio-bg3d-scene-glb-source";
import { createSceneGlbFixture, deferredSceneGlb, disposeSceneGlbFixtures } from "./studio-bg3d-scene-glb.test-fixture";

import type { StudioBg3dSceneGlbArtifact } from "./studio-bg3d-scene-glb-artifact";
import type { StudioBg3dSceneGlbExportPorts, StudioBg3dSceneGlbExportRequest } from "./studio-bg3d-scene-glb-ports";

// host·동적 command·source는 실제 구현이다. artifact만 별도의 실제 통합 회귀와 분리한다.
const prepare = vi.hoisted(() => vi.fn<typeof import("./studio-bg3d-scene-glb-artifact")["createStudioBg3dSceneGlbArtifact"]>());
vi.mock("./studio-bg3d-scene-glb-artifact", () => ({ createStudioBg3dSceneGlbArtifact: prepare }));
const NativeURL = globalThis.URL, createObjectUrl = vi.fn(() => "blob:host-scene"), revokeObjectUrl = vi.fn();
function artifact(): StudioBg3dSceneGlbArtifact {
  return { bytes: writeStudioVrmExportGlb({ json: { asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [] }] } }),
    fileName: "현재 장면.glb", contentHash: `sha256:${"a".repeat(64)}`, exportedNodeCount: 1, hiddenNodeCount: 0 };
}
function request(signal = new AbortController().signal): StudioBg3dSceneGlbExportRequest { return { name: "현재 장면", signal }; }
function execute(ports: StudioBg3dSceneGlbExportPorts, input = request()) {
  const command = ports.onExportCurrentSceneGlb; if (!command) throw Error("실제 export port 필요"); return command(input);
}
beforeEach(() => {
  prepare.mockReset().mockImplementation(async (_source, options) => { options.assertCurrent(); return artifact(); });
  createObjectUrl.mockClear(); revokeObjectUrl.mockClear();
  vi.stubGlobal("URL", Object.assign(class extends NativeURL {}, { createObjectURL: createObjectUrl, revokeObjectURL: revokeObjectUrl }));
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  vi.useFakeTimers();
});
afterEach(() => { vi.advanceTimersByTime(1_000); vi.useRealTimers(); disposeSceneGlbFixtures(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("현재 장면 GLB의 lazy host port", () => {
  it("생성 뒤의 실제 document·framing과 원래 request signal을 읽어 한 번 다운로드한다", async () => {
    const f = await createSceneGlbFixture(false), ports = createStudioBg3dSceneGlbHostPorts(f.host), input = request();
    f.runtime.current = { ...f.runtime.current, document: { ...f.runtime.current.document, meta: { name: "최신 장면" } } };
    if (!f.framing.current) throw Error("framing 필요");
    const currentFraming = { ...f.framing.current, viewportAspect: 2 };
    f.host.viewportApiRef = { current: { readFramingState: () => currentFraming } };
    expect(ports.sceneGlbExportUnavailableReason).toBeNull(); expect(await execute(ports, input)).toMatchObject({ ok: true });
    expect(prepare).toHaveBeenCalledOnce(); expect(prepare.mock.calls[0][0].document.meta?.name).toBe("최신 장면");
    expect(prepare.mock.calls[0][0].framing.viewportAspect).toBe(2); expect(prepare.mock.calls[0][1].signal).toBe(input.signal);
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce(); expect(revokeObjectUrl).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_000); expect(revokeObjectUrl).toHaveBeenCalledExactlyOnceWith("blob:host-scene");
    expect(f.commit).not.toHaveBeenCalled(); expect(f.replace).not.toHaveBeenCalled();
  });

  it("생성 당시 불가 상태를 명령에 캐시하지 않고 최신 ready/blocked 상태를 읽는다", async () => {
    const f = await createSceneGlbFixture(false); f.host.open = false;
    const ports = createStudioBg3dSceneGlbHostPorts(f.host); expect(ports.sceneGlbExportUnavailableReason).toBeTypeOf("string");
    expect(await execute(ports)).toMatchObject({ ok: false, code: "unavailable" }); expect(prepare).not.toHaveBeenCalled();
    f.host.open = true; expect((await execute(ports)).ok).toBe(true);
    f.host.hasCloneFailure = true; expect(await execute(ports)).toMatchObject({ ok: false, code: "unavailable" }); expect(prepare).toHaveBeenCalledOnce();
  });

  it.each(["document", "framing", "session"])("lazy import 대기 중 %s 변경은 이전 요청을 actual prepare 전에 거부한다", async (kind) => {
    const f = await createSceneGlbFixture(false), ports = createStudioBg3dSceneGlbHostPorts(f.host);
    const pending = execute(ports);
    if (kind === "document") f.runtime.current = { ...f.runtime.current, document: { ...f.runtime.current.document, meta: { memo: "다른 내용" } } };
    if (kind === "framing" && f.framing.current) f.framing.current = { ...f.framing.current, viewportAspect: 1 };
    if (kind === "session") f.session.current = studioBg3dModalOperationCoordinator.beginSession();
    expect(await pending).toMatchObject({ ok: false, code: "source-changed" });
    expect(prepare).not.toHaveBeenCalled(); expect(createObjectUrl).not.toHaveBeenCalled(); expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  });

  it("import 대기 중 요청 취소·host unmount는 파일을 만들지 않고 typed 결과로 돌아온다", async () => {
    const f = await createSceneGlbFixture(false), ports = createStudioBg3dSceneGlbHostPorts(f.host), controller = new AbortController();
    const pending = execute(ports, request(controller.signal)); controller.abort();
    expect(await pending).toMatchObject({ ok: false, code: "aborted" }); expect(prepare).not.toHaveBeenCalled();
    const closing = execute(ports); f.host.open = false;
    expect(await closing).toMatchObject({ ok: false, code: "unavailable" }); expect(createObjectUrl).not.toHaveBeenCalled();
  });

  it("실제 prepare 대기 중 unmount AbortSignal을 전달하고 늦은 결과를 다운로드하지 않는다", async () => {
    const f = await createSceneGlbFixture(false), ports = createStudioBg3dSceneGlbHostPorts(f.host), controller = new AbortController();
    const gate = deferredSceneGlb<StudioBg3dSceneGlbArtifact>(), started = deferredSceneGlb<void>();
    prepare.mockImplementation(async () => { started.resolve(); return gate.promise; });
    const pending = execute(ports, request(controller.signal)); await started.promise;
    expect(prepare.mock.calls[0][1].signal).toBe(controller.signal); f.host.open = false; controller.abort(); gate.resolve(artifact());
    expect(await pending).toMatchObject({ ok: false, code: "aborted" }); expect(createObjectUrl).not.toHaveBeenCalled();
    expect(f.commit).not.toHaveBeenCalled(); expect(f.replace).not.toHaveBeenCalled();
  });

  it("실제 command의 원본 실패·성공 결과를 보존하고 명시적인 재시도에서만 파일을 만든다", async () => {
    const f = await createSceneGlbFixture(false), ports = createStudioBg3dSceneGlbHostPorts(f.host);
    prepare.mockRejectedValueOnce(new StudioBg3dSceneGlbError("asset-invalid", "정확한 원본 연결 실패"));
    expect(await execute(ports)).toEqual({ ok: false, code: "asset-invalid", messageKo: "정확한 원본 연결 실패" });
    expect(createObjectUrl).not.toHaveBeenCalled();
    expect(await execute(ports)).toMatchObject({ ok: true, fileName: "현재 장면.glb", exportedNodeCount: 1 });
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
  });

  it("framing 읽기 예외도 public Result 계약을 깨는 rejection으로 전파하지 않는다", async () => {
    const f = await createSceneGlbFixture(false), ports = createStudioBg3dSceneGlbHostPorts(f.host);
    f.host.viewportApiRef = { current: { readFramingState: () => { throw Error("viewport unavailable"); } } };
    await expect(execute(ports)).resolves.toMatchObject({ ok: false, code: "unavailable" });
    expect(prepare).not.toHaveBeenCalled(); expect(createObjectUrl).not.toHaveBeenCalled();
  });
});
