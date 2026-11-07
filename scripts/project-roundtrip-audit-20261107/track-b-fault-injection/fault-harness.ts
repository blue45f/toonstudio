import {
  studioPackageCrc32,
} from "../../../apps/web/src/domains/creator/save-first/studio-project-package";
import {
  STUDIO_SAVE_PROFILE_STORAGE_KEY,
  writeStudioSaveProfiles,
} from "../../../apps/web/src/domains/creator/save-first/studio-save-profile";
import {
  STUDIO_SUBMISSION_STORAGE_KEY,
} from "../../../apps/web/src/domains/creator/save-first/studio-submission-store";
import {
  studioAutosaveKey,
  writeStudioLifecycleAutosave,
} from "../../../apps/web/src/domains/creator/studio-autosave";
import {
  writeStudioProjectDocuments,
} from "../../../apps/web/src/domains/creator/studio-project-document-store";
import {
  writeStudioProjectLibrary,
} from "../../../apps/web/src/domains/creator/studio-project-library-store";
import {
  canonicalJsonDigest,
  createMemoryStorage,
  createTrackASyntheticFixture,
  snapshotStorageState,
  type TrackASyntheticRoundtripFixture,
} from "../track-a-roundtrip-migration/synthetic-fixtures";

const TEXT_ENCODER = new TextEncoder();

export interface SeededBaselineEnvironment {
  readonly fixture: TrackASyntheticRoundtripFixture;
  readonly storage: Storage;
  readonly mainAutosaveKey: string;
  readonly archivedAutosaveKey: string;
  readonly baselineSnapshot: Readonly<Record<string, string>>;
  readonly baselineDigest: string;
}

/**
 * 폴트 인젝션 실험 전 사용자의 기존 로컬 스토리지 원본 상태를 구성하고
 * 바이트 단위 불변성 기준 다이제스트를 기록한다.
 */
export function createSeededBaselineEnvironment(): SeededBaselineEnvironment {
  const fixture = createTrackASyntheticFixture();
  const storage = createMemoryStorage();

  writeStudioProjectLibrary(storage, {
    schemaVersion: 1,
    projects: [fixture.project],
    updatedAt: fixture.savedAt,
  });
  writeStudioProjectDocuments(storage, {
    schemaVersion: 1,
    projectId: fixture.project.id,
    documents: fixture.documents,
    updatedAt: fixture.savedAt,
  });
  writeStudioSaveProfiles(storage, {
    schemaVersion: 1,
    profiles: {
      [fixture.project.id]: fixture.profile,
    },
    updatedAt: fixture.savedAt,
  });
  storage.setItem(
    STUDIO_SUBMISSION_STORAGE_KEY,
    JSON.stringify({
      schemaVersion: 1,
      submissions: fixture.submissions,
      updatedAt: fixture.savedAt,
    }),
  );

  const mainAutosaveKey = studioAutosaveKey({ userId: null, workId: "doc-main-1" });
  const archivedAutosaveKey = studioAutosaveKey({ userId: null, workId: "doc-archived-empty-2" });
  writeStudioLifecycleAutosave(storage, mainAutosaveKey, fixture.primarySnapshot, {
    preservePrimary: false,
  });
  writeStudioLifecycleAutosave(
    storage,
    archivedAutosaveKey,
    fixture.archivedEmptyElementsSnapshot,
    { preservePrimary: false },
  );

  const baselineSnapshot = snapshotStorageState(storage);
  const baselineDigest = canonicalJsonDigest(baselineSnapshot);

  return {
    fixture,
    storage,
    mainAutosaveKey,
    archivedAutosaveKey,
    baselineSnapshot,
    baselineDigest,
  };
}

export interface QuotaFaultStorageController {
  readonly storage: Storage;
  readonly getSetItemCallCount: () => number;
  readonly getRemoveItemCallCount: () => number;
  readonly getMutatedKeys: () => readonly string[];
}

export function createQuotaFaultStorage(
  backingStorage: Storage,
  options: {
    readonly failOnCallNumber?: number;
    readonly failWhenKeyIncludes?: string;
    readonly persistentFailureAfterTrigger?: boolean;
  },
): QuotaFaultStorageController {
  let setItemCalls = 0;
  let removeItemCalls = 0;
  let triggered = false;
  const mutatedKeys: string[] = [];

  const createQuotaError = (): Error => {
    const error = new DOMException("The quota has been exceeded.", "QuotaExceededError");
    return error;
  };

  const storage: Storage = {
    get length() {
      return backingStorage.length;
    },
    clear() {
      backingStorage.clear();
    },
    getItem(key: string) {
      return backingStorage.getItem(key);
    },
    key(index: number) {
      return backingStorage.key(index);
    },
    removeItem(key: string) {
      removeItemCalls += 1;
      mutatedKeys.push(`remove:${key}`);
      backingStorage.removeItem(key);
    },
    setItem(key: string, value: string) {
      setItemCalls += 1;
      mutatedKeys.push(`set:${key}`);
      if (triggered && options.persistentFailureAfterTrigger) {
        throw createQuotaError();
      }
      if (
        (options.failOnCallNumber !== undefined && setItemCalls === options.failOnCallNumber)
        || (options.failWhenKeyIncludes !== undefined && key.includes(options.failWhenKeyIncludes))
      ) {
        triggered = true;
        throw createQuotaError();
      }
      backingStorage.setItem(key, value);
    },
  };

  return {
    storage,
    getSetItemCallCount: () => setItemCalls,
    getRemoveItemCallCount: () => removeItemCalls,
    getMutatedKeys: () => [...mutatedKeys],
  };
}

export interface EventRecordingTarget {
  readonly target: EventTarget;
  readonly events: ReadonlyArray<{ readonly type: string; readonly detail: unknown }>;
  readonly latestDetailByType: ReadonlyMap<string, unknown>;
}

export function createEventRecordingTarget(): EventRecordingTarget {
  const target = new EventTarget();
  const events: Array<{ readonly type: string; readonly detail: unknown }> = [];
  const latestDetailByType = new Map<string, unknown>();

  const origDispatch = target.dispatchEvent.bind(target);
  target.dispatchEvent = (event: Event): boolean => {
    const custom = event as CustomEvent<unknown>;
    events.push({ type: event.type, detail: custom.detail });
    latestDetailByType.set(event.type, custom.detail);
    return origDispatch(event);
  };

  return {
    target,
    events,
    latestDetailByType,
  };
}

export function attachMidReadAbortOnSlice<T extends Blob>(
  blobOrFile: T,
  abortOnSliceCall = 2,
): {
  readonly target: T;
  readonly controller: AbortController;
  readonly getSliceCallCount: () => number;
} {
  const controller = new AbortController();
  const originalSlice = blobOrFile.slice.bind(blobOrFile);
  let sliceCalls = 0;
  Object.defineProperty(blobOrFile, "slice", {
    configurable: true,
    value: (start?: number, end?: number, contentType?: string) => {
      sliceCalls += 1;
      const sliced = originalSlice(start, end, contentType);
      if (sliceCalls >= abortOnSliceCall) {
        controller.abort();
      }
      return sliced;
    },
  });
  return {
    target: blobOrFile,
    controller,
    getSliceCallCount: () => sliceCalls,
  };
}

function littleEndian16(value: number): Uint8Array {
  return Uint8Array.of(value & 0xff, (value >>> 8) & 0xff);
}

function littleEndian32(value: number): Uint8Array {
  return Uint8Array.of(
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  );
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

export interface RawZipEntrySpec {
  readonly name: string;
  readonly bytes: Uint8Array;
  readonly flags?: number;
  readonly compressionMethod?: number;
  readonly externalAttributes?: number;
  readonly overrideCrc32?: number;
  readonly overrideUncompressedSize?: number;
}

/**
 * 손상 아카이브 폴트 인젝션용 로우레벨 ZIP 빌더:
 * - 경로 순회(../), 심볼릭 링크 모드 비트(0120000), CRC32 불일치, 비-UTF8 플래그 누락,
 *   압축 해제 크기 위조 등을 결정론적으로 합성한다.
 */
export function buildFaultInjectedZipBytes(entries: readonly RawZipEntrySpec[]): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = TEXT_ENCODER.encode(entry.name);
    const crc = entry.overrideCrc32 ?? studioPackageCrc32(entry.bytes);
    const uncompressedSize = entry.overrideUncompressedSize ?? entry.bytes.byteLength;
    const flags = entry.flags ?? 0x0800;
    const method = entry.compressionMethod ?? 0;
    const externalAttr = entry.externalAttributes ?? 0;

    const localHeader = concatBytes([
      littleEndian32(0x04034b50),
      littleEndian16(20),
      littleEndian16(flags),
      littleEndian16(method),
      littleEndian16(0),
      littleEndian16(0x21),
      littleEndian32(crc),
      littleEndian32(entry.bytes.byteLength),
      littleEndian32(uncompressedSize),
      littleEndian16(nameBytes.byteLength),
      littleEndian16(0),
      nameBytes,
    ]);
    localParts.push(localHeader, entry.bytes);

    const centralHeader = concatBytes([
      littleEndian32(0x02014b50),
      littleEndian16(0x0314),
      littleEndian16(20),
      littleEndian16(flags),
      littleEndian16(method),
      littleEndian16(0),
      littleEndian16(0x21),
      littleEndian32(crc),
      littleEndian32(entry.bytes.byteLength),
      littleEndian32(uncompressedSize),
      littleEndian16(nameBytes.byteLength),
      littleEndian16(0),
      littleEndian16(0),
      littleEndian16(0),
      littleEndian16(0),
      littleEndian32(externalAttr),
      littleEndian32(offset),
      nameBytes,
    ]);
    centralParts.push(centralHeader);
    offset += localHeader.byteLength + entry.bytes.byteLength;
  }

  const centralBytes = concatBytes(centralParts);
  const eocd = concatBytes([
    littleEndian32(0x06054b50),
    littleEndian16(0),
    littleEndian16(0),
    littleEndian16(entries.length),
    littleEndian16(entries.length),
    littleEndian32(centralBytes.byteLength),
    littleEndian32(offset),
    littleEndian16(0),
  ]);
  return concatBytes([...localParts, centralBytes, eocd]);
}

/** ZIP 바이트에서 첫 번째 엔트리의 페이로드 1바이트를 반전시켜 CRC32/SHA-256 불일치를 유발한다. */
export function flipFirstZipEntryPayloadByte(zipBytes: Uint8Array): Uint8Array {
  const mutated = new Uint8Array(zipBytes);
  const nameLen = mutated[26]! | (mutated[27]! << 8);
  const extraLen = mutated[28]! | (mutated[29]! << 8);
  const payloadStart = 30 + nameLen + extraLen;
  if (payloadStart < mutated.byteLength) {
    mutated[payloadStart] = mutated[payloadStart]! ^ 0xff;
  }
  return mutated;
}

export {
  STUDIO_SAVE_PROFILE_STORAGE_KEY,
  STUDIO_SUBMISSION_STORAGE_KEY,
};
