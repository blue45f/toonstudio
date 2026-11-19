import {
  parseStudioWorkflowPack,
  type StudioWorkflowPack,
} from "./studio-workflow-pack";

export const WORKFLOW_PACK_QUERY_PARAM = "workflowPack";
const MAX_ENCODED_PAYLOAD_CHARS = 8_192;

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(encoded: string): Uint8Array | null {
  if (!encoded || encoded.length > MAX_ENCODED_PAYLOAD_CHARS) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) return null;
  const padded = encoded.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (encoded.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

/**
 * StudioWorkflowPack 을 URL 쿼리에 안전하게 넣을 수 있는 UTF-8 Base64URL 토큰으로 인코딩한다.
 */
export function encodeWorkflowPackDeepLink(pack: StudioWorkflowPack): string {
  const bytes = new TextEncoder().encode(JSON.stringify(pack));
  return bytesToBase64Url(bytes);
}

/**
 * Base64URL 토큰을 복원하고 StudioWorkflowPack 스키마 검증을 통과한 경우에만 반환한다.
 */
export function decodeWorkflowPackDeepLink(token: string): StudioWorkflowPack | null {
  const bytes = base64UrlToBytes(token.trim());
  if (!bytes) return null;
  try {
    const raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return parseStudioWorkflowPack(raw);
  } catch {
    return null;
  }
}

/**
 * 현재 앱 origin/path 기준 1클릭 공유 딥링크 URL 을 생성한다.
 */
export function buildWorkflowPackShareUrl(pack: StudioWorkflowPack, baseUrl: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set(WORKFLOW_PACK_QUERY_PARAM, encodeWorkflowPackDeepLink(pack));
  return url.toString();
}

/**
 * URL 쿼리 문자열(`?workflowPack=...`)에서 유효한 워크플로우 팩을 추출한다.
 */
export function extractWorkflowPackFromSearch(search: string): StudioWorkflowPack | null {
  const params = new URLSearchParams(search);
  const token = params.get(WORKFLOW_PACK_QUERY_PARAM);
  if (!token) return null;
  return decodeWorkflowPackDeepLink(token);
}
