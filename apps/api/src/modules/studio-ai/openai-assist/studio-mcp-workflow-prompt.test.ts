import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import { expect, it } from "vitest";
import { z } from "zod";

import { buildModeSystemInstruction } from "./studio-openai-prompt-catalog";

it("매크로 프롬프트의 네 도구 인자와 열거값을 실제 로컬 MCP 목록에 맞춘다", () => {
  const cli = resolve(__dirname, "../../../../../../tools/toonstudio-mcp/cli.mjs");
  const inventory = execFileSync(process.execPath, [cli, "list", "--dry-run"], { env: {}, encoding: "utf8" });
  const manifest = z.array(z.object({ name: z.string(), inputSchema: z.unknown() })).parse(JSON.parse(inventory));
  const inputSchema = z.object({ properties: z.record(z.string(), z.object({ enum: z.array(z.string()).optional() })) });
  const prompt = buildModeSystemInstruction("mcp-workflow-macro");
  for (const name of ["studio.canvas.create", "studio.bg3d.compose_scene", "studio.photoshop.apply_layer_fx", "studio.export.preflight_check"]) {
    const tool = manifest.find((entry) => entry.name === name);
    if (!tool) throw new Error(`도구를 찾을 수 없습니다: ${name}`);
    const { properties } = inputSchema.parse(tool.inputSchema);
    const documented = prompt.split(`${name}(`)[1]?.split(")")[0]?.split(", ");
    expect(documented?.sort()).toEqual(Object.keys(properties).sort());
    for (const property of Object.values(properties)) {
      for (const value of property.enum ?? []) expect(prompt).toContain(value);
    }
  }
  expect(prompt).toContain("대상 ID가 아직 없거나 지원하지 않는 작업");
  expect(prompt).toContain("실행 가능한 단계만 steps에");
  expect(prompt).toContain("정확한 높이와 레이어 가시성은 수동 확인");
  expect(prompt).toContain('"requireCleanRightsBom":true');
  expect(prompt).toContain('"rightsBomClean":false');
});
