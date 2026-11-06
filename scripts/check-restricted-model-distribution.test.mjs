import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { inspectRestrictedModels } from "./check-restricted-model-distribution.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

test("이름이 바뀌어도 해시가 같은 제한 가중치를 찾고 다른 바이트는 혼동하지 않는다", async () => {
  const root = await mkdtemp(join(tmpdir(), "toonstudio-model-distribution-"));
  try {
    const bytes = Buffer.from("가상 제한 가중치 fixture");
    const finding = { model: "fixture", sha256: createHash("sha256").update(bytes).digest("hex"), byteLength: bytes.length, status: "restricted" };
    await mkdir(join(root, "assets"));
    await writeFile(join(root, "assets", "renamed.ONNX"), bytes);
    await writeFile(join(root, "other.onnx"), "다른 모델");
    await writeFile(join(root, "ignored.txt"), "모델과 길이가 다른 문서");
    const result = await inspectRestrictedModels(root, [finding]);
    assert.equal(result.scope, "selected-known-model-byte-hashes");
    assert.equal(result.inspected, 2);
    assert.equal(result.filesVisited, 3);
    assert.equal(result.onnxFiles, 2);
    assert.deepEqual(result.matches, [{ path: join("assets", "renamed.ONNX"), ...finding }]);
    await assert.rejects(inspectRestrictedModels(join(root, "missing")), { code: "ENOENT" });
    await symlink(join(root, "other.onnx"), join(root, "linked.onnx"));
    await assert.rejects(inspectRestrictedModels(root, [finding]), /심볼릭 링크/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("확장자를 바꾸거나 없앤 원본도 찾고 같은 크기의 다른 파일은 허위 검출하지 않는다", async () => {
  const root = await mkdtemp(join(tmpdir(), "toonstudio-model-renamed-"));
  try {
    const bytes = Buffer.from("같은 모델 바이트");
    const finding = { model: "fixture", sha256: createHash("sha256").update(bytes).digest("hex"), byteLength: bytes.length, status: "restricted" };
    await writeFile(join(root, "asset.bin"), bytes);
    await writeFile(join(root, "extensionless"), bytes);
    await writeFile(join(root, "unrelated.bin"), Buffer.alloc(bytes.length));
    const result = await inspectRestrictedModels(root, [finding]);
    assert.equal(result.filesVisited, 3);
    assert.equal(result.onnxFiles, 0);
    assert.equal(result.inspected, 3);
    assert.deepEqual(result.matches.map((match) => match.path), ["asset.bin", "extensionless"]);
    assert.equal(result.blockingMatches.length, 2);
    assert.equal(result.reviewMatches.length, 0);
    const reviewOnly = await inspectRestrictedModels(root, [{ ...finding, disposition: "review" }]);
    assert.equal(reviewOnly.matches.length, 2);
    assert.equal(reviewOnly.blockingMatches.length, 0);
    assert.equal(reviewOnly.reviewMatches.length, 2);
    await assert.rejects(inspectRestrictedModels(root, [{ ...finding, byteLength: 0 }]), /byteLength/u);
    await assert.rejects(inspectRestrictedModels(root, [finding, { ...finding, disposition: "review" }]), /중복/u);
    await symlink(root, join(root, "root-link"));
    await assert.rejects(inspectRestrictedModels(join(root, "root-link"), [finding]), /루트의 심볼릭 링크/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
