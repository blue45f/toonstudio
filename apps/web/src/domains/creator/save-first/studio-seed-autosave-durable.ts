import {
  parseStudioAutosave,
  studioAutosaveKey,
  type StudioAutosavePayload,
  type StudioAutosaveStorage,
} from "../studio-autosave";
import type {
  persistStudioAutosaveWithOpfsPrimary,
  StudioAutosaveDocumentSession,
  studioAutosaveDocumentBusy,
  withStudioAutosaveDocumentLeadership,
} from "../studio-autosave-opfs-session";
import type { StudioAutosaveSqlitePort } from "../studio-autosave-sqlite-store";

/**
 * 번들 예제·샘플 원고처럼 "시스템이 미리 만들어 둔 초안"을 편집기가 실제로 열 수 있는 내구 저장소에 심는다.
 *
 * 편집기는 OPFS 저널과 SQLite 를 자동저장 권위로 쓰고, 브라우저 저장소(localStorage)에만 있는 기록은
 * "호환 후보"로만 보여 줄 뿐 복구를 거부한다. 그래서 예전처럼 localStorage 의 소유자 없는 게스트 키에
 * 초안을 심으면 (1) 로그인 사용자의 편집기 키에서는 찾지 못하고 (2) 게스트 키에서도 복구할 수 없었다.
 * 여기서는 편집기와 같은 소유자 키(`studioAutosaveKey({ userId, workId })`)로 편집기와 같은 쓰기 경로를 거쳐 심는다.
 *
 * 멱등·비파괴 계약:
 * - 같은 키에 OPFS/SQLite 기록(삭제 표식 포함)이 있으면 절대 덮지 않는다 — 사용자가 고치거나 비운 원고다.
 * - 읽을 수 없는 저장소 위에는 쓰지 않는다(기존 기록을 못 본 채 덮는 일을 막는다).
 * - 같은 키의 브라우저 호환 기록이 "예전 시딩이 심은 원본 그대로"일 때만 내구 저장소로 옮기고(성공하면 호환 기록은
 *   쓰기 경로가 지운다), 사용자가 만진 기록이면 그대로 둔다.
 * - 다른 탭이 이 문서의 leader 이면 쓰지 않는다(그 탭이 권위다).
 */

export interface StudioSeedAutosave {
  /** 편집기 문서 id. 자동저장 키는 여기에 로그인 사용자 id 를 붙여 만든다. */
  readonly workId: string;
  /** 초안 본문. 심어야 할 때만 만든다(라이브러리를 열 때마다 페이지를 새로 짓지 않게). */
  readonly build: () => StudioAutosavePayload;
}

export type StudioSeedDurableOutcome =
  /** 편집기가 쓰는 내구 저장소에 심었다. */
  | "written"
  /** 같은 키에 사용자 기록·삭제 표식이 있어 건드리지 않았다. */
  | "kept-existing"
  /** 다른 탭이 이 문서의 leader 라 심지 않았다. */
  | "busy"
  /** OPFS/SQLite 를 쓸 수 없거나 읽을 수 없어 심지 않았다. */
  | "unavailable";

/**
 * 무거운 OPFS/SQLite 모듈을 이 모듈이 직접 import 하지 않도록 필요한 동작을 포트로 받는다.
 * 라이브러리 진입 경로에 정적으로 묶이는 것은 이 작은 판정 로직뿐이고, 실제 저장소 모듈은 호출하는 쪽이
 * 이미 지연 로딩 경계인 모듈을 동적으로 불러와 넘긴다(번들 청크가 늘지 않는다).
 */
export interface StudioSeedDurablePorts {
  readonly openDocumentSession: (key: string) => Promise<StudioAutosaveDocumentSession>;
  readonly acquireSqlite: () => Promise<StudioAutosaveSqlitePort>;
  readonly persist: typeof persistStudioAutosaveWithOpfsPrimary;
  readonly withLeadership: typeof withStudioAutosaveDocumentLeadership;
  readonly isBusy: typeof studioAutosaveDocumentBusy;
}

function sameSeedBody(existing: StudioAutosavePayload, built: StudioAutosavePayload): boolean {
  return existing.title === built.title
    && existing.currentPageId === built.currentPageId
    && JSON.stringify(existing.pagesList) === JSON.stringify(built.pagesList);
}

type BrowserRecordState = "absent" | "untouched-seed" | "user-record" | "unreadable";

/** 키의 브라우저 호환 기록이 없는지, 예전 시딩이 심은 원본 그대로인지, 사용자가 만진 기록인지 가른다. */
function browserRecordState(
  storage: StudioAutosaveStorage,
  key: string,
  seed: StudioSeedAutosave,
): BrowserRecordState {
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return "unreadable"; // 있는지 알 수 없는 기록 위에는 쓰지 않는다.
  }
  if (raw === null) return "absent";
  const existing = parseStudioAutosave(raw);
  return existing !== null && sameSeedBody(existing, seed.build()) ? "untouched-seed" : "user-record";
}

export async function persistSeedAutosaveDurably(input: {
  readonly seed: StudioSeedAutosave;
  readonly authUserId: string | null;
  readonly storage: StudioAutosaveStorage;
  readonly ports: StudioSeedDurablePorts;
}): Promise<StudioSeedDurableOutcome> {
  const { ports } = input;
  const key = studioAutosaveKey({ userId: input.authUserId, workId: input.seed.workId });

  let documentSession: StudioAutosaveDocumentSession | null;
  try {
    documentSession = await ports.openDocumentSession(key);
  } catch {
    documentSession = null; // Web Locks/OPFS 가 없으면 SQLite 만으로 진행한다.
  }
  try {
    if (documentSession?.role === "follower") return "busy";
    const session = documentSession?.session ?? null;
    let sqlite: StudioAutosaveSqlitePort | null = null;
    try {
      sqlite = await ports.acquireSqlite();
    } catch {
      sqlite = null;
    }
    if (session === null && sqlite === null) return "unavailable";

    // 기존 기록 확인: 스냅샷이든 삭제 표식이든 있으면 사용자의 것이다. 못 읽은 저장소 위에는 쓰지 않는다.
    if (session) {
      try {
        if ((await session.readLatest()) !== null) return "kept-existing";
      } catch {
        return "unavailable";
      }
    }
    if (sqlite) {
      try {
        if ((await sqlite.read(key)) !== null) return "kept-existing";
      } catch {
        return "unavailable";
      }
    }
    const browserRecord = browserRecordState(input.storage, key, input.seed);
    if (browserRecord === "unreadable") return "unavailable";
    if (browserRecord === "user-record") return "kept-existing";

    await ports.persist({
      session,
      sqlite: ports.withLeadership(sqlite, documentSession?.lease ?? null),
      storage: input.storage,
      key,
      payload: input.seed.build(),
    });
    return "written";
  } catch (cause: unknown) {
    return ports.isBusy(cause) ? "busy" : "unavailable";
  } finally {
    try {
      await documentSession?.session?.dispose();
    } catch {
      // 정리 실패가 시딩 결과를 바꾸지 않는다 — 리스는 아래에서 풀고 브라우저가 탭 종료 때 회수한다.
    }
    try {
      await documentSession?.lease.release();
    } catch {
      // 위와 같다.
    }
  }
}
