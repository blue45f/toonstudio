import { describe, expect, it } from "vitest";

import { COVER_SERVER_TRANSCODE_ENV, coverServerTranscodeEnabled } from "./cover-transcode-policy";

describe("coverServerTranscodeEnabled", () => {
  it("환경변수 이름이 문서·스키마와 같다", () => {
    expect(COVER_SERVER_TRANSCODE_ENV).toBe("COVER_SERVER_TRANSCODE");
  });

  it("미설정이면 꺼진다 — 무료 플랜 0.1 CPU 에서 헬스체크가 끊긴 사고 이후의 기본값", () => {
    expect(coverServerTranscodeEnabled({})).toBe(false);
  });

  it.each(["", "off", "OFF", "true", "1", "yes", "enabled", "onn"])(
    "on 이 아닌 값 %j 은 켜지지 않는다",
    (value) => {
      expect(coverServerTranscodeEnabled({ COVER_SERVER_TRANSCODE: value })).toBe(false);
    },
  );

  it.each(["on", "ON", " On "])("명시한 %j 만 켜진다(앞뒤 공백·대소문자 무시)", (value) => {
    expect(coverServerTranscodeEnabled({ COVER_SERVER_TRANSCODE: value })).toBe(true);
  });

  it("기본 인자는 process.env 를 호출 시점에 읽는다", () => {
    const before = process.env.COVER_SERVER_TRANSCODE;
    try {
      process.env.COVER_SERVER_TRANSCODE = "on";
      expect(coverServerTranscodeEnabled()).toBe(true);
      delete process.env.COVER_SERVER_TRANSCODE;
      expect(coverServerTranscodeEnabled()).toBe(false);
    } finally {
      if (before === undefined) delete process.env.COVER_SERVER_TRANSCODE;
      else process.env.COVER_SERVER_TRANSCODE = before;
    }
  });
});
