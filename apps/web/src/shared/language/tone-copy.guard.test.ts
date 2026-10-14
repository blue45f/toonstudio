import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { registersInFlow } from "./tone-policy";

/**
 * 가드: 사용자 대면 사전(app·studio)에서 "한 흐름 안에 해요체와 합니다체가
 * 섞이는" 회귀를 막는다 (BLUEPRINT §3.4 말투 정책 / 판정: 같은 흐름 안에서
 * 말투 혼재 0). 흐름은 i18n 키의 앞 두 구간(예: account.profile)으로 묶는다.
 *
 * admin 사전은 운영자 콘솔이라 사용자 대면 말투 정책의 범위 밖이다 —
 * 운영자 말투를 해요체로 강제할지는 별도 결정이 필요해 여기서 강제하지 않는다.
 * 법적·결제 문서 문구는 사전이 아니라 문서 표면이 들고 있어 이 가드의
 * 대상이 아니다(그 표면은 PageShell surfaceKind="legal"|"payment"로 선언한다).
 *
 * 주의: 이 가드는 현재 main 사전에서 아래 NOTES.md에 기록된 만큼의 기존
 * 혼재를 검출해 의도적으로 실패한다. 문구 교체(말투 통일 소진)가 함께
 * 반영돼야 green이 되는 강제 장치다 — 실패를 지우려고 가드를 약화하지 말 것.
 */
const NAMESPACES = ["app", "studio"] as const;

function readNamespace(namespace: string): Record<string, unknown> {
  const url = new URL(`../../../public/i18n/${namespace}/ko.json`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")) as Record<string, unknown>;
}

/** 흐름 식별자 — 키의 앞 두 구간. 구간이 하나뿐인 키는 그 구간 자체가 흐름이다. */
function flowOf(key: string): string {
  return key.split(".").slice(0, 2).join(".");
}

describe("말투 가드 (같은 흐름 안에서 말투 혼재 0)", () => {
  it("어떤 흐름에도 해요체와 합니다체가 함께 있지 않다", () => {
    const violations: string[] = [];
    for (const namespace of NAMESPACES) {
      const dictionary = readNamespace(namespace);
      const flows = new Map<string, string[]>();
      for (const [key, value] of Object.entries(dictionary)) {
        if (typeof value !== "string") continue;
        const flow = flowOf(key);
        const bucket = flows.get(flow) ?? [];
        bucket.push(value);
        flows.set(flow, bucket);
      }
      for (const [flow, texts] of flows) {
        const registers = registersInFlow(texts);
        if (registers.size > 1) {
          violations.push(`${namespace}:${flow} (${[...registers].sort().join("+")})`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
