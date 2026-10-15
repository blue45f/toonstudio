/**
 * Studio 진입 그래프 가드레일 — 정적 도달 그래프 구성.
 *
 * 진입점에서 정적 간선(import / export-from)만 따라가며 "번들러가 첫 청크 그래프에 동기로 묶는 1부 모듈"
 * 집합을 만든다. 빌드를 하지 않으므로 수 초 안에 끝나고 같은 소스에서는 항상 같은 결과가 나온다.
 *
 * - 크기는 최소화·압축 전 원본 바이트다(상대 비교용). 번들 바이트의 대체 지표가 아니라 증가를 PR 시점에 보여 주는 선행 지표다.
 * - 지연 무효화: 어떤 곳에서 `import()` 로 지연 선언했지만 같은 모듈이 정적으로도 도달하면 분할 효과가 없다.
 * - 최단 경로: BFS 부모 포인터로 "어떤 import 가 이 모듈을 진입 그래프에 끌어왔는지"를 복원한다.
 */
import fs from "node:fs";
import path from "node:path";

import { createModuleResolver, toPosix } from "./studio-eager-graph-resolve.mjs";
import { scanModuleEdges } from "./studio-eager-graph-scan.mjs";

/** 로캘과 무관한 코드 유닛 순서 비교. 정렬 결과가 ICU·OS 설정에 따라 달라지지 않게 한다. */
export function compareText(left, right) {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

/** CRLF 체크아웃(core.autocrlf)에서도 기준선과 같은 크기가 되도록 `\r\n` 의 `\r` 은 세지 않는다. */
export function normalizedByteLength(buffer) {
  let carriageReturns = 0;
  for (let index = buffer.indexOf(13); index !== -1; index = buffer.indexOf(13, index + 1)) {
    if (buffer[index + 1] === 10) carriageReturns += 1;
  }
  return buffer.length - carriageReturns;
}

/** Studio 에디터 진입점. scripts/check-studio-bundle.mjs 의 studioEntry 와 같은 모듈이다. */
export const STUDIO_ADAPTER_ENTRY = "apps/web/src/domains/creator/studio-legacy-editor-adapter.tsx";
/** 앱 진입 HTML. 이 문서의 module script 가 가리키는 파일이 앱 셸 진입점이다. */
export const APP_INDEX_HTML = "apps/web/index.html";

const SCRIPT_TAG = /<script\b([^>]*)>/giu;
const ATTRIBUTE = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/gu;

/** index.html 의 `<script type="module" src>` 가 가리키는 저장소 상대 경로들. */
export function readHtmlModuleEntries(root, htmlPath = APP_INDEX_HTML) {
  const htmlFile = path.join(root, htmlPath);
  if (!fs.existsSync(htmlFile)) {
    throw new Error(`앱 진입 HTML 을 찾을 수 없습니다: ${htmlPath} (저장소 루트에서 실행하거나 --root 로 지정하세요)`);
  }
  const html = fs.readFileSync(htmlFile, "utf8");
  const webRoot = path.posix.dirname(htmlPath);
  const entries = [];
  for (const tag of html.matchAll(SCRIPT_TAG)) {
    const attributes = new Map();
    for (const attribute of tag[1].matchAll(ATTRIBUTE)) {
      attributes.set(attribute[1].toLowerCase(), attribute[2] ?? attribute[3] ?? "");
    }
    if (attributes.get("type") !== "module" || !attributes.get("src")) continue;
    const source = attributes.get("src");
    if (/^[a-z]+:|^\/\//iu.test(source)) continue;
    // 선행 슬래시는 Vite 의 root(= index.html 이 있는 apps/web) 기준 경로다.
    entries.push(path.posix.join(webRoot, source));
  }
  return entries;
}

/** 앱 셸(index.html) → Studio 어댑터 순서의 진입점 목록. 순서가 최단 경로 설명의 우선순위다. */
export function resolveStudioEntries(root) {
  return [...new Set([...readHtmlModuleEntries(root), STUDIO_ADAPTER_ENTRY])];
}

/** 집계용 폴더 키: creator 는 하위 폴더 단위, 그 밖은 앞 두 구간(또는 domains/<이름>). */
export function folderOf(file) {
  const parts = file.split("/");
  if (parts[0] === "apps" && parts[2] === "src") {
    if (parts[3] === "domains" && parts[4] === "creator") {
      return parts.length > 6 ? parts.slice(0, 6).join("/") : parts.slice(0, 5).join("/");
    }
    if (parts[3] === "domains") return parts.slice(0, 5).join("/");
    return parts.length > 5 ? parts.slice(0, 5).join("/") : parts.slice(0, 4).join("/");
  }
  if (parts[0] === "packages") return parts.slice(0, 2).join("/");
  const directories = parts.slice(0, -1);
  return (directories.length > 0 ? directories.slice(0, 2) : parts.slice(0, 1)).join("/");
}

/** `prefix` 아래(또는 같은 경로)인지. */
export function isUnder(file, prefix) {
  return file === prefix || file.startsWith(`${prefix}/`);
}

/**
 * 정적 도달 그래프를 만든다.
 *
 * @param {{ root: string, entries?: string[], resolver?: ReturnType<typeof createModuleResolver> }} config
 */
export function buildEagerGraph({ root, entries = resolveStudioEntries(root), resolver = createModuleResolver({ root }) }) {
  const nodes = new Map();
  const unresolved = [];

  const resolveEdges = (file, specifiers, accumulator) => {
    const files = [];
    for (const specifier of specifiers) {
      const result = resolver.resolve(specifier, file);
      if (result.kind === "module" || result.kind === "data") files.push(result.file);
      else if (result.kind === "external" && accumulator) accumulator.add(result.packageName);
      else if (result.kind === "unresolved" && accumulator) unresolved.push({ from: file, specifier });
    }
    return [...new Set(files)];
  };

  const loadNode = (file) => {
    const cached = nodes.get(file);
    if (cached) return cached;
    const buffer = fs.readFileSync(path.join(root, file));
    const isData = !/\.[cm]?[jt]sx?$/u.test(file);
    const node = {
      file, bytes: normalizedByteLength(buffer), kind: isData ? "data" : "module", static: [], dynamic: [], externals: new Set(), opaqueDynamic: 0,
    };
    if (!isData) {
      const edges = scanModuleEdges(buffer.toString("utf8"), file);
      node.static = resolveEdges(file, edges.static, node.externals);
      node.dynamic = resolveEdges(file, edges.dynamic, null);
      node.opaqueDynamic = edges.opaqueDynamic;
    }
    nodes.set(file, node);
    return node;
  };

  /** 진입점 하나의 정적 폐포(BFS). 부모 포인터가 최단 경로(홉 수 기준)다. */
  const closureOf = (entry) => {
    if (!fs.existsSync(path.join(root, entry))) throw new Error(`진입점 파일을 찾을 수 없습니다: ${entry}`);
    const parent = new Map([[entry, null]]);
    const order = [entry];
    for (let index = 0; index < order.length; index += 1) {
      for (const target of loadNode(order[index]).static) {
        if (parent.has(target)) continue;
        parent.set(target, order[index]);
        order.push(target);
      }
    }
    return { entry, order, parent };
  };

  const closures = entries.map(closureOf);
  const modules = new Map();
  for (const closure of closures) {
    for (const file of closure.order) {
      const node = loadNode(file);
      const record = modules.get(file) ?? { file, bytes: node.bytes, kind: node.kind, entries: [] };
      record.entries.push(closure.entry);
      modules.set(file, record);
    }
  }

  const entryTotals = {};
  for (const closure of closures) {
    entryTotals[closure.entry] = {
      modules: closure.order.length,
      bytes: closure.order.reduce((sum, file) => sum + loadNode(file).bytes, 0),
    };
  }
  const totalBytes = [...modules.values()].reduce((sum, record) => sum + record.bytes, 0);

  /** 진입점 순서상 가장 먼저 이 모듈을 포함하는 폐포의 경로(진입점 → … → 모듈). */
  const shortestPath = (file) => {
    const closure = closures.find((candidate) => candidate.parent.has(file));
    if (!closure) return [];
    const chain = [];
    for (let current = file; current !== null; current = closure.parent.get(current)) chain.push(current);
    return chain.reverse();
  };

  /** 지정한 진입점의 폐포 안에서만 찾은 최단 경로. 폐포 밖이면 빈 배열. */
  const pathIn = (entry, file) => {
    const closure = closures.find((candidate) => candidate.entry === entry);
    if (!closure?.parent.has(file)) return [];
    const chain = [];
    for (let current = file; current !== null; current = closure.parent.get(current)) chain.push(current);
    return chain.reverse();
  };

  const importersOf = new Map();
  for (const file of modules.keys()) {
    for (const target of loadNode(file).static) {
      if (!importersOf.has(target)) importersOf.set(target, []);
      importersOf.get(target).push(file);
    }
  }

  // 지연 무효화: 도달한 모듈 F 가 import(M) 으로 지연 선언했는데, F 가 실행될 때 이미 적재된 정적 그래프에 M 이
  // 들어 있으면 분할 효과가 없다. 앱 셸(첫 진입점)은 항상 적재돼 있고, 나머지 진입점(예: Studio 어댑터)은 F 가
  // 그 폐포에 속할 때만 적재돼 있다. 다른 진입점 자체를 지연 import 하는 정상 패턴(앱 → Studio)은 무효화가 아니다.
  const closureSets = closures.map((closure) => new Set(closure.order));
  const loadedWhenRunning = (file) => [closureSets[0], ...closureSets.slice(1).filter((set) => set.has(file))];
  const dynamicImportersOf = new Map();
  for (const file of modules.keys()) {
    const loaded = loadedWhenRunning(file);
    for (const target of loadNode(file).dynamic) {
      if (!modules.has(target) || !loaded.some((set) => set.has(target))) continue;
      if (!dynamicImportersOf.has(target)) dynamicImportersOf.set(target, []);
      dynamicImportersOf.get(target).push(file);
    }
  }
  const lazyInvalidated = [...dynamicImportersOf.entries()]
    .map(([file, dynamicImporters]) => ({
      file,
      bytes: modules.get(file).bytes,
      dynamicImporters: dynamicImporters.sort(compareText),
      staticImporters: [...(importersOf.get(file) ?? [])].sort(
        (left, right) => shortestPath(left).length - shortestPath(right).length || compareText(left, right),
      ),
    }))
    .sort((left, right) => right.bytes - left.bytes || compareText(left.file, right.file));

  const externalPackages = new Map();
  let opaqueDynamic = 0;
  for (const file of modules.keys()) {
    for (const name of loadNode(file).externals) externalPackages.set(name, (externalPackages.get(name) ?? 0) + 1);
    opaqueDynamic += loadNode(file).opaqueDynamic;
  }

  return {
    root,
    entries,
    modules,
    totals: { modules: modules.size, bytes: totalBytes },
    entryTotals,
    shortestPath,
    pathIn,
    importersOf: (file) => importersOf.get(file) ?? [],
    lazyInvalidated,
    externalPackages,
    opaqueDynamic,
    unresolved,
    relative: (absolute) => toPosix(path.relative(root, absolute)),
  };
}

/** 폴더별 { modules, bytes } 집계. */
export function summarizeFolders(graph) {
  const folders = new Map();
  for (const record of graph.modules.values()) {
    const key = folderOf(record.file);
    const entry = folders.get(key) ?? { modules: 0, bytes: 0 };
    entry.modules += 1;
    entry.bytes += record.bytes;
    folders.set(key, entry);
  }
  return folders;
}
