import { describe, expect, it } from "vitest";

import { ARCHITECTURE_GUIDE_SECTIONS } from "./engineering-architecture-guide-content";
import { ARCHITECTURE_GUIDE_OVERVIEW } from "./engineering-architecture-guide-overview";
import {
  ARCHITECTURE_GUIDE_GROUPS,
  type ArchitectureGuideSection,
} from "./engineering-architecture-guide-types";
import { ENGINEERING_ATLAS_ENTRIES } from "./engineering-atlas-content";
import { validateEngineeringDiagram } from "./engineering-diagram-validate";
import { ENGINEERING_GLOSSARY } from "./engineering-glossary-content";
import { repoPathExists } from "./engineering-repo-paths-test-kit";
import { ENGINEERING_STATUS_META } from "./engineering-story-content";
import { PUBLISHED_ENGINEERING_CHAPTERS } from "./engineering-story-published-content";

/**
 * 아키텍처 해설 계약 검사. 구간마다 같은 틀(도식·한 줄 요약·비유·흐름·배경·쓰인 곳·선택과 대가·더 보기)을
 * 지키는지, 파일·도감·챕터·용어가 실제로 있는지, 과장 표현이 없는지 확인한다.
 */

const HANGUL = /[ㄱ-ㆎ가-힣]/u;
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
/** 한국어 문장의 과장 표현. 부정문("완벽하지 않다")도 막아 두어 애초에 쓰지 않게 한다. */
const BANNED_KO = ["업계 최초", "세계 최고", "최고 수준", "완벽", "무제한", "무조건", "압도"] as const;
const BANNED_EN = [/\bworld-class\b/iu, /\bbest-in-class\b/iu, /\bunlimited\b/iu, /\bflawless\b/iu, /\bunmatched\b/iu] as const;

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
    // 운영 DB 표현: Neon 을 말하면 legacy(보존)임을 함께 밝힌다.
    if (/Neon/u.test(hit.ko) && !/legacy|레거시|보존/u.test(hit.ko)) problems.push(`${hit.where}: Neon 은 legacy 보존이라고 함께 써야 함`);
    if (/Neon/u.test(hit.en) && !/legacy|preserved|kept/iu.test(hit.en)) problems.push(`${hit.where}: Neon must be called legacy/preserved`);
  }
  return problems;
}

/** 구간 하나의 계약 위반 목록. 비어 있으면 통과. */
function problemsOfSection(section: ArchitectureGuideSection): string[] {
  const id = section.id;
  const problems: string[] = [...problemsOfLocalized(section, id)];
  if (!KEBAB.test(id)) problems.push(`${id}: id는 소문자 kebab-case`);
  if (!ARCHITECTURE_GUIDE_GROUPS.some((group) => group.id === section.group)) problems.push(`${id}: 알 수 없는 묶음 ${section.group}`);
  if (!statuses.has(section.status)) problems.push(`${id}: 알 수 없는 상태 ${section.status}`);

  if (section.title.ko.length > 24) problems.push(`${id}: 제목 ${section.title.ko.length}자 > 24자`);
  if (section.question.ko.length > 60) problems.push(`${id}: 질문 ${section.question.ko.length}자 > 60자`);
  if (!section.question.ko.trim().endsWith("?")) problems.push(`${id}: 질문은 물음표로 끝남`);
  if (section.oneLine.ko.length > 90) problems.push(`${id}: 한 줄 요약 ${section.oneLine.ko.length}자 > 90자`);
  if (section.easy.ko.length < 30 || section.easy.ko.length > 260) problems.push(`${id}: 쉬운 비유 길이 ${section.easy.ko.length}자(30~260)`);
  for (const text of [section.title, section.question, section.oneLine]) {
    if (text.ko.includes("\n")) problems.push(`${id}: 제목·질문·한 줄 요약에 줄바꿈`);
  }

  if (section.steps.length < 3 || section.steps.length > 6) problems.push(`${id}: 흐름 단계는 3~6개 (현재 ${section.steps.length})`);
  for (const step of section.steps) if (step.ko.length > 90) problems.push(`${id}: 흐름 단계 ${step.ko.length}자 > 90자`);
  if (section.background.length < 2 || section.background.length > 3) problems.push(`${id}: 배경 문단은 2~3개 (현재 ${section.background.length})`);
  for (const paragraph of section.background) {
    if (paragraph.ko.length < 60 || paragraph.ko.length > 520) problems.push(`${id}: 배경 문단 길이 ${paragraph.ko.length}자(60~520)`);
  }

  if (section.inService.length < 1 || section.inService.length > 5) problems.push(`${id}: 쓰인 곳은 1~5개 (현재 ${section.inService.length})`);
  for (const use of section.inService) {
    if (use.what.ko.length > 40) problems.push(`${id}: 쓰인 곳 이름 ${use.what.ko.length}자 > 40자`);
    if (use.role.ko.length > 140) problems.push(`${id}: 쓰인 곳 역할 ${use.role.ko.length}자 > 140자`);
    if (use.paths.length < 1) problems.push(`${id}: 쓰인 곳 "${use.what.ko}"에 근거 경로 없음`);
    for (const path of use.paths) if (!repoPathExists(repoPath(path))) problems.push(`${id}: 존재하지 않는 경로 ${path}`);
  }
  if (section.decisions.length < 1 || section.decisions.length > 3) problems.push(`${id}: 선택과 대가는 1~3개 (현재 ${section.decisions.length})`);
  for (const decision of section.decisions) {
    if (decision.choice.ko.length > 60) problems.push(`${id}: 선택 ${decision.choice.ko.length}자 > 60자`);
    if (decision.because.ko.length > 170) problems.push(`${id}: 이유 ${decision.because.ko.length}자 > 170자`);
    if (decision.cost.ko.length > 170) problems.push(`${id}: 대가 ${decision.cost.ko.length}자 > 170자`);
  }
  if (section.pitfall && section.pitfall.ko.length > 220) problems.push(`${id}: 오해하기 쉬운 점 ${section.pitfall.ko.length}자 > 220자`);
  for (const fact of section.facts ?? []) {
    if (!repoPathExists(repoPath(fact.source))) problems.push(`${id}: fact 근거 경로 없음 ${fact.source}`);
    if (!fact.value.trim()) problems.push(`${id}: fact 값이 비어 있음`);
  }

  if (section.atlasIds.length < 1) problems.push(`${id}: 연결된 도감 카드가 없음`);
  for (const atlasId of section.atlasIds) if (!atlasIds.has(atlasId)) problems.push(`${id}: 없는 도감 카드 ${atlasId}`);
  if (section.chapterIds.length < 1) problems.push(`${id}: 연결된 제작 스토리 챕터가 없음`);
  for (const chapterId of section.chapterIds) if (!chapterIds.has(chapterId)) problems.push(`${id}: 없는 챕터 ${chapterId}`);
  if (section.glossaryIds.length < 1) problems.push(`${id}: 연결된 용어가 없음`);
  for (const termId of section.glossaryIds) if (!glossaryIds.has(termId)) problems.push(`${id}: 없는 용어 ${termId}`);

  if (section.diagram.id !== `${id}-diagram`) problems.push(`${id}: 도식 id는 "${id}-diagram" (현재 ${section.diagram.id})`);
  for (const problem of validateEngineeringDiagram(section.diagram)) problems.push(`${id}/diagram: ${problem}`);
  return problems;
}

describe("아키텍처 해설 구간", () => {
  it("구간은 10~14개이고 두 묶음이 모두 채워진다", () => {
    expect(ARCHITECTURE_GUIDE_SECTIONS.length).toBeGreaterThanOrEqual(10);
    expect(ARCHITECTURE_GUIDE_SECTIONS.length).toBeLessThanOrEqual(14);
    const perGroup = (group: string) => ARCHITECTURE_GUIDE_SECTIONS.filter((section) => section.group === group).length;
    expect(perGroup("runtime")).toBeGreaterThanOrEqual(5);
    expect(perGroup("delivery")).toBeGreaterThanOrEqual(4);
  });

  it("번호는 1부터 끊김 없이 이어지고 실행 구조가 만들고 지키는 구조보다 앞선다", () => {
    expect(ARCHITECTURE_GUIDE_SECTIONS.map((section) => section.number)).toEqual(
      ARCHITECTURE_GUIDE_SECTIONS.map((_, index) => index + 1),
    );
    const groups = ARCHITECTURE_GUIDE_SECTIONS.map((section) => section.group);
    expect(groups).toEqual([...groups].sort((a, b) => (a === b ? 0 : a === "runtime" ? -1 : 1)));
    expect(new Set(ARCHITECTURE_GUIDE_SECTIONS.map((section) => section.id)).size).toBe(ARCHITECTURE_GUIDE_SECTIONS.length);
  });

  it.each(ARCHITECTURE_GUIDE_SECTIONS.map((section) => [section.id, section] as const))("%s 구간은 계약을 지킨다", (_id, section) => {
    expect(problemsOfSection(section)).toEqual([]);
  });

  it("도식 종류를 섞어 쓴다(그래프·순서도·계층 각각 2개 이상)", () => {
    const count = (kind: string) => ARCHITECTURE_GUIDE_SECTIONS.filter((section) => section.diagram.kind === kind).length;
    expect(count("graph")).toBeGreaterThanOrEqual(2);
    expect(count("sequence")).toBeGreaterThanOrEqual(2);
    expect(count("layers")).toBeGreaterThanOrEqual(2);
  });

  it("연결한 도감 카드가 도감의 여러 분야에 걸친다(7개 분야 이상)", () => {
    const categories = new Set(
      ARCHITECTURE_GUIDE_SECTIONS.flatMap((section) => section.atlasIds.map((id) => atlasCategoryById.get(id))).filter(Boolean),
    );
    expect(categories.size).toBeGreaterThanOrEqual(7);
  });
});

describe("아키텍처 해설 한 장 요약", () => {
  it("전체 도식·원칙·읽는 법이 계약을 지킨다", () => {
    const overview = ARCHITECTURE_GUIDE_OVERVIEW;
    expect(problemsOfLocalized(overview, "overview")).toEqual([]);
    expect(overview.diagram.id).toBe("architecture-overview-diagram");
    expect(validateEngineeringDiagram(overview.diagram)).toEqual([]);
    expect(overview.principles.length).toBeGreaterThanOrEqual(4);
    expect(overview.principles.length).toBeLessThanOrEqual(6);
    for (const principle of overview.principles) {
      expect(principle.title.ko.length).toBeLessThanOrEqual(30);
      expect(principle.body.ko.length).toBeLessThanOrEqual(160);
    }
    expect(overview.howToRead.length).toBeGreaterThanOrEqual(3);
    expect(overview.howToRead.length).toBeLessThanOrEqual(4);
  });
});

describe("계약 검사기", () => {
  it("위반을 구체적으로 알려준다", () => {
    const base = ARCHITECTURE_GUIDE_SECTIONS[0];
    if (!base) throw new Error("검사할 구간이 없음");
    const broken: ArchitectureGuideSection = {
      ...base,
      id: "Bad_Id",
      oneLine: { ko: "완벽한 한 줄", en: "한글이 섞인 영어" },
      inService: [{ ...(base.inService[0] as ArchitectureGuideSection["inService"][number]), paths: ["no/such/file.ts"] }],
      atlasIds: ["no-such-card"],
    };
    const problems = problemsOfSection(broken).join("\n");
    expect(problems).toContain("id는 소문자 kebab-case");
    expect(problems).toContain('과장 표현 "완벽"');
    expect(problems).toContain("영어 문장에 한글이 섞임");
    expect(problems).toContain("존재하지 않는 경로 no/such/file.ts");
    expect(problems).toContain("없는 도감 카드 no-such-card");
  });
});
