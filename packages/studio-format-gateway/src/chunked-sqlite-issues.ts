/**
 * @file chunked-sqlite-issues.ts
 * @description `CSFCHUNK` 문서 가져오기의 진단 목록: 적대적 입력이 목록을 부풀리지 못하게 전체 길이와 코드별 길이를 제한한다.
 */

import type { FormatIssue } from "./format-common";

/**
 * 진단 메시지에 끼워 넣는 파일 속 문자열(이름 등)은 길이를 자른다. 앞쪽 `limit`개 코드 포인트만 훑으므로 문자열이 아무리 길어도
 * 비용이 `limit`에 비례한다.
 */
export function clipDiagnosticText(text: string, limit = 80): string {
  let count = 0;
  let end = 0;
  for (const character of text) {
    if (count === limit) return `${text.slice(0, end)}…`;
    count += 1;
    end += character.length;
  }
  return text;
}

/** 같은 코드의 진단을 목록에 싣는 최대 개수. 넘는 것은 세어 두었다가 코드마다 한 건으로 요약한다. */
export const CLIP_ISSUES_PER_CODE = 50;

/**
 * 진단 목록. 전체 길이(`max`)와 코드별 길이(`maxPerCode`)를 모두 제한한다: 레이어 수만 개가 같은 이유로 실패해도 서로 다른 진단이
 * 같은 코드의 반복에 밀려나지 않는다. 생략한 진단은 요약 항목으로 목록 끝에 붙는다. 요약 항목은 한도에 세지 않으며 그 수는 코드 종류 수로
 * 제한된다.
 */
export class ClipIssueList {
  private readonly items: FormatIssue[] = [];
  private readonly seenPerCode = new Map<string, number>();
  private readonly omittedPerCode = new Map<string, { scope: FormatIssue["scope"]; count: number }>();
  private dropped = 0;

  constructor(
    private readonly max: number,
    private readonly maxPerCode: number = CLIP_ISSUES_PER_CODE,
  ) {}

  add(scope: FormatIssue["scope"], code: string, message: string, path?: string): void {
    const seen = this.seenPerCode.get(code) ?? 0;
    this.seenPerCode.set(code, seen + 1);
    if (seen >= this.maxPerCode) {
      const omitted = this.omittedPerCode.get(code);
      if (omitted === undefined) this.omittedPerCode.set(code, { scope, count: 1 });
      else omitted.count += 1;
      return;
    }
    if (this.items.length >= this.max) {
      this.dropped += 1;
      return;
    }
    this.items.push(path === undefined ? { scope, code, message } : { scope, code, message, path });
  }

  /** 코드별로 `add`가 불린 총 횟수(코드당·전체 한도로 목록에서 빠진 것도 센다). */
  totals(): Record<string, number> {
    return Object.fromEntries(this.seenPerCode);
  }

  /** 생략한 진단이 있으면 코드별 요약과 전체 요약을 목록 끝에 붙여 돌려준다. */
  toArray(): FormatIssue[] {
    const result = [...this.items];
    for (const [code, omitted] of this.omittedPerCode) {
      result.push({
        scope: omitted.scope,
        code: "clip-issues-collapsed",
        message: `${code} 진단 ${omitted.count}건을 더 생략했다 (코드당 최대 ${this.maxPerCode}건)`,
      });
    }
    if (this.dropped > 0) {
      result.push({ scope: "container", code: "clip-issues-truncated", message: `진단 ${this.dropped}건을 생략했다 (한도 ${this.max}건)` });
    }
    return result;
  }
}
