import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProductionProjectAggregate } from "@toonstudio/core/production";
import type { StudioTeamSnapshot } from "../studio-team-client";
import type { ProductionCreatePending } from "./production-create-pending";
import { prepareProductionCreatePending } from "./production-create-pending";
import { assertProductionCreateAck, confirmProductionProjectCreate } from "./production-create-command";
import type { ProductionCreatePendingStore } from "./production-create-pending-store";

const scope = { actorUserId: "actor", workId: "work" };
const team: StudioTeamSnapshot = { workId: "work", viewer: { userId: "actor", role: "owner", status: "active",
  capabilities: { view: true, comment: true, edit: true, manageMembers: true, respondInvite: false } }, members: [] };
function response(pending: ProductionCreatePending) {
  return { aggregate: { ...createProductionProjectAggregate({ ...pending.input, ownerUserId: pending.actorUserId,
    at: "2026-10-29T00:00:00.000Z" }), revision: 1 } };
}
function ports(pending: ProductionCreatePending) {
  const store: ProductionCreatePendingStore = { load: vi.fn(async () => pending),
    remember: vi.fn(async () => pending), clear: vi.fn(async () => true) };
  return { store, current: () => true, team: vi.fn(async () => team),
    post: vi.fn(async () => response(pending)) };
}
beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => vi.unstubAllGlobals());
const original = () => prepareProductionCreatePending(scope, { workId: "work", title: "공개 producer", collaborationModel: "studio-production", ownerDisplayName: "소유자" });

describe("실제 Production 생성 명령의 ACK 경계", () => {
  it("ACK 유실 뒤 명시 재확인은 최초 본문과 UUID만 재전송한다", async () => {
    const pending = await original(), io = ports(pending);
    io.post.mockRejectedValueOnce(new Error("ACK 유실"));
    await expect(confirmProductionProjectCreate(pending, io)).rejects.toThrow("ACK 유실");
    expect(io.store.clear).not.toHaveBeenCalled();
    expect(await confirmProductionProjectCreate(pending, io)).toBe(pending.input.projectId);
    expect(io.post.mock.calls).toEqual([[pending.input, pending.clientMutationId], [pending.input, pending.clientMutationId]]);
    expect(io.store.clear).toHaveBeenCalledWith(scope, pending.clientMutationId, io.current);
  });
  it("현재 owner가 아니면 viewer/admin 관리 권한을 생성 권한으로 확대하지 않는다", async () => {
    for (const role of ["viewer", "admin"] as const) {
      const pending = await original(), io = ports(pending);
      io.team.mockResolvedValue({ ...team, viewer: { ...team.viewer, role } });
      await expect(confirmProductionProjectCreate(pending, io)).rejects.toThrow("현재 작품 소유자");
      expect(io.post).not.toHaveBeenCalled(); expect(io.store.clear).not.toHaveBeenCalled();
    }
  });
  it("다른 프로젝트·작품·owner ACK를 영수증으로 채택하거나 원문을 지우지 않는다", async () => {
    const pending = await original(), ack = response(pending);
    for (const aggregate of [{ ...ack.aggregate, projectId: "foreign" }, { ...ack.aggregate, workId: "foreign" },
      { ...ack.aggregate, revision: 2 }, { ...ack.aggregate, parties: [{ ...ack.aggregate.parties[0], accountUserId: "foreign" }] }]) {
      expect(() => assertProductionCreateAck({ aggregate }, pending)).toThrow("생성 응답");
    }
    const io = ports(pending); io.post.mockResolvedValue({ ...ack, aggregate: { ...ack.aggregate, workId: "foreign" } });
    await expect(confirmProductionProjectCreate(pending, io)).rejects.toThrow("생성 응답"); expect(io.store.clear).not.toHaveBeenCalled();
  });
  it("actor/work 전환 뒤 늦은 ACK는 pending 삭제나 새 화면 진입 근거가 아니다", async () => {
    const pending = await original(), io = ports(pending); let active = true;
    io.post.mockImplementation(async () => { active = false; return response(pending); });
    await expect(confirmProductionProjectCreate(pending, { ...io, current: () => active })).rejects.toThrow("계정이나 작품");
    expect(io.store.clear).not.toHaveBeenCalled();
  });
  it("전송 직전 durable 원문이 다르면 새 UUID나 본문으로 진행하지 않는다", async () => {
    const pending = await original(), other = await original(), io = ports(pending); io.store.load = vi.fn(async () => other);
    await expect(confirmProductionProjectCreate(pending, io)).rejects.toThrow("최초 생성 원문이 달라");
    expect(io.post).not.toHaveBeenCalled();
  });
  it("확인한 ACK 뒤에도 기기 삭제가 실패하면 완료를 반환하지 않는다", async () => {
    const pending = await original(), io = ports(pending); io.store.clear = vi.fn(async () => false);
    await expect(confirmProductionProjectCreate(pending, io)).rejects.toThrow("보관한 생성 요청");
    expect(io.post).toHaveBeenCalledExactlyOnceWith(pending.input, pending.clientMutationId);
  });
});
