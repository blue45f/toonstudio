/**
 * 가져온 원고의 출처·권리 확인 기록.
 *
 * 스캔본이나 다른 사람의 원고는 저작권이 걸려 있을 수 있다. 컷 감지·재배열·카드 슬라이스는 모두 "내가 권리를 가진 원고이거나
 * 이용 허락을 받은 원고입니다" 확인 뒤에만 진행하며, 이 기록은 그 확인을 결과물(Studio 문서 이미지, 카드 ZIP)에 남긴다.
 *
 * - `createPanelImportRights` 는 `confirmed: true` 가 아니면 만들어지지 않는다. 화면의 체크박스가 아니라 데이터 계층에서도
 *   확인 없이는 결과물을 만들 수 없게 한다.
 * - 기록에는 파일 이름·크기·가로세로·SHA-256 만 담는다. 이미지 바이트나 외부 주소는 담지 않는다(외부 전송 없음).
 * - 기존 권리 명세 경로에 합류한다: ImageEl.sourceRights → studio-asset-rights-projection → 권리 명세(rights manifest).
 *   이 기록은 사용자의 자기 확인일 뿐이며 법률 자문·권리 인증·제3자 권리 보유 보증이 아니다.
 */

import { sha256HexPortable } from "../studio-sha256";

export const PANEL_IMPORT_RIGHTS_SCHEMA = "toonstudio.panel-import-rights" as const;
export const PANEL_IMPORT_RIGHTS_VERSION = 1 as const;
export const PANEL_IMPORT_RIGHTS_STATEMENT = "owned-or-licensed" as const;
export const PANEL_IMPORT_NOTE_MAX_LENGTH = 300;
export const PANEL_IMPORT_TOOL = Object.freeze({ name: "panel-detect-reflow", version: 1 as const });

/** 화면이 보여 주는 확인 문구의 한글 정본(이중언어 화면은 같은 뜻의 영문을 함께 둔다). */
export const PANEL_IMPORT_RIGHTS_STATEMENT_KO = "내가 권리를 가진 원고이거나 이용 허락을 받은 원고입니다";

export interface PanelImportSourceReceipt {
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly width: number;
  readonly height: number;
  /** 원본 파일 바이트의 SHA-256(소문자 hex 64자). */
  readonly sha256: string;
}

export interface PanelImportRights {
  readonly schema: typeof PANEL_IMPORT_RIGHTS_SCHEMA;
  readonly version: typeof PANEL_IMPORT_RIGHTS_VERSION;
  readonly statement: typeof PANEL_IMPORT_RIGHTS_STATEMENT;
  readonly attestedAt: string;
  /** 사용자가 적은 출처·이용 허락 메모(선택). */
  readonly note: string;
  readonly source: PanelImportSourceReceipt;
  readonly tool: { readonly name: typeof PANEL_IMPORT_TOOL.name; readonly version: typeof PANEL_IMPORT_TOOL.version };
}

export class PanelImportRightsError extends Error {
  readonly code: "not-confirmed" | "invalid-receipt" | "invalid-time";

  constructor(code: PanelImportRightsError["code"], message: string) {
    super(message);
    this.name = "PanelImportRightsError";
    this.code = code;
  }
}

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

/** 제어 문자를 공백으로 바꾸고 공백을 정리해 길이를 제한한다. */
export function normalizePanelImportNote(raw: string): string {
  let cleaned = "";
  for (const character of raw) {
    const codePoint = character.codePointAt(0) ?? 0;
    cleaned += codePoint <= 31 || (codePoint >= 127 && codePoint <= 159) ? " " : character;
  }
  const collapsed = cleaned.replace(/\s+/gu, " ").trim();
  const characters = [...collapsed];
  return characters.length <= PANEL_IMPORT_NOTE_MAX_LENGTH ? collapsed : characters.slice(0, PANEL_IMPORT_NOTE_MAX_LENGTH).join("");
}

function validReceipt(source: PanelImportSourceReceipt): boolean {
  return source.fileName.trim().length > 0
    && source.fileName.length <= 255
    && Number.isSafeInteger(source.sizeBytes) && source.sizeBytes > 0
    && Number.isSafeInteger(source.width) && source.width > 0
    && Number.isSafeInteger(source.height) && source.height > 0
    && SHA256_PATTERN.test(source.sha256);
}

export interface CreatePanelImportRightsInput {
  /** 사용자가 권리 확인 문구에 동의했는가. true 가 아니면 기록을 만들지 않는다. */
  readonly confirmed: boolean;
  readonly attestedAt: string;
  readonly note?: string;
  readonly source: PanelImportSourceReceipt;
}

export function createPanelImportRights(input: CreatePanelImportRightsInput): PanelImportRights {
  if (input.confirmed !== true) {
    throw new PanelImportRightsError("not-confirmed", "원고 권리 확인 없이는 결과물을 만들 수 없어요.");
  }
  if (Number.isNaN(Date.parse(input.attestedAt))) {
    throw new PanelImportRightsError("invalid-time", "권리 확인 시각이 올바르지 않아요.");
  }
  if (!validReceipt(input.source)) {
    throw new PanelImportRightsError("invalid-receipt", "원본 파일 정보가 올바르지 않아요.");
  }
  return Object.freeze({
    schema: PANEL_IMPORT_RIGHTS_SCHEMA,
    version: PANEL_IMPORT_RIGHTS_VERSION,
    statement: PANEL_IMPORT_RIGHTS_STATEMENT,
    attestedAt: new Date(input.attestedAt).toISOString(),
    note: normalizePanelImportNote(input.note ?? ""),
    source: Object.freeze({ ...input.source }),
    tool: PANEL_IMPORT_TOOL,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 저장소에서 읽은 값(신뢰 경계)이 기록 형식을 지키면 읽기 전용 기록으로 돌려주고, 아니면 null. */
export function parsePanelImportRights(value: unknown): PanelImportRights | null {
  if (!isRecord(value) || value.schema !== PANEL_IMPORT_RIGHTS_SCHEMA || value.version !== PANEL_IMPORT_RIGHTS_VERSION) return null;
  if (value.statement !== PANEL_IMPORT_RIGHTS_STATEMENT || typeof value.attestedAt !== "string" || Number.isNaN(Date.parse(value.attestedAt))) return null;
  if (typeof value.note !== "string" || value.note.length > PANEL_IMPORT_NOTE_MAX_LENGTH * 2) return null;
  const source = value.source;
  if (!isRecord(source)) return null;
  const { fileName, mimeType, sizeBytes, width, height, sha256 } = source;
  if (
    typeof fileName !== "string" || typeof mimeType !== "string" || typeof sha256 !== "string"
    || typeof sizeBytes !== "number" || typeof width !== "number" || typeof height !== "number"
  ) return null;
  const receipt: PanelImportSourceReceipt = { fileName, mimeType, sizeBytes, width, height, sha256 };
  if (!validReceipt(receipt)) return null;
  return Object.freeze({
    schema: PANEL_IMPORT_RIGHTS_SCHEMA,
    version: PANEL_IMPORT_RIGHTS_VERSION,
    statement: PANEL_IMPORT_RIGHTS_STATEMENT,
    attestedAt: value.attestedAt,
    note: value.note,
    source: Object.freeze(receipt),
    tool: PANEL_IMPORT_TOOL,
  });
}

/** 같은 원본에서 나온 모든 컷이 권리 명세에서 하나의 자산으로 묶이도록 하는 안정 ID. */
export function panelImportRightsAssetId(rights: PanelImportRights): string {
  return `panel-import:${rights.source.sha256.slice(0, 24)}`;
}

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
