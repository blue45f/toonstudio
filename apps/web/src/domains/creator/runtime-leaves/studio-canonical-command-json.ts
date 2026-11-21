/** RFC-8259 호환 정규화 JSON 직렬화 및 저널 오류 타입 (순수 리프 모듈). */
export const STUDIO_COMMAND_JOURNAL_HARD_MAX_SERIALIZED_BYTES = 64 * 1024 * 1024;
const TEXT_ENCODER = new TextEncoder();

export type StudioCommandJournalErrorCode =
  | "INVALID_JSON"
  | "PAYLOAD_TOO_LARGE"
  | "INVALID_ID"
  | "INVALID_KIND"
  | "INVALID_LAMPORT"
  | "INVALID_ENVELOPE"
  | "DUPLICATE_CONFLICT"
  | "LAMPORT_REGRESSION"
  | "ACTOR_LIMIT_EXCEEDED"
  | "JOURNAL_LIMIT_EXCEEDED"
  | "TRANSACTION_ALREADY_ACTIVE"
  | "TRANSACTION_REUSED"
  | "TRANSACTION_NOT_ACTIVE"
  | "TRANSACTION_MISMATCH"
  | "EMPTY_TRANSACTION"
  | "GROUP_REOPENED"
  | "UNDO_EMPTY"
  | "REDO_EMPTY"
  | "UNDO_GROUP_MISMATCH"
  | "REDO_GROUP_MISMATCH"
  | "CORRUPT_PAYLOAD"
  | "CORRUPT_RECORD"
  | "CORRUPT_CHAIN"
  | "CORRUPT_CHECKPOINT"
  | "CORRUPT_SERIALIZATION"
  | "UNSUPPORTED_VERSION"
  | "INVALID_COMPACTION";

/** Stable, machine-readable journal failure. All rejected writes leave the journal unchanged. */
export class StudioCommandJournalError extends Error {
  readonly code: StudioCommandJournalErrorCode;
  readonly recordId: string | null;
  readonly path: string | null;

  constructor(
    code: StudioCommandJournalErrorCode,
    message: string,
    options: { readonly recordId?: string; readonly path?: string } = {},
  ) {
    super(message);
    this.name = "StudioCommandJournalError";
    this.code = code;
    this.recordId = options.recordId ?? null;
    this.path = options.path ?? null;
  }
}

function journalError(
  code: StudioCommandJournalErrorCode,
  message: string,
  options?: { readonly recordId?: string; readonly path?: string },
): never {
  throw new StudioCommandJournalError(code, message, options);
}

export function isPlainCommandRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function canonicalJsonValue(
  value: unknown,
  path: string,
  ancestors: WeakSet<object>,
  depth: number,
): string {
  if (depth > 64) {
    journalError("INVALID_JSON", "Command JSON nesting exceeds the supported depth.", { path });
  }
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      journalError("INVALID_JSON", "Command JSON numbers must be finite.", { path });
    }
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (typeof value !== "object") {
    journalError("INVALID_JSON", "Command data must contain only JSON-safe values.", { path });
  }
  if (ancestors.has(value)) {
    journalError("INVALID_JSON", "Command data must not contain cycles.", { path });
  }
  ancestors.add(value);

  try {
    if (Array.isArray(value)) {
      const ownKeys = Reflect.ownKeys(value);
      for (const key of ownKeys) {
        if (key === "length") continue;
        if (
          typeof key !== "string"
          || !/^(?:0|[1-9][0-9]*)$/u.test(key)
          || Number(key) >= value.length
        ) {
          journalError("INVALID_JSON", "Command JSON arrays must not have custom properties.", {
            path,
          });
        }
      }
      const serialized: string[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) {
          journalError("INVALID_JSON", "Sparse arrays are not valid command data.", {
            path: `${path}[${index}]`,
          });
        }
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !Object.hasOwn(descriptor, "value")) {
          journalError("INVALID_JSON", "Accessors are not valid command data.", {
            path: `${path}[${index}]`,
          });
        }
        serialized.push(
          canonicalJsonValue(descriptor.value, `${path}[${index}]`, ancestors, depth + 1),
        );
      }
      return `[${serialized.join(",")}]`;
    }

    if (!isPlainCommandRecord(value)) {
      journalError("INVALID_JSON", "Command JSON objects must use a plain or null prototype.", {
        path,
      });
    }
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key !== "string")) {
      journalError("INVALID_JSON", "Symbol keys are not valid command data.", { path });
    }
    const keys = (ownKeys as string[]).sort();
    const serialized: string[] = [];
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, "value")) {
        journalError("INVALID_JSON", "Accessors and hidden properties are not valid command data.", {
          path: `${path}.${key}`,
        });
      }
      serialized.push(
        `${JSON.stringify(key)}:${canonicalJsonValue(
          descriptor.value,
          `${path}.${key}`,
          ancestors,
          depth + 1,
        )}`,
      );
    }
    return `{${serialized.join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

/**
 * RFC-8259-compatible canonical JSON with sorted object keys.
 *
 * It also rejects values JSON.stringify would silently coerce or discard (NaN, holes, undefined,
 * getters, symbols, custom prototypes, and cycles), keeping checksum inputs fail-closed.
 */
export function canonicalStudioCommandJson(
  value: unknown,
  maxBytes = STUDIO_COMMAND_JOURNAL_HARD_MAX_SERIALIZED_BYTES,
): string {
  const canonical = canonicalJsonValue(value, "$", new WeakSet(), 0);
  const byteLength = TEXT_ENCODER.encode(canonical).byteLength;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || byteLength > maxBytes) {
    journalError("PAYLOAD_TOO_LARGE", "Command JSON exceeds its configured byte budget.");
  }
  return canonical;
}
