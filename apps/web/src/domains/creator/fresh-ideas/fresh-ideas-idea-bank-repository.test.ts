import { describe, expect, it, vi } from "vitest";
import {
  createFreshIdeasIdeaBankRepository,
  FRESH_IDEAS_BANK_KEY,
  FRESH_IDEAS_BANK_NAMESPACE,
} from "./fresh-ideas-idea-bank-repository";
import type { IdeaBankSpreadsheetRow } from "./fresh-ideas-quality-ecosystem";

const row: IdeaBankSpreadsheetRow = {
  dateIso: "2026-11-20",
  lensId: "contrarian-take",
  sourceTitleAndUrl: "소재",
  headlineKo: "첫 초안",
  targetPersonaAndChannel: "창작자",
  effortTagKo: "낮음",
  draftStatus: "Seed",
};
const legacyRecord = { ...row, id: "legacy-id", savedAtIso: "2026-11-20T12:00:00Z" };

function setup(initialLegacy: string | null = null) {
  const data = new Map<string, string>();
  const db = {
    kvGet: vi.fn(async (namespace: string, key: string) => data.get(`${namespace}/${key}`) ?? null),
    kvSet: vi.fn(async (namespace: string, key: string, raw: string) => { data.set(`${namespace}/${key}`, raw); }),
  };
  const readLegacy = vi.fn(() => initialLegacy);
  const acquireDatabase = async () => db;
  const repo = createFreshIdeasIdeaBankRepository({ acquireDatabase, readLegacy });
  return { db, readLegacy, repo, acquireDatabase };
}

describe("Fresh Ideas 아이디어 뱅크 SQLite 권위", () => {
  it("일반 열기/저장은 브라우저 원본에 접근하지 않고 명시적 이관만 한 번 처리한다", async () => {
    const { db, readLegacy, repo, acquireDatabase } = setup(JSON.stringify([legacyRecord]));
    expect(await repo.list()).toEqual([]);
    await repo.append([{ ...row, headlineKo: "새 자료" }]);
    expect(readLegacy).not.toHaveBeenCalled();
    expect(await repo.importLegacy()).toMatchObject({ imported: 1 });
    await repo.updateStatus(legacyRecord.id, "Published");
    const reopened = createFreshIdeasIdeaBankRepository({ acquireDatabase, readLegacy });
    expect(await reopened.list()).toEqual([
      expect.objectContaining({ headlineKo: "새 자료" }),
      { ...legacyRecord, draftStatus: "Published" },
    ]);
    expect(await reopened.importLegacy()).toMatchObject({ imported: 0 });
    expect(readLegacy).toHaveBeenCalledTimes(1);
    expect(db.kvSet).toHaveBeenCalledWith(FRESH_IDEAS_BANK_NAMESPACE, FRESH_IDEAS_BANK_KEY, expect.any(String));
  });

  it("실패한 이관은 완료로 보고하지 않고 원본에서 다음 시도를 복구한다", async () => {
    const { db, repo, readLegacy } = setup(JSON.stringify([legacyRecord]));
    db.kvSet.mockRejectedValueOnce(new Error("쓰기 거부"));
    await expect(repo.importLegacy()).rejects.toThrow("쓰기 거부");
    expect(await repo.list()).toEqual([]);
    expect(await repo.importLegacy()).toEqual({ records: [legacyRecord], imported: 1 });
    expect(readLegacy).toHaveBeenCalledTimes(2);
  });

  it("동시 편집을 순서대로 저장하고 상태 변경 쓰기 실패는 기존 상태를 유지한다", async () => {
    const { db, repo } = setup(JSON.stringify([legacyRecord]));
    await repo.importLegacy();
    await Promise.all([
      repo.append([{ ...row, headlineKo: "두 번째" }]),
      repo.append([{ ...row, headlineKo: "세 번째" }]),
    ]);
    expect((await repo.list()).map((r) => r.headlineKo)).toEqual(["세 번째", "두 번째", "첫 초안"]);
    db.kvSet.mockRejectedValueOnce(new Error("쓰기 거부"));
    await expect(repo.updateStatus(legacyRecord.id, "Published")).rejects.toThrow("쓰기 거부");
    expect((await repo.list()).find((r) => r.id === legacyRecord.id)?.draftStatus).toBe("Seed");
  });

  it("알 수 없는 정본을 빈 은행으로 간주하거나 덮어쓰지 않는다", async () => {
    const { db, repo, readLegacy } = setup(JSON.stringify([legacyRecord]));
    await db.kvSet(FRESH_IDEAS_BANK_NAMESPACE, FRESH_IDEAS_BANK_KEY, "{broken");
    db.kvSet.mockClear();
    await expect(repo.append([row])).rejects.toThrow();
    await expect(repo.importLegacy()).rejects.toThrow();
    expect(db.kvSet).not.toHaveBeenCalled();
    expect(readLegacy).not.toHaveBeenCalled();
  });
});
