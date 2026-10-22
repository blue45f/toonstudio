/**
 * 분기형 컷툰 JSON 내보내기·가져오기(스키마 검증).
 *
 * 가져오기는 "모양"만 확인한다: JSON 문법, 형식 이름과 판 번호, 필드 형식, 자원 남용을 막는 큰 상한.
 * 모양이 맞는 파일은 내용이 잘못되어 있어도 그래프로 돌려주고, 내용의 옳고 그름(끊어진 연결, 막다른 길, 한도 등)은
 * 검증기(validateBranchingCuttoon)가 알린다. 그래서 작가는 가져온 뒤 오류를 눌러 가며 고칠 수 있다.
 * 알 수 없는 필드는 읽지 않고 버린다(버린 개수만 알린다). 모양이 틀린 파일은 일부만 받지 않고 통째로 거절한다.
 */
import {
  BRANCHING_CUTTOON_FORMAT,
  BRANCHING_CUTTOON_SCHEMA_VERSION,
  BRANCHING_NODE_KINDS,
  type BranchingChoice,
  type BranchingCuttoonGraph,
  type BranchingCut,
  type BranchingNode,
  type BranchingNodeKind,
} from "./branching-cuttoon-types";

/** 가져오기 전용 큰 상한. 검증기의 한도(장면 200개 등)보다 훨씬 커서, 한도를 넘는 파일도 읽어 들여 오류로 보여 줄 수 있다. */
export const BRANCHING_IMPORT_LIMITS = Object.freeze({
  maxTextLength: 1_048_576,
  maxNodes: 2_000,
  maxChoicesPerNode: 100,
  maxCutIdsPerNode: 500,
  maxCuts: 5_000,
  maxStringLength: 2_000,
  maxReportedErrors: 20,
});

export type BranchingParseErrorCode =
  | "empty"
  | "too-large"
  | "not-json"
  | "not-object"
  | "wrong-format"
  | "unsupported-version"
  | "missing-field"
  | "wrong-type"
  | "unknown-kind"
  | "too-many-items"
  | "string-too-long";

export interface BranchingParseError {
  readonly code: BranchingParseErrorCode;
  /** 문제가 있는 위치. 예: `nodes[2].choices[0].label`. */
  readonly path: string;
}

export type BranchingParseResult =
  | { readonly ok: true; readonly graph: BranchingCuttoonGraph; readonly ignoredFieldCount: number }
  | { readonly ok: false; readonly errors: readonly BranchingParseError[] };

type UnknownRecord = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ownValue(record: UnknownRecord, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}

class ParseContext {
  readonly errors: BranchingParseError[] = [];
  ignoredFieldCount = 0;

  fail(code: BranchingParseErrorCode, path: string): void {
    if (this.errors.length < BRANCHING_IMPORT_LIMITS.maxReportedErrors) this.errors.push({ code, path });
  }

  countIgnored(record: UnknownRecord, known: readonly string[]): void {
    for (const key of Object.keys(record)) if (!known.includes(key)) this.ignoredFieldCount += 1;
  }

  string(record: UnknownRecord, key: string, path: string): string | null {
    const value = ownValue(record, key);
    if (value === undefined) {
      this.fail("missing-field", path);
      return null;
    }
    if (typeof value !== "string") {
      this.fail("wrong-type", path);
      return null;
    }
    if (value.length > BRANCHING_IMPORT_LIMITS.maxStringLength) {
      this.fail("string-too-long", path);
      return null;
    }
    return value;
  }

  array(record: UnknownRecord, key: string, path: string, maxItems: number): readonly unknown[] | null {
    const value = ownValue(record, key);
    if (value === undefined) {
      this.fail("missing-field", path);
      return null;
    }
    if (!Array.isArray(value)) {
      this.fail("wrong-type", path);
      return null;
    }
    if (value.length > maxItems) {
      this.fail("too-many-items", path);
      return null;
    }
    return value;
  }
}

const KNOWN_ROOT_KEYS = ["format", "schemaVersion", "title", "startNodeId", "cuts", "nodes"] as const;
const KNOWN_CUT_KEYS = ["id", "caption"] as const;
const KNOWN_NODE_KEYS = ["id", "kind", "title", "cutIds", "choices"] as const;
const KNOWN_CHOICE_KEYS = ["id", "label", "targetNodeId"] as const;

function isNodeKind(value: string): value is BranchingNodeKind {
  return (BRANCHING_NODE_KINDS as readonly string[]).includes(value);
}

function readCut(value: unknown, path: string, context: ParseContext): BranchingCut | null {
  if (!isRecord(value)) {
    context.fail("wrong-type", path);
    return null;
  }
  context.countIgnored(value, KNOWN_CUT_KEYS);
  const id = context.string(value, "id", `${path}.id`);
  const caption = context.string(value, "caption", `${path}.caption`);
  return id === null || caption === null ? null : { id, caption };
}

function readChoice(value: unknown, path: string, context: ParseContext): BranchingChoice | null {
  if (!isRecord(value)) {
    context.fail("wrong-type", path);
    return null;
  }
  context.countIgnored(value, KNOWN_CHOICE_KEYS);
  const id = context.string(value, "id", `${path}.id`);
  const label = context.string(value, "label", `${path}.label`);
  const targetNodeId = context.string(value, "targetNodeId", `${path}.targetNodeId`);
  return id === null || label === null || targetNodeId === null ? null : { id, label, targetNodeId };
}

function readNode(value: unknown, path: string, context: ParseContext): BranchingNode | null {
  if (!isRecord(value)) {
    context.fail("wrong-type", path);
    return null;
  }
  context.countIgnored(value, KNOWN_NODE_KEYS);
  const id = context.string(value, "id", `${path}.id`);
  const title = context.string(value, "title", `${path}.title`);
  const kindText = context.string(value, "kind", `${path}.kind`);
  let kind: BranchingNodeKind | null = null;
  if (kindText !== null) {
    if (isNodeKind(kindText)) kind = kindText;
    else context.fail("unknown-kind", `${path}.kind`);
  }

  const cutIds: string[] = [];
  let cutIdsOk = true;
  const rawCutIds = context.array(value, "cutIds", `${path}.cutIds`, BRANCHING_IMPORT_LIMITS.maxCutIdsPerNode);
  if (rawCutIds === null) cutIdsOk = false;
  else {
    rawCutIds.forEach((cutId, position) => {
      if (typeof cutId !== "string") {
        context.fail("wrong-type", `${path}.cutIds[${position}]`);
        cutIdsOk = false;
      } else if (cutId.length > BRANCHING_IMPORT_LIMITS.maxStringLength) {
        context.fail("string-too-long", `${path}.cutIds[${position}]`);
        cutIdsOk = false;
      } else cutIds.push(cutId);
    });
  }

  const choices: BranchingChoice[] = [];
  let choicesOk = true;
  const rawChoices = context.array(value, "choices", `${path}.choices`, BRANCHING_IMPORT_LIMITS.maxChoicesPerNode);
  if (rawChoices === null) choicesOk = false;
  else {
    rawChoices.forEach((raw, position) => {
      const choice = readChoice(raw, `${path}.choices[${position}]`, context);
      if (choice === null) choicesOk = false;
      else choices.push(choice);
    });
  }

  if (id === null || title === null || kind === null || !cutIdsOk || !choicesOk) return null;
  return { id, kind, title, cutIds, choices };
}

/** 이미 JSON 으로 읽은 값을 그래프로 바꾼다. 모양이 틀리면 일부만 받지 않고 오류 목록을 돌려준다. */
export function parseBranchingCuttoonValue(value: unknown): BranchingParseResult {
  const context = new ParseContext();
  if (!isRecord(value)) return { ok: false, errors: [{ code: "not-object", path: "" }] };
  if (ownValue(value, "format") !== BRANCHING_CUTTOON_FORMAT) return { ok: false, errors: [{ code: "wrong-format", path: "format" }] };
  if (ownValue(value, "schemaVersion") !== BRANCHING_CUTTOON_SCHEMA_VERSION) {
    return { ok: false, errors: [{ code: "unsupported-version", path: "schemaVersion" }] };
  }
  context.countIgnored(value, KNOWN_ROOT_KEYS);

  const title = context.string(value, "title", "title");
  const startNodeId = context.string(value, "startNodeId", "startNodeId");

  const cuts: BranchingCut[] = [];
  let cutsOk = true;
  const rawCuts = context.array(value, "cuts", "cuts", BRANCHING_IMPORT_LIMITS.maxCuts);
  if (rawCuts === null) cutsOk = false;
  else {
    rawCuts.forEach((raw, position) => {
      const cut = readCut(raw, `cuts[${position}]`, context);
      if (cut === null) cutsOk = false;
      else cuts.push(cut);
    });
  }

  const nodes: BranchingNode[] = [];
  let nodesOk = true;
  const rawNodes = context.array(value, "nodes", "nodes", BRANCHING_IMPORT_LIMITS.maxNodes);
  if (rawNodes === null) nodesOk = false;
  else {
    rawNodes.forEach((raw, position) => {
      const node = readNode(raw, `nodes[${position}]`, context);
      if (node === null) nodesOk = false;
      else nodes.push(node);
    });
  }

  if (title === null || startNodeId === null || !cutsOk || !nodesOk || context.errors.length > 0) {
    return { ok: false, errors: context.errors };
  }
  return { ok: true, graph: { title, startNodeId, cuts, nodes }, ignoredFieldCount: context.ignoredFieldCount };
}

/** JSON 글을 그래프로 바꾼다. 너무 크거나 JSON 이 아니면 읽지 않고 거절한다. */
export function parseBranchingCuttoonJson(text: string): BranchingParseResult {
  if (text.trim() === "") return { ok: false, errors: [{ code: "empty", path: "" }] };
  if (text.length > BRANCHING_IMPORT_LIMITS.maxTextLength) return { ok: false, errors: [{ code: "too-large", path: "" }] };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, errors: [{ code: "not-json", path: "" }] };
  }
  return parseBranchingCuttoonValue(value);
}

/** 그래프를 파일에 적는 글로 바꾼다. 필드 순서가 고정되어 같은 그래프는 언제나 같은 글이 된다. */
export function serializeBranchingCuttoon(graph: BranchingCuttoonGraph): string {
  return JSON.stringify(
    {
      format: BRANCHING_CUTTOON_FORMAT,
      schemaVersion: BRANCHING_CUTTOON_SCHEMA_VERSION,
      title: graph.title,
      startNodeId: graph.startNodeId,
      cuts: graph.cuts.map((cut) => ({ id: cut.id, caption: cut.caption })),
      nodes: graph.nodes.map((node) => ({
        id: node.id,
        kind: node.kind,
        title: node.title,
        cutIds: [...node.cutIds],
        choices: node.choices.map((choice) => ({ id: choice.id, label: choice.label, targetNodeId: choice.targetNodeId })),
      })),
    },
    null,
    2,
  );
}
