import { describe, expect, it } from "vitest";

import {
  createByokMentorEngine,
  createUnavailableMentorEngine,
} from "./creator-mentor-engine";
import { getMentorPersona } from "./creator-mentor-personas";
import { DEFAULT_MENTOR_CONTROLS } from "./creator-mentor-types";

const persona = getMentorPersona("dialogue-editor");
const baseInput = {
  persona,
  controls: DEFAULT_MENTOR_CONTROLS,
  history: [] as const,
  userText: "이 대사 어색해요",
};

describe("미설정 엔진", () => {
  it("항상 not_configured를 돌려준다 (가짜 답변 없음)", async () => {
    const result = await createUnavailableMentorEngine().generateReply(baseInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("not_configured");
  });
});

describe("BYOK 엔진 (스텁 완성 함수)", () => {
  it("정상 응답을 새니타이즈해 돌려준다", async () => {
    const engine = createByokMentorEngine(async () => "  다듬은 대사를 제안합니다.  ");
    const result = await engine.generateReply(baseInput);
    expect(result).toEqual({ ok: true, text: "다듬은 대사를 제안합니다." });
  });

  it("금지 주제 입력은 완성 함수를 부르지 않고 blocked_topic을 돌려준다", async () => {
    // 입력 가드는 페르소나가 선언한 금지 주제 문구를 공백 정규화 부분일치로 찾는다(creator-mentor-filter.ts).
    // 그래서 입력에는 페르소나의 금지 주제 문구가 그대로 들어가야 한다. "남의 작품" 같은 바꿔 말하기는
    // 가드의 계약이 아니라 시스템 프롬프트의 금지 지시와 응답 새니타이즈가 맡는다.
    const topic = "타 작품 대사 인용";
    expect(persona.forbiddenTopics).toContain(topic);
    let called = false;
    const engine = createByokMentorEngine(async () => {
      called = true;
      return "x";
    });
    const result = await engine.generateReply({
      ...baseInput,
      userText: `${topic}해줘`,
    });
    expect(called).toBe(false);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("blocked_topic");
      // 화면에는 막은 주제가 그대로 안내된다.
      expect(result.error).toContain(topic);
    }
  });

  it("빈 응답은 empty_reply, 예외는 request_failed로 변환한다 (throw하지 않음)", async () => {
    const empty = createByokMentorEngine(async () => "   ");
    const emptyResult = await empty.generateReply(baseInput);
    expect(emptyResult.ok).toBe(false);
    if (!emptyResult.ok) expect(emptyResult.code).toBe("empty_reply");

    const failing = createByokMentorEngine(async () => {
      throw new Error("network");
    });
    const failResult = await failing.generateReply(baseInput);
    expect(failResult.ok).toBe(false);
    if (!failResult.ok) expect(failResult.code).toBe("request_failed");
  });
});
