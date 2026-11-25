// @vitest-environment jsdom
import { StrictMode, useState } from "react";

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OpfsSnapshotVcsTab } from "./OpfsSnapshotVcsTab";
import { StudioWebcodecsOpfsPanel } from "./StudioWebcodecsOpfsPanel";
import * as vcs from "./opfs-snapshot-vcs";
import { InMemoryVfsAdapter } from "./opfs-vfs-adapter";

vi.mock("./opfs-snapshot-vcs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./opfs-snapshot-vcs")>();
  return { ...actual, createOpfsVfsAdapter: vi.fn() };
});

class FailOnceAdapter extends InMemoryVfsAdapter {
  private failure: { readonly operation: "read" | "write"; readonly path: string; readonly name: string } | null = null;

  failNext(operation: "read" | "write", path: string, name = "QuotaExceededError"): void {
    this.failure = { operation, path, name };
  }

  private checkFailure(operation: "read" | "write", path: string): void {
    if (this.failure?.operation !== operation || this.failure.path !== path) return;
    const { name } = this.failure;
    this.failure = null;
    throw new DOMException("테스트 저장소 접근 실패", name);
  }

  override async readFile(path: string): Promise<Uint8Array | null> {
    this.checkFailure("read", path);
    return super.readFile(path);
  }

  override async writeFile(path: string, data: Uint8Array): Promise<void> {
    this.checkFailure("write", path);
    return super.writeFile(path, data);
  }
}

function TestPanel() {
  const [notice, setNotice] = useState("");
  return (
    <>
      <p role="status">{notice}</p>
      <OpfsSnapshotVcsTab onNotify={setNotice} />
    </>
  );
}

async function mountTab(adapter: FailOnceAdapter) {
  vi.mocked(vcs.createOpfsVfsAdapter).mockResolvedValue(adapter);
  const initialization = vi.spyOn(vcs, "createSeededWebtoonVcs");
  const callIndex = initialization.mock.calls.length;
  const mounted = render(<TestPanel />);
  await waitFor(() => {
    expect(initialization.mock.results[callIndex]?.type).toBe("return");
  });
  const result = initialization.mock.results[callIndex];
  if (result?.type !== "return") throw new Error("실제 저장소 초기화 결과가 없습니다.");
  // 시드 해시 계산의 속도 대신 실제 초기화 완료와 React 반영을 기다린다.
  await act(async () => { await result.value; });
  expect(screen.getByRole("button", { name: "스냅샷 커밋" }).hasAttribute("disabled")).toBe(false);
  return { ...mounted, ...await result.value };
}

function expectFailure(operation: string, reason = "저장 공간이 부족합니다"): void {
  const error = screen.getByRole("alert").textContent;
  expect(error).toContain(`${operation} 실패`);
  expect(error).toContain(reason);
  expect(screen.getByRole("status").textContent).toBe(error);
  expect(screen.getByRole("status").textContent).not.toContain("저장 완료");
}

async function expectPreserved(
  engine: vcs.OpfsSnapshotVcsEngine,
  adapter: FailOnceAdapter,
  history: readonly vcs.VcsCommitObject[],
  snapshot: vcs.VcsProjectSnapshot,
): Promise<void> {
  const head = history[0];
  if (!head) throw new Error("검증할 기존 HEAD가 없습니다.");
  expect(engine.currentHeadCommitId).toBe(head.id);
  expect(engine.getCommitHistory()).toEqual(history);
  expect(await engine.restoreCommit(head.id)).toEqual(snapshot);
  expect(screen.getByText("HEAD").parentElement?.textContent).toContain(head.id);
  const reopened = await vcs.createSeededWebtoonVcs(adapter);
  expect(reopened.engine.currentHeadCommitId).toBe(head.id);
  expect(reopened.engine.getCommitHistory()).toEqual(history);
  expect(reopened.latestSnapshot).toEqual(snapshot);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.mocked(vcs.createOpfsVfsAdapter).mockReset();
});

describe("OPFS 탭 저장 실패 안내와 재시도", () => {
  it.each(["성공", "실패"] as const)("저장 대기 중 연타·다른 변경을 차단하고 %s 뒤 잠금과 입력을 회복한다", async (outcome) => {
    const adapter = new FailOnceAdapter();
    const seeded = await vcs.createSeededWebtoonVcs(adapter);
    await seeded.engine.createBranch("night");
    const mounted = await mountTab(adapter);
    const history = mounted.engine.getCommitHistory();
    const gate = Promise.withResolvers<void>();
    const originalCommit = mounted.engine.commit.bind(mounted.engine);
    const commit = vi.spyOn(mounted.engine, "commit").mockImplementationOnce(async (...args) => {
      await gate.promise;
      return originalCommit(...args);
    });
    const createBranch = vi.spyOn(mounted.engine, "createBranch");
    const checkout = vi.spyOn(mounted.engine, "checkoutBranch");
    const rollback = vi.spyOn(mounted.engine, "rollbackToCommit");
    fireEvent.change(screen.getByLabelText("커밋 메시지"), { target: { value: "대기 중인 저장 초안" } });
    fireEvent.change(screen.getByLabelText("레이어 변경 시뮬레이션"), { target: { value: "add-fx" } });
    const saveButton = screen.getByRole("button", { name: "스냅샷 커밋" });
    const otherButtons = [
      screen.getByRole("button", { name: "night (2)" }),
      screen.getByRole("button", { name: "브랜치 분기" }),
      screen.getByRole("button", { name: "원클릭 롤백" }),
    ];

    // React가 disabled 상태를 반영하기 전 같은 이벤트 묶음의 연타도 잠금으로 막는다.
    act(() => {
      saveButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      saveButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      for (const button of otherButtons) button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(commit).toHaveBeenCalledTimes(1);
    expect(createBranch).not.toHaveBeenCalled();
    expect(checkout).not.toHaveBeenCalled();
    expect(rollback).not.toHaveBeenCalled();
    for (const button of [saveButton, ...otherButtons]) expect(button.hasAttribute("disabled")).toBe(true);
    expect(screen.getByLabelText("커밋 메시지").hasAttribute("disabled")).toBe(true);
    expect(screen.getByLabelText("레이어 변경 시뮬레이션").hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("스냅샷 저장 중입니다. 완료 후 다음 작업을 할 수 있습니다.")).toBeTruthy();
    expect(mounted.engine.getCommitHistory()).toEqual(history);

    await act(async () => {
      if (outcome === "실패") gate.reject(new DOMException("대기 후 저장 실패", "QuotaExceededError"));
      else gate.resolve();
    });
    await waitFor(() => expect(saveButton.hasAttribute("disabled")).toBe(false));
    if (outcome === "실패") {
      expectFailure("스냅샷 저장");
      expect(screen.getByLabelText<HTMLInputElement>("커밋 메시지").value).toBe("대기 중인 저장 초안");
      await expectPreserved(mounted.engine, adapter, history, mounted.latestSnapshot);
    } else {
      expect(screen.getByRole("status").textContent).toContain("저장 완료");
      expect(screen.getByLabelText<HTMLInputElement>("커밋 메시지").value).toBe("");
      expect(mounted.engine.getCommitHistory()).toHaveLength(history.length + 1);
    }
    for (const button of [saveButton, ...otherButtons]) expect(button.hasAttribute("disabled")).toBe(false);
    expect(screen.getByLabelText("커밋 메시지").hasAttribute("disabled")).toBe(false);
    expect(screen.queryByText("스냅샷 저장 중입니다. 완료 후 다음 작업을 할 수 있습니다.")).toBeNull();

    fireEvent.click(saveButton);
    await waitFor(() => expect(commit).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(saveButton.hasAttribute("disabled")).toBe(false));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("저장 완료"));
    expect(screen.queryByRole("alert")).toBeNull();
    const reopened = await vcs.createSeededWebtoonVcs(adapter);
    const addedLayers = reopened.latestSnapshot.layers.filter((layer) => layer.layerId.startsWith("layer-spark-"));
    expect(addedLayers.map((layer) => layer.layerId)).toEqual(
      outcome === "실패" ? ["layer-spark-3"] : ["layer-spark-3", "layer-spark-4"],
    );
    expect(reopened.engine.getCommitHistory()).toHaveLength(history.length + (outcome === "실패" ? 1 : 2));
  });

  it("저장 실패가 이전 성공 안내를 대체하고 초안·원고·HEAD를 보존한 뒤 같은 변경을 재시도한다", async () => {
    const adapter = new FailOnceAdapter();
    const mounted = await mountTab(adapter);
    fireEvent.click(screen.getByRole("button", { name: "스냅샷 커밋" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("저장 완료"));
    const history = mounted.engine.getCommitHistory();
    const original = await mounted.engine.restoreCommit(history[0]?.id ?? "");
    fireEvent.change(screen.getByLabelText("커밋 메시지"), { target: { value: "용량 확보 후 저장할 초안" } });
    fireEvent.change(screen.getByLabelText("레이어 변경 시뮬레이션"), { target: { value: "add-fx" } });
    adapter.failNext("write", "refs/heads/main");

    fireEvent.click(screen.getByRole("button", { name: "스냅샷 커밋" }));
    await screen.findByRole("alert");
    expectFailure("스냅샷 저장");
    expect(screen.getByLabelText<HTMLInputElement>("커밋 메시지").value).toBe("용량 확보 후 저장할 초안");
    expect(screen.getByLabelText<HTMLSelectElement>("레이어 변경 시뮬레이션").value).toBe("add-fx");
    expect(screen.queryByText("용량 확보 후 저장할 초안")).toBeNull();
    await expectPreserved(mounted.engine, adapter, history, original);

    fireEvent.click(screen.getByRole("button", { name: "스냅샷 커밋" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("저장 완료"));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByLabelText<HTMLInputElement>("커밋 메시지").value).toBe("");
    expect(mounted.engine.getCommitHistory()).toHaveLength(history.length + 1);
    const saved = await mounted.engine.restoreCommit(mounted.engine.currentHeadCommitId ?? "");
    expect(saved.layers.slice(0, -1)).toEqual(original.layers);
    expect(saved.layers.at(-1)?.layerId).toBe("layer-spark-4");

    mounted.unmount();
    const reopened = await mountTab(adapter);
    expect(screen.getByText("용량 확보 후 저장할 초안")).toBeTruthy();
    expect(reopened.latestSnapshot).toEqual(saved);
    expect(reopened.engine.getCommitHistory()).toHaveLength(history.length + 1);
  });

  it("브랜치 전환 실패가 활성 브랜치와 원고를 유지하며 같은 버튼으로 회복한다", async () => {
    const adapter = new FailOnceAdapter();
    const seeded = await vcs.createSeededWebtoonVcs(adapter);
    await seeded.engine.createBranch("night");
    const mounted = await mountTab(adapter);
    const history = mounted.engine.getCommitHistory();
    adapter.failNext("write", "HEAD", "NotAllowedError");

    fireEvent.click(screen.getByRole("button", { name: "night (2)" }));
    await screen.findByRole("alert");
    expectFailure("브랜치 전환", "테스트 저장소 접근 실패");
    expect(mounted.engine.currentBranch).toBe("main");
    expect(screen.getByRole("button", { name: "main (2)" }).getAttribute("aria-pressed")).toBe("true");
    await expectPreserved(mounted.engine, adapter, history, mounted.latestSnapshot);

    fireEvent.click(screen.getByRole("button", { name: "night (2)" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain('"night" 브랜치로 전환했습니다'));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(mounted.engine.currentBranch).toBe("night");
    const reopened = await vcs.createSeededWebtoonVcs(adapter);
    expect(reopened.engine.currentBranch).toBe("night");
    expect(reopened.latestSnapshot).toEqual(mounted.latestSnapshot);
  });

  it("롤백 저장 실패가 기존 HEAD·원고·입력을 유지하며 재시도 때만 복원 이력을 추가한다", async () => {
    const adapter = new FailOnceAdapter();
    const mounted = await mountTab(adapter);
    const history = mounted.engine.getCommitHistory();
    const target = history.at(-1);
    if (!target) throw new Error("롤백 대상이 없습니다.");
    const expected = await mounted.engine.restoreCommit(target.id);
    const draft = screen.getByLabelText<HTMLInputElement>("커밋 메시지").value;
    adapter.failNext("write", "refs/heads/main");

    fireEvent.click(screen.getByRole("button", { name: "원클릭 롤백" }));
    await screen.findByRole("alert");
    expectFailure("스냅샷 롤백");
    expect(screen.getByLabelText<HTMLInputElement>("커밋 메시지").value).toBe(draft);
    await expectPreserved(mounted.engine, adapter, history, mounted.latestSnapshot);

    fireEvent.click(screen.getByRole("button", { name: "원클릭 롤백" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("무손실 롤백을 완료했습니다"));
    expect(screen.queryByRole("alert")).toBeNull();
    const reopened = await vcs.createSeededWebtoonVcs(adapter);
    expect(reopened.latestSnapshot).toEqual(expected);
    expect(reopened.engine.getCommitHistory()).toHaveLength(history.length + 1);
  });

  it("새 브랜치 저장 실패가 입력과 기존 이력을 보존하고 같은 이름의 재시도를 허용한다", async () => {
    const adapter = new FailOnceAdapter();
    const mounted = await mountTab(adapter);
    const history = mounted.engine.getCommitHistory();
    adapter.failNext("write", "refs/heads/alt-lighting");

    fireEvent.click(screen.getByRole("button", { name: "브랜치 분기" }));
    await screen.findByRole("alert");
    expectFailure("브랜치 분기");
    expect(screen.getByLabelText<HTMLInputElement>("새 브랜치 이름").value).toBe("alt-lighting");
    expect(screen.queryByRole("button", { name: "alt-lighting (2)" })).toBeNull();
    await expectPreserved(mounted.engine, adapter, history, mounted.latestSnapshot);

    fireEvent.click(screen.getByRole("button", { name: "브랜치 분기" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("분기하고 체크아웃했습니다"));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByLabelText<HTMLInputElement>("새 브랜치 이름").value).toBe("");
    const reopened = await vcs.createSeededWebtoonVcs(adapter);
    expect(reopened.engine.currentBranch).toBe("alt-lighting");
    expect(reopened.latestSnapshot).toEqual(mounted.latestSnapshot);
  });

  it("분기는 저장됐지만 전환이 실패하면 생성된 브랜치를 표시해 전환을 재시도한다", async () => {
    const adapter = new FailOnceAdapter();
    const mounted = await mountTab(adapter);
    const history = mounted.engine.getCommitHistory();
    adapter.failNext("write", "HEAD");

    fireEvent.click(screen.getByRole("button", { name: "브랜치 분기" }));
    await screen.findByRole("alert");
    expectFailure('"alt-lighting" 브랜치 생성 후 전환');
    expect(screen.getByLabelText<HTMLInputElement>("새 브랜치 이름").value).toBe("alt-lighting");
    await expectPreserved(mounted.engine, adapter, history, mounted.latestSnapshot);

    fireEvent.click(screen.getByRole("button", { name: "alt-lighting (2)" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("브랜치로 전환했습니다"));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(mounted.engine.currentBranch).toBe("alt-lighting");
  });

  it("StrictMode 초기화 접근 오류는 작업을 비활성화하고 같은 컴포넌트에서 기존 저장소를 다시 연다", async () => {
    const adapter = new FailOnceAdapter();
    const original = await vcs.createSeededWebtoonVcs(adapter);
    const history = original.engine.getCommitHistory();
    vi.mocked(vcs.createOpfsVfsAdapter).mockResolvedValue(adapter);
    adapter.failNext("read", "HEAD", "NotAllowedError");
    render(<StrictMode><TestPanel /></StrictMode>);

    await screen.findByRole("alert");
    expectFailure("OPFS 초기화", "테스트 저장소 접근 실패");
    expect(screen.getByRole("button", { name: "스냅샷 커밋" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "브랜치 분기" }).hasAttribute("disabled")).toBe(true);
    expect(vcs.createOpfsVfsAdapter).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText("커밋 메시지"), { target: { value: "연결 회복 후 저장할 초안" } });

    fireEvent.click(screen.getByRole("button", { name: "저장소 다시 연결" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("저장소에 다시 연결했습니다."));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: "저장소 다시 연결" })).toBeNull();
    expect(screen.getByRole("button", { name: "스냅샷 커밋" }).hasAttribute("disabled")).toBe(false);
    expect(screen.getByLabelText<HTMLInputElement>("커밋 메시지").value).toBe("연결 회복 후 저장할 초안");
    expect(vcs.createOpfsVfsAdapter).toHaveBeenCalledTimes(2);
    await expectPreserved(original.engine, adapter, history, original.latestSnapshot);
  });

  it("첫 manifest 저장 뒤 참조 실패를 알리고 재연결하면 원본 이력으로 작업을 회복한다", async () => {
    let blockRef = true;
    class InitialRefFailureAdapter extends FailOnceAdapter {
      override async writeFile(path: string, data: Uint8Array): Promise<void> {
        if (blockRef && path === "refs/heads/main" && data.byteLength > 0) {
          throw new DOMException("첫 참조 저장 실패", "QuotaExceededError");
        }
        await super.writeFile(path, data);
      }
    }
    const adapter = new InitialRefFailureAdapter();
    vi.mocked(vcs.createOpfsVfsAdapter).mockResolvedValue(adapter);
    render(<StrictMode><TestPanel /></StrictMode>);
    await screen.findByRole("alert");
    expectFailure("OPFS 초기화");
    expect(screen.getByRole("button", { name: "스냅샷 커밋" }).hasAttribute("disabled")).toBe(true);
    const manifests = await adapter.listFiles("objects/commits");
    expect(manifests).toHaveLength(1);
    const id = manifests[0]?.replace(/\.json$/, "") ?? "";
    const pending = new vcs.OpfsSnapshotVcsEngine({ adapter });
    await pending.init();
    const original = pending.getCommit(id);
    const originalSnapshot = await pending.restoreCommit(id);
    const originalManifest = await adapter.readFile(`objects/commits/${id}.json`);
    fireEvent.change(screen.getByLabelText("커밋 메시지"), { target: { value: "복구 후 저장할 초안" } });

    blockRef = false;
    fireEvent.click(screen.getByRole("button", { name: "저장소 다시 연결" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("저장소에 다시 연결했습니다."));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "스냅샷 커밋" }).hasAttribute("disabled")).toBe(false);
    expect(screen.getByLabelText<HTMLInputElement>("커밋 메시지").value).toBe("복구 후 저장할 초안");
    expect(screen.getByText("HEAD").parentElement?.textContent).toContain(id);
    const reopened = await vcs.createSeededWebtoonVcs(adapter);
    expect(reopened.engine.getCommitHistory()).toEqual([original]);
    expect(reopened.latestSnapshot).toEqual(originalSnapshot);
    expect(await adapter.readFile(`objects/commits/${id}.json`)).toEqual(originalManifest);
    expect(await adapter.listFiles("objects/commits")).toEqual(manifests);

    fireEvent.click(screen.getByRole("button", { name: "스냅샷 커밋" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("저장 완료"));
    const saved = await vcs.createSeededWebtoonVcs(adapter);
    expect(saved.engine.getCommitHistory()).toHaveLength(2);
    expect(saved.engine.getCommitHistory()[0]?.parentId).toBe(id);
    expect(saved.engine.getCommitHistory()[1]).toEqual(original);
  });

  it.each(["opfs", "memory-vfs"] as const)("부모 %s 표시는 연결 전·실패 때 미확인이며 재연결 후 확인한 backend만 알린다", async (backend) => {
    const adapter = new FailOnceAdapter();
    await vcs.createSeededWebtoonVcs(adapter);
    vi.spyOn(vcs.OpfsSnapshotVcsEngine.prototype, "backendKind", "get").mockReturnValue(backend);
    const backendLabel = backend === "opfs" ? "OPFS 영구 저장소 활성" : "메모리 VFS 안전 폴백";
    vi.mocked(vcs.createOpfsVfsAdapter).mockResolvedValue(adapter);
    adapter.failNext("read", "HEAD", "NotAllowedError");
    render(<StudioWebcodecsOpfsPanel initialTab="opfs-vcs" />);

    expect(screen.getByText("저장소 연결 미확인")).toBeTruthy();
    expect(screen.queryByText("OPFS 영구 저장소 활성")).toBeNull();
    expect(screen.queryByText("메모리 VFS 안전 폴백")).toBeNull();
    await screen.findByRole("alert");
    expect(screen.getByText("저장소 연결 미확인")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "저장소 다시 연결" }));
    await screen.findByText(backendLabel);
    expect(screen.queryByText("저장소 연결 미확인")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "희소 타일 · 2D 칼만 예측" }));
    adapter.failNext("read", "HEAD", "NotAllowedError");
    fireEvent.click(screen.getByRole("tab", { name: "OPFS 브랜치 · 스냅샷 복원" }));
    await screen.findByRole("alert");
    expect(screen.getByText("저장소 연결 미확인")).toBeTruthy();
    expect(screen.queryByText("메모리 VFS 안전 폴백")).toBeNull();
    expect(screen.queryByText("OPFS 영구 저장소 활성")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "저장소 다시 연결" }));
    await screen.findByText(backendLabel);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
