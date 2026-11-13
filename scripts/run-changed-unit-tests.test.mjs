import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { selectChangedUnitTestTargets } from "./run-changed-unit-tests.mjs";

const { describe, it } = process.env.VITEST ? await import("vitest") : await import("node:test");

describe("selectChangedUnitTestTargets", () => {
  it("수정된 소스 파일의 인접 단위 테스트와 스크립트 테스트를 정확히 매핑한다", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "changed-tests-"));
    try {
      fs.mkdirSync(path.join(tmp, "apps/web/src/domains/catalog"), { recursive: true });
      fs.mkdirSync(path.join(tmp, "scripts"), { recursive: true });
      fs.writeFileSync(path.join(tmp, "apps/web/src/domains/catalog/Sample.tsx"), "export {};");
      fs.writeFileSync(path.join(tmp, "apps/web/src/domains/catalog/Sample.test.tsx"), "export {};");
      fs.writeFileSync(path.join(tmp, "scripts/verify-ui-ux-v2-contracts.test.mjs"), "export {};");
      fs.mkdirSync(path.join(tmp, "scripts/__tests__"), { recursive: true });
      fs.writeFileSync(
        path.join(tmp, "scripts/__tests__/vitest-based-contract.test.mjs"),
        "import { describe, it } from \"vitest\";\ndescribe(\"x\", () => { it(\"y\", () => {}); });\n",
      );

      const plan = selectChangedUnitTestTargets(
        [
          "apps/web/src/domains/catalog/Sample.tsx",
          "scripts/verify-ui-ux-v2-contracts.test.mjs",
          "scripts/__tests__/vitest-based-contract.test.mjs",
        ],
        tmp,
      );
      assert.deepEqual(plan.vitestTargets, [
        "apps/web/src/domains/catalog/Sample.test.tsx",
        "scripts/__tests__/vitest-based-contract.test.mjs",
      ]);
      assert.deepEqual(plan.nodeTestTargets, ["scripts/verify-ui-ux-v2-contracts.test.mjs"]);
      assert.equal(plan.truncatedVitestCount, 0);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
