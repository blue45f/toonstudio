/**
 * 클라이언트가 직접 적립을 요청하는 활동(`claimMode: "client"`)의 metadata 경계.
 *
 * 요청 본문 한도(16MB)까지 임의 JSON 이 wallet_lot·wallet_ledger_entry 의 jsonb 에 그대로 영구 저장되지
 * 않도록, 작은 원시값(문자열·유한한 숫자·불리언)만 제한된 개수와 길이로 남긴다. 정상 클라이언트가
 * 보내는 값은 `{ gameId }` 정도라 영향이 없다.
 */
export const ACTIVITY_CLAIM_METADATA_MAX_KEYS = 8;
export const ACTIVITY_CLAIM_METADATA_MAX_KEY_LENGTH = 40;
export const ACTIVITY_CLAIM_METADATA_MAX_VALUE_LENGTH = 120;
/** 키 8개 x (키 40자 + 값 120자) 에 따옴표·구분자를 더한 직렬화 크기의 여유 있는 상한. */
export const ACTIVITY_CLAIM_METADATA_MAX_BYTES = 4_096;

type ActivityClaimMetadataValue = string | number | boolean;

export function sanitizeActivityClaimMetadata(
  value: unknown,
): Record<string, ActivityClaimMetadataValue> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const entries: [string, ActivityClaimMetadataValue][] = [];
  for (const [key, entry] of Object.entries(value)) {
    if (entries.length >= ACTIVITY_CLAIM_METADATA_MAX_KEYS) break;
    if (key.length === 0 || key.length > ACTIVITY_CLAIM_METADATA_MAX_KEY_LENGTH) continue;
    if (typeof entry === "string") {
      entries.push([key, entry.slice(0, ACTIVITY_CLAIM_METADATA_MAX_VALUE_LENGTH)]);
    } else if (typeof entry === "number" && Number.isFinite(entry)) {
      entries.push([key, entry]);
    } else if (typeof entry === "boolean") {
      entries.push([key, entry]);
    }
  }
  // fromEntries 는 `__proto__` 도 일반 own 속성으로 만들어 프로토타입을 바꾸지 않는다.
  return Object.fromEntries(entries);
}
