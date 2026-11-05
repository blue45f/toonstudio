import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const digest = (text) => createHash("sha256").update(text).digest("hex");

/** 진단 체인과 관련 위치를 보존하고 SourceFile AST 자체는 프로세스 밖으로 보내지 않는다. */
export function serializeDiagnostic(diagnostic) {
  const record = {
    code: diagnostic.code,
    category: diagnostic.category,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
  };
  if (diagnostic.file) record.file = resolve(diagnostic.file.fileName);
  if (diagnostic.start !== undefined) {
    record.start = diagnostic.start;
    if (diagnostic.file) {
      const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
      record.line = position.line + 1;
      record.column = position.character + 1;
    }
  }
  if (diagnostic.length !== undefined) record.length = diagnostic.length;
  if (diagnostic.relatedInformation?.length) {
    record.relatedInformation = diagnostic.relatedInformation.map(serializeDiagnostic);
  }
  return record;
}

export function loadFullProgram(project, cwd) {
  const reads = new Map();
  const read = (path) => {
    const text = ts.sys.readFile(path);
    if (text !== undefined) reads.set(resolve(path), digest(text));
    return text;
  };
  const loaded = ts.readConfigFile(project, read);
  const parseHost = { ...ts.sys, readFile: read };
  const parsed = ts.parseJsonConfigFileContent(loaded.config ?? {}, parseHost, dirname(project), undefined, project);
  if (loaded.error) parsed.errors.unshift(loaded.error);
  // CLI와 같은 기본 parent-node 생성 정책을 사용한다. 바인더가 필요한 부모를 설정한다.
  const host = ts.createCompilerHost(parsed.options);
  // getSourceFile는 생성 당시 host.readFile을 호출한다. 모든 읽기 입력의 해시를 보존한다.
  host.readFile = read;
  host.getCurrentDirectory = () => cwd;
  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
    projectReferences: parsed.projectReferences,
    configFileParsingDiagnostics: parsed.errors,
    host,
  });
  const files = program.getSourceFiles().map((file) => ({
    path: resolve(file.fileName),
    bytes: Buffer.byteLength(file.text),
    sha256: digest(file.text),
    declaration: file.isDeclarationFile,
    defaultLibrary: program.isSourceFileDefaultLibrary(file),
  })).sort((left, right) => left.path.localeCompare(right.path, "en"));
  const options = { ...parsed.options };
  delete options.configFile;
  const inputs = [...reads].sort(([left], [right]) => left.localeCompare(right, "en"));
  const identity = {
    version: ts.version,
    cwd,
    project,
    roots: [...parsed.fileNames].map((file) => resolve(file)).sort(),
    options,
    references: parsed.projectReferences ?? [],
    files,
    inputs,
  };
  return { program, identity, fingerprint: digest(JSON.stringify(identity)) };
}

function assertReadOnlyMode(options) {
  if (options.noEmit !== true || options.incremental || options.composite
    || options.declaration || options.emitDeclarationOnly) {
    throw new Error("이 검증기는 noEmit:true, incremental/composite/declaration 비활성 프로젝트 전용입니다. 기존 tsc로 해당 프로젝트를 검사하세요.");
  }
}

/** CLI noEmit의 진단 단계 순서를 유지한다. 구문 오류 때 의미 검사를 통과했다고 기록하지 않는다. */
export function preflightDiagnostics(program) {
  const diagnostics = [...program.getConfigFileParsingDiagnostics()];
  const configCount = diagnostics.length;
  diagnostics.push(...program.getSyntacticDiagnostics());
  if (diagnostics.length === configCount) {
    diagnostics.push(...program.getOptionsDiagnostics(), ...program.getGlobalDiagnostics());
  }
  return {
    diagnostics: ts.sortAndDeduplicateDiagnostics(diagnostics).map(serializeDiagnostic),
    semanticAllowed: diagnostics.length === configCount,
  };
}

export function runWorker(job) {
  const started = Date.now();
  const loaded = loadFullProgram(resolve(job.project), resolve(job.cwd));
  const { program, identity, fingerprint } = loaded;
  assertReadOnlyMode(program.getCompilerOptions());
  if (job.fingerprint && fingerprint !== job.fingerprint) {
    throw new Error("검사 중 프로젝트 입력이 바뀌었습니다. 모든 파일이 고정된 상태에서 전체 검증을 다시 실행하세요.");
  }
  let result;
  if (job.phase === "inventory") result = { identity, fingerprint };
  else if (job.phase === "preflight") result = { fingerprint, ...preflightDiagnostics(program) };
  else if (job.phase === "semantic") {
    const files = new Map(program.getSourceFiles().map((file) => [resolve(file.fileName), file]));
    const checked = [];
    const diagnostics = [];
    for (const path of job.files) {
      const source = files.get(path);
      if (!source) throw new Error(`전체 프로그램에 없는 검사 파일: ${path}`);
      // 파일 없는 지연 global 진단도 반환될 수 있어 진단을 파일명으로 필터링하지 않는다.
      diagnostics.push(...program.getSemanticDiagnostics(source));
      checked.push(path);
    }
    diagnostics.push(...program.getGlobalDiagnostics());
    result = { fingerprint, checked, diagnostics: ts.sortAndDeduplicateDiagnostics(diagnostics).map(serializeDiagnostic) };
  } else throw new Error(`알 수 없는 worker 단계: ${job.phase}`);
  return { ...result, elapsedMs: Date.now() - started, peakRssBytes: process.resourceUsage().maxRSS * 1024 };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const job = JSON.parse(readFileSync(process.argv[2], "utf8"));
    const result = runWorker(job);
    writeFileSync(job.output, `${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`전체 타입 검사 worker 실패: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}
