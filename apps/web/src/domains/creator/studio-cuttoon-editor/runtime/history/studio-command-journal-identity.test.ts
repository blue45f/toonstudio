import { describe, expect, it } from "vitest";

import {
  STUDIO_COMMAND_IDENTITY_POLICY_KEY,
  STUDIO_COMMAND_SEQUENCE_IDENTITY_POLICY,
  hasCompleteStudioCommandRecordIdentityFrontier,
  readStudioCommandIdentityPolicy,
  type StudioCommandCheckpointIdentityFrontier,
} from "./studio-command-journal-identity";

function frontier(sequences: readonly number[], upToSequence = sequences.length): StudioCommandCheckpointIdentityFrontier {
  return {
    id: "checkpoint:test", upToSequence, identityFilter: "00".repeat(8192), extensions: {},
    idempotency: sequences.map((sequence, index) => ({ id: `command:${index}`, recordType: "command", sequence })),
  };
}

describe("명령 기록의 정확한 이전 ID 보관 증거", () => {
  it("모든 이전 순번이 보관된 경우만 완전한 frontier로 인정한다", () => {
    expect(hasCompleteStudioCommandRecordIdentityFrontier(frontier([1, 2, 3]))).toBe(true);
    expect(hasCompleteStudioCommandRecordIdentityFrontier(frontier([]))).toBe(true);
  });

  it.each([
    [[1, 1], 2], [[1, 3], 3], [[2, 3], 2], [[1], 2], [[1, 2, 2], 3],
  ] as const)("길이 또는 순번에 빈틈이 있는 %j / %i는 추정하지 않는다", (sequences, upToSequence) => {
    expect(hasCompleteStudioCommandRecordIdentityFrontier(frontier(sequences, upToSequence))).toBe(false);
  });

  it("외부의 가변 entry를 동결된 배열로 감싸도 오래된 판정을 캐시하지 않는다", () => {
    const entry = { id: "command:1", recordType: "command", sequence: 1 };
    const value = Object.freeze({ ...frontier([]), upToSequence: 1, idempotency: Object.freeze([entry]) });
    expect(hasCompleteStudioCommandRecordIdentityFrontier(value)).toBe(true);
    entry.sequence = 2;
    expect(hasCompleteStudioCommandRecordIdentityFrontier(value)).toBe(false);
  });
});

describe("생성 ID 정책 metadata", () => {
  it("기존 metadata 부재와 알려진 정책만 구분해 허용한다", () => {
    expect(readStudioCommandIdentityPolicy({ futureRenderer: "vendor-value" })).toBeNull();
    expect(readStudioCommandIdentityPolicy({
      [STUDIO_COMMAND_IDENTITY_POLICY_KEY]: STUDIO_COMMAND_SEQUENCE_IDENTITY_POLICY,
    })).toBe(STUDIO_COMMAND_SEQUENCE_IDENTITY_POLICY);
  });

  it.each([null, false, 1, "sequence-v2", {}, []])("알 수 없는 예약값 %j를 legacy로 낮추지 않는다", (value) => {
    expect(readStudioCommandIdentityPolicy({ [STUDIO_COMMAND_IDENTITY_POLICY_KEY]: value })).toBeUndefined();
  });
});
