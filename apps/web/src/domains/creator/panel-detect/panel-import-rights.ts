import type { PanelImportRights } from "@toonstudio/contracts/panel-import-rights";
import { sha256HexPortable } from "../studio-sha256";

export * from "@toonstudio/contracts/panel-import-rights";

/** 원본 파일 바이트의 SHA-256. 가능하면 브라우저 네이티브 구현을 쓰고, 없으면 순수 JS 구현으로 대신한다. */
export async function computeSourceSha256(buffer: ArrayBuffer): Promise<string> {
  const subtle = typeof crypto !== "undefined" ? crypto.subtle : undefined;
  if (subtle && typeof subtle.digest === "function") {
    const digest = new Uint8Array(await subtle.digest("SHA-256", buffer));
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return sha256HexPortable(new Uint8Array(buffer));
}

/** 프로젝트 설명·ZIP 안내문에 쓰는 한 줄 영수증(한글). */
export function panelImportReceiptText(rights: PanelImportRights): string {
  const { source } = rights;
  const date = rights.attestedAt.slice(0, 10);
  const note = rights.note ? ` · 메모: ${rights.note}` : "";
  return `컷 자동 감지 가져오기 · 원본 ${source.fileName} (${source.width}×${source.height}px, SHA-256 ${source.sha256.slice(0, 12)}…) · 사용자 권리 확인 ${date}${note}`;
}
