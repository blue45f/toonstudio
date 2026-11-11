import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { evaluateUiUxV2Contracts } from "./verify-ui-ux-v2-contracts.mjs";

describe("verify-ui-ux-v2-contracts", () => {
  it("실제 저장소가 데스크톱(시안 A~P)·모바일(시안 M1~M4)·OKLCH·무스피너·44px 계약을 통과한다", () => {
    const result = evaluateUiUxV2Contracts();
    assert.equal(result.ok, true, `위반 발견:\n${result.issues.join("\n")}`);
  });

  it("모바일 셸에 회전 스피너가 다시 들어오면 즉시 실패를 보고한다", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ui-ux-v2-gate-"));
    try {
      fs.mkdirSync(path.join(tmp, "apps/mobile/shell"), { recursive: true });
      fs.writeFileSync(path.join(tmp, "apps/mobile/shell/index.html"), '<div class="spinner"></div>');
      fs.writeFileSync(path.join(tmp, "apps/mobile/shell/mobile.css"), "@keyframes spin {}");
      const result = evaluateUiUxV2Contracts(tmp);
      assert.equal(result.ok, false);
      assert.ok(result.issues.some((msg) => msg.includes("회전 스피너")));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
