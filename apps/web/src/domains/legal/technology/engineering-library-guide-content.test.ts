import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { LIBRARY_GUIDE_AREAS } from "./engineering-library-guide-content";
import { LIBRARY_GUIDE_OVERVIEW } from "./engineering-library-guide-overview";
import {
  LIBRARY_KIND_LABELS,
  type LibraryCard,
  type LibraryGuideArea,
} from "./engineering-library-guide-types";
import { ENGINEERING_ATLAS_ENTRIES } from "./engineering-atlas-content";
import { validateEngineeringDiagram } from "./engineering-diagram-validate";
import { ENGINEERING_GLOSSARY } from "./engineering-glossary-content";
import { ENGINEERING_MAP_OPEN_SOURCE } from "./engineering-map-open-source";
import { repoPathExists } from "./engineering-repo-paths-test-kit";
import { ENGINEERING_STATUS_META } from "./engineering-story-content";
import { PUBLISHED_ENGINEERING_CHAPTERS } from "./engineering-story-published-content";

/**
 * 라이브러리 해설 계약 검사. 영역마다 같은 틀(질문·도식·설계 이유·라이브러리 카드)을 지키는지,
 * 경로·도감·챕터·용어가 실제로 있는지, 라이선스가 설치본과 같은지, 기술 지도와 어긋나지 않는지 확인한다.
 */

const HANGUL = /[ㄱ-ㆎ가-힣]/u;
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const BANNED_KO = ["업계 최초", "세계 최고", "최고 수준", "완벽", "무제한", "무조건", "압도"] as const;
const BANNED_EN = [/\bworld-class\b/iu, /\bbest-in-class\b/iu, /\bunlimited\b/iu, /\bflawless\b/iu, /\bunmatched\b/iu] as const;

/** 영역 id 와 순서는 고정이다(두 작성자가 서로 번호를 맞추기 위해). */
const AREA_IDS = [
  "brush-engines",
  "vrm-3d-characters",
  "canvas-2d-virtual-studio",
  "collab-realtime",
  "local-storage-pwa",
  "ai-on-device",
  "server-data",
  "build-quality-media",
] as const;

/** 사용자가 이 페이지에서 꼭 보고 싶다고 한 것(VRM·브러시 엔진 등)과 핵심 축. 카드 이름에 이 문자열이 들어 있어야 한다. */
const REQUIRED_NAMES = ["Hokusai", "Vello", "three-vrm", "three.js", "Yjs", "ONNX Runtime Web", "SQLite WASM", "NestJS", "Vite"] as const;

interface LocalizedHit {
  readonly where: string;
  readonly ko: string;
  readonly en: string;
}

function collectLocalized(value: unknown, where: string, out: LocalizedHit[] = []): LocalizedHit[] {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectLocalized(item, `${where}[${index}]`, out));
  } else if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.ko === "string" && typeof record.en === "string" && Object.keys(record).length === 2) {
      out.push({ where, ko: record.ko, en: record.en });
    } else {
      for (const [key, child] of Object.entries(record)) collectLocalized(child, `${where}.${key}`, out);
    }
  }
  return out;
}

const repoPath = (value: string): string => value.split("#", 1)[0] as string;
const atlasIds = new Set<string>(ENGINEERING_ATLAS_ENTRIES.map((entry) => entry.id));
const atlasCategoryById = new Map(ENGINEERING_ATLAS_ENTRIES.map((entry) => [entry.id, entry.category]));
const chapterIds = new Set<string>(PUBLISHED_ENGINEERING_CHAPTERS.map((chapter) => chapter.id));
const glossaryIds = new Set<string>(ENGINEERING_GLOSSARY.map((term) => term.id));
const statuses = new Set<string>(Object.keys(ENGINEERING_STATUS_META));
const mapRows = new Map(ENGINEERING_MAP_OPEN_SOURCE.rows.map((row) => [row.id, row]));

/** 워크스페이스(루트·apps·packages)의 package.json 이 직접 선언한 의존성 이름. */
function declaredDependencies(): ReadonlySet<string> {
  const manifests = ["package.json"];
  for (const group of ["apps", "packages"]) {
    if (!existsSync(group)) continue;
    for (const dir of readdirSync(group)) manifests.push(join(group, dir, "package.json"));
  }
  const names = new Set<string>();
  for (const manifest of manifests) {
    if (!existsSync(manifest)) continue;
    const json = JSON.parse(readFileSync(manifest, "utf8")) as Record<string, unknown>;
    for (const key of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
      const group = json[key];
      if (group && typeof group === "object") for (const name of Object.keys(group)) names.add(name);
    }
  }
  return names;
}

/** 설치본(`node_modules` 또는 pnpm 저장소)의 package.json 위치. */
function installedManifest(pkg: string): string | undefined {
  for (const root of ["apps/web/node_modules", "node_modules", "apps/api/node_modules"]) {
    const file = join(root, pkg, "package.json");
    if (existsSync(file)) return file;
  }
  const store = "node_modules/.pnpm";
  if (!existsSync(store)) return undefined;
  const prefix = `${pkg.replace("/", "+")}@`;
  const dir = readdirSync(store).find((name) => name.startsWith(prefix));
  if (!dir) return undefined;
  const file = join(store, dir, "node_modules", pkg, "package.json");
  return existsSync(file) ? file : undefined;
}

function installedLicense(pkg: string): string | undefined {
  const file = installedManifest(pkg);
  if (!file) return undefined;
  const json = JSON.parse(readFileSync(file, "utf8")) as { license?: unknown; licenses?: unknown };
  if (typeof json.license === "string") return json.license;
  if (json.license && typeof json.license === "object" && "type" in json.license) return String((json.license as { type: unknown }).type);
  if (Array.isArray(json.licenses)) return json.licenses.map((entry) => String((entry as { type?: unknown }).type)).join(" OR ");
  return undefined;
}

const normalizeLicense = (value: string): string => value.replace(/[()\s]/gu, "").toLowerCase();
const DECLARED = declaredDependencies();

function problemsOfLocalized(root: unknown, id: string): string[] {
  const problems: string[] = [];
  for (const hit of collectLocalized(root, id)) {
    if (!hit.ko.trim()) problems.push(`${hit.where}: 한국어가 비어 있음`);
    if (!hit.en.trim()) problems.push(`${hit.where}: 영어가 비어 있음`);
    if (hit.ko !== hit.ko.trim() || hit.en !== hit.en.trim()) problems.push(`${hit.where}: 앞뒤 공백`);
    if (HANGUL.test(hit.en)) problems.push(`${hit.where}: 영어 문장에 한글이 섞임 ("${hit.en.slice(0, 40)}")`);
    if (hit.ko.length >= 14 && !HANGUL.test(hit.ko) && /(?:\b[a-z]{2,}\b\s+){3,}\b[a-z]{2,}\b/u.test(hit.ko)) {
      problems.push(`${hit.where}: 한국어 칸이 번역되지 않은 듯함 ("${hit.ko.slice(0, 40)}")`);
    }
    for (const word of BANNED_KO) if (hit.ko.includes(word)) problems.push(`${hit.where}: 과장 표현 "${word}"`);
    for (const pattern of BANNED_EN) if (pattern.test(hit.en)) problems.push(`${hit.where}: 영어 과장 표현 ${pattern}`);
    if (/Neon/u.test(hit.ko) && !/legacy|레거시|보존/u.test(hit.ko)) problems.push(`${hit.where}: Neon 은 legacy 보존이라고 함께 써야 함`);
    if (/Neon/u.test(hit.en) && !/legacy|preserved|kept/iu.test(hit.en)) problems.push(`${hit.where}: Neon must be called legacy/preserved`);
  }
  return problems;
}

/** 라이브러리 카드 하나의 계약 위반 목록. */
function problemsOfCard(card: LibraryCard, areaId: string): string[] {
  const id = `${areaId}/${card.id}`;
  const problems: string[] = [];
  if (!KEBAB.test(card.id)) problems.push(`${id}: id는 소문자 kebab-case`);
  if (!card.name || card.name !== card.name.trim()) problems.push(`${id}: name 공백`);
  if (!(card.kind in LIBRARY_KIND_LABELS)) problems.push(`${id}: 알 수 없는 종류 ${card.kind}`);
  if (!statuses.has(card.status)) problems.push(`${id}: 알 수 없는 상태 ${card.status}`);
  if (card.oneLine.ko.length > 70) problems.push(`${id}: 한 줄 소개 ${card.oneLine.ko.length}자 > 70자`);
  if (card.usedFor.ko.length > 130) problems.push(`${id}: 하는 일 ${card.usedFor.ko.length}자 > 130자`);
  if (card.why.ko.length < 30 || card.why.ko.length > 220) problems.push(`${id}: 고른 이유 길이 ${card.why.ko.length}자(30~220)`);
  if (card.alternatives && card.alternatives.ko.length > 220) problems.push(`${id}: 대안 ${card.alternatives.ko.length}자 > 220자`);
  if (card.cost.ko.length > 170) problems.push(`${id}: 대가 ${card.cost.ko.length}자 > 170자`);
  if (card.paths.length < 1) problems.push(`${id}: 쓰이는 코드 경로 없음`);
  for (const path of card.paths) if (!repoPathExists(repoPath(path))) problems.push(`${id}: 존재하지 않는 경로 ${path}`);
  if (!card.license.trim()) problems.push(`${id}: 라이선스가 비어 있음`);

  if (card.package) {
    if (!DECLARED.has(card.package)) problems.push(`${id}: ${card.package} 는 워크스페이스 package.json 에 선언돼 있지 않음`);
    const license = installedLicense(card.package);
    if (license === undefined) problems.push(`${id}: ${card.package} 설치본을 찾지 못함(설치본이 없으면 package 를 빼고 licenseSource 를 쓴다)`);
    else if (normalizeLicense(license) !== normalizeLicense(card.license)) problems.push(`${id}: 라이선스 "${card.license}" ≠ 설치본 "${license}"`);
  } else if (card.kind !== "format" && card.kind !== "service" && !card.licenseSource) {
    problems.push(`${id}: package 가 없으면 licenseSource(라이선스 근거 파일)가 필요함`);
  }
  if (card.licenseSource && !repoPathExists(repoPath(card.licenseSource))) problems.push(`${id}: licenseSource 경로 없음 ${card.licenseSource}`);

  if (card.mapRowId) {
    const row = mapRows.get(card.mapRowId);
    if (!row) problems.push(`${id}: 없는 기술 지도 행 ${card.mapRowId}`);
    else {
      if (row.status !== card.status) problems.push(`${id}: 상태 "${card.status}" ≠ 지도 행 "${row.status}"`);
      const rowLicense = row.cells.license?.ko ?? "";
      if (rowLicense && !normalizeLicense(rowLicense).includes(normalizeLicense(card.license))) {
        problems.push(`${id}: 라이선스 "${card.license}" 가 지도 행의 "${rowLicense}" 에 없음`);
      }
    }
  }
  for (const atlasId of card.atlasIds ?? []) if (!atlasIds.has(atlasId)) problems.push(`${id}: 없는 도감 카드 ${atlasId}`);
  return problems;
}

/** 영역 하나의 계약 위반 목록. */
function problemsOfArea(area: LibraryGuideArea): string[] {
  const id = area.id;
  const problems: string[] = [...problemsOfLocalized(area, id)];
  if (!KEBAB.test(id)) problems.push(`${id}: id는 소문자 kebab-case`);
  if (!statuses.has(area.status)) problems.push(`${id}: 알 수 없는 상태 ${area.status}`);
  if (area.title.ko.length > 24) problems.push(`${id}: 제목 ${area.title.ko.length}자 > 24자`);
  if (area.question.ko.length > 60) problems.push(`${id}: 질문 ${area.question.ko.length}자 > 60자`);
  if (!area.question.ko.trim().endsWith("?")) problems.push(`${id}: 질문은 물음표로 끝남`);
  if (area.oneLine.ko.length > 90) problems.push(`${id}: 한 줄 요약 ${area.oneLine.ko.length}자 > 90자`);
  if (area.easy.ko.length < 30 || area.easy.ko.length > 260) problems.push(`${id}: 쉬운 비유 길이 ${area.easy.ko.length}자(30~260)`);
  if (area.designWhy.length < 2 || area.designWhy.length > 4) problems.push(`${id}: 설계 이유는 2~4개 (현재 ${area.designWhy.length})`);
  for (const choice of area.designWhy) {
    if (choice.title.ko.length > 30) problems.push(`${id}: 설계 이유 제목 ${choice.title.ko.length}자 > 30자`);
    if (choice.body.ko.length < 40 || choice.body.ko.length > 240) problems.push(`${id}: 설계 이유 본문 ${choice.body.ko.length}자(40~240)`);
  }
  if (area.libraries.length < 3 || area.libraries.length > 8) problems.push(`${id}: 라이브러리는 3~8개 (현재 ${area.libraries.length})`);
  if (area.pitfall && area.pitfall.ko.length > 220) problems.push(`${id}: 오해하기 쉬운 점 ${area.pitfall.ko.length}자 > 220자`);
  for (const card of area.libraries) problems.push(...problemsOfCard(card, id));

  if (area.atlasIds.length < 1) problems.push(`${id}: 연결된 도감 카드가 없음`);
  for (const atlasId of area.atlasIds) if (!atlasIds.has(atlasId)) problems.push(`${id}: 없는 도감 카드 ${atlasId}`);
  if (area.chapterIds.length < 1) problems.push(`${id}: 연결된 제작 스토리 챕터가 없음`);
  for (const chapterId of area.chapterIds) if (!chapterIds.has(chapterId)) problems.push(`${id}: 없는 챕터 ${chapterId}`);
  if (area.glossaryIds.length < 1) problems.push(`${id}: 연결된 용어가 없음`);
  for (const termId of area.glossaryIds) if (!glossaryIds.has(termId)) problems.push(`${id}: 없는 용어 ${termId}`);

  if (area.diagram.id !== `${id}-diagram`) problems.push(`${id}: 도식 id는 "${id}-diagram" (현재 ${area.diagram.id})`);
  for (const problem of validateEngineeringDiagram(area.diagram)) problems.push(`${id}/diagram: ${problem}`);
  return problems;
}

describe("라이브러리 해설 영역", () => {
  it("영역 id 와 번호는 고정된 순서로 1부터 끊김 없이 이어진다", () => {
    expect(LIBRARY_GUIDE_AREAS.map((area) => area.id)).toEqual([...AREA_IDS]);
    expect(LIBRARY_GUIDE_AREAS.map((area) => area.number)).toEqual(LIBRARY_GUIDE_AREAS.map((_, index) => index + 1));
  });

  it.each(LIBRARY_GUIDE_AREAS.map((area) => [area.id, area] as const))("%s 영역은 계약을 지킨다", (_id, area) => {
    expect(problemsOfArea(area)).toEqual([]);
  });

  it("라이브러리 카드 id 는 페이지 전체에서 고유하고 총 28~64개다", () => {
    const ids = LIBRARY_GUIDE_AREAS.flatMap((area) => area.libraries.map((card) => card.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(28);
    expect(ids.length).toBeLessThanOrEqual(64);
  });

  it("사용자가 꼭 보고 싶다고 한 라이브러리(VRM·브러시 엔진 등)와 핵심 축이 빠지지 않는다", () => {
    const names = LIBRARY_GUIDE_AREAS.flatMap((area) => area.libraries.map((card) => card.name.toLowerCase()));
    for (const required of REQUIRED_NAMES) {
      expect(names.some((name) => name.includes(required.toLowerCase())), required).toBe(true);
    }
  });

  it("도식은 그래프와 계층을 섞어 쓴다(각각 2개 이상)", () => {
    const count = (kind: string) => LIBRARY_GUIDE_AREAS.filter((area) => area.diagram.kind === kind).length;
    expect(count("graph")).toBeGreaterThanOrEqual(2);
    expect(count("layers")).toBeGreaterThanOrEqual(2);
  });

  it("연결한 도감 카드가 도감의 여러 분야에 걸친다(6개 분야 이상)", () => {
    const categories = new Set(
      LIBRARY_GUIDE_AREAS.flatMap((area) => [
        ...area.atlasIds,
        ...area.libraries.flatMap((card) => card.atlasIds ?? []),
      ]).map((id) => atlasCategoryById.get(id)).filter(Boolean),
    );
    expect(categories.size).toBeGreaterThanOrEqual(6);
  });

  it("카드의 기술 지도 행 연결이 오픈소스 지도의 절반 이상 행을 가리킨다", () => {
    const referenced = new Set(LIBRARY_GUIDE_AREAS.flatMap((area) => area.libraries.map((card) => card.mapRowId)).filter(Boolean));
    expect(referenced.size).toBeGreaterThanOrEqual(Math.ceil(mapRows.size / 2));
  });
});

describe("라이브러리 해설 한 장 요약", () => {
  it("전체 스택 도식·고르는 원칙·읽는 법이 계약을 지킨다", () => {
    const overview = LIBRARY_GUIDE_OVERVIEW;
    expect(problemsOfLocalized(overview, "overview")).toEqual([]);
    expect(overview.diagram.id).toBe("library-overview-diagram");
    expect(validateEngineeringDiagram(overview.diagram)).toEqual([]);
    expect(overview.principles.length).toBeGreaterThanOrEqual(4);
    expect(overview.principles.length).toBeLessThanOrEqual(6);
    for (const principle of overview.principles) {
      expect(principle.title.ko.length).toBeLessThanOrEqual(30);
      expect(principle.body.ko.length).toBeLessThanOrEqual(180);
    }
    expect(overview.howToRead.length).toBeGreaterThanOrEqual(3);
    expect(overview.howToRead.length).toBeLessThanOrEqual(4);
  });
});

describe("계약 검사기", () => {
  it("위반을 구체적으로 알려준다", () => {
    const area = LIBRARY_GUIDE_AREAS[0];
    const card = area?.libraries[0];
    if (!area || !card) throw new Error("검사할 영역이 없음");
    const broken: LibraryCard = {
      ...card,
      id: "Bad_Id",
      oneLine: { ko: "완벽한 한 줄", en: "한글이 섞인 영어" },
      paths: ["no/such/file.ts"],
      package: "no-such-package-xyz",
      mapRowId: "no-such-row",
      atlasIds: ["no-such-card"],
    };
    const problems = problemsOfCard(broken, area.id).join("\n");
    expect(problems).toContain("id는 소문자 kebab-case");
    expect(problems).toContain("존재하지 않는 경로 no/such/file.ts");
    expect(problems).toContain("선언돼 있지 않음");
    expect(problems).toContain("없는 기술 지도 행 no-such-row");
    expect(problems).toContain("없는 도감 카드 no-such-card");
    expect(problemsOfLocalized(broken, "x").join("\n")).toContain('과장 표현 "완벽"');
  });
});
