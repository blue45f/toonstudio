/**
 * Studio 진입 그래프 가드레일 — 모듈 지정자 해석.
 *
 * 정규식으로 경로를 짐작하지 않고 TypeScript 의 `ts.resolveModuleName` 과 tsconfig `paths` 로 해석한다.
 * 해석 규칙은 번들러(Vite)와 같은 쪽으로 맞춘다.
 *
 * - tsconfig `paths` 중 `.d.ts` 보강 파일만 가리키는 항목(canvaskit-wasm, mixbox 등)은 쓰지 않는다.
 *   번들러는 그 이름을 node_modules/워크스페이스 패키지로 풀기 때문이다.
 * - 워크스페이스 패키지(`@toonstudio/*`)는 심볼릭 링크 실경로(packages/*)로 풀려 1부 소스로 취급한다.
 * - 외부 npm 패키지는 해석하지 않고 패키지 이름만 기록한다(속도와 결정성).
 * - Vite 쿼리: `?raw` 는 문자열로 번들에 들어가는 데이터 모듈, `?url`·`?worker` 는 별도 자산/청크라 그래프 밖이다.
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]);
// 확장자만으로 "번들 JS 가 아닌 자산"으로 확정되는 지정자. Vite 가 URL 이나 별도 CSS 로 내보낸다.
const ASSET_EXTENSIONS = new Set([
  ".css", ".scss", ".sass", ".less", ".styl", ".svg", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".ico",
  ".bmp", ".glb", ".gltf", ".vrm", ".fbx", ".obj", ".wasm", ".onnx", ".ttf", ".otf", ".woff", ".woff2", ".mp3",
  ".ogg", ".wav", ".m4a", ".mp4", ".webm", ".bin", ".wgsl", ".glsl", ".hdr", ".exr", ".ktx2", ".basis", ".pdf", ".zip",
]);
const DECLARATION_FILE = /\.d\.[cm]?ts$/u;
const WORKER_QUERY = /(?:^|&)(?:worker|sharedworker)(?:&|$)/u;
const URL_QUERY = /(?:^|&)url(?:&|$)/u;
const RAW_QUERY = /(?:^|&)raw(?:&|$)/u;

/** 포함 관계를 판단하기 쉽게 저장소 상대 경로를 슬래시로 통일한다. */
export function toPosix(value) {
  return value.split(path.sep).join("/");
}

/** `@scope/name/sub` → `@scope/name`, `react/jsx-runtime` → `react`, `node:fs` → `node:fs`. */
export function packageNameOf(specifier) {
  if (specifier.startsWith("node:")) return specifier;
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

function escapeRegExp(value) {
  return value.replace(/[.+?^${}()|[\]\\]/gu, "\\$&");
}

function patternToRegExp(pattern) {
  return new RegExp(`^${pattern.split("*").map(escapeRegExp).join(".*")}$`, "u");
}

function listWorkspacePackageNames(root) {
  const names = new Set();
  for (const base of ["packages", "apps"]) {
    const directory = path.join(root, base);
    if (!fs.existsSync(directory)) continue;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifest = path.join(directory, entry.name, "package.json");
      if (!fs.existsSync(manifest)) continue;
      try {
        const name = JSON.parse(fs.readFileSync(manifest, "utf8")).name;
        if (typeof name === "string") names.add(name);
      } catch {
        // 깨진 package.json 은 다른 검증이 잡는다. 여기서는 워크스페이스 이름 목록에서만 뺀다.
      }
    }
  }
  return names;
}

/** tsconfig 에서 컴파일러 옵션만 읽는다(파일 목록 전개 없음). */
export function loadCompilerOptions(root, tsconfigPath = "tsconfig.json") {
  const absolute = path.join(root, tsconfigPath);
  const configFile = ts.readConfigFile(absolute, ts.sys.readFile);
  if (configFile.error) {
    throw new Error(`tsconfig 를 읽을 수 없습니다: ${tsconfigPath} (${ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n")})`);
  }
  const parsed = ts.parseJsonConfigFileContent(
    { ...configFile.config, include: [], files: [] }, ts.sys, root, undefined, absolute,
  );
  const options = { ...parsed.options, noEmit: true };
  if (options.paths) {
    // `.d.ts` 보강 파일만 가리키는 항목은 번들러가 쓰지 않는다 — 제거해 실제 패키지로 풀리게 한다.
    options.paths = Object.fromEntries(
      Object.entries(options.paths).filter(([, targets]) => targets.some((target) => !DECLARATION_FILE.test(target))),
    );
  }
  return options;
}

function createCachedHost(root) {
  const fileExists = new Map();
  const directoryExists = new Map();
  const fileText = new Map();
  const realpaths = new Map();
  const memo = (cache, key, compute) => {
    if (!cache.has(key)) cache.set(key, compute(key));
    return cache.get(key);
  };
  return {
    fileExists: (file) => memo(fileExists, file, (key) => {
      try {
        return fs.statSync(key).isFile();
      } catch {
        return false;
      }
    }),
    directoryExists: (directory) => memo(directoryExists, directory, (key) => {
      try {
        return fs.statSync(key).isDirectory();
      } catch {
        return false;
      }
    }),
    readFile: (file) => memo(fileText, file, (key) => ts.sys.readFile(key)),
    realpath: (target) => memo(realpaths, target, (key) => {
      try {
        return fs.realpathSync(key);
      } catch {
        return key;
      }
    }),
    getCurrentDirectory: () => root,
    getDirectories: (directory) => ts.sys.getDirectories(directory),
    useCaseSensitiveFileNames: true,
  };
}

/**
 * 모듈 해석기를 만든다.
 *
 * @param {{ root: string, tsconfigPath?: string }} config
 * @returns {{
 *   resolve: (specifier: string, containingFile: string) => {
 *     kind: "module" | "data" | "types" | "external" | "asset" | "worker" | "unresolved",
 *     file?: string, packageName?: string,
 *   },
 *   root: string,
 * }} `file` 은 저장소 상대 POSIX 경로다.
 */
export function createModuleResolver({ root, tsconfigPath = "tsconfig.json" }) {
  const options = loadCompilerOptions(root, tsconfigPath);
  const host = createCachedHost(root);
  const cache = ts.createModuleResolutionCache(root, (file) => file, options);
  const aliasPatterns = Object.keys(options.paths ?? {}).map(patternToRegExp);
  const workspaceNames = listWorkspacePackageNames(root);
  const aliasBases = Object.entries(options.paths ?? {}).map(([pattern, targets]) => ({
    regExp: patternToRegExp(pattern),
    prefix: pattern.endsWith("/*") ? pattern.slice(0, -1) : null,
    target: targets[0],
  }));

  const usesTypeScriptResolution = (specifier) => {
    if (specifier.startsWith(".") || path.isAbsolute(specifier)) return true;
    if (aliasPatterns.some((pattern) => pattern.test(specifier))) return true;
    const name = packageNameOf(specifier);
    return workspaceNames.has(name);
  };

  const classifyResolved = (absolute) => {
    const relative = toPosix(path.relative(root, absolute));
    if (relative.startsWith("../") || path.isAbsolute(relative)) {
      return { kind: "external", packageName: relative };
    }
    if (DECLARATION_FILE.test(relative)) return { kind: "types", file: relative };
    if (relative.split("/").includes("node_modules")) {
      return { kind: "external", packageName: packageNameOf(relative.split("node_modules/").pop() ?? relative) };
    }
    const extension = path.extname(relative).toLowerCase();
    if (extension === ".json") return { kind: "data", file: relative };
    if (CODE_EXTENSIONS.has(extension)) return { kind: "module", file: relative };
    return { kind: "asset", file: relative };
  };

  /** `?raw` 는 TypeScript 가 확장자를 몰라 풀지 못하므로 상대 경로와 `@/` 별칭만 직접 푼다. */
  const resolveRawAsset = (base, containingFile) => {
    let candidate = null;
    if (base.startsWith(".")) candidate = path.resolve(path.dirname(path.join(root, containingFile)), base);
    else {
      for (const { regExp, prefix, target } of aliasBases) {
        if (prefix && regExp.test(base)) {
          candidate = path.resolve(root, target.replace(/\*$/u, base.slice(prefix.length)));
          break;
        }
      }
    }
    if (candidate && host.fileExists(candidate)) return { kind: "data", file: toPosix(path.relative(root, candidate)) };
    return { kind: "unresolved" };
  };

  const resolve = (specifier, containingFile) => {
    const queryAt = specifier.indexOf("?");
    const base = queryAt >= 0 ? specifier.slice(0, queryAt) : specifier;
    const query = queryAt >= 0 ? specifier.slice(queryAt + 1) : "";
    if (WORKER_QUERY.test(query)) return { kind: "worker" };
    if (URL_QUERY.test(query)) return { kind: "asset" };
    if (base.startsWith("node:") || base.startsWith("virtual:") || base.startsWith("data:")) {
      return { kind: "external", packageName: packageNameOf(base) };
    }
    if (RAW_QUERY.test(query)) return resolveRawAsset(base, containingFile);
    if (ASSET_EXTENSIONS.has(path.extname(base).toLowerCase())) return { kind: "asset" };
    if (!usesTypeScriptResolution(base)) return { kind: "external", packageName: packageNameOf(base) };

    const resolved = ts.resolveModuleName(
      base, path.join(root, containingFile), options, host, cache,
    ).resolvedModule;
    if (!resolved) return { kind: "unresolved" };
    return classifyResolved(resolved.resolvedFileName);
  };

  return { resolve, root };
}
