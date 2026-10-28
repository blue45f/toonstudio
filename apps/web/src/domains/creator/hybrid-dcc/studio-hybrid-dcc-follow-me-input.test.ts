import { describe, expect, it } from "vitest";
import { createStudioFollowMeNormalPath, parseStudioFollowMePath } from "./studio-hybrid-dcc-follow-me-input";

describe("따라 만들기의 경로 입력", () => {
  it("쉼표·공백·CRLF 좌표와 지수 표기를 유한한 실제 경로로 읽는다", () => {
    expect(parseStudioFollowMePath("0, 1, 0\r\n1e-1 2.5 -.2")).toEqual({
      kind: "value", points: [{ x: 0, y: 1, z: 0 }, { x: 0.1, y: 2.5, z: -0.2 }],
    });
  });
  it.each(["0,0,0", "0,0,0\n1,2", "0,0,0\n1,,2,3", "0,0,0\nInfinity,1,0", "0,0,0\n1e999,1,0", "0,0,0\n0x10,1,0", "0,0,0\n1m,2m,3m"])("불완전하거나 모호한 경로를 거부한다: %s", (text) => {
    expect(parseStudioFollowMePath(text).kind).toBe("invalid");
  });
  it("빈 입력과 예산을 넘는 붙여넣기를 구분한다", () => {
    expect(parseStudioFollowMePath("  ")).toEqual({ kind: "empty" });
    expect(parseStudioFollowMePath(Array.from({ length: 65 }, () => "0,0,0").join("\n")).kind).toBe("invalid");
    expect(parseStudioFollowMePath("0".repeat(16_385)).kind).toBe("invalid");
  });
  it("일반 좌표계의 면 중심에서 법선 방향으로 기본 경로를 만든다", () => {
    const text = createStudioFollowMeNormalPath({ x: 4.5, y: 1.25, z: -3 }, { x: 1, y: 0, z: 0 }, 2);
    expect(parseStudioFollowMePath(text)).toEqual({ kind: "value", points: [{ x: 4.5, y: 1.25, z: -3 }, { x: 6.5, y: 1.25, z: -3 }] });
    expect(createStudioFollowMeNormalPath({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, Number.NaN)).toBe("");
  });
});
