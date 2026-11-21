import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { evaluateStudioBrushLatencyProvenance, readStudioBrushLatencyProvenance, type StudioBrushLatencyProvenance } from "./studio-brush-latency-evidence";

const sourceCommit = "a".repeat(40);
const evidence = (): StudioBrushLatencyProvenance => ({ sourceCommit, sourceDirty: false,
  build: { source: "owned-preview", gitSha: sourceCommit, buildId: "123456abcdef", verified: true,
    indexSha256: "1".repeat(64), metadataSha256: "2".repeat(64), error: null } });

describe("브러시 지연 측정의 동일 빌드 근거", () => {
  it("시작과 끝의 깨끗한 소스·빌드·hash가 모두 일치해야 통과한다", () => {
    expect(evaluateStudioBrushLatencyProvenance(evidence(), evidence())).toMatchObject({ ok: true, issues: [] });
  });

  it.each(["sourceDirty", "verified", "gitSha", "indexSha256", "missing"] as const)("%s 누락이나 불일치는 빠른 숫자로 덮지 않는다", (kind) => {
    const after = evidence();
    const changed = kind === "sourceDirty" ? { ...after, sourceDirty: true }
      : kind === "verified" ? { ...after, build: { ...after.build, verified: false } }
        : kind === "gitSha" ? { ...after, build: { ...after.build, gitSha: "b".repeat(40) } }
          : kind === "indexSha256" ? { ...after, build: { ...after.build, indexSha256: null } } : null;
    expect(evaluateStudioBrushLatencyProvenance(evidence(), changed)).toMatchObject({ ok: false,
      issues: expect.arrayContaining(["after-build-provenance"]) });
  });

  it.each(["buildId", "indexSha256", "metadataSha256"] as const)("같은 SHA라도 실행 중 %s가 바뀌면 거부한다", (key) => {
    const after = evidence();
    const changed = { ...after, build: { ...after.build, [key]: key === "buildId" ? "abcdef654321" : "3".repeat(64) } };
    expect(evaluateStudioBrushLatencyProvenance(evidence(), changed)).toMatchObject({ ok: false, issues: ["build-changed"] });
  });

  it("실제 Git 소스와 dist metadata를 읽고 소스 변경도 감지한다", async () => {
    const root = mkdtempSync(join(tmpdir(), "studio-latency-provenance-"));
    try {
      const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
      git("init", "-q");
      writeFileSync(join(root, ".gitignore"), "dist/\n");
      git("add", ".gitignore");
      git("-c", "user.name=QA Fixture", "-c", "user.email=qa@example.invalid", "commit", "-qm", "fixture");
      const sha = git("rev-parse", "HEAD");
      mkdirSync(join(root, "dist", ".vite"), { recursive: true });
      writeFileSync(join(root, "dist", "index.html"), "<!doctype html><title>Studio fixture</title>");
      writeFileSync(join(root, "dist", ".vite", "build-meta.json"), JSON.stringify({ gitSha: sha, buildId: "123456abcdef" }));
      const before = await readStudioBrushLatencyProvenance({ root, origin: "http://127.0.0.1:4173/", spawnedPreview: true });
      expect(before).toMatchObject({ sourceCommit: sha, sourceDirty: false, build: { verified: true, gitSha: sha } });
      writeFileSync(join(root, "uncommitted.ts"), "export const changed = true;\n");
      const after = await readStudioBrushLatencyProvenance({ root, origin: "http://127.0.0.1:4173/", spawnedPreview: true });
      expect(evaluateStudioBrushLatencyProvenance(before, after).ok).toBe(false);
      expect(after.sourceDirty).toBe(true);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
