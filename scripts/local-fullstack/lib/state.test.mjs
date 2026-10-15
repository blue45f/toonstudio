import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { stackPaths } from "./config.mjs";
import { ensureStackDirectories, hasStackMarker, openLog, patchState, readState, withStackLock } from "./state.mjs";

const { describe, it } = process.env.VITEST ? await import("vitest") : await import("node:test");

async function withTemporaryDirectory(work) {
  const directory = mkdtempSync(join(tmpdir(), "local-fullstack-state-"));
  try {
    return await work(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/** 이미 종료되어 거두어진 프로세스의 PID(잠금을 쥐고 죽은 소유자를 흉내 낸다). */
function deadProcessId() {
  const result = spawnSync(process.execPath, ["-e", "process.stdout.write(String(process.pid))"], { encoding: "utf8" });
  const pid = Number(result.stdout);
  assert.ok(Number.isInteger(pid) && pid > 0, "종료된 자식 프로세스의 PID 를 얻어야 한다");
  return pid;
}

function plantLock(paths, ownerPid) {
  mkdirSync(paths.lock, { recursive: true, mode: 0o700 });
  writeFileSync(join(paths.lock, "pid"), String(ownerPid));
}

describe("withStackLock", () => {
  it("스택 디렉터리가 아직 없는 첫 실행에서도 잠금을 잡고 작업 결과를 돌려준다", async () => {
    // 회귀: 스택 루트가 없으면 잠금 디렉터리를 만들다 ENOENT 로 첫 `up` 이 실패했다.
    await withTemporaryDirectory(async (directory) => {
      const paths = stackPaths(join(directory, "아직-없음", "stack"));
      assert.equal(existsSync(paths.root), false);
      let lockedDuringWork = false;
      const result = await withStackLock(paths, async () => {
        lockedDuringWork = existsSync(paths.lock);
        return "작업 결과";
      });
      assert.equal(result, "작업 결과");
      assert.equal(lockedDuringWork, true);
      assert.equal(existsSync(paths.lock), false, "작업이 끝나면 잠금이 해제되어야 한다");
      assert.equal(statSync(paths.root).mode & 0o777, 0o700, "스택 루트는 본인만 접근할 수 있어야 한다");
    });
  });

  it("작업이 예외를 던져도 잠금을 해제하고 예외를 그대로 전달한다", async () => {
    await withTemporaryDirectory(async (directory) => {
      const paths = stackPaths(join(directory, "stack"));
      await assert.rejects(
        withStackLock(paths, async () => {
          throw new Error("작업 실패 합성 오류");
        }),
        /작업 실패 합성 오류/u,
      );
      assert.equal(existsSync(paths.lock), false);
      // 해제됐으므로 바로 다시 잡을 수 있다.
      assert.equal(await withStackLock(paths, async () => "다시 잡음"), "다시 잡음");
    });
  });

  it("살아 있는 소유자가 쥔 잠금은 기다리다 시간이 지나면 한글 오류로 실패하고 잠금을 건드리지 않는다", async () => {
    await withTemporaryDirectory(async (directory) => {
      const paths = stackPaths(join(directory, "stack"));
      mkdirSync(paths.root, { recursive: true });
      plantLock(paths, process.pid);
      let ran = false;
      await assert.rejects(
        withStackLock(
          paths,
          async () => {
            ran = true;
          },
          { timeoutMs: 400 },
        ),
        /다른 하네스 명령이 같은 스택을 사용 중입니다/u,
      );
      assert.equal(ran, false);
      assert.equal(existsSync(paths.lock), true, "남의 잠금을 지우면 안 된다");
    });
  });

  it("죽은 프로세스가 남긴 잠금은 이어받아 작업을 실행한다", async () => {
    await withTemporaryDirectory(async (directory) => {
      const paths = stackPaths(join(directory, "stack"));
      mkdirSync(paths.root, { recursive: true });
      plantLock(paths, deadProcessId());
      assert.equal(await withStackLock(paths, async () => "이어받음", { timeoutMs: 2_000 }), "이어받음");
      assert.equal(existsSync(paths.lock), false);
    });
  });

  it("동시에 들어온 두 작업은 서로 겹치지 않고 차례로 실행한다", async () => {
    await withTemporaryDirectory(async (directory) => {
      const paths = stackPaths(join(directory, "stack"));
      const events = [];
      const first = withStackLock(paths, async () => {
        events.push("첫째 시작");
        await delay(500);
        events.push("첫째 끝");
      });
      await delay(50);
      const second = withStackLock(paths, async () => {
        events.push("둘째 시작");
        events.push("둘째 끝");
      });
      await Promise.all([first, second]);
      assert.deepEqual(events, ["첫째 시작", "첫째 끝", "둘째 시작", "둘째 끝"]);
    });
  });
});

describe("ensureStackDirectories", () => {
  it("필요한 하위 디렉터리와 표식 파일을 만들고 다시 호출해도 안전하다", async () => {
    await withTemporaryDirectory(async (directory) => {
      const paths = stackPaths(join(directory, "stack"));
      assert.equal(hasStackMarker(paths), false);
      ensureStackDirectories(paths);
      for (const path of [paths.root, paths.logs, paths.tools, paths.postgresRoot, paths.postgresTemporary, paths.browser]) {
        assert.equal(statSync(path).isDirectory(), true, `${path} 디렉터리가 있어야 한다`);
        assert.equal(statSync(path).mode & 0o777, 0o700);
      }
      assert.equal(hasStackMarker(paths), true);

      // 두 번째 호출은 표식 파일을 덮어쓰지 않는다(reset 이 표식으로 스택 여부를 판단한다).
      writeFileSync(paths.marker, "사용자가 남긴 표식");
      ensureStackDirectories(paths);
      assert.equal(readFileSync(paths.marker, "utf8"), "사용자가 남긴 표식");
    });
  });
});

describe("상태 파일(readState·patchState)", () => {
  it("파일이 없거나 JSON 이 깨졌거나 객체가 아니면 빈 객체로 본다", async () => {
    await withTemporaryDirectory(async (directory) => {
      const paths = stackPaths(join(directory, "stack"));
      ensureStackDirectories(paths);
      assert.deepEqual(readState(paths), {});
      writeFileSync(paths.state, "{깨진 JSON");
      assert.deepEqual(readState(paths), {});
      writeFileSync(paths.state, "[1, 2]");
      assert.deepEqual(readState(paths), {});
      writeFileSync(paths.state, '"문자열"');
      assert.deepEqual(readState(paths), {});
    });
  });

  it("최상위 키를 병합하고 null 이면 지우며, 파일은 0600 이고 임시 파일을 남기지 않는다", async () => {
    await withTemporaryDirectory(async (directory) => {
      const paths = stackPaths(join(directory, "stack"));
      ensureStackDirectories(paths);
      patchState(paths, { pg: { pid: 11, port: 55452 } });
      patchState(paths, { api: { pid: 22 } });
      assert.deepEqual(readState(paths), { version: 1, pg: { pid: 11, port: 55452 }, api: { pid: 22 } });

      patchState(paths, { pg: null, schema: { fingerprint: "합성-지문" } });
      assert.deepEqual(readState(paths), { version: 1, api: { pid: 22 }, schema: { fingerprint: "합성-지문" } });

      assert.equal(statSync(paths.state).mode & 0o777, 0o600);
      assert.deepEqual(
        readdirSync(paths.root).filter((name) => name.startsWith("state.json.tmp-")),
        [],
        "임시 상태 파일이 남으면 안 된다",
      );
    });
  });
});

describe("openLog", () => {
  it("로그 파일을 0600 으로 열어 배너를 남기고 다시 열면 이어 쓴다", async () => {
    await withTemporaryDirectory(async (directory) => {
      const paths = stackPaths(join(directory, "stack"));
      ensureStackDirectories(paths);
      const first = openLog(paths, "api", "API 시작 :4101");
      first.close();
      assert.equal(first.path, join(paths.logs, "api.log"));
      assert.equal(statSync(first.path).mode & 0o777, 0o600);
      assert.match(readFileSync(first.path, "utf8"), /API 시작 :4101/u);

      const second = openLog(paths, "api");
      second.close();
      assert.match(readFileSync(second.path, "utf8"), /API 시작 :4101/u, "이전 내용이 보존되어야 한다");
    });
  });
});
