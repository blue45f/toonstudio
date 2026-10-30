import { describe, expect, it } from "vitest";

import { buildCustomerSupportCapabilitySql, buildCustomerSupportRuntimeAclSql, buildCustomerSupportRuntimeAclViolationSql } from "./customer-support-database-contract.mjs";
import { buildManagedRuntimeAclSql } from "./prepare-managed-database-bootstrap.mjs";
import { buildProductionCapabilityVerificationSql } from "./verify-production-database-capabilities.mjs";

describe("고객상담 배포 권한 계약", () => {
  it.each(["public", "bad-role", "role; DROP TABLE user", "", "UPPERCASE", undefined])("안전하지 않은 runtime 역할 %s 를 거부한다", (role) => {
    for (const builder of [buildCustomerSupportRuntimeAclSql, buildCustomerSupportRuntimeAclViolationSql, buildCustomerSupportCapabilitySql]) {
      expect(() => builder(role)).toThrow(/안전한 명시적/u);
    }
  });

  it("관리형 초기화와 운영 검증이 같은 비공개 상담 권한을 적용한다", () => {
    const bootstrap = buildManagedRuntimeAclSql("app_runtime");
    const verify = buildProductionCapabilityVerificationSql("app_runtime");
    expect(bootstrap).toContain('GRANT UPDATE ("status", "aiLease", "aiLeaseUntil", "updatedAt") ON TABLE public.customer_support_conversation TO "app_runtime"');
    expect(bootstrap).toContain('REVOKE ALL ON SEQUENCE public.customer_support_message_sequence_seq FROM PUBLIC, "app_runtime"');
    expect(verify).toContain(buildCustomerSupportCapabilitySql("app_runtime"));
  });
});
