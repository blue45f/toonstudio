import { existsSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { validateEngineeringDiagram } from "./engineering-diagram-validate";
import { ENGINEERING_MAPS } from "./engineering-map-content";
import { ENGINEERING_MAP_IDS, type EngineeringMap } from "./engineering-map-types";

/**
 * 기술 지도(표) 계약 검사. 같은 검사를 실제 지도와 의도적으로 망가뜨린 지도에 적용해,
 * 검사기가 위반을 실제로 잡아내는지도 함께 확인한다.
 */

const HANGUL = /[ㄱ-ㆎ가-힣]/u;
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const BANNED_HOSTS = new Set(["example.com", "example.org", "localhost", "127.0.0.1", "foo.com", "your-domain.com"]);
const SECRET_PATTERNS: readonly RegExp[] = [
  /sk-[A-Za-z0-9]{12,}/u,
  /AKIA[0-9A-Z]{12,}/u,
  /ghp_[A-Za-z0-9]{20,}/u,
  /xox[abprs]-[A-Za-z0-9-]{10,}/u,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/u,
  /\b(?:api[_-]?key|secret|token|password)\s*[:=]\s*["'][^"'$\s{][^"']{7,}["']/iu,
  /Bearer\s+[A-Za-z0-9._-]{20,}/u,
];

/** 지도별 최소 행 수. 너무 얇은 지도가 "정리했다"고 보이지 않도록 한다. */
const MIN_ROWS: Readonly<Record<string, number>> = {
  "free-tier": 12,
  "open-source": 24,
  "open-api": 14,
  competitors: 10,
  "ai-dev": 8,
};
const MAX_CELL_KO = 220;

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

/** 지도 하나의 계약 위반 목록. 비어 있으면 통과. */
function problemsOfEngineeringMap(map: EngineeringMap): string[] {
  const problems: string[] = [];
  const id = map.id;
  if (!ENGINEERING_MAP_IDS.includes(map.id)) problems.push(`${id}: 알 수 없는 지도 id`);
  if (!DATE.test(map.reviewedAt)) problems.push(`${id}: reviewedAt 형식`);

  for (const hit of collectLocalized(map, id)) {
    if (!hit.ko.trim()) problems.push(`${hit.where}: 한국어가 비어 있음`);
    if (!hit.en.trim()) problems.push(`${hit.where}: 영어가 비어 있음`);
    if (hit.ko !== hit.ko.trim() || hit.en !== hit.en.trim()) problems.push(`${hit.where}: 앞뒤 공백`);
    if (HANGUL.test(hit.en)) problems.push(`${hit.where}: 영어 문장에 한글이 섞임 ("${hit.en.slice(0, 40)}")`);
    if (hit.ko.length > MAX_CELL_KO && hit.where.includes(".cells.")) problems.push(`${hit.where}: 표 칸이 ${hit.ko.length}자 > ${MAX_CELL_KO}자`);
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(hit.ko) || pattern.test(hit.en)) problems.push(`${hit.where}: 비밀값처럼 보이는 문자열 (${pattern})`);
    }
  }

  if (map.columns.length < 3 || map.columns.length > 7) problems.push(`${id}: 열은 3~7개 (현재 ${map.columns.length})`);
  const columnIds = new Set<string>();
  for (const column of map.columns) {
    if (!KEBAB.test(column.id)) problems.push(`${id}: 열 id는 kebab-case (${column.id})`);
    if (columnIds.has(column.id)) problems.push(`${id}: 중복 열 id ${column.id}`);
    columnIds.add(column.id);
  }

  const minRows = MIN_ROWS[map.id] ?? 8;
  if (map.rows.length < minRows) problems.push(`${id}: 행이 ${map.rows.length}개 < 최소 ${minRows}개`);
  const rowIds = new Set<string>();
  const rowNames = new Set<string>();
  for (const row of map.rows) {
    const rid = `${id}/${row.id}`;
    if (!KEBAB.test(row.id)) problems.push(`${rid}: 행 id는 kebab-case`);
    if (rowIds.has(row.id)) problems.push(`${rid}: 중복 행 id`);
    rowIds.add(row.id);
    if (!row.name.trim() || row.name !== row.name.trim()) problems.push(`${rid}: name 공백`);
    if (rowNames.has(row.name.toLowerCase())) problems.push(`${rid}: 중복 이름 ${row.name}`);
    rowNames.add(row.name.toLowerCase());
    for (const key of Object.keys(row.cells)) if (!columnIds.has(key)) problems.push(`${rid}: 열 정의에 없는 칸 ${key}`);
    for (const key of columnIds) if (!(key in row.cells)) problems.push(`${rid}: 칸 ${key} 비어 있음(해당 없으면 "—")`);
    if (row.evidence.length < 1) problems.push(`${rid}: 근거 경로가 없음`);
    for (const path of row.evidence) if (!existsSync(repoPath(path))) problems.push(`${rid}: 존재하지 않는 경로 ${path}`);
    if (row.link) {
      try {
        const url = new URL(row.link.url);
        if (url.protocol !== "https:") problems.push(`${rid}: https 아님 ${row.link.url}`);
        if (BANNED_HOSTS.has(url.hostname)) problems.push(`${rid}: 예시/로컬 주소 ${row.link.url}`);
      } catch {
        problems.push(`${rid}: 잘못된 URL ${row.link.url}`);
      }
      if (/\s/u.test(row.link.url) || /[.,;)]$/u.test(row.link.url)) problems.push(`${rid}: URL 형식 의심 ${row.link.url}`);
      if (!row.link.title.trim()) problems.push(`${rid}: 링크 제목 없음`);
    }
    if (row.asOf && !DATE.test(row.asOf)) problems.push(`${rid}: asOf 형식`);
    if (map.id === "free-tier" && !row.asOf) problems.push(`${rid}: free-tier 행은 확인 날짜(asOf)가 필요`);
  }

  if (map.diagram) for (const problem of validateEngineeringDiagram(map.diagram)) problems.push(`${id}/diagram: ${problem}`);
  return problems;
}

const BROKEN_MAP: EngineeringMap = {
  id: "free-tier",
  title: { ko: "제목", en: "한글 섞임" },
  intro: { ko: "소개", en: "Intro" },
  takeaway: { ko: "결론", en: "Takeaway" },
  columns: [
    { id: "Name", label: { ko: "이름", en: "Name" } },
    { id: "plan", label: { ko: "요금제", en: "Plan" } },
    { id: "limit", label: { ko: "한도", en: "Limit" } },
  ],
  rows: [
    {
      id: "Bad_Row",
      name: "Service",
      cells: { plan: { ko: "무료", en: "Free" }, extra: { ko: "x", en: "x" } },
      evidence: ["no/such/file.md"],
      link: { title: "Docs", url: "http://example.com/a" },
    },
  ],
  reviewedAt: "2026/10/07",
};

describe("기술 지도 검사기", () => {
  it("위반을 구체적으로 알려준다", () => {
    const problems = problemsOfEngineeringMap(BROKEN_MAP).join("\n");
    expect(problems).toContain("한글이 섞임");
    expect(problems).toContain("reviewedAt 형식");
    expect(problems).toContain("kebab-case");
    expect(problems).toContain("열 정의에 없는 칸");
    expect(problems).toContain("비어 있음");
    expect(problems).toContain("존재하지 않는 경로");
    expect(problems).toContain("https 아님");
    expect(problems).toContain("asOf");
    expect(problems).toContain("최소");
  });
});

describe("게시된 기술 지도", () => {
  it("모든 지도가 계약을 지킨다", () => {
    expect(ENGINEERING_MAPS.flatMap(problemsOfEngineeringMap)).toEqual([]);
  });

  it("지도 id는 고유하다", () => {
    const ids = ENGINEERING_MAPS.map((map) => map.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("도식 id는 도감 카드 도식·다른 지도와 겹치지 않는다", () => {
    const ids = ENGINEERING_MAPS.flatMap((map) => (map.diagram ? [map.diagram.id] : []));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
