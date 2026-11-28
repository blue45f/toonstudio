import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

const workflow = parseYaml(
  readFileSync(join(process.cwd(), ".github/workflows/character-contact-naturalness.yml"), "utf8"),
) as {
  on: { pull_request: { paths: string[] }; push: { paths: string[] } };
  jobs?: Record<string, { steps?: Array<{ uses?: string; run?: string; with?: Record<string, unknown> }> }>;
};

describe("Character contact naturalness CI bootstrap", () => {
  it("접촉 검수 카메라와 공용 소품 판정의 개별 변경도 PR과 main에서 검증한다", () => {
    const paths = workflow.on.pull_request.paths;
    expect(workflow.on.push.paths).toEqual(paths);
    const reviewSources = [
      "apps/web/tools/browser-harnesses/vrm-hand-review-camera.ts",
      "apps/web/tools/browser-harnesses/vrm-prop-review-visibility.ts",
      "apps/web/src/domains/creator/vrm/studio-vrm-held-prop-contacts.ts",
      "apps/web/src/domains/creator/vrm/studio-vrm-idle-grip-body-clearance.ts",
      "apps/web/src/domains/creator/vrm/studio-vrm-grip-body-surface.ts",
      "apps/web/src/domains/creator/vrm/studio-vrm-grip-settlement.ts",
      "apps/web/src/domains/creator/vrm/studio-vrm-mug-collision-shape.ts",
    ];
    expect(paths).toEqual(expect.arrayContaining(reviewSources));
    for (const path of reviewSources) {
      expect(existsSync(join(process.cwd(), path)), path).toBe(true);
    }
  });

  it("installs pnpm before setup-node asks for the pnpm cache", () => {
    const steps = workflow.jobs?.["character-hand-visual"]?.steps ?? [];
    const actionSteps = steps.filter((step) => step.uses);

    expect(actionSteps.slice(0, 3).map((step) => step.uses?.split("@")[0])).toEqual([
      "actions/checkout",
      "pnpm/action-setup",
      "actions/setup-node",
    ]);
    for (const step of actionSteps.slice(0, 3)) {
      expect(step.uses).toMatch(/@[0-9a-f]{40}$/u);
    }

    const setupNode = actionSteps.find((step) => step.uses?.startsWith("actions/setup-node@"));
    expect(setupNode?.with?.cache).toBe("pnpm");
  });

  it("does not defer pnpm availability until after setup-node", () => {
    const steps = workflow.jobs?.["character-hand-visual"]?.steps ?? [];
    const setupNodeIndex = steps.findIndex((step) => step.uses?.startsWith("actions/setup-node@"));
    const pnpmSetupIndex = steps.findIndex((step) => step.uses?.startsWith("pnpm/action-setup@"));

    expect(pnpmSetupIndex).toBeGreaterThan(-1);
    expect(setupNodeIndex).toBeGreaterThan(pnpmSetupIndex);
    expect(steps.some((step) => step.run?.trim() === "corepack enable")).toBe(false);
  });
});

// 손 비교 harness 가 권리 사유로 저장소에서 제거된 VRM(AvatarSample A–C, fem_vroid, masc_vroid)을 계속 가리켜,
// 서버가 index.html 을 돌려주고 감사 스크립트가 60초 시간 초과로만 실패하던 문제를 다시 만들지 않게 지킨다.
describe("Character hand visual audit fixtures", () => {
  const harnessPages = ["hand-compare.html", "props-compare.html"] as const;
  const harnessButtons = (page: string): Array<{ id: string; url: string }> =>
    [
      ...readFileSync(join(process.cwd(), "apps/web/tools/browser-harnesses", page), "utf8").matchAll(
        /<button data-id="([^"]+)" data-url="([^"]+)"/gu,
      ),
    ].map((match) => ({ id: match[1] ?? "", url: match[2] ?? "" }));

  it("points every harness button at a model file that is still bundled", () => {
    for (const page of harnessPages) {
      const buttons = harnessButtons(page);
      expect(buttons.length, page).toBeGreaterThan(0);
      for (const button of buttons) {
        expect(existsSync(join(process.cwd(), "apps/web/public", button.url)), `${page}: ${button.url}`).toBe(true);
      }
    }
  });

  it("audits only characters that both harness pages provide", () => {
    const script = readFileSync(join(process.cwd(), "scripts/verify-vrm-hand-visual-audit.mts"), "utf8");
    const listed = /const CHARACTER_IDS = \[([^\]]+)\]/u.exec(script)?.[1] ?? "";
    const ids = [...listed.matchAll(/"([^"]+)"/gu)].map((match) => match[1] ?? "");
    expect(ids.length).toBeGreaterThan(0);
    for (const page of harnessPages) {
      const available = new Set(harnessButtons(page).map((button) => button.id));
      for (const id of ids) expect(available.has(id), `${page} has no button for ${id}`).toBe(true);
    }
  });
});
