/**
 * @file kra-nodes.ts
 * @description `maindoc.xml`의 레이어·마스크 트리를 파일 순서의 평면 목록(`KraLayerDraft`)으로 바꾼다.
 *
 * 속성 이름과 값 형식은 Krita 5.2.2 산출물을 관찰한 사실이다: 불리언은 `"0"`/`"1"`, `opacity`는 0~255 정수,
 * `nodetype`은 `paintlayer`·`grouplayer`·`clonelayer`·`shapelayer`·`filelayer`·`adjustmentlayer`(필터 레이어)이고
 * 마스크는 `transparencymask`·`selectionmask`·`filtermask`·`colorizemask`·`transformmask`다. 마스크도 레이어처럼 `x`·`y` 오프셋을
 * 갖는다(마스크 노드를 옮기면 0이 아니게 되고, 값 파일의 타일 좌표는 마스크 로컬이다). 속성이 없을 때의 기본값(보임, 잠금 없음,
 * 불투명)은 관찰한 적이 없는 가정이다.
 */

import { isObservedKraCompositeOp } from "./kra-composite-ops";
import { clipForMessage, type KraIssueList } from "./kra-issues";
import { hasKraMaskValues } from "./kra-masks";

import type { KraMaindocNode } from "./kra-maindoc";
import type { KraLayer, KraMask, KraNodeKind } from "./kra-types";

/** 값을 읽기 전의 마스크. `x`·`y`가 올바르지 않으면 `placementValid`가 false이고 값을 배치하지 않는다. */
export interface KraMaskDraft extends Omit<KraMask, "extent" | "defaultValue" | "tileCount" | "values"> {
  readonly placementValid: boolean;
}

export interface KraLayerDraft extends Omit<KraLayer, "extent" | "defaultPixel" | "tileCount" | "pixels" | "masks"> {
  readonly masks: readonly KraMaskDraft[];
}

export interface KraNodeIssues {
  readonly warnings: KraIssueList;
  readonly unsupported: KraIssueList;
}

export interface KraFlattened {
  readonly drafts: KraLayerDraft[];
  /** 오프셋을 읽지 못해 픽셀을 배치할 수 없는 레이어의 인덱스. */
  readonly placementInvalid: ReadonlySet<number>;
}

/** 레이어 오프셋과 타일 좌표를 더해도 안전하도록 32비트 정수 범위로 제한한다. */
const OFFSET_LIMIT = 2 ** 31;

function readFlag(attributes: Readonly<Record<string, string>>, key: string, fallback: boolean, issues: KraNodeIssues, where: string): boolean {
  const raw = attributes[key];
  if (raw === undefined) return fallback;
  if (raw === "1") return true;
  if (raw === "0") return false;
  issues.warnings.add("metadata", "kra-attribute-invalid", `${key}="${clipForMessage(raw)}"는 0/1이 아니라 기본값 ${fallback ? 1 : 0}으로 보았다`, where);
  return fallback;
}

function readInteger(
  attributes: Readonly<Record<string, string>>,
  key: string,
  fallback: number,
  min: number,
  max: number,
  issues: KraNodeIssues,
  where: string,
): number {
  const raw = attributes[key];
  if (raw === undefined) return fallback;
  const value = /^-?\d+$/u.test(raw) ? Number(raw) : Number.NaN;
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    issues.warnings.add("metadata", "kra-attribute-invalid", `${key}="${clipForMessage(raw)}"는 ${min}~${max} 정수가 아니라 ${fallback}으로 보았다`, where);
    return fallback;
  }
  return value;
}

/** 오프셋 문자열을 정수로. 속성이 없으면 0, 정수가 아니거나 ±2^31을 넘으면 null이다. */
function parseOffset(raw: string | undefined): number | null {
  if (raw === undefined) return 0;
  const value = /^-?\d+$/u.test(raw) ? Number(raw) : Number.NaN;
  return Number.isSafeInteger(value) && Math.abs(value) <= OFFSET_LIMIT ? value : null;
}

/** 오프셋은 값이 틀리면 null이다. 엉뚱한 곳에 그리느니 그 레이어의 픽셀을 배치하지 않는다. */
function readOffset(attributes: Readonly<Record<string, string>>, key: string, issues: KraNodeIssues, where: string): number | null {
  const raw = attributes[key];
  const value = parseOffset(raw);
  if (value === null) {
    issues.unsupported.add(
      "semantic",
      "kra-layer-offset-invalid",
      `${key}="${clipForMessage(raw ?? "")}"가 ±${OFFSET_LIMIT} 범위의 정수가 아니라 이 레이어의 픽셀을 배치하지 않는다`,
      where,
    );
  }
  return value;
}

/**
 * 마스크의 오프셋. 값 파일을 가진 마스크(`strict`)는 `x`·`y` 중 틀린 것이 있으면 마스크 하나당 진단 하나를 남기고 값을 배치하지 않는다. 값 파일이
 * 없는 마스크는 읽을 값이 없으므로 진단 없이 틀린 값을 0으로 본다.
 */
function readMaskOffsets(
  attributes: Readonly<Record<string, string>>,
  issues: KraNodeIssues,
  where: string,
  subject: string,
  strict: boolean,
): { readonly x: number; readonly y: number; readonly valid: boolean } {
  const x = parseOffset(attributes["x"]);
  const y = parseOffset(attributes["y"]);
  if (strict && (x === null || y === null)) {
    const invalid = (["x", "y"] as const)
      .filter((key) => parseOffset(attributes[key]) === null)
      .map((key) => `${key}="${clipForMessage(attributes[key] ?? "")}"`);
    issues.unsupported.add(
      "semantic",
      "kra-mask-offset-invalid",
      `${subject}의 ${invalid.join(", ")}가 ±${OFFSET_LIMIT} 범위의 정수가 아니라 이 마스크의 값을 배치하지 않는다`,
      where,
    );
  }
  return { x: x ?? 0, y: y ?? 0, valid: x !== null && y !== null };
}

/** 불투명도는 0~255 정수로 적히지만 소수 표기도 받아 반올림한다. 범위를 벗어나면 가까운 끝으로 맞춘다. */
function readOpacity(attributes: Readonly<Record<string, string>>, issues: KraNodeIssues, where: string): number {
  const raw = attributes["opacity"];
  if (raw === undefined) return 255;
  const value = /^-?\d+(?:\.\d+)?$/u.test(raw) ? Number(raw) : Number.NaN;
  if (!Number.isFinite(value)) {
    issues.warnings.add("metadata", "kra-attribute-invalid", `opacity="${clipForMessage(raw)}"는 숫자가 아니라 255로 보았다`, where);
    return 255;
  }
  if (value < 0 || value > 255) {
    issues.warnings.add("metadata", "kra-attribute-invalid", `opacity ${raw}가 0~255를 벗어나 가까운 끝으로 맞췄다`, where);
  }
  return Math.min(255, Math.max(0, Math.round(value)));
}

function kindOf(nodeType: string): KraNodeKind {
  if (nodeType === "paintlayer") return "raster";
  if (nodeType === "grouplayer") return "group";
  return "other";
}

function toMask(node: KraMaindocNode, issues: KraNodeIssues, where: string): KraMaskDraft {
  const attributes = node.attributes;
  const nodeType = attributes["nodetype"] ?? "";
  const name = attributes["name"] ?? "";
  const subject = `마스크 "${clipForMessage(name)}"(${clipForMessage(nodeType) || "종류 없음"})`;
  const hasValues = hasKraMaskValues(nodeType);
  issues.unsupported.add(
    "semantic",
    "kra-mask-unsupported",
    hasValues ? `${subject}는 레이어 픽셀에 적용하지 않는다` : `${subject}는 속성만 읽고 적용하지 않는다`,
    where,
  );
  const offsets = readMaskOffsets(attributes, issues, where, subject, hasValues);
  return {
    nodeType,
    name,
    uuid: attributes["uuid"] ?? null,
    visible: readFlag(attributes, "visible", true, issues, where),
    locked: readFlag(attributes, "locked", false, issues, where),
    filename: attributes["filename"] ?? null,
    offsetX: offsets.x,
    offsetY: offsets.y,
    placementValid: offsets.valid,
    attributes,
  };
}

/** 트리를 깊이 우선(위에서 아래)으로 펼친다. 인덱스 0이 최상단이다. */
export function flattenKraNodes(nodes: readonly KraMaindocNode[], issues: KraNodeIssues): KraFlattened {
  const drafts: KraLayerDraft[] = [];
  const placementInvalid = new Set<number>();
  const walk = (list: readonly KraMaindocNode[], parentIndex: number | null, depth: number, parentVisible: boolean): void => {
    for (const node of list) {
      const index = drafts.length;
      const where = `layer[${index}]`;
      const attributes = node.attributes;
      const nodeType = attributes["nodetype"] ?? "";
      const kind = kindOf(nodeType);
      const visible = readFlag(attributes, "visible", true, issues, where);
      const opacityRaw = readOpacity(attributes, issues, where);
      const compositeOp = attributes["compositeop"] ?? "normal";
      const compositeOpKnown = isObservedKraCompositeOp(compositeOp);
      if (!compositeOpKnown) {
        issues.warnings.add(
          "semantic",
          "kra-composite-op-unknown",
          `합성 연산 "${clipForMessage(compositeOp)}"는 이 코덱이 관찰한 목록에 없다 (id는 그대로 보존한다)`,
          where,
        );
      }
      if (kind === "other") {
        issues.unsupported.add(
          "semantic",
          "kra-node-unsupported",
          nodeType === ""
            ? "nodetype이 없는 노드는 속성만 보존하고 픽셀은 읽지 않는다"
            : `레이어 종류 "${clipForMessage(nodeType)}"는 속성만 보존하고 픽셀은 읽지 않는다`,
          where,
        );
      }
      const offsetX = readOffset(attributes, "x", issues, where);
      const offsetY = readOffset(attributes, "y", issues, where);
      if (offsetX === null || offsetY === null) placementInvalid.add(index);
      const effectiveVisible = parentVisible && visible;
      const masks = node.masks.map((mask, maskIndex) => toMask(mask, issues, `${where}.masks[${maskIndex}]`));
      drafts.push({
        index,
        parentIndex,
        depth,
        kind,
        nodeType,
        name: attributes["name"] ?? "",
        uuid: attributes["uuid"] ?? null,
        filename: attributes["filename"] ?? null,
        visible,
        effectiveVisible,
        locked: readFlag(attributes, "locked", false, issues, where),
        collapsed: readFlag(attributes, "collapsed", false, issues, where),
        passThrough: kind === "group" && readFlag(attributes, "passthrough", false, issues, where),
        opacity: opacityRaw / 255,
        opacityRaw,
        compositeOp,
        compositeOpKnown,
        colorLabel: readInteger(attributes, "colorlabel", 0, 0, 1_000_000, issues, where),
        inTimeline: readFlag(attributes, "intimeline", false, issues, where),
        offsetX: offsetX ?? 0,
        offsetY: offsetY ?? 0,
        colorSpace: attributes["colorspacename"] ?? null,
        masks,
        attributes,
      });
      if (node.children.length > 0) walk(node.children, index, depth + 1, effectiveVisible);
    }
  };
  walk(nodes, null, 0, true);
  return { drafts, placementInvalid };
}
