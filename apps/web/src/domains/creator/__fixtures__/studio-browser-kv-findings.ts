import type ts from "typescript";

export type FindingKind =
  | "durable-storage-write"
  | "indexeddb-cleanup"
  | "indexeddb-open"
  | "indexeddb-wrapper"
  | "indexeddb-write"
  | "local-storage-cleanup"
  | "local-storage-write";

export interface BrowserKvFinding {
  readonly file: string;
  readonly kind: FindingKind;
  readonly key: string;
  readonly line: number;
  readonly call: string;
}

export function compact(value: string): string {
  return value.replace(/\s+/gu, "");
}

export function finding(
  file: string,
  sourceFile: ts.SourceFile,
  node: ts.Node,
  kind: FindingKind,
  key: string,
): BrowserKvFinding {
  return Object.freeze({
    file,
    kind,
    key,
    line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
    call: compact(node.getText(sourceFile)),
  });
}
