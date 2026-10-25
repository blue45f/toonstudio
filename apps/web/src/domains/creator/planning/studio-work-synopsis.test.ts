import { describe, expect, it } from "vitest";

import {
  createWorkSynopsis,
  updateWorkSynopsis,
} from "./studio-work-synopsis";

describe("studio-work-synopsis", () => {
  it("작품 시놉시스를 만들고 길이 상한을 지킨다", () => {
    const result = createWorkSynopsis({
      workId: "w1",
      logline: "x".repeat(300),
      synopsis: "전체 줄거리",
      intent: "기획 의도",
      now: 5,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.synopsis.logline).toHaveLength(200);
    expect(result.synopsis.updatedAt).toBe(5);
  });

  it("부분 갱신은 바꾼 필드만 바꾼다", () => {
    const created = createWorkSynopsis({
      workId: "w1",
      logline: "구 로그라인",
      synopsis: "구 줄거리",
      intent: "구 의도",
      now: 1,
    });
    if (!created.ok) return;
    const updated = updateWorkSynopsis(created.synopsis, { intent: "새 의도" }, 2);
    expect(updated.intent).toBe("새 의도");
    expect(updated.logline).toBe("구 로그라인");
    expect(updated.updatedAt).toBe(2);
  });
});
