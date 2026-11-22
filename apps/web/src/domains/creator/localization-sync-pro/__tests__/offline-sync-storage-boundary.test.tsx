// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { IDBDatabase as FakeIDBDatabase, IDBFactory, IDBObjectStore as FakeIDBObjectStore } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createOfflineFirstSyncBridge } from "../studio-offline-first-sync-bridge";
import { OFFLINE_SYNC_LEGACY_MAX_BYTES, readOfflineSyncLegacySnapshot, type OfflineSyncLegacySource } from "../studio-offline-sync-legacy-export";
import { StudioLocalizationAiSyncPanel } from "../StudioLocalizationAiSyncPanel";
import { StudioOfflineSyncLegacyExport } from "../StudioOfflineSyncLegacyExport";

const downloads = vi.hoisted(() => ({ downloadBlob: vi.fn<(blob: Blob, filename: string) => void>() }));
vi.mock("../../export/studio-export", () => downloads);
const PROJECT = "existing-project";
const KEY = `toonstudio:local-first-sync:v1:project:${PROJECT}`;
let factory: IDBFactory;

function legacyRaw(projectId = PROJECT, overrides: Readonly<Record<string, unknown>> = {}): string {
  const bridge = createOfflineFirstSyncBridge(projectId);
  bridge.enqueueLocalMutation({ surface: "plotr", entityId: "existing-scene", patch: { title: "기존 원고 제목", ready: true }, nowMs: 123 });
  return JSON.stringify({ ...bridge.getState(), authority: "local-first", storageBackend: "indexeddb-mirror", ...overrides }, null, 2);
}

async function seedIndexedDb(raw: string, key = KEY): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = factory.open("toonstudio_offline_sync_v1", 1);
    request.onupgradeneeded = () => { request.result.createObjectStore("snapshots"); };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction("snapshots", "readwrite");
      transaction.objectStore("snapshots").put(raw, key);
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onabort = () => { db.close(); reject(transaction.error); };
    };
  });
}

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("문자열 아님"));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

beforeEach(() => {
  factory = new IDBFactory();
  vi.stubGlobal("indexedDB", factory);
  window.localStorage.clear();
  downloads.downloadBlob.mockClear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("동기화 샘플의 제품 저장 권위 분리", () => {
  it("실제 패널의 초기화·4개 샘플 편집·동기화가 기존 LS/IDB를 읽거나 변경하지 않는다", async () => {
    const original = legacyRaw();
    window.localStorage.setItem(KEY, original);
    window.localStorage.setItem("studio-project-document", "사용자 원고 원본");
    await seedIndexedDb(original);
    const read = vi.spyOn(Storage.prototype, "getItem");
    const write = vi.spyOn(Storage.prototype, "setItem");
    const open = vi.spyOn(factory, "open");
    const put = vi.spyOn(FakeIDBObjectStore.prototype, "put");
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("시연의 외부 전송은 허용하지 않음"));
    render(<StudioLocalizationAiSyncPanel projectId={PROJECT} sourceLines={[{ id: "user-line", sourceText: "사용자 실제 대사" }]} />);
    fireEvent.click(screen.getByRole("tab", { name: "로컬 AI·협업 동기화" }));
    const section = screen.getByRole("region", { name: "오프라인 동기화 시연" });
    expect(within(section).getByText(/현재 세션 메모리에만/u)).toBeTruthy();
    for (const button of within(section).getAllByRole("button", { name: /샘플 변경 기록/u })) fireEvent.click(button);
    expect(within(section).getByText("4건")).toBeTruthy();
    fireEvent.click(within(section).getByRole("button", { name: "오프라인 전환" }));
    fireEvent.click(within(section).getByRole("button", { name: "시연 동기화" }));
    await waitFor(() => expect(within(section).getByRole("status").textContent).toContain("화면을 닫으면 사라집니다"));
    fireEvent.click(within(section).getByRole("button", { name: "온라인 복귀" }));
    fireEvent.click(within(section).getByRole("button", { name: "시연 동기화" }));
    await waitFor(() => expect(within(section).getByRole("status").textContent).toContain("메모리 동기화 시연: 반영 4건"));
    expect(fetch).not.toHaveBeenCalled();
    expect(read.mock.calls.some(([key]) => key === KEY)).toBe(false);
    expect(write.mock.calls.some(([key]) => key === KEY)).toBe(false);
    expect(open).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(KEY)).toBe(original);
    expect(window.localStorage.getItem("studio-project-document")).toBe("사용자 원고 원본");
    expect(createOfflineFirstSyncBridge(PROJECT).getState()).toMatchObject({ authority: "session-demo", storageBackend: "memory", queue: [] });
  });
});

describe("명시적 이전 사본 내보내기", () => {
  it("서로 다른 LS와 IDB 사본을 합치거나 최신으로 간주하지 않고 각 원문을 반환한다", async () => {
    const local = legacyRaw(PROJECT, { syncedOpCount: 3 });
    const mirror = legacyRaw(PROJECT, { syncedOpCount: 7 });
    window.localStorage.setItem(KEY, local);
    window.localStorage.setItem(`${KEY}-other`, "다른 작품 원본");
    await seedIndexedDb(mirror);
    const write = vi.spyOn(Storage.prototype, "setItem");
    const remove = vi.spyOn(Storage.prototype, "removeItem");
    const put = vi.spyOn(FakeIDBObjectStore.prototype, "put");
    const transaction = vi.spyOn(FakeIDBDatabase.prototype, "transaction");
    expect(await readOfflineSyncLegacySnapshot(PROJECT, "local-storage")).toBe(local);
    expect(await readOfflineSyncLegacySnapshot(PROJECT, "indexeddb")).toBe(mirror);
    expect(transaction.mock.calls.every(([, mode]) => mode === "readonly")).toBe(true);
    expect(write).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(KEY)).toBe(local);
    expect(window.localStorage.getItem(`${KEY}-other`)).toBe("다른 작품 원본");
  });

  it("없는 DB는 생성하지 않으며 목록 조회를 지원하지 않으면 명시적으로 실패한다", async () => {
    const open = vi.spyOn(factory, "open");
    expect(await readOfflineSyncLegacySnapshot(PROJECT, "indexeddb")).toBeNull();
    expect(open).not.toHaveBeenCalled();
    Object.defineProperty(factory, "databases", { value: undefined, configurable: true });
    await expect(readOfflineSyncLegacySnapshot(PROJECT, "indexeddb")).rejects.toMatchObject({ code: "unavailable" });
    expect(open).not.toHaveBeenCalled();
  });

  it("목록 조회 직후 DB가 사라지면 새 DB 생성을 중단한다", async () => {
    const list = factory.databases.bind(factory);
    vi.spyOn(factory, "databases").mockResolvedValue([{ name: "toonstudio_offline_sync_v1", version: 1 }]);
    await expect(readOfflineSyncLegacySnapshot(PROJECT, "indexeddb")).rejects.toMatchObject({ code: "unavailable" });
    await waitFor(async () => expect(await list()).toEqual([]));
  });

  const invalid = [
    { label: "손상 JSON", raw: "{broken", code: "format" },
    { label: "다른 작품", raw: legacyRaw("other-project"), code: "scope" },
    { label: "잘못된 record", raw: legacyRaw(PROJECT, { records: { item: { payload: {} } } }), code: "format" },
    { label: "잘못된 queue", raw: legacyRaw(PROJECT, { queue: [{ patch: { title: "일부" } }] }), code: "format" },
    { label: "잘못된 conflict", raw: legacyRaw(PROJECT, { conflicts: [{ localRecord: null }] }), code: "format" },
    { label: "크기 초과", raw: "가".repeat(Math.floor(OFFLINE_SYNC_LEGACY_MAX_BYTES / 3) + 1), code: "size" },
  ];
  for (const source of ["local-storage", "indexeddb"] satisfies readonly OfflineSyncLegacySource[]) {
    it.each(invalid)(`${source}의 $label 사본은 거절하며 원본을 변경하지 않는다`, async ({ raw, code }) => {
      window.localStorage.setItem(KEY, source === "local-storage" ? raw : "다른 저장 위치 원본");
      if (source === "indexeddb") await seedIndexedDb(raw);
      const write = vi.spyOn(Storage.prototype, "setItem");
      const put = vi.spyOn(FakeIDBObjectStore.prototype, "put");
      const remove = vi.spyOn(FakeIDBObjectStore.prototype, "delete");
      await expect(readOfflineSyncLegacySnapshot(PROJECT, source)).rejects.toMatchObject({ code });
      expect(write).not.toHaveBeenCalled();
      expect(put).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
      expect(window.localStorage.getItem(KEY)).toBe(source === "local-storage" ? raw : "다른 저장 위치 원본");
    });
  }

  it("실제 버튼을 누를 때만 선택한 출처의 원문 Blob을 내려받고 원본을 보존한다", async () => {
    const local = legacyRaw(PROJECT, { syncedOpCount: 2 });
    const mirror = legacyRaw(PROJECT, { syncedOpCount: 9 });
    window.localStorage.setItem(KEY, local);
    await seedIndexedDb(mirror);
    const read = vi.spyOn(Storage.prototype, "getItem");
    const open = vi.spyOn(factory, "open");
    render(<StudioOfflineSyncLegacyExport projectId={PROJECT} />);
    expect(read).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    expect(downloads.downloadBlob).not.toHaveBeenCalled();
    for (const [label, source, raw] of [["localStorage", "local-storage", local], ["IndexedDB", "indexeddb", mirror]] as const) {
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: `${label} 사본 JSON 내보내기` }));
        await vi.dynamicImportSettled();
      });
      await waitFor(() => expect(screen.getByRole("status").textContent).toContain(`${label}: 검증한 원문 JSON`));
      const call = downloads.downloadBlob.mock.calls.at(-1);
      expect(call?.[1]).toBe(`toonstudio-offline-sync-${source}-original.json`);
      if (!call) throw new Error("다운로드 호출 누락");
      expect(await readBlob(call[0])).toBe(raw);
    }
    expect(window.localStorage.getItem(KEY)).toBe(local);
    expect(await readOfflineSyncLegacySnapshot(PROJECT, "indexeddb")).toBe(mirror);
  });

  it("손상 사본은 출처와 거절 이유를 표시하며 다운로드하거나 덮지 않는다", async () => {
    window.localStorage.setItem(KEY, "{broken");
    render(<StudioOfflineSyncLegacyExport projectId={PROJECT} />);
    fireEvent.click(screen.getByRole("button", { name: "localStorage 사본 JSON 내보내기" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("localStorage: 사본 형식을 확인하지 못해"));
    expect(downloads.downloadBlob).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(KEY)).toBe("{broken");
  });

  it("작품 화면이 닫힌 뒤 도착한 IDB 결과로 다운로드를 시작하지 않는다", async () => {
    await seedIndexedDb(legacyRaw());
    const close = vi.spyOn(FakeIDBDatabase.prototype, "close");
    let release: ((value: IDBDatabaseInfo[]) => void) | undefined;
    vi.spyOn(factory, "databases").mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    const view = render(<StudioOfflineSyncLegacyExport projectId={PROJECT} />);
    fireEvent.click(screen.getByRole("button", { name: "IndexedDB 사본 JSON 내보내기" }));
    await waitFor(() => expect(release).toBeDefined());
    view.unmount();
    await act(async () => {
      release?.([{ name: "toonstudio_offline_sync_v1", version: 1 }]);
      await vi.dynamicImportSettled();
    });
    await waitFor(() => expect(close).toHaveBeenCalled());
    expect(downloads.downloadBlob).not.toHaveBeenCalled();
  });

  it("이전 작품 읽기가 진행 중이어도 새 작품 버튼은 열리고 늦은 결과를 넘기지 않는다", async () => {
    await seedIndexedDb(legacyRaw());
    const nextRaw = legacyRaw("next-project");
    window.localStorage.setItem("toonstudio:local-first-sync:v1:project:next-project", nextRaw);
    const close = vi.spyOn(FakeIDBDatabase.prototype, "close");
    let release: ((value: IDBDatabaseInfo[]) => void) | undefined;
    vi.spyOn(factory, "databases").mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    const view = render(<StudioOfflineSyncLegacyExport projectId={PROJECT} />);
    fireEvent.click(screen.getByRole("button", { name: "IndexedDB 사본 JSON 내보내기" }));
    await waitFor(() => expect(release).toBeDefined());
    view.rerender(<StudioOfflineSyncLegacyExport projectId="next-project" />);
    expect(screen.getByRole("button", { name: "localStorage 사본 JSON 내보내기" }).hasAttribute("disabled")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "localStorage 사본 JSON 내보내기" }));
    await waitFor(() => expect(downloads.downloadBlob).toHaveBeenCalledTimes(1));
    const call = downloads.downloadBlob.mock.calls[0];
    if (!call) throw new Error("새 작품 다운로드 누락");
    expect(await readBlob(call[0])).toBe(nextRaw);
    await act(async () => { release?.([{ name: "toonstudio_offline_sync_v1", version: 1 }]); });
    await waitFor(() => expect(close).toHaveBeenCalled());
    expect(downloads.downloadBlob).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toContain("localStorage: 검증한 원문 JSON");
  });
});
