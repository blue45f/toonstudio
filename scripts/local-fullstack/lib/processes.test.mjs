import assert from "node:assert/strict";
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { createServer as createTcpServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import {
  httpProbe,
  isPortFree,
  isProcessAlive,
  processMatches,
  readProcessCommandLine,
  spawnDetached,
  terminateProcess,
  waitFor,
} from "./processes.mjs";

const { describe, it } = process.env.VITEST ? await import("vitest") : await import("node:test");

async function withTemporaryDirectory(work) {
  const directory = mkdtempSync(join(tmpdir(), "local-fullstack-proc-"));
  try {
    return await work(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function startSleeper(directory, script) {
  const descriptor = openSync(join(directory, "child.log"), "a");
  try {
    return spawnDetached({
      command: process.execPath,
      args: ["-e", script],
      cwd: directory,
      env: { PATH: process.env.PATH ?? "" },
      logDescriptor: descriptor,
    });
  } finally {
    closeSync(descriptor);
  }
}

describe("프로세스 확인", () => {
  it("현재 프로세스는 살아 있고 존재하지 않는 PID·잘못된 값은 아니다", () => {
    assert.equal(isProcessAlive(process.pid), true);
    assert.equal(isProcessAlive(0), false);
    assert.equal(isProcessAlive(-5), false);
    assert.equal(isProcessAlive(Number.NaN), false);
    assert.equal(isProcessAlive(2 ** 30), false);
  });

  it("명령줄에 기대 문자열이 있을 때만 일치로 본다", () => {
    const commandLine = readProcessCommandLine(process.pid);
    assert.ok(commandLine === null || commandLine.length > 0);
    assert.equal(processMatches(process.pid, "node") || commandLine === null, true);
    assert.equal(processMatches(process.pid, "definitely-not-in-the-command-line-0xdeadbeef"), false);
  });
});

describe("spawnDetached / terminateProcess", () => {
  it("detached 자식을 띄우고 SIGTERM 으로 정상 종료한다", async () => {
    await withTemporaryDirectory(async (directory) => {
      const { pid } = startSleeper(directory, "setInterval(() => {}, 1000)");
      assert.equal(isProcessAlive(pid), true);
      assert.equal(await terminateProcess(pid, { needle: "setInterval", graceMs: 5_000 }), "stopped");
      assert.equal(isProcessAlive(pid), false);
      assert.equal(await terminateProcess(pid), "not-running");
    });
  });

  it("프로세스 그룹 단위로 종료해 손자 프로세스까지 정리한다", async () => {
    await withTemporaryDirectory(async (directory) => {
      const pidFile = join(directory, "grandchild.pid");
      const script = `
        const { spawn } = require("node:child_process");
        const { writeFileSync } = require("node:fs");
        const grandchild = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
        writeFileSync(${JSON.stringify(pidFile)}, String(grandchild.pid));
        setInterval(() => {}, 1000);
      `;
      const { pid } = startSleeper(directory, script);
      let grandchildPid = 0;
      for (let attempt = 0; attempt < 50 && !grandchildPid; attempt += 1) {
        try {
          grandchildPid = Number(readFileSync(pidFile, "utf8"));
        } catch {
          await delay(100);
        }
      }
      assert.ok(grandchildPid > 0, "손자 PID 기록 실패");
      assert.equal(isProcessAlive(grandchildPid), true);
      await terminateProcess(pid, { group: true, graceMs: 5_000 });
      assert.equal(isProcessAlive(pid), false);
      // 손자는 init 이 거두기 전까지 좀비로 남을 수 있으므로 잠시 기다린다(좀비는 죽은 것으로 본다).
      for (let attempt = 0; attempt < 30 && isProcessAlive(grandchildPid); attempt += 1) await delay(100);
      assert.equal(isProcessAlive(grandchildPid), false, "손자 프로세스가 남았습니다");
    });
  });

  it("명령줄이 기대와 다르면(PID 재사용 가정) 죽이지 않고 mismatch 를 돌려준다", async () => {
    await withTemporaryDirectory(async (directory) => {
      const { pid } = startSleeper(directory, "setInterval(() => {}, 1000)");
      try {
        assert.equal(await terminateProcess(pid, { needle: "not-this-process-0xdeadbeef", graceMs: 200 }), "mismatch");
        assert.equal(isProcessAlive(pid), true, "다른 프로세스로 보이면 건드리지 않아야 합니다");
      } finally {
        await terminateProcess(pid, { graceMs: 5_000 });
      }
    });
  });

  it("SIGTERM 을 무시하는 프로세스는 유예 후 SIGKILL 한다", async () => {
    await withTemporaryDirectory(async (directory) => {
      const { pid } = startSleeper(directory, "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)");
      await delay(300);
      assert.equal(await terminateProcess(pid, { graceMs: 400 }), "killed");
      assert.equal(isProcessAlive(pid), false);
    });
  });
});

describe("waitFor", () => {
  it("조건이 충족되면 즉시 성공하고, 시간이 지나면 마지막 상세와 함께 실패한다", async () => {
    let calls = 0;
    const success = await waitFor(async () => (calls += 1) >= 3, { timeoutMs: 2_000, intervalMs: 10 });
    assert.equal(success.ok, true);
    const failure = await waitFor(async () => ({ ok: false, detail: "아직 아님" }), { timeoutMs: 60, intervalMs: 10, describe: "테스트" });
    assert.equal(failure.ok, false);
    assert.match(failure.detail, /테스트 대기 시간 초과.*아직 아님/u);
  });

  it("fatal 이면 기다리지 않고 바로 실패한다", async () => {
    const started = Date.now();
    const result = await waitFor(async () => ({ ok: false, fatal: true, detail: "복구 불가" }), { timeoutMs: 10_000, intervalMs: 500 });
    assert.equal(result.ok, false);
    assert.equal(result.detail, "복구 불가");
    assert.ok(Date.now() - started < 1_000);
  });
});

describe("포트·HTTP 확인", () => {
  it("사용 중인 포트는 false, 비어 있으면 true", async () => {
    const server = createTcpServer();
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    assert.equal(await isPortFree(port), false);
    await new Promise((resolve) => server.close(resolve));
    assert.equal(await isPortFree(port), true);
  });

  it("httpProbe 는 상태 코드와 JSON 을 읽고 연결 실패는 null 이다", async () => {
    const server = createServer((request, response) => {
      response.setHeader("content-type", "application/json");
      response.statusCode = request.url === "/missing" ? 404 : 200;
      response.end(JSON.stringify({ status: "ok" }));
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    try {
      assert.deepEqual(await httpProbe(`http://127.0.0.1:${port}/`), { status: 200, json: { status: "ok" }, text: '{"status":"ok"}' });
      assert.equal((await httpProbe(`http://127.0.0.1:${port}/missing`)).status, 404);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
    assert.equal(await httpProbe(`http://127.0.0.1:${port}/`, { timeoutMs: 500 }), null);
  });
});
