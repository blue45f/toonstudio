/** 저장 모델 A/B를 같은 V12 snapshot에서 확인하고 동기 장면 반영까지 읽기 잠금을 유지한다. */
import { isSafeBg3dModelStorageId, parseV12ModelManifest } from "./bg3d-model-library";
import { STUDIO_BG3D_GLB_MAX_BYTES, STUDIO_BG3D_GLB_MIME_TYPE } from "./studio-bg3d-glb-validation";
import { getStudioBg3dLibrariesAuthority } from "./studio-bg3d-libraries-sqlite-opfs-authority";
import type { StudioBg3dLibrariesAuthority, StudioBg3dLibraryReadSnapshotContext } from "./studio-bg3d-libraries-sqlite-opfs-authority";
import type { StudioBg3dAttachmentRights } from "./studio-bg3d-scene-document-types";

export interface StudioBg3dModelReadLeaseRecordIdentity {
  readonly id: string;
  readonly contentHash: string;
  readonly byteSize: number;
  readonly mime: string;
  readonly rights: StudioBg3dAttachmentRights;
}
export interface StudioBg3dModelReadLease {
  isCurrent(): boolean;
  /** 실제 WebLock 반환까지 기다린다. 보상 쓰기 전에 반드시 await한다. */
  release(): Promise<void>;
}
export type StudioBg3dModelReadLeaseErrorCode = "aborted" | "unsupported-authority" | "invalid-record" | "record-changed" | "read-failed";
export type StudioBg3dModelReadLeaseResult = { readonly ok: true; readonly lease: StudioBg3dModelReadLease }
  | { readonly ok: false; readonly code: StudioBg3dModelReadLeaseErrorCode; readonly messageKo: string };
export interface StudioBg3dModelReadLeaseOptions {
  /** combined wrapper의 dispose와 관계없이 원래 요청·operation lease를 수명 전체 감시한다. */
  readonly signals: readonly AbortSignal[];
  readonly authority?: StudioBg3dLibrariesAuthority;
}
const MESSAGES: Readonly<Record<StudioBg3dModelReadLeaseErrorCode, string>> = {
  aborted: "모델 원본 검증 또는 장면 반영이 취소되어 읽기 잠금을 해제했습니다.",
  "unsupported-authority": "현재 저장소는 모델 원본을 함께 보호하는 읽기를 지원하지 않아 장면을 교체하지 않았습니다.",
  "invalid-record": "함께 확인할 모델 원본의 ID·해시·크기 정보가 올바르지 않습니다.",
  "record-changed": "저장된 모델 원본 또는 새 파생본의 연결·권리·바이트가 바뀌어 장면을 교체하지 않았습니다.",
  "read-failed": "모델 원본을 같은 저장 snapshot에서 확인하지 못해 장면을 교체하지 않았습니다.",
};
class ReadLeaseFailure extends Error {
  constructor(readonly code: StudioBg3dModelReadLeaseErrorCode) { super(MESSAGES[code]); }
}
function failure(code: StudioBg3dModelReadLeaseErrorCode): StudioBg3dModelReadLeaseResult {
  return { ok: false, code, messageKo: MESSAGES[code] };
}
function sameRights(a: StudioBg3dAttachmentRights, b: StudioBg3dAttachmentRights): boolean {
  return a.status === b.status && a.commercialUse === b.commercialUse && a.attributionRequired === b.attributionRequired
    && a.attribution === b.attribution && a.licenseName === b.licenseName;
}
function identityCopy(expected: readonly StudioBg3dModelReadLeaseRecordIdentity[]): StudioBg3dModelReadLeaseRecordIdentity[] {
  if (!Array.isArray(expected) || expected.length < 1 || expected.length > 2) throw new ReadLeaseFailure("invalid-record");
  const result = expected.map((item) => {
    if (!item || !isSafeBg3dModelStorageId(item.id) || !/^sha256:[a-f0-9]{64}$/u.test(item.contentHash)
      || !Number.isSafeInteger(item.byteSize) || item.byteSize <= 0 || item.byteSize > STUDIO_BG3D_GLB_MAX_BYTES
      || item.mime !== STUDIO_BG3D_GLB_MIME_TYPE || !item.rights) throw new ReadLeaseFailure("invalid-record");
    return { id: item.id, contentHash: item.contentHash, byteSize: item.byteSize, mime: item.mime, rights: { ...item.rights } };
  });
  if (new Set(result.map(({ id }) => id)).size !== result.length) throw new ReadLeaseFailure("invalid-record");
  return result;
}
async function verifySnapshot(context: StudioBg3dLibraryReadSnapshotContext,
  identities: readonly StudioBg3dModelReadLeaseRecordIdentity[], assertCurrent: () => void): Promise<void> {
  const manifest = parseV12ModelManifest(context.currentRaw);
  for (const expected of identities) {
    assertCurrent();
    const record = manifest.records.find(({ id }) => id === expected.id);
    if (!record || record.contentHash !== expected.contentHash || record.byteSize !== expected.byteSize
      || record.mime !== expected.mime || !sameRights(record.rights, expected.rights)) throw new ReadLeaseFailure("record-changed");
    const bytes = await context.getBlob(record.blobRef);
    assertCurrent();
    if (!(bytes instanceof Uint8Array) || bytes.byteLength !== expected.byteSize) throw new ReadLeaseFailure("record-changed");
    const hash = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
    assertCurrent();
    const actual = `sha256:${Array.from(new Uint8Array(hash), (value) => value.toString(16).padStart(2, "0")).join("")}`;
    if (actual !== expected.contentHash) throw new ReadLeaseFailure("record-changed");
  }
}

/** 동일 origin에서 이 authority의 WebLock을 지키는 V12 writer만 보호한다. 임의 DB/CAS 직접 쓰기는 범위 밖이다. */
export async function acquireStudioBg3dModelReadLeaseV12(
  expected: readonly StudioBg3dModelReadLeaseRecordIdentity[], options: StudioBg3dModelReadLeaseOptions,
): Promise<StudioBg3dModelReadLeaseResult> {
  let identities: StudioBg3dModelReadLeaseRecordIdentity[];
  try { identities = identityCopy(expected); } catch { return failure("invalid-record"); }
  const authority = options.authority ?? getStudioBg3dLibrariesAuthority();
  const snapshot = authority.withReadSnapshot;
  if (!snapshot) return failure("unsupported-authority");
  const controller = new AbortController();
  let held = false, released = false, published = false;
  let publish: (result: StudioBg3dModelReadLeaseResult) => void = () => undefined;
  const ready = new Promise<StudioBg3dModelReadLeaseResult>((resolve) => { publish = resolve; });
  const publishOnce = (result: StudioBg3dModelReadLeaseResult) => { if (!published) { published = true; publish(result); } };
  let end: () => void = () => undefined;
  const ended = new Promise<void>((resolve) => { end = resolve; });
  let unlock: () => void = () => undefined;
  const releasedGate = new Promise<void>((resolve) => { unlock = resolve; });
  const release = async () => { released = true; held = false; unlock(); await ended; };
  const abort = () => {
    controller.abort(); released = true; held = false; unlock(); publishOnce(failure("aborted"));
  };
  const signals = [...new Set(options.signals)];
  for (const signal of signals) signal.addEventListener("abort", abort, { once: true });
  if (signals.some((signal) => signal.aborted)) abort();
  const assertCurrent = () => { if (released || controller.signal.aborted) throw new ReadLeaseFailure("aborted"); };
  const lease: StudioBg3dModelReadLease = { isCurrent: () => held && !released && !controller.signal.aborted, release };
  const finish = (error?: unknown) => {
    held = false; released = true; unlock();
    for (const signal of signals) signal.removeEventListener("abort", abort);
    publishOnce(failure(error instanceof ReadLeaseFailure ? error.code : controller.signal.aborted ? "aborted" : "read-failed"));
    end();
  };
  // ready는 lock 내부에서 발행하고, snapshot callback은 release까지 끝내지 않는다.
  void Promise.resolve().then(() => snapshot.call(authority, "models", async (context) => {
    assertCurrent();
    await verifySnapshot(context, identities, assertCurrent);
    assertCurrent(); held = true; publishOnce({ ok: true, lease });
    await releasedGate;
  }, controller.signal)).then(() => finish(), finish);
  return ready;
}
