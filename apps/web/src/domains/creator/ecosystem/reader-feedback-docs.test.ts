import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { EMOTION_LABELS, FUN_LEVEL_LABELS, UNDERSTANDING_LEVEL_LABELS } from "./reader-feedback-copy";
import { READER_FEEDBACK_HIDDEN_KEY, READER_FEEDBACK_HIDDEN_MAX } from "./reader-feedback-hidden";
import {
  READER_EMOTION_IDS,
  READER_FEEDBACK_KIND,
  READER_FEEDBACK_LIMITS,
  READER_FEEDBACK_VERSION,
  RATING_LEVELS,
} from "./reader-feedback-schema";
import { CONTENT_DEDUPE_MIN_COMMENT, REPRESENTATIVE_LIMIT, SAMPLE_LEVEL_THRESHOLDS } from "./reader-feedback-summary";

/**
 * 기능 문서가 코드와 어긋나지 않게 묶어 두는 테스트.
 * 상한·감정 태그·표본 기준·저장 키를 바꾸면 이 테스트가 실패하므로 문서의 표도 함께 고친다.
 */
const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const FEATURE_DOC = "docs/features/reader-feedback-summary.md";
const ECOSYSTEM_DOC = "docs/user-funded-ai-and-creator-ecosystem.md";

describe("독자 피드백 문서와 코드의 일치", () => {
  const doc = read(FEATURE_DOC);

  it("크기 상한 표가 코드의 값과 같고, 코드에 없는 상한을 말하지 않는다", () => {
    for (const [key, value] of Object.entries(READER_FEEDBACK_LIMITS)) {
      expect(doc, `${FEATURE_DOC}의 4절 표에 \`${key}\` = ${value} 행이 없습니다`).toContain(`| \`${key}\` | ${value} |`);
    }
    const rows = doc.split("\n").filter((line) => /^\| `max[A-Za-z]+` \| \d+ \|/u.test(line));
    expect(rows).toHaveLength(Object.keys(READER_FEEDBACK_LIMITS).length);
  });

  it("감정 태그 표가 코드의 값·한국어·영어 문구와 같다", () => {
    for (const id of READER_EMOTION_IDS) {
      expect(doc, `${FEATURE_DOC}에 감정 \`${id}\` 행이 없습니다`).toContain(`| \`${id}\` | ${EMOTION_LABELS[id].ko} | ${EMOTION_LABELS[id].en} |`);
    }
    const rows = doc.split("\n").filter((line) => /^\| `[a-z]+` \| [가-힣]+ \| [A-Za-z]+ \|$/u.test(line));
    expect(rows).toHaveLength(READER_EMOTION_IDS.length);
  });

  it("3단계 척도 문구가 코드의 값과 같다", () => {
    const joined = (labels: Record<number, { ko: string }>) => RATING_LEVELS.map((level) => labels[level]!.ko).join(" / ");
    expect(doc).toContain(`재미 — ${joined(FUN_LEVEL_LABELS)}`);
    expect(doc).toContain(`이해 — ${joined(UNDERSTANDING_LEVEL_LABELS)}`);
  });

  it("파일 종류·버전·숨김 저장 키·표본 기준·대표 의견 개수가 코드의 값과 같다", () => {
    expect(doc).toContain(`\`kind: "${READER_FEEDBACK_KIND}"\`, \`version: ${READER_FEEDBACK_VERSION}\``);
    expect(doc).toContain(`\`${READER_FEEDBACK_HIDDEN_KEY}\``);
    expect(doc).toContain(`응답 id ${READER_FEEDBACK_HIDDEN_MAX}개까지`);
    expect(doc).toContain(`${SAMPLE_LEVEL_THRESHOLDS.tinyBelow}개 미만 \`tiny\``);
    expect(doc).toContain(`${SAMPLE_LEVEL_THRESHOLDS.smallBelow}개 미만 \`small\``);
    expect(doc).toContain(`응답이 ${SAMPLE_LEVEL_THRESHOLDS.percentFrom}개 이상일 때만 보인다`);
    expect(doc).toContain(`최대 ${REPRESENTATIVE_LIMIT}개를 보인다`);
    expect(doc).toContain(`**의견이 ${CONTENT_DEDUPE_MIN_COMMENT}자 이상**`);
  });

  it("상대 링크가 가리키는 문서가 있고 생태계 문서가 이 문서를 가리킨다", () => {
    expect(() => read(ECOSYSTEM_DOC)).not.toThrow();
    expect(doc).toContain("](../user-funded-ai-and-creator-ecosystem.md)");
    expect(read(ECOSYSTEM_DOC)).toContain("](features/reader-feedback-summary.md)");
  });

  it("문서가 말하는 테스트 파일이 실제로 있다", () => {
    const files = Array.from(doc.matchAll(/`((?:Reader|Creator|reader-)[A-Za-z0-9-]+\.test\.tsx?)`/gu), (match) => match[1]!);
    expect(files.length).toBeGreaterThanOrEqual(8);
    for (const file of files) {
      expect(() => read(`apps/web/src/domains/creator/ecosystem/${file}`), `${file}이 없습니다`).not.toThrow();
    }
  });
});
