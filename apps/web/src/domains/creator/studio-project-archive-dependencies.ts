import { parseStudioBundleSourceCredit } from "@toonstudio/contracts/studio-bundle-source-credit";

export function probableStudioProjectAssetField(pointer: string): boolean {
  const tail = pointer.split("/").at(-1)?.toLowerCase() ?? "";
  return /(src|url|href|model|audio|reference|texture|file|asset)/u.test(tail);
}

/** 검증된 출처·deed URL은 바이너리를 다시 받아야 하는 외부 의존성이 아니다. */
export function isStudioBundleArchiveMetadata(pointer: string, value: unknown): boolean {
  return pointer.endsWith("/bundleSourceCredit") && parseStudioBundleSourceCredit(value) !== null;
}
