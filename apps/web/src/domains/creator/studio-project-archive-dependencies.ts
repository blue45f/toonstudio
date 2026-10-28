import type { StudioProjectArchiveDocumentReference } from "./studio-project-archive";
import { parseStudioBundleSourceCredit } from "@toonstudio/contracts/studio-bundle-source-credit";

export function probableStudioProjectAssetField(pointer: string): boolean {
  const tail = pointer.split("/").at(-1)?.toLowerCase() ?? "";
  return tail === "bg" || /(src|url|href|model|audio|reference|texture|file|asset)/u.test(tail);
}

/** 검증된 출처·deed URL은 바이너리를 다시 받아야 하는 외부 의존성이 아니다. */
export function isStudioBundleArchiveMetadata(pointer: string, value: unknown): boolean {
  return pointer.endsWith("/bundleSourceCredit") && parseStudioBundleSourceCredit(value) !== null;
}

export function studioProjectArchiveReferenceMode(
  reference: StudioProjectArchiveDocumentReference
): "asset-uri" | "sha256-prefixed" {
  return reference.mode ?? "asset-uri";
}


function measureStudioProjectArchiveAttachment(
  attachment: { readonly data: Blob | Uint8Array | ArrayBuffer },
): number {
  const { data } = attachment;
  let byteSize: number;
  if (data instanceof Uint8Array || data instanceof ArrayBuffer) byteSize = data.byteLength;
  else if (typeof Blob !== "undefined" && data instanceof Blob) byteSize = data.size;
  else throw new Error("portable archive attachment의 byte 크기를 확인할 수 없습니다.");
  if (!Number.isSafeInteger(byteSize) || byteSize < 0) {
    throw new Error("portable archive attachment의 byte 크기가 올바르지 않습니다.");
  }
  return byteSize;
}

export function summarizeStudioProjectArchiveAttachments(
  attachments: readonly { readonly data: Blob | Uint8Array | ArrayBuffer }[],
): { readonly bytes: number; readonly count: number } {
  let bytes = 0;
  for (const attachment of attachments) {
    bytes += measureStudioProjectArchiveAttachment(attachment);
    if (!Number.isSafeInteger(bytes)) {
      throw new Error("portable archive attachment byte 합계를 안전하게 계산할 수 없습니다.");
    }
  }
  return Object.freeze({ bytes, count: attachments.length });
}
