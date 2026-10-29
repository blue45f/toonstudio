/**
 * @file kra-issues.ts
 * @description Krita 읽기 코덱의 진단 목록: 적대적 입력이 목록을 부풀리지 못하게 길이를 제한한다.
 */

import type { FormatIssue } from "./format-common";

/**
 * 진단 메시지에 끼워 넣는 파일 속 문자열(이름 등)은 길이를 자른다. 앞쪽 `limit`개 코드 포인트만 훑으므로 문자열이 아무리 길어도
 * 비용이 `limit`에 비례한다(레이어마다 부르는 곳에서 이차 비용이 생기지 않는다).
 */
export function clipForMessage(text: string, limit = 80): string {
  let count = 0;
  let end = 0;
  for (const character of text) {
    if (count === limit) return `${text.slice(0, end)}…`;
    count += 1;
    end += character.length;
  }
  return text;
}

export class KraIssueList {
  private readonly items: FormatIssue[] = [];
  private dropped = 0;

  constructor(private readonly max: number) {}

  add(scope: FormatIssue["scope"], code: string, message: string, path?: string): void {
    if (this.items.length >= this.max) {
      this.dropped += 1;
      return;
    }
    this.items.push(path === undefined ? { scope, code, message } : { scope, code, message, path });
  }

  /** 한도를 넘어 버린 진단이 있으면 마지막에 한 건으로 요약해 붙인다. */
  toArray(): FormatIssue[] {
    if (this.dropped === 0) return [...this.items];
    return [
      ...this.items,
      { scope: "container", code: "kra-issues-truncated", message: `진단 ${this.dropped}건을 생략했다 (한도 ${this.max}건)` },
    ];
  }
}
