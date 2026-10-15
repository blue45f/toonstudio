import { describe, expect, it } from "vitest";

import {
  HEALTH_READINESS_QUERY_TIMEOUT_MS,
  containsEvery,
  timedHealthQuery,
} from "./health-readiness-query";
import { HEALTH_READINESS_QUERY_TIMEOUT_MS as REEXPORTED_TIMEOUT_MS } from "./health-readiness.repository";

describe("health readiness query helpers", () => {
  it("bounds every readiness query with the shared timeout", () => {
    expect(timedHealthQuery("SELECT 1")).toEqual({
      text: "SELECT 1",
      values: undefined,
      query_timeout: HEALTH_READINESS_QUERY_TIMEOUT_MS,
    });
    expect(timedHealthQuery("SELECT $1::text", ["a"])).toEqual({
      text: "SELECT $1::text",
      values: ["a"],
      query_timeout: HEALTH_READINESS_QUERY_TIMEOUT_MS,
    });
  });

  it("accepts a catalog result only when it is exactly the required set", () => {
    expect(containsEvery(["b", "a"], ["a", "b"])).toBe(true);
    // 카탈로그가 비어 있거나 읽지 못하면 준비된 것으로 보지 않는다.
    expect(containsEvery(null, ["a"])).toBe(false);
    // 필수 릴레이션이 하나라도 빠지면 준비되지 않은 것이다.
    expect(containsEvery(["a"], ["a", "b"])).toBe(false);
    // 요구 목록에 없는 릴레이션이 섞여도 목록이 어긋난 것으로 본다.
    expect(containsEvery(["a", "b", "c"], ["a", "b"])).toBe(false);
    // 중복 행이 빠진 릴레이션의 자리를 메울 수 없다.
    expect(containsEvery(["a", "a"], ["a", "b"])).toBe(false);
  });

  it("keeps the repository module exporting the timeout under its original name", () => {
    expect(REEXPORTED_TIMEOUT_MS).toBe(HEALTH_READINESS_QUERY_TIMEOUT_MS);
  });
});
