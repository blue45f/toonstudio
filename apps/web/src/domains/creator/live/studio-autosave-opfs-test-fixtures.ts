import { StudioAutosaveOpfsSession, type StudioAutosaveOpfsJournalPort } from "../studio-autosave-opfs-session";
import type { StudioAutosavePayload } from "../studio-autosave";
import type {
  StudioOpfsRecoveryEntry,
  StudioOpfsRecoveryScan,
  StudioOpfsRecoveryWriterLease,
} from "../studio-opfs-recovery-journal";

const DOCUMENT_ID = "autosave-test-document";
const ENGINE_VERSION = "studio-autosave-v2";

export function payload(savedAt: string, elementId = "stroke-1"): StudioAutosavePayload {
  return {
    version: 2,
    savedAt,
    pagesList: [{
      id: "page-1",
      elements: [{ id: elementId, type: "draw" }],
      canvasH: 2_000,
    }],
    currentPageId: "page-1",
  };
}

export class FakeAutosaveJournal implements StudioAutosaveOpfsJournalPort {
  readonly payloads = new Map<string, Uint8Array>();
  entries: StudioOpfsRecoveryEntry[] = [];
  epoch = 0;
  acquireCount = 0;
  renewCount = 0;
  releaseCount = 0;
  now = 1_000;
  appendGate: Promise<void> | null = null;

  async scan(options: { readonly signal?: AbortSignal } = {}): Promise<StudioOpfsRecoveryScan> {
    options.signal?.throwIfAborted();
    return Object.freeze({
      generation: this.entries.length,
      writerEpoch: this.epoch,
      lastSequence: this.entries.at(-1)?.sequence ?? 0,
      totalPayloadBytes: this.entries.reduce((total, entry) => total + entry.byteLength, 0),
      entries: Object.freeze([...this.entries]),
      selectedSlot: this.entries.length > 0 ? "a" : null,
      ignoredSlots: Object.freeze([]),
    });
  }

  async *readPayload(entry: StudioOpfsRecoveryEntry): AsyncIterable<Uint8Array> {
    const bytes = this.payloads.get(entry.descriptorPath);
    if (!bytes) throw new Error("missing payload");
    const split = Math.floor(bytes.byteLength / 2);
    if (split > 0) yield bytes.slice(0, split);
    yield bytes.slice(split);
  }

  async acquireWriter(
    input: { readonly ownerId: string },
  ): Promise<StudioOpfsRecoveryWriterLease> {
    this.acquireCount += 1;
    this.epoch += 1;
    return Object.freeze({
      documentId: DOCUMENT_ID,
      ownerId: input.ownerId,
      token: `token-${this.epoch}`,
      epoch: this.epoch,
      acquiredAt: this.now,
      expiresAt: this.now + 30_000,
    });
  }

  async renewWriter(
    writer: StudioOpfsRecoveryWriterLease,
  ): Promise<StudioOpfsRecoveryWriterLease> {
    this.renewCount += 1;
    return Object.freeze({
      ...writer,
      expiresAt: this.now + 30_000,
    });
  }

  async releaseWriter(): Promise<void> {
    this.releaseCount += 1;
  }

  async appendCheckpoint(
    writer: StudioOpfsRecoveryWriterLease,
    input: {
      readonly id: string;
      readonly pageId: string;
      readonly revision: number;
      readonly payload: Uint8Array;
      readonly byteLength: number;
      readonly createdAt: number;
      readonly compactThroughSequence: number;
    },
  ): Promise<StudioOpfsRecoveryEntry> {
    await this.appendGate;
    const sequence = (this.entries.at(-1)?.sequence ?? 0) + 1;
    this.entries = this.entries.filter(
      (entry) =>
        entry.pageId !== input.pageId
        || entry.sequence > input.compactThroughSequence,
    );
    const descriptorPath = `entry-${sequence}`;
    const entry: StudioOpfsRecoveryEntry = Object.freeze({
      kind: "checkpoint",
      id: input.id,
      sequence,
      pageId: input.pageId,
      revision: input.revision,
      documentId: writer.documentId,
      documentVersion: 2,
      engineVersion: ENGINE_VERSION,
      writerEpoch: writer.epoch,
      createdAt: input.createdAt,
      byteLength: input.byteLength,
      chunks: Object.freeze([{
        path: `chunk-${sequence}`,
        byteLength: input.byteLength,
        crc32: 0,
      }]),
      compactThroughSequence: input.compactThroughSequence,
      descriptorPath,
      descriptorCrc32: 0,
    });
    this.payloads.set(descriptorPath, Uint8Array.from(input.payload));
    this.entries.push(entry);
    return entry;
  }

  async evictObsolete(): Promise<unknown> {
    return Object.freeze({ removedPaths: Object.freeze([]), freedBytes: 0 });
  }
}

export function session(
  journal: FakeAutosaveJournal,
  key = "toonstudio-studio-autosave:v12:guest:new",
): StudioAutosaveOpfsSession {
  return new StudioAutosaveOpfsSession({
    autosaveKey: key,
    journal,
    ownerId: "autosave-test-owner",
    now: () => journal.now,
  });
}
