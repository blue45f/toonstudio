import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { AUTHENTICATED_JOURNEYS, CREDENTIAL_JOURNEYS, JOURNEY_ORDER, journeyNeedsLogin } from "./journey-meta.mjs";

const { describe, it } = process.env.VITEST ? await import("vitest") : await import("node:test");

describe("journeys: 정의와 메타데이터 일관성", () => {
  it("journeys.mjs 의 여정 정의 키가 실행 순서와 같다(정의 없는 순서나 순서 없는 정의가 없다)", () => {
    const source = readFileSync(new URL("./journeys.mjs", import.meta.url), "utf8");
    const keys = [...source.matchAll(/^ {2}"([a-z-]+)": \{$/gmu)].map((match) => match[1]);
    assert.deepEqual([...keys].sort(), [...JOURNEY_ORDER].sort());
  });

  it("로그인 요구 구분이 정의의 authenticated 선언과 같다", () => {
    const source = readFileSync(new URL("./journeys.mjs", import.meta.url), "utf8");
    for (const id of JOURNEY_ORDER) {
      const block = source.slice(source.indexOf(`"${id}": {`));
      const declared = block.match(/authenticated: (true|false)/u)?.[1] === "true";
      assert.equal(declared, AUTHENTICATED_JOURNEYS.includes(id), id);
    }
  });

  it("로그인 필요 여정은 로그인 상태 여정과 자격증명 여정의 합집합이다", () => {
    for (const id of JOURNEY_ORDER) {
      assert.equal(journeyNeedsLogin(id), AUTHENTICATED_JOURNEYS.includes(id) || CREDENTIAL_JOURNEYS.includes(id), id);
    }
    assert.equal(journeyNeedsLogin("error-recovery"), false);
  });
});
