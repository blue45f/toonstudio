import {
  appendIdeaBankRows,
  IDEA_BANK_LIMIT,
  parseIdeaBankSnapshot,
  updateIdeaBankRecordStatus,
  type StoredIdeaBankRecord,
} from "./fresh-ideas-workspace-export-bridge";
import type { IdeaBankSpreadsheetRow } from "./fresh-ideas-quality-ecosystem";
import type { StudioLocalDatabase } from "../studio-local-database";

export const FRESH_IDEAS_BANK_LEGACY_KEY = "toonstudio:fresh-ideas:idea-bank:v2";
export const FRESH_IDEAS_BANK_NAMESPACE = "studio-fresh-ideas-bank-v12";
export const FRESH_IDEAS_BANK_KEY = "records-v1";

type IdeaBankDatabase = Pick<StudioLocalDatabase, "kvGet" | "kvSet">;
interface IdeaBankPayload {
  readonly legacyImported: boolean;
  readonly records: readonly StoredIdeaBankRecord[];
}

function readBrowserLegacyBank(): string | null {
  return typeof window === "undefined" ? null : window.localStorage.getItem(FRESH_IDEAS_BANK_LEGACY_KEY);
}

export function createFreshIdeasIdeaBankRepository({
  acquireDatabase,
  readLegacy = readBrowserLegacyBank,
  now = () => new Date().toISOString(),
}: {
  readonly acquireDatabase: () => Promise<IdeaBankDatabase>;
  readonly readLegacy?: () => string | null;
  readonly now?: () => string;
}) {
  let tail: Promise<void> = Promise.resolve();
  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = tail.then(work);
    tail = result.then(() => undefined, () => undefined);
    return result;
  }

  const persist = (database: IdeaBankDatabase, payload: IdeaBankPayload) =>
    database.kvSet(FRESH_IDEAS_BANK_NAMESPACE, FRESH_IDEAS_BANK_KEY, JSON.stringify(payload));

  async function read(database: IdeaBankDatabase): Promise<IdeaBankPayload> {
    const raw = await database.kvGet(FRESH_IDEAS_BANK_NAMESPACE, FRESH_IDEAS_BANK_KEY);
    if (raw === null) return { legacyImported: false, records: [] };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || !("legacyImported" in parsed)
      || typeof parsed.legacyImported !== "boolean" || !("records" in parsed)) {
      throw new Error("아이디어 뱅크 저장 형식이 올바르지 않습니다.");
    }
    return { legacyImported: parsed.legacyImported, records: parseIdeaBankSnapshot(parsed.records) };
  }

  function mutate(
    update: (records: readonly StoredIdeaBankRecord[]) => readonly StoredIdeaBankRecord[],
  ): Promise<readonly StoredIdeaBankRecord[]> {
    return enqueue(async () => {
      const database = await acquireDatabase();
      const current = await read(database);
      const records = update(current.records);
      await persist(database, { ...current, records });
      return records;
    });
  }

  return {
    list: () => enqueue(async () => (await read(await acquireDatabase())).records),
    append: (rows: readonly IdeaBankSpreadsheetRow[]) =>
      mutate((records) => appendIdeaBankRows(records, rows, now())),
    updateStatus: (id: string, status: IdeaBankSpreadsheetRow["draftStatus"]) =>
      mutate((records) => updateIdeaBankRecordStatus(records, id, status)),
    importLegacy: () => enqueue(async () => {
      const database = await acquireDatabase();
      const current = await read(database);
      if (current.legacyImported) return { records: current.records, imported: 0 };
      const raw = readLegacy();
      if (raw === null) return { records: current.records, imported: 0 };
      const legacy = parseIdeaBankSnapshot(JSON.parse(raw));
      const keys = new Set(current.records.map((row) => JSON.stringify([row.lensId, row.headlineKo])));
      const ids = new Set(current.records.map((row) => row.id));
      const additions: StoredIdeaBankRecord[] = [];
      for (const row of legacy) {
        const key = JSON.stringify([row.lensId, row.headlineKo]);
        if (keys.has(key)) continue;
        let id = row.id;
        for (let suffix = 1; ids.has(id); suffix++) id = `${row.id}-import-${suffix}`;
        keys.add(key);
        ids.add(id);
        additions.push({ ...row, id });
      }
      const records = [...current.records, ...additions];
      if (records.length > IDEA_BANK_LIMIT) {
        throw new Error("아이디어 뱅크 한도를 초과하여 기존 기록을 가져오지 못했습니다.");
      }
      // 원본에는 쓰지 않는다. 기록과 이관 표식을 동일 SQLite 행으로 커밋한다.
      await persist(database, { legacyImported: true, records });
      return { records, imported: additions.length };
    }),
  };
}

// 브라우저 프로필에 묶인 기존 도구 데이터를 유지한다. 계정·프로젝트 동기화는 하지 않는다.
export const freshIdeasIdeaBank = createFreshIdeasIdeaBankRepository({
  acquireDatabase: async () => {
    const { acquireStudioLocalDatabase } = await import("../studio-local-database-runtime");
    return acquireStudioLocalDatabase();
  },
});
