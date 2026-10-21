import { describe, expect, it } from "vitest";

import {
  combineStudioBg3dImportAiUseStatus,
  hasStudioBg3dImportAiUse,
  type StudioBg3dImportAiUse,
  type StudioBg3dImportAiUseStatus,
} from "./studio-bg3d-import-ai-use";
import { combineImportAiUseStatusLazy, hasImportAiUseLazy } from "./studio-bg3d-import-ai-use-lazy";

// 지연 모듈용 사본(studio-bg3d-import-ai-use-lazy)이 편집기 쪽 원본과 같은 결과를 내는지 표로 지킨다.

const STATUSES: readonly StudioBg3dImportAiUseStatus[] = ["skipped", "saved", "existing", "partial", "failed", "cancelled"];

const AI_USES: ReadonlyArray<StudioBg3dImportAiUse | undefined> = [
  undefined,
  {},
  { aiGenerated: "yes" },
  { aiGenerated: "no" },
  { aiTraining: "allowed" },
  { aiTraining: "prohibited" },
  { aiGenerated: "no", aiTraining: "prohibited" },
  { aiGenerated: undefined, aiTraining: undefined },
  { aiGenerated: "yes", aiTraining: undefined },
  // 읽기 규칙을 거치지 않은 낯선 값도 두 구현이 같은 답을 낸다.
  { aiGenerated: "unknown" } as never,
  { aiGenerated: null } as never,
  null as never,
];

describe("지연 모듈용 AI 표기 판정 사본", () => {
  it.each(AI_USES.map((aiUse, index) => [index, aiUse] as const))("hasImportAiUseLazy: 입력 %i 에서 원본과 같다", (_index, aiUse) => {
    expect(hasImportAiUseLazy(aiUse)).toBe(hasStudioBg3dImportAiUse(aiUse));
  });

  it("combineImportAiUseStatusLazy: 모든 상태 쌍(6×6)에서 원본과 같다", () => {
    for (const left of STATUSES) {
      for (const right of STATUSES) {
        expect(combineImportAiUseStatusLazy(left, right), `${left} + ${right}`).toBe(combineStudioBg3dImportAiUseStatus(left, right));
      }
    }
  });

  it("표가 사본의 분기(skipped 건너뛰기, 실패·취소 우선, 서로 다르면 일부)를 모두 지나간다", () => {
    const results = new Set(STATUSES.flatMap((left) => STATUSES.map((right) => combineImportAiUseStatusLazy(left, right))));
    expect([...results].sort()).toEqual([...STATUSES].sort());
    expect(combineImportAiUseStatusLazy("saved", "existing")).toBe("partial");
    expect(combineImportAiUseStatusLazy("saved", "saved")).toBe("saved");
  });
});
