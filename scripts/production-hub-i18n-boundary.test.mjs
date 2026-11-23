import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

import { LAZY_APP_BUILTIN_GROUPS } from "./generate-i18n-builtins.mjs";
import { buildEagerGraph } from "./lib/studio-eager-graph.mjs";
import { scanModuleEdges, scriptKindFor } from "./lib/studio-eager-graph-scan.mjs";

const { describe, test } = process.env.VITEST ? await import("vitest") : await import("node:test");

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const WEB_SRC = "apps/web/src";
const PRODUCTION_ROOT = WEB_SRC + "/domains/creator/production-hub/";
const REGISTRATION = PRODUCTION_ROOT + "production-hub-i18n.ts";
const GENERATED = PRODUCTION_ROOT + "i18n/generated/i18n-production-hub-builtins.json";
const SHELL = WEB_SRC + "/shared/i18n/generated/i18n-app-builtins.json";

function readJson(file) {
  return JSON.parse(readFileSync(path.join(ROOT, file), "utf8"));
}

function hasProductionKey(source, file) {
  if (!source.includes("productionHub.")) return false;
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, false, scriptKindFor(file));
  let found = false;
  const visit = (node) => {
    if (found) return;
    if (
      (ts.isStringLiteralLike(node) || ts.isTemplateHead(node))
      && node.text.startsWith("productionHub.")
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return found;
}

function collectConsumers(relative = WEB_SRC) {
  const consumers = [];
  for (const entry of readdirSync(path.join(ROOT, relative), { withFileTypes: true })) {
    if (["node_modules", ".git", "__tests__", "generated"].includes(entry.name)) continue;
    const file = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) {
      consumers.push(...collectConsumers(file));
      continue;
    }
    if (!/\.[cm]?[jt]sx?$/u.test(file) || /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(file)) continue;
    const source = readFileSync(path.join(ROOT, file), "utf8");
    if (hasProductionKey(source, file)) consumers.push({ file, source });
  }
  return consumers;
}

describe("productionHub 도메인 사전 경계", () => {
  test("ko/en 원문 전체를 보존하고 셸에서는 이 네임스페이스만 분리한다", () => {
    const dictionaries = readJson(GENERATED);
    const shell = readJson(SHELL);
    assert.deepEqual(
      LAZY_APP_BUILTIN_GROUPS.find((group) => group.id === "production-hub"),
      { id: "production-hub", namespaces: ["productionHub"], target: GENERATED },
    );
    for (const locale of ["en", "ko"]) {
      const authored = readJson("apps/web/public/i18n/app/productionHub/" + locale + ".json");
      assert.equal(Object.keys(authored).length, 238);
      assert.ok(Object.keys(authored).every((key) => key.startsWith("productionHub.")));
      assert.deepEqual(dictionaries[locale], authored);
      assert.deepEqual(Object.keys(shell[locale]).filter((key) => key.startsWith("productionHub.")), []);
    }
    assert.deepEqual(Object.keys(dictionaries.en).sort(), Object.keys(dictionaries.ko).sort());
  });

  test("직접 불러온 모델을 포함한 모든 소비자가 사전을 동기 등록한다", () => {
    const consumers = collectConsumers();
    assert.ok(consumers.length > 0, "consumer census must not be empty");
    for (const { file, source } of consumers) {
      assert.ok(file.startsWith(PRODUCTION_ROOT), "review a new non-route consumer: " + file);
      const relative = path.posix.relative(path.posix.dirname(file), REGISTRATION).replace(/\.ts$/u, "");
      const specifier = relative.startsWith(".") ? relative : "./" + relative;
      assert.ok(
        scanModuleEdges(source, file).static.includes(specifier),
        file + " must register its dictionary before module evaluation",
      );
    }
  });

  test("초기 앱 진입 그래프에 production-hub 모듈을 포함하지 않는다", () => {
    const graph = buildEagerGraph({ root: ROOT, entries: [WEB_SRC + "/app/main.tsx"] });
    assert.ok(graph.modules.has(SHELL), "the positive control must reach the shell dictionary");
    assert.deepEqual(
      [...graph.modules.keys()].filter((file) => file.startsWith(PRODUCTION_ROOT)),
      [],
    );
  });
});
