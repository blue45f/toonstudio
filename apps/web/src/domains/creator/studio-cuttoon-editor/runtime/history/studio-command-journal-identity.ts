/**
 * 명령 ID의 중복 판정과 기존 체크포인트의 확률 필터.
 * sequence-v1은 쓰기·체크포인트·복구가 같은 순번 계약을 검증할 때만 사용한다.
 */
export const STUDIO_COMMAND_IDENTITY_POLICY_KEY = "studioCommandIdentityPolicy";
export const STUDIO_COMMAND_SEQUENCE_IDENTITY_POLICY = "sequence-v1";
export type StudioCommandIdentityPolicy = typeof STUDIO_COMMAND_SEQUENCE_IDENTITY_POLICY | null;

export const STUDIO_COMMAND_CHECKSUM_PREFIX = "scj1-";
const IDENTITY_FILTER_BYTE_LENGTH = 8 * 1024;
export const STUDIO_COMMAND_IDENTITY_FILTER_PATTERN = new RegExp(
  `^[0-9a-f]{${IDENTITY_FILTER_BYTE_LENGTH * 2}}$`, "u",
);
const TEXT_ENCODER = new TextEncoder();

export interface StudioCommandCheckpointIdentityFrontier {
  readonly id: string;
  readonly upToSequence: number;
  readonly identityFilter: string;
  readonly extensions: Readonly<Record<string, unknown>>;
  readonly idempotency: readonly Readonly<{
    id: string;
    recordType: string;
    sequence: number;
  }>[];
}

export function checksumStudioCommandText(value: string): string {
  const bytes = TEXT_ENCODER.encode(value);
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (const byte of bytes) {
    first = Math.imul(first ^ byte, 0x01000193);
    second = Math.imul(second ^ byte, 0x85ebca6b);
    second ^= second >>> 13;
  }
  return `${STUDIO_COMMAND_CHECKSUM_PREFIX}${(first >>> 0).toString(16).padStart(8, "0")}${
    (second >>> 0).toString(16).padStart(8, "0")}`;
}

export function decodeStudioCommandIdentityFilter(value?: string): Uint8Array {
  if (value === undefined) return new Uint8Array(IDENTITY_FILTER_BYTE_LENGTH);
  const bytes = new Uint8Array(IDENTITY_FILTER_BYTE_LENGTH);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

export function encodeStudioCommandIdentityFilter(bytes: Uint8Array): string {
  let encoded = "";
  for (const byte of bytes) encoded += byte.toString(16).padStart(2, "0");
  return encoded;
}

function identityFilterPositions(identity: string): readonly number[] {
  const digest = checksumStudioCommandText(identity).slice(STUDIO_COMMAND_CHECKSUM_PREFIX.length);
  const first = Number.parseInt(digest.slice(0, 8), 16) >>> 0;
  const second = (Number.parseInt(digest.slice(8), 16) | 1) >>> 0;
  const bitLength = IDENTITY_FILTER_BYTE_LENGTH * 8;
  return [first % bitLength, ((first + second) >>> 0) % bitLength,
    ((first + Math.imul(second, 2)) >>> 0) % bitLength,
    ((first + Math.imul(second, 3)) >>> 0) % bitLength];
}

export function addStudioCommandIdentityToFilter(bytes: Uint8Array, identity: string): void {
  for (const position of identityFilterPositions(identity)) {
    const byteIndex = Math.floor(position / 8);
    bytes[byteIndex] = (bytes[byteIndex] ?? 0) | (1 << (position % 8));
  }
}

export function studioCommandIdentityFilterMayContain(filter: string | undefined, identity: string): boolean {
  if (!filter) return false;
  const bytes = decodeStudioCommandIdentityFilter(filter);
  return identityFilterPositions(identity).every((position) => (
    ((bytes[Math.floor(position / 8)] ?? 0) & (1 << (position % 8))) !== 0
  ));
}

/** null은 기존 임의 ID 계약이며, 알 수 없는 예약 metadata는 undefined로 구분한다. */
export function readStudioCommandIdentityPolicy(
  extensions: Readonly<Record<string, unknown>>,
): StudioCommandIdentityPolicy | undefined {
  if (!Object.hasOwn(extensions, STUDIO_COMMAND_IDENTITY_POLICY_KEY)) return null;
  return extensions[STUDIO_COMMAND_IDENTITY_POLICY_KEY] === STUDIO_COMMAND_SEQUENCE_IDENTITY_POLICY
    ? STUDIO_COMMAND_SEQUENCE_IDENTITY_POLICY : undefined;
}

const completeFrontiers = new WeakMap<StudioCommandCheckpointIdentityFrontier, boolean>();

/** 길이만 같아도 sequence 중복·누락이 가능하므로 1..N 전체의 정확한 보관을 확인한다. */
export function hasCompleteStudioCommandRecordIdentityFrontier(
  checkpoint: StudioCommandCheckpointIdentityFrontier | null,
): boolean {
  if (!checkpoint) return true;
  const cached = completeFrontiers.get(checkpoint);
  if (cached !== undefined) return cached;
  const complete = checkpoint.idempotency.length === checkpoint.upToSequence
    && checkpoint.idempotency.every((entry, index) => entry.sequence === index + 1);
  // 실제 journal checkpoint는 깊게 동결된다. 외부 가변 fixture에는 결과를 캐시하지 않는다.
  if (Object.isFrozen(checkpoint) && Object.isFrozen(checkpoint.idempotency)
    && checkpoint.idempotency.every(Object.isFrozen)) {
    completeFrontiers.set(checkpoint, complete);
  }
  return complete;
}

export function studioCommandCheckpointIdentityPolicyMatches(
  checkpoint: StudioCommandCheckpointIdentityFrontier | null,
  policy: StudioCommandIdentityPolicy,
): boolean {
  if (!checkpoint) return true;
  if (readStudioCommandIdentityPolicy(checkpoint.extensions) !== policy) return false;
  if (policy === null) return true;
  return checkpoint.id === `checkpoint:${checkpoint.upToSequence + 1}`
    && checkpoint.idempotency.every((entry, index) => (
      entry.id === `${entry.recordType}:${entry.sequence}`
      && (index === 0 || entry.sequence > (checkpoint.idempotency[index - 1]?.sequence ?? 0))
    ));
}

export function studioCommandRecordIdentityConflicts(
  checkpoint: StudioCommandCheckpointIdentityFrontier | null,
  policy: StudioCommandIdentityPolicy,
  id: string,
  recordType: string,
  sequence: number,
): boolean {
  if (checkpoint?.id === id) return true;
  if (policy !== null) return id !== `${recordType}:${sequence}`;
  return (!hasCompleteStudioCommandRecordIdentityFrontier(checkpoint)
    && studioCommandIdentityFilterMayContain(checkpoint?.identityFilter, `record:${id}`))
    || studioCommandIdentityFilterMayContain(checkpoint?.identityFilter, `checkpoint:${id}`);
}

export function studioCommandCheckpointIdentityConflicts(
  checkpoint: StudioCommandCheckpointIdentityFrontier | null,
  policy: StudioCommandIdentityPolicy,
  id: string,
  nextSequence: number,
): boolean {
  return studioCommandRecordIdentityConflicts(checkpoint, policy, id, "checkpoint", nextSequence);
}

export function studioCommandNewGroupIdentityConflicts(
  checkpoint: StudioCommandCheckpointIdentityFrontier | null,
  policy: StudioCommandIdentityPolicy,
  actorId: string,
  groupId: string,
  sequence: number,
): boolean {
  return policy !== null ? groupId !== `group:${sequence}`
    : studioCommandIdentityFilterMayContain(checkpoint?.identityFilter, `group:${JSON.stringify([actorId, groupId])}`);
}

export function studioCommandNewTransactionIdentityConflicts(
  checkpoint: StudioCommandCheckpointIdentityFrontier | null,
  policy: StudioCommandIdentityPolicy,
  transactionId: string,
  sequence: number,
): boolean {
  return policy !== null ? transactionId !== `transaction:${sequence}`
    : studioCommandIdentityFilterMayContain(checkpoint?.identityFilter, `transaction:${transactionId}`);
}
