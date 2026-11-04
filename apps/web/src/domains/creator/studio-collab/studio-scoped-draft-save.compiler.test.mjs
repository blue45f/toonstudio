// @vitest-environment jsdom
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import React from "react";
import ts from "typescript";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createWebReactCompilerPlugin } from "../../../../vite-react-compiler-filter.ts";
import { createStudioScopedWriteFixture } from "./studio-scoped-write.test-fixture.ts";
import { StudioScopedWriteAuthorityContext } from "./studio-scoped-write-context.ts";

const require = createRequire(import.meta.url);
async function compileSaveHook() {
  const path = resolve("apps/web/src/domains/creator/studio-collab/studio-scoped-draft-save.ts");
  const stripped = ts.transpileModule(await readFile(path, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const plugin = await createWebReactCompilerPlugin();
  await plugin.configResolved.call({}, { cacheDir: resolve("node_modules/.vite") });
  plugin.applyToEnvironment({ name: "client", config: { consumer: "client" } });
  const compiled = await plugin.transform.handler.call({ environment: { name: "client" }, error(error) { throw error; } }, stripped, path, { moduleType: "js" });
  expect(compiled.code).toContain("react/compiler-runtime");
  const commonjs = ts.transpileModule(compiled.code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  runInNewContext(commonjs, { module, exports: module.exports, require: (id) => {
    if (id === "./studio-scoped-write-context") return { StudioScopedWriteAuthorityContext };
    if (id === "./use-studio-scoped-save-pending") return { useStudioScopedSavePendingStatus: () => ({ pending: false, loading: false, error: null }) };
    return require(id);
  } });
  return module.exports.useStudioScopedDraftSaveState;
}
afterEach(() => { cleanup(); });

describe("실제 React Compiler를 거친 제한 저장 권위", () => {
  it.each([false, true])("같은 authority의 명시 선택·정책 회수 epoch를 저장 버튼에 반영한다 (explicit=%s)", async (explicit) => {
    const useCompiledSave = await compileSaveHook(), f = createStudioScopedWriteFixture();
    function SaveButton() {
      const state = useCompiledSave(explicit ? f.authority : undefined);
      return React.createElement("button", { disabled: !state.available }, "저장");
    }
    render(React.createElement(StudioScopedWriteAuthorityContext.Provider, { value: f.authority }, React.createElement(SaveButton)));
    expect(screen.getByRole("button", { name: "저장" }).disabled).toBe(true);
    act(() => { f.choose(); });
    await waitFor(() => { expect(screen.getByRole("button", { name: "저장" }).disabled).toBe(false); });
    act(() => { f.authority.setPolicy({ ...f.policy, policyVersion: 2, grants: f.policy.grants.map((grant) => ({ ...grant, revokedAt: "2026-10-29T01:00:00.000Z" })) }); });
    expect(screen.getByRole("button", { name: "저장" }).disabled).toBe(true);
  });
});
