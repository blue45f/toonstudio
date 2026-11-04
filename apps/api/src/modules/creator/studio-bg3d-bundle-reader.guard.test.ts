import type { ExecutionContext } from "@nestjs/common";
import { beforeEach, expect, it, vi } from "vitest";
import { parseStudioBg3dReaderCapabilities, StudioBg3dBundleReaderGuard } from "./studio-bg3d-bundle-reader.guard";

const { authorize } = vi.hoisted(() => ({ authorize: vi.fn() }));
vi.mock("./studio-bg3d-bundle.repository", () => ({ assertStudioBg3dBundleAuthorizedReader: authorize }));
const required = "bg3d-sixpass-bundle.v1";
beforeEach(() => { authorize.mockReset(); });
it("GET reader 입력은 누락·JSON 배열·comma를 받고 잘못된 자료형과 예산 초과는 거부한다", () => {
  expect(parseStudioBg3dReaderCapabilities(undefined)).toEqual([]);
  expect(parseStudioBg3dReaderCapabilities(JSON.stringify([required]))).toEqual([required]);
  expect(parseStudioBg3dReaderCapabilities(required)).toEqual([required]);
  expect(() => parseStudioBg3dReaderCapabilities(JSON.stringify(Array.from({ length: 33 }, () => required)))).toThrow();
  expect(() => parseStudioBg3dReaderCapabilities([required])).toThrow();
});
it("ACL/reader 거부는 그대로 전달하고 요구 capability는 승인 후에만 응답에 담는다", async () => {
  const setHeader = vi.fn();
  const context = { switchToHttp: () => ({ getRequest: () => ({ params: { id: "work-one" }, headers: {
    "x-user-id": "actor-one", "x-studio-reader-capabilities": JSON.stringify([required]) } }), getResponse: () => ({ setHeader }) }) } as ExecutionContext;
  const guard = new StudioBg3dBundleReaderGuard(); authorize.mockRejectedValueOnce(new Error("reader denied"));
  await expect(guard.canActivate(context)).rejects.toThrow("reader denied"); expect(setHeader).not.toHaveBeenCalled();
  authorize.mockResolvedValueOnce([required]); await expect(guard.canActivate(context)).resolves.toBe(true);
  expect(authorize).toHaveBeenLastCalledWith("actor-one", "work-one", [required]);
  expect(setHeader).toHaveBeenCalledWith("x-studio-required-reader-capabilities", JSON.stringify([required]));
});
