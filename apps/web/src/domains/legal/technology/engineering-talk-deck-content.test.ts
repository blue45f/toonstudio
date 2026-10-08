// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { NEXTGEN_LAB_DEFAULTS } from "@/shared/lib/nextgen-lab-settings";
import { NEXTGEN_CAPABILITY_IDS } from "@/shared/lib/nextgen-web-capabilities";

import { findAtlasEntry } from "./engineering-atlas-content";
import { DECK_TABLE_MAX_COLUMNS, DECK_TABLE_MAX_ROWS, buildDeckTrack, deckSlideProblems } from "./engineering-deck-model";
import { validateEngineeringDiagram } from "./engineering-diagram-validate";
import { D } from "./engineering-map-competitors-kit";
import { COMPETITOR_COUNTS, COMPETITOR_DOMAIN_SUMMARY, isUnresearchedCompetitorRow } from "./engineering-map-competitors-summary";
import { findEngineeringMap } from "./engineering-map-content";
import type { EngineeringMapRow } from "./engineering-map-types";
import { ENGINEERING_STATUS_META, type EngineeringStatus } from "./engineering-story-content";
import { PUBLISHED_ENGINEERING_CHAPTERS } from "./engineering-story-published-content";
import {
  BENCHMARK_GROUPS,
  BENCHMARK_NAME_CHAR_BUDGET,
  BENCHMARK_PLAN,
  benchmarkNamesCell,
  planBenchmarks,
  type BenchmarkDomainInput,
} from "./engineering-talk-benchmarks";
import {
  TALK_SECTIONS,
  TALK_SLIDES,
  TALK_TABLE_SOURCES,
  TALK_TOTAL_SECONDS,
  planTalkSections,
  type TalkSlide,
} from "./engineering-talk-deck";
import { TALK_DEMO_MIN_SLACK_SECONDS, TALK_DEMO_STEP_SECONDS, TALK_TABLE_MAX_ROWS } from "./engineering-talk-kit";
import { repoPathExists } from "./engineering-repo-paths-test-kit";
import { ENGINEERING_CHAPTER_COUNT } from "./engineering-tech-pages";

/**
 * 세미나 발표(30분) 원본의 콘텐츠 계약.
 * - 구성: 구간·시간·장수·레이아웃, 화면 모델이 레이아웃 규칙을 지키는지.
 * - 문구: 영어 칸의 한글, 금지 표현, Neon/UTC 같은 정정된 서술.
 * - 대본: 분량·구성 요소(비유가 아니라 말할 문장의 뼈대: 근거 파일·숫자·다음 장 안내·열 도감 카드).
 * - 수치: 슬라이드에 쓴 숫자는 코드·설정·테스트·지도에서 같은 값을 찾는다(수치를 새로 쓰면 이 파일에 대조를 더한다).
 * 저장소 루트에서 실행되며 경로는 루트 기준이다.
 */

const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힣]/u;
const talkSlides: readonly TalkSlide[] = TALK_SLIDES;
const koDeck = buildDeckTrack("talk", (text) => text.ko).slides;
const enDeck = buildDeckTrack("talk", (text) => text.en, { locale: "en" }).slides;

const read = (path: string): string => readFileSync(path, "utf8");

/**
 * CI 부분 체크아웃(sparse)에는 문서·큰 자산 폴더가 없을 수 있다. 작업 트리에 없으면 null 을 돌려주고 그 단언은 건너뛴다.
 * 저장소에 아예 없는 경로(오타·삭제·추적 안 됨)는 어느 환경에서든 던져서 잡는다.
 */
function readIfCheckedOut(path: string): string | null {
  if (existsSync(path)) return readFileSync(path, "utf8");
  if (repoPathExists(path)) return null;
  throw new Error(`${path} 는 저장소에 없습니다`);
}

function slideOf(id: string): TalkSlide {
  const slide = talkSlides.find((item) => item.id === id);
  if (!slide) throw new Error(`발표에 ${id} 슬라이드가 없습니다`);
  return slide;
}

interface LocalizedHit {
  readonly where: string;
  readonly ko: string;
  readonly en: string;
}

/** 값 안의 모든 `{ ko, en }` 쌍을 모은다(슬라이드·도식·표·표 근거 행 모두). */
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

const hitsOf = (slide: TalkSlide): LocalizedHit[] => collectLocalized(slide, slide.id);
const koTextOf = (slide: TalkSlide): string => hitsOf(slide).map((hit) => hit.ko).join("\n");

/** 팩트 하나의 값(번역 쌍이면 한국어). */
function factOf(slide: TalkSlide, index: number, labelHint: string): string {
  const fact = slide.facts?.[index];
  if (!fact) throw new Error(`${slide.id}: ${index}번째 팩트가 없습니다`);
  expect(fact.label.ko, `${slide.id} 팩트 ${index}`).toContain(labelHint);
  return typeof fact.value === "string" ? fact.value : fact.value.ko;
}

function gitFiles(pathspec: string): string[] {
  return execFileSync("git", ["ls-files", "--", pathspec], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    .split("\n")
    .filter(Boolean);
}

/** `git grep -l -w` 로 낱말이 든 추적 파일을 찾는다(없으면 빈 배열). */
function gitGrepFiles(word: string, pathspec: string): string[] {
  try {
    return execFileSync("git", ["grep", "-l", "-w", "-e", word, "--", pathspec], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
      .split("\n")
      .filter(Boolean);
  } catch (error) {
    if ((error as { status?: number }).status === 1) return [];
    throw error;
  }
}

const NUMBER = /\d[\d,]*(?:\.\d+)?/gu;
const MONTH_DAY = /(?<![\d-])\d{2}-\d{2}(?![\d-])/gu;

/** 글 속 숫자 낱말(날짜 MM-DD 는 뺀다, 쉼표는 지운다). */
function numberTokens(text: string): string[] {
  return (text.replace(MONTH_DAY, " ").match(NUMBER) ?? []).map((token) => token.replace(/,/gu, "").replace(/\.$/u, ""));
}

const hasNumber = (source: string, token: string): boolean =>
  new RegExp(`(?<![\\d.])${token.replace(/\./gu, "\\.")}(?![\\d])`, "u").test(source.replace(/(\d),(?=\d)/gu, "$1"));

describe("세미나 발표 원본: 구성과 시간표", () => {
  it("정확히 30분이고 첫 구간(표지·순서·문제)은 3분이다", () => {
    expect(TALK_TOTAL_SECONDS).toBe(1800);
    const plans = planTalkSections();
    expect(plans.map((plan) => plan.id)).toEqual(TALK_SECTIONS.map((section) => section.id));
    expect(plans.find((plan) => plan.id === "opening")?.seconds).toBe(180);
    expect(plans.every((plan) => plan.slideCount > 0)).toBe(true);
  });

  it("24~28장이고 장당 40~120초이며 id 는 talk-* 로 유일하다", () => {
    expect(talkSlides.length).toBeGreaterThanOrEqual(24);
    expect(talkSlides.length).toBeLessThanOrEqual(28);
    expect(new Set(talkSlides.map((slide) => slide.id)).size).toBe(talkSlides.length);
    for (const slide of talkSlides) {
      expect(slide.id, slide.id).toMatch(/^talk-[a-z0-9-]+$/u);
      expect(slide.seconds, slide.id).toBeGreaterThanOrEqual(40);
      expect(slide.seconds, slide.id).toBeLessThanOrEqual(120);
    }
  });

  it("표지·순서로 시작하고 QR 이 있는 질의응답으로 끝난다", () => {
    expect(talkSlides[0]?.layout).toBe("cover");
    expect(talkSlides[1]?.layout).toBe("agenda");
    const last = talkSlides.at(-1);
    expect(last?.layout).toBe("qa");
    expect(last?.qr?.href).toBe("/about/technology/atlas");
    expect(last?.qr?.label.ko.length).toBeGreaterThan(3);
    expect(last?.qr?.label.en).not.toMatch(HANGUL);
    // 챕터 수는 발행 챕터 목록에서 센 값이어야 한다(낡은 31 같은 손으로 쓴 값 금지).
    const labels = (last?.links ?? []).map((link) => link.label.ko).join("\n");
    expect(PUBLISHED_ENGINEERING_CHAPTERS.length).toBe(ENGINEERING_CHAPTER_COUNT);
    expect(labels).toContain(`${PUBLISHED_ENGINEERING_CHAPTERS.length}개 챕터`);
    expect((last?.links ?? []).map((link) => link.label.en).join("\n")).toContain(`${PUBLISHED_ENGINEERING_CHAPTERS.length} chapters`);
  });

  it("데모는 단계당 25초에 여유 20초 이상을 두고 단계마다 예비 화면이 있다", () => {
    const demo = slideOf("talk-demo");
    const steps = demo.demoSteps ?? [];
    expect(steps.length).toBeGreaterThanOrEqual(3);
    expect(demo.seconds - steps.length * TALK_DEMO_STEP_SECONDS).toBeGreaterThanOrEqual(TALK_DEMO_MIN_SLACK_SECONDS);
    for (const step of steps) {
      expect(step.href).toMatch(/^\//u);
      expect(step.fallback.ko.length).toBeGreaterThan(5);
    }
  });

  it("새 레이아웃을 적극 쓴다: 도감 카드 10장 이상, 표 6장 이상, 직접 쓴 도식 2장 이상", () => {
    const count = (layout: TalkSlide["layout"]): number => talkSlides.filter((slide) => slide.layout === layout).length;
    expect(count("atlas")).toBeGreaterThanOrEqual(10);
    expect(count("table")).toBeGreaterThanOrEqual(6);
    expect(count("diagram")).toBeGreaterThanOrEqual(2);
    expect(talkSlides.filter((slide) => slide.diagram).length).toBeGreaterThanOrEqual(1);
  });
});

describe("세미나 발표 원본: 화면 모델이 레이아웃 규칙을 지킨다", () => {
  it.each([["ko", koDeck], ["en", enDeck]] as const)("%s 화면 모델에 레이아웃 문제가 없다", (_locale, deck) => {
    expect(deck).toHaveLength(talkSlides.length);
    expect(deck.flatMap((slide) => deckSlideProblems(slide))).toEqual([]);
  });

  it("표는 4열×8행 이하이고 칸이 비어 있지 않으며 너무 길지 않다", () => {
    expect(TALK_TABLE_MAX_ROWS).toBe(DECK_TABLE_MAX_ROWS);
    for (const slide of talkSlides.filter((item) => item.table)) {
      const table = slide.table;
      expect(table?.columns.length, slide.id).toBeLessThanOrEqual(DECK_TABLE_MAX_COLUMNS);
      expect(table?.rows.length, slide.id).toBeLessThanOrEqual(DECK_TABLE_MAX_ROWS);
      table?.rows.forEach((row, rowIndex) => {
        row.forEach((cell, columnIndex) => {
          expect(cell.ko.trim().length, `${slide.id} ${rowIndex + 1}행 ${columnIndex + 1}열`).toBeGreaterThan(0);
          // 벤치마크 표의 제품 이름 칸만 길다(총량은 예산으로 따로 제한한다).
          const limit = slide.id === "talk-benchmarks" && columnIndex === 1 ? BENCHMARK_NAME_CHAR_BUDGET : 80;
          expect(cell.ko.length, `${slide.id} ${rowIndex + 1}행 ${columnIndex + 1}열`).toBeLessThanOrEqual(limit);
        });
      });
    }
  });

  it("직접 쓴 도식은 도식 규칙을 모두 지킨다", () => {
    const diagrams = talkSlides.flatMap((slide) => (slide.diagram ? [slide.diagram] : []));
    expect(diagrams.length).toBeGreaterThan(0);
    for (const diagram of diagrams) expect(validateEngineeringDiagram(diagram), diagram.id).toEqual([]);
  });

  it("도감 카드 슬라이드는 실제 카드·코드 샘플을 가리키고 코드는 24줄 이하다", () => {
    const atlasSlides = talkSlides.filter((slide) => slide.layout === "atlas");
    for (const slide of atlasSlides) {
      const ref = slide.atlas;
      expect(ref, slide.id).toBeDefined();
      const entry = findAtlasEntry(ref?.id ?? "");
      expect(entry, `${slide.id}: ${ref?.id}`).toBeDefined();
      if (ref?.view === "code") {
        expect(entry?.samples[ref.sample ?? 0], slide.id).toBeDefined();
        const code = koDeck.find((item) => item.id === slide.id)?.atlas?.code?.code ?? "";
        expect(code.split("\n").length, `${slide.id} 코드 줄 수`).toBeLessThanOrEqual(24);
      }
    }
  });

  it("표지·순서를 뺀 모든 슬라이드에 질문이 나오면 열 도감 카드 2~4장이 실제로 있다", () => {
    for (const slide of talkSlides) {
      const ids = slide.relatedAtlasIds ?? [];
      if (slide.layout === "cover" || slide.layout === "agenda") {
        expect(ids, slide.id).toEqual([]);
        continue;
      }
      expect(ids.length, slide.id).toBeGreaterThanOrEqual(2);
      expect(ids.length, slide.id).toBeLessThanOrEqual(4);
      expect(new Set(ids).size, slide.id).toBe(ids.length);
      for (const id of ids) expect(findAtlasEntry(id), `${slide.id}: ${id}`).toBeDefined();
    }
  });
});

describe("세미나 발표 원본: 문구 규칙", () => {
  it("영어 칸과 기술 칩에는 한글이 없다", () => {
    for (const slide of talkSlides) {
      for (const hit of hitsOf(slide)) expect(hit.en, hit.where).not.toMatch(HANGUL);
      for (const chip of slide.stack ?? []) expect(chip, `${slide.id} stack`).not.toMatch(HANGUL);
      for (const module of slide.modules ?? []) for (const chip of module.stack ?? []) expect(chip, `${slide.id} ${module.id}`).not.toMatch(HANGUL);
    }
    for (const hit of collectLocalized(BENCHMARK_GROUPS, "benchmark-groups")) expect(hit.en, hit.where).not.toMatch(HANGUL);
  });

  it("최상급·'유일'·'압도'·'대체' 표현이 없다(한국어와 영어)", () => {
    const banned = [
      /유일/u, /압도/u, /대체/u, /최고/u, /최상/u, /최초/u, /1위/u, /독보/u, /완벽/u,
      /\b(?:unique|uniquely|overwhelming|overwhelms|best-in-class|unmatched|unrivaled|world-first|replaces?|replacement)\b/iu,
      /(?:^|\s)#1\b/u,
    ];
    for (const slide of talkSlides) {
      for (const hit of hitsOf(slide)) {
        for (const pattern of banned) {
          expect(hit.ko, `${hit.where} (ko)`).not.toMatch(pattern);
          expect(hit.en, `${hit.where} (en)`).not.toMatch(pattern);
        }
      }
    }
  });

  it("Neon 은 항상 legacy 로 말하고 원장 권위는 Supabase 로 근거 문서와 같다", () => {
    for (const slide of talkSlides) {
      for (const hit of hitsOf(slide)) {
        if (hit.ko.includes("Neon")) expect(hit.ko, `${hit.where} (ko)`).toMatch(/legacy|레거시/u);
        if (hit.en.includes("Neon")) expect(hit.en, `${hit.where} (en)`).toMatch(/legacy/iu);
      }
    }
    const topology = readIfCheckedOut("docs/operations/canonical-database-topology.md");
    if (topology !== null) {
      expect(topology).toMatch(/Core API 영속 원장 \| \*\*Supabase PostgreSQL\*\*[^\n]*\*\*현재 권위\*\*/u);
      expect(topology).toMatch(/기존 Neon[^\n]*\*\*legacy 보존\*\*/u);
    }
    for (const id of ["talk-architecture", "talk-authority", "talk-free-infra", "talk-operations"]) {
      expect(slideOf(id).evidence, id).toContain("docs/operations/canonical-database-topology.md");
      expect(koTextOf(slideOf(id)), id).toContain("Supabase");
    }
  });

  it("AI 하루 기준은 UTC 이고 '한국 시간 자정'이라고 쓰지 않는다", () => {
    for (const hit of hitsOf(slideOf("talk-ai"))) {
      expect(hit.ko, hit.where).not.toMatch(/한국 시간 자정|KST 자정/u);
      expect(hit.en, hit.where).not.toMatch(/Korea(?:n)? (?:time )?midnight/iu);
    }
    const ai = slideOf("talk-ai");
    expect(ai.notes.ko).toContain("UTC 자정");
    expect(ai.notes.ko).toContain("한국 시간 오전 9시");
    expect(ai.notes.en).toContain("UTC midnight");
  });

  it("모든 슬라이드의 한국어·영어 문구와 근거 경로가 비어 있지 않고 비밀값 모양이 없다", () => {
    const secret = [/sk-[A-Za-z0-9]{12,}/u, /ghp_[A-Za-z0-9]{20,}/u, /xox[abprs]-[A-Za-z0-9-]{10,}/u, /-----BEGIN [A-Z ]*PRIVATE KEY-----/u, /Bearer\s+[A-Za-z0-9._-]{20,}/u];
    for (const slide of talkSlides) {
      for (const hit of hitsOf(slide)) {
        expect(hit.ko.trim().length, hit.where).toBeGreaterThan(0);
        expect(hit.en.trim().length, hit.where).toBeGreaterThan(0);
        for (const pattern of secret) expect(hit.en + hit.ko, hit.where).not.toMatch(pattern);
      }
    }
  });
});

describe("세미나 발표 원본: 대본(notes)은 말할 문장이다", () => {
  const spoken = talkSlides.filter((slide) => slide.layout !== "cover" && slide.layout !== "agenda");

  it("한국어 대본은 슬라이드 시간의 50~95%(초당 5자)이고 영어 대본도 있다", () => {
    for (const slide of talkSlides) {
      const budget = slide.seconds * 5;
      expect(slide.notes.ko.length / budget, `${slide.id} 대본 비율`).toBeGreaterThanOrEqual(0.5);
      expect(slide.notes.ko.length / budget, `${slide.id} 대본 비율`).toBeLessThanOrEqual(0.95);
      expect(slide.notes.en.length, `${slide.id} 영어 대본`).toBeGreaterThan(slide.notes.ko.length * 0.8);
    }
  });

  it("질문이 나오면 열 도감 카드를 안내하고 카드 이름이 실제 관련 카드와 같다", () => {
    for (const slide of spoken) {
      const names = (slide.relatedAtlasIds ?? []).map((id) => findAtlasEntry(id)?.name ?? "");
      expect(slide.notes.ko, slide.id).toMatch(/질문이 나오면 ‘[^’]+’ 카드를 엽니다/u);
      expect(names.some((name) => name.length > 0 && slide.notes.ko.includes(`‘${name}’ 카드`)), `${slide.id} (ko) 카드 이름`).toBe(true);
      expect(names.some((name) => name.length > 0 && slide.notes.en.includes(`‘${name}’ card`)), `${slide.id} (en) 카드 이름`).toBe(true);
    }
  });

  it("다음 슬라이드로 넘기는 말, 숫자 하나, 근거 파일 이름이 있다", () => {
    for (const slide of talkSlides) {
      if (slide.layout !== "qa") expect(slide.notes.ko, slide.id).toMatch(/다음은|다음 단계|시작합니다|오늘의 순서/u);
      if (slide.layout !== "qa") expect(slide.notes.en, slide.id).toMatch(/\bNext\b|\bStart\b|first,? today's route/iu);
    }
    for (const slide of spoken) {
      if (slide.layout !== "qa") expect(slide.notes.ko, slide.id).toMatch(/\d/u);
      if (slide.layout === "qa" || !slide.evidence?.length) continue;
      const basenames = slide.evidence.map((path) => path.split("/").at(-1) ?? path);
      expect(basenames.some((name) => slide.notes.ko.includes(name)), `${slide.id}: 근거 파일 이름이 대본에 없음`).toBe(true);
      expect(basenames.some((name) => slide.notes.en.includes(name)), `${slide.id}: 영어 대본에 근거 파일 이름이 없음`).toBe(true);
    }
  });
});

describe("세미나 발표 원본: 요청한 주제를 모두 다룬다", () => {
  /** [주제, 다루는 슬라이드 id, 슬라이드 한국어 글(제목·리드·점·대본)에 있어야 할 낱말들] */
  const TOPICS: readonly (readonly [string, string, readonly RegExp[]])[] = [
    ["드로잉 툴 기술", "talk-drawing", [/획|브러시/u, /펜|압력/u]],
    ["로컬 우선 저장", "talk-local-first", [/OPFS/u, /백업이 아님/u]],
    ["드래그 앤 드롭 구현", "talk-dnd", [/끌/u, /Pointer Events/u]],
    ["실시간 협업", "talk-collaboration", [/CRDT/u, /Yjs/u]],
    ["가상 스튜디오", "talk-virtual-studio", [/Phaser/u, /근접/u]],
    ["WebRTC", "talk-webrtc", [/WebRTC|시그널링/u, /studio-direct-v1/u]],
    ["3D", "talk-3d", [/WebGPU/u, /VRM/u]],
    ["AI 활용", "talk-ai", [/무료/u, /ONNX/u]],
    ["웹의 한계를 넘는 기술", "talk-web-limits", [/COOP/u, /WASM/u]],
    ["차세대 웹 기술", "talk-nextgen-web", [/WebGPU/u, /WebXR/u]],
    ["오픈소스 사용 내역", "talk-open-source", [/React/u, /라이선스/u]],
    ["벤치마크·경쟁 제품", "talk-benchmarks", [/Krita/u, /배운 점/u]],
    ["AI 개발 방식(하네스·OpenWiki·루프)", "talk-ai-dev", [/AGENTS\.md/u, /harness:verify/u, /OpenWiki/u, /루프/u]],
    ["무료 인프라·무료 토큰", "talk-free-infra", [/Cloudflare/u, /Supabase/u, /Render/u, /토큰/u]],
    ["Open API 활용", "talk-open-api", [/Open API/u, /The Met/u, /Poly Haven/u]],
  ];

  it.each(TOPICS)("%s 는 %s 슬라이드에 있다", (_topic, id, words) => {
    const slide = slideOf(id);
    const text = `${koTextOf(slide)}\n${(slide.table?.rows ?? []).flat().map((cell) => cell.ko).join("\n")}`;
    for (const word of words) expect(text, `${id}: ${String(word)}`).toMatch(word);
    expect(slide.relatedAtlasIds?.length, id).toBeGreaterThanOrEqual(2);
  });

  it("상태 배지는 슬라이드가 아니라 챕터·카드·지도 행이 소유한다(한계 슬라이드는 챕터에서 가져온다)", () => {
    const limits = slideOf("talk-limits");
    const chapterIds = new Set<string>(PUBLISHED_ENGINEERING_CHAPTERS.map((chapter) => chapter.id));
    expect(limits.statusChapterIds?.length).toBeGreaterThanOrEqual(5);
    for (const id of limits.statusChapterIds ?? []) expect(chapterIds.has(id), id).toBe(true);
    for (const slide of talkSlides) expect(Object.keys(slide), slide.id).not.toContain("status");
  });
});

describe("세미나 발표 원본: 슬라이드의 수치는 소스와 같다", () => {
  it("협업 서버 방: 연결 64 · 재개 요청 측정 창 10초 · 재생 보존 15분 · 2,048건", () => {
    const slide = slideOf("talk-collaboration");
    const wrangler = read("deploy/cloudflare-realtime/wrangler.jsonc");
    expect(factOf(slide, 0, "방당 최대 연결")).toBe("64");
    expect(wrangler).toContain('"REALTIME_MAX_CONNECTIONS_PER_ROOM": "64"');
    expect(factOf(slide, 1, "재개 요청 측정 창")).toBe("10s");
    expect(wrangler).toContain('"REALTIME_RESUME_WINDOW_MS": "10000"');
    // 같은 창 안에서 받는 재개 요청은 64건·8 MiB 까지다(대본이 말하는 "측정 창"의 뜻).
    expect(wrangler).toContain('"REALTIME_RESUME_MAX_REQUESTS_PER_WINDOW": "64"');
    expect(wrangler).toContain('"REALTIME_RESUME_MAX_BYTES_PER_WINDOW": "8388608"');
    expect(factOf(slide, 2, "놓친 이벤트 재생 보존")).toBe("15분 · 2,048건");
    expect(wrangler).toContain('"REALTIME_EVENT_RETENTION_MS": "900000"');
    expect(wrangler).toContain('"REALTIME_MAX_REPLAY_EVENTS": "2048"');
  });

  it("가상 스튜디오: 화면에 연결된 근접 반경과 정원 사다리, 연결 전인 인사 규칙", () => {
    const slide = slideOf("talk-virtual-studio");
    const dir = "apps/web/src/domains/creator/virtual-space";
    const media = read(`${dir}/hud/space-proximity-media.ts`);
    expect(media).toMatch(/SPACE_PROXIMITY_MEDIA_RADIUS = 168;/u);
    expect(media).toMatch(/SPACE_PROXIMITY_MEDIA_LEAVE_RADIUS = 216;/u);
    expect(factOf(slide, 0, "근접 영상")).toBe("168 / 216px");
    const helpers = read(`${dir}/studio-virtual-space-page-helpers.ts`);
    expect(helpers).toMatch(/TALK_DISTANCE = 120;/u);
    expect(helpers).toMatch(/SHARED_ACTIVITY_DISTANCE = 156;/u);
    expect(factOf(slide, 1, "근처 대화")).toBe("120 / 156px");
    expect(read(`${dir}/studio-virtual-space-chat.ts`)).toMatch(/STUDIO_CHAT_NEARBY_RADIUS_PX = 200;/u);
    expect(factOf(slide, 2, "근처 채팅")).toBe("200px");

    // 인사 160/220px 규칙은 코드와 테스트만 있고 제품 코드가 쓰지 않는다 — 연결되면 슬라이드 문구를 고쳐야 한다.
    const proximity = read(`${dir}/studio-virtual-space-proximity.ts`);
    expect(proximity).toMatch(/STUDIO_PROXIMITY_GREET_RADIUS = 160;/u);
    expect(proximity).toMatch(/STUDIO_PROXIMITY_FAREWELL_RADIUS = 220;/u);
    const proximityFile = `${dir}/studio-virtual-space-proximity.ts`;
    for (const word of ["updateStudioProximity", "summarizeStudioProximity", "STUDIO_PROXIMITY_GREET_RADIUS"]) {
      const users = gitGrepFiles(word, "apps/web/src").filter((file) => file !== proximityFile && !/\.test\.tsx?$/u.test(file));
      expect(users, `${word} 를 쓰는 제품 코드`).toEqual([]);
    }
    expect(koTextOf(slide)).toContain("160/220px");
    expect(slide.points.map((point) => point.ko).join("\n")).toMatch(/160\/220px[^\n]*연결 전/u);

    // 정원 사다리: DO 방 64 · 소셜 피어 23 · 데이터 메시 8 · 허들 3.
    expect(read("deploy/cloudflare-realtime/wrangler.jsonc")).toContain('"REALTIME_MAX_CONNECTIONS_PER_ROOM": "64"');
    expect(read(`${dir}/studio-virtual-space-social.ts`)).toMatch(/const MAX_PEERS = 23;/u);
    expect(read("apps/web/src/domains/creator/live/studio-live-p2p-overlay-transport.ts")).toMatch(/STUDIO_LIVE_P2P_MAX_PEERS = 8;/u);
    expect(read("apps/web/src/domains/creator/live/huddle/studio-p2p-huddle-protocol.ts")).toContain("HUDDLE_MAX_REMOTE_PEERS = 3;");
    expect(slide.points.map((point) => point.ko).join("\n")).toContain("DO 방 64 · 소셜 피어 23 · 데이터 메시 8 · 허들 3");

    // Phaser: 라우트는 지연 로딩, 캔버스는 동적 import, 그러나 정적 import 1건이 남아 분리는 단정하지 못한다.
    expect(read("apps/web/src/app/routes/groups/creator-route-pages.ts")).toMatch(/StudioVirtualSpacePage = lazyRetry\(/u);
    expect(read(`${dir}/StudioVirtualSpacePhaserCanvas.tsx`)).toContain('await import("phaser")');
    expect(read(`${dir}/studio-virtual-space-sprite-crossfade-runtime.ts`)).toMatch(/^import Phaser from "phaser";/mu);
    expect(gitGrepFiles("studio-virtual-space-sprite-crossfade-runtime", "apps/web/src").filter((file) => !/\.test\.tsx?$/u.test(file) && !file.includes("/domains/legal/technology/"))).toEqual([
      `${dir}/StudioVirtualSpacePhaserCanvas.tsx`,
    ]);
    expect(slide.points.map((point) => point.ko).join("\n")).toContain("정적 import 1건이 남아");
  });

  it("WebRTC: 서버 시그널링 범위, 직통 레인, 서버 음성 릴레이 꺼짐, 정원 숫자", () => {
    const slide = slideOf("talk-webrtc");
    expect(read("apps/web/src/domains/creator/live/studio-live-direct-port.ts")).toContain('STUDIO_DIRECT_WIRE = "studio-direct-v1"');
    const voice = [...read("render.yaml").matchAll(/key: STUDIO_LIVE_VOICE_ENABLED\s+value: "(\w+)"/gu)].map((match) => match[1]);
    expect(voice.length).toBeGreaterThan(0);
    expect(new Set(voice)).toEqual(new Set(["false"]));
    const text = koTextOf(slide);
    expect(text).toContain("studio-direct-v1");
    expect(text).toContain("STUDIO_LIVE_VOICE_ENABLED=false");
    // "Socket.IO 가 시그널링이다"라고 단정하지 않는다(대본은 오히려 그 말이 부정확하다고 말한다).
    expect(text).not.toMatch(/Socket\.IO(?:가|는) 시그널링(?:입니다|이다|서버)/u);
    expect(slide.notes.ko).toContain("부정확");
    expect(factOf(slide, 0, "허들 원격")).toBe("3");
    expect(factOf(slide, 1, "직통 데이터 메시")).toBe("8");
    expect(factOf(slide, 2, "소셜 피어")).toBe("23");
    expect(factOf(slide, 3, "방당 연결 상한")).toBe("64");
    expect(read("apps/web/src/domains/creator/live/huddle/studio-p2p-huddle-protocol.ts")).toContain("HUDDLE_MAX_REMOTE_PEERS = 3;");
  });

  it("AI: 우리가 건 안전 상한(경로마다, UTC 하루)과 모호한 실패 재전송 금지의 근거 테스트", () => {
    const slide = slideOf("talk-ai");
    const budget = read("apps/web/src/shared/ai/free-ai-runtime-budget.ts");
    expect(budget).toMatch(/MANAGED_FREE_DAILY_REQUEST_LIMIT = 25;/u);
    expect(budget).toMatch(/MANAGED_FREE_DAILY_RESERVED_TOKEN_LIMIT = 64_000;/u);
    expect(budget).toMatch(/MANAGED_FREE_MAX_OUTPUT_TOKENS = 1_024;/u);
    expect(budget).toContain("toISOString().slice(0, 10)");
    expect(budget).toContain("return `${host}:${routeId}`");
    expect(budget).toContain("not provider-advertised quotas");
    expect(factOf(slide, 0, "경로당")).toBe("25");
    expect(factOf(slide, 1, "경로당")).toBe("64,000");
    expect(factOf(slide, 2, "출력 토큰")).toBe("1,024");
    expect(slide.points.map((point) => point.ko).join("\n")).toMatch(/경로마다 하루 25회 · 예약 토큰 64,000 · 출력 1,024/u);
    // 모호한 실패는 다른 키·모델로 다시 보내지 않는다 — 근거 테스트가 실제로 그 약속을 검사한다.
    // (서버 쪽 근거 테스트는 다른 앱 경로라 이 테스트가 직접 읽지 않고, 슬라이드의 근거 경로가 실제로 있는지만 아래에서 확인한다.)
    expect(read("apps/web/src/shared/ai/user-ai-transport.test.ts")).toContain("does not retry an ambiguous provider failure on another key or model");
    const lessons = slideOf("talk-lessons").evidence ?? [];
    expect(lessons).toContain("apps/web/src/shared/ai/user-ai-transport.test.ts");
    expect(lessons.filter((path) => /studio-ai-provider\.test\.ts$/u.test(path))).toHaveLength(1);
  });

  it("품질: 파일 수·워크플로·래칫 상한과 실측·큐레이션 대상·접근성 서술", () => {
    const slide = slideOf("talk-quality");
    const webTests = gitFiles("apps/web").filter((path) => /\.test\.(?:ts|tsx|mts)$/u.test(path)).length;
    expect(factOf(slide, 0, "웹 테스트 파일")).toBe("5,300+");
    expect(webTests).toBeGreaterThanOrEqual(5300);
    expect(gitFiles("e2e").filter((path) => /\.spec\.(?:ts|mts)$/u.test(path)).length).toBe(Number(factOf(slide, 1, "E2E 스펙")));
    expect(gitFiles(".github/workflows").filter((path) => /\.ya?ml$/u.test(path)).length).toBe(Number(factOf(slide, 2, "워크플로")));

    const ratchetSource = read("config/architecture-boundary-ratchet.json");
    const ratchet = JSON.parse(ratchetSource) as Record<string, number>;
    for (const key of ["webToAdmin", "webToApi", "adminToWeb", "adminToApi", "apiToWeb", "apiToAdmin"]) expect(ratchet[key], key).toBe(0);
    expect(factOf(slide, 3, "앱 간 직접 import")).toBe("0");
    const shared = ratchet.webSharedToDomain;
    const deep = ratchet.webCrossDomainDeepImport;
    for (const locale of ["ko", "en"] as const) {
      expect(slide.notes[locale], locale).toContain(`(${shared})`);
      expect(slide.notes[locale], locale).toContain(`(${deep})`);
    }
    // 깊은 import 실측은 검증 스크립트가 직접 센 값이다(상한 이하여야 한다).
    // 다른 래칫(예: 앱 간 테스트 참조)이 넘쳐 스크립트가 실패해도 깊은 import 실측 줄은 출력되므로, 종료 코드와 상관없이 출력만 읽는다.
    const report = spawnSync("node", ["scripts/validate-app-boundaries.mjs"], { encoding: "utf8" }).stdout;
    const measured = Number(/webCrossDomainDeepImport: (\d+)\/(\d+)/u.exec(report)?.[1]);
    expect(Number.isInteger(measured)).toBe(true);
    expect(measured).toBeLessThanOrEqual(deep ?? 0);
    expect(slide.notes.ko).toContain(`실측은 ${measured}입니다`);
    expect(slide.notes.en).toContain(`measured deep imports are ${measured}`);
    expect(slide.points.map((point) => point.ko).join("\n")).toContain(`실측은 ${measured}`);

    const targets = read("scripts/ci-required-vitest-targets.txt").split("\n").filter((line) => line.trim() && !line.trim().startsWith("#")).length;
    expect(slide.points.map((point) => point.ko).join("\n")).toContain(`${targets}개 대상`);
    const required = /const required = \[([^\]]*)\];/u.exec(read(".github/workflows/ci.yml"))?.[1]?.split(",").length;
    expect(required).toBe(Number(factOf(slideOf("talk-ai-dev"), 1, "필수 검사")));

    // 접근성: 코어 필수 게이트(pnpm run test:a11y)는 기본 Playwright 설정의 axe 스모크라 모션 감소·강제 색상·키보드 점검이 그 안에 없다.
    expect(read("package.json")).toMatch(/"test:a11y": "[^"]*playwright test e2e\/a11y-smoke\.spec\.ts"/u);
    expect(read("package.json")).not.toMatch(/"test:a11y": "[^"]*--config/u);
    expect(read("playwright.config.ts")).not.toContain("reducedMotion");
    expect(read("e2e/a11y-smoke.spec.ts")).not.toMatch(/keyboard\.|\.press\(|forcedColors|forced-colors/u);
    expect(slide.notes.ko).toMatch(/axe 스모크\(기본 설정, 모션 감소 없음\)[^\n]*모션 감소·강제 색상은 수동[^\n]*키보드 점검은 스모크에 없습니다/u);
  });

  it("성능: 번들 기준선과 참고 예산, +2% 래칫은 기준선·검사 스크립트와 같다", () => {
    const slide = slideOf("talk-performance");
    const baseline = JSON.parse(read("scripts/bundle-baseline.json")) as {
      readonly policy: { readonly byteTolerance: number };
      readonly static: Readonly<Record<string, number>>;
    };
    const checker = read("scripts/check-studio-bundle.mjs");
    const budget = (key: string): number => Number(new RegExp(`^\\s+${key}: \\{ raw: ([\\d_]+),`, "mu").exec(checker)?.[1]?.replace(/_/gu, ""));
    const mib = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
    const app = baseline.static["app entry raw"] ?? 0;
    const studio = baseline.static["Studio route raw"] ?? 0;
    expect(factOf(slide, 0, "참고 예산(0.5 MiB)")).toBe(mib(app));
    expect(mib(budget("app"))).toBe("0.5 MiB");
    expect(factOf(slide, 1, "참고 예산(2.9 MiB)")).toBe(mib(studio));
    expect(mib(budget("studio"))).toBe("2.9 MiB");
    // "참고 예산의 2.5배" — 두 배율 모두 소수 첫째 자리까지 2.5다. 예산은 관찰용이고 이미 넘었다.
    expect((app / budget("app")).toFixed(1)).toBe("2.5");
    expect((studio / budget("studio")).toFixed(1)).toBe("2.5");
    expect(app).toBeGreaterThan(budget("app"));
    expect(studio).toBeGreaterThan(budget("studio"));
    expect(slide.facts?.[0]?.label.ko).toContain("2.5배");
    expect(slide.facts?.[1]?.label.ko).toContain("2.5배");
    expect(baseline.policy.byteTolerance).toBe(0.02);
    expect(factOf(slide, 2, "마지막 승인 측정")).toBe("+2%");
    expect(factOf(slide, 3, "정적 청크 수")).toBe(String(baseline.static["Studio route chunks"]));
    expect(repoPathExists("docs/perf/bundle-gate.md")).toBe(true);
  });

  it("AI 개발 방식: AGENTS.md 10개, 필수 검사 7개, 루프 명령 23개, OpenWiki 주 1회 PR", () => {
    const slide = slideOf("talk-ai-dev");
    const harness = read("scripts/agent-harness.mjs");
    const requiredFiles = /const REQUIRED_FILES = \[([^\]]*)\];/u.exec(harness)?.[1] ?? "";
    expect(requiredFiles.match(/"(?:[^"]*\/)?AGENTS\.md"/gu)).toHaveLength(Number(factOf(slide, 0, "AGENTS.md")));
    expect(factOf(slide, 1, "필수 검사")).toBe("7");
    const commands = readdirSync(".opencode/command").filter((name) => name.startsWith("loop") && name.endsWith(".md"));
    expect(commands).toHaveLength(Number(factOf(slide, 2, "loop 명령")));
    expect(read("opencode.json")).toContain("@bybrawe/opencode-loop");
    const wiki = read(".github/workflows/openwiki-update.yml");
    expect(wiki).toMatch(/cron: "[^"]+"/u);
    expect(wiki).toContain("never auto-merges");
    expect(slide.points.map((point) => point.ko).join("\n")).toMatch(/주 1회 PR\(자동 병합 없음\)/u);
    expect(slide.points.map((point) => point.ko).join("\n")).toContain("실행 기록과 효과 수치는 확인 못 해");
  });

  it("운영: 무료 플랜·자동 배포 꺼짐, 40자리 SHA 승인, 워크플로 배포 명령 차단 스캐너", () => {
    const render = read("render.yaml");
    expect(render).toMatch(/plan: free/u);
    expect(render).toMatch(/autoDeployTrigger: "off"/u);
    expect(read("scripts/deploy-cloudflare-static.mjs")).toContain("[0-9a-f]{40}");
    expect(read("scripts/release-workflow-policy.mjs")).toContain("export function validateReleaseWorkflows");
    const slide = slideOf("talk-operations");
    expect(slide.evidence).toContain("scripts/release-workflow-policy.mjs");
    expect(koTextOf(slide)).toContain("40자리");
    expect(koTextOf(slide)).toContain("autoDeployTrigger");
  });

  it("로컬 저장·드로잉·3D·차세대 웹·아키텍처·오픈소스 숫자", () => {
    // 로컬 저장: 편집이 멈춘 뒤 1.5초에 OPFS 우선 저장을 부른다.
    const host = read("apps/web/src/domains/creator/StudioCuttoonEditorHost.tsx");
    const at = host.indexOf("persistStudioAutosaveWithOpfsPrimary({");
    expect(at).toBeGreaterThan(0);
    expect(host.slice(at, at + 6000)).toMatch(/\}, 1500\);/u);
    expect(findAtlasEntry("autosave-crash-recovery-journal")?.tagline.ko).toContain("1.5초");
    expect(koTextOf(slideOf("talk-local-first"))).toContain("1.5초");
    expect(koTextOf(slideOf("talk-local-first"))).toContain("백업이 아님");

    // 드로잉: 묶여 온 이벤트의 앞부분 중복은 직전 128개와 비교한다.
    expect(read("apps/web/src/domains/creator/canvas/studio-pointer-input.ts")).toMatch(/PREVIOUS_DELIVERY_SAMPLE_LIMIT = 128;/u);
    expect(koTextOf(slideOf("talk-drawing"))).toContain("128개");

    // 끌어 놓기: 끌어 놓기 라이브러리 0개(루트 package.json 의 의존성에 dnd·sortable·draggable 이름이 없다).
    const manifest = JSON.parse(read("package.json")) as { readonly dependencies?: Readonly<Record<string, string>>; readonly devDependencies?: Readonly<Record<string, string>> };
    const dependencyNames = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });
    expect(dependencyNames.length).toBeGreaterThan(10);
    expect(dependencyNames.filter((name) => /dnd|sortable|draggable|beautiful/iu.test(name))).toEqual([]);
    expect(koTextOf(slideOf("talk-dnd"))).toContain("라이브러리는 0개");

    // 3D: 같은 VRM 의 합성 색 차이가 최대 169/255 (번들 VRM 1개 실측).
    const divergence = readIfCheckedOut("docs/studio-bg3d-vrm-mtoon-backend-color-divergence-2026-08-29.md");
    if (divergence !== null) expect(divergence).toMatch(/164–169 \/ 255/u);
    expect(koTextOf(slideOf("talk-3d"))).toContain("169/255");

    // 차세대 웹: 능력 감지 27종, 사용자가 끌 수 있는 것 3개.
    expect(NEXTGEN_CAPABILITY_IDS).toHaveLength(27);
    expect(Object.keys(NEXTGEN_LAB_DEFAULTS)).toHaveLength(3);
    const nextgen = koTextOf(slideOf("talk-nextgen-web"));
    expect(nextgen).toContain("27종");
    expect(nextgen).toContain("3개");

    // 아키텍처: Worker 가 먼저 받는 경로 26개, 오픈소스 117개. 고쳐 쓴 의존성(pnpm 패치·포크)은 개수를 슬라이드에 쓰지 않는다.
    const staticConfig = read("deploy/cloudflare-static/wrangler.jsonc");
    const workerFirst = /"run_worker_first":\s*\[([^\]]*)\]/u.exec(staticConfig)?.[1] ?? "";
    expect(workerFirst.match(/"[^"]+"/gu)).toHaveLength(26);
    expect(slideOf("talk-architecture").notes.ko).toContain("26개");
    expect(slideOf("talk-architecture").notes.en).toContain("26 worker-first");
    const openSource = findEngineeringMap("open-source");
    expect(openSource?.intro.ko).toContain("117개");
    expect(openSource?.intro.ko).toContain("2026-10-07");
    const ossSlide = slideOf("talk-open-source");
    expect(ossSlide.lead.ko).toContain("117개");
    expect(ossSlide.lead.ko).toContain("2026-10-07");
    expect(ossSlide.table?.caption?.ko).toContain("117곳");
    // Google Ink: 라이브 획의 "예측 꼬리 미리보기 섬"으로만 연결돼 있고 확정 픽셀의 주인은 Canvas2D 확정 경로다(코드 필드 canvas2d-perfect-freehand는 G펜·퍼펙트 계열 기준).
    // 코드가 바뀌어 확정 획에 쓰이거나 연결이 끊기면 표의 한 줄(Google Ink 행)을 다시 써야 한다.
    const inkPreview = read("apps/web/src/domains/creator/brush/studio-ink-mesh-live-preview.ts");
    expect(inkPreview).toContain("replaceable predicted tail");
    expect(inkPreview).toContain('retainedPixelAuthority: "canvas2d-perfect-freehand"');
    expect(read("apps/web/src/domains/creator/studio-cuttoon-editor/studio-live-surface-start.ts")).toContain("inkMeshLivePreviewRuntimeRef.current?.begin(");
    const inkRow = ossSlide.table?.rows.find((row) => row[0]?.ko === "Google Ink");
    expect(inkRow?.[1]?.ko).toContain("확정 획엔 미연결");
    expect(inkRow?.[1]?.ko).toContain("예측 꼬리 미리보기");
    expect(inkRow?.[1]?.en).toContain("not in committed strokes");

    // 고쳐 쓴 의존성은 pnpm 패치와 포크로 기록한다. 개수는 바뀌기 쉬워 슬라이드는 개수를 쓰지 않고, 쓴다면 pnpm-workspace.yaml 과 같아야 한다.
    const patched = /patchedDependencies:\n((?:\s+.+\n)+)/u.exec(read("pnpm-workspace.yaml"))?.[1] ?? "";
    const patchCount = patched.split("\n").filter((line) => /^\s+\S.*: patches\//u.test(line)).length;
    expect(patchCount).toBeGreaterThan(0);
    expect(ossSlide.notes.ko).toContain("pnpm 패치");
    expect(ossSlide.notes.en).toContain("pnpm patch");
    for (const text of [ossSlide.notes.ko, ossSlide.notes.en, ossSlide.lead.ko, ossSlide.lead.en, ossSlide.table?.caption?.ko ?? "", ossSlide.table?.caption?.en ?? ""]) {
      for (const match of text.matchAll(/(?:패치|patches)\s*(\d+)|(\d+)\s*(?:개의 패치|patches)/gu)) {
        expect(Number(match[1] ?? match[2]), `패치 개수 문구 "${match[0]}"`).toBe(patchCount);
      }
    }
    // 손으로 쓴 THIRD_PARTY_NOTICES.md 는 직접 의존성의 일부만 담은 목록이다(전체는 빌드가 만드는 고지). 근거라고만 말하지 않는다.
    expect(ossSlide.notes.ko).toContain("일부만 담은 목록");
    expect(ossSlide.notes.en).toContain("only a partial list");
  });
});

/* ── 표는 지도·도감에서 옮긴 것이다 ─────────────────────────────────────────── */

function collectKo(value: unknown): string {
  return collectLocalized(value, "source").map((hit) => hit.ko).join("\n");
}

function mapRowText(row: EngineeringMapRow): string {
  return [row.name, row.asOf ?? "", ...Object.values(row.cells).map((cell) => cell.ko)].join("\n");
}

function columnIndex(slide: TalkSlide, ko: string): number {
  return slide.table?.columns.findIndex((column) => column.ko === ko) ?? -1;
}

function expectStatusCell(slide: TalkSlide, rowIndex: number, status: EngineeringStatus | undefined, label: string): void {
  const index = columnIndex(slide, "상태");
  expect(index, `${slide.id} 상태 열`).toBeGreaterThanOrEqual(0);
  expect(status, label).toBeDefined();
  const cell = slide.table?.rows[rowIndex]?.[index];
  if (!status) return;
  expect(cell?.ko.startsWith(ENGINEERING_STATUS_META[status].label.ko), `${label} 상태 칸 (ko)`).toBe(true);
  expect(cell?.en.startsWith(ENGINEERING_STATUS_META[status].label.en), `${label} 상태 칸 (en)`).toBe(true);
}

describe("세미나 발표 원본: 표는 지도·도감 카드에서 옮겨 온 것이다", () => {
  const tableSlides = talkSlides.filter((slide) => slide.table);

  it("표 슬라이드마다 근거가 있고 근거 없는 표는 없다", () => {
    expect(tableSlides.map((slide) => slide.id).sort()).toEqual(Object.keys(TALK_TABLE_SOURCES).sort());
  });

  it("모든 칸의 숫자는 한국어·영어가 같고 근거 행·카드 글에서 찾을 수 있다", () => {
    for (const slide of tableSlides) {
      const source = TALK_TABLE_SOURCES[slide.id];
      if (!source || source.kind === "map-grouped") continue;
      const rows = slide.table?.rows ?? [];
      const sourceTexts = source.kind === "map"
        ? source.rowIds.map((id) => {
          const row = findEngineeringMap(source.mapId)?.rows.find((item) => item.id === id);
          expect(row, `${slide.id}: 지도 행 ${id}`).toBeDefined();
          return row ? mapRowText(row) : "";
        })
        : source.cardIds.map((id) => {
          const entry = findAtlasEntry(id);
          expect(entry, `${slide.id}: 카드 ${id}`).toBeDefined();
          return entry ? `${entry.name}\n${collectKo(entry)}` : "";
        });
      expect(sourceTexts.length, `${slide.id}: 근거 개수`).toBe(rows.length);
      rows.forEach((row, rowIndex) => {
        const name = row[0]?.ko ?? "";
        row.forEach((cell) => {
          expect(numberTokens(cell.en).sort(), `${slide.id} ${name}: 한국어·영어 숫자`).toEqual(numberTokens(cell.ko).sort());
          for (const token of numberTokens(cell.ko)) {
            expect(hasNumber(sourceTexts[rowIndex] ?? "", token), `${slide.id} ${name}: 근거에 없는 숫자 ${token} ("${cell.ko}")`).toBe(true);
          }
        });
      });
    }
  });

  it("상태 칸은 근거 지도 행·도감 카드의 상태와 같다", () => {
    for (const slide of tableSlides) {
      const source = TALK_TABLE_SOURCES[slide.id];
      if (!source || source.kind === "map-grouped") continue;
      if (source.kind === "map") {
        const map = findEngineeringMap(source.mapId);
        source.rowIds.forEach((id, rowIndex) => expectStatusCell(slide, rowIndex, map?.rows.find((row) => row.id === id)?.status, `${slide.id}: ${id}`));
      } else {
        source.cardIds.forEach((id, rowIndex) => expectStatusCell(slide, rowIndex, findAtlasEntry(id)?.status, `${slide.id}: ${id}`));
      }
    }
  });

  it("지도 행을 옮긴 표: 이름·라이선스·기록일이 근거와 같다", () => {
    for (const slide of tableSlides) {
      const source = TALK_TABLE_SOURCES[slide.id];
      if (source?.kind !== "map") continue;
      const map = findEngineeringMap(source.mapId);
      source.rowIds.forEach((id, rowIndex) => {
        const row = map?.rows.find((item) => item.id === id);
        const cells = slide.table?.rows[rowIndex] ?? [];
        expect(cells[0]?.ko, `${slide.id}: ${id} 이름`).toBe(row?.name);
        expect(cells[0]?.en, `${slide.id}: ${id} 이름(en)`).toBe(row?.name);
        const license = columnIndex(slide, "라이선스");
        if (license >= 0) {
          const expected = row?.cells.license?.ko ?? "";
          expect(cells[license]?.ko.startsWith(expected), `${id} 라이선스 "${cells[license]?.ko}" ← "${expected}"`).toBe(true);
          // 비상업(NC) 조건이 붙은 것은 판단하지 않고 '별도 확인'으로 남긴다.
          if (/-NC-/u.test(expected)) expect(cells[license]?.ko, id).toContain("별도 확인");
        }
        const dated = slide.table?.columns.findIndex((column) => column.ko.includes("기록일")) ?? -1;
        if (dated >= 0) {
          expect(row?.asOf, `${id} 기록일`).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
          expect(cells[dated]?.ko.endsWith(`· ${(row?.asOf ?? "").slice(5)}`), `${id} 기록일 칸 "${cells[dated]?.ko}"`).toBe(true);
          expect(cells[dated]?.en.endsWith(`· ${(row?.asOf ?? "").slice(5)}`), `${id} 기록일 칸(en) "${cells[dated]?.en}"`).toBe(true);
        }
      });
    }
  });

  it("개수 문구는 지도에서 센 값이다(무료 서비스 26곳, Open API 43곳과 상태별 수)", () => {
    const freeTier = findEngineeringMap("free-tier");
    const freeSlide = slideOf("talk-free-infra");
    expect(freeSlide.table?.caption?.ko).toContain(`${freeTier?.rows.length}곳 중 대표 ${freeSlide.table?.rows.length}곳`);
    expect(freeSlide.table?.caption?.en).toContain(`${freeSlide.table?.rows.length} of ${freeTier?.rows.length} services`);

    const openApi = findEngineeringMap("open-api");
    const apiSlide = slideOf("talk-open-api");
    const count = (status: EngineeringStatus): number => openApi?.rows.filter((row) => row.status === status).length ?? 0;
    expect(apiSlide.table?.caption?.ko).toContain(`${openApi?.rows.length}곳 중 대표 ${apiSlide.table?.rows.length}곳`);
    for (const status of ["live", "configured", "documented"] as const) {
      expect(apiSlide.lead.ko).toContain(`${ENGINEERING_STATUS_META[status].label.ko} ${count(status)}`);
    }
    expect(apiSlide.lead.ko).toContain(`${openApi?.rows.length}곳 중`);
    expect(count("live") + count("configured") + count("documented")).toBe(openApi?.rows.length);
    // 우리가 밖에 여는 쪽(개발자 Open API)은 계약 선언까지만 있다.
    expect(apiSlide.table?.rows.at(-1)?.[3]?.ko.startsWith(ENGINEERING_STATUS_META.documented.label.ko)).toBe(true);
    expect(openApi?.rows.find((row) => row.id === "developer-manifest")?.cells.guard?.ko).toContain("API 키·OAuth 앱·scope 강제");
  });
});

describe("세미나 발표 원본: 벤치마크 지도 표", () => {
  const map = findEngineeringMap("competitors");
  const rows = map?.rows ?? [];
  const studied = rows.filter((row) => !isUnresearchedCompetitorRow(row));
  const slide = slideOf("talk-benchmarks");
  const tableRows = slide.table?.rows ?? [];
  const countIn = (label: string | undefined): number => Number(/\((\d+)\)$/u.exec(label ?? "")?.[1]);
  const domainLabel = (id: string): string => (D as Readonly<Record<string, { readonly ko: string }>>)[id]?.ko ?? "";

  it("참고한 제품 이름을 지도 요약에서 받아 보여 주고 감시 목록에만 있는 제품은 참고로 세지 않는다", () => {
    expect(rows.length).toBeGreaterThan(0);
    // 개수는 지도 행과 지도 요약(COMPETITOR_COUNTS)이 센 값과 같다.
    expect(BENCHMARK_PLAN.total).toBe(rows.length);
    expect(BENCHMARK_PLAN.total).toBe(COMPETITOR_COUNTS.total);
    expect(BENCHMARK_PLAN.studied).toBe(studied.length);
    expect(BENCHMARK_PLAN.studied).toBe(COMPETITOR_COUNTS.studied);
    expect(BENCHMARK_PLAN.watchOnly).toBe(COMPETITOR_COUNTS.unresearched);
    expect(tableRows.length).toBeLessThanOrEqual(TALK_TABLE_MAX_ROWS);
    const shown = new Set(tableRows.flatMap((row) => (row[1]?.ko ?? "").replace(/, 외 \d+곳$/u, "").split(", ")));
    const english = new Set(tableRows.flatMap((row) => (row[1]?.en ?? "").replace(/, \+\d+ more$/u, "").split(", ")));
    // 이름이 예산 안이면 비교 기록이 있는 모든 제품이 표에 있다. 예산을 넘으면 앞쪽만 남기고 나머지는 "외 N곳"으로 센다.
    if (BENCHMARK_PLAN.omitted === 0) {
      for (const row of studied) {
        expect(shown.has(row.name), `${row.name} (ko)`).toBe(true);
        expect(english.has(row.name), `${row.name} (en)`).toBe(true);
      }
    } else {
      expect(shown.size + BENCHMARK_PLAN.omitted, "보이는 이름 + 외 N곳 = 참고한 제품 수").toBe(studied.length);
      BENCHMARK_PLAN.areas.forEach((area, index) => {
        const cell = tableRows[index]?.[1]?.ko ?? "";
        expect(cell.endsWith(`, 외 ${area.omitted}곳`), `${area.key}: 예산을 넘긴 영역은 외 N곳으로 끝난다`).toBe(area.omitted > 0);
      });
    }
    for (const row of rows.filter(isUnresearchedCompetitorRow)) {
      expect(shown.has(row.name), `감시 목록 ${row.name}`).toBe(false);
      expect(/미조사|감시 목록|대상 목록/u.test(row.cells.learned?.ko ?? ""), row.name).toBe(true);
    }
    // 영역 칸의 괄호 숫자(제품 수)의 합은 참고한 제품 수다.
    expect(tableRows.reduce((sum, row) => sum + countIn(row[0]?.ko), 0)).toBe(studied.length);
    // 지도의 모든 이름은 라틴 문자다(영어 화면에 그대로 쓴다). 한글 이름이 생기면 영어 표기를 더해야 한다.
    for (const row of rows) expect(row.name, row.id).not.toMatch(HANGUL);
  });

  it("영역 묶음은 8개 이하이고 지도의 모든 영역이 어딘가에 들어간다", () => {
    expect(BENCHMARK_GROUPS.length).toBeLessThanOrEqual(TALK_TABLE_MAX_ROWS);
    expect(BENCHMARK_GROUPS.filter((group) => group.catchAll)).toHaveLength(1);
    expect(BENCHMARK_GROUPS.at(-1)?.catchAll).toBe(true);
    const known = new Set(BENCHMARK_GROUPS.flatMap((group) => group.domainIds));
    expect(new Set([...known]).size, "영역 키는 한 묶음에만 든다").toBe(BENCHMARK_GROUPS.flatMap((group) => group.domainIds).length);
    const unknown = COMPETITOR_DOMAIN_SUMMARY.map((domain) => domain.domainId).filter((id) => !known.has(id));
    // 모르는 영역이 생겨도 마지막 묶음이 받는다(이름이 사라지지 않는다).
    expect(tableRows.reduce((sum, row) => sum + countIn(row[0]?.ko), 0), `묶음에 없는 영역: ${unknown.join(",")}`).toBe(studied.length);
    // 묶음이 쓰는 영역 키는 지도 영역 정의(D)에 실제로 있다(오타로 이름이 마지막 묶음에 쏠리지 않는다).
    for (const id of BENCHMARK_GROUPS.flatMap((group) => group.domainIds)) expect(domainLabel(id), id).not.toBe("");
  });

  it("제목·리드의 개수는 계산한 값이고 전체는 기술 지도에서 보게 안내한다", () => {
    expect(slide.title.ko).toContain(`${BENCHMARK_PLAN.studied}곳`);
    expect(slide.title.en).toContain(`${BENCHMARK_PLAN.studied} products`);
    expect(slide.lead.ko).toContain(`${BENCHMARK_PLAN.studied}곳`);
    expect(slide.lead.ko).toContain("기술 지도에서");
    if (BENCHMARK_PLAN.watchOnly > 0) {
      expect(slide.lead.ko).toContain(`전체 ${BENCHMARK_PLAN.total}곳`);
      expect(slide.lead.ko).toContain(`${BENCHMARK_PLAN.watchOnly}곳`);
      expect(slide.lead.en).toContain(`all ${BENCHMARK_PLAN.total}`);
    }
    expect(slide.notes.ko).toContain(`${BENCHMARK_PLAN.studied}곳`);
    expect(slide.notes.en).toContain(`${BENCHMARK_PLAN.studied} benchmarked`);
  });

  it("배운 점 한 줄은 지도 행의 learned 칸에서 근거를 찾을 수 있다", () => {
    /** 묶음 키 → [지도 learned 칸에서 찾을 말, 슬라이드 한 줄에 있어야 할 말] 쌍들. */
    const GROUNDING: Readonly<Record<string, readonly (readonly [RegExp, RegExp])[]>> = {
      "drawing-animation": [[/손 떨림 보정/u, /손떨림 보정/u], [/비파괴/u, /비파괴/u], [/가져오지 않/u, /가져오지 않/u], [/변형/u, /변형/u]],
      "three-d": [[/품질 기준/u, /품질 기준/u], [/포즈/u, /포즈/u], [/런타임·자산을 넣지 않/u, /런타임·자산은 넣지 않/u]],
      collaboration: [[/커서/u, /커서/u], [/근접 대화/u, /근접 대화/u], [/P2P/u, /P2P/u], [/동등/u, /동등/u]],
      "storyboard-design": [[/검토 상태/u, /검토 상태/u], [/검토 링크/u, /검토 링크/u], [/템플릿/u, /템플릿/u]],
      publishing: [[/예약/u, /예약/u], [/분석/u, /분석/u], [/수익 동기화를 주장하지 않/u, /수익 연동은 주장하지 않/u]],
      ai: [[/다른 공급자로 다시 보내지 않/u, /다시 보내지 않/u], [/자동 라우팅|라우터/u, /라우팅/u]],
      engines: [[/미리 고르는|엔진 하나만 고르고/u, /미리 하나를 고르고/u], [/자동 폴백하지 않/u, /몰래 갈아타지 않/u], [/채택하지 않/u, /채택하지 않/u]],
    };
    for (const group of BENCHMARK_GROUPS) {
      const pairs = GROUNDING[group.key];
      if (!pairs) {
        expect(group.catchAll, `${group.key} 는 근거 쌍이 없으므로 안내 문구여야 한다`).toBe(true);
        expect(group.learned.ko).toContain("기술 지도에서");
        continue;
      }
      const labels = new Set(group.domainIds.map(domainLabel));
      const mapText = rows
        .filter((row) => labels.has(row.cells.domain?.ko ?? "") && !isUnresearchedCompetitorRow(row))
        .map((row) => row.cells.learned?.ko ?? "")
        .join("\n");
      for (const [inMap, inSlide] of pairs) {
        expect(mapText, `${group.key} 지도 learned 칸에서 ${String(inMap)}`).toMatch(inMap);
        expect(group.learned.ko, `${group.key} 슬라이드 한 줄에서 ${String(inSlide)}`).toMatch(inSlide);
      }
      expect(group.learned.ko.length, group.key).toBeLessThanOrEqual(45);
      expect(group.learned.ko).not.toMatch(/대체|동등하|우위|최고|1위/u);
    }
  });

  it("예산을 넘는 지도에서도 영역마다 앞쪽 이름만 남기고 '외 N곳'으로 센다(가짜 영역으로 확인)", () => {
    const ids = ["drawing", "threeD", "collab", "brand-new-area"];
    const fake: BenchmarkDomainInput[] = ids.map((domainId, index) => ({
      domainId,
      studiedNames: Array.from({ length: 100 }, (_, n) => `Product ${domainId} ${n}`),
      watchedCount: index === 0 ? 3 : 0,
    }));
    const plan = planBenchmarks(fake);
    expect(plan.studied).toBe(400);
    expect(plan.watchOnly).toBe(3);
    expect(plan.total).toBe(403);
    expect(plan.omitted).toBeGreaterThan(0);
    expect(plan.areas.length).toBeLessThanOrEqual(TALK_TABLE_MAX_ROWS);
    let shownChars = 0;
    for (const area of plan.areas) {
      expect(area.shown.length + area.omitted, area.key).toBe(area.total);
      expect(area.shown.length, area.key).toBeGreaterThan(0);
      shownChars += area.shown.join(", ").length;
      const cell = benchmarkNamesCell(area);
      if (area.omitted > 0) {
        expect(cell.ko.endsWith(`외 ${area.omitted}곳`), area.key).toBe(true);
        expect(cell.en.endsWith(`+${area.omitted} more`), area.key).toBe(true);
      }
      expect(cell.en).not.toMatch(HANGUL);
    }
    expect(plan.areas.reduce((sum, area) => sum + area.total, 0)).toBe(plan.studied);
    expect(shownChars).toBeLessThanOrEqual(BENCHMARK_NAME_CHAR_BUDGET + plan.areas.length * 40);
    // 모르는 영역의 제품은 마지막(받는) 묶음에 들어간다.
    const other = plan.areas.find((area) => area.key === BENCHMARK_GROUPS.find((group) => group.catchAll)?.key);
    expect(other?.total).toBe(100);
    // 예산 안이면 아무것도 빠지지 않는다.
    const small = planBenchmarks([{ domainId: "drawing", studiedNames: Array.from({ length: 20 }, (_, n) => `Small ${n}`), watchedCount: 0 }]);
    expect(small.omitted).toBe(0);
    expect(small.areas.reduce((sum, area) => sum + area.shown.length, 0)).toBe(20);
    // 합친 묶음 안의 이름 순서는 입력 순서가 아니라 묶음의 영역 순서(그림 → 애니메이션)다.
    const merged = planBenchmarks([
      { domainId: "animation", studiedNames: ["Anim One"], watchedCount: 0 },
      { domainId: "drawing", studiedNames: ["Draw One"], watchedCount: 0 },
    ]);
    expect(merged.areas[0]?.shown).toEqual(["Draw One", "Anim One"]);
  });
});

describe("세미나 발표 원본: 근거 경로", () => {
  it("모든 슬라이드의 근거 경로와 아트 파일이 저장소에 있다", () => {
    for (const slide of talkSlides) {
      for (const path of slide.evidence ?? []) expect(repoPathExists(path), `${slide.id}: ${path}`).toBe(true);
      if (slide.art) expect(repoPathExists(`apps/web/public${slide.art.src}`), slide.art.src).toBe(true);
    }
  });
});
