import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ARCHITECTURE_RUNTIME_SECTIONS } from "../../../../../../apps/web/src/domains/legal/technology/engineering-architecture-guide-runtime";

/**
 * 아키텍처 해설 실행 구조(구간 4 함께 그릴 때 · 구간 6 AI가 끼어드는 길)가 API 쪽 코드에 대해 말하는 수치를 API 소스에서 직접 대조한다.
 * 웹 앱의 비통합 테스트는 다른 앱의 src 를 읽을 수 없으므로(validate-app-boundaries 의 crossAppTestOutsideIntegration),
 * API 소스를 읽는 단언만 이 통합 폴더에 둔다. 웹 쪽 소스·설정을 대조하는 단언은
 * apps/web/src/domains/legal/technology/engineering-architecture-guide-runtime.facts.test.ts 에 있다.
 */

const source = (relativePath: string): string => readFileSync(join(process.cwd(), relativePath), "utf8");

/** `export const NAME = 값;` 의 값 한 줄(앞뒤 공백 제거). */
function constant(text: string, name: string): string {
  const match = new RegExp(`(?:export\\s+)?const\\s+${name}\\s*(?::[^=]+)?=\\s*([^;\\n]+);`, "u").exec(text);
  if (!match) throw new Error(`상수 ${name} 를 찾지 못했습니다`);
  return (match[1] as string).trim();
}

/** 구간 본문이 화면에 보여 주는 수치(facts[].value) 중 근거 경로가 `sourcePath` 인 것. */
function shownFact(sectionId: string, sourcePath: string): string | undefined {
  const section = ARCHITECTURE_RUNTIME_SECTIONS.find((candidate) => candidate.id === sectionId);
  if (!section) throw new Error(`구간 ${sectionId} 가 없습니다`);
  return section.facts?.find((fact) => fact.source === sourcePath)?.value;
}

describe("아키텍처 해설 구간 4 · 함께 그릴 때 — API 쪽 사실", () => {
  const GATEWAY_CONSTANTS = "apps/api/src/modules/creator/studio-live-gateway-constants.ts";

  it("작업실 참가자 상한 30명이 구간의 수치와 API 상수가 같다", () => {
    expect(constant(source(GATEWAY_CONSTANTS), "STUDIO_LIVE_ROOM_MAX_PARTICIPANTS")).toBe("30");
    expect(shownFact("realtime-collab", GATEWAY_CONSTANTS)).toBe("30");
  });

  it("참가자 권한을 15초마다 다시 확인한다", () => {
    expect(constant(source(GATEWAY_CONSTANTS), "STUDIO_LIVE_ACCESS_RECHECK_MS")).toBe("15_000");
  });
});

describe("아키텍처 해설 구간 6 · AI가 끼어드는 길 — API 쪽 사실", () => {
  const USAGE = "apps/api/src/modules/studio-ai/studio-ai-usage.ts";
  const PROVIDER = "apps/api/src/modules/studio-ai/studio-ai-provider.ts";

  it("서버 사용자당 하루 요청 200회·토큰 1,000,000(코드 기본값)이 구간의 수치와 같다", () => {
    const usage = source(USAGE);
    expect(constant(usage, "DEFAULT_STUDIO_AI_DAILY_REQUEST_LIMIT")).toBe("200");
    expect(constant(usage, "DEFAULT_STUDIO_AI_DAILY_TOKEN_LIMIT")).toBe("1_000_000");
    expect(shownFact("ai-path", USAGE)).toBe("200 · 1,000,000");
  });

  it("서버 공유 무료 풀의 공급자는 9곳이고 구간의 수치와 같다", () => {
    const order = /const DEFAULT_FREE_PROVIDER_ORDER[^=]*=\s*\[([\s\S]*?)\];/u.exec(source(PROVIDER))?.[1] ?? "";
    expect(order.match(/"[a-z]+"/gu)).toHaveLength(9);
    expect(shownFact("ai-path", PROVIDER)).toBe("9");
  });
});
