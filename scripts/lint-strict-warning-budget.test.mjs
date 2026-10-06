import assert from "node:assert/strict";
import { describe, it } from "node:test";

import ratchet from "../config/architecture-source-ratchet.json" with { type: "json" };
import packageJson from "../package.json" with { type: "json" };

const BUDGET_PATTERN = /--max-warnings=(\d+)/u;

describe("strict lint 경고 예산", () => {
  it("package.json의 max-warnings가 래칛 원장 값과 같다", () => {
    const matched = BUDGET_PATTERN.exec(packageJson.scripts["lint:strict"]);
    assert(matched, "lint:strict must pin --max-warnings");
    assert.equal(
      Number(matched[1]),
      ratchet.lintStrictMaxWarnings,
      "lint:strict의 경고 예산이 config/architecture-source-ratchet.json과 어긋난다",
    );
  });

  it("경고 예산은 0보다 커서 경고를 사실상 끄지 않는다", () => {
    assert.ok(ratchet.lintStrictMaxWarnings > 0, "경고 예산을 0으로 낮춰 경고 게이트를 끄지 않는다");
  });
});