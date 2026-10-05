import {
  EMPTY_ORGANIZATION_STATE,
  organizationStorageKey,
  parseLocalOrganizationState,
  serializeLocalOrganizationState,
  type LocalOrganizationState,
} from "./organization-model";

/**
 * 조직 데이터 접근 seam.
 *
 * 조직 서버 계약(`/production/organizations`)이 생기기 전까지는 로컬 구현체가 정본이다.
 * 계약이 생기면 이 인터페이스의 API 구현체로 교체하고, 로컬 상태는 1회 가져오기
 * 대상으로만 남긴다. 페이지 코드는 이 인터페이스만 의존하므로 교체 범위가 좁다.
 */
export interface OrganizationDirectory {
  load(ownerUserId: string): LocalOrganizationState;
  save(ownerUserId: string, state: LocalOrganizationState): void;
}

/** 최소 저장 인터페이스. 테스트에서는 가짜를 주입하고, 실제에서는 localStorage를 쓴다. */
export interface OrganizationStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStorage(): OrganizationStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function createLocalOrganizationDirectory(storage?: OrganizationStorage | null): OrganizationDirectory {
  const store = storage === undefined ? browserStorage() : storage;
  return {
    load(ownerUserId) {
      if (!store) return EMPTY_ORGANIZATION_STATE;
      try {
        return parseLocalOrganizationState(store.getItem(organizationStorageKey(ownerUserId)), ownerUserId);
      } catch {
        return EMPTY_ORGANIZATION_STATE;
      }
    },
    save(ownerUserId, state) {
      if (!store) return;
      try {
        store.setItem(organizationStorageKey(ownerUserId), serializeLocalOrganizationState(state));
      } catch {
        // 저장 실패(용량·차단)를 화면 오류로 만들지 않는다. 조직 상태는 로컬 편의층이며
        // 서버 워크스페이스 데이터가 정본이라 유실돼도 자원 접근에는 영향이 없다.
      }
    },
  };
}

/** 앱 표면에서 공유하는 기본 디렉터리 (브라우저 localStorage 백킹). */
export const organizationDirectory: OrganizationDirectory = createLocalOrganizationDirectory();
