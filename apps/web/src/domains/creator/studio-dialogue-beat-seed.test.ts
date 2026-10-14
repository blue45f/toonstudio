import { describe, expect, it } from "vitest";

import { parseDialogueScript } from "./studio-dialogue";
import {
  deriveDialogueSeedFromBeats,
  seedDialogueBubblesFromBeats,
} from "./studio-dialogue-beat-seed";
import type { StudioStoryBeat } from "./studio-storyboard-planner";

function beat(partial: Partial<StudioStoryBeat> & { id: string }): StudioStoryBeat {
  return {
    sceneId: "scene-1",
    order: 0,
    kind: "dialogue",
    summary: "요약",
    dialogue: "",
    characterIds: [],
    locationId: null,
    ...partial,
  };
}

const BEATS: readonly StudioStoryBeat[] = [
  beat({ id: "b2", order: 2, dialogue: "정말로 왔어?", characterIds: ["char-na"] }),
  beat({ id: "b1", order: 1, dialogue: "드디어 왔구나.", characterIds: ["char-min"] }),
  beat({ id: "b3", order: 3, kind: "action", dialogue: "  " }),
  beat({ id: "b4", order: 4, dialogue: "첫째 줄\n둘째 줄", characterIds: [] }),
];

const SPEAKERS = { "char-min": "민수", "char-na": "나래" };

describe("deriveDialogueSeedFromBeats", () => {
  it("비트 순서대로 대사를 인계하고 빈 대사는 건너뛴다", () => {
    const seed = deriveDialogueSeedFromBeats(BEATS, { speakerNames: SPEAKERS });
    expect(seed.hasSeed).toBe(true);
    expect(seed.seededBeatIds).toEqual(["b1", "b2", "b4"]);
    expect(seed.skippedBeatIds).toEqual(["b3"]);
    expect(seed.lines.map((line) => line.text)).toEqual([
      "드디어 왔구나.",
      "정말로 왔어?",
      "첫째 줄",
      "둘째 줄",
    ]);
    expect(seed.lines.map((line) => line.beatId)).toEqual(["b1", "b2", "b4", "b4"]);
  });

  it("화자는 첫 등장인물 이름표로, 좌/우는 삽입 파서와 같은 규칙으로 정해진다", () => {
    const seed = deriveDialogueSeedFromBeats(BEATS, { speakerNames: SPEAKERS });
    expect(seed.lines.map((line) => line.speaker)).toEqual(["민수", "나래", "", ""]);
    // 민수=left(첫 화자), 나래=right(새 화자 번갈아), 미지정은 직전(right)과 반대부터 번갈아.
    expect(seed.lines.map((line) => line.side)).toEqual(["left", "right", "left", "right"]);
    expect(seed.script).toBe("민수: 드디어 왔구나.\n나래: 정말로 왔어?\n첫째 줄\n둘째 줄");
  });

  it("스크립트 표현을 실제 삽입 파서에 넣어도 화자·대사·배치가 그대로다", () => {
    const seed = deriveDialogueSeedFromBeats(BEATS, { speakerNames: SPEAKERS });
    const reparsed = parseDialogueScript(seed.script);
    expect(reparsed.map((line) => line.speaker)).toEqual(seed.lines.map((line) => line.speaker));
    expect(reparsed.map((line) => line.text)).toEqual(seed.lines.map((line) => line.text));
    expect(reparsed.map((line) => line.side)).toEqual(seed.lines.map((line) => line.side));
  });

  it("이름표가 없거나 문법을 깨는 이름이면 화자 미지정으로 인계한다", () => {
    const noNames = deriveDialogueSeedFromBeats(BEATS);
    expect(noNames.lines.every((line) => line.speaker === "")).toBe(true);
    const badName = deriveDialogueSeedFromBeats(BEATS, {
      speakerNames: { "char-min": "민수:주인공", "char-na": "나래" },
    });
    expect(badName.lines[0]?.speaker).toBe("");
    expect(badName.lines[1]?.speaker).toBe("나래");
  });

  it("대사가 전혀 없으면 빈 시드(hasSeed=false)를 돌려주고 입력은 변형하지 않는다", () => {
    const empty = deriveDialogueSeedFromBeats([
      beat({ id: "x1", order: 0 }),
      beat({ id: "x2", order: 1, dialogue: "\n" }),
    ]);
    expect(empty.hasSeed).toBe(false);
    expect(empty.script).toBe("");
    expect(empty.lines).toEqual([]);
    expect(empty.skippedBeatIds).toEqual(["x1", "x2"]);
    expect(BEATS.map((entry) => entry.id)).toEqual(["b2", "b1", "b3", "b4"]);
  });

  it("비트 id 중복은 플래너와 같은 계약 위반으로 throw한다", () => {
    expect(() => deriveDialogueSeedFromBeats([
      beat({ id: "dup", order: 0, dialogue: "가" }),
      beat({ id: "dup", order: 1, dialogue: "나" }),
    ])).toThrow("unique");
  });
});

describe("seedDialogueBubblesFromBeats", () => {
  it("도출 라인이 그대로 말풍선 시드가 된다(대사 단일 원천)", () => {
    const seed = deriveDialogueSeedFromBeats(BEATS, { speakerNames: SPEAKERS });
    const bubbles = seedDialogueBubblesFromBeats(BEATS, { canvasWidth: 800, startY: 40 }, { speakerNames: SPEAKERS });
    expect(bubbles.map((bubble) => bubble.text)).toEqual(seed.lines.map((line) => line.text));
    expect(bubbles.every((bubble) => bubble.type === "bubble" && bubble.variant === "speech")).toBe(true);
    // left 화자는 왼쪽 여백, right 화자는 오른쪽에 붙는다.
    expect(bubbles[0]?.x).toBe(28);
    expect((bubbles[1]?.x ?? 0) > (bubbles[0]?.x ?? 0)).toBe(true);
    // 세로로 겹치지 않게 쌓인다.
    expect((bubbles[1]?.y ?? 0) > (bubbles[0]?.y ?? 0)).toBe(true);
  });

  it("인계할 대사가 없으면 빈 배열이다", () => {
    expect(seedDialogueBubblesFromBeats([beat({ id: "x1", order: 0 })], { canvasWidth: 800, startY: 0 })).toEqual([]);
  });
});
