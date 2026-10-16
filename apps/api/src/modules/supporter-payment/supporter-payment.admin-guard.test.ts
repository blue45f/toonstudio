import "reflect-metadata";
import { describe, expect, it } from "vitest";

import { AdminMutationGuard } from "../admin/admin-mutation.guard";

import { SupporterPaymentController } from "./supporter-payment.controller";

function guardsOf(handler: unknown): readonly unknown[] {
  const guards: unknown = typeof handler === "function" ? Reflect.getMetadata("__guards__", handler) : undefined;
  return Array.isArray(guards) ? guards : [];
}

/**
 * AdminMutationGuard 의 정책: 운영자(operator)는 읽기와 중재만, 전역·금융·보안 변경은 관리자(admin)만 한다.
 * 후원 결제의 전액 취소(Toss 환불 호출)와 운영비 후원 설정 변경은 금융·전역 변경이라 같은 경계를 따라야 한다.
 */
describe("후원 결제 관리자 라우트 권한 경계", () => {
  it.each(["updateSettingsForAdmin", "cancelForAdmin"] as const)(
    "%s 는 운영자가 아니라 관리자만 실행하도록 AdminMutationGuard 로 막는다",
    (name) => {
      expect(guardsOf(SupporterPaymentController.prototype[name])).toContain(AdminMutationGuard);
    },
  );

  it.each([
    "listForAdmin",
    "getSettingsForAdmin",
    "setPublicVisibilityForAdmin",
    "resyncForAdmin",
  ] as const)("%s 는 운영자도 쓸 수 있는 조회·중재 라우트로 유지한다", (name) => {
    expect(guardsOf(SupporterPaymentController.prototype[name])).not.toContain(AdminMutationGuard);
  });
});
