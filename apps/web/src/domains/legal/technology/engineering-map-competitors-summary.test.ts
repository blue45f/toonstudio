import { describe, expect, it } from "vitest";

import { D, WATCHLIST_ONLY_IDS } from "./engineering-map-competitors-kit";
import { COMPETITOR_ROWS } from "./engineering-map-competitors-rows";
import {
  COMPETITOR_COUNTS,
  COMPETITOR_DOMAIN_LEARNED,
  COMPETITOR_DOMAIN_SUMMARY,
  isUnresearchedCompetitorRow,
} from "./engineering-map-competitors-summary";
import { ENGINEERING_MAP_COMPETITORS } from "./engineering-map-competitors";

const HANGUL = /[ㄱ-ㆎ가-힣]/u;
const MAX_LEARNED_KO = 70;

/** 발표 덱(engineering-talk-benchmarks)이 그룹 순서와 ‘배운 점’ 키로 쓰는 기존 여덟 영역. 새 영역은 이 뒤에 온다. */
const ORIGINAL_EIGHT_AREAS = ["그림·페인팅", "3D·캐릭터", "협업·가상공간", "콘티·검토", "디자인·문서", "웹툰 유통·생태계", "AI·에이전트", "엔진·표준"];

describe("경쟁·참고 제품 영역별 요약", () => {
  it("모든 행 이름이 정확히 한 영역에 한 번씩 들어간다", () => {
    const summarized = COMPETITOR_DOMAIN_SUMMARY.flatMap((area) => area.names);
    expect(summarized).toHaveLength(COMPETITOR_ROWS.length);
    expect(new Set(summarized).size).toBe(summarized.length);
    expect([...summarized].sort()).toEqual(COMPETITOR_ROWS.map((row) => row.name).sort());
  });

  it("영역의 이름 목록은 그 영역 행을 지도 순서대로 계산한 값이다(손으로 적은 이름이 없다)", () => {
    for (const area of COMPETITOR_DOMAIN_SUMMARY) {
      const expected = COMPETITOR_ROWS.filter((row) => row.cells.domain?.ko === area.domain.ko).map((row) => row.name);
      expect(area.names, area.domainId).toEqual(expected);
      expect(area.names.length, area.domainId).toBeGreaterThan(0);
    }
  });

  it("영역 이름은 표의 첫 열과 같고, 영역 키는 고유하다", () => {
    const ids = COMPETITOR_DOMAIN_SUMMARY.map((area) => area.domainId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const area of COMPETITOR_DOMAIN_SUMMARY) expect(area.domain, area.domainId).toBe(D[area.domainId]);
    for (const row of COMPETITOR_ROWS) {
      expect(COMPETITOR_DOMAIN_SUMMARY.some((area) => area.domain.ko === row.cells.domain?.ko), `${row.id}: 알 수 없는 영역 ${row.cells.domain?.ko}`).toBe(true);
    }
  });

  it("기존 여덟 영역이 먼저 같은 순서로 오고, 새 영역은 그 뒤에 온다", () => {
    const labels = COMPETITOR_DOMAIN_SUMMARY.map((area) => area.domain.ko);
    expect(labels.slice(0, ORIGINAL_EIGHT_AREAS.length)).toEqual(ORIGINAL_EIGHT_AREAS);
    expect(labels.length).toBeGreaterThan(ORIGINAL_EIGHT_AREAS.length);
  });

  it("영역마다 ‘배운 점 한 줄’이 70자 이내로 있고 영어에는 한글이 없다", () => {
    for (const area of COMPETITOR_DOMAIN_SUMMARY) {
      expect(area.learned.ko.trim().length, area.domainId).toBeGreaterThan(0);
      expect(area.learned.ko.length, `${area.domainId}: ${area.learned.ko.length}자`).toBeLessThanOrEqual(MAX_LEARNED_KO);
      expect(area.learned.en.trim().length, area.domainId).toBeGreaterThan(0);
      expect(HANGUL.test(area.learned.en), `${area.domainId}: 영어에 한글`).toBe(false);
    }
    expect(Object.keys(COMPETITOR_DOMAIN_LEARNED).sort()).toEqual(Object.keys(D).sort());
  });

  it("비교 기록이 있는 제품과 ‘미조사’ 제품이 이름 목록을 빠짐없이 나눈다", () => {
    for (const area of COMPETITOR_DOMAIN_SUMMARY) {
      expect([...area.studiedNames, ...area.watchedNames].sort(), area.domainId).toEqual([...area.names].sort());
      expect(area.studiedNames.filter((name) => area.watchedNames.includes(name)), area.domainId).toEqual([]);
    }
  });

  it("‘미조사’ 표기와 감시·대상 목록 id 집합이 같은 행을 가리킨다", () => {
    const byPrefix = COMPETITOR_ROWS.filter((row) => (row.cells.learned?.ko ?? "").startsWith("미조사")).map((row) => row.id).sort();
    const bySet = COMPETITOR_ROWS.filter((row) => WATCHLIST_ONLY_IDS.has(row.id)).map((row) => row.id).sort();
    expect(bySet).toEqual(byPrefix);
    for (const id of WATCHLIST_ONLY_IDS) expect(COMPETITOR_ROWS.some((row) => row.id === id), `${id}: 지도에 없는 감시 id`).toBe(true);
    expect(COMPETITOR_ROWS.filter(isUnresearchedCompetitorRow).map((row) => row.id).sort()).toEqual(byPrefix);
  });

  it("‘미조사’ 행은 비교 결과를 지어내지 않고 겹치는 기능도 ‘미확인’으로 적는다", () => {
    for (const row of COMPETITOR_ROWS.filter(isUnresearchedCompetitorRow)) {
      expect(row.cells.overlap?.ko, row.id).toContain("미확인");
      expect(row.cells.learned?.en, row.id).toMatch(/^Not researched/u);
    }
  });

  it("제품 이름은 라틴 문자로만 쓴다(발표 덱이 이름을 영어 화면에도 그대로 쓴다)", () => {
    for (const row of COMPETITOR_ROWS) expect(HANGUL.test(row.name), `${row.id}: ${row.name}`).toBe(false);
  });

  it("개수는 모두 행에서 계산되고 본문이 그 숫자를 쓴다", () => {
    expect(COMPETITOR_COUNTS.total).toBe(COMPETITOR_ROWS.length);
    expect(COMPETITOR_COUNTS.studied + COMPETITOR_COUNTS.unresearched).toBe(COMPETITOR_COUNTS.total);
    expect(COMPETITOR_COUNTS.areas).toBe(COMPETITOR_DOMAIN_SUMMARY.length);
    expect(COMPETITOR_COUNTS.studied).toBe(COMPETITOR_DOMAIN_SUMMARY.reduce((sum, area) => sum + area.studiedNames.length, 0));

    const map = ENGINEERING_MAP_COMPETITORS;
    expect(map).not.toBeNull();
    const firstNote = map?.notes?.[0];
    expect(firstNote?.ko).toContain(`${COMPETITOR_COUNTS.total}곳`);
    expect(firstNote?.ko).toContain(`${COMPETITOR_COUNTS.studied}곳`);
    expect(firstNote?.ko).toContain(`${COMPETITOR_COUNTS.unresearched}곳`);
    expect(map?.diagram?.caption.ko).toContain(`${COMPETITOR_COUNTS.areas}개 영역`);
    expect(map?.intro.ko).toContain(`${COMPETITOR_COUNTS.areas}개 영역`);
  });

  it("도식의 영역 노드 수는 요약의 영역 수와 같다(허브 제외)", () => {
    const diagram = ENGINEERING_MAP_COMPETITORS?.diagram;
    expect(diagram?.kind).toBe("graph");
    if (diagram?.kind !== "graph") return;
    expect(diagram.nodes.length - 1).toBe(COMPETITOR_DOMAIN_SUMMARY.length);
  });
});
