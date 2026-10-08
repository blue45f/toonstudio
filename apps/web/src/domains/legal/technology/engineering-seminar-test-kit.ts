import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { findAtlasEntry } from "./engineering-atlas-content";
import { ENGINEERING_MAPS } from "./engineering-map-content";
import { repoPathExists } from "./engineering-repo-paths-test-kit";

/**
 * 세미나 레슨·준비실 질문 콘텐츠 테스트(engineering-seminar-lessons.test.ts, engineering-seminar-prep.test.ts)가
 * 함께 쓰는 보조 함수. 대본과 답변에 쓴 수치·파일을 코드·설정·문서 원본과 대조하는 데 필요한 읽기 도구만 담는다.
 * 테스트 밖에서는 쓰지 않는다.
 *
 * 부분 체크아웃(sparse-checkout) 규칙: CI 의 부분 체크아웃은 docs/·큰 에셋 폴더를 작업 트리에 내려받지 않을 수 있다.
 * - 경로가 저장소에 있는지는 `repoExists`(작업 트리에 없어도 git 이 추적하면 통과)로만 본다. `existsSync` 로 보지 않는다.
 * - docs/ 같은 문서 폴더의 내용은 `readIfPresent` 로 읽어, 내려받은 환경에서만 대조한다(없으면 null).
 *   대본·답변의 문구를 지키는 1차 근거는 코드·설정·도감·지도(apps/·packages/ 안)에 두고, 문서 대조는 보조로만 쓴다.
 */

const ROOT = fileURLToPath(new URL("../../../../../../", import.meta.url));
/** 다른 앱 소스 경로를 한 덩어리 문자열로 적으면 앱 경계 래칫(validate-app-boundaries)이 교차 참조로 세므로 조각으로 잇는다. */
export const repo = (...segments: string[]): string => path.join(ROOT, ...segments);
export const readText = (...segments: string[]): string => readFileSync(repo(...segments), "utf8");
/** 줄바꿈과 들여쓰기를 한 칸으로 줄인 본문(여러 줄에 걸친 문장 대조용). */
export const flat = (...segments: string[]): string => readText(...segments).replace(/\s+/gu, " ");

export const HANGUL = /[ㄱ-ㆎ가-힣]/u;

export function sentencesOf(text: string): readonly string[] {
  return text.split(/(?<=[.!?])\s+/u).map((part) => part.trim()).filter(Boolean);
}

/** 마침표·물음표·느낌표 뒤에 공백이나 끝이 오는 횟수. 파일명(`a.md`)·버전(`2.0`)의 점은 세지 않는다. */
export function sentenceCount(text: string): number {
  return (text.match(/[.!?](?=\s|$)/gu) ?? []).length;
}

export function countMatches(text: string, pattern: RegExp): number {
  return (text.match(pattern) ?? []).length;
}

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "coverage", "target", ".turbo"]);

export function walkFiles(directory: string, visit: (file: string) => void): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walkFiles(full, visit);
    } else if (entry.isFile()) {
      visit(full);
    }
  }
}

let basenameIndex: ReadonlyMap<string, readonly string[]> | undefined;

/** 대본이 이름만 적은 파일(예: `studio-update-safety.ts`)을 저장소에서 찾는 색인. 한 번만 만든다. */
export function fileIndex(): ReadonlyMap<string, readonly string[]> {
  if (basenameIndex) return basenameIndex;
  const index = new Map<string, string[]>();
  // docs/·큰 에셋 폴더는 부분 체크아웃에서 빠질 수 있어 색인에 넣지 않는다(문서 파일은 전체 경로로 repoExists 가 본다).
  const roots = [
    ["apps", "web", "src"], ["apps", "web", "public", "brand"], ["apps", "api", "src"], ["packages"], ["scripts"], ["config"], ["deploy"], ["crates"], ["onnx-poc"],
  ];
  for (const segments of roots) {
    const directory = repo(...segments);
    if (!existsSync(directory)) continue;
    walkFiles(directory, (file) => {
      const name = path.basename(file);
      index.set(name, [...(index.get(name) ?? []), path.relative(ROOT, file)]);
    });
  }
  basenameIndex = index;
  return index;
}

/** 저장소 루트 기준 경로(조각으로 받는다)가 저장소에 있는지. 작업 트리에 없어도 git 이 추적하면 있다고 본다. */
export function repoExists(...segments: string[]): boolean {
  return repoPathExists(segments.join("/"));
}

/** 작업 트리에 내려받은 파일만 읽는다(부분 체크아웃으로 없으면 null). 있을 때만 내용을 대조하는 데 쓴다. */
export function readIfPresent(...segments: string[]): string | null {
  const file = repo(...segments);
  return existsSync(file) ? readFileSync(file, "utf8") : null;
}

/** 파일 이름이 저장소 어딘가(또는 저장소 루트)에 실제로 있는지. 경로가 있으면 그 경로를 그대로 본다. */
export function repoFileExists(name: string): boolean {
  const cleaned = name.replace(/^\.\//u, "");
  if (cleaned.includes("/")) return repoPathExists(cleaned);
  return repoPathExists(cleaned) || fileIndex().has(cleaned);
}

/** 웹 앱 소스(테스트·기술 소개 콘텐츠 제외)에서 패턴이 들어 있는 파일 목록. 한 번 훑으며 모든 패턴을 함께 센다. */
export function scanWebSources<K extends string>(needles: Readonly<Record<K, RegExp>>): Readonly<Record<K, readonly string[]>> {
  const keys = Object.keys(needles) as K[];
  const found = Object.fromEntries(keys.map((key) => [key, [] as string[]])) as Record<K, string[]>;
  walkFiles(repo("apps", "web", "src"), (file) => {
    if (!/\.tsx?$/u.test(file) || /\.(?:test|spec)\.tsx?$/u.test(file) || file.includes(`${path.sep}__tests__${path.sep}`) || file.includes(`${path.sep}technology${path.sep}`)) return;
    const text = readFileSync(file, "utf8");
    for (const key of keys) if (needles[key].test(text)) found[key].push(path.relative(ROOT, file));
  });
  return found;
}

export function patchedDependencyCount(): number {
  const lines = readText("pnpm-workspace.yaml").split("\n");
  const start = lines.findIndex((line) => line.startsWith("patchedDependencies:"));
  let count = 0;
  for (const line of lines.slice(start + 1)) {
    if (/^\S/u.test(line)) break;
    if (/^\s+\S.*:\s+patches\//u.test(line)) count += 1;
  }
  return count;
}

/** 저장소 루트 package.json 의 의존성 이름(웹 앱에는 자기 package.json 이 없다). */
export function dependencyNames(): readonly string[] {
  const manifest = JSON.parse(readText("package.json")) as { readonly dependencies?: Record<string, string>; readonly devDependencies?: Record<string, string> };
  return [...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.devDependencies ?? {})];
}

export function onnxModelFiles(): readonly { readonly name: string; readonly bytes: number }[] {
  const directory = repo("apps", "web", "src", "domains", "creator", "assets");
  return readdirSync(directory)
    .filter((name) => name.endsWith(".onnx"))
    .map((name) => ({ name, bytes: statSync(path.join(directory, name)).size }));
}

/** 도감 카드 한 장의 글(제목·본문·질문·답변)을 하나의 문자열로 모아 문구가 있는지 본다. */
export function cardText(id: string): string {
  const entry = findAtlasEntry(id);
  if (!entry) throw new Error(`도감 카드가 없습니다: ${id}`);
  return JSON.stringify(entry);
}

/** 기술 지도 한 장(제목·열·행·메모)의 글을 하나의 문자열로 모은다. 문서(docs/) 대신 지도에 적힌 사실을 대조하는 데 쓴다. */
export function mapText(id: string): string {
  const map = ENGINEERING_MAPS.find((candidate) => candidate.id === id);
  if (!map) throw new Error(`기술 지도가 없습니다: ${id}`);
  return JSON.stringify(map);
}
