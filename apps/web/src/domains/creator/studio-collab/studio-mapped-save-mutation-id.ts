import { canonicalJson } from "@toonstudio/studio-project-model";
import { sha256HexPortable } from "@toonstudio/contracts/sha256-portable";

/** 전체 본문·metadata·현재 grant가 같은 재확인만 동일 요청으로 연결한다. */
export function studioMappedSaveMutationId(workId: string, body: unknown): string {
  const hex = sha256HexPortable(new TextEncoder().encode(canonicalJson({ purpose: "studio-mapped-full-save-v1", workId, body }))).slice(0, 32);
  const variant = ((Number.parseInt(hex.charAt(16), 16) & 3) | 8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20)}`;
}
