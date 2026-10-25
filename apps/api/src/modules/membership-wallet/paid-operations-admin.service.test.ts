/**
 * paid-operations-admin.service.test.ts — 유료 운영 마스터 스위치 어드민
 * 변경 서비스 단위 테스트. DB 없이 동작한다 (app-config·감사 로그는 mock).
 * 정식 실행은 vitest(CI 확인 항목).
 *
 * 케이스: 미로그인·비어드민 거부, boolean 아님 거부, 미설정 시 false,
 * set 후 get 즉시 반영, 감사 로그 호출.
 */
import { describe, expect, it, vi } from "vitest";

import { isAdminUser } from "../../server/app-config";
import { logAuditAction } from "../admin/admin-types";
import { InMemoryPaidOperationsSettingStore } from "./paid-operations-gate";
import { PaidOperationsAdminService } from "./paid-operations-admin.service";

vi.mock("../../platform/database", () => ({ dbPool: { query: vi.fn() } }));
vi.mock("../../server/app-config", () => ({
  isAdminUser: vi.fn(async () => true),
}));
vi.mock("../admin/admin-types", () => ({ logAuditAction: vi.fn() }));

const adminIsAdmin = vi.mocked(isAdminUser);
const audit = vi.mocked(logAuditAction);

describe("PaidOperationsAdminService", () => {
  it("미로그인이면 거부한다", async () => {
    const service = new PaidOperationsAdminService(
      new InMemoryPaidOperationsSettingStore(),
    );
    await expect(service.adminGetPaidOperations(undefined)).rejects.toThrow(
      "로그인이 필요해요.",
    );
  });

  it("비어드민이면 거부한다", async () => {
    adminIsAdmin.mockResolvedValueOnce(false);
    const service = new PaidOperationsAdminService(
      new InMemoryPaidOperationsSettingStore(),
    );
    await expect(service.adminGetPaidOperations("user-1")).rejects.toThrow(
      "관리자 권한이 필요합니다.",
    );
  });

  it("미설정 시 false를 반환한다", async () => {
    const service = new PaidOperationsAdminService(
      new InMemoryPaidOperationsSettingStore(),
    );
    await expect(service.adminGetPaidOperations("admin-1")).resolves.toEqual({
      paidOperationsEnabled: false,
    });
  });

  it("boolean이 아니면 거부하고 저장하지 않는다", async () => {
    const store = new InMemoryPaidOperationsSettingStore();
    const service = new PaidOperationsAdminService(store);
    await expect(
      service.adminSetPaidOperations({ adminId: "admin-1", enabled: "yes" }),
    ).rejects.toThrow("유료 운영 값은 true/false여야 합니다.");
    expect(await store.getPaidOperationsEnabled()).toBe(false);
  });

  it("set 후 get에 즉시 반영되고 감사 로그를 남긴다", async () => {
    const store = new InMemoryPaidOperationsSettingStore();
    const service = new PaidOperationsAdminService(store);
    await expect(
      service.adminSetPaidOperations({ adminId: "admin-1", enabled: true }),
    ).resolves.toEqual({ paidOperationsEnabled: true });
    await expect(service.adminGetPaidOperations("admin-1")).resolves.toEqual({
      paidOperationsEnabled: true,
    });
    expect(audit).toHaveBeenCalledWith(
      "admin-1",
      "membership_wallet.paid_operations",
      "membership_policy",
      "paidOperationsEnabled",
      { enabled: true },
    );
  });
});
