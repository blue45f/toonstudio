import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { violatesErrorPattern } from "./error-pattern";

/**
 * 가드: 앱·스튜디오·관리자 한국어 사전 전수에서 "실패 계열인데 다음 행동이 없는"
 * 에러 문구가 다시 생기지 않게 막는다. (영문 사전은 한국어 정본을 미러링한다.)
 * 판정 패턴은 error-pattern.ts가 단일 출처다.
 */
const NAMESPACES = ["app", "studio", "admin"] as const;

/** 실패 계열로 잡히지만 에러 문구가 아니라서 제외하는 키 (사유 필수) */
const ALLOWLIST: Readonly<Record<string, string>> = {
  // 트래픽 공유 차트의 범례 라벨(성공/실패 건수) — 사용자에게 보이는 에러 문구가 아니다.
  "admin.traffic.shareFailed": "차트 범례 라벨",
};

function readNamespace(namespace: string): Record<string, unknown> {
  const url = new URL(`../../../public/i18n/${namespace}/ko.json`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")) as Record<string, unknown>;
}

describe("에러 문구 가드 (원인+다음 행동 문형)", () => {
  it("실패 계열 문구 전수에 다음 행동 안내가 있다", () => {
    const violations: string[] = [];
    for (const namespace of NAMESPACES) {
      const dictionary = readNamespace(namespace);
      for (const [key, value] of Object.entries(dictionary)) {
        if (typeof value !== "string") continue;
        if (key in ALLOWLIST) continue;
        if (violatesErrorPattern(value)) violations.push(`${namespace}:${key} = ${value}`);
      }
    }
    expect(violations).toEqual([]);
  });
});
