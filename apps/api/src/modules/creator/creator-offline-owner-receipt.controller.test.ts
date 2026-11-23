import { ForbiddenException, NotFoundException, UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import type { Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SESSION_TOKEN_TTL_MS, signSession } from "../../server/session";
import { isSessionAllowed } from "../../server/user-lifecycle";
import { resolveSessionCookieName } from "../../session-cookie";
import { sessionAuth } from "../../session-middleware";
import { CreatorOfflineOwnerReceiptController, OfflineOwnerReceiptCookieGuard } from "./creator-offline-owner-receipt.controller";
import type { CreatorService } from "./creator.service";
import { StudioBg3dBundleReaderGuard } from "./studio-bg3d-bundle-reader.guard";

vi.mock("../../server/user-lifecycle", () => ({ isSessionAllowed: vi.fn() }));

const now = Date.UTC(2026, 10, 23);
const userId = "receipt-owner";
const workId = "receipt-work";
const meta = vi.fn();
const access = vi.fn();
const controller = new CreatorOfflineOwnerReceiptController({
  getSharedWorkDocumentMeta: meta, getWorkAuthorization: access,
} as unknown as CreatorService);

async function issue(token = signSession(userId), headers: Request["headers"] = {}) {
  const request = { headers: { cookie: `${resolveSessionCookieName()}=${token}`, ...headers } } as Request;
  const response = { setHeader: vi.fn(), vary: vi.fn() };
  const httpResponse = response as unknown as Response;
  await new Promise<void>((resolve, reject) => {
    sessionAuth(request, httpResponse, (error?: unknown) => error ? reject(error) : resolve());
  });
  const context = {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => httpResponse }),
  } as ExecutionContext;
  const result = async () => {
    new OfflineOwnerReceiptCookieGuard().canActivate(context);
    return controller.issue({ id: workId }, request, httpResponse);
  };
  return { result, response };
}

describe("오프라인 원고 소유자 열람 영수증", () => {
  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(now);
    vi.mocked(isSessionAllowed).mockResolvedValue(true);
    meta.mockReset().mockResolvedValue({ workId, role: "owner", revision: 3 });
    access.mockReset().mockResolvedValue({ workId, viewer: { userId, role: "owner" } });
  });
  afterEach(() => vi.restoreAllMocks());

  it("문서 reader 검사 뒤 소유자·원고·버전·만료 시각만 담은 쿠키별 영수증을 반환한다", async () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, controller.issue)).toEqual([
      OfflineOwnerReceiptCookieGuard, StudioBg3dBundleReaderGuard,
    ]);
    const { result, response } = await issue();
    await expect(result()).resolves.toEqual({ userId, workId, revision: 3, expiresAt: now + 300_000 });
    expect(meta).toHaveBeenCalledWith(userId, workId);
    expect(access).toHaveBeenCalledWith(userId, workId);
    expect(response.vary).toHaveBeenCalledWith("Cookie, Authorization, X-Api-Key, X-User-Id, X-Studio-Reader-Capabilities");
    expect(response.setHeader).toHaveBeenLastCalledWith("Cache-Control", "private, max-age=300, must-revalidate");
  });

  it("계정 세션과 원고 권한 중 먼저 끝나는 시각으로 영수증을 제한한다", async () => {
    const token = signSession(userId, 1, now - SESSION_TOKEN_TTL_MS + 20_000);
    const first = await issue(token);
    await expect(first.result()).resolves.toMatchObject({ expiresAt: now + 20_000 });
    expect(first.response.setHeader).toHaveBeenLastCalledWith("Cache-Control", "private, max-age=20, must-revalidate");
    access.mockResolvedValue({ workId, viewer: { userId, role: "owner" }, authorizationExpiresAt: new Date(now + 4_500).toISOString() });
    const shorter = await issue(token);
    await expect(shorter.result()).resolves.toMatchObject({ expiresAt: now + 4_500 });
    expect(shorter.response.setHeader).toHaveBeenLastCalledWith("Cache-Control", "private, max-age=4, must-revalidate");
  });

  it("쿠키가 없거나 취소됐거나 다른 자격 증명이 섞이면 양성 응답을 캐시하지 않는다", async () => {
    for (const headers of [{ cookie: undefined }, { "x-user-id": signSession(userId) },
      { authorization: "Bearer synthetic" }, { "x-api-key": "synthetic" }]) {
      const attempt = await issue(undefined, headers);
      await expect(attempt.result()).rejects.toBeInstanceOf(UnauthorizedException);
      expect(attempt.response.setHeader).toHaveBeenLastCalledWith("Cache-Control", "private, no-store, max-age=0");
    }
    vi.mocked(isSessionAllowed).mockResolvedValue(false);
    await expect((await issue()).result()).rejects.toBeInstanceOf(UnauthorizedException);
    expect(meta).not.toHaveBeenCalled();
  });

  it("편집자와 삭제된 원고에는 캐시 가능한 영수증을 남기지 않는다", async () => {
    meta.mockResolvedValueOnce({ workId, role: "editor", revision: 3 });
    const editor = await issue();
    await expect(editor.result()).rejects.toBeInstanceOf(ForbiddenException);
    expect(editor.response.setHeader).toHaveBeenLastCalledWith("Cache-Control", "private, no-store, max-age=0");
    meta.mockRejectedValueOnce(new NotFoundException());
    const missing = await issue();
    await expect(missing.result()).rejects.toBeInstanceOf(NotFoundException);
    expect(missing.response.setHeader).toHaveBeenLastCalledWith("Cache-Control", "private, no-store, max-age=0");
  });

  it("원고 권한이 다른 사용자로 바뀌거나 열람 시간이 지나면 거부한다", async () => {
    const viewer = { userId, role: "owner" };
    for (const current of [
      { workId, viewer: { ...viewer, userId: "other" } },
      { workId, viewer, authorizationExpiresAt: new Date(now).toISOString() },
      { workId, viewer, authorizationExpiresAt: "invalid" },
    ]) {
      access.mockResolvedValueOnce(current);
      const attempt = await issue();
      await expect(attempt.result()).rejects.toBeInstanceOf(ForbiddenException);
      expect(attempt.response.setHeader).toHaveBeenLastCalledWith("Cache-Control", "private, no-store, max-age=0");
    }
  });
});
