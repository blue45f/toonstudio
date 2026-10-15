/**
 * 빈 상태에서 보여 주는 예시 이야기.
 *
 * 처음 쓰는 작가가 리포트가 어떤 모양인지 눈으로 볼 수 있도록, 일부러 네 가지 문제를 심어 둔 작은
 * 이야기다. 작가의 문서를 건드리지 않고 허브 안에서만 읽기 전용으로 쓴다.
 */
import {
  STUDIO_STORYWORLD_SCHEMA_VERSION,
  type StoryworldProject,
  type StoryworldScene,
} from "../studio-storyworld-causality";

export const PLAUSIBILITY_EXAMPLE_PROJECT_ID = "plausibility-example";

const scene = (id: string, title: string, order: number, extra: Partial<StoryworldScene> = {}): StoryworldScene => ({
  id,
  title,
  order,
  timeIndex: order / 10,
  locationId: "기억 시장",
  participantIds: ["haeun"],
  ...extra,
});

const RAIN_STARTS = [{ factId: "market-rain", op: "set" as const, value: true }];

/**
 * 심어 둔 문제:
 * 1. '추궁'에서 하은이 범인을 아는 것처럼 행동하는데 그 앞에서 알게 되는 장면이 없다(정보).
 * 2. '결심'은 중요한 선택인데 이유를 아직 모른다고 답했다(동기).
 * 3. '탈출'에서 문제가 풀리는데 근거인 비밀 통로가 앞에서 한 번도 나오지 않았다(우연·해결 방식).
 * 4. '그해 겨울'에서 하은의 나이가 태어난 해와 맞지 않는다(인물 일관성).
 */
export const PLAUSIBILITY_EXAMPLE_PROJECT: StoryworldProject = {
  schemaVersion: STUDIO_STORYWORLD_SCHEMA_VERSION,
  id: PLAUSIBILITY_EXAMPLE_PROJECT_ID,
  title: "예시: 기억 시장의 열쇠",
  characters: [
    { id: "haeun", name: "하은", goal: "사라진 동생을 찾는다", birthYear: 2000 },
    { id: "dojin", name: "도진", goal: "기억 시장을 지킨다" },
  ],
  facts: [
    { id: "market-rain", label: "시장에는 밤마다 비가 온다", subjectId: "world", key: "rain", initialValue: false },
    { id: "key-owned", label: "하은이 열쇠를 가졌다", subjectId: "haeun", key: "key", initialValue: false },
    { id: "culprit", label: "범인은 도진이다", subjectId: "world", key: "culprit", initialValue: true },
    { id: "secret-door", label: "비밀 통로가 있다", subjectId: "world", key: "secret-door", initialValue: true },
  ],
  scenes: [
    scene("s1", "비 내리는 시장", 10, { effects: RAIN_STARTS }),
    scene("s2", "열쇠를 줍다", 20, { effects: [{ factId: "key-owned", op: "set", value: true }] }),
    scene("s3", "금고 앞", 30, { preconditions: [{ factId: "key-owned", comparator: "equals", value: true }] }),
    scene("s4", "추궁", 40, {
      participantIds: ["haeun", "dojin"],
      knowledgeUses: [{ characterId: "haeun", factId: "culprit", purpose: "범인을 지목한다" }],
    }),
    scene("s5", "단서 발견", 50, { reveals: [{ factId: "culprit", audiences: ["haeun", "reader"] }] }),
    scene("s6", "결심", 60, {
      effects: RAIN_STARTS,
      plausibility: {
        roles: ["decision"],
        motives: [{ characterId: "haeun", basis: "unknown" }],
        answers: { roles: "answered", motive: "unknown" },
      },
    }),
    scene("s7", "탈출", 70, {
      preconditions: [{ factId: "secret-door", comparator: "equals", value: true }],
      plausibility: { roles: ["resolution"], answers: { roles: "answered" } },
    }),
    scene("s8", "그해 겨울", 80, { storyYear: 2025, statedAges: [{ characterId: "haeun", age: 30 }] }),
  ],
  metadata: { receiptTimestampIso: "2026-10-15T00:00:00.000Z" },
};
