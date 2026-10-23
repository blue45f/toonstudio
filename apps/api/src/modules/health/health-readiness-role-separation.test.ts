import { describe, expect, it } from "vitest";

import {
  ROLE_SEPARATION_ACL_FLAGS,
  roleSeparationAclReady,
  type RoleSeparationAclState,
} from "./health-readiness-role-separation";

function state(value: boolean): RoleSeparationAclState {
  return Object.fromEntries(
    ROLE_SEPARATION_ACL_FLAGS.map((flag) => [flag, value]),
  ) as RoleSeparationAclState;
}

describe("roleSeparationAclReady", () => {
  it("분리 모드는 여섯 플래그가 모두 true 일 때만 통과한다", () => {
    expect(roleSeparationAclReady(state(true), "separated")).toBe(true);
    expect(roleSeparationAclReady(state(false), "separated")).toBe(false);
    for (const flag of ROLE_SEPARATION_ACL_FLAGS) {
      expect(roleSeparationAclReady({ ...state(true), [flag]: false }, "separated")).toBe(false);
    }
  });

  it("단일 소유자 모드는 플래그 값과 무관하게 이 단계를 통과시킨다", () => {
    expect(roleSeparationAclReady(state(false), "single-owner")).toBe(true);
    expect(roleSeparationAclReady(state(true), "single-owner")).toBe(true);
  });
});
