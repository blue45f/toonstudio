/**
 * 모순·연속성 이슈의 처리 상태(해결 표시/무시 사유)를 작품 스코프별로 보관한다.
 *
 * 이슈 id는 검사 코드 + 데이터 지문이라, 데이터를 고쳐 충돌이 바뀌면 새 이슈로
 * 나타난다 — 예전 처리 기록이 새 충돌을 덮지 않는 것이 정직한 동작이다.
 * 엔진 이슈와 연속성 검사 이슈가 같은 저장 방식을 공유한다.
 */
export type StoryworldIssueDispositionStatus = "resolved" | "ignored";

export interface StoryworldIssueDisposition {
  readonly issueKey: string;
  readonly status: StoryworldIssueDispositionStatus;
  readonly note?: string;
  readonly updatedAtIso: string;
}

export interface StoryworldIssueDispositionDocument {
  readonly version: 1;
  readonly scopeKey: string;
  readonly dispositions: readonly StoryworldIssueDisposition[];
}

export const EMPTY_STORYWORLD_ISSUE_DISPOSITIONS: StoryworldIssueDispositionDocument = {
  version: 1,
  scopeKey: "",
  dispositions: [],
};

export function storyworldIssueDispositionKey(scopeKey: string): string {
  return `toonspectrum:storyworld-issue-dispositions:v1:${scopeKey}`;
}

export function upsertStoryworldIssueDisposition(
  document: StoryworldIssueDispositionDocument,
  disposition: StoryworldIssueDisposition,
): StoryworldIssueDispositionDocument {
  const rest = document.dispositions.filter((item) => item.issueKey !== disposition.issueKey);
  return { ...document, dispositions: [...rest, disposition] };
}

export function clearStoryworldIssueDisposition(
  document: StoryworldIssueDispositionDocument,
  issueKey: string,
): StoryworldIssueDispositionDocument {
  return { ...document, dispositions: document.dispositions.filter((item) => item.issueKey !== issueKey) };
}

function assertDispositionRecord(value: unknown): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("스토리월드 이슈 처리 기록의 항목 형식이 올바르지 않습니다.");
  }
}

export function parseStoryworldIssueDispositions(text: string, scopeKey: string): StoryworldIssueDispositionDocument {
  const raw: unknown = JSON.parse(text);
  assertDispositionRecord(raw);
  if (raw["version"] !== 1 || !Array.isArray(raw["dispositions"])) {
    throw new Error("스토리월드 이슈 처리 기록의 버전이 올바르지 않습니다.");
  }
  const dispositions = raw["dispositions"].map((entry) => {
    assertDispositionRecord(entry);
    const issueKey = entry["issueKey"];
    const status = entry["status"];
    const note = entry["note"];
    const updatedAtIso = entry["updatedAtIso"];
    if (typeof issueKey !== "string" || (status !== "resolved" && status !== "ignored")
      || typeof updatedAtIso !== "string"
      || (note !== undefined && typeof note !== "string")) {
      throw new Error("스토리월드 이슈 처리 기록의 항목이 올바르지 않습니다.");
    }
    return { issueKey, status, ...(note !== undefined ? { note } : {}), updatedAtIso } as StoryworldIssueDisposition;
  });
  return { version: 1, scopeKey, dispositions };
}
