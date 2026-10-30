import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative } from "node:path";
import { test } from "node:test";

import { buildCommandPlan } from "../command-plans.mjs";
import { TOOLCHAIN_CATALOG } from "../catalog.mjs";

function withJobDirectory(callback) {
  const directory = mkdtempSync(join(tmpdir(), "toonbridge-plan-"));
  mkdirSync(join(directory, "inputs"));
  mkdirSync(join(directory, "outputs"));
  const input = join(directory, "inputs", "input.dat");
  writeFileSync(input, "fixture");
  try {
    return callback(directory, input);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function job(toolId, operationId, input, options = {}) {
  return {
    toolId,
    operationId,
    options,
    inputs: [{ id: "input_1", uploaded: true, localPath: input }],
  };
}

test("every catalog operation marked executable has an allow-listed command plan", () => {
  withJobDirectory((directory, input) => {
    let count = 0;
    for (const tool of TOOLCHAIN_CATALOG.tools) {
      if (["manual-adapter", "research-only"].includes(tool.maturity)) continue;
      for (const operation of tool.operations) {
        if (!operation.executable) continue;
        const plan = buildCommandPlan(job(tool.id, operation.id, input), directory, {
          PATH: process.env.PATH,
          [`TOONBRIDGE_TOOL_${tool.id.replaceAll("-", "_").toUpperCase()}_BIN`]: `/opt/tools/${tool.id}`,
        });
        assert.equal(typeof plan.binary, "string", `${tool.id}/${operation.id}`);
        assert.equal(Array.isArray(plan.args), true, `${tool.id}/${operation.id}`);
        assert.equal(Object.hasOwn(plan, "shell"), false, `${tool.id}/${operation.id}`);
        assert.ok(plan.outputs.length > 0, `${tool.id}/${operation.id}`);
        for (const output of plan.outputs) {
          assert.equal(isAbsolute(output.localPath), true);
          assert.equal(relative(directory, output.localPath).startsWith(".."), false);
        }
        count += 1;
      }
    }
    assert.ok(count >= 25, `expected broad adapter coverage, got ${count}`);
  });
});

test("untrusted GEGL operation names and out-of-range media options are rejected", () => {
  withJobDirectory((directory, input) => {
    assert.throws(
      () => buildCommandPlan(
        job("gegl", "render-graph", input, { operation: "gegl:load;rm" }),
        directory,
      ),
      /invalid|NOT_ALLOWED/u,
    );
    assert.throws(
      () => buildCommandPlan(
        job("ffmpeg", "encode-gif", input, { fps: 10_000 }),
        directory,
      ),
      /between 1 and 30/u,
    );
  });
});

test("Blender line art uses the dedicated Freestyle adapter", () => {
  withJobDirectory((directory, input) => {
    const lineArt = buildCommandPlan(job("blender", "line-art", input), directory);
    const sceneRender = buildCommandPlan(job("blender", "render-scene", input), directory);
    assert.equal(lineArt.args.includes("--python"), true);
    assert.match(lineArt.args.join(" "), /blender-line-art\.py/u);
    assert.equal(lineArt.outputs[0].name, "line-art.png");
    assert.notDeepEqual(lineArt.args, sceneRender.args);
  });
});

test("Blender는 입력 로드 전 자동 실행을 차단하고 모든 Python 실패를 오류로 반환한다", () => {
  withJobDirectory((directory, input) => {
    for (const operationId of ["render-scene", "line-art", "export-glb"]) {
      const command = buildCommandPlan(job("blender", operationId, input), directory);
      assert.deepEqual(command.args.slice(0, 6), [
        "--background", "--factory-startup", "--disable-autoexec", "--python-exit-code", "42", input,
      ]);
      assert.equal(command.args[6], "--python");
      assert.equal(command.args.at(-2), "--");
      assert.equal(command.args.at(-1), command.outputs[0].localPath);
    }
  });
});

test("Blender 장면 렌더는 프레임 1로 변경하지 않고 PNG 어댑터를 실행한다", () => {
  withJobDirectory((directory, input) => {
    const command = buildCommandPlan(job("blender", "render-scene", input), directory);
    assert.match(command.args[7], /blender-render-scene\.py$/u);
    assert.equal(command.args.includes("--render-frame"), false);
    assert.equal(command.outputs[0].name, "blender.png");
    assert.equal(command.outputs[0].mime, "image/png");
  });
});

test("Potrace maps curve tolerance to the optimization-tolerance flag", () => {
  withJobDirectory((directory, input) => {
    const command = buildCommandPlan(
      job("potrace", "bitmap-to-svg", input, { tolerance: 0.35 }),
      directory,
    );
    assert.equal(command.args.includes("-O"), true);
    assert.equal(command.args.includes("-t"), false);
    assert.equal(command.args[command.args.indexOf("-O") + 1], "0.35");
  });
});

test("connectors, manual adapters, research-only tools and disabled operations fail closed", () => {
  withJobDirectory((directory, input) => {
    for (const [toolId, operationId] of [
      ["nextcloud", "sync-assets"],
      ["scribus", "export-pdf"],
      ["openpose", "pose-extract"],
      ["ghostscript", "nup-pdf"],
    ]) {
      assert.throws(
        () => buildCommandPlan(job(toolId, operationId, input), directory),
        /TOOL_NOT_EXECUTABLE/u,
      );
    }
  });
});
