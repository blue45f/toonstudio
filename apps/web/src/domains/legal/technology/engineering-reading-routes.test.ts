import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { SITEMAP_DIRECTORY_ENTRIES } from "../site-directory-data";
import { DECK_TRACK_META, deckTrackTotalSeconds } from "./engineering-deck-model";
import { DECK_TRACKS } from "./engineering-deck-state";
import { validateEngineeringDiagram } from "./engineering-diagram-validate";
import { ENGINEERING_READING_FLOW_DIAGRAM } from "./engineering-reading-flow-diagram";
import {
  ENGINEERING_DECK_BRIEF_MINUTES,
  ENGINEERING_READING_ROUTES,
  ENGINEERING_START_PAGES,
  readingRouteTime,
  readingStepHref,
  readingStepMinutes,
} from "./engineering-reading-routes";
import {
  ENGINEERING_PAGES,
  ENGINEERING_PAGE_GROUPS,
  ENGINEERING_PATH_PAGES,
  findEngineeringPage,
} from "./engineering-tech-pages";

const HANGUL = /[ㄱ-ㆎ가-힣]/u;

describe("기술 허브 흐름 도식", () => {
  it("도식 계약(격자·글자 폭·간선 경로·잘림)을 지킨다", () => {
    expect(validateEngineeringDiagram(ENGINEERING_READING_FLOW_DIAGRAM)).toEqual([]);
  });

  it("발표 동선 1~5와 큰 그림 단계 이름이 레지스트리의 이름과 같다", () => {
    const labels = new Map(ENGINEERING_READING_FLOW_DIAGRAM.kind === "graph" ? ENGINEERING_READING_FLOW_DIAGRAM.nodes.map((node) => [node.id, node.label]) : []);
    const stepNodes = ["story", "playbook", "guides", "notes", "deck"] as const;
    expect(ENGINEERING_PATH_PAGES.map((page) => page.id)).toEqual(["story", "playbook", "guides", "field-notes", "deck"]);
    ENGINEERING_PATH_PAGES.forEach((page, index) => {
      const label = labels.get(stepNodes[index] ?? "");
      expect(label?.ko, page.id).toBe(`${String(page.step)} · ${page.label.ko}`);
      expect(label?.en, page.id).toBe(`${String(page.step)} · ${page.label.en}`);
    });
    const overview = ENGINEERING_PAGE_GROUPS.find((group) => group.id === "overview");
    expect(labels.get("big")).toEqual(overview?.label);
  });
});

describe("페이지 머리말의 질문·대상", () => {
  it("모든 페이지가 질문과 대상을 한·영으로 가지고, 영어 칸에는 한글이 없다", () => {
    for (const page of ENGINEERING_PAGES) {
      expect(page.question?.ko.trim(), `${page.id}.question`).toBeTruthy();
      expect(page.audience?.ko.trim(), `${page.id}.audience`).toBeTruthy();
      expect(page.question?.ko.endsWith("?"), `${page.id}.question 은 질문으로 끝난다`).toBe(true);
      expect(page.question?.en.endsWith("?"), `${page.id}.question(en)`).toBe(true);
      expect(page.question?.ko.length ?? 0, `${page.id}.question`).toBeLessThanOrEqual(48);
      expect(page.audience?.ko.length ?? 0, `${page.id}.audience`).toBeLessThanOrEqual(40);
      expect(HANGUL.test(page.question?.en ?? ""), `${page.id}.question(en)`).toBe(false);
      expect(HANGUL.test(page.audience?.en ?? ""), `${page.id}.audience(en)`).toBe(false);
    }
  });

  it("질문은 페이지마다 다르다(목적이 겹치지 않는다)", () => {
    const questions = ENGINEERING_PAGES.map((page) => page.question?.ko);
    expect(new Set(questions).size).toBe(questions.length);
  });
});

describe("여기서 시작과 읽는 길", () => {
  it("첫 화면의 두 문은 큰 그림 묶음의 페이지와 같고 제목·몫·읽는 법을 한·영으로 가진다", () => {
    expect(ENGINEERING_START_PAGES.map((entry) => entry.pageId)).toEqual(
      ENGINEERING_PAGES.filter((page) => page.group === "overview").map((page) => page.id),
    );
    for (const entry of ENGINEERING_START_PAGES) {
      for (const text of [entry.title, entry.role, entry.hook]) {
        expect(text.ko.trim(), entry.pageId).toBeTruthy();
        expect(HANGUL.test(text.en), `${entry.pageId} 영어 칸`).toBe(false);
      }
    }
  });

  it("읽는 길은 세 가지이고 모든 단계가 레지스트리에 있는 페이지를 가리킨다", () => {
    expect(ENGINEERING_READING_ROUTES.map((route) => route.id)).toEqual(["skim", "understand", "deep"]);
    for (const route of ENGINEERING_READING_ROUTES) {
      expect(route.steps.some((step) => !step.optional), route.id).toBe(true);
      for (const step of route.steps) {
        const page = findEngineeringPage(step.pageId);
        expect(readingStepHref(step).startsWith(page.href), `${route.id}/${step.pageId}`).toBe(true);
        expect(HANGUL.test(step.note.en), `${route.id}/${step.pageId} 영어 칸`).toBe(false);
        if (step.label) expect(HANGUL.test(step.label.en), `${route.id}/${step.pageId} 이름(영어)`).toBe(false);
      }
    }
  });

  it("깊이 파고들기의 필수 단계는 발표 동선 1~4와 같은 순서다", () => {
    const deep = ENGINEERING_READING_ROUTES.find((route) => route.id === "deep");
    expect(deep?.steps.filter((step) => !step.optional).map((step) => step.pageId)).toEqual(
      ENGINEERING_PATH_PAGES.filter((page) => (page.step ?? 0) <= 4).map((page) => page.id),
    );
  });

  it("이해하기는 큰 그림 두 페이지를 필수로 읽는다", () => {
    const understand = ENGINEERING_READING_ROUTES.find((route) => route.id === "understand");
    expect(understand?.steps.filter((step) => !step.optional).map((step) => step.pageId)).toEqual(ENGINEERING_START_PAGES.map((entry) => entry.pageId));
  });

  it("훑어보기는 발표 모드 핵심 요약 트랙을 첫 단계로 연다", () => {
    const skim = ENGINEERING_READING_ROUTES.find((route) => route.id === "skim");
    const first = skim?.steps[0];
    expect(first?.deckTrack).toBe("brief");
    expect(first ? readingStepHref(first) : "").toBe("/about/technology/deck?track=brief#slide-1");
  });

  it("길의 시간은 레지스트리의 읽기·발표 시간에서 더하고, 선택 단계는 더하지 않는다", () => {
    for (const route of ENGINEERING_READING_ROUTES) {
      const required = route.steps.filter((step) => !step.optional);
      const minutes = required.map((step) => readingStepMinutes(step));
      const time = readingRouteTime(route);
      expect(time.complete, route.id).toBe(minutes.every((value) => value !== undefined));
      expect(time.minutes, route.id).toBe(minutes.reduce<number>((sum, value) => sum + (value ?? 0), 0));
    }
    // 깊이 파고들기: 스토리·플레이북·가이드·심화 노트의 읽기 시간 합.
    const deep = ENGINEERING_READING_ROUTES.find((route) => route.id === "deep");
    const expected = ENGINEERING_PATH_PAGES.filter((page) => (page.step ?? 0) <= 4).reduce((sum, page) => sum + (page.readingMinutes ?? 0), 0);
    expect(expected).toBeGreaterThan(0);
    expect(deep ? readingRouteTime(deep) : undefined).toEqual({ minutes: expected, complete: true });
    // 훑어보기: 핵심 요약 트랙 길이.
    const skim = ENGINEERING_READING_ROUTES.find((route) => route.id === "skim");
    expect(skim ? readingRouteTime(skim) : undefined).toEqual({ minutes: ENGINEERING_DECK_BRIEF_MINUTES, complete: true });
  });

  it("큰 그림 두 페이지의 읽기 시간이 정해져 있으면 이해하기의 시간은 그 합이다", () => {
    const understand = ENGINEERING_READING_ROUTES.find((route) => route.id === "understand");
    const pages = ENGINEERING_START_PAGES.map((entry) => findEngineeringPage(entry.pageId));
    const time = understand ? readingRouteTime(understand) : undefined;
    if (pages.every((page) => page.readingMinutes !== undefined)) {
      expect(time).toEqual({ minutes: pages.reduce((sum, page) => sum + (page.readingMinutes ?? 0), 0), complete: true });
    } else {
      // 시간이 없는 동안에는 합계를 작게 말하지 않고 보여주지 않는다.
      expect(time?.complete).toBe(false);
    }
  });
});

describe("덱 시간 고정값", () => {
  it("핵심 요약 트랙의 고정 시간과 발표 모드 항목의 발표 시간은 덱 모델의 실제 길이와 같다", () => {
    expect(ENGINEERING_DECK_BRIEF_MINUTES).toBe(Math.round(deckTrackTotalSeconds("brief") / 60));
    expect(findEngineeringPage("deck").talkMinutes).toBe(Math.round(deckTrackTotalSeconds("talk") / 60));
  });
});

describe("이름 일치", () => {
  it("빵부스러기의 페이지 이름은 기술 메뉴 이름과 한·영 모두 같다", () => {
    const source = readFileSync("apps/web/src/app/routes/route-breadcrumb.ts", "utf8");
    for (const page of ENGINEERING_PAGES) {
      expect(source, page.id).toContain(`"${page.href}": [HOME, ABOUT, TECHNOLOGY, { ko: "${page.label.ko}", en: "${page.label.en}" }]`);
    }
  });

  it("사이트맵 목록이 기술 메뉴의 모든 페이지를 담는다", () => {
    const source = readFileSync("apps/web/src/domains/legal/site-directory-data.ts", "utf8");
    for (const page of ENGINEERING_PAGES) expect(source, page.id).toContain(`"${page.href}"`);
  });

  it("사이트맵의 발표 모드 설명은 분 수를 적지 않고, 트랙 수를 덱 상태 계약에서 가져와 모든 트랙 이름을 말한다", () => {
    const source = readFileSync("apps/web/src/domains/legal/site-directory-data.ts", "utf8");
    expect(source).not.toMatch(/세 발표 트랙|three tracks/u);
    expect(source).toContain("DECK_TRACKS.length");
    const entry = SITEMAP_DIRECTORY_ENTRIES.find((candidate) => candidate.href === "/about/technology/deck");
    const description = entry && "description" in entry ? entry.description : undefined;
    expect(description?.ko).toContain(`트랙 ${String(DECK_TRACKS.length)}개`);
    expect(description?.en).toContain(`${String(DECK_TRACKS.length)} tracks`);
    expect(description?.ko ?? "").not.toMatch(/\d+분/u);
    for (const track of DECK_TRACKS) {
      // 트랙의 짧은 이름("기술 도감 부록" → "도감 부록")이 설명에 들어 있어야 트랙이 늘거나 바뀔 때 설명이 낡지 않는다.
      expect(description?.ko, track).toContain(DECK_TRACK_META[track].label.ko.replace(/^기술 /u, ""));
    }
  });
});

describe("허브 파일의 가벼움", () => {
  it("읽는 길·도식 데이터는 덱 모델·도감·지도·용어집 같은 큰 콘텐츠 모듈을 가져오지 않는다", () => {
    for (const file of ["engineering-reading-routes.ts", "engineering-reading-flow-diagram.ts"]) {
      const source = readFileSync(`apps/web/src/domains/legal/technology/${file}`, "utf8");
      const imports = Array.from(source.matchAll(/from "(\.[^"]+)"/gu), (match) => match[1]);
      for (const specifier of imports) {
        expect(specifier, `${file} → ${String(specifier)}`).toMatch(/engineering-(deck-state|diagram-types|story-content|tech-pages)$/u);
      }
    }
  });
});
