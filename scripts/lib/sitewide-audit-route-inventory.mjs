import { readFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

import { expandAuditRoutePattern } from "./sitewide-visual-ux-audit.mjs";

const APP_ROUTES = "apps/web/src/app/routes/groups/app-routes.tsx";
const STUDIO_REGISTRY = "apps/web/src/domains/creator/studio-route-registry.ts";
const STUDIO_MANIFEST = "apps/web/src/domains/creator/studio-router/studio-route-manifest.ts";
const ADMIN_MANIFEST = "apps/web/src/domains/admin/router/admin-route-manifest.ts";

function unwrap(node) {
  while (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node)) {
    node = node.expression;
  }
  return node;
}

function property(node, name) {
  return node.properties.find((entry) => ts.isPropertyAssignment(entry)
    && (ts.isIdentifier(entry.name) || ts.isStringLiteral(entry.name))
    && entry.name.text === name)?.initializer;
}

function literal(node) {
  return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : null;
}

function parseModule(filename, text) {
  const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true);
  const variables = new Map();
  const imports = new Map();
  for (const statement of source.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.initializer) {
          variables.set(declaration.name.text, declaration.initializer);
        }
      }
    }
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const bindings = statement.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const binding of bindings.elements) {
          imports.set(binding.name.text, {
            specifier: statement.moduleSpecifier.text,
            name: (binding.propertyName ?? binding.name).text,
          });
        }
      }
    }
  }
  return { filename, source, variables, imports };
}

function fail(module, node, reason) {
  const line = module.source.getLineAndCharacterOfPosition(node?.getStart(module.source) ?? 0).line + 1;
  throw new Error(`${module.filename}:${line}: ${reason}. 경로 권위와 감사 수집기를 확인하세요.`);
}

function arrayInitializer(module, name) {
  let node = module.variables.get(name);
  if (!node) fail(module, module.source, `${name} 선언을 찾지 못했습니다`);
  node = unwrap(node);
  while (ts.isCallExpression(node) && ["Object.freeze", "defineAppRoutes"].includes(node.expression.getText(module.source))) {
    node = unwrap(node.arguments[0]);
  }
  if (!ts.isArrayLiteralExpression(node)) fail(module, node, `${name}의 정적 배열을 읽을 수 없습니다`);
  return node;
}

function provenance(module, node, symbol, kind, id, pattern) {
  return {
    source: module.filename,
    line: module.source.getLineAndCharacterOfPosition(node.getStart(module.source)).line + 1,
    symbol,
    kind,
    id,
    pattern,
  };
}

/** 앱 코드를 실행하지 않고 실제 appRoutes의 import·spread와 세 라우트 권위를 읽는다. */
export async function collectDeclaredAuditRoutes(repositoryRoot, {
  readSource = (filename) => readFile(path.join(repositoryRoot, filename), "utf8"),
} = {}) {
  const modules = new Map();
  async function load(filename) {
    if (!modules.has(filename)) modules.set(filename, parseModule(filename, await readSource(filename)));
    return modules.get(filename);
  }
  async function resolveImport(module, specifier) {
    if (!specifier.startsWith(".")) fail(module, module.source, `라우트 배열 import ${specifier}를 해석할 수 없습니다`);
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(module.filename), specifier));
    for (const filename of [base, `${base}.tsx`, `${base}.ts`]) {
      try { return await load(filename); } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
    fail(module, module.source, `라우트 배열 파일 ${specifier}를 찾지 못했습니다`);
  }

  const studio = await load(STUDIO_REGISTRY);
  const registrations = arrayInitializer(studio, "STUDIO_ROUTE_REGISTRY").elements.map((entry) => {
    if (!ts.isCallExpression(entry) || entry.expression.getText(studio.source) !== "route") {
      fail(studio, entry, "Studio route() 선언이 아닙니다");
    }
    const id = literal(entry.arguments[0]);
    const pattern = literal(entry.arguments[1]);
    if (!id || !pattern) fail(studio, entry, "Studio ID 또는 경로가 정적 문자열이 아닙니다");
    const aliasesNode = entry.arguments[6] && unwrap(entry.arguments[6]);
    if (aliasesNode && !ts.isArrayLiteralExpression(aliasesNode)) fail(studio, aliasesNode, "Studio 별칭이 정적 배열이 아닙니다");
    const aliases = aliasesNode ? aliasesNode.elements.map((alias) => {
      const value = literal(alias);
      if (!value) fail(studio, alias, "Studio 별칭이 정적 문자열이 아닙니다");
      return value;
    }) : [];
    return { id, pattern, aliases, node: entry };
  });
  const studioPaths = new Map(registrations.map((entry) => [entry.id, entry.pattern]));
  const records = [];
  const active = new Set();

  function routePath(module, node) {
    if (!node) fail(module, module.source, "path 선언이 없습니다");
    node = unwrap(node);
    const value = literal(node);
    if (value !== null) return value;
    if (ts.isCallExpression(node) && node.expression.getText(module.source) === "studioRoutePath") {
      const routeId = literal(node.arguments[0]);
      if (studioPaths.has(routeId)) return studioPaths.get(routeId);
    }
    fail(module, node, "path 표현식을 정적 경로로 해석할 수 없습니다");
  }

  async function visitArray(module, name) {
    const key = `${module.filename}#${name}`;
    if (active.has(key)) fail(module, module.source, `${name} 라우트 배열이 순환 참조합니다`);
    active.add(key);
    try {
      for (const entry of arrayInitializer(module, name).elements) {
        if (ts.isSpreadElement(entry)) {
          if (!ts.isIdentifier(entry.expression)) fail(module, entry, "라우트 spread가 정적 식별자가 아닙니다");
          const spreadName = entry.expression.text;
          const imported = module.imports.get(spreadName);
          if (imported) await visitArray(await resolveImport(module, imported.specifier), imported.name);
          else await visitArray(module, spreadName);
          continue;
        }
        let id;
        let pattern;
        if (ts.isObjectLiteralExpression(entry)) {
          id = literal(property(entry, "id"));
          pattern = routePath(module, property(entry, "path"));
        } else if (ts.isCallExpression(entry) && entry.expression.getText(module.source) === "route") {
          id = literal(entry.arguments[0]);
          pattern = routePath(module, entry.arguments[1]);
        } else fail(module, entry, "라우트 항목을 해석할 수 없습니다");
        if (!id) fail(module, entry, "라우트 ID가 정적 문자열이 아닙니다");
        records.push(provenance(module, entry, name, "app-route", id, pattern));
      }
    } finally {
      active.delete(key);
    }
  }
  await visitArray(await load(APP_ROUTES), "appRoutes");
  for (const entry of registrations) {
    records.push(provenance(studio, entry.node, "STUDIO_ROUTE_REGISTRY", "studio-registration", entry.id, entry.pattern));
    for (const alias of entry.aliases) {
      records.push(provenance(studio, entry.node, "STUDIO_ROUTE_REGISTRY", "studio-alias", entry.id, alias));
    }
  }
  for (const [filename, symbol, field, kind] of [
    [STUDIO_MANIFEST, "STUDIO_ROUTE_MANIFEST", "pattern", "studio-manifest"],
    [ADMIN_MANIFEST, "ADMIN_ROUTES", "path", "admin-manifest"],
  ]) {
    const module = await load(filename);
    for (const entry of arrayInitializer(module, symbol).elements) {
      if (!ts.isObjectLiteralExpression(entry)) fail(module, entry, `${symbol} 항목이 정적 객체가 아닙니다`);
      const id = literal(property(entry, "id"));
      const pattern = literal(property(entry, field));
      if (!id || !pattern) fail(module, entry, `${symbol} ID 또는 경로가 정적 문자열이 아닙니다`);
      const patterns = pattern === "/studio/companion/:surface"
        ? arrayInitializer(module, "STUDIO_COMPANION_SURFACES").elements.map((surface) => {
          const value = literal(surface);
          if (!value) fail(module, surface, "companion surface가 정적 문자열이 아닙니다");
          return `/studio/companion/${value}`;
        })
        : [pattern];
      for (const value of patterns) records.push(provenance(module, entry, symbol, kind, id, value));
    }
  }

  // 관리자 별칭은 별도 목록 대신 순수 redirect resolver의 경로 비교가 권위다.
  const admin = await load(ADMIN_MANIFEST);
  const resolver = admin.source.statements.find((node) => ts.isFunctionDeclaration(node)
    && node.name?.text === "resolveAdminRedirectHref");
  if (!resolver) fail(admin, admin.source, "관리자 redirect resolver를 찾지 못했습니다");
  const visitAdminAliases = (node) => {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken) {
      for (const [variable, value] of [[node.left, node.right], [node.right, node.left]]) {
        const pattern = literal(value);
        if (ts.isIdentifier(variable) && variable.text === "normalized" && pattern?.startsWith("/admin")) {
          records.push(provenance(admin, node, "resolveAdminRedirectHref", "admin-alias", pattern, pattern));
        }
      }
    }
    ts.forEachChild(node, visitAdminAliases);
  };
  visitAdminAliases(resolver);

  const learning = await load("apps/web/src/domains/learn/LearnPage.tsx");
  const visitLearningPaths = (node) => {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken) {
      for (const [variable, value] of [[node.left, node.right], [node.right, node.left]]) {
        const pattern = literal(value);
        if (ts.isIdentifier(variable) && variable.text === "normalizedPath" && pattern?.startsWith("/learn")) {
          records.push(provenance(learning, node, "LearnPage", "learning-branch", pattern, pattern));
        }
      }
    }
    ts.forEachChild(node, visitLearningPaths);
  };
  visitLearningPaths(learning.source);
  const lessons = [];
  for (const [filename, symbol, prefix] of [
    ["learning-content.ts", "LESSONS", "/learn/lessons"],
    ["learning-paths.ts", "LEARNING_PATHS", "/learn/paths"],
  ]) {
    const module = await load(`apps/web/src/domains/learn/${filename}`);
    for (const entry of arrayInitializer(module, symbol).elements) {
      const id = ts.isObjectLiteralExpression(entry) && literal(property(entry, "id"));
      if (!id) fail(module, entry, `${symbol} ID가 정적 문자열이 아닙니다`);
      const url = `${prefix}/${encodeURIComponent(id)}`;
      if (symbol === "LESSONS") lessons.push(url);
      records.push(provenance(module, entry, symbol, "learning-content-id", id, url));
    }
  }
  const learningContent = await load("apps/web/src/domains/learn/LearnContent.tsx");
  const visitLearningRoutes = (node) => {
    if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node))
      && node.tagName.getText(learningContent.source) === "Route") {
      const attribute = node.attributes.properties.find((entry) => ts.isJsxAttribute(entry) && entry.name.text === "path");
      if (attribute) {
        let value = attribute.initializer;
        if (value && ts.isJsxExpression(value)) value = value.expression;
        const pattern = literal(value);
        if (pattern === null) fail(learningContent, node, "학습 Route path가 정적 문자열이 아닙니다");
        const record = provenance(learningContent, node, "LearnPage", "learning-route", pattern, `/learn/${pattern}`);
        // 실제 선언된 수업 ID를 사용하므로 존재하지 않는 상세 페이지를 정상 수업으로 세지 않는다.
        if (pattern === "lessons/:lessonId") record.samples = lessons;
        records.push(record);
      }
    }
    ts.forEachChild(node, visitLearningRoutes);
  };
  visitLearningRoutes(learningContent.source);
  return {
    records,
    sources: [...modules.keys()].sort(),
    appRouteDeclarations: records.filter((entry) => entry.kind === "app-route").length,
  };
}

/** 한 URL에 여러 선언이 모이면 출처를 보존한다. 표본 ID는 실데이터 성공 사례가 아니다. */
export function expandAuditRouteInventory(records) {
  const entries = new Map();
  const excluded = [];
  for (const record of records) {
    const urls = record.samples ?? expandAuditRoutePattern(record.pattern);
    if (!urls.length) {
      excluded.push({ ...record, reason: record.pattern.includes("*") ? "wildcard-owner" : "unsupported-pattern" });
    }
    for (const url of urls) {
      if (!entries.has(url)) entries.set(url, { path: url, usesPlaceholder: url.split("/").includes("visual-audit"), sources: [] });
      entries.get(url).sources.push(record);
    }
  }
  return {
    entries: [...entries.values()].sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0),
    excluded,
  };
}

export async function collectAuditRouteInventory(repositoryRoot, options = {}) {
  const { records, ...declared } = await collectDeclaredAuditRoutes(repositoryRoot, options);
  const expanded = expandAuditRouteInventory(records);
  return { ...declared, ...expanded, routes: expanded.entries.map((entry) => entry.path) };
}
