import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { BRANCHING_DRAFT_STORAGE_KEY, progressStorageKey } from "./branching-cuttoon-storage";

/**
 * 기능 문서(docs/features/branching-cuttoon.md)가 말하는 저장 키·경로·정본 위치가 화면 코드와 어긋나지 않게 묶어 두는 시험.
 * 한도·검증 코드 표는 model/branching-cuttoon-docs.test.ts 가 맡는다.
 */
const doc = readFileSync("docs/features/branching-cuttoon.md", "utf8");

describe("분기형 컷툰 문서와 화면 코드의 일치", () => {
  it("초안 저장 키를 문서가 코드 그대로 적는다", () => {
    expect(doc).toContain(`\`${BRANCHING_DRAFT_STORAGE_KEY}\``);
  });

  it("읽던 위치 저장 키의 접두사와 이 화면의 작품 식별자(draft)를 문서가 적는다", () => {
    const prefix = progressStorageKey("draft").replace(/draft$/u, "");
    expect(doc).toContain(`\`${prefix}<작품 식별자>\``);
    expect(doc).toContain("이 화면의 작품 식별자는 `draft` 다");
  });

  it("경로와 경로 이름 문구 키, 정본 문구 위치를 문서가 적는다", () => {
    expect(doc).toContain("`/studio/branching-cuttoon`");
    expect(doc).toContain("`route.branchingCuttoon`");
    expect(doc).toContain("apps/web/public/i18n/app/branchingCuttoon/{ko,en}.json");
  });

  it("문서가 가리키는 코드 위치가 실제로 있다", () => {
    for (const path of [
      "apps/web/src/domains/creator/branching-cuttoon/model/branching-cuttoon-types.ts",
      "apps/web/src/domains/creator/branching-cuttoon/BranchingCuttoonPlayer.tsx",
      "apps/web/src/domains/creator/branching-cuttoon/BranchingCuttoonLabPage.tsx",
      "apps/web/src/app/routes/groups/creator.routes.tsx",
      "apps/web/src/shared/lib/site-route-authority.ts",
    ]) {
      expect(() => readFileSync(path, "utf8"), path).not.toThrow();
    }
  });
});
