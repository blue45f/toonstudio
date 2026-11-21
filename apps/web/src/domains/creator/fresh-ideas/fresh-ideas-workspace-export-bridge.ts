/**
 * Fresh Ideas v2.2 Workspace Export Bridge.
 * Produces RFC-4180 Google Sheets CSV, Google Docs Markdown + 4-Seed Appendix, and composable Idea Bank records.
 */

import type {
  IdeaBankSpreadsheetRow,
  ModeCEcosystemBundle,
} from "./fresh-ideas-quality-ecosystem";

export const IDEA_BANK_LIMIT = 200;

export interface StoredIdeaBankRecord extends IdeaBankSpreadsheetRow {
  readonly id: string;
  readonly savedAtIso: string;
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

function isIdeaBankRecord(value: unknown): value is StoredIdeaBankRecord {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return ["id", "savedAtIso", "dateIso", "sourceTitleAndUrl", "lensId", "headlineKo",
    "targetPersonaAndChannel", "effortTagKo"].every((key) => typeof row[key] === "string")
    && (row.draftStatus === "Seed" || row.draftStatus === "Drafted" || row.draftStatus === "Published");
}

export function parseIdeaBankSnapshot(parsed: unknown): readonly StoredIdeaBankRecord[] {
  if (!Array.isArray(parsed) || parsed.length > IDEA_BANK_LIMIT || !parsed.every(isIdeaBankRecord)) {
    throw new Error("아이디어 뱅크 저장 형식이 올바르지 않습니다.");
  }
  return parsed;
}

export function appendIdeaBankRows(
  existing: readonly StoredIdeaBankRecord[],
  rows: readonly IdeaBankSpreadsheetRow[],
  nowIso: string,
): readonly StoredIdeaBankRecord[] {
  const existingKeys = new Set(existing.map((item) => JSON.stringify([item.lensId, item.headlineKo])));
  const existingIds = new Set(existing.map((item) => item.id));
  const additions: StoredIdeaBankRecord[] = [];
  let idSuffix = existing.length + 1;
  for (const row of rows) {
    const key = JSON.stringify([row.lensId, row.headlineKo]);
    if (existingKeys.has(key)) continue;
    existingKeys.add(key);
    let id: string;
    do {
      id = `gfi-${row.dateIso}-${row.lensId}-${idSuffix++}`;
    } while (existingIds.has(id));
    existingIds.add(id);
    additions.push({ ...row, id, savedAtIso: nowIso });
  }
  return Object.freeze([...additions, ...existing].slice(0, IDEA_BANK_LIMIT));
}

export function updateIdeaBankRecordStatus(
  existing: readonly StoredIdeaBankRecord[],
  recordId: string,
  nextStatus: IdeaBankSpreadsheetRow["draftStatus"],
): readonly StoredIdeaBankRecord[] {
  if (!existing.some((item) => item.id === recordId)) {
    throw new Error("변경할 아이디어를 찾을 수 없습니다.");
  }
  return Object.freeze(existing.map((item) =>
    item.id === recordId ? { ...item, draftStatus: nextStatus } : item,
  ));
}
