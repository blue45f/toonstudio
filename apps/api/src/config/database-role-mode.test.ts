import { describe, expect, it } from "vitest";

import {
  databaseRuntimeRoleModeStartupFinding,
  DatabaseRuntimeRoleModeConfigurationError,
  resolveDatabaseRuntimeRoleMode,
} from "./database-role-mode";

describe("DATABASE_RUNTIME_ROLE_MODE 해석", () => {
  it("설정이 없거나 비어 있거나 separated 이면 엄격한 분리 모드다", () => {
    expect(resolveDatabaseRuntimeRoleMode({})).toBe("separated");
    expect(resolveDatabaseRuntimeRoleMode({ DATABASE_RUNTIME_ROLE_MODE: "" })).toBe("separated");
    expect(resolveDatabaseRuntimeRoleMode({ DATABASE_RUNTIME_ROLE_MODE: "separated" })).toBe(
      "separated",
    );
  });

  it("single-owner 만 단일 소유자 옵트인으로 인정한다", () => {
    expect(resolveDatabaseRuntimeRoleMode({ DATABASE_RUNTIME_ROLE_MODE: "single-owner" })).toBe(
      "single-owner",
    );
  });

  it("알 수 없는 값은 조용히 넘기지 않고 예외를 던진다", () => {
    for (const value of ["SINGLE-OWNER", "single_owner", "true", "owner", " single-owner"]) {
      expect(
        () => resolveDatabaseRuntimeRoleMode({ DATABASE_RUNTIME_ROLE_MODE: value }),
        value,
      ).toThrow(DatabaseRuntimeRoleModeConfigurationError);
    }
  });
});

describe("DATABASE_RUNTIME_ROLE_MODE 시작 경고", () => {
  it("single-owner 일 때만 한국어 경고를 남긴다", () => {
    const finding = databaseRuntimeRoleModeStartupFinding({
      DATABASE_RUNTIME_ROLE_MODE: "single-owner",
    });
    expect(finding).toContain("DATABASE_RUNTIME_ROLE_MODE=single-owner");
    expect(finding).toContain("marketplace*AclReady");
    expect(finding).toMatch(/[가-힣]/u);
  });

  it("기본·분리·잘못된 값에는 경고하지 않는다(잘못된 값은 provider가 부팅을 막는다)", () => {
    expect(databaseRuntimeRoleModeStartupFinding({})).toBeNull();
    expect(databaseRuntimeRoleModeStartupFinding({ DATABASE_RUNTIME_ROLE_MODE: "" })).toBeNull();
    expect(
      databaseRuntimeRoleModeStartupFinding({ DATABASE_RUNTIME_ROLE_MODE: "separated" }),
    ).toBeNull();
    expect(
      databaseRuntimeRoleModeStartupFinding({ DATABASE_RUNTIME_ROLE_MODE: "owner" }),
    ).toBeNull();
  });
});
