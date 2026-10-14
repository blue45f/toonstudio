import { describe, expect, it } from "vitest";

import {
  composeErrorCopy,
  DEFAULT_DATA_SAFETY_NOTE,
  hasErrorActionGuidance,
  violatesErrorPattern,
} from "./error-pattern";

describe("에러 문형 (원인+다음 행동)", () => {
  it("원인·데이터 안전·다음 행동을 한 문구로 합친다", () => {
    expect(
      composeErrorCopy({
        cause: "프로필을 저장하지 못했어요",
        dataSafety: DEFAULT_DATA_SAFETY_NOTE,
        action: "잠시 후 다시 저장해 주세요",
      }),
    ).toBe("프로필을 저장하지 못했어요. 입력한 내용은 그대로 남아 있어요. 잠시 후 다시 저장해 주세요.");
  });

  it("이미 마침표가 있는 부분은 그대로 둔다", () => {
    expect(composeErrorCopy({ cause: "연결이 끊겼어요.", action: "다시 시도해 주세요." })).toBe(
      "연결이 끊겼어요. 다시 시도해 주세요.",
    );
  });

  it("실패만 알리는 문구는 위반으로 판정한다", () => {
    expect(violatesErrorPattern("저장에 실패했어요.")).toBe(true);
    expect(violatesErrorPattern("목록을 불러오지 못했어요.")).toBe(true);
  });

  it("다음 행동이 있는 실패 문구는 통과한다", () => {
    expect(
      violatesErrorPattern("목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."),
    ).toBe(false);
    expect(hasErrorActionGuidance("파일을 확인한 뒤 다시 올려 주세요.")).toBe(true);
    expect(hasErrorActionGuidance("주소창의 링크를 직접 복사해 주세요.")).toBe(true);
  });

  it("실패 계열이 아닌 문구는 판정 대상이 아니다", () => {
    expect(violatesErrorPattern("저장이 완료됐어요.")).toBe(false);
    expect(violatesErrorPattern("새 에피소드를 만들었어요.")).toBe(false);
  });
});
