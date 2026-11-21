/** 로컬 기획 작업 사본의 키와 봉투가 같은 작품을 가리키는지 확인한다. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const MEMORY_ONLY_PROJECT_RECORD = Symbol("studio-project-record-read-failed");

/** 읽지 않은 원본 대신 만든 초안은 원본을 다시 읽기 전까지 저장 권한이 없다.
 * 열거 가능한 Symbol은 편집의 object spread를 따라가지만 JSON 저장 계약에는 들어가지 않는다. */
export function markStudioProjectRecordMemoryOnly<T extends object>(record: T): T {
  return Object.assign(record, { [MEMORY_ONLY_PROJECT_RECORD]: true as const });
}

export function isStudioProjectRecordMemoryOnly(value: unknown): boolean {
  return typeof value === "object" && value !== null
    && MEMORY_ONLY_PROJECT_RECORD in value && value[MEMORY_ONLY_PROJECT_RECORD] === true;
}

export function isScopedStudioProjectRecord(
  value: unknown,
  projectId: string,
  kind: "workspace" | "story",
): boolean {
  if (!isRecord(value) || value["schemaVersion"] !== 1 || value["projectId"] !== projectId) return false;
  if (kind === "workspace") return Array.isArray(value["commitHistory"]);
  const state = value["state"];
  return isRecord(state) && state["projectId"] === projectId
    && ["nodes", "edges", "proposals", "reviewFindings", "workLog"].every((key) => Array.isArray(state[key]))
    && isRecord(state["driftBadges"]) && isRecord(state["reviewNodeHashes"]);
}

/** 읽지 못한 원본·다른 작품의 문서를 기본값이나 새 편집으로 덮어쓰지 않는다. */
export function canReplaceScopedStudioProjectRecord(
  storage: Pick<Storage, "getItem">,
  key: string,
  projectId: string,
  kind: "workspace" | "story",
  replacement: object,
): boolean {
  if (isStudioProjectRecordMemoryOnly(replacement)) return false;
  try {
    const raw = storage.getItem(key);
    return raw === null || isScopedStudioProjectRecord(JSON.parse(raw), projectId, kind);
  } catch {
    return false;
  }
}
