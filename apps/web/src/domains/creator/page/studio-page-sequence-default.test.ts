// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { studioPageSequenceOpenByDefault } from "./studio-page-sequence-default";

afterEach(() => vi.unstubAllGlobals());

describe("처음 연 페이지 목록", () => {
  it("넓은 화면에서도 집중 모드는 닫고 표준·전체 모드는 기존 기본값을 유지한다", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    expect(studioPageSequenceOpenByDefault("focus")).toBe(false);
    expect(studioPageSequenceOpenByDefault("simple")).toBe(true);
    expect(studioPageSequenceOpenByDefault("full")).toBe(true);
    expect(studioPageSequenceOpenByDefault()).toBe(true);
  });
  it("좁은 화면과 터치 환경에서는 모든 모드의 캔버스 공간을 확보한다", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    for (const mode of ["focus", "simple", "full"] as const) {
      expect(studioPageSequenceOpenByDefault(mode)).toBe(false);
    }
  });
});
