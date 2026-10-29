/**
 * @file kra-maindoc.ts
 * @description Krita `maindoc.xml` 파서: DOCTYPE 한 줄을 안전하게 떼고, 이미지 속성과 레이어·마스크 트리를 읽는다.
 *
 * 구조는 Krita 5.2.2가 저장한 `.kra`를 관찰한 사실이다(소스는 읽지 않았다): 루트 `DOC`(속성 `editor`,
 * `kritaVersion`, `syntaxVersion`) 아래 `IMAGE`(속성 `name`, `width`, `height`, `colorspacename`, `profile`,
 * `x-res`, `y-res`, `description` 등)가 있고, 그 안의 `layers`가 위에서 아래 순서로 `layer`를 나열한다. 그룹
 * 레이어는 자기 안에 `layers`를 중첩하고, 마스크는 부모 `layer` 안의 `masks > mask`다. 속성 순서는 저장할 때마다
 * 다르므로 순서에 의존하지 않는다. 파일은 `<!DOCTYPE DOC PUBLIC '…' '…'>` 한 줄로 시작한다.
 */

import { parseSafeXml, SAFE_XML_LIMITS, SafeXmlError, xmlLocalName, type SafeXmlElement } from "./format-common";
import { clipForMessage } from "./kra-issues";
import { KraError, type KraLimits } from "./kra-types";

export interface KraMaindocNode {
  readonly element: "layer" | "mask";
  readonly attributes: Readonly<Record<string, string>>;
  /** 그룹 레이어 안에 중첩된 레이어(위에서 아래). */
  readonly children: readonly KraMaindocNode[];
  readonly masks: readonly KraMaindocNode[];
}

export interface KraMaindoc {
  readonly editor: string | null;
  readonly kritaVersion: string | null;
  readonly syntaxVersion: string | null;
  readonly image: Readonly<Record<string, string>>;
  /** 최상위 레이어(위에서 아래). */
  readonly nodes: readonly KraMaindocNode[];
  /** 레이어와 마스크를 합친 노드 수. */
  readonly nodeCount: number;
}

/**
 * Krita가 쓰는 DOCTYPE 형태(공개 식별자와 시스템 식별자만 있고 내부 부분집합 `[` 이 없는 것)만 떼어 낸다.
 * 그 밖의 DOCTYPE·ENTITY는 그대로 남아 안전 파서가 거부한다. DTD는 가져오지 않는다.
 */
const KRITA_DOCTYPE = /<!DOCTYPE\s+DOC\s+PUBLIC\s+(?:'[^'[\]]*'|"[^"[\]]*")\s+(?:'[^'[\]]*'|"[^"[\]]*")\s*>/u;
/** DOCTYPE 앞에는 공백과 XML 선언만 올 수 있다. 본문 중간의 DOCTYPE은 떼지 않고 파서가 거부하게 둔다. */
const PROLOG_BEFORE_DOCTYPE = /^\uFEFF?\s*(?:<\?xml\b[^>]*\?>\s*)?$/u;

function stripKritaDoctype(text: string): string {
  const match = KRITA_DOCTYPE.exec(text);
  if (match === null || !PROLOG_BEFORE_DOCTYPE.test(text.slice(0, match.index))) return text;
  return text.slice(0, match.index) + text.slice(match.index + match[0].length);
}

function copyAttributes(element: SafeXmlElement): Readonly<Record<string, string>> {
  const attributes: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const key of Object.keys(element.attrs)) attributes[key] = element.attrs[key]!;
  return Object.freeze(attributes);
}

function childElements(element: SafeXmlElement, localName: string): SafeXmlElement[] {
  return element.children.filter((child) => xmlLocalName(child.name) === localName);
}

export function parseKraMaindoc(text: string, limits: KraLimits): KraMaindoc {
  if (text.length > limits.maxMaindocCharacters) {
    throw new KraError(`maindoc.xml ${text.length}자가 한도 ${limits.maxMaindocCharacters}를 넘는다`, "limit-exceeded");
  }
  const withoutDoctype = stripKritaDoctype(text);
  let root: SafeXmlElement;
  try {
    root = parseSafeXml(withoutDoctype, {
      maxCharacters: limits.maxMaindocCharacters,
      // 그룹 하나가 layer와 layers 두 단계를 쓴다.
      maxDepth: Math.max(SAFE_XML_LIMITS.maxDepth, limits.maxGroupDepth * 2 + 8),
      maxNodes: limits.maxNodes * 2 + 256,
      maxAttributesPerElement: SAFE_XML_LIMITS.maxAttributesPerElement,
    });
  } catch (error) {
    if (error instanceof SafeXmlError) {
      throw new KraError(`maindoc.xml을 읽을 수 없다: ${clipForMessage(error.message, 200)}`, "maindoc-invalid", { cause: error });
    }
    throw error;
  }
  if (xmlLocalName(root.name) !== "DOC") {
    throw new KraError(`루트 요소가 DOC가 아니라 ${clipForMessage(root.name)}이다`, "maindoc-invalid");
  }
  const imageElement = childElements(root, "IMAGE")[0];
  if (imageElement === undefined) throw new KraError("maindoc.xml에 IMAGE 요소가 없다", "maindoc-invalid");

  let nodeCount = 0;
  const readNode = (element: SafeXmlElement, kind: "layer" | "mask", depth: number): KraMaindocNode => {
    nodeCount += 1;
    if (nodeCount > limits.maxNodes) throw new KraError(`노드가 한도 ${limits.maxNodes}개를 넘는다`, "limit-exceeded");
    if (depth > limits.maxGroupDepth) throw new KraError(`그룹 중첩이 한도 ${limits.maxGroupDepth}단계를 넘는다`, "limit-exceeded");
    const children: KraMaindocNode[] = [];
    const masks: KraMaindocNode[] = [];
    if (kind === "layer") {
      for (const layers of childElements(element, "layers")) {
        for (const child of childElements(layers, "layer")) children.push(readNode(child, "layer", depth + 1));
      }
      for (const group of childElements(element, "masks")) {
        for (const child of childElements(group, "mask")) masks.push(readNode(child, "mask", depth + 1));
      }
    }
    return { element: kind, attributes: copyAttributes(element), children, masks };
  };

  const nodes: KraMaindocNode[] = [];
  for (const layers of childElements(imageElement, "layers")) {
    for (const element of childElements(layers, "layer")) nodes.push(readNode(element, "layer", 1));
  }
  return {
    editor: root.attrs["editor"] ?? null,
    kritaVersion: root.attrs["kritaVersion"] ?? null,
    syntaxVersion: root.attrs["syntaxVersion"] ?? null,
    image: copyAttributes(imageElement),
    nodes,
    nodeCount,
  };
}
