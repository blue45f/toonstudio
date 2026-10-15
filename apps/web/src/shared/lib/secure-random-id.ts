const DEFAULT_SECURE_RANDOM_ID_ERROR =
  "이 환경에서는 안전한 식별자를 만들 수 없습니다.";

/** Creates an RFC 4122 version 4 UUID using Web Crypto only. */
export function createSecureRandomUuid(
  errorMessage = DEFAULT_SECURE_RANDOM_ID_ERROR,
): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") {
    try {
      return cryptoApi.randomUUID();
    } catch {
      // Some embedded WebViews expose a throwing randomUUID implementation.
    }
  }
  if (typeof cryptoApi?.getRandomValues !== "function") {
    throw new Error(errorMessage);
  }
  const bytes = new Uint8Array(16);
  try {
    cryptoApi.getRandomValues(bytes);
  } catch {
    throw new Error(errorMessage);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(
    bytes,
    (value) => value.toString(16).padStart(2, "0"),
  ).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

/** `crypto.getRandomValues` 한 번에 채울 수 있는 상한(65,536바이트)보다 한참 작은 배치 크기(Uint32 개수). */
const SECURE_RANDOM_STRING_BATCH = 256;

/**
 * 알파벳에서 균등하게 뽑은 문자로 토큰·코드를 만든다(Web Crypto + 거부 표집).
 * 초대 코드·공유 링크 토큰·세션 ID 처럼 추측되면 안 되는 값에 쓴다. 안전한 난수원이 없으면
 * Math.random 으로 대체하지 않고 `errorMessage` 로 던진다(CodeQL js/insecure-randomness, CWE-338).
 */
export function createSecureRandomString(
  alphabet: string,
  length: number,
  errorMessage = DEFAULT_SECURE_RANDOM_ID_ERROR,
): string {
  if (!Number.isSafeInteger(length) || length < 0) {
    throw new RangeError("토큰 길이는 0 이상의 정수여야 합니다.");
  }
  const symbols = Array.from(alphabet);
  if (symbols.length < 2 || symbols.length > 0x1_0000) {
    throw new RangeError("토큰 알파벳은 2자 이상 65,536자 이하여야 합니다.");
  }
  if (length === 0) return "";
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.getRandomValues !== "function") {
    throw new Error(errorMessage);
  }
  // 알파벳 크기의 배수 중 2^32 이하로 가장 큰 값. 이 값 이상은 버려 모듈로 편향을 없앤다.
  const limit = Math.floor(0x1_0000_0000 / symbols.length) * symbols.length;
  const buffer = new Uint32Array(
    Math.min(Math.max(length * 2, 16), SECURE_RANDOM_STRING_BATCH),
  );
  const picked: string[] = [];
  while (picked.length < length) {
    try {
      cryptoApi.getRandomValues(buffer);
    } catch {
      throw new Error(errorMessage);
    }
    for (const value of buffer) {
      if (value >= limit) continue;
      const symbol = symbols[value % symbols.length];
      if (symbol !== undefined) picked.push(symbol);
      if (picked.length === length) break;
    }
  }
  return picked.join("");
}
