import { sha256HexPortable } from "../sha256-portable";

import { workspaceDataEqual, workspaceObject } from "./validation";

import type { AdminWorkspace, WorkspaceJson, WorkspaceRecord } from "./types";

/** 객체 속성 순서가 바뀐 백업도 같은 원본 묶음으로 식별한다. */
export function workspaceSnapshotDigest(value: WorkspaceJson): string {
  function canonical(entry: WorkspaceJson): WorkspaceJson {
    if (Array.isArray(entry)) return entry.map(canonical);
    if (entry !== null && typeof entry === "object") {
      return Object.fromEntries(Object.keys(entry).sort().map(key => [key, canonical(entry[key])]));
    }
    return entry;
  }
  return sha256HexPortable(new TextEncoder().encode(JSON.stringify(canonical(value))));
}

/** 화면 ID가 바뀌어도 원본 보드와 원본 항목 ID가 같은 기록은 추가하지 않는다. */
export function workspaceOriginKey(record: WorkspaceRecord): string | null {
  const source = record.changeIdentity?.source;
  if (source) return JSON.stringify([source.provider, source.boardId, source.recordId]);
  if (record.origin) return JSON.stringify(["admin", "legacy-import:" + record.origin.sourceId, record.origin.sourceRecordId]);
  return null;
}

function archivedSource(value: unknown, native: boolean): { key: string; raw: unknown } | null {
  if (!workspaceObject(value)) return null;
  if (native) {
    const identity = workspaceObject(value.changeIdentity) ? value.changeIdentity : {};
    const source = workspaceObject(identity.source) ? identity.source : null;
    const origin = workspaceObject(value.origin) ? value.origin : null;
    if (source) return { key: JSON.stringify([source.provider, source.boardId, source.recordId]), raw: origin?.raw ?? value };
    if (origin) return { key: JSON.stringify(["admin", "legacy-import:" + String(origin.sourceId), origin.sourceRecordId]), raw: origin.raw };
  }
  const sourceId = typeof value.sourceId === "string" && value.sourceId ? value.sourceId : "business";
  const recordId = typeof value.sourceRecordId === "string" && value.sourceRecordId ? value.sourceRecordId : value.id;
  if (typeof recordId !== "string") return null;
  const projectId = typeof value.sourceProjectId === "string" && value.sourceProjectId ? value.sourceProjectId : "";
  return { key: JSON.stringify([projectId ? "sites" : "admin", projectId || "legacy-import:" + sourceId, recordId]), raw: value };
}

export function mergeWorkspaceImportedRecords(current: WorkspaceRecord[], incoming: WorkspaceRecord[], defaults: WorkspaceRecord[]): WorkspaceRecord[] {
  const byOrigin = new Map(current.flatMap(record => {
    const key = workspaceOriginKey(record);
    return key ? [[key, record] as const] : [];
  }));
  const aliases = new Map<string, string>();
  for (const record of incoming) {
    const key = workspaceOriginKey(record);
    const previous = key ? byOrigin.get(key) : undefined;
    if (previous) aliases.set(record.id, previous.id);
  }
  const normalized = incoming.filter(record => !aliases.has(record.id)).map(record => ({
    ...record, taskId: aliases.get(record.taskId) ?? record.taskId,
  }));
  const replacements = new Map(normalized.map(record => [record.id, record]));
  return [
    ...current.map(record => {
      const replacement = replacements.get(record.id);
      return replacement && defaults.some(value => workspaceDataEqual(value, record)) ? replacement : record;
    }),
    ...normalized.filter(record => !current.some(value => value.id === record.id)),
  ];
}

export interface WorkspaceImportReview {
  added: number;
  preserved: number;
  changedSources: { id: string; title: string }[];
  newArchives: number;
  unchanged: boolean;
}

/** 변경된 원문은 따로 검토한다. 가져오기만으로 현재 편집이나 검증을 덮어쓰지 않는다. */
export function reviewWorkspaceImport(previous: AdminWorkspace, next: AdminWorkspace): WorkspaceImportReview {
  const existingIds = new Set(previous.records.map(record => record.id));
  const newArchives = next.imports.filter(item => !previous.imports.some(value => value.id === item.id));
  const changedSources: WorkspaceImportReview["changedSources"] = [];
  for (const record of previous.records) {
    if (!record.origin) continue;
    for (const imported of newArchives) {
      const archive = imported.archive;
      if (!archive || typeof archive !== "object" || Array.isArray(archive)) continue;
      const business = archive.business && typeof archive.business === "object" && !Array.isArray(archive.business) ? archive.business : archive;
      const operations = archive.operations && typeof archive.operations === "object" && !Array.isArray(archive.operations) ? archive.operations : {};
      const entries = [business.tasks, business.claims, operations.records, archive.records].flatMap(value => Array.isArray(value) ? value : []);
      const raw = entries.map(value => archivedSource(value, imported.format === "native-backup")).find(value => value?.key === workspaceOriginKey(record));
      if (raw && !workspaceDataEqual(raw.raw, record.origin.raw)) {
        changedSources.push({ id: record.id, title: record.title });
        break;
      }
    }
  }
  return {
    added: next.records.filter(record => !existingIds.has(record.id)).length,
    preserved: previous.records.filter(record => next.records.some(value => workspaceDataEqual(record, value))).length,
    changedSources,
    newArchives: newArchives.length,
    unchanged: workspaceDataEqual(previous, next),
  };
}
