import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { GOLDEN_STORIES } from "./studio-story-plausibility-golden-fixtures";
import {
  PLAUSIBILITY_DEFAULT_MAX_FINDINGS,
  PLAUSIBILITY_SCORE_WEIGHTS,
  buildPlausibilityReport,
} from "./studio-story-plausibility-report";
import { PLAUSIBILITY_CATEGORIES } from "./studio-story-plausibility-types";

/**
 * 기능 문서와 초보 작가용 점검표가 코드와 어긋나지 않게 묶어 두는 테스트.
 * 골든 이야기나 범주, 점수 가중치, 상한을 바꾸면 이 테스트가 실패하므로 문서의 표도 함께 고친다.
 */
const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const FEATURE_DOC = "docs/features/story-plausibility-review.md";
const LEARN_DOC = "docs/learn/story-plausibility-checklist.md";

describe("개연성 점검 문서와 코드의 일치", () => {
  const feature = read(FEATURE_DOC);
  const learn = read(LEARN_DOC);
  const defects = GOLDEN_STORIES.filter((story) => story.kind === "defect");
  const cleans = GOLDEN_STORIES.filter((story) => story.kind === "clean");

  it("점검표는 범주 아홉 가지의 이름과 질문을 코드의 값 그대로 담는다", () => {
    expect(PLAUSIBILITY_CATEGORIES).toHaveLength(9);
    for (const category of PLAUSIBILITY_CATEGORIES) {
      expect(learn, `${LEARN_DOC}에 범주 ‘${category.label}’의 질문이 없습니다`).toContain(`| ${category.label} | ${category.question} |`);
      expect(feature, `${FEATURE_DOC}의 3.1절 표에 범주 ‘${category.label}’의 질문이 없습니다`).toContain(`| ${category.label} | ${category.question} |`);
    }
  });

  it("기능 문서의 골든 표에 모든 합성 이야기가 있고, 점검 가능 범위가 실제 실행값과 같다", () => {
    for (const story of GOLDEN_STORIES) {
      const line = feature.split("\n").find((candidate) => candidate.includes(`\`${story.id}\``));
      expect(line, `${FEATURE_DOC}의 골든 표에 \`${story.id}\` 행이 없습니다`).toBeDefined();
      const report = buildPlausibilityReport({
        project: story.project,
        generatedAtIso: "2026-10-15T00:00:00.000Z",
        ...(story.extras ? { extras: story.extras } : {}),
      });
      expect(line, `\`${story.id}\` 행의 점검 가능 범위가 실제 ${report.summary.coverage.percent}%와 다릅니다`).toMatch(
        new RegExp(`\\| ${report.summary.coverage.percent}% \\|$`, "u"),
      );
      expect(line).toContain(story.kind === "defect" ? "| 결함 |" : "| 깨끗함 |");
    }
  });

  it("골든 표의 개수 문장이 픽스처의 개수와 같다", () => {
    expect(feature).toContain(`### 8.1 골든 세트 (합성 이야기 ${GOLDEN_STORIES.length}개)`);
    expect(feature).toContain(`| 심은 결함 | ${defects.length}개 (아홉 범주를 모두 포함) |`);
    expect(feature).toContain(`| 찾은 결함 (재현율) | ${defects.length} / ${defects.length} = 100% |`);
    expect(feature).toContain(`| 깨끗한 이야기의 오탐 | ${cleans.length}개 이야기에서 0건 |`);
    const categories = new Set(defects.flatMap((story) => story.expected.map((item) => item.category)));
    expect(categories.size).toBe(PLAUSIBILITY_CATEGORIES.length);
  });

  it("점수식과 상한 숫자가 코드의 값과 같다", () => {
    const { error, certainWarning, heuristicWarning, suggestion, categoryCap } = PLAUSIBILITY_SCORE_WEIGHTS;
    expect(feature).toContain(`오류 × ${error} + 확정 경고 × ${certainWarning} + 추정 경고 × ${heuristicWarning} + 제안 × ${suggestion}`);
    expect(feature).toContain(`(범주마다 최대 ${categoryCap}점)`);
    expect(feature).toContain(`| 리포트의 발견 수 | ${PLAUSIBILITY_DEFAULT_MAX_FINDINGS}건`);
  });

  it("기능 문서의 상대 링크가 가리키는 문서가 있다", () => {
    for (const target of ["docs/learn/story-plausibility-checklist.md", "docs/studio-storyworld-causality-lab-2026-09-05.md"]) {
      expect(() => read(target)).not.toThrow();
    }
    expect(feature).toContain("](../learn/story-plausibility-checklist.md)");
    expect(learn).toContain("](../features/story-plausibility-review.md)");
  });
});
