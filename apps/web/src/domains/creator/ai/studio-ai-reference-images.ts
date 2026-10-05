/**
 * Studio AI 역할 기준 이미지 준비 — 제공자 요청 전에 기준 이미지(data URL)를 검증·정규화하고
 * 디코딩 크기·서명을 검사하는 순수 로직. studio-ai-client.ts에서 분리했다(파일 크기 래칫 해소).
 *
 * 검증 실패는 throw가 아니라 StudioAiResult의 invalid_input으로 돌려주는 것이 이 모듈의 계약이다
 * (dataUrlToBlob만 기존 계약대로 data URL이 아니면 throw한다).
 */
import { formatNumber } from "@toonstudio/core/format";

import {
  STUDIO_AI_IMAGE_REFERENCE_LIMITS,
  normalizeStudioAiImageReferences,
  type StudioAiImageReference,
  type StudioAiImageReferenceRole,
} from "./studio-ai-image-reference-roles";

import type { StudioAiResult } from "./studio-ai-client";

/** Browser-side admission limits applied before a paid multi-reference provider request starts. */
export const STUDIO_AI_ROLE_REFERENCE_REQUEST_LIMITS = Object.freeze({
  /** OpenAI-compatible GPT Image Edits currently accepts at most 16 multipart image inputs. */
  maxImages: 16,
  /** GPT Image prompt limit; scene text and every compiled role context share this one budget. */
  maxPromptCharacters: 32_000,
  /** Bounds one synchronous base64 decode on memory-constrained mobile browsers. */
  maxDecodedBytesPerImage: 12 * 1_024 * 1_024,
  /** Decoded binary budget, not the larger base64/data-URL character count. */
  maxTotalDecodedBytes: 50 * 1_024 * 1_024,
});

export interface StudioAiResolvedImageReference {
  readonly referenceId: string;
  readonly role: StudioAiImageReferenceRole;
  readonly dataUrl: string;
  readonly label?: string;
  readonly guidance?: string;
}

/**
 * data: URL을 Blob으로 되돌린다(순수 문자열 파싱 + atob, DOM 없이 동작). base64/URL-encoded 둘 다
 * 지원한다. data: URL이 아니면 throw한다 — 원격(http/https/blob:) URL은 의도적으로 지원하지 않는다
 * (§5 스코프 축소: 임의 URL을 fetch해 바이트로 바꾸는 건 이 순수 클라이언트의 책임 밖 — CORS 의존이
 * 생기고, "결정적 파싱"이라는 이 함수의 성격도 깨진다).
 *
 * 헤더(`data:` 다음~첫 콤마 전)는 RFC 2397처럼 `;`로 구분된 여러 파라미터를 가질 수 있다(예:
 * `data:text/plain;charset=utf-8;base64,...`) — 첫 세미콜론/콤마까지만 mime으로 읽고 `;base64`만
 * 정확히 매치하던 이전 정규식은 이런 추가 파라미터가 하나라도 끼면 유효한 data URL도 형식 불일치로
 * 오판해 throw했다(예: 대부분의 브라우저 canvas.toDataURL()/FileReader.readAsDataURL() 출력엔 없지만,
 * 외부에서 들어온 이미지에는 charset/name 같은 파라미터가 붙어 있을 수 있다). 첫 콤마로 헤더/페이로드를
 * 먼저 분리한 뒤 헤더를 `;`로 쪼개 파싱하면 파라미터 개수·순서와 무관하게 mime과 base64 플래그를
 * 안정적으로 뽑아낼 수 있다.
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const commaIndex = dataUrl.indexOf(",");
  if (!dataUrl.startsWith("data:") || commaIndex === -1) {
    throw new Error("data URL 형식이 아닙니다(원격 URL 이미지는 지원하지 않습니다).");
  }
  const header = dataUrl.slice("data:".length, commaIndex);
  const payload = dataUrl.slice(commaIndex + 1);
  const params = header.split(";");
  const mime = params[0] || "application/octet-stream";
  const isBase64 = params.slice(1).some((p) => p.trim().toLowerCase() === "base64");
  if (isBase64) {
    const bytesConstructor = (
      Uint8Array as typeof Uint8Array & {
        fromBase64?: (encoded: string) => Uint8Array;
      }
    );
    const bytes = bytesConstructor.fromBase64
      ? bytesConstructor.fromBase64(payload)
      : (() => {
          const binary = atob(payload);
          const fallbackBytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i += 1) {
            fallbackBytes[i] = binary.charCodeAt(i);
          }
          return fallbackBytes;
        })();
    return new Blob([bytes], { type: mime });
  }
  return new Blob([decodeURIComponent(payload)], { type: mime });
}

const STUDIO_AI_REFERENCE_IMAGE_MIME_TYPES = Object.freeze([
  "image/png",
  "image/jpeg",
  "image/webp",
] as const);

type StudioAiReferenceImageMimeType =
  (typeof STUDIO_AI_REFERENCE_IMAGE_MIME_TYPES)[number];

interface PreparedStudioAiRoleReference {
  readonly reference: StudioAiImageReference;
  readonly dataUrl: string;
}

interface StudioAiReferenceImageDataUrlMetadata {
  readonly mimeType: StudioAiReferenceImageMimeType;
  readonly decodedBytes: number;
  readonly extension: "png" | "jpg" | "webp";
}

const STRICT_BASE64_PAYLOAD_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;

function compareCanonicalText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function normalizeResolvedRoleReference(
  value: StudioAiResolvedImageReference,
): StudioAiImageReference | null {
  const normalized = normalizeStudioAiImageReferences([
    {
      id: value.referenceId,
      role: value.role,
      assetId: value.referenceId,
      label: value.label,
      guidance: value.guidance,
    },
  ]);
  return normalized.length === 1 ? normalized[0] ?? null : null;
}

export function prepareStudioAiRoleReferences(
  values: readonly StudioAiResolvedImageReference[],
): StudioAiResult<readonly PreparedStudioAiRoleReference[]> {
  if (values.length === 0) {
    return {
      ok: false,
      code: "invalid_input",
      error: "역할이 지정된 기준 이미지를 한 개 이상 선택하세요.",
    };
  }
  if (values.length > STUDIO_AI_ROLE_REFERENCE_REQUEST_LIMITS.maxImages) {
    return {
      ok: false,
      code: "invalid_input",
      error: `기준 이미지는 최대 ${STUDIO_AI_ROLE_REFERENCE_REQUEST_LIMITS.maxImages}개까지 사용할 수 있습니다.`,
    };
  }

  const candidates: PreparedStudioAiRoleReference[] = [];
  for (const value of values) {
    if (!value || typeof value !== "object" || typeof value.dataUrl !== "string") {
      return {
        ok: false,
        code: "invalid_input",
        error: "기준 이미지 정보가 올바르지 않습니다.",
      };
    }
    const reference = normalizeResolvedRoleReference(value);
    if (!reference || reference.id !== value.referenceId.trim()) {
      return {
        ok: false,
        code: "invalid_input",
        error: "기준 이미지의 ID 또는 역할이 올바르지 않습니다.",
      };
    }
    candidates.push({ reference, dataUrl: value.dataUrl });
  }

  candidates.sort((left, right) =>
    compareCanonicalText(left.reference.role, right.reference.role) ||
    compareCanonicalText(left.reference.id, right.reference.id) ||
    compareCanonicalText(left.reference.label ?? "", right.reference.label ?? "") ||
    compareCanonicalText(
      left.reference.guidance ?? "",
      right.reference.guidance ?? "",
    )
  );
  const prepared: PreparedStudioAiRoleReference[] = [];
  const byId = new Map<string, PreparedStudioAiRoleReference>();
  const seenDataUrlsByRole: Record<
    StudioAiImageReferenceRole,
    Set<string>
  > = {
    character: new Set(),
    method: new Set(),
    style: new Set(),
  };
  const perRole: Record<StudioAiImageReferenceRole, number> = {
    character: 0,
    method: 0,
    style: 0,
  };
  for (const candidate of candidates) {
    const previous = byId.get(candidate.reference.id);
    if (previous) {
      if (
        previous.reference.role !== candidate.reference.role ||
        previous.dataUrl !== candidate.dataUrl ||
        previous.reference.label !== candidate.reference.label ||
        previous.reference.guidance !== candidate.reference.guidance
      ) {
        return {
          ok: false,
          code: "invalid_input",
          error: `중복된 기준 이미지 ID(${candidate.reference.id})의 내용이 서로 다릅니다.`,
        };
      }
      continue;
    }
    const seenRoleDataUrls = seenDataUrlsByRole[candidate.reference.role];
    if (seenRoleDataUrls.has(candidate.dataUrl)) continue;
    if (
      perRole[candidate.reference.role] >=
      STUDIO_AI_IMAGE_REFERENCE_LIMITS.maxReferencesPerRole
    ) {
      return {
        ok: false,
        code: "invalid_input",
        error: `한 역할에는 기준 이미지를 최대 ${STUDIO_AI_IMAGE_REFERENCE_LIMITS.maxReferencesPerRole}개까지 사용할 수 있습니다.`,
      };
    }
    prepared.push(candidate);
    byId.set(candidate.reference.id, candidate);
    seenRoleDataUrls.add(candidate.dataUrl);
    perRole[candidate.reference.role] += 1;
  }
  return { ok: true, data: prepared };
}

export function inspectStudioAiReferenceImageDataUrl(
  dataUrl: string,
): StudioAiResult<StudioAiReferenceImageDataUrlMetadata> {
  const commaIndex = dataUrl.indexOf(",");
  if (
    !dataUrl.startsWith("data:")
    || commaIndex <= "data:".length
    || commaIndex > 256
  ) {
    return {
      ok: false,
      code: "invalid_input",
      error: "기준 이미지는 PNG, JPEG 또는 WebP base64 data URL이어야 합니다.",
    };
  }
  const headerParts = dataUrl
    .slice("data:".length, commaIndex)
    .split(";")
    .map((part) => part.trim());
  const mimeType = headerParts[0]?.toLowerCase();
  if (
    !STUDIO_AI_REFERENCE_IMAGE_MIME_TYPES.includes(
      mimeType as StudioAiReferenceImageMimeType,
    )
  ) {
    return {
      ok: false,
      code: "invalid_input",
      error: "기준 이미지는 PNG, JPEG 또는 WebP 형식만 사용할 수 있습니다.",
    };
  }
  if (!headerParts.slice(1).some((part) => part.toLowerCase() === "base64")) {
    return {
      ok: false,
      code: "invalid_input",
      error: "기준 이미지는 base64로 인코딩된 data URL이어야 합니다.",
    };
  }
  const payload = dataUrl.slice(commaIndex + 1);
  if (payload.length === 0 || payload.length % 4 !== 0) {
    return {
      ok: false,
      code: "invalid_input",
      error: "기준 이미지의 base64 데이터가 올바르지 않습니다.",
    };
  }
  const padding =
    payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  const decodedBytes = (payload.length / 4) * 3 - padding;
  if (!Number.isSafeInteger(decodedBytes) || decodedBytes <= 0) {
    return {
      ok: false,
      code: "invalid_input",
      error: "기준 이미지의 디코딩 크기가 올바르지 않습니다.",
    };
  }
  if (
    decodedBytes >
    STUDIO_AI_ROLE_REFERENCE_REQUEST_LIMITS.maxDecodedBytesPerImage
  ) {
    return {
      ok: false,
      code: "invalid_input",
      error: `기준 이미지 한 장의 디코딩 크기는 ${formatNumber(STUDIO_AI_ROLE_REFERENCE_REQUEST_LIMITS.maxDecodedBytesPerImage)}바이트를 넘을 수 없습니다.`,
    };
  }
  if (!STRICT_BASE64_PAYLOAD_PATTERN.test(payload)) {
    return {
      ok: false,
      code: "invalid_input",
      error: "기준 이미지의 base64 데이터가 올바르지 않습니다.",
    };
  }
  const canonicalMimeType = mimeType as StudioAiReferenceImageMimeType;
  return {
    ok: true,
    data: {
      mimeType: canonicalMimeType,
      decodedBytes,
      extension:
        canonicalMimeType === "image/png"
          ? "png"
          : canonicalMimeType === "image/jpeg"
            ? "jpg"
            : "webp",
    },
  };
}

export async function matchesStudioAiReferenceImageSignature(
  blob: Blob,
  mimeType: StudioAiReferenceImageMimeType,
): Promise<boolean> {
  if (mimeType === "image/png") {
    const bytes = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
    return (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }
  if (mimeType === "image/jpeg") {
    const [head, tail] = await Promise.all([
      blob.slice(0, 2).arrayBuffer(),
      blob.slice(Math.max(0, blob.size - 2), blob.size).arrayBuffer(),
    ]);
    const headBytes = new Uint8Array(head);
    const tailBytes = new Uint8Array(tail);
    return (
      blob.size >= 4 &&
      headBytes[0] === 0xff &&
      headBytes[1] === 0xd8 &&
      tailBytes[0] === 0xff &&
      tailBytes[1] === 0xd9
    );
  }
  const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  return (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}
