/**
 * 런타임이 접속하는 DB 역할의 구조.
 *
 * - `separated`(기본): 마이그레이터(스키마 소유자)와 런타임 로그인 역할이 분리돼 있다. 런타임 역할은 최소 권한만 갖고
 *   `WITH GRANT OPTION`이 없어야 한다. `/api/health/ready`는 마켓플레이스 표 여섯 개에 대해 이를 검사한다.
 * - `single-owner`: 런타임이 스키마 소유자 역할로 접속한다. 별도 역할을 만들 수 없는 관리형 DB(예: onpod dev 티어는 소유자
 *   역할 하나뿐이고 `CREATEROLE`이 없다)를 위한 **명시적 옵트인**이다. 표 소유자는 권한을 REVOKE해도 grant option을 항상
 *   가지므로(2026-10-22 실측) 위 검사를 통과할 수 없어, 그 여섯 검사만 건너뛰고 나머지 준비성 검사는 그대로 둔다.
 */
export type DatabaseRuntimeRoleMode = "separated" | "single-owner";

export type DatabaseRuntimeRoleModeEnvironment = Partial<
  Record<"DATABASE_RUNTIME_ROLE_MODE", string | undefined>
>;

export class DatabaseRuntimeRoleModeConfigurationError extends Error {
  constructor() {
    super('DATABASE_RUNTIME_ROLE_MODE must be "separated" or "single-owner".');
    this.name = "DatabaseRuntimeRoleModeConfigurationError";
  }
}

/**
 * 설정이 없거나 비어 있으면 엄격한 `separated`다. 알 수 없는 값은 조용히 넘기지 않고 부팅 단계에서 막는다
 * (옵트인을 켰다고 믿는데 실제로는 꺼져 있는 상태를 숨기지 않는다).
 */
export function resolveDatabaseRuntimeRoleMode(
  environment: DatabaseRuntimeRoleModeEnvironment,
): DatabaseRuntimeRoleMode {
  const raw = environment.DATABASE_RUNTIME_ROLE_MODE;
  if (raw === undefined || raw === "" || raw === "separated") return "separated";
  if (raw === "single-owner") return "single-owner";
  throw new DatabaseRuntimeRoleModeConfigurationError();
}

/**
 * `single-owner`일 때 시작 시 남길 한국어 경고. 약해진 보장을 로그에서 놓치지 않게 한다.
 * 값이 없거나 `separated`이면 null이고, 잘못된 값은 provider가 부팅을 막으므로 여기서는 null이다.
 */
export function databaseRuntimeRoleModeStartupFinding(
  environment: DatabaseRuntimeRoleModeEnvironment,
): string | null {
  if (environment.DATABASE_RUNTIME_ROLE_MODE !== "single-owner") return null;
  return "DATABASE_RUNTIME_ROLE_MODE=single-owner: 런타임 DB 역할이 스키마 소유자입니다. 마켓플레이스 ACL 준비성 검사 6개"
    + "(marketplace*AclReady)를 건너뛰고 /api/health/ready를 판정하므로 런타임 역할 분리(최소 권한) 보장이 없습니다. "
    + "공식 운영 전이거나 별도 로그인 역할을 만들 수 없는 평가 환경에서만 쓰고, 비소유 로그인 역할을 확보하면 이 설정을 "
    + "제거하세요. 소유자 연결에서는 creator_career_confirmation_* 기능이 여전히 사용할 수 없습니다.";
}
