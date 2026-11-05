import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { test } from "node:test";

import { findRootLicenseFiles } from "./third-party-license-files.mjs";

test("MIT 래퍼와 내장 LGPL 라이브러리 고지를 함께 수집한다", () => {
  const root = mkdtempSync(join(tmpdir(), "toonstudio-notices-"));
  try {
    for (const name of ["LICENSE", "THIRD-PARTY-NOTICES.md", "Third_Party_Licenses.txt", "README.md", "notices.js.map"]) {
      writeFileSync(join(root, name), name);
    }
    mkdirSync(join(root, "NOTICE"));
    writeFileSync(join(root, "COPYING.large"), Buffer.alloc(2_000_001));
    assert.deepEqual(findRootLicenseFiles(root).map((path) => basename(path)), ["LICENSE", "THIRD-PARTY-NOTICES.md", "Third_Party_Licenses.txt"]);
    assert.deepEqual(findRootLicenseFiles(join(root, "missing")), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
