import path from "node:path";

import ts from "typescript";

import type { EngineeringAtlasSample, EngineeringCodeLanguage } from "./engineering-atlas-types";

/**
 * 도감 샘플 코드 검증기(테스트 전용: 앱 번들에서 import 하지 않는다).
 *
 * - `types`: 저장소의 실제 패키지 타입(yjs, three, socket.io-client 등)과 DOM 타입으로 strict 타입 검사를 한다.
 * - `syntax`: 구문만 검사한다(기본값. ts·tsx·js·json).
 * - `none`: 검사하지 않는다(bash·python·rust 등).
 */

export interface SampleVerification {
  readonly ok: boolean;
  readonly messages: readonly string[];
}

const ROOT = process.cwd();
const VIRTUAL_DIR = path.join(ROOT, "apps/web/src/domains/legal/technology/__atlas_sample__");

const SOURCE_FILE_CACHE = new Map<string, ts.SourceFile>();

function options(jsx: boolean): ts.CompilerOptions {
  const base: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    lib: ["lib.es2023.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    esModuleInterop: true,
    types: [],
  };
  // `jsx: undefined` 키가 남아 있으면 TypeScript 6 의 transpileModule 이 TS6046 을 내므로, tsx 일 때만 키를 둔다.
  return jsx ? { ...base, jsx: ts.JsxEmit.ReactJSX } : base;
}

function describeDiagnostic(diagnostic: ts.Diagnostic): string {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
  if (diagnostic.file && diagnostic.start !== undefined) {
    const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
    return `${line + 1}:${character + 1} TS${diagnostic.code} ${message}`;
  }
  return `TS${diagnostic.code} ${message}`;
}

function typeCheck(id: string, code: string, language: EngineeringCodeLanguage): SampleVerification {
  const jsx = language === "tsx";
  const fileName = path.join(VIRTUAL_DIR, `${id}.${jsx ? "tsx" : language === "js" ? "js" : "ts"}`);
  // 최상위 await 와 import 없는 예제를 위해 모듈로 만든다.
  const source = `${code}\nexport {};\n`;
  const compilerOptions = { ...options(jsx), allowJs: language === "js" };
  const host = ts.createCompilerHost(compilerOptions, true);
  const originalGetSourceFile = host.getSourceFile.bind(host);
  const originalFileExists = host.fileExists.bind(host);
  const originalReadFile = host.readFile.bind(host);
  host.fileExists = (name) => name === fileName || originalFileExists(name);
  host.readFile = (name) => (name === fileName ? source : originalReadFile(name));
  host.getSourceFile = (name, languageVersionOrOptions, onError, shouldCreate) => {
    if (name === fileName) {
      return ts.createSourceFile(name, source, languageVersionOrOptions, true, jsx ? ts.ScriptKind.TSX : undefined);
    }
    const cached = SOURCE_FILE_CACHE.get(name);
    if (cached) return cached;
    const loaded = originalGetSourceFile(name, languageVersionOrOptions, onError, shouldCreate);
    if (loaded && /[\\/]node_modules[\\/]/u.test(name)) SOURCE_FILE_CACHE.set(name, loaded);
    return loaded;
  };
  const program = ts.createProgram({ rootNames: [fileName], options: compilerOptions, host });
  const file = program.getSourceFile(fileName);
  const diagnostics = file
    ? [...program.getSyntacticDiagnostics(file), ...program.getSemanticDiagnostics(file)]
    : [];
  return { ok: diagnostics.length === 0, messages: diagnostics.map(describeDiagnostic) };
}

function syntaxCheck(code: string, language: EngineeringCodeLanguage): SampleVerification {
  if (language === "json") {
    try {
      JSON.parse(code);
      return { ok: true, messages: [] };
    } catch (error) {
      return { ok: false, messages: [`JSON 구문 오류: ${error instanceof Error ? error.message : String(error)}`] };
    }
  }
  const result = ts.transpileModule(`${code}\nexport {};\n`, {
    compilerOptions: { ...options(language === "tsx"), allowJs: language === "js" },
    reportDiagnostics: true,
    fileName: language === "tsx" ? "sample.tsx" : language === "js" ? "sample.js" : "sample.ts",
  });
  const diagnostics = result.diagnostics ?? [];
  return { ok: diagnostics.length === 0, messages: diagnostics.map(describeDiagnostic) };
}

const CHECKABLE: ReadonlySet<EngineeringCodeLanguage> = new Set<EngineeringCodeLanguage>(["ts", "tsx", "js", "json"]);

export function defaultVerifyMode(sample: Pick<EngineeringAtlasSample, "language" | "verify">): "types" | "syntax" | "none" {
  if (sample.verify) return sample.verify;
  return CHECKABLE.has(sample.language) ? "syntax" : "none";
}

export function verifySample(id: string, sample: EngineeringAtlasSample, code: string = sample.code): SampleVerification {
  const mode = defaultVerifyMode(sample);
  if (mode === "none") return { ok: true, messages: [] };
  if (!CHECKABLE.has(sample.language)) {
    return { ok: false, messages: [`${sample.language} 예제는 ${mode} 검증을 지원하지 않습니다(verify: "none"을 쓰세요)`] };
  }
  if (mode === "types" && sample.language !== "json") return typeCheck(id, code, sample.language);
  return syntaxCheck(code, sample.language);
}
