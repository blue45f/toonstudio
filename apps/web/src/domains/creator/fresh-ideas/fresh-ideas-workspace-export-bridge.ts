/**
 * Fresh Ideas v2.2 Workspace Export Bridge & Persistent Local Idea Bank.
 * Produces RFC-4180 Google Sheets CSV, Google Docs Markdown + 4-Seed Appendix, and local persistence.
 */

import type {
  IdeaBankSpreadsheetRow,
  ModeCEcosystemBundle,
} from "./fresh-ideas-quality-ecosystem";

export const FRESH_IDEAS_BANK_STORAGE_KEY = "toonstudio:fresh-ideas:idea-bank:v2";

export interface StoredIdeaBankRecord extends IdeaBankSpreadsheetRow {
  readonly id: string;
  readonly savedAtIso: string;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function escapeCsvCell(value: string): string {
  const safe = value.replace(/\r?\n/g, " ");
  if (/[",]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function serializeIdeaBankCsv(rows: readonly IdeaBankSpreadsheetRow[]): string {
  const header = [
    "Date",
    "Source Title & URL",
    "Lens ID",
    "1-Line Headline",
    "Target Persona & Channel",
    "Effort Tag",
    "Draft Status",
  ].join(",");

  const body = rows.map((row) =>
    [
      row.dateIso,
      row.sourceTitleAndUrl,
      row.lensId,
      row.headlineKo,
      row.targetPersonaAndChannel,
      row.effortTagKo,
      row.draftStatus,
    ]
      .map(escapeCsvCell)
      .join(","),
  );

  return [header, ...body].join("\n");
}

export function buildStructuredGoogleDocMarkdown(bundle: ModeCEcosystemBundle): string {
  const { googleDocExportPayload, serializedSeries } = bundle;
  const lines = [
    `# ${googleDocExportPayload.titleKo}`,
    "",
    "## 본문 초안 (Mode B)",
    "",
    googleDocExportPayload.mainDraftKo,
    "",
    "## 부록 1 · 잔여 4개 아이디어 씨앗 (후속 연재용)",
    "",
    ...googleDocExportPayload.appendixRemainingSeedsKo.map((seed) => `- ${seed}`),
    "",
    "## 부록 2 · 5부작 연재 커리큘럼",
    "",
    ...serializedSeries.map((ep) => `${ep.partNumber}. ${ep.episodeTitleKo} — ${ep.cliffhangerBridgeKo}`),
  ];
  return lines.join("\n");
}

function resolveStorage(customStorage?: StorageLike): StorageLike | null {
  if (customStorage) return customStorage;
  if (typeof globalThis !== "undefined" && "localStorage" in globalThis) {
    try {
      return globalThis.localStorage;
    } catch {
      return null;
    }
  }
  return null;
}

export function loadIdeaBankSnapshot(customStorage?: StorageLike): readonly StoredIdeaBankRecord[] {
  const storage = resolveStorage(customStorage);
  if (!storage) return [];
  try {
    const raw = storage.getItem(FRESH_IDEAS_BANK_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is StoredIdeaBankRecord =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as Record<string, unknown>).id === "string" &&
        typeof (item as Record<string, unknown>).headlineKo === "string",
    );
  } catch {
    return [];
  }
}

export function appendIdeaBankRows(
  rows: readonly IdeaBankSpreadsheetRow[],
  options?: { readonly storage?: StorageLike; readonly nowIso?: string; readonly maxRecords?: number },
): readonly StoredIdeaBankRecord[] {
  const storage = resolveStorage(options?.storage);
  const nowIso = options?.nowIso ?? new Date().toISOString();
  const maxRecords = options?.maxRecords ?? 200;
  const existing = loadIdeaBankSnapshot(storage ?? undefined);
  const existingKeys = new Set(existing.map((item) => `${item.lensId}::${item.headlineKo}`));

  const additions: StoredIdeaBankRecord[] = [];
  for (const row of rows) {
    const key = `${row.lensId}::${row.headlineKo}`;
    if (existingKeys.has(key)) continue;
    existingKeys.add(key);
    additions.push({
      ...row,
      id: `gfi-${row.dateIso}-${row.lensId}-${existing.length + additions.length + 1}`,
      savedAtIso: nowIso,
    });
  }

  const merged = [...additions, ...existing].slice(0, maxRecords);
  if (storage) {
    try {
      storage.setItem(FRESH_IDEAS_BANK_STORAGE_KEY, JSON.stringify(merged));
    } catch {
      // Non-fatal quota handling
    }
  }
  return Object.freeze(merged);
}

export function updateIdeaBankRecordStatus(
  recordId: string,
  nextStatus: IdeaBankSpreadsheetRow["draftStatus"],
  customStorage?: StorageLike,
): readonly StoredIdeaBankRecord[] {
  const storage = resolveStorage(customStorage);
  const existing = loadIdeaBankSnapshot(storage ?? undefined);
  const updated = existing.map((item) =>
    item.id === recordId ? { ...item, draftStatus: nextStatus } : item,
  );
  if (storage) {
    try {
      storage.setItem(FRESH_IDEAS_BANK_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // Non-fatal quota handling
    }
  }
  return Object.freeze(updated);
}
