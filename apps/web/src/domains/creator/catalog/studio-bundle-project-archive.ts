import { requireStudioBundleSourceCredit, type StudioBundleSourceCredit } from "@toonstudio/contracts/studio-bundle-source-credit";
import { StudioWorkAssetManifestSchema } from "@toonstudio/contracts/studio-work-asset-contract";

import { sha256HexPortable } from "../studio-sha256";
import { studioBundleCreditMatchesSource } from "./studio-bundle-source-credit";

import type { StudioProjectArchiveAttachmentInput, StudioProjectArchiveLimits } from "../studio-project-archive";

type DownloadWorkAsset = typeof import("../studio-work-asset-client").downloadStudioWorkAsset;
type BundleSource = { record: Record<string, unknown>; field: "src" | "bg"; source: string; pointer: string; credit: StudioBundleSourceCredit };
type RasterReference = { pointer: string; usage: "raster" };

function visitBundleSources(value: unknown, pointer: string, accept: (source: BundleSource) => void): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) { value.forEach((entry, index) => visitBundleSources(entry, `${pointer}/${index}`, accept)); return; }
  const record = value as Record<string, unknown>;
  if ((record.type === "image" || record.type === "frame") && record.bundleSourceCredit !== undefined) {
    const credit = requireStudioBundleSourceCredit(record.bundleSourceCredit);
    const field = record.type === "frame" ? "bg" : "src", source = record[field];
    if (typeof source !== "string") throw new TypeError("번들 렌더의 아카이브 이미지 소스가 없습니다.");
    if (source.startsWith("work-asset:") && (record.type !== "image" || typeof record.id !== "string" || source !== `work-asset://image/${encodeURIComponent(record.id)}`)) throw new TypeError("번들 작품 에셋의 요소 식별자가 다릅니다.");
    accept({ record, field, source, pointer: `${pointer}/${field}`, credit });
  }
  for (const [key, entry] of Object.entries(record)) {
    if (key !== "bundleSourceCredit") visitBundleSources(entry, `${pointer}/${key.replace(/~/gu, "~0").replace(/\//gu, "~1")}`, accept);
  }
}

/** 현재 문서의 검증된 렌더만 읽고, caller가 공급한 본문은 기존 검증 후 SHA 참조로 닫는다. */
export async function collectStudioBundleArchiveAttachments(
  project: Record<string, unknown>,
  limits: Pick<StudioProjectArchiveLimits, "maxAttachmentBytes" | "maxTotalAttachmentBytes" | "maxAttachments">,
  options: { attachments?: readonly StudioProjectArchiveAttachmentInput[]; signal?: AbortSignal } = {},
): Promise<{ attachments: StudioProjectArchiveAttachmentInput[]; assertSuppliedReferences: () => void }> {
  options.signal?.throwIfAborted();
  const supplied = new Set<string>();
  for (const attachment of options.attachments ?? []) {
    if (!attachment || attachment.kind !== "raster" || !Array.isArray(attachment.documentReferences)) continue;
    for (const reference of attachment.documentReferences) if (reference && typeof reference === "object" && reference.usage === "raster" && (reference.mode === undefined || reference.mode === "asset-uri")) supplied.add(reference.pointer);
  }
  const deferred: BundleSource[] = [];
  const groups = new Map<string, { path: string; hash: string; references: RasterReference[] }>();
  visitBundleSources(project, "", entry => {
    const { source, credit, pointer } = entry;
    if (source.startsWith("data:") || source.startsWith("toonstudio-asset://sha256/")) return;
    const opaque = source.startsWith("work-asset:");
    if (!opaque && !studioBundleCreditMatchesSource(credit, source)) throw new TypeError("번들 출처와 아카이브 렌더 경로가 달라 본문 수집을 중단했습니다.");
    if (supplied.has(pointer)) { deferred.push(entry); return; }
    // 현재 workId가 없어 본문을 공급하지 못한 참조는 기존 외부 의존성 경고로 남긴다.
    if (opaque) return;
    const key = `${credit.renderPath}:${credit.contentHash}`;
    const group = groups.get(key) ?? { path: source, hash: credit.contentHash, references: [] };
    group.references.push({ pointer, usage: "raster" }); groups.set(key, group);
  });
  if (groups.size > limits.maxAttachments) throw new TypeError("번들 아카이브 이미지 개수 제한을 넘었습니다.");
  const attachments: StudioProjectArchiveAttachmentInput[] = [];
  let total = 0;
  for (const group of groups.values()) {
    const bytes = await withBundleReadAbort(options.signal, signal => readBundleRaster(group.path, Math.min(limits.maxAttachmentBytes, limits.maxTotalAttachmentBytes - total), signal));
    total += bytes.byteLength;
    if (`sha256:${sha256HexPortable(bytes)}` !== group.hash) throw new TypeError("번들 렌더의 실제 바이트 해시가 달라 아카이브 생성을 중단했습니다.");
    attachments.push({ kind: "raster", mimeType: "image/webp", data: bytes, documentReferences: group.references });
  }
  return { attachments, assertSuppliedReferences: () => {
    for (const entry of deferred) if (entry.record[entry.field] !== `toonstudio-asset://sha256/${entry.credit.contentHash.slice(7)}`) throw new TypeError("공급한 번들 이미지 본문과 출처의 SHA 참조가 일치하지 않습니다.");
  } };
}

/** 인증된 기존 작품 포트로 현재 바이트를 받는다. 원본 renderPath로 대신 읽지 않는다. */
export async function prepareStudioBundleWorkAssetArchiveExport(
  input: { project: unknown; workId: string | null; signal?: AbortSignal; limits?: Partial<StudioProjectArchiveLimits> },
  dependencies: { download?: DownloadWorkAsset } = {},
): Promise<StudioProjectArchiveAttachmentInput[]> {
  input.signal?.throwIfAborted();
  const groups = new Map<string, { assetId: string; credit: StudioBundleSourceCredit; references: RasterReference[] }>();
  visitBundleSources(input.project, "", entry => {
    if (!entry.source.startsWith("work-asset:") || typeof entry.record.id !== "string") return;
    const existing = groups.get(entry.record.id);
    if (existing && JSON.stringify(existing.credit) !== JSON.stringify(entry.credit)) throw new TypeError("같은 작품 이미지의 번들 출처가 다릅니다.");
    const group = existing ?? { assetId: entry.record.id, credit: entry.credit, references: [] };
    group.references.push({ pointer: entry.pointer, usage: "raster" }); groups.set(group.assetId, group);
  });
  const workId = input.workId;
  if (!workId || groups.size === 0) return [];
  if (groups.size > (input.limits?.maxAttachments ?? 512)) throw new TypeError("번들 작품 이미지의 개수 제한을 넘었습니다.");
  const download = dependencies.download ?? (await import("../studio-work-asset-client")).downloadStudioWorkAsset;
  const attachments: StudioProjectArchiveAttachmentInput[] = [];
  let total = 0;
  for (const group of groups.values()) {
    const { manifest: candidate, blob } = await withBundleReadAbort(input.signal, signal => download(workId, { assetId: group.assetId, elementType: "image" }, signal));
    const manifest = StudioWorkAssetManifestSchema.parse(candidate);
    const descriptorCredit = requireStudioBundleSourceCredit(manifest.descriptor.element.bundleSourceCredit);
    if (manifest.assetId !== group.assetId || manifest.elementType !== "image" || manifest.sha256 !== group.credit.contentHash.slice(7)
      || JSON.stringify(descriptorCredit) !== JSON.stringify(group.credit) || blob.type !== manifest.mimeType || blob.size !== manifest.byteSize) throw new TypeError("작품 이미지의 manifest·출처·본문이 일치하지 않습니다.");
    total += blob.size;
    if (blob.size > (input.limits?.maxAttachmentBytes ?? 96_000_000) || total > (input.limits?.maxTotalAttachmentBytes ?? 256_000_000)) throw new TypeError("번들 작품 이미지의 아카이브 용량 제한을 넘었습니다.");
    const bytes = await withBundleReadAbort(input.signal, async signal => { const value = new Uint8Array(await blob.arrayBuffer()); signal.throwIfAborted(); return value; });
    if (`sha256:${sha256HexPortable(bytes)}` !== group.credit.contentHash) throw new TypeError("번들 작품 이미지의 실제 바이트 해시가 다릅니다.");
    attachments.push({ kind: "raster", mimeType: manifest.mimeType, data: blob, documentReferences: group.references });
  }
  return attachments;
}

async function withBundleReadAbort<T>(source: AbortSignal | undefined, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  source?.throwIfAborted();
  const controller = new AbortController();
  const forward = () => controller.abort(source?.reason);
  source?.addEventListener("abort", forward, { once: true });
  let rejectAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = () => reject(controller.signal.reason); controller.signal.addEventListener("abort", rejectAbort, { once: true }); });
  const timer = setTimeout(() => controller.abort(new DOMException("번들 이미지 읽기 시간이 초과됐습니다.", "TimeoutError")), 30_000);
  try { return await Promise.race([operation(controller.signal), aborted]); }
  finally { clearTimeout(timer); source?.removeEventListener("abort", forward); if (rejectAbort) controller.signal.removeEventListener("abort", rejectAbort); }
}

async function readBundleRaster(path: string, maximum: number, signal: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  if (maximum < 1) throw new TypeError("번들 아카이브의 이미지 용량 제한을 넘었습니다.");
  const response = await fetch(path, { signal, credentials: "omit", redirect: "error", mode: "same-origin", cache: "no-cache" });
  const declared = response.headers.get("content-length");
  if (!response.ok || response.redirected || (declared !== null && (!/^\d+$/u.test(declared) || Number(declared) > maximum))) throw new TypeError("번들 렌더를 안전하게 읽지 못해 아카이브 생성을 중단했습니다.");
  if (!response.body) throw new TypeError("번들 아카이브에 포함할 이미지 본문이 없습니다.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) { await reader.cancel(); throw new TypeError("번들 아카이브 이미지의 용량 제한을 넘었습니다."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
