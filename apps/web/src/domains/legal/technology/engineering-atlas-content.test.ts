import { describe, expect, it } from "vitest";

import { ENGINEERING_ATLAS_ENTRIES } from "./engineering-atlas-content";
import { FIXTURE_ATLAS_BUDGET, FIXTURE_ATLAS_OPFS } from "./engineering-atlas.fixtures";
import {
  ENGINEERING_ATLAS_CATEGORIES,
  type EngineeringAtlasEntry,
} from "./engineering-atlas-types";
import { validateEngineeringDiagram } from "./engineering-diagram-validate";
import { repoPathExists } from "./engineering-repo-paths-test-kit";
import { PUBLISHED_ENGINEERING_CHAPTERS } from "./engineering-story-published-content";

/**
 * 도감 카드 계약 검사. 같은 검사를 실제 카드와 예시 카드(fixtures)에 적용해,
 * 검사기가 위반을 실제로 잡아내는지도 함께 확인한다.
 */

const HANGUL = /[ㄱ-ㆎ가-힣]/u;
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const SECRET_PATTERNS: readonly RegExp[] = [
  /sk-[A-Za-z0-9]{12,}/u,
  /AKIA[0-9A-Z]{12,}/u,
  /ghp_[A-Za-z0-9]{20,}/u,
  /xox[abprs]-[A-Za-z0-9-]{10,}/u,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/u,
  /\b(?:api[_-]?key|secret|token|password)\s*[:=]\s*["'][^"'$\s{][^"']{7,}["']/iu,
  /Bearer\s+[A-Za-z0-9._-]{20,}/u,
];
const BANNED_HOSTS = new Set(["example.com", "example.org", "localhost", "127.0.0.1", "foo.com", "your-domain.com"]);

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
const chapterIds = new Set<string>(PUBLISHED_ENGINEERING_CHAPTERS.map((chapter) => chapter.id));
const lineCount = (code: string): number => code.replace(/\n+$/u, "").split("\n").length;

/** 카드 하나의 계약 위반 목록. 비어 있으면 통과. */
function problemsOfAtlasEntry(entry: EngineeringAtlasEntry): string[] {
  const problems: string[] = [];
  const id = entry.id;
  if (!KEBAB.test(id)) problems.push(`${id}: id는 소문자 kebab-case`);
  if (!ENGINEERING_ATLAS_CATEGORIES.some((category) => category.id === entry.category)) problems.push(`${id}: 알 수 없는 카테고리 ${entry.category}`);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(entry.reviewedAt)) problems.push(`${id}: reviewedAt 형식`);
  if (entry.name.trim() !== entry.name || !entry.name) problems.push(`${id}: name 공백`);

  for (const hit of collectLocalized(entry, id)) {
    if (!hit.ko.trim()) problems.push(`${hit.where}: 한국어가 비어 있음`);
    if (!hit.en.trim()) problems.push(`${hit.where}: 영어가 비어 있음`);
    if (hit.ko !== hit.ko.trim() || hit.en !== hit.en.trim()) problems.push(`${hit.where}: 앞뒤 공백`);
    if (HANGUL.test(hit.en)) problems.push(`${hit.where}: 영어 문장에 한글이 섞임 ("${hit.en.slice(0, 40)}")`);
    // 고유명사·기술 이름은 한국어 칸에도 영문 그대로 쓴다. 영어 문장(소문자 단어가 4개 이상 이어짐)만 번역 누락으로 본다.
    if (hit.ko.length >= 14 && !HANGUL.test(hit.ko) && /(?:\b[a-z]{2,}\b\s+){3,}\b[a-z]{2,}\b/u.test(hit.ko)) {
      problems.push(`${hit.where}: 한국어 칸이 번역되지 않은 듯함 ("${hit.ko.slice(0, 40)}")`);
    }
  }

  if (entry.tagline.ko.length > 90) problems.push(`${id}: tagline ${entry.tagline.ko.length}자 > 90자`);
  if (entry.tagline.ko.includes("\n") || entry.title.ko.includes("\n")) problems.push(`${id}: 제목·한 줄 정의에 줄바꿈`);
  if (entry.background.length < 2 || entry.background.length > 4) problems.push(`${id}: 배경 지식 문단은 2~4개 (현재 ${entry.background.length})`);
  for (const paragraph of entry.background) {
    if (paragraph.ko.length < 40 || paragraph.ko.length > 520) problems.push(`${id}: 배경 문단 길이 ${paragraph.ko.length}자(40~520)`);
  }
  if (entry.keyPoints.length < 2 || entry.keyPoints.length > 4) problems.push(`${id}: 핵심 요점은 2~4개`);
  for (const point of entry.keyPoints) if (point.ko.length > 64) problems.push(`${id}: 핵심 요점 ${point.ko.length}자 > 64자`);
  if (entry.usage.length < 1 || entry.usage.length > 4) problems.push(`${id}: 쓰인 곳은 1~4개`);
  for (const usage of entry.usage) {
    if (usage.paths.length < 1) problems.push(`${id}: 쓰인 곳 "${usage.feature.ko}"에 근거 경로 없음`);
    for (const path of usage.paths) if (!repoPathExists(repoPath(path))) problems.push(`${id}: 존재하지 않는 경로 ${path}`);
    if (usage.route && !usage.route.startsWith("/")) problems.push(`${id}: route는 /로 시작`);
  }
  for (const fact of entry.facts ?? []) if (!repoPathExists(repoPath(fact.source))) problems.push(`${id}: fact 근거 경로 없음 ${fact.source}`);

  if (entry.samples.length < 1 || entry.samples.length > 2) problems.push(`${id}: 샘플 코드는 1~2개`);
  for (const [index, sample] of entry.samples.entries()) {
    const lines = lineCount(sample.code);
    if (lines < 3 || lines > 30) problems.push(`${id}: 샘플 ${index + 1}은 3~30줄(현재 ${lines}줄)`);
    if (sample.codeEn && lineCount(sample.codeEn) !== lines) problems.push(`${id}: 샘플 ${index + 1}의 codeEn 줄 수가 code 와 다름`);
    if (sample.kind === "simplified" && !sample.source) problems.push(`${id}: simplified 샘플은 source 경로 필요`);
    if (sample.source && !repoPathExists(repoPath(sample.source))) problems.push(`${id}: 샘플 source 경로 없음 ${sample.source}`);
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(sample.code) || (sample.codeEn && pattern.test(sample.codeEn))) problems.push(`${id}: 샘플 ${index + 1}에 비밀값처럼 보이는 문자열 (${pattern})`);
    }
  }

  if (entry.links.length < 2 || entry.links.length > 6) problems.push(`${id}: 참고 링크는 2~6개`);
  const urls = new Set<string>();
  for (const link of entry.links) {
    if (!link.title.trim()) problems.push(`${id}: 링크 제목 없음`);
    if (urls.has(link.url)) problems.push(`${id}: 중복 링크 ${link.url}`);
    urls.add(link.url);
    try {
      const url = new URL(link.url);
      if (url.protocol !== "https:") problems.push(`${id}: https 아님 ${link.url}`);
      if (BANNED_HOSTS.has(url.hostname)) problems.push(`${id}: 예시/로컬 주소 ${link.url}`);
    } catch {
      problems.push(`${id}: 잘못된 URL ${link.url}`);
    }
    if (/\s/u.test(link.url) || /[.,;)]$/u.test(link.url)) problems.push(`${id}: URL 형식 의심 ${link.url}`);
  }

  if (entry.chapterIds.length < 1) problems.push(`${id}: 연결된 제작 스토리 챕터가 없음`);
  for (const chapterId of entry.chapterIds) if (!chapterIds.has(chapterId)) problems.push(`${id}: 없는 챕터 ${chapterId}`);
  if (entry.technologies.length < 1) problems.push(`${id}: technologies 비어 있음`);
  if (entry.talk.questions.length < 1) problems.push(`${id}: 예상 질문이 없음`);
  for (const problem of validateEngineeringDiagram(entry.diagram)) problems.push(`${id}/diagram: ${problem}`);
  return problems;
}

describe("도감 카드 검사기", () => {
  it("예시 카드는 계약을 지킨다", () => {
    expect(problemsOfAtlasEntry(FIXTURE_ATLAS_OPFS)).toEqual([]);
    expect(problemsOfAtlasEntry(FIXTURE_ATLAS_BUDGET)).toEqual([]);
  });

  it("위반을 구체적으로 알려준다", () => {
    const broken: EngineeringAtlasEntry = {
      ...FIXTURE_ATLAS_OPFS,
      id: "Bad_Id",
      tagline: { ko: "한 줄", en: "한글이 섞인 영어" },
      usage: [{ ...(FIXTURE_ATLAS_OPFS.usage[0] as EngineeringAtlasEntry["usage"][number]), paths: ["no/such/file.ts"] }],
      links: [{ title: "x", url: "http://example.com/a", kind: "docs" }],
      chapterIds: ["not-a-chapter"],
      samples: [{ ...(FIXTURE_ATLAS_OPFS.samples[0] as EngineeringAtlasEntry["samples"][number]), code: "const apiKey = 'abcdefghijk';" }],
    };
    const problems = problemsOfAtlasEntry(broken).join("\n");
    expect(problems).toContain("kebab-case");
    expect(problems).toContain("한글이 섞임");
    expect(problems).toContain("존재하지 않는 경로");
    expect(problems).toContain("https 아님");
    expect(problems).toContain("없는 챕터");
    expect(problems).toContain("비밀값");
    expect(problems).toContain("참고 링크는 2~6개");
  });
});

describe("게시된 기술 도감", () => {
  it("모든 카드가 계약을 지킨다", () => {
    const problems = ENGINEERING_ATLAS_ENTRIES.flatMap(problemsOfAtlasEntry);
    expect(problems).toEqual([]);
  });

  it("카드 id와 도식 id는 전체에서 고유하다", () => {
    const ids = ENGINEERING_ATLAS_ENTRIES.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    const diagramIds = ENGINEERING_ATLAS_ENTRIES.map((entry) => entry.diagram.id);
    expect(new Set(diagramIds).size).toBe(diagramIds.length);
  });

  it("모든 카테고리에 카드가 있고, 상태는 코드로 확인한 값만 쓴다", () => {
    for (const category of ENGINEERING_ATLAS_CATEGORIES) {
      expect(
        ENGINEERING_ATLAS_ENTRIES.filter((entry) => entry.category === category.id).length,
        category.id,
      ).toBeGreaterThanOrEqual(ENGINEERING_ATLAS_ENTRIES.length === 0 ? 0 : 4);
    }
    for (const entry of ENGINEERING_ATLAS_ENTRIES) expect(["retired"], entry.id).not.toContain(entry.status);
  });

  it("도식 종류가 한 가지로 쏠리지 않는다(graph·sequence·layers를 함께 쓴다)", () => {
    if (ENGINEERING_ATLAS_ENTRIES.length < 20) return;
    const kinds = new Set(ENGINEERING_ATLAS_ENTRIES.map((entry) => entry.diagram.kind));
    expect(kinds).toEqual(new Set(["graph", "sequence", "layers"]));
  });
});
