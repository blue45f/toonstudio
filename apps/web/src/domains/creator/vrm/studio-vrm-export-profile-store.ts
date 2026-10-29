/**
 * VRM 내보내기 제작자 정보의 **기기 저장소**.
 *
 * 제작자·연락처·이용 조건은 캐릭터를 새로 만들 때마다 같다. 생성 뒤에는 새 모델이 설치되면서 조형
 * 상태가 초기화되므로(useStudioVrmPoserInstall) 이 값을 조형 상태에 두면 매번 다시 쳐야 한다.
 * 그래서 Studio 의 로컬 SQLite 키-값 저장소에 따로 둔다. 저장소를 열 수 없는 환경에서는 조용히
 * 메모리로만 동작하고, 호출자는 결과(`false`)로 "이 기기에 기억하지 못했다"를 알 수 있다.
 */

import {
  sanitizeStudioVrmExportProfile,
  type StudioVrmExportProfile,
} from "./studio-vrm-generate-export-meta";

import type { StudioAsyncKeyValueStore } from "../studio-local-database";

export const STUDIO_VRM_EXPORT_PROFILE_NAMESPACE = "studio-vrm-export-profile-v1";
const PROFILE_KEY = "profile";
/** 정상 프로필은 수 KB 다. 이보다 크면 오염된 값으로 보고 읽지 않는다. */
const MAX_STORED_BYTES = 64 * 1024;

export interface StudioVrmExportProfileStore {
  load(): Promise<StudioVrmExportProfile | null>;
  /** 성공하면 `true`. 저장소를 열 수 없으면 `false`(값은 버린다). */
  save(profile: StudioVrmExportProfile): Promise<boolean>;
  clear(): Promise<boolean>;
}

export type StudioVrmExportProfileStoreOptions = {
  readonly acquireStore?: () => Promise<StudioAsyncKeyValueStore>;
};

async function acquireDefaultStore(): Promise<StudioAsyncKeyValueStore> {
  const { acquireStudioLocalDatabase } = await import("../studio-local-database-runtime");
  const database = await acquireStudioLocalDatabase();
  return database.asAsyncKeyValueStore(STUDIO_VRM_EXPORT_PROFILE_NAMESPACE);
}

export function createStudioVrmExportProfileStore(
  options: StudioVrmExportProfileStoreOptions = {},
): StudioVrmExportProfileStore {
  const acquire = options.acquireStore ?? acquireDefaultStore;
  let store: Promise<StudioAsyncKeyValueStore> | null = null;

  function resolveStore(): Promise<StudioAsyncKeyValueStore> {
    if (store === null) {
      const acquisition = acquire();
      store = acquisition;
      // 실패한 획득을 붙들고 있으면 다음 시도도 영원히 실패한다.
      void acquisition.catch(() => {
        if (store === acquisition) store = null;
      });
    }
    return store;
  }

  return {
    async load() {
      try {
        const raw = await (await resolveStore()).get(PROFILE_KEY);
        if (!raw || raw.length > MAX_STORED_BYTES) return null;
        return sanitizeStudioVrmExportProfile(JSON.parse(raw));
      } catch {
        return null;
      }
    },
    async save(profile) {
      try {
        const sanitized = sanitizeStudioVrmExportProfile(profile);
        if (!sanitized) return false;
        await (await resolveStore()).set(PROFILE_KEY, JSON.stringify(sanitized));
        return true;
      } catch {
        return false;
      }
    },
    async clear() {
      try {
        await (await resolveStore()).delete(PROFILE_KEY);
        return true;
      } catch {
        return false;
      }
    },
  };
}
