import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { BRANCHING_PATH_LIMITS } from "./branching-cuttoon-analysis";
import { BRANCHING_IMPORT_LIMITS } from "./branching-cuttoon-json";
import {
  BRANCHING_CUTTOON_FORMAT,
  BRANCHING_CUTTOON_LIMITS,
  BRANCHING_CUTTOON_SCHEMA_VERSION,
  BRANCHING_ISSUE_CODES,
  BRANCHING_ISSUE_SEVERITY,
  BRANCHING_TRAIL_LIMIT,
} from "./branching-cuttoon-types";

/**
 * 기능 문서(docs/features/branching-cuttoon.md)의 표가 코드의 한도·검증 코드·상한과 어긋나지 않게 묶어 두는 시험.
 * 값을 바꾸면 이 시험이 실패하므로 문서의 표도 함께 고친다.
 */
const doc = readFileSync("docs/features/branching-cuttoon.md", "utf8");
const lines = doc.split("\n");

/** 표의 한 줄: `| 설명 | \`이름\` | 값 |` 에서 둘째 칸이 이름인 줄을 찾아 값(마지막 칸)을 읽는다. */
function rowValue(name: string): string | null {
  for (const line of lines) {
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").map((cell) => cell.trim()).filter((cell) => cell !== "");
    if (cells.length === 3 && cells[1] === `\`${name}\``) return cells[2] ?? null;
  }
  return null;
}

describe("분기형 컷툰 문서와 코드의 일치", () => {
  it.each(Object.entries(BRANCHING_CUTTOON_LIMITS))("크기 한도 %s 의 값이 문서 표와 같다", (name, value) => {
    expect(rowValue(name), `문서의 크기 한도 표에서 \`${name}\` 행이 없거나 값이 코드와 다릅니다`).toBe(String(value));
  });

  it.each(Object.entries(BRANCHING_PATH_LIMITS))("길 열거 상한 %s 의 값이 문서 표와 같다", (name, value) => {
    expect(rowValue(name), `문서의 길 열거 상한 표에서 \`${name}\` 행이 없거나 값이 코드와 다릅니다`).toBe(String(value));
  });

  it.each(Object.entries(BRANCHING_IMPORT_LIMITS))("가져오기 상한 %s 의 값이 문서 표와 같다", (name, value) => {
    expect(rowValue(name), `문서의 가져오기 상한 표에서 \`${name}\` 행이 없거나 값이 코드와 다릅니다`).toBe(String(value));
  });

  it.each(BRANCHING_ISSUE_CODES)("검증 코드 %s 가 문서 표에 같은 구분으로 있다", (code) => {
    const line = lines.find((candidate) => candidate.startsWith(`| \`${code}\` |`));
    expect(line, `문서의 검증 코드 표에 \`${code}\` 행이 없습니다`).toBeDefined();
    const label = BRANCHING_ISSUE_SEVERITY[code] === "error" ? "오류" : "경고";
    expect(line, `\`${code}\` 의 구분이 코드(${label})와 다릅니다`).toContain(`| ${label} |`);
  });

  it("문서가 말하는 오류 종류·경고 종류 수가 코드와 같다", () => {
    const errors = BRANCHING_ISSUE_CODES.filter((code) => BRANCHING_ISSUE_SEVERITY[code] === "error").length;
    const warnings = BRANCHING_ISSUE_CODES.length - errors;
    expect(doc).toContain(`오류 ${errors}종·경고 ${warnings}종`);
  });

  it("파일 형식 이름·판 번호·되돌리기 스택 상한을 문서가 코드 그대로 적는다", () => {
    expect(doc).toContain(`format = "${BRANCHING_CUTTOON_FORMAT}"`);
    expect(doc).toContain(`schemaVersion = ${BRANCHING_CUTTOON_SCHEMA_VERSION}`);
    expect(doc).toContain(`${BRANCHING_TRAIL_LIMIT}단계`);
  });

  it("현재/목표 구분, 한계, 막다른 길 검사의 보장 범위를 빠짐없이 적는다", () => {
    for (const heading of [
      "## 현재 상태와 목표 상태",
      "## 한계",
      "## 막다른 길 검사가 보장하는 것과 보장하지 않는 것",
      "## 검증 범위",
    ]) {
      expect(doc, `${heading} 절이 없습니다`).toContain(heading);
    }
    expect(doc).toContain("보장하지 않는 것:");
    for (const limit of ["서버 저장 없음", "독자 통계 없음", "정산 없음"]) {
      expect(doc, `한계에 "${limit}" 가 없습니다`).toContain(`**${limit}.**`);
    }
  });
});
