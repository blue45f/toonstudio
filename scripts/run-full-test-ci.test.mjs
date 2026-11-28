import { EventEmitter } from "node:events";
import { execFile, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it, vi } from "vitest";
import { POSTGRES_INTEGRATION_SUITES, createVitestArguments } from "./run-postgres-integration-tests.mjs";
import { fullTestRemainderArguments, runFullTestChild, runFullTestCi } from "./run-full-test-ci.mjs";

const environment = {
  TEST_DATABASE_URL: "postgresql://studio_ci@127.0.0.1:5432/studio_full_integration",
  TEST_RUNTIME_DATABASE_ROLE: "studio_full_runtime",
  CI: "1",
};

describe("complete CI root and performance execution", () => {
  it("partitions only the exact real database files and leaves root discovery unchanged", () => {
    const serial = createVitestArguments();
    expect(serial.slice(1, 3)).toEqual(["run", "--no-file-parallelism"]);
    expect(serial.slice(3)).toEqual(POSTGRES_INTEGRATION_SUITES);
    expect(new Set(serial.slice(3)).size).toBe(POSTGRES_INTEGRATION_SUITES.length);
    expect(serial.slice(3).every((file) => existsSync(new URL(`../${file}`, import.meta.url)))).toBe(true);
    const remaining = fullTestRemainderArguments();
    expect(remaining.slice(0, 2)).toEqual([serial[0], "run"]);
    const exclusions = [];
    for (let index = 2; index < remaining.length; index += 2) {
      expect(remaining[index]).toBe("--exclude");
      expect(remaining[index + 1]).not.toMatch(/[*?\[\]]/u);
      exclusions.push(remaining[index + 1]);
    }
    expect(exclusions).toEqual(serial.slice(3));
  });

  it("collects the exact original root union with no missing or duplicate test files", async () => {
    const temporary = await mkdtemp(join(tmpdir(), "toonstudio-full-test-collection-"));
    const serial = createVitestArguments();
    const collect = async (name, args) => {
      const output = join(temporary, `${name}.json`);
      // --json has an optional path argument: bind the temporary path explicitly.
      await promisify(execFile)(process.execPath, [serial[0], "list", "--filesOnly", `--json=${output}`, ...args]);
      return JSON.parse(await readFile(output, "utf8")).map(({ file }) => file).sort();
    };
    try {
      const [original, database, remaining] = await Promise.all([
        collect("original", []), collect("database", serial.slice(3)),
        collect("remaining", fullTestRemainderArguments().slice(2)),
      ]);
      expect(database).toHaveLength(POSTGRES_INTEGRATION_SUITES.length);
      expect(remaining.filter((file) => database.includes(file))).toEqual([]);
      expect([...database, ...remaining].sort()).toEqual(original);
    } finally { await rm(temporary, { recursive: true, force: true }); }
  });

  it("completes workspace, database and edge checks before root and performance", async () => {
    const events = [];
    const runDatabase = vi.fn(async (input) => { events.push(["database", input]); });
    const runChild = vi.fn(async (command, args, env) => { events.push(["child", command, args, env]); });
    await runFullTestCi({ environment, runDatabase, runChild });
    const [workspaceLinks, database, ...afterDatabase] = events;
    expect(workspaceLinks).toEqual(["child", process.execPath, ["scripts/verify-workspace-package-links.mjs"], environment]);
    expect(database).toEqual(["database", { arguments_: [], environment }]);
    expect(afterDatabase.map((event) => event.slice(0, 3))).toEqual([
      ["child", "pnpm", ["run", "test:cloudflare-static-edge"]],
      ["child", process.execPath, fullTestRemainderArguments()],
      ["child", "pnpm", ["run", "test:perf"]],
    ]);
    for (const event of afterDatabase) expect(event[3]).toMatchObject({
      CI: "1", NODE_ENV: "test", DATABASE_URL: environment.TEST_DATABASE_URL,
      TEST_DATABASE_URL: environment.TEST_DATABASE_URL,
      STUDIO_LIVE_POSTGRES_INTEGRATION_URL: environment.TEST_DATABASE_URL,
      STUDIO_TEAM_COMMENT_POSTGRES_INTEGRATION_URL: environment.TEST_DATABASE_URL,
      STUDIO_LIVE_POSTGRES_RUNTIME_ROLE: "studio_full_runtime",
    });
  });

  it.each([
    ["scripts/verify-workspace-package-links.mjs", 1, 0],
    ["database", 1, 1],
    ["test:cloudflare-static-edge", 2, 1],
    ["vitest", 3, 1],
    ["test:perf", 4, 1],
  ])("propagates the %s failure without running later phases", async (phase, childCalls, databaseCalls) => {
    const failed = new Error(`${phase} failed`);
    const entry = phase === "vitest" ? createVitestArguments()[0] : phase;
    const runDatabase = vi.fn(async () => { if (phase === "database") throw failed; });
    const runChild = vi.fn(async (command, args) => {
      if ((command === "pnpm" ? args[1] : args[0]) === entry) throw failed;
    });
    await expect(runFullTestCi({ environment, runDatabase, runChild })).rejects.toBe(failed);
    expect(runChild).toHaveBeenCalledTimes(childCalls);
    expect(runDatabase).toHaveBeenCalledTimes(databaseCalls);
  });

  it("refuses missing database prerequisites before any phase", async () => {
    const runDatabase = vi.fn(), runChild = vi.fn();
    await expect(runFullTestCi({ environment: { CI: "1" }, runDatabase, runChild })).rejects.toThrow(/dedicated test database/u);
    expect(runDatabase).not.toHaveBeenCalled(); expect(runChild).not.toHaveBeenCalled();
  });

  it.each([[1, null], [null, "SIGTERM"], [null, null]])("rejects child code %s / signal %s", async (code, signal) => {
    const child = new EventEmitter();
    const run = runFullTestChild("test", [], environment, () => child);
    child.emit("exit", code, signal);
    await expect(run).rejects.toThrow(/Full test process failed/u);
  });
  it("rejects spawn errors and only accepts a zero exit", async () => {
    const child = new EventEmitter();
    const run = runFullTestChild("test", [], environment, () => child);
    child.emit("error", new Error("ENOENT"));
    await expect(run).rejects.toThrow(/could not start/u);
    const success = runFullTestChild("test", [], environment, () => child);
    child.emit("exit", 0, null);
    await expect(success).resolves.toBeUndefined();
  });
  it("returns a failing CLI exit when real prerequisites are absent", () => {
    const result = spawnSync(process.execPath, [new URL("./run-full-test-ci.mjs", import.meta.url).pathname], {
      encoding: "utf8", env: { CI: "1" },
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("dedicated test database");
  });
  it("propagates a real nonzero child exit", async () => {
    await expect(runFullTestChild(process.execPath, ["-e", "process.exit(7)"], environment)).rejects.toThrow("failed (7)");
  });
});
