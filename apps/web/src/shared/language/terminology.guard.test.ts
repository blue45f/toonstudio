import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { findForbiddenAliases } from "./terminology";

/**
 * 가드: 앱·스튜디오·관리자 한국어 사전 전수에서 용어 레지스트리(terminology.ts)의
 * 금지 별칭이 다시 생기지 않게 막는다. 표면 단위 소진(S3-10)이 끝난 상태를
 * 고정하는 검사이며, 새 별칭이 유입되면 어느 표면의 어느 키인지 그대로 보고한다.
 * (영문 사전은 한국어 정본을 미러링한다.)
 */
const NAMESPACES = ["app", "studio", "admin"] as const;

function readNamespace(namespace: string): Record<string, unknown> {
  const url = new URL(`../../../public/i18n/${namespace}/ko.json`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")) as Record<string, unknown>;
}

describe("용어 가드 (금지 별칭 잔량 0)", () => {
  it("표면별 한국어 사전 전수에 금지 별칭이 없다", () => {
    const violations: string[] = [];
    for (const namespace of NAMESPACES) {
      const dictionary = readNamespace(namespace);
      for (const [key, value] of Object.entries(dictionary)) {
        if (typeof value !== "string") continue;
        for (const violation of findForbiddenAliases(value)) {
          violations.push(
            `${namespace}:${key} — 금지 별칭 "${violation.alias}" 대신 정본 "${violation.canonical}" (${violation.entryId})`,
          );
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
