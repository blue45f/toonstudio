import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) =>
  readFileSync(join(repositoryRoot, relativePath), "utf8");

const approval = JSON.parse(read("deploy/STANDING_APPROVAL.json"));
const staticApproval = JSON.parse(
  read("deploy/cloudflare-static/STANDING_APPROVAL.json"),
);

describe("deploy/STANDING_APPROVAL.json", () => {
  it("records who granted the standing approval and when", () => {
    expect(approval.grantedBy).toBe("저장소 소유자");
    expect(approval.grantedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
    expect(Number.isNaN(Date.parse(approval.grantedAt))).toBe(false);
    expect(typeof approval.note).toBe("string");
    expect(approval.note.length).toBeGreaterThan(20);
  });

  it("lists unique, kebab-case scopes", () => {
    expect(Array.isArray(approval.scopes)).toBe(true);
    expect(approval.scopes.length).toBeGreaterThan(0);
    expect(new Set(approval.scopes).size).toBe(approval.scopes.length);
    for (const scope of approval.scopes) {
      expect(scope).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/u);
    }
  });

  it("keeps the static web scope identical to the static deploy approval file", () => {
    expect(approval.scopes).toContain(staticApproval.scope);
  });

  it("documents every scope in DEPLOY.md so the file cannot drift from the guide", () => {
    const guide = read("DEPLOY.md");
    for (const scope of approval.scopes) {
      expect(guide, `DEPLOY.md must describe scope ${scope}`).toContain(
        `\`${scope}\``,
      );
    }
  });

  it("is referenced by the root policy and keeps destructive changes out of scope", () => {
    const policy = read("AGENTS.md");
    expect(policy).toContain("deploy/STANDING_APPROVAL.json");
    expect(policy).toContain("파괴적 migration");
    expect(approval.scopes).not.toContain("production-database-migrations");
    expect(approval.scopes.some((scope) => /adopt|repair|destructive/u.test(scope))).toBe(
      false,
    );
  });
});
