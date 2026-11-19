// @vitest-environment jsdom
import { Blob as NodeBlob } from "node:buffer";
import { webcrypto } from "node:crypto";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { StudioVirtualSpaceRecordingBoothPanel, type StudioVirtualSpaceRecordingBoothPanelProps } from "./StudioVirtualSpaceRecordingBoothPanel";
import { listStudioBoothDrafts, readStudioBoothDraft, removeStudioBoothDraft, saveStudioBoothDraft } from "./studio-recording-booth-drafts";
import type { StudioRecordingBoothMediaDriver } from "./studio-virtual-space-recording-booth-media-driver";

const database = vi.hoisted(() => ({ rows: new Map<string, string>(), reject: false }));
vi.mock("../studio-local-database-runtime", () => ({
  acquireStudioLocalDatabase: async () => ({
    kvGet: async (_namespace: string, scope: string) => database.rows.get(scope) ?? null,
    kvSet: async (_namespace: string, scope: string, value: string) => {
      if (database.reject) throw new Error("quota");
      database.rows.set(scope, value);
    },
  }),
}));
vi.mock("../studio-opfs-filesystem", async importActual => {
  const real = await importActual<typeof import("../studio-opfs-filesystem")>();
  const dirs = new Map<string, ReturnType<typeof real.createStudioOpfsMemoryFileSystem>>();
  return { ...real, createStudioOpfsNativeFileSystem: (_manager: unknown, dir: string) => {
    const fs = dirs.get(dir) ?? real.createStudioOpfsMemoryFileSystem();
    dirs.set(dir, fs);
    return fs;
  } };
});
vi.mock("./studio-recording-booth-asset-client", () => ({ listStudioRecordingBoothAssets: async () => ({ items: [] }) }));

const take = { id: "take-A", sessionId: "session-A", boothId: "booth-A", durationSec: 2, mimeType: "audio/webm" as const, recordedAtMs: 2000, estimatedBytes: 4 };
const bytes = [0x1a, 0x45, 0xdf, 0xa3];
const blob = () => new Blob([Uint8Array.from(bytes)], { type: "audio/webm;codecs=opus" });
const driver: StudioRecordingBoothMediaDriver = {
  id: "capture", capture: true,
  startBoothSession: () => ({ id: take.sessionId, boothId: take.boothId, reverb: "dry", startedAtMs: Date.now(), maxDurationSec: 300 }),
  stopBoothSession: () => take,
  stopBoothSessionWithBlob: async () => ({ take, blob: blob() }),
  cancelBoothSession: () => undefined,
};
const props: StudioVirtualSpaceRecordingBoothPanelProps = {
  config: { boothId: take.boothId, roomId: "studio", reverb: "dry", maxDurationSec: 300, exclusive: false, zone: { x: 0, y: 0, width: 100, height: 100 } },
  position: { x: 50, y: 50 }, bookings: [], projectId: "work-one", actorId: "owner", driver, micMutedByUser: false,
};
const scope = JSON.stringify(["account:owner", "work-one", take.boothId]);

beforeEach(() => {
  database.rows.clear();
  database.reject = false;
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("Blob", NodeBlob);
  vi.stubGlobal("navigator", { ...navigator, locks: { request: (_key: string, action: () => unknown) => action() }, storage: { getDirectory: () => undefined } });
});
afterEach(() => vi.unstubAllGlobals());

it("편입 실패 후 부스를 다시 열어 같은 테이크와 원본 바이트를 보내고 성공한 대기 항목만 비운다", async () => {
  const upload = vi.fn(async (_source: unknown, _bytes: Blob | null) => false);
  const mount = () => render(<StudioVirtualSpaceRecordingBoothPanel {...props} onProjectAsset={upload} />);
  const first = mount();
  fireEvent.click(screen.getByRole("button", { name: "녹음 시작" }));
  fireEvent.click(await screen.findByRole("button", { name: "녹음 종료" }));
  await screen.findByText("이 기기에 보관됨");
  fireEvent.click(screen.getByRole("button", { name: "프로젝트 에셋으로 넣기" }));
  await screen.findByRole("button", { name: "다시 저장하기" });
  first.unmount();
  const second = mount();
  await screen.findByText("이 기기에 보관됨");
  const recovered = await readStudioBoothDraft(scope, take.id);
  expect([...new Uint8Array(await recovered.arrayBuffer())]).toEqual(bytes);
  expect(recovered.type).toBe("audio/webm;codecs=opus");
  upload.mockResolvedValue(true);
  fireEvent.click(screen.getByRole("button", { name: "프로젝트 에셋으로 넣기" }));
  await screen.findByText("프로젝트 에셋에 넣었어요");
  expect(upload.mock.calls[0]?.[0]).toEqual(upload.mock.calls[1]?.[0]);
  expect([...new Uint8Array(await upload.mock.calls[1]![1]!.arrayBuffer())]).toEqual(bytes);
  await waitFor(async () => expect(await listStudioBoothDrafts(scope)).toEqual([]));
  second.unmount();
  mount();
  expect(screen.queryByText("이 기기에 보관됨")).toBeNull();
});

it("다른 계정·작품에서는 로컬 녹음에 접근하지 않고 실패한 기기 쓰기는 재열기 성공으로 표시하지 않는다", async () => {
  await saveStudioBoothDraft(scope, take, blob());
  for (const other of [JSON.stringify(["account:editor", "work-one", take.boothId]), JSON.stringify(["account:owner", "work-two", take.boothId])]) {
    expect(await listStudioBoothDrafts(other)).toEqual([]);
    await expect(readStudioBoothDraft(other, take.id)).rejects.toThrow();
  }
  database.reject = true;
  render(<StudioVirtualSpaceRecordingBoothPanel {...props} projectId="space-full" />);
  fireEvent.click(screen.getByRole("button", { name: "녹음 시작" }));
  fireEvent.click(await screen.findByRole("button", { name: "녹음 종료" }));
  await screen.findByText(/기기에 보관하지 못했어요/u);
  expect(screen.queryByText("이 기기에 보관됨")).toBeNull();
  expect(screen.getByRole("button", { name: "WebM 받기" })).toBeTruthy();
});


it("같은 음원의 두 테이크에서 한 건만 지우면 다른 테이크의 원본은 재생·전송할 수 있다", async () => {
  const second = { ...take, id: "take-B", sessionId: "session-B", recordedAtMs: 4000 };
  await saveStudioBoothDraft(scope, take, blob());
  await saveStudioBoothDraft(scope, second, blob());
  await removeStudioBoothDraft(scope, take.id);
  expect((await listStudioBoothDrafts(scope)).map(entry => entry.take.id)).toEqual([second.id]);
  expect([...new Uint8Array(await (await readStudioBoothDraft(scope, second.id)).arrayBuffer())]).toEqual(bytes);
  await removeStudioBoothDraft(scope, second.id);
  expect(await listStudioBoothDrafts(scope)).toEqual([]);
});

it("기기 저장이 실패한 뒤 같은 탭에서 다시 녹음해도 예전 원본이 지워지지 않는다", async () => {
  await saveStudioBoothDraft(scope, take, blob());
  database.reject = true;
  await expect(saveStudioBoothDraft(scope, { ...take, id: "take-failed" }, blob())).rejects.toThrow();
  database.reject = false;
  expect((await listStudioBoothDrafts(scope)).map(row => row.take.id)).toEqual([take.id]);
  expect([...new Uint8Array(await (await readStudioBoothDraft(scope, take.id)).arrayBuffer())]).toEqual(bytes);
});
