import { createServer } from "node:http";
import { runInNewContext } from "node:vm";
import { createRequire } from "node:module";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

const eslintConfigRequire = createRequire(realpathSync(join(
  process.cwd(), "node_modules", "@heejun", "eslint-config", "package.json",
)));
const jsxA11yRequire = createRequire(eslintConfigRequire.resolve("eslint-plugin-jsx-a11y"));
const minimatch = jsxA11yRequire("minimatch");
const compatRequire = createRequire(jsxA11yRequire.resolve("minimatch"));
const importXRequire = createRequire(eslintConfigRequire.resolve("eslint-plugin-import-x"));
const engine = importXRequire("minimatch");

function installedRequire(name, version) {
  const store = join(process.cwd(), "node_modules", ".pnpm");
  return createRequire(join(store, `${name}@${version}`, "node_modules", name, "package.json"));
}

describe("수정판 minimatch의 구형 소비자 호환", () => {
  it("jsx-a11y의 callable API를 공식 수정판 엔진에 연결한다", () => {
    expect(typeof minimatch).toBe("function");
    expect(importXRequire("minimatch/package.json").version).toBe("10.2.6-toonstudio.1");
    expect(minimatch("Dialog.Close", "{Button,Dialog.*}")).toBe(true);
    expect(minimatch("Image", "{Button,Dialog.*}")).toBe(false);
    expect(minimatch(".hidden", "*")).toBe(false);
    expect(minimatch.defaults({ nocase: true })("BUTTON", "button")).toBe(true);
    expect(new minimatch.Minimatch("**/*.tsx").match("src/Button.tsx")).toBe(true);
    expect(typeof engine.makeRe).toBe("function");
    expect(engine.makeRe("*.tsx").test("Button.tsx")).toBe(true);
  });

  it("확장된 패턴이 공식 수정판과 같은 제한을 적용받는다", () => {
    const pattern = Array(30).fill("**/../a/b").join("/");
    expect(new engine.Minimatch(pattern, { optimizationLevel: 2, braceExpandMax: 64 }).set).toHaveLength(64);
    const large = new engine.Minimatch("{x,*}/{0..999}", { optimizationLevel: 2 });
    expect(large.set).toHaveLength(2000);
    expect(large.match("y/999")).toBe(true);
    expect(large.match(".y/5")).toBe(false);
    expect(minimatch.braceExpand("panel-{1..3}")).toEqual(["panel-1", "panel-2", "panel-3"]);
    expect(compatRequire("brace-expansion/package.json").version).toBe("5.0.12");
  });

  it("ESM 백포트에도 동일한 증폭 제한과 기존 makeRe API를 적용한다", async () => {
    const entry = importXRequire.resolve("minimatch");
    const esm = await import(pathToFileURL(entry.replace("/commonjs/", "/esm/")).href);
    const pattern = Array(30).fill("**/../a/b").join("/");
    expect(new esm.Minimatch(pattern, { optimizationLevel: 2, braceExpandMax: 64 }).set).toHaveLength(64);
    expect(esm.makeRe("*.tsx").test("Button.tsx")).toBe(true);
  });

  it("glob 7 callback과 glob 14 Promise가 실제 파일을 동일하게 탐색한다", async () => {
    const directory = mkdtempSync(join(tmpdir(), "toon-glob-compat-"));
    try {
      writeFileSync(join(directory, "Button.tsx"), "");
      writeFileSync(join(directory, "skip.txt"), "");
      const legacyRequire = installedRequire("glob", "7.2.3");
      const legacy = legacyRequire("glob");
      const currentRequire = installedRequire("glob", "14.0.2");
      const current = currentRequire("glob");
      expect(currentRequire("minimatch/package.json").version).toBe("11.0.1");
      expect(legacy.sync("*.tsx", { cwd: directory })).toEqual(["Button.tsx"]);
      expect(await new Promise((resolve, reject) => legacy("*.tsx", { cwd: directory },
        (error, matches) => error ? reject(error) : resolve(matches)))).toEqual(["Button.tsx"]);
      expect(await current.glob("*.tsx", { cwd: directory })).toEqual(["Button.tsx"]);
      const controller = new AbortController();
      controller.abort();
      await expect(current.glob("**/*", { cwd: directory, signal: controller.signal })).rejects.toThrow();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});


describe("follow-redirects 민감 헤더 회귀", () => {
  it("다른 realm의 sensitiveHeaders 목록도 다른 호스트로 전달하지 않는다", async () => {
    let received;
    const destination = createServer((request, response) => {
      received = request.headers["x-compat-credential"];
      response.end("ok");
    });
    const source = createServer((_request, response) => {
      response.writeHead(302, { location: `http://localhost:${destination.address().port}/` });
      response.end();
    });
    try {
      await new Promise((resolve) => destination.listen(0, resolve));
      await new Promise((resolve) => source.listen(0, resolve));
      const redirects = installedRequire("follow-redirects", "1.16.2")("follow-redirects");
      await new Promise((resolve, reject) => {
        const request = redirects.http.get(`http://127.0.0.1:${source.address().port}/`, {
          headers: { "x-compat-credential": "synthetic-test-value" },
          sensitiveHeaders: runInNewContext('["x-compat-credential"]'),
        }, (response) => {
          response.resume();
          response.on("end", resolve);
          response.on("error", reject);
        });
        request.on("error", reject);
      });
      expect(received).toBeUndefined();
    } finally {
      await Promise.all([source, destination].map((server) => new Promise((resolve) => server.close(resolve))));
    }
  });
});
