// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { studioVirtualDecorationPreset, type StudioVirtualDecorationState } from "./studio-virtual-space-customization";
import { StudioVirtualDecorationSession } from "./studio-virtual-space-decoration-session";
import { createStudioVirtualDecorationSync, type StudioVirtualDecorationTransport } from "./studio-virtual-space-decoration-sync";
import { createSpaceDeviceRecordFixture } from "./studio-space-device-record.test-fixture";

const db = createSpaceDeviceRecordFixture();
vi.mock("../studio-local-database-runtime", () => ({ acquireStudioLocalDatabase: async () => db }));
beforeEach(() => { db.records.clear(); vi.clearAllMocks(); });


const scope = '["test","studio",false]';
const layout = studioVirtualDecorationPreset("creator-garden");
const snapshot = (state: StudioVirtualDecorationState, revision: number) => ({ ...state, scopeKey: scope, layoutWidth: 1280, layoutHeight: 960, revision });
describe("가구 편집의 서버 버전과 대기열", () => {
  it("첫 가구와 연속 편집을 DB 버전 0, 1 순으로 커밋한다", async () => {
    const revisions: number[] = [];
    const transport: StudioVirtualDecorationTransport = {
      load: async () => snapshot(layout, 0),
      save: async (_scope, _district, body) => {
        const { expectedRevision } = body as { expectedRevision: number };
        revisions.push(expectedRevision);
        return { kind: "ok", body: snapshot(layout, expectedRevision + 1) };
      },
    };
    const session = new StudioVirtualDecorationSession(scope, createStudioVirtualDecorationSync(transport, false));
    await Promise.all([session.load(layout), session.save(layout), session.save({ ...layout, revision: layout.revision + 1 })]);
    expect(revisions).toEqual([0, 1]);
  });
  it("다른 기기와 충돌한 뒤 대기 중인 로컬 편집이 서버 변경을 곧바로 덮어쓰지 않는다", async () => {
    const save = vi.fn<StudioVirtualDecorationTransport["save"]>().mockResolvedValueOnce({ kind: "conflict", body: { current: snapshot(layout, 7) } })
      .mockResolvedValueOnce({ kind: "ok", body: snapshot(layout, 8) });
    const session = new StudioVirtualDecorationSession(scope, createStudioVirtualDecorationSync({ load: async () => snapshot(layout, 5), save }, false));
    await session.load(layout);
    const [first, second] = await Promise.all([session.save(layout), session.save(layout)]);
    expect(first.current?.revision).toBe(7);
    expect(second.status).toBe("conflict");
    expect(save).toHaveBeenCalledTimes(1);
    expect((await session.save(layout)).status).toBe("conflict");
    await session.resolveConflict("device");
    expect(save).toHaveBeenLastCalledWith(scope, layout.districtKey, expect.objectContaining({ expectedRevision: 7 }));
  });
  it("로그아웃 전에 눌렀던 작업이 나중에 새 계정으로 발송되지 않는다", async () => {
    const save = vi.fn<StudioVirtualDecorationTransport["save"]>();
    const session = new StudioVirtualDecorationSession(scope, createStudioVirtualDecorationSync({ load: async () => snapshot(layout, 3), save }, false));
    await session.load(layout);
    const pending = session.save(layout);
    session.cancelPending();
    expect((await pending).status).toBe("local");
    expect(save).not.toHaveBeenCalled();
  });
  it("서버 저장에 실패한 뒤 새로 열어도 같은 계정의 초안을 원래 리비전에 저장한다", async () => {
    localStorage.clear();
    const server = snapshot(layout, 3);
    const changed = { ...layout, placements: [], revision: 100 };
    const save = vi.fn<StudioVirtualDecorationTransport["save"]>()
      .mockResolvedValueOnce({ kind: "unavailable" })
      .mockResolvedValueOnce({ kind: "ok", body: snapshot(changed, 4) });
    const sync = createStudioVirtualDecorationSync({ load: async () => server, save }, false);
    const original = new StudioVirtualDecorationSession(scope, sync, "alice");
    await original.load(layout);
    await original.save(changed);
    const reloaded = new StudioVirtualDecorationSession(scope, sync, "alice");
    const result = await reloaded.load(layout);
    expect(result.state.placements).toEqual([]);
    expect(result.state.revision).toBe(4);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(scope, layout.districtKey, expect.objectContaining({ expectedRevision: 3 }));
  });
  it("새 계정은 이전 초안을 읽지 않고 다른 기기의 수정은 명시적 선택 전까지 덮지 않는다", async () => {
    localStorage.clear();
    const changed = { ...layout, placements: [], revision: 200 };
    let server = snapshot(layout, 3);
    const save = vi.fn<StudioVirtualDecorationTransport["save"]>().mockResolvedValue({ kind: "unavailable" });
    const sync = createStudioVirtualDecorationSync({ load: async () => server, save }, false);
    const original = new StudioVirtualDecorationSession(scope, sync, "alice");
    await original.load(layout);
    await original.save(changed);
    server = snapshot(layout, 4);
    expect(new StudioVirtualDecorationSession(scope, sync, "bob").cachedState).toBeUndefined();
    expect(new StudioVirtualDecorationSession("other-room", sync, "alice").cachedState).toBeUndefined();
    const next = new StudioVirtualDecorationSession(scope, sync, "alice");
    expect((await next.load(layout)).status).toBe("conflict");
    expect(next.cachedState?.placements).toEqual([]);
    expect((await next.load(layout)).status).toBe("conflict");
    expect(save).toHaveBeenCalledTimes(1);
    expect((await next.resolveConflict("server"))?.state.revision).toBe(4);
    expect(new StudioVirtualDecorationSession(scope, sync, "alice").hasPendingDraft).toBe(false);
  });
  it("서버만 저장하고 응답이 끊기면 재접속에서 동일한 배치를 확인하고 다시 쓰지 않는다", async () => {
    localStorage.clear();
    const changed = { ...layout, placements: [], revision: 200 };
    let server = snapshot(layout, 5);
    const save = vi.fn<StudioVirtualDecorationTransport["save"]>(async () => {
      server = snapshot(changed, 6);
      return { kind: "unavailable" };
    });
    const sync = createStudioVirtualDecorationSync({ load: async () => server, save }, false);
    const original = new StudioVirtualDecorationSession(scope, sync, "alice");
    await original.load(layout);
    expect((await original.save(changed)).status).toBe("local");
    const restored = new StudioVirtualDecorationSession(scope, sync, "alice");
    expect((await restored.load(layout)).state.revision).toBe(6);
    expect(restored.hasPendingDraft).toBe(false);
    expect(save).toHaveBeenCalledTimes(1);
  });
  it("수정 중 도착한 다른 기기의 최신 배치를 확인하기 전에는 PUT하지 않는다", async () => {
    const save = vi.fn<StudioVirtualDecorationTransport["save"]>();
    const session = new StudioVirtualDecorationSession(scope, createStudioVirtualDecorationSync({ load: async () => snapshot(layout, 4), save }, false));
    const [, result] = await Promise.all([session.load(layout), session.save(layout)]);
    expect(result.current?.revision).toBe(4);
    expect(save).not.toHaveBeenCalled();
  });
});

it("기기의 구형 가구 배치를 되살리고 회원·작품별 새 체크포인트를 섞지 않는다", async () => {
  const { decorationStorageKey } = await import("./studio-virtual-space-customization");
  const old = { ...layout, placements: [], revision: 21 };
  localStorage.setItem(decorationStorageKey(scope), JSON.stringify(old));
  const device = new StudioVirtualDecorationSession(scope, null, null);
  expect((await device.load(layout)).state).toMatchObject(old);
  const alice = new StudioVirtualDecorationSession(scope, null, "alice");
  expect((await alice.load(layout)).state).toEqual(layout);
  await alice.save(old);
  expect((await new StudioVirtualDecorationSession(scope, null, "alice").load(layout)).state).toMatchObject(old);
  expect((await new StudioVirtualDecorationSession(scope, null, "bob").load(layout)).state).toEqual(layout);
  expect((await new StudioVirtualDecorationSession("다른 작품", null, "alice").load(layout)).state).toEqual(layout);
});

it("SQLite를 처음 열지 못해도 다시 열면 방금 수정한 배치를 기기에 기록한다", async () => {
  db.kvGet.mockRejectedValueOnce(new Error("SQLite busy"));
  const next = { ...layout, placements: [], revision: 42 };
  const session = new StudioVirtualDecorationSession(scope, null, "alice");
  expect((await session.save(next)).state).toEqual(next);
  expect(session.cachedLocally).toBe(false);
  expect((await session.load(layout)).state).toEqual(next);
  expect(session.cachedLocally).toBe(true);
  expect((await new StudioVirtualDecorationSession(scope, null, "alice").load(layout)).state).toMatchObject(next);
});

it("이전 탭의 서버 응답이 새 탭의 편집을 덮지 않고 잘못된 원문을 복구본으로 보관한다", async () => {
  const { studioDecorationCheckpointStore } = await import("./studio-virtual-space-decoration-checkpoint");
  const store = studioDecorationCheckpointStore("alice", scope);
  const key = "toonspectrum:space-decoration-checkpoint:v1:" + JSON.stringify(["alice", scope]);
  localStorage.setItem(key, "{broken");
  const first = { id: "first", base: 0, pending: true, state: layout };
  expect(await store.write(first)).toBe(true);
  expect([...db.records].some(([id, value]) => id.startsWith(key + ":recovery:") && JSON.parse(value) === "{broken")).toBe(true);
  await store.write({ ...first, id: "second" });
  expect(await store.write({ ...first, pending: false }, first.id)).toBe(false);
  expect(await store.read()).toMatchObject({ id: "second", pending: true });
});
