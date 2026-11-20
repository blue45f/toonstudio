import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { IpGovernanceOperatorGuard } from "./ip-governance.guard";

function createContext(headers: Record<string, string | undefined>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as unknown as ExecutionContext;
}

describe("IpGovernanceOperatorGuard", () => {
  const guard = new IpGovernanceOperatorGuard();

  it("blocks spoofed role header when no verified session user id is present", () => {
    expect(() =>
      guard.canActivate(
        createContext({
          "x-toonstudio-governance-role": "legal-ops",
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it("blocks authenticated non-operator roles and allows studio-admin/legal-ops with verified session", () => {
    expect(() =>
      guard.canActivate(
        createContext({
          "x-user-id": "user-reader-01",
          "x-toonstudio-governance-role": "reader",
        }),
      ),
    ).toThrow(ForbiddenException);

    expect(
      guard.canActivate(
        createContext({
          "x-user-id": "user-legal-01",
          "x-toonstudio-governance-role": "legal-ops",
        }),
      ),
    ).toBe(true);
  });
});
