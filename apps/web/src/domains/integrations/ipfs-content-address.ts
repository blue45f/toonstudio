import { CID } from "multiformats/cid";
import * as rawCodec from "multiformats/codecs/raw";
import { sha256 } from "multiformats/hashes/sha2";

/**
 * IPFS 콘텐츠 주소(CID) 도구 — Helia 생태계 경량축.
 *
 * 채택 경위 (2026-10-06 실측):
 * - js-ipfs는 저장소가 archived되고 README에 "DEPRECATED: superseded by
 *   Helia, 보안 수정이 제공되지 않는다"고 명시돼 있어 어떤 경우에도 넣지 않는다.
 * - 후계 Helia 생태계의 @helia/verified-fetch도 전이 의존성 보안 권고(node-forge,
 *   braces)가 아직 해소되지 않아, 실제로 닫히는 범위 — CID 생성·검증,
 *   검증 게이트웨이 가져오기, 게이트웨이 내보내기 링크 — 는 multiformats와
 *   공개 게이트웨이 fetch로 구현한다. UnixFS 파일 단위 CID 호환·브라우저 노드
 *   제공이 필요해지면 같은 자리에서 다시 검토한다.
 *
 * 정직한 경계:
 * - 여기서 만드는 CID는 raw 코덱(0x55) 단일 블록 주소다. 바이트열 자체가
 *   블록이라 해시 검증이 곧 콘텐츠 검증이다. 큰 파일을 UnixFS로 쪼갠
 *   dag-pb CID와는 주소가 다르다 — 같은 파일이라도 두 주소는 호환되지 않는다.
 * - 가져오기는 공개 게이트웨이를 경유하고, 내려받은 바이트를 CID 해시와
 *   직접 대조해 검증한다. 게이트웨이가 거짓 데이터를 주면 검증에서 걸러진다.
 * - 브라우저에서 네트워크에 콘텐츠를 "제공(provide)"하는 기능은 없다.
 *   CID는 무결성 주소·공유 링크로 쓰고, 실제 바이트 배포는 게이트웨이와
 *   기존 서버 표면이 맡는다.
 */

export const IPFS_RAW_CODEC_CODE = rawCodec.code; // 0x55
export const IPFS_DAG_PB_CODEC_CODE = 0x70;
export const IPFS_SHA2_256_CODE = sha256.code; // 0x12

export const DEFAULT_IPFS_GATEWAYS: readonly string[] = [
  "https://ipfs.io",
  "https://dweb.link",
];

/**
 * 검증 가져오기가 브라우저 fetch로 접속하는 게이트웨이 목록 (링크용과 별개).
 * 운영 CSP(config/http-response-headers.json)의 connect-src에 없으면 브라우저가 연결을 막으므로,
 * 화면 안내(IpfsContentAddressPanel)와 CSP 설정이 어긋나지 않는지 테스트가 이 목록을 대조한다.
 */
export const VERIFIED_FETCH_GATEWAYS: readonly string[] = [
  "https://trustless-gateway.link",
  ...DEFAULT_IPFS_GATEWAYS,
];

export interface ParsedContentCid {
  /** 정규화된 CID 문자열 (ipfs:// 접두사 제거) */
  cid: string;
  version: 0 | 1;
  /** 멀티코덱 코드 (raw=0x55, dag-pb=0x70 등) */
  codecCode: number;
  codecName: "raw" | "dag-pb" | "unknown";
  /** 멀티해시 코드 (sha2-256=0x12) */
  hashCode: number;
  hashName: "sha2-256" | "identity" | "unknown";
}

/** "ipfs://<cid>", 앞뒤 공백, 게이트웨이 URL 형태까지 받아 CID 문자열만 뽑는다. */
export function extractCidText(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withoutScheme = trimmed.replace(/^ipfs:\/\//iu, "");
  const gatewayMatch = /^https?:\/\/[^/]+\/ipfs\/([^/?#]+)/u.exec(withoutScheme);
  if (gatewayMatch?.[1]) return decodeURIComponent(gatewayMatch[1]);
  const bare = withoutScheme.split(/[/?#]/u)[0] ?? "";
  return bare || null;
}

/** CID 문자열·ipfs:// URI·게이트웨이 URL을 파싱한다. 형식이 깨졌으면 null. */
export function parseContentCid(input: string): ParsedContentCid | null {
  const text = extractCidText(input);
  if (!text) return null;
  try {
    const cid = CID.parse(text);
    return {
      cid: cid.toString(),
      version: cid.version,
      codecCode: cid.code,
      codecName: cid.code === IPFS_RAW_CODEC_CODE
        ? "raw"
        : cid.code === IPFS_DAG_PB_CODEC_CODE
          ? "dag-pb"
          : "unknown",
      hashCode: cid.multihash.code,
      hashName: cid.multihash.code === IPFS_SHA2_256_CODE
        ? "sha2-256"
        : cid.multihash.code === 0
          ? "identity"
          : "unknown",
    };
  } catch {
    return null;
  }
}

/**
 * 바이트열의 raw CID를 만든다. 같은 바이트는 언제 어디서든 같은 CID가 된다 —
 * 서버 위치가 아니라 내용 자체가 주소다.
 */
export async function computeContentCid(bytes: Uint8Array): Promise<string> {
  const digest = await sha256.digest(bytes);
  return CID.createV1(rawCodec.code, digest).toString();
}

export type ContentCidVerification =
  | "match"
  | "mismatch"
  | "invalid-cid"
  | "unsupported-hash"
  | "unsupported-codec";

/**
 * 바이트열이 주어진 CID의 내용과 같은지 검증한다.
 * raw + sha2-256 조합에서만 바이트 단위 판정이 가능하다. dag-pb는 직렬화된
 * UnixFS 블록이 해시 대상이라 임의 파일 바이트와 직접 대조할 수 없어
 * "unsupported-codec"으로 정직하게 구분한다(파일 검증은 UnixFS 재조립 필요).
 */
export async function verifyContentBytes(
  bytes: Uint8Array,
  cidInput: string,
): Promise<ContentCidVerification> {
  const parsed = parseContentCid(cidInput);
  if (!parsed) return "invalid-cid";
  if (parsed.hashName !== "sha2-256") return "unsupported-hash";
  if (parsed.codecName !== "raw") return "unsupported-codec";
  const cid = CID.parse(parsed.cid);
  const digest = await sha256.digest(bytes);
  const expected = cid.multihash.digest;
  if (expected.length !== digest.digest.length) return "mismatch";
  for (let i = 0; i < expected.length; i += 1) {
    if (expected[i] !== digest.digest[i]) return "mismatch";
  }
  return "match";
}

/** ipfs:// URI를 만든다. 파싱할 수 없는 입력이면 null. */
export function toIpfsUri(cidInput: string): string | null {
  const parsed = parseContentCid(cidInput);
  return parsed ? `ipfs://${parsed.cid}` : null;
}

/** 공개 게이트웨이에서 바로 열 수 있는 HTTPS 링크를 만든다(내보내기·공유용). */
export function toIpfsGatewayUrl(
  cidInput: string,
  gateway: string = DEFAULT_IPFS_GATEWAYS[0],
): string | null {
  const parsed = parseContentCid(cidInput);
  if (!parsed) return null;
  return `${gateway.replace(/\/+$/u, "")}/ipfs/${parsed.cid}`;
}

/** 공개 게이트웨이에서 검증 가져오기를 시도할 때 네트워크 타임아웃 상한. */
const VERIFIED_FETCH_TIMEOUT_MS = 15_000;

let verifiedFetchPromise: Promise<((url: string) => Promise<Response>) | null> | null = null;

async function loadVerifiedFetch(): Promise<((url: string) => Promise<Response>) | null> {
  verifiedFetchPromise ??= (async () => {
    const baseFetch: typeof fetch | undefined =
      typeof fetch === "function" ? fetch.bind(globalThis) : undefined;
    if (!baseFetch) return null;
    return async (url: string) => {
      const cid = url.replace(/^ipfs:\/\//iu, "").split(/[/?#]/u)[0] ?? "";
      let lastError: unknown = null;
      for (const gateway of VERIFIED_FETCH_GATEWAYS) {
        const target = `${gateway.replace(/\/+$/u, "")}/ipfs/${encodeURIComponent(cid)}`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), VERIFIED_FETCH_TIMEOUT_MS);
        try {
          const response = await baseFetch(target, { signal: controller.signal });
          if (!response.ok) {
            lastError = new Error(`게이트웨이 응답 ${response.status}`);
            continue;
          }
          const bytes = new Uint8Array(await response.arrayBuffer());
          const verdict = await verifyContentBytes(bytes, cid);
          if (verdict !== "match") {
            throw new Error(`게이트웨이가 돌려준 내용이 CID와 일치하지 않습니다 (${verdict}).`);
          }
          return new Response(bytes.slice().buffer, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          });
        } catch (cause) {
          if (cause instanceof Error && cause.message.includes("CID와 일치하지")) throw cause;
          lastError = cause;
        } finally {
          clearTimeout(timer);
        }
      }
      throw lastError instanceof Error ? lastError : new Error("게이트웨이에서 콘텐츠를 가져오지 못했습니다.");
    };
  })();
  return verifiedFetchPromise;
}

/**
 * CID로 콘텐츠를 가져오되, 게이트웨이가 돌려준 바이트 해시를 CID와 대조해
 * 검증한다. 검증에 실패하면 응답이 오지 않고 던져진다 —
 * 호출자는 실패를 그대로 사용자에게 보여주면 된다.
 * `fetchImpl`은 테스트 주입용이다.
 */
export async function fetchVerifiedContent(
  cidInput: string,
  fetchImpl?: (url: string) => Promise<Response>,
): Promise<Response> {
  const uri = toIpfsUri(cidInput);
  if (!uri) throw new Error("CID 형식이 올바르지 않습니다.");
  const fetcher = fetchImpl ?? (await loadVerifiedFetch());
  if (!fetcher) throw new Error("검증 가져오기를 초기화하지 못했습니다.");
  return fetcher(uri);
}

/** 테스트 전용: 캐시된 검증 가져오기를 비운다. */
export function resetIpfsForTests(): void {
  verifiedFetchPromise = null;
}
