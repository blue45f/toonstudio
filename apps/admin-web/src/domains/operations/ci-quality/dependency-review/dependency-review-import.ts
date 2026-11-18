import {
  assertReviewJsonSize, exportDependencyReviewBoard, parseReviewJson, reviewArray, reviewDate, reviewObject, reviewText,
  reviewTextFields, validateDependencyReviewBoard, validateDependencyRows, validatePrComparisons,
  validateReviewHistory, validateReviewRecord, validateReviewSnapshot, validateValidationCommands,
} from "./dependency-review-model";
import { editableRecordFields, recordDefinitions } from "./dependency-review-types";

import type { DependencyImportPlan, DependencyReviewBoard, ReviewRecord } from "./dependency-review-types";

const SITE_TITLE = "ToonStudio 의존성 및 CI 검증 보드";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonical(entry)]));
  return value;
}
async function fingerprint(value: Record<string, unknown>): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("이 브라우저에서 JSON 원본 식별을 사용할 수 없습니다. HTTPS 또는 localhost에서 다시 시도하세요.");
  // 내보낸 시각만 달라진 같은 원본은 동일한 가져오기로 취급한다.
  const content = Object.fromEntries(Object.entries(value).filter(([key]) => key !== "exportedAt"));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(canonical(content))));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
function siteRecord(value: unknown, now: number): ReviewRecord {
  const r = reviewObject(value, "Sites 작업 기록");
  const id = reviewText(r.id, "Sites 작업 ID", 80);
  if (!Object.hasOwn(recordDefinitions, id)) throw new Error("이 보드에 대응하지 않는 Sites 작업 ID입니다.");
  const definition = recordDefinitions[id as keyof typeof recordDefinitions];
  const texts = Object.fromEntries(reviewTextFields.map(key => [key, ["sourceStatus", "sourceResult"].includes(key) ? "" : key === "recordedResult" ? "미확인" : reviewText(r[key], key)]));
  return validateReviewRecord({
    ...texts, id, category: r.category, status: r.status, links: r.links,
    snapshotSha: r.snapshotSha, verifiedAt: r.verifiedAt,
    causeIds: [...definition.causeIds], provenance: "sites-import", verificationSha: "",
    revision: r.revision ?? 0, updatedAt: r.updatedAt ?? "", edited: r.edited ?? false,
  }, now);
}
function importedRecord(record: ReviewRecord, current: ReviewRecord): ReviewRecord {
  return {
    ...record, causeIds: [...current.causeIds],
    // 아카이브의 완료는 #2789의 기존 해결 이력이며 최신 검사 성공과 구분한다.
    status: record.category === "approval" ? "승인 대기" : record.category === "archive" ? "main 머지 완료" : "검토 필요",
    result: "미확인", recordedResult: "미확인", verificationSha: "",
    sourceStatus: record.sourceStatus || record.status,
    sourceResult: record.sourceResult || (record.recordedResult !== "미확인" ? `수동 기록: ${record.recordedResult} / 원본: ${record.result}` : record.result),
    provenance: "sites-import", edited: true,
  };
}

/** 실제 Sites export와 이 기능의 백업만 받는다. 기존 CI·QA 전체 보드 JSON은 받지 않는다. */
export async function prepareDependencyImport(input: string, board: DependencyReviewBoard, now = Date.now()): Promise<DependencyImportPlan> {
  validateDependencyReviewBoard(board, now);
  const parsed = parseReviewJson(input);
  const kind = parsed.kind === "toonstudio-dependency-review" ? "native" : "sites";
  let records: ReviewRecord[];
  let snapshotSha: string;
  if (kind === "native") {
    const source = validateDependencyReviewBoard(parsed, now);
    records = source.records;
    snapshotSha = source.snapshot.sha;
  } else {
    if (parsed.title !== SITE_TITLE) throw new Error("ToonStudio 의존성 및 CI 검증 Sites 내보내기인지 확인하세요. 기존 CI·QA JSON은 별도 메뉴에서 관리합니다.");
    snapshotSha = validateReviewSnapshot(parsed.snapshot, now).sha;
    validateDependencyRows(parsed.dependencies);
    validatePrComparisons(parsed.prs);
    validateValidationCommands(parsed.commands);
    validateReviewHistory(parsed.history, now);
    reviewText(parsed.policy, "Sites 기록 정책");
    records = reviewArray(parsed.records, "Sites 작업 기록", 12).map(entry => siteRecord(entry, now));
    if (records.length !== 12 || new Set(records.map(r => r.id)).size !== 12) throw new Error("중복 없는 Sites 작업 12개가 필요합니다.");
  }
  const exportedAt = reviewDate(parsed.exportedAt, "원본 내보낸 시각", now);
  const sourceJson = JSON.stringify(parsed);
  assertReviewJsonSize(sourceJson);
  const id = await fingerprint(parsed);
  const incoming = records.map(record => importedRecord(record, board.records.find(r => r.id === record.id)!));
  const changes = incoming.flatMap(record => {
    const current = board.records.find(r => r.id === record.id)!;
    const fields = [...editableRecordFields, "status", "snapshotSha", "result", "sourceStatus", "sourceResult", "historicalResult", "summary", "links"].filter(key => JSON.stringify(current[key as keyof ReviewRecord]) !== JSON.stringify(record[key as keyof ReviewRecord]));
    return fields.length ? [{ id: record.id, title: record.title, conflict: current.edited, fields }] : [];
  });
  return { fingerprint: id, kind, sourceJson, exportedAt, snapshotSha, records: incoming, identical: board.imports.some(receipt => receipt.fingerprint === id), changes, originalRecordCount: records.length, targetJson: JSON.stringify(board) };
}

/** 충돌은 기본적으로 로컬 기록을 보존한다. 원본 전체는 내보내기에 포함되는 이력으로 보관한다. */
export function applyDependencyImport(board: DependencyReviewBoard, plan: DependencyImportPlan, overwriteIds: string[] = [], now = Date.now()): DependencyReviewBoard {
  if (plan.targetJson !== JSON.stringify(board)) throw new Error("가져오기 검토 이후 보드가 변경되었습니다. 다시 검토하세요.");
  if (plan.identical || board.imports.some(receipt => receipt.fingerprint === plan.fingerprint)) return board;
  if (board.imports.length >= 20) throw new Error("가져오기 원본은 최대 20개입니다. 현재 JSON을 백업해 보존하세요.");
  const allowed = new Set(overwriteIds);
  const changes = new Map(plan.changes.map(change => [change.id, change]));
  let applied = 0;
  let preserved = 0;
  const records = board.records.map(current => {
    const change = changes.get(current.id);
    if (!change) return current;
    if (change.conflict && !allowed.has(current.id)) { preserved += 1; return current; }
    const incoming = plan.records.find(record => record.id === current.id);
    if (!incoming) throw new Error("검토한 가져오기 항목을 찾을 수 없습니다.");
    applied += 1;
    return validateReviewRecord({ ...incoming, revision: current.revision + 1, updatedAt: new Date(now).toISOString(), edited: true }, now);
  });
  const next = validateDependencyReviewBoard({
    ...board, records,
    imports: [...board.imports, { fingerprint: plan.fingerprint, importedAt: new Date(now).toISOString(), snapshotSha: plan.snapshotSha, exportedAt: plan.exportedAt, sourceJson: plan.sourceJson }],
    history: [{ id: `import:${plan.fingerprint}`, recordId: "import", summary: `의존성 JSON 검토 가져오기 · ${applied}개 적용 · 로컬 충돌 ${preserved}개 보존 · 원본 SHA ${plan.snapshotSha.slice(0, 8)}`, createdAt: new Date(now).toISOString() }, ...board.history].slice(0, 200),
  }, now);
  exportDependencyReviewBoard(next, now);
  return next;
}
