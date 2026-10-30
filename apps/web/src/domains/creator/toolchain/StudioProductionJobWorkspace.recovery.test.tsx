// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioProductionJobWorkspace } from "./StudioProductionJobWorkspace";
import { createStudioProductionJobRepository, openStudioProductionJobRepository, type StudioProductionJobRepository } from "./studio-production-job-repository";
import type { StudioProductionJob } from "./studio-production-jobs";
import { StudioToonBridgeClient } from "./studio-toonbridge-client";
import type { StudioToonBridgeConnectionState } from "./useStudioToonBridgeConnection";

vi.mock("./studio-production-job-repository", async (importOriginal) => ({
  ...await importOriginal<typeof import("./studio-production-job-repository")>(),
  openStudioProductionJobRepository: vi.fn(),
}));

function deferred<Value>() {
  let resolve: (value: Value) => void = () => { throw new Error("준비 전 Promise"); };
  let reject: (reason: Error) => void = () => { throw new Error("준비 전 Promise"); };
  const promise = new Promise<Value>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

function repository() {
  const values = new Map<string, string>();
  return createStudioProductionJobRepository({ acquireDatabase: async () => ({
    async kvGet(namespace, key) { return values.get(`${namespace}:${key}`) ?? null; },
    async kvSet(namespace, key, value) { values.set(`${namespace}:${key}`, value); },
  }) });
}

function connection(): StudioToonBridgeConnectionState {
  const client = new StudioToonBridgeClient({ baseUrl: "http://127.0.0.1:49631", token: "f".repeat(40) });
  vi.spyOn(client, "listJobs").mockResolvedValue([]);
  vi.spyOn(client, "getJob").mockRejectedValue(new Error("실물 실행기 조회를 허용하지 않는 fixture"));
  return {
    settings: client.settings, status: { protocol: "toonstudio.production-toolchain", version: 2, serviceVersion: "fixture", activeJobs: 0, retainedJobs: 0 },
    probes: [{ toolId: "blender", state: "available", version: "5.2.0", executable: true, reason: "fixture" }],
    connected: true, loading: false, error: null, client,
    setBaseUrl: vi.fn(), setToken: vi.fn(), connect: vi.fn(async () => undefined), refresh: vi.fn(async () => undefined), disconnect: vi.fn(),
  };
}

function selectFile(container: HTMLElement) {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("실제 입력 파일 필드를 찾을 수 없습니다.");
  fireEvent.change(input, { target: { files: [new File(["source"], "fixture.blend", { type: "application/x-blender" })] } });
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("실제 작업 큐의 복구 경계", () => {
  it("이력 로드 전에는 작업을 시작하지 않고 로드 후 선택한 파일을 유지한다", async () => {
    const store = repository(), loaded = deferred<readonly StudioProductionJob[]>();
    const slow: StudioProductionJobRepository = { ...store, load: () => loaded.promise };
    vi.mocked(openStudioProductionJobRepository).mockReturnValue(slow);
    const runner = connection();
    if (!runner.client) throw new Error("연결 fixture가 필요합니다.");
    const create = vi.spyOn(runner.client, "createJob").mockRejectedValue(new Error("자동 생성을 허용하지 않는 fixture"));
    const page = render(<StudioProductionJobWorkspace profile="open" projectId="project-a" connection={runner} />);
    selectFile(page.container);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "작업 시작" }).disabled).toBe(true);
    expect(create).not.toHaveBeenCalled();
    await act(async () => { loaded.resolve([]); });
    await waitFor(() => expect(screen.getByRole<HTMLButtonElement>("button", { name: "작업 시작" }).disabled).toBe(false));
    expect(screen.getByText("fixture.blend")).toBeTruthy();
  });

  it.each(["success", "failure"] as const)("프로젝트 전환 뒤 이전 준비 요청의 %s는 업로드·실행·현재 알림으로 이어지지 않는다", async (outcome) => {
    vi.mocked(openStudioProductionJobRepository).mockReturnValue(repository());
    const runner = connection(), pending = deferred<StudioProductionJob>();
    if (!runner.client) throw new Error("연결 fixture가 필요합니다.");
    const create = vi.spyOn(runner.client, "createJob").mockReturnValue(pending.promise);
    const upload = vi.spyOn(runner.client, "uploadInput").mockRejectedValue(new Error("실물 업로드를 허용하지 않는 fixture"));
    const start = vi.spyOn(runner.client, "startJob").mockRejectedValue(new Error("실물 실행을 허용하지 않는 fixture"));
    const page = render(<StudioProductionJobWorkspace profile="open" projectId="project-a" connection={runner} />);
    selectFile(page.container);
    await waitFor(() => expect(screen.getByRole<HTMLButtonElement>("button", { name: "작업 시작" }).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "작업 시작" }));
    expect(create).toHaveBeenCalledOnce();
    const requested = create.mock.calls[0]?.[0];
    if (!requested) throw new Error("실제 생성 요청이 필요합니다.");
    page.rerender(<StudioProductionJobWorkspace profile="open" projectId="project-b" connection={runner} />);
    await waitFor(() => expect(screen.getByText("이 기기에 이력 저장")).toBeTruthy());
    await act(async () => {
      if (outcome === "success") pending.resolve({ ...requested, status: "preparing" });
      else pending.reject(new Error("이전 프로젝트의 준비 요청 실패"));
    });
    expect(create.mock.calls[0]?.[1]?.aborted).toBe(true);
    expect(upload).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
    expect(screen.queryByText(/이전 프로젝트의 준비 요청 실패|작업을 시작했습니다/u)).toBeNull();
    expect(screen.getByText("아직 제작 작업이 없습니다.")).toBeTruthy();
  });
});
