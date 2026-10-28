/** `.toon3d` 파일용 portable JSON. OPFS 경로·로그인 범위는 파일에서 가져오지 않는다. */
import { canonicalStudioCommandJson } from "../studio-command-journal";
import { sha256HexPortable } from "../studio-sha256";

import {
  rebindStudioHybridDccWorkfileWorkspace,
  validateStudioHybridDccWorkfileHistory,
} from "./studio-hybrid-dcc-workfile-rebind";
import {
  decodeStudioHybridDccWorkspacePersistenceEnvelope,
  encodeStudioHybridDccWorkspacePersistenceEnvelope,
  STUDIO_HYBRID_DCC_WORKSPACE_PERSISTENCE_MAX_BYTES,
} from "./studio-hybrid-dcc-workspace-persistence";

import type { StudioHybridDccWorkspace } from "./studio-hybrid-dcc-workspace";

export const STUDIO_HYBRID_DCC_WORKFILE_FORMAT = "toonstudio.hybrid-dcc-workfile" as const;
export const STUDIO_HYBRID_DCC_WORKFILE_VERSION = 1 as const;
export const STUDIO_HYBRID_DCC_WORKFILE_MIME = "application/vnd.toonstudio.toon3d+json" as const;
export const STUDIO_HYBRID_DCC_WORKFILE_MAX_BYTES = STUDIO_HYBRID_DCC_WORKSPACE_PERSISTENCE_MAX_BYTES + 4096;

const PORTABLE_SCOPE = Object.freeze({ userId: "portable-toon3d", workId: "portable-workspace-v1" });
const ENCODER = new TextEncoder();
const DECODER = new TextDecoder("utf-8", { fatal: true });

export type StudioHybridDccWorkfileErrorCode =
  | "INVALID_FORMAT" | "UNSUPPORTED_VERSION" | "PAYLOAD_TOO_LARGE"
  | "INTEGRITY_FAILED" | "INVALID_WORKSPACE" | "INVALID_DOCUMENT_ID" | "INVALID_HISTORY";

const MESSAGES: Record<StudioHybridDccWorkfileErrorCode, string> = {
  INVALID_FORMAT: "지원하는 ToonStudio 작업파일 형식이 아닙니다.",
  UNSUPPORTED_VERSION: "지원하지 않는 ToonStudio 작업파일 버전입니다.",
  PAYLOAD_TOO_LARGE: "작업파일 크기가 편집기의 저장 한도를 넘었습니다.",
  INTEGRITY_FAILED: "작업파일의 내용과 무결성 정보가 일치하지 않습니다.",
  INVALID_WORKSPACE: "작업파일의 메시·변형·저장 데이터를 검증하지 못했습니다.",
  INVALID_DOCUMENT_ID: "작업파일을 열 현재 문서 ID가 올바르지 않습니다.",
  INVALID_HISTORY: "작업파일의 되돌리기·다시 실행 이력을 검증하지 못했습니다.",
};

export class StudioHybridDccWorkfileError extends Error {
  constructor(readonly code: StudioHybridDccWorkfileErrorCode, cause?: unknown) {
    super(MESSAGES[code], { cause });
    this.name = "StudioHybridDccWorkfileError";
  }
}

function fail(code: StudioHybridDccWorkfileErrorCode, cause?: unknown): never {
  throw new StudioHybridDccWorkfileError(code, cause);
}

function decodePersistence(bytes: Uint8Array): StudioHybridDccWorkspace {
  try {
    const decoded = decodeStudioHybridDccWorkspacePersistenceEnvelope({ bytes, scope: PORTABLE_SCOPE });
    if (!decoded.workspace || decoded.kind !== "workspace") fail("INVALID_WORKSPACE");
    return decoded.workspace;
  } catch (cause) {
    if (cause instanceof StudioHybridDccWorkfileError) throw cause;
    fail("INVALID_WORKSPACE", cause);
  }
}

function validateHistory(workspace: StudioHybridDccWorkspace): void {
  try { validateStudioHybridDccWorkfileHistory(workspace.session); }
  catch (cause) { fail("INVALID_HISTORY", cause); }
}

function encodePersistence(workspace: StudioHybridDccWorkspace) {
  try {
    return encodeStudioHybridDccWorkspacePersistenceEnvelope({ workspace, scope: PORTABLE_SCOPE, savedAt: 0 });
  } catch (cause) { fail("INVALID_WORKSPACE", cause); }
}

/** 원본·저널·파생 cache를 변경하지 않고 검증 가능한 UTF-8 파일 바이트를 만든다. */
export function encodeStudioHybridDccWorkfile(workspace: StudioHybridDccWorkspace): Uint8Array {
  const encoded = encodePersistence(workspace);
  validateHistory(decodePersistence(encoded.bytes));
  const workfile = {
    format: STUDIO_HYBRID_DCC_WORKFILE_FORMAT,
    version: STUDIO_HYBRID_DCC_WORKFILE_VERSION,
    workspaceByteLength: encoded.bytes.byteLength,
    workspaceHash: `sha256:${sha256HexPortable(encoded.bytes)}`,
    workspace: encoded.envelope,
  };
  try { return ENCODER.encode(canonicalStudioCommandJson(workfile, STUDIO_HYBRID_DCC_WORKFILE_MAX_BYTES)); }
  catch (cause) { fail("PAYLOAD_TOO_LARGE", cause); }
}

/** 파일 검증이 모두 끝난 뒤에만 호출자의 문서 ID로 독립 작업공간을 복원한다. */
export function decodeStudioHybridDccWorkfile(
  bytes: Uint8Array,
  options: { readonly documentId: string },
): StudioHybridDccWorkspace {
  if (!options || typeof options.documentId !== "string" || !options.documentId.trim()
    || options.documentId !== options.documentId.trim() || options.documentId.length > 256
    || Array.from(options.documentId).some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    })) fail("INVALID_DOCUMENT_ID");
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0
    || bytes.byteLength > STUDIO_HYBRID_DCC_WORKFILE_MAX_BYTES) fail("PAYLOAD_TOO_LARGE");
  let parsed: unknown;
  let text: string;
  try { text = DECODER.decode(bytes); parsed = JSON.parse(text) as unknown; }
  catch (cause) { fail("INVALID_FORMAT", cause); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) fail("INVALID_FORMAT");
  const record = parsed as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.join("|") !== ["format", "version", "workspace", "workspaceByteLength", "workspaceHash"].sort().join("|")
    || record.format !== STUDIO_HYBRID_DCC_WORKFILE_FORMAT) fail("INVALID_FORMAT");
  if (record.version !== STUDIO_HYBRID_DCC_WORKFILE_VERSION) fail("UNSUPPORTED_VERSION");
  let workspaceBytes: Uint8Array;
  try {
    if (canonicalStudioCommandJson(parsed, STUDIO_HYBRID_DCC_WORKFILE_MAX_BYTES) !== text) fail("INVALID_FORMAT");
    workspaceBytes = ENCODER.encode(canonicalStudioCommandJson(record.workspace, STUDIO_HYBRID_DCC_WORKSPACE_PERSISTENCE_MAX_BYTES));
  } catch (cause) {
    if (cause instanceof StudioHybridDccWorkfileError) throw cause;
    fail("INVALID_FORMAT", cause);
  }
  if (record.workspaceByteLength !== workspaceBytes.byteLength
    || record.workspaceHash !== `sha256:${sha256HexPortable(workspaceBytes)}`) fail("INTEGRITY_FAILED");
  const decoded = decodePersistence(workspaceBytes);
  validateHistory(decoded);
  try {
    const rebound = rebindStudioHybridDccWorkfileWorkspace(decoded, options.documentId);
    // ID 변경 뒤의 현재/과거 snapshot·BOM·bridge도 기존 decoder로 한 번 더 검증한다.
    const verified = decodePersistence(encodePersistence(rebound).bytes);
    validateHistory(verified);
    return verified;
  } catch (cause) {
    if (cause instanceof StudioHybridDccWorkfileError) throw cause;
    fail("INVALID_WORKSPACE", cause);
  }
}
