import studioRevisionCompareWorkerBootstrapSource from "./studio-revision-compare.worker-bootstrap.ts?raw";
import studioRevisionCompareWorkerRuntimeUrl from "./studio-revision-compare.worker.ts?worker&url";
import {
  STUDIO_REVISION_CHANGE_DETAIL_LIMIT,
  STUDIO_REVISION_CHANGE_FIELD_LIMIT,
  STUDIO_REVISION_CHANGE_KINDS,
  STUDIO_REVISION_DESCRIPTOR_STRING_LIMIT,
  type StudioRevisionChange,
  type StudioRevisionChangeKind,
  type StudioRevisionChangeScope,
  type StudioRevisionDiff,
  type StudioRevisionNumericSnapshot,
} from "./studio-revision-diff";
import {
  buildStudioServerRevisionComparison,
  type StudioServerRevisionComparison,
  type StudioServerRevisionComparisonInput,
  type StudioRevisionPublicationImpact,
} from "./studio-server-revision-comparison";

import {
  StudioRevisionCompareComplexityError,
  StudioRevisionCompareError,
  type StudioRevisionCompareComplexityLabelCode,
  type StudioRevisionCompareErrorCode,
} from "./studio-revision-compare-error";

import { projectRevisionComparisonValue } from "@/shared/lib/revision-comparison-projection";

const STUDIO_REVISION_COMPARE_WORKER_VERSION = 1 as const;
const STUDIO_REVISION_COMPARE_RUNTIME_MODULE_URL_TOKEN =
  "__TOONSPECTRUM_REVISION_COMPARE_RUNTIME_MODULE_URL__";
const STUDIO_REVISION_COMPARE_BOOTSTRAP_READY_TYPE =
  "studio-revision-compare/bootstrap-ready";
export const STUDIO_REVISION_COMPARE_DIRECT_MAX_ELEMENTS = 50_000;
/** Shared clone/compute ceiling used even when a module Worker is available. */
export const STUDIO_REVISION_COMPARE_MAX_ELEMENTS = 250_000;
export const STUDIO_REVISION_COMPARE_MAX_NODES = 2_000_000;
export const STUDIO_REVISION_COMPARE_MAX_ARRAY_ITEMS = 500_000;
export const STUDIO_REVISION_COMPARE_MAX_OBJECT_KEYS = 2_000_000;
export const STUDIO_REVISION_COMPARE_MAX_KEYS_PER_OBJECT = 4_096;
export const STUDIO_REVISION_COMPARE_MAX_DEPTH = 64;
/** One server payload is capped at 15 MiB; three compare inputs get a bounded aggregate budget. */
export const STUDIO_REVISION_COMPARE_MAX_STRING_CODE_UNITS = 48 * 1024 * 1024;
export const STUDIO_REVISION_COMPARE_MAX_INDIVIDUAL_STRING_CODE_UNITS = 16 * 1024 * 1024;
export const STUDIO_REVISION_COMPARE_MAX_REVISION = 2_147_483_647;
export const STUDIO_REVISION_COMPARE_MAX_PAGE_ID_LIST = 200;
export const STUDIO_REVISION_COMPARE_MAX_PAGE_LABELS = 600;
export const STUDIO_REVISION_COMPARE_MAX_WORKER_ERROR_NAME = 120;
export const STUDIO_REVISION_COMPARE_MAX_WORKER_ERROR_MESSAGE = 2_000;

interface StudioRevisionCompareInputComplexity {
  elements: number;
  nodes: number;
  arrayItems: number;
  objectKeys: number;
  stringCodeUnits: number;
}

export interface StudioRevisionCompareWorkerLike {
  onmessage: ((event: MessageEvent<StudioRevisionCompareWorkerResponse>) => void) | null;
  onerror: ((event: { error?: unknown; message?: string; preventDefault?(): void }) => void) | null;
  postMessage(message: StudioRevisionCompareWorkerRequest): void;
  terminate(): void;
}

interface StudioRevisionCompareNativeWorkerLike {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onerror: StudioRevisionCompareWorkerLike["onerror"];
  postMessage(message: StudioRevisionCompareWorkerRequest): void;
  terminate(): void;
}

export type StudioRevisionCompareWorkerFactory = () => StudioRevisionCompareWorkerLike | null;
export type StudioRevisionCompareExecutionBackend = "worker" | "direct";

export interface StudioRevisionCompareRunOptions {
  /** Fixed before projection/comparison begins. Browser product callers select `worker`. */
  readonly executionBackend?: StudioRevisionCompareExecutionBackend;
  readonly signal?: AbortSignal;
  /** Test/platform seam for the selected Worker backend. */
  readonly workerFactory?: StudioRevisionCompareWorkerFactory | null;
}

interface StudioRevisionCompareWorkerRequest {
  type: "studio-revision-compare/run";
  version: typeof STUDIO_REVISION_COMPARE_WORKER_VERSION;
  input: StudioServerRevisionComparisonInput;
}

interface StudioRevisionCompareWorkerSuccess {
  type: "studio-revision-compare/success";
  version: typeof STUDIO_REVISION_COMPARE_WORKER_VERSION;
  comparison: StudioServerRevisionComparison;
}

interface StudioRevisionCompareWorkerFailure {
  type: "studio-revision-compare/failure";
  version: typeof STUDIO_REVISION_COMPARE_WORKER_VERSION;
  error: { name: string; message: string };
}

export type StudioRevisionCompareWorkerResponse =
  | StudioRevisionCompareWorkerSuccess
  | StudioRevisionCompareWorkerFailure;

function isStudioRevisionCompareBootstrapReady(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Record<string, unknown>;
  return message.type === STUDIO_REVISION_COMPARE_BOOTSTRAP_READY_TYPE && message.version === 1;
}

function createIdempotentBlobUrlRevoker(
  bootstrapUrl: string,
  revokeObjectURL: (url: string) => void
): () => void {
  let revoked = false;
  return () => {
    if (revoked) return;
    revoked = true;
    revokeObjectURL(bootstrapUrl);
  };
}

class StudioRevisionCompareOwnedModuleWorker implements StudioRevisionCompareWorkerLike {
  onmessage: StudioRevisionCompareWorkerLike["onmessage"] = null;
  onerror: StudioRevisionCompareWorkerLike["onerror"] = null;
  private terminated = false;

  constructor(
    private readonly worker: StudioRevisionCompareNativeWorkerLike,
    private readonly revokeBootstrapUrl: () => void
  ) {
    worker.onmessage = (event) => {
      if (isStudioRevisionCompareBootstrapReady(event.data)) {
        this.revokeBootstrapUrl();
        return;
      }
      this.onmessage?.(event as MessageEvent<StudioRevisionCompareWorkerResponse>);
    };
    worker.onerror = (event) => {
      this.revokeBootstrapUrl();
      this.onerror?.(event);
    };
  }

  postMessage(message: StudioRevisionCompareWorkerRequest): void {
    this.worker.postMessage(message);
  }

  terminate(): void {
    this.revokeBootstrapUrl();
    if (this.terminated) return;
    this.terminated = true;
    this.worker.onmessage = null;
    this.worker.onerror = null;
    this.worker.terminate();
  }
}

export function createStudioRevisionCompareModuleWorker(): StudioRevisionCompareWorkerLike | null {
  if (
    typeof Worker !== "function" ||
    typeof Blob !== "function" ||
    typeof URL.createObjectURL !== "function" ||
    typeof URL.revokeObjectURL !== "function"
  ) {
    return null;
  }
  const tokenParts = studioRevisionCompareWorkerBootstrapSource.split(
    STUDIO_REVISION_COMPARE_RUNTIME_MODULE_URL_TOKEN
  );
  if (tokenParts.length !== 2) {
    throw new Error("Revision comparison Worker bootstrap contract is invalid.");
  }
  const runtimeUrl = new URL(studioRevisionCompareWorkerRuntimeUrl, import.meta.url).href;
  const bootstrapUrl = URL.createObjectURL(new Blob([
    tokenParts[0],
    runtimeUrl,
    tokenParts[1],
  ], { type: "text/javascript;charset=utf-8" }));
  const revokeBootstrapUrl = createIdempotentBlobUrlRevoker(
    bootstrapUrl,
    URL.revokeObjectURL.bind(URL)
  );
  let worker: StudioRevisionCompareNativeWorkerLike | undefined;
  try {
    worker = new Worker(bootstrapUrl, {
      type: "module",
      name: "toonstudio-revision-compare",
    }) as unknown as StudioRevisionCompareNativeWorkerLike;
    return new StudioRevisionCompareOwnedModuleWorker(worker, revokeBootstrapUrl);
  } catch (error) {
    revokeBootstrapUrl();
    worker?.terminate();
    throw error;
  }
}

function createAbortError(): Error {
  if (typeof DOMException === "function") {
    return new DOMException("aborted", "AbortError");
  }
  return new StudioRevisionCompareError("aborted", "AbortError");
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw createAbortError();
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function complexityError(
  labelCode: StudioRevisionCompareComplexityLabelCode,
  params?: Readonly<Record<string, string>>,
): StudioRevisionCompareComplexityError {
  return new StudioRevisionCompareComplexityError(labelCode, params);
}

function maxParam(maximum: number): Readonly<Record<string, string>> {
  return { max: maximum.toLocaleString("en-US") };
}

function incrementBudget(
  current: number,
  increment: number,
  maximum: number,
  labelCode: StudioRevisionCompareComplexityLabelCode
): number {
  if (!Number.isSafeInteger(increment) || increment < 0 || current > maximum - increment) {
    throw complexityError(labelCode, maxParam(maximum));
  }
  return current + increment;
}

function isCanonicalArrayIndex(key: string, length: number): boolean {
  if (key === "") return false;
  const index = Number(key);
  return Number.isSafeInteger(index) && index >= 0 && index < length && String(index) === key;
}

/**
 * Structured clone is not a validation boundary. Walk the same graph before either Worker or
 * direct execution so a hostile legacy/extension snapshot cannot allocate or recurse without a
 * deterministic ceiling. Shared references are accepted, but actual cycles fail closed.
 */
function assertStudioRevisionCompareInputComplexity(
  input: StudioServerRevisionComparisonInput
): StudioRevisionCompareInputComplexity {
  if (!isPlainRecord(input)) throw complexityError("inputFormat");
  if (!isRevision(input.targetRevision) || !isRevision(input.baseRevision)) {
    throw complexityError("revisionFormat");
  }

  const complexity: StudioRevisionCompareInputComplexity = {
    elements: 0,
    nodes: 0,
    arrayItems: 0,
    objectKeys: 0,
    stringCodeUnits: 0,
  };
  const seen = new WeakSet<object>();
  const active = new WeakSet<object>();
  const countedElementArrays = new WeakSet<object>();

  const consumeString = (value: string): void => {
    if (value.length > STUDIO_REVISION_COMPARE_MAX_INDIVIDUAL_STRING_CODE_UNITS) {
      throw complexityError("individualString", maxParam(STUDIO_REVISION_COMPARE_MAX_INDIVIDUAL_STRING_CODE_UNITS));
    }
    complexity.stringCodeUnits = incrementBudget(
      complexity.stringCodeUnits,
      value.length,
      STUDIO_REVISION_COMPARE_MAX_STRING_CODE_UNITS,
      "stringTotal"
    );
  };

  const visit = (value: unknown, depth: number, propertyName?: string): void => {
    if (depth > STUDIO_REVISION_COMPARE_MAX_DEPTH) {
      throw complexityError("depth", { max: String(STUDIO_REVISION_COMPARE_MAX_DEPTH) });
    }
    complexity.nodes = incrementBudget(
      complexity.nodes,
      1,
      STUDIO_REVISION_COMPARE_MAX_NODES,
      "nodes"
    );

    if (typeof value === "string") {
      consumeString(value);
      return;
    }
    if (
      value === null ||
      value === undefined ||
      typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value))
    ) {
      return;
    }
    if (typeof value !== "object") throw complexityError("uncloneable");
    if (Array.isArray(value) && propertyName === "elements" && !countedElementArrays.has(value)) {
      countedElementArrays.add(value);
      complexity.elements = incrementBudget(
        complexity.elements,
        value.length,
        STUDIO_REVISION_COMPARE_MAX_ELEMENTS,
        "elements"
      );
    }
    if (active.has(value)) throw complexityError("circular");
    if (seen.has(value)) return;
    seen.add(value);
    active.add(value);

    try {
      if (Array.isArray(value)) {
        complexity.arrayItems = incrementBudget(
          complexity.arrayItems,
          value.length,
          STUDIO_REVISION_COMPARE_MAX_ARRAY_ITEMS,
          "arrayItems"
        );

        const keys = Object.keys(value);
        const ownNames = Object.getOwnPropertyNames(value);
        if (ownNames.length !== keys.length + 1 || !ownNames.includes("length")) {
          throw complexityError("arrayNonEnumerable");
        }
        for (const key of keys) {
          if (!isCanonicalArrayIndex(key, value.length)) {
            throw complexityError("arrayCustomProperty");
          }
          const descriptor = Object.getOwnPropertyDescriptor(value, key);
          if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
            throw complexityError("arrayPropertyFormat");
          }
          consumeString(key);
          visit(descriptor.value, depth + 1);
        }
        if (Object.getOwnPropertySymbols(value).length > 0) {
          throw complexityError("symbolProperty");
        }
        return;
      }

      if (!isPlainRecord(value)) throw complexityError("nonPlainObject");
      const keys = Object.keys(value);
      if (Object.getOwnPropertyNames(value).length !== keys.length) {
        throw complexityError("nonEnumerable");
      }
      if (keys.length > STUDIO_REVISION_COMPARE_MAX_KEYS_PER_OBJECT) {
        throw complexityError("keysPerObject", maxParam(STUDIO_REVISION_COMPARE_MAX_KEYS_PER_OBJECT));
      }
      complexity.objectKeys = incrementBudget(
        complexity.objectKeys,
        keys.length,
        STUDIO_REVISION_COMPARE_MAX_OBJECT_KEYS,
        "objectKeys"
      );
      if (Object.getOwnPropertySymbols(value).length > 0) {
        throw complexityError("symbolProperty");
      }
      for (const key of keys) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
          throw complexityError("accessorProperty");
        }
        consumeString(key);
        visit(descriptor.value, depth + 1, key);
      }
    } finally {
      active.delete(value);
    }
  };

  try {
    visit(input, 0);
  } catch (error) {
    if (error instanceof StudioRevisionCompareComplexityError) throw error;
    throw complexityError("unverifiableStructure");
  }
  return complexity;
}

function runDirect(
  input: StudioServerRevisionComparisonInput,
  complexity: StudioRevisionCompareInputComplexity,
  signal?: AbortSignal
): StudioServerRevisionComparison {
  throwIfAborted(signal);
  if (complexity.elements > STUDIO_REVISION_COMPARE_DIRECT_MAX_ELEMENTS) {
    throw new StudioRevisionCompareError("directLimitExceeded", "RangeError", maxParam(STUDIO_REVISION_COMPARE_DIRECT_MAX_ELEMENTS));
  }
  const comparison = buildStudioServerRevisionComparison(input);
  throwIfAborted(signal);
  return comparison;
}

function revisionWorkerFailure(
  code: StudioRevisionCompareErrorCode,
  name = "StudioRevisionCompareWorkerError",
): StudioRevisionCompareError {
  return new StudioRevisionCompareError(code, name);
}

function workerError(response: StudioRevisionCompareWorkerFailure): Error {
  // 잔존 병기: Worker 페이로드가 실어 보낸 동적 message는 발신측 소유 문자열이라 패스스루한다(설계 §2.19).
  if (!response.error.message) return revisionWorkerFailure("workerFailed");
  const error = new Error(response.error.message);
  error.name = response.error.name || "Error";
  return error;
}

function isRevision(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 1 && Number(value) <= STUDIO_REVISION_COMPARE_MAX_REVISION;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function hasOnlyDataKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  required: readonly string[] = []
): boolean {
  if (Object.getOwnPropertySymbols(value).length > 0) return false;
  const keys = Object.keys(value);
  if (Object.getOwnPropertyNames(value).length !== keys.length) return false;
  if (keys.some((key) => !allowed.has(key))) return false;
  if (required.some((key) => !Object.hasOwn(value, key))) return false;
  return keys.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return Boolean(descriptor && "value" in descriptor && descriptor.enumerable);
  });
}

function isBoundedDescriptorString(value: unknown, allowEmpty = true): value is string {
  return typeof value === "string" &&
    (allowEmpty || value.length > 0) &&
    value.length <= STUDIO_REVISION_DESCRIPTOR_STRING_LIMIT;
}

function isDenseDataArray(value: unknown, maximumItems: number): value is readonly unknown[] {
  if (!Array.isArray(value) || value.length > maximumItems) return false;
  const keys = Object.keys(value);
  if (
    keys.length !== value.length ||
    Object.getOwnPropertyNames(value).length !== keys.length + 1 ||
    Object.getOwnPropertySymbols(value).length > 0
  ) {
    return false;
  }
  return keys.every((key, index) => {
    if (key !== String(index)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return Boolean(descriptor && "value" in descriptor && descriptor.enumerable);
  });
}

function isBoundedStringArray(value: unknown, maximumItems: number): value is readonly string[] {
  return isDenseDataArray(value, maximumItems) &&
    value.every((item) => isBoundedDescriptorString(item));
}

function isNumericSnapshot(value: unknown): value is StudioRevisionNumericSnapshot {
  if (!isPlainRecord(value)) return false;
  const keys = Object.keys(value);
  if (keys.length > STUDIO_REVISION_CHANGE_FIELD_LIMIT) return false;
  if (!hasOnlyDataKeys(value, new Set(keys))) return false;
  return keys.every((key) =>
    isBoundedDescriptorString(key) &&
    (value[key] === null || (typeof value[key] === "number" && Number.isFinite(value[key])))
  );
}

const CHANGE_KEYS = new Set([
  "kind",
  "scope",
  "pageId",
  "previousPageId",
  "elementId",
  "elementType",
  "previousElementType",
  "field",
  "fields",
  "fieldCount",
  "beforeIndex",
  "afterIndex",
  "before",
  "after",
  "beforePageIds",
  "afterPageIds",
  "elementCount",
  "commonElementCount",
  "firstChangedElementId",
]);
const CHANGE_KIND_SET = new Set<string>(STUDIO_REVISION_CHANGE_KINDS);
const CHANGE_SCOPES = new Set<StudioRevisionChangeScope>(["document", "page", "element"]);

function expectedScope(kind: StudioRevisionChangeKind): StudioRevisionChangeScope {
  if (kind.startsWith("page-")) return "page";
  if (kind.startsWith("element-")) return "element";
  return "document";
}

function isStudioRevisionChange(value: unknown): value is StudioRevisionChange {
  if (!isPlainRecord(value) || !hasOnlyDataKeys(value, CHANGE_KEYS, ["kind", "scope"])) return false;
  if (typeof value.kind !== "string" || !CHANGE_KIND_SET.has(value.kind)) return false;
  if (typeof value.scope !== "string" || !CHANGE_SCOPES.has(value.scope as StudioRevisionChangeScope)) {
    return false;
  }
  const kind = value.kind as StudioRevisionChangeKind;
  if (value.scope !== expectedScope(kind)) return false;

  for (const key of [
    "pageId",
    "previousPageId",
    "elementId",
    "elementType",
    "previousElementType",
    "firstChangedElementId",
  ] as const) {
    if (value[key] !== undefined && !isBoundedDescriptorString(value[key], false)) return false;
  }
  if (value.field !== undefined && !isBoundedDescriptorString(value.field)) return false;
  if (value.fields !== undefined && !isBoundedStringArray(value.fields, STUDIO_REVISION_CHANGE_FIELD_LIMIT)) {
    return false;
  }
  if (value.fieldCount !== undefined) {
    if (!isNonNegativeInteger(value.fieldCount) || !Array.isArray(value.fields)) return false;
    if (value.fieldCount < value.fields.length) return false;
  }
  for (const key of [
    "beforeIndex",
    "afterIndex",
    "elementCount",
    "commonElementCount",
  ] as const) {
    if (value[key] !== undefined && !isNonNegativeInteger(value[key])) return false;
  }
  if (value.before !== undefined && !isNumericSnapshot(value.before)) return false;
  if (value.after !== undefined && !isNumericSnapshot(value.after)) return false;
  if (
    value.beforePageIds !== undefined &&
    !isBoundedStringArray(value.beforePageIds, STUDIO_REVISION_COMPARE_MAX_PAGE_ID_LIST)
  ) {
    return false;
  }
  if (
    value.afterPageIds !== undefined &&
    !isBoundedStringArray(value.afterPageIds, STUDIO_REVISION_COMPARE_MAX_PAGE_ID_LIST)
  ) {
    return false;
  }
  return true;
}

const DIFF_KEYS = new Set(["hasChanges", "totalChanges", "truncated", "summary", "changes"]);

function isStudioRevisionDiff(value: unknown): value is StudioRevisionDiff {
  if (
    !isPlainRecord(value) ||
    !hasOnlyDataKeys(value, DIFF_KEYS, ["hasChanges", "totalChanges", "truncated", "summary", "changes"]) ||
    typeof value.hasChanges !== "boolean" ||
    !isNonNegativeInteger(value.totalChanges) ||
    typeof value.truncated !== "boolean"
  ) {
    return false;
  }
  const summary = value.summary;
  const changes = value.changes;
  if (!isPlainRecord(summary) || !isDenseDataArray(changes, STUDIO_REVISION_CHANGE_DETAIL_LIMIT)) {
    return false;
  }

  const summaryKeys = new Set<string>(STUDIO_REVISION_CHANGE_KINDS);
  if (!hasOnlyDataKeys(summary, summaryKeys, STUDIO_REVISION_CHANGE_KINDS)) return false;
  let summaryTotal = 0;
  const summaryCounts = Object.fromEntries(
    STUDIO_REVISION_CHANGE_KINDS.map((kind) => [kind, 0])
  ) as Record<StudioRevisionChangeKind, number>;
  const detailedCounts = Object.fromEntries(
    STUDIO_REVISION_CHANGE_KINDS.map((kind) => [kind, 0])
  ) as Record<StudioRevisionChangeKind, number>;
  for (const kind of STUDIO_REVISION_CHANGE_KINDS) {
    const count = summary[kind];
    if (!isNonNegativeInteger(count) || summaryTotal > Number.MAX_SAFE_INTEGER - count) return false;
    summaryCounts[kind] = count;
    summaryTotal += count;
  }
  for (const change of changes) {
    if (!isStudioRevisionChange(change)) return false;
    detailedCounts[change.kind] += 1;
  }
  if (summaryTotal !== value.totalChanges) return false;
  if (value.hasChanges !== (value.totalChanges > 0)) return false;
  if (changes.length !== Math.min(value.totalChanges, STUDIO_REVISION_CHANGE_DETAIL_LIMIT)) {
    return false;
  }
  if (value.truncated !== (value.totalChanges > changes.length)) return false;
  return STUDIO_REVISION_CHANGE_KINDS.every(
    (kind) => summaryCounts[kind] >= detailedCounts[kind]
  );
}

const PUBLICATION_IMPACT_KEYS = new Set(["statusChange", "changedRelations"]);
const STATUS_CHANGE_KEYS = new Set(["before", "after"]);
const PUBLICATION_RELATION_FIELDS = new Set([
  "titleId",
  "seriesId",
  "challengeId",
  "episodeNo",
  "remixFromId",
]);

function isPublicationStatus(value: unknown): value is "draft" | "published" | null {
  return value === null || value === "draft" || value === "published";
}

function isStudioRevisionPublicationImpact(value: unknown): value is StudioRevisionPublicationImpact {
  if (
    !isPlainRecord(value) ||
    !hasOnlyDataKeys(value, PUBLICATION_IMPACT_KEYS, ["statusChange", "changedRelations"]) ||
    !isDenseDataArray(value.changedRelations, PUBLICATION_RELATION_FIELDS.size) ||
    !value.changedRelations.every(
      (field) => typeof field === "string" && PUBLICATION_RELATION_FIELDS.has(field)
    ) ||
    new Set(value.changedRelations).size !== value.changedRelations.length
  ) {
    return false;
  }
  if (value.statusChange === null) return true;
  return isPlainRecord(value.statusChange) &&
    hasOnlyDataKeys(value.statusChange, STATUS_CHANGE_KEYS, ["before", "after"]) &&
    isPublicationStatus(value.statusChange.before) &&
    isPublicationStatus(value.statusChange.after) &&
    value.statusChange.before !== value.statusChange.after;
}

function isStudioRevisionPageLabels(value: unknown): value is Readonly<Record<string, string>> {
  if (!isPlainRecord(value)) return false;
  const pageIds = Object.keys(value);
  if (pageIds.length > STUDIO_REVISION_COMPARE_MAX_PAGE_LABELS) return false;
  if (!hasOnlyDataKeys(value, new Set(pageIds))) return false;
  return pageIds.every((pageId) =>
    isBoundedDescriptorString(pageId, false) &&
    typeof value[pageId] === "string" &&
    value[pageId].length <= 80
  );
}

const COMPARISON_KEYS = new Set([
  "targetRevision",
  "baseRevision",
  "localToTarget",
  "serverToLocal",
  "publicationImpact",
  "pageLabels",
]);

function isStudioServerRevisionComparison(value: unknown): value is StudioServerRevisionComparison {
  return isPlainRecord(value) &&
    hasOnlyDataKeys(
      value,
      COMPARISON_KEYS,
      [
        "targetRevision",
        "baseRevision",
        "localToTarget",
        "serverToLocal",
        "publicationImpact",
        "pageLabels",
      ]
    ) &&
    isRevision(value.targetRevision) &&
    isRevision(value.baseRevision) &&
    isStudioRevisionDiff(value.localToTarget) &&
    isStudioRevisionDiff(value.serverToLocal) &&
    isStudioRevisionPublicationImpact(value.publicationImpact) &&
    isStudioRevisionPageLabels(value.pageLabels);
}

const SUCCESS_KEYS = new Set(["type", "version", "comparison"]);
const FAILURE_KEYS = new Set(["type", "version", "error"]);
const ERROR_KEYS = new Set(["name", "message"]);

function parseWorkerResponse(value: unknown): StudioRevisionCompareWorkerResponse {
  let versionMismatch = false;
  try {
    if (!isPlainRecord(value) || typeof value.type !== "string") {
      throw new StudioRevisionCompareError("workerContractInvalid");
    }
    if (value.version !== STUDIO_REVISION_COMPARE_WORKER_VERSION) {
      versionMismatch = true;
      throw new StudioRevisionCompareError("workerVersionInvalid");
    }
    if (value.type === "studio-revision-compare/success") {
      if (
        !hasOnlyDataKeys(value, SUCCESS_KEYS, ["type", "version", "comparison"]) ||
        !isStudioServerRevisionComparison(value.comparison)
      ) {
        throw new StudioRevisionCompareError("workerContractInvalid");
      }
      return value as unknown as StudioRevisionCompareWorkerSuccess;
    }
    if (value.type === "studio-revision-compare/failure") {
      if (
        !hasOnlyDataKeys(value, FAILURE_KEYS, ["type", "version", "error"]) ||
        !isPlainRecord(value.error) ||
        !hasOnlyDataKeys(value.error, ERROR_KEYS, ["name", "message"]) ||
        typeof value.error.name !== "string" ||
        value.error.name.length === 0 ||
        value.error.name.length > STUDIO_REVISION_COMPARE_MAX_WORKER_ERROR_NAME ||
        typeof value.error.message !== "string" ||
        value.error.message.length === 0 ||
        value.error.message.length > STUDIO_REVISION_COMPARE_MAX_WORKER_ERROR_MESSAGE
      ) {
        throw new StudioRevisionCompareError("workerContractInvalid");
      }
      return value as unknown as StudioRevisionCompareWorkerFailure;
    }
    throw new StudioRevisionCompareError("workerContractInvalid");
  } catch {
    if (versionMismatch) throw new StudioRevisionCompareError("workerVersionInvalid");
    throw new StudioRevisionCompareError("workerContractInvalid");
  }
}

function comparisonMatchesRequest(
  comparison: StudioServerRevisionComparison,
  input: StudioServerRevisionComparisonInput
): boolean {
  return comparison.targetRevision === input.targetRevision && comparison.baseRevision === input.baseRevision;
}

async function projectStudioRevisionComparisonInput(
  input: StudioServerRevisionComparisonInput
): Promise<StudioServerRevisionComparisonInput> {
  const projected = await projectRevisionComparisonValue(input);
  if (
    !isPlainRecord(projected) ||
    !isRevision(projected.targetRevision) ||
    !isRevision(projected.baseRevision) ||
    !isPlainRecord(projected.targetSnapshot) ||
    !isPlainRecord(projected.baseSnapshot) ||
    !isPlainRecord(projected.localProject)
  ) {
    throw complexityError("projectionFormat");
  }
  return projected as unknown as StudioServerRevisionComparisonInput;
}

function runWithWorker(
  worker: StudioRevisionCompareWorkerLike,
  input: StudioServerRevisionComparisonInput,
  signal?: AbortSignal
): Promise<StudioServerRevisionComparison> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      finish(() => reject(revisionWorkerFailure("workerTimeout", "TimeoutError")));
    }, 30_000);
    const cleanup = () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
    };
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const onAbort = () => finish(() => reject(createAbortError()));

    worker.onmessage = (event) => {
      let response: StudioRevisionCompareWorkerResponse;
      try {
        response = parseWorkerResponse(event.data);
      } catch (error) {
        finish(() => reject(error));
        return;
      }
      if (response.type === "studio-revision-compare/failure") {
        finish(() => reject(workerError(response)));
        return;
      }
      if (!comparisonMatchesRequest(response.comparison, input)) {
        finish(() => reject(revisionWorkerFailure("workerRevisionMismatch")));
        return;
      }
      finish(() => resolve(response.comparison));
    };
    worker.onerror = (event) => {
      event.preventDefault?.();
      finish(() => reject(revisionWorkerFailure("workerFailed")));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
      return;
    }
    try {
      worker.postMessage({
        type: "studio-revision-compare/run",
        version: STUDIO_REVISION_COMPARE_WORKER_VERSION,
        input,
      });
    } catch {
      finish(() => reject(revisionWorkerFailure("workerRequestFailed")));
    }
  });
}

/** Runs the potentially large semantic comparison away from the canvas/UI main thread. */
export async function runStudioRevisionComparison(
  input: StudioServerRevisionComparisonInput,
  options: StudioRevisionCompareRunOptions = {},
): Promise<StudioServerRevisionComparison> {
  const executionBackend = options.executionBackend ?? "worker";
  if (executionBackend !== "worker" && executionBackend !== "direct") {
    throw new StudioRevisionCompareError("backendInvalid");
  }
  throwIfAborted(options.signal);
  // Validate the raw graph before the projection itself allocates, then ensure no data:/blob:
  // resource string can cross the Worker boundary or diverge from projected server revisions.
  const complexity = assertStudioRevisionCompareInputComplexity(input);
  const projectedInput = await projectStudioRevisionComparisonInput(input);
  throwIfAborted(options.signal);
  assertStudioRevisionCompareInputComplexity(projectedInput);
  if (executionBackend === "direct") {
    return runDirect(projectedInput, complexity, options.signal);
  }
  const factory = options.workerFactory === undefined
    ? createStudioRevisionCompareModuleWorker
    : options.workerFactory;
  if (!factory) {
    throw revisionWorkerFailure("workerUnavailable");
  }

  let worker: StudioRevisionCompareWorkerLike | null;
  try {
    worker = factory();
  } catch {
    throw revisionWorkerFailure("workerCreateFailed");
  }
  if (!worker) {
    throw revisionWorkerFailure("workerUnavailable");
  }
  return runWithWorker(worker, projectedInput, options.signal);
}

export type {
  StudioRevisionCompareWorkerFailure,
  StudioRevisionCompareWorkerRequest,
  StudioRevisionCompareWorkerSuccess,
};
