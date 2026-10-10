import { readdirSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { findAtlasEntry } from "./engineering-atlas-content";
import { buildDeckTrack, deckSlideProblems, deckTrackTotalSeconds } from "./engineering-deck-model";
import { externalLinkForName } from "./engineering-external-links";
import { SEMINAR_LESSONS, type SeminarLesson } from "./engineering-seminar-curriculum";
import {
  HANGUL, cardText, countMatches, dependencyNames, fileIndex, flat, mapText, onnxModelFiles, patchedDependencyCount, readIfPresent, readText, repo,
  repoExists, repoFileExists, scanWebSources, sentencesOf, walkFiles,
} from "./engineering-seminar-test-kit";
import { PUBLISHED_ENGINEERING_CHAPTERS } from "./engineering-story-published-content";

import { NEXTGEN_LAB_DEFAULTS } from "@/shared/lib/nextgen-lab-settings";
import { NEXTGEN_CAPABILITY_IDS } from "@/shared/lib/nextgen-web-capabilities";

/**
 * 심화 강의 레슨(`SEMINAR_LESSONS`)의 콘텐츠 계약 검사. 준비실 예상 질문은 engineering-seminar-prep.test.ts 가 맡는다.
 *
 * - 형식: 챕터·도감 카드 연결, 점 3개, 흐름 3~4개, 대본 길이와 맺음 문장, 영어 필드의 한글 금지.
 * - 사실: 대본에 쓴 수치와 파일 이름은 원본(코드·설정·문서)과 대조한다. 대조표의 `needles` 가 실제 문구에 들어 있는지도
 *   함께 확인해, 문구만 바뀌고 대조표가 낡는 일을 막는다.
 * - 표현: 우열·유일·대체/동등 주장, Neon 을 현재 DB 처럼 쓰는 문장을 막는다.
 * 내부 데모 경로(href)가 실제 라우트인지는 하드코딩 링크 가드(hardcoded-link-integrity.test.ts)가 소스 전체에서 확인한다.
 */

const koOnly = (text: { readonly ko: string }): string => text.ko;
const lessons: readonly SeminarLesson[] = SEMINAR_LESSONS;
const chapterIds = new Set<string>(PUBLISHED_ENGINEERING_CHAPTERS.map((chapter) => chapter.id));

/** 한국어 5자/초로 배정 90초의 60~89%를 채우는 대본 길이(자). */
const SCRIPT_KO_RANGE = { min: 270, max: 400 } as const;
/** 새로 더한 레슨 12개. 기술 칩에 레지스트리(공식 문서 링크가 있는) 이름이 하나 이상 있어야 한다. */
const NEW_LESSON_IDS = [
  "seminar-dnd", "seminar-nextgen-web", "seminar-webxr", "seminar-virtual-studio", "seminar-on-device-ai", "seminar-free-infra",
  "seminar-identity-share", "seminar-open-source", "seminar-benchmark", "seminar-open-api", "seminar-ai-harness", "seminar-build-alignment",
] as const;
/** 맞는 도감 카드가 아직 없어 `atlasIds` 를 두지 않은 레슨(줄이는 것은 괜찮지만 늘리려면 이유가 필요하다). */
const LESSONS_WITHOUT_ATLAS = ["seminar-workflow", "seminar-media", "seminar-rehearsal"] as const;

function lessonTexts(lesson: SeminarLesson): readonly { readonly where: string; readonly ko: string; readonly en: string }[] {
  const demo = lesson.demo;
  return [
    { where: "title", ...lesson.title },
    { where: "takeaway", ...lesson.takeaway },
    ...lesson.points.map((point, index) => ({ where: `points[${index}]`, ...point })),
    ...lesson.flow.map((step, index) => ({ where: `flow[${index}]`, ...step })),
    { where: "script", ...lesson.script },
    { where: "question", ...lesson.question },
    ...(demo
      ? [
          { where: "demo.action", ...demo.action },
          { where: "demo.expected", ...demo.expected },
          { where: "demo.fallback", ...demo.fallback },
        ]
      : []),
  ];
}

/* ── 레슨 계약 ────────────────────────────────────────────── */

describe("심화 강의 레슨 계약", () => {
  it("레슨은 40~44개이고 첫 레슨은 seminar-opening, 마지막은 seminar-close다", () => {
    expect(lessons.length).toBeGreaterThanOrEqual(40);
    expect(lessons.length).toBeLessThanOrEqual(44);
    expect(lessons[0]?.id).toBe("seminar-opening");
    expect(lessons.at(-1)?.id).toBe("seminar-close");
    const ids = lessons.map((lesson) => lesson.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id, id).toMatch(/^seminar-[a-z0-9]+(?:-[a-z0-9]+)*$/u);
  });

  it("총 시간은 장당 90초 균등 배분(레슨 수 x 90초)이고 발표 모델의 슬라이드가 레슨 순서와 같다", () => {
    expect(deckTrackTotalSeconds("lecture")).toBe(lessons.length * 90);
    const model = buildDeckTrack("lecture", koOnly);
    expect(model.slides.map((slide) => slide.id)).toEqual(lessons.map((lesson) => lesson.id));
    expect(model.totalSeconds).toBe(lessons.length * 90);
    for (const slide of model.slides) expect(deckSlideProblems(slide), slide.id).toEqual([]);
  });

  it("구간은 01~09 번호가 레슨 순서와 함께 늘기만 하고 기존 6개 구간 이름은 그대로다", () => {
    const labels: string[] = [];
    for (const lesson of lessons) if (labels.at(-1) !== lesson.section.ko) labels.push(lesson.section.ko);
    expect(labels).toEqual([
      "01 · 창작자의 문제",
      "02 · 입력에서 한 장의 그림까지",
      "03 · 브라우저의 한계 넘기",
      "04 · 3D를 작품의 일부로",
      "05 · 협업과 AI의 역할",
      "06 · 시연, 검증, 재사용",
      "07 · 오픈소스·벤치마크·Open API",
      "08 · AI와 함께 만드는 방법",
      "09 · 마무리",
    ]);
    // 같은 구간이 흩어지지 않고(위 목록에 중복이 없음) 번호 접두어가 01부터 빠짐없이 이어진다.
    expect(labels.map((label) => Number(label.slice(0, 2)))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const model = buildDeckTrack("lecture", koOnly);
    expect(model.sections.map((section) => section.slideCount).reduce((sum, count) => sum + count, 0)).toBe(lessons.length);
    expect(model.sections).toHaveLength(labels.length);
    for (const section of model.sections) expect(section.seconds).toBe(section.slideCount * 90);
    // 구간 이름이 한국어와 영어 모두 같은 번호로 시작한다.
    for (const lesson of lessons) expect(lesson.section.en.slice(0, 2), lesson.id).toBe(lesson.section.ko.slice(0, 2));
  });

  it("모든 레슨은 실제 챕터에 연결되고 점 3개·흐름 3~4개·기술 1개 이상·한영 문구를 갖는다", () => {
    const problems: string[] = [];
    for (const lesson of lessons) {
      const at = (message: string): number => problems.push(`${lesson.id}: ${message}`);
      if (!chapterIds.has(lesson.chapterId)) at(`없는 챕터 ${lesson.chapterId}`);
      if (lesson.points.length !== 3) at(`points ${lesson.points.length}개`);
      if (lesson.flow.length < 3 || lesson.flow.length > 4) at(`flow ${lesson.flow.length}개`);
      if (lesson.technologies.length < 1) at("technologies 없음");
      if (new Set(lesson.technologies).size !== lesson.technologies.length) at("technologies 중복");
      for (const tech of lesson.technologies) if (!tech.trim()) at("빈 technologies 항목");
      for (const { where, ko, en } of lessonTexts(lesson)) {
        if (!ko.trim() || !en.trim()) at(`${where}: 한국어 또는 영어가 비어 있음`);
        if (HANGUL.test(en)) at(`${where}: 영어 필드에 한글`);
      }
      if (lesson.title.ko.length < 10) at("제목이 너무 짧음");
    }
    expect(problems).toEqual([]);
  });

  it("대본(한국어)은 270~400자이고 다음 레슨으로 넘기는 문장으로 끝난다(영어도 같다)", () => {
    const problems: string[] = [];
    const transitionKo = /다음|이제|이어서|이어집니다|봅니다|갑니다|보겠습니다|마지막|넘어가|\?$/u;
    const transitionEn = /\b(?:Next|Now|First|On to|After|last)\b|\?$/u;
    lessons.forEach((lesson, index) => {
      const length = lesson.script.ko.length;
      if (length < SCRIPT_KO_RANGE.min || length > SCRIPT_KO_RANGE.max) problems.push(`${lesson.id}: ko 대본 ${length}자`);
      if (lesson.script.en.length < 300) problems.push(`${lesson.id}: en 대본이 짧음 ${lesson.script.en.length}자`);
      if (index === lessons.length - 1) return;
      const lastKo = sentencesOf(lesson.script.ko).at(-1) ?? "";
      const lastEn = sentencesOf(lesson.script.en).at(-1) ?? "";
      if (!transitionKo.test(lastKo)) problems.push(`${lesson.id}: 맺음 문장이 다음 레슨으로 넘기지 않음 "${lastKo}"`);
      if (!transitionEn.test(lastEn)) problems.push(`${lesson.id}: 영어 맺음 문장이 넘기지 않음 "${lastEn}"`);
    });
    expect(problems).toEqual([]);
  });

  it("대본마다 근거(숫자 또는 파일·문서 이름)가 하나 이상 있다", () => {
    const evidence = /\d|[A-Za-z0-9_.-]+\.(?:tsx?|mjs|json|md|ya?ml)\b/u;
    const missing = lessons.filter((lesson) => !evidence.test(lesson.script.ko)).map((lesson) => lesson.id);
    expect(missing).toEqual([]);
  });

  it("도감 연결 atlasIds 는 4개 이하이고 모두 실제 카드이며, 없는 레슨은 알려진 3개뿐이다", () => {
    const problems: string[] = [];
    const without: string[] = [];
    for (const lesson of lessons) {
      const ids = lesson.atlasIds ?? [];
      if (ids.length === 0) without.push(lesson.id);
      if (ids.length > 4) problems.push(`${lesson.id}: atlasIds ${ids.length}개 > 4`);
      if (new Set(ids).size !== ids.length) problems.push(`${lesson.id}: atlasIds 중복`);
      for (const id of ids) if (!findAtlasEntry(id)) problems.push(`${lesson.id}: 없는 도감 카드 ${id}`);
    }
    expect(problems).toEqual([]);
    expect(without).toEqual([...LESSONS_WITHOUT_ATLAS]);
  });

  it("레슨의 atlasIds 가 발표 모델의 relatedAtlas({id,name}) 로 이어지고 없는 레슨은 비어 있다", () => {
    const model = buildDeckTrack("lecture", koOnly);
    for (const lesson of lessons) {
      const slide = model.slides.find((candidate) => candidate.id === lesson.id);
      const expected = (lesson.atlasIds ?? []).flatMap((id) => {
        const entry = findAtlasEntry(id);
        return entry ? [{ id: entry.id, name: entry.name }] : [];
      });
      if (expected.length === 0) expect(slide?.relatedAtlas, lesson.id).toBeUndefined();
      else expect(slide?.relatedAtlas, lesson.id).toEqual(expected);
    }
  });

  it("도감의 빌드 정렬 카드 6장이 모두 강의에 연결되고, 정렬 레슨은 그중 핵심 4장을 연다", () => {
    const buildCards = [
      "build-fingerprint-map", "shared-contract-patterns", "version-pin-layers", "hashed-assets-cache-contract",
      "version-skew-chunk-reload-recovery", "release-order-expand-contract-rollback",
    ];
    const linked = new Set(lessons.flatMap((lesson) => lesson.atlasIds ?? []));
    expect(buildCards.filter((id) => !linked.has(id))).toEqual([]);
    expect(lessons.find((lesson) => lesson.id === "seminar-build-alignment")?.atlasIds).toEqual([
      "build-fingerprint-map", "shared-contract-patterns", "version-pin-layers", "version-skew-chunk-reload-recovery",
    ]);
  });

  it("새 레슨 12개는 레지스트리 이름의 기술 칩이 있고 전체 칩의 60% 이상이 공식 문서 링크로 이어진다", () => {
    for (const id of NEW_LESSON_IDS) {
      const lesson = lessons.find((candidate) => candidate.id === id);
      expect(lesson, id).toBeDefined();
      expect(lesson?.technologies.some((tech) => externalLinkForName(tech) !== undefined), id).toBe(true);
    }
    const chips = lessons.flatMap((lesson) => lesson.technologies);
    const linked = chips.filter((tech) => externalLinkForName(tech) !== undefined).length;
    expect(linked / chips.length).toBeGreaterThanOrEqual(0.6);
  });

  it("데모는 사이트 안 경로이고, 제목의 분:초가 주소의 t= 초와 같으며, 영상 위치가 영상 길이 안이다", () => {
    const manifest = JSON.parse(readText("apps", "web", "public", "brand", "product-tour-manifest.json")) as { readonly duration: number };
    for (const lesson of lessons) {
      const demo = lesson.demo;
      if (!demo) continue;
      expect(demo.href, lesson.id).toMatch(/^\/[A-Za-z0-9/_?=&#.-]*$/u);
      const seconds = /[?&]t=(\d+)/u.exec(demo.href)?.[1];
      const clock = /(\d+):(\d{2})/u.exec(demo.action.ko);
      if (seconds !== undefined) {
        expect(clock, `${lesson.id}: 제목에 분:초가 없음`).not.toBeNull();
        expect(Number(clock?.[1]) * 60 + Number(clock?.[2]), lesson.id).toBe(Number(seconds));
        expect(Number(seconds), lesson.id).toBeLessThan(manifest.duration);
      }
    }
  });

  it("우열·유일·대체/동등 주장 표현이 없고, Neon 은 Supabase/legacy 와 함께 과거 사실로만 나온다", () => {
    const bannedKo = /최고|최강|최상|유일|압도|독보|완벽|세계 최|업계 최|1위|동등하다|동등합니다|대체했|대체한다|대체합니다/u;
    const bannedEn = /\b(?:best|greatest|unrivaled|unmatched|world-class|state-of-the-art|dominant|superior|outperforms?|market leader|industry-leading)\b/iu;
    const problems: string[] = [];
    for (const lesson of lessons) {
      for (const { where, ko, en } of lessonTexts(lesson)) {
        if (bannedKo.test(ko)) problems.push(`${lesson.id}.${where}: 금지 표현(ko) ${ko.match(bannedKo)?.[0]}`);
        if (bannedEn.test(en)) problems.push(`${lesson.id}.${where}: 금지 표현(en) ${en.match(bannedEn)?.[0]}`);
        for (const sentence of [...sentencesOf(ko), ...sentencesOf(en)]) {
          if (/\bNeon\b/u.test(sentence) && !/Supabase|legacy|보존|preserved/iu.test(sentence)) problems.push(`${lesson.id}.${where}: Neon 이 Supabase/legacy 없이 나옴 "${sentence}"`);
        }
      }
      if (lesson.technologies.includes("Neon") && !lesson.technologies.includes("Supabase PostgreSQL")) problems.push(`${lesson.id}: Neon 칩만 있고 Supabase 칩이 없음`);
    }
    expect(problems).toEqual([]);
  });

  it("대본에 이름이 나오는 파일은 저장소에 실제로 있다(경로가 있으면 그 경로, 이름만이면 같은 이름의 파일)", () => {
    const token = /[A-Za-z0-9_@./-]+\.(?:tsx?|mjs|json|md|ya?ml)\b/gu;
    const missing: string[] = [];
    for (const lesson of lessons) {
      for (const text of [lesson.script.ko, lesson.script.en]) {
        for (const found of text.match(token) ?? []) if (!repoFileExists(found)) missing.push(`${lesson.id}: ${found}`);
      }
    }
    expect([...new Set(missing)]).toEqual([]);
  });
});

/* ── 대본의 수치와 파일은 원본과 같다 ─────────────────────────── */

interface LessonFact {
  readonly lesson: string;
  readonly claim: string;
  /** 대본(한국어)에 이 문구가 실제로 있어야 한다. 문구가 바뀌면 대조표도 함께 고치게 만든다. */
  readonly needles: readonly string[];
  readonly check: () => void;
}

let scanCache: Readonly<Record<"bvhProvider" | "greetingProximity", readonly string[]>> | undefined;

/** 웹 소스 전체를 한 번만 훑는다(파일 수천 개). 처음 부르는 대조에서만 비용을 낸다. */
function factScan(): Readonly<Record<"bvhProvider" | "greetingProximity", readonly string[]>> {
  scanCache ??= scanWebSources({
    bvhProvider: /studio-three-mesh-bvh-provider/u,
    greetingProximity: /\bupdateStudioProximity\b/u,
  });
  return scanCache;
}

const DND_LIBRARIES = /dnd-kit|react-dnd|react-beautiful-dnd|sortablejs|interactjs|@use-gesture|react-aria/iu;

const LESSON_FACTS: readonly LessonFact[] = [
  {
    lesson: "seminar-opening", claim: "24초 브랜드 필름과 스토리 챕터 40개", needles: ["24초", "40개"],
    check: () => {
      expect(readText("apps", "web", "src", "domains", "legal", "AboutPage.tsx")).toContain("24초 브랜드 필름");
      expect(PUBLISHED_ENGINEERING_CHAPTERS).toHaveLength(40);
    },
  },
  {
    lesson: "seminar-problem", claim: "Workspace/Project 중심 결정(챕터)과 PRODUCT.md 의 하나의 작업 흐름", needles: ["Workspace와 Project", "PRODUCT.md"],
    check: () => {
      expect(PUBLISHED_ENGINEERING_CHAPTERS.find((chapter) => chapter.id === "product-intent")?.decision.ko).toContain("Workspace와 Project를 중심으로");
      expect(readText("PRODUCT.md")).toContain("하나의 작업 흐름");
    },
  },
  {
    lesson: "seminar-workflow", claim: "슬라이드 링크는 id 로 복사하고 id 해시를 읽는다", needles: ["id로 복사"],
    check: () => {
      expect(readText("apps", "web", "src", "domains", "legal", "technology", "EngineeringDeckPage.tsx")).toContain("슬라이드 id 로 복사");
      expect(readText("apps", "web", "src", "domains", "legal", "technology", "engineering-deck-state.ts")).toContain("#slide-talk-ai");
    },
  },
  {
    lesson: "seminar-architecture", claim: "앱 사이 직접 import 0건, 낡은 경계 위반은 상한으로 묶음", needles: ["0건", "architecture-boundary-ratchet.json"],
    check: () => {
      const ratchet = JSON.parse(readText("config", "architecture-boundary-ratchet.json")) as Record<string, number>;
      for (const key of ["webToAdmin", "webToApi", "adminToWeb", "adminToApi", "apiToWeb", "apiToAdmin"]) expect(ratchet[key], key).toBe(0);
      expect(Object.values(ratchet).some((value) => value > 0)).toBe(true);
    },
  },
  {
    lesson: "seminar-document", claim: "엔진 자동 폴백 금지(ADR-0018)와 포인터 입력 파일", needles: ["studio-pointer-input.ts", "ADR-0018"],
    check: () => {
      expect(repoExists("docs", "adr", "0018-no-automatic-engine-fallback-vello-primary.md")).toBe(true);
      expect(fileIndex().get("studio-pointer-input.ts")).toBeDefined();
    },
  },
  {
    lesson: "seminar-input", claim: "안정화 강도 10의 시간 상수 = 8 + 4.8 x 10 = 56 ms, 펜은 초당 120번 보고", needles: ["56ms", "studio-stroke-stabilizer.ts", "백 번"],
    check: () => {
      const source = flat("apps", "web", "src", "domains", "creator", "brush", "studio-stroke-stabilizer.ts");
      expect(source).toMatch(/STUDIO_STABILIZER_MIN_TIME_CONSTANT_MS = 8;/u);
      expect(source).toMatch(/STUDIO_STABILIZER_TIME_CONSTANT_PER_STRENGTH_MS = 4\.8;/u);
      expect(8 + 4.8 * 10).toBeCloseTo(56, 6);
      expect(source).toMatch(/STUDIO_POINTER_DEFAULT_SAMPLE_INTERVAL_MS = 1000 \/ 120;/u);
    },
  },
  {
    lesson: "seminar-brush-libraries", claim: "Hokusai = reearth/hokusai 0.3.0(MIT OR Apache-2.0)를 감싼 래퍼·승격 게이트 미통과, Google Ink 는 확정 획이 아니라 예측 꼬리 보조 미리보기에만 연결", needles: ["MIT OR Apache-2.0", "reearth/hokusai 0.3.0", "Google Ink는", "예측 꼬리"],
    check: () => {
      // 기술 지도(ADR-0009 요약): 출하 잉킹 레인은 Perfect Freehand(G펜·퍼펙트 계열 펜) 쪽이고 Google Ink 는 후보다. 일반 펜의 기본은 연속 잉크(webgpu-causal-ink) 경로다.
      expect(mapText("open-source")).toMatch(/Google Ink는 후보다/u);
      // 생성기는 펜다운에서 시작하는 예측 꼬리 미리보기에만 연결된다(확정 획의 주인은 Canvas2D 확정 경로이고 Perfect Freehand는 G펜·퍼펙트 계열 펜의 윤곽).
      const inkPreview = readText("apps", "web", "src", "domains", "creator", "brush", "studio-ink-mesh-live-preview.ts");
      expect(inkPreview).toContain("loadInkMeshGenerator");
      expect(flat("THIRD_PARTY_NOTICES.md")).toMatch(/hokusai-tile-mem` \| 0\.3\.0 \| MIT OR Apache-2\.0 \| <https:\/\/github\.com\/reearth\/hokusai/u);
      const cargo = readText("packages", "studio-hokusai-wasm", "Cargo.toml");
      for (const crate of ["hokusai-brush", "hokusai-core", "hokusai-tile-mem"]) expect(cargo).toContain(`${crate} = "=0.3.0"`);
      expect(cardText("hokusai-wasm-natural-media")).toContain("승격 게이트 미통과");
    },
  },
  {
    lesson: "seminar-natural-media", claim: "Mixbox 는 CC BY-NC 4.0, 상업 빌드는 제거하거나 별도 라이선스", needles: ["CC BY-NC 4.0", "THIRD_PARTY_NOTICES.md"],
    check: () => {
      const notices = flat("THIRD_PARTY_NOTICES.md");
      expect(notices).toMatch(/`mixbox` \| 2\.0\.0 \| CC BY-NC 4\.0/u);
      expect(notices).toContain("disable/remove the Mixbox provider or obtain a");
    },
  },
  {
    lesson: "seminar-renderers", claim: "렌더러 원장 20개, 권위 13종 중 12종은 primary 1명·1종은 소유자 없음 선언", needles: ["20개", "13종 중 12종", "renderer-roles.ts"],
    check: () => {
      const source = readText("packages", "studio-engine-registry", "src", "renderer-roles.ts");
      expect(countMatches(source, /^\s+role: "(?:primary|provider|reference|lab)" as const,/gmu)).toBe(20);
      const authorities = /export const RENDERER_AUTHORITIES: readonly RendererAuthority\[\] = Object\.freeze\(\[([^\]]*)\]/u.exec(source)?.[1] ?? "";
      expect(countMatches(authorities, /"[a-z0-9-]+"/gu)).toBe(13);
      expect(countMatches(source, /^\s+authority: "[a-z0-9-]+" as const,/gmu)).toBe(1);
    },
  },
  {
    lesson: "seminar-dnd", claim: "끌어 놓기 라이브러리 0개, 칸반은 5px 넘어야 시작, Alt+방향키 짝", needles: ["5px", "use-board-dnd.ts", "package.json"],
    check: () => {
      expect(flat("apps", "web", "src", "domains", "creator", "production-hub", "board", "use-board-dnd.ts")).toContain("const START_DISTANCE = 5;");
      expect(readText("apps", "web", "src", "domains", "creator", "production-hub", "board", "board-shortcuts.ts")).toContain("ALT_ARROWS");
      expect(dependencyNames().filter((name) => DND_LIBRARIES.test(name))).toEqual([]);
    },
  },
  {
    lesson: "seminar-workers", claim: "apps/web/src 의 *.worker.ts 가 65개", needles: ["65개"],
    check: () => {
      let count = 0;
      walkFiles(repo("apps", "web", "src"), (file) => {
        if (file.endsWith(".worker.ts")) count += 1;
      });
      expect(count).toBe(65);
    },
  },
  {
    lesson: "seminar-offline", claim: "내비게이션 응답 4초 한도와 프리캐시 예산 초과 시 빌드 실패", needles: ["4초", "studio-service-worker-navigation.ts", "예산"],
    check: () => {
      expect(readText("apps", "web", "src", "app", "service-worker", "studio-service-worker-navigation.ts")).toContain("STUDIO_NAVIGATION_TIMEOUT_MS = 4_000;");
      expect(readText("apps", "web", "src", "app", "service-worker", "studio-service-worker-precache-plan.ts")).toContain("Budget violations. The build plugin turns these into a hard failure.");
    },
  },
  {
    lesson: "seminar-recovery", claim: "업데이트 안전 모듈과 Web Locks 단일 저자", needles: ["studio-update-safety.ts", "Web Locks"],
    check: () => {
      expect(fileIndex().get("studio-update-safety.ts")).toBeDefined();
      expect(cardText("web-locks-broadcastchannel-single-author")).toContain("Web Locks");
    },
  },
  {
    lesson: "seminar-nextgen-web", claim: "감지 27종, 끌 수 있는 토글 3개, WebTransport 코드만", needles: ["27종", "3개", "nextgen-web-capabilities.ts"],
    check: () => {
      expect(NEXTGEN_CAPABILITY_IDS).toHaveLength(27);
      expect(Object.keys(NEXTGEN_LAB_DEFAULTS)).toHaveLength(3);
      expect(cardText("webtransport-experiment")).toContain("WebSocket");
    },
  },
  {
    lesson: "seminar-scene3d", claim: "LT 변환은 컬러·톤·질감선·주선 4레이어", needles: ["네 레이어", "컬러", "주선"],
    check: () => {
      expect(readText("apps", "web", "src", "domains", "creator", "bg3d", "studio-bg3d-lt-layer-plan.ts")).toContain('STUDIO_BG3D_LT_LAYER_ROLES = ["color", "tone", "texture-line", "main-line"]');
    },
  },
  {
    lesson: "seminar-3d-toolkit", claim: "three-mesh-bvh 공급자는 구현됨·미연결(테스트 밖 호출 0건)이지만 three-bvh-csg 가 안에서 쓴다", needles: ["studio-three-mesh-bvh-provider.ts", "구현됨·미연결", "three-bvh-csg가 안에서 쓰므로", "CSG Worker 번들"],
    check: () => {
      // three-bvh-csg 는 three-mesh-bvh 를 짝 의존성으로 요구하고, CSG 전문 처리 모듈이 three-bvh-csg 를 가져다 쓴다.
      expect(readText("package.json")).toMatch(/"three-bvh-csg": "[^"]+"[\s\S]*"three-mesh-bvh": "[^"]+"/u);
      expect(readText("apps", "web", "src", "domains", "creator", "scene3d", "specialists", "specialist-csg.ts")).toContain("three-bvh-csg");
      const csgManifest = readIfPresent("node_modules", "three-bvh-csg", "package.json");
      if (csgManifest !== null) expect((JSON.parse(csgManifest) as { readonly peerDependencies?: Record<string, string> }).peerDependencies).toHaveProperty("three-mesh-bvh");
      expect(repoExists("apps", "web", "src", "domains", "creator", "studio-three-mesh-bvh-provider.ts")).toBe(true);
      // 공급자 파일 자신을 빼면, 테스트 밖에서 이 모듈을 가져다 쓰는 파일이 없어야 '구현됨·미연결'이다.
      expect(factScan().bvhProvider.filter((file) => !file.endsWith("studio-three-mesh-bvh-provider.ts"))).toEqual([]);
    },
  },
  {
    lesson: "seminar-3d-performance", claim: "GPU 등급 maxBufferSize 1 GiB·384 MiB·256 MiB, 장치 손실 3회", needles: ["1 GiB·384 MiB·256 MiB", "3번", "studio-capability-tier.ts"],
    check: () => {
      const tier = flat("apps", "web", "src", "domains", "creator", "studio-capability-tier.ts");
      expect(tier).toContain('{ signal: "maxBufferSize", minimum: 1 * GIB, kind: "gpu-limit" }');
      expect(tier).toContain('{ signal: "maxBufferSize", minimum: 384 * MIB, kind: "gpu-limit" }');
      expect(tier).toContain('{ signal: "maxBufferSize", minimum: 256 * MIB, kind: "gpu-limit" }');
      expect(readText("apps", "web", "src", "domains", "creator", "studio-device-loss-recovery.ts")).toContain("STUDIO_DEVICE_LOSS_PERMANENT_THRESHOLD = 3;");
    },
  },
  {
    lesson: "seminar-blender", claim: "연결된 호스트가 없으면 VRM 생성 MCP 는 unavailable", needles: ["unavailable", "studio-vrm-generate-mcp.ts"],
    check: () => {
      expect(readText("apps", "web", "src", "domains", "creator", "vrm", "studio-vrm-generate-mcp.ts")).toContain('status: "unavailable"');
    },
  },
  {
    lesson: "seminar-webxr", claim: "WebXR 세션 모듈과 공간 리더 경로", needles: ["studio-webxr-session.ts"],
    check: () => {
      expect(fileIndex().get("studio-webxr-session.ts")).toBeDefined();
      expect(lessons.find((lesson) => lesson.id === "seminar-webxr")?.demo?.href).toBe("/read/spatial");
    },
  },
  {
    lesson: "seminar-collaboration", claim: "입장권 60초, 권한 재검사 15초, 문서 방 30명", needles: ["60초", "15초", "30명", "studio-live-gateway-constants.ts"],
    check: () => {
      expect(readText("packages", "contracts", "src", "studio-live-auth-ticket.ts")).toContain("STUDIO_LIVE_AUTH_TICKET_TTL_MS = 60_000;");
      const gateway = readText("apps", "api", "src", "modules", "creator", "studio-live-gateway-constants.ts");
      expect(gateway).toContain("STUDIO_LIVE_ACCESS_RECHECK_MS = 15_000;");
      expect(gateway).toContain("STUDIO_LIVE_ROOM_MAX_PARTICIPANTS = 30;");
    },
  },
  {
    lesson: "seminar-webrtc", claim: "직통 레인 studio-direct-v1, 서버 음성 중계 꺼짐, STUN 전용, 허들 원격 3명", needles: ["studio-direct-v1", "render.yaml", "STUN", "3명"],
    check: () => {
      expect(readText("apps", "web", "src", "domains", "creator", "live", "studio-live-direct-port.ts")).toContain("studio-direct-v1");
      expect(flat("render.yaml")).toContain('key: STUDIO_LIVE_VOICE_ENABLED value: "false"');
      // TURN 발급 경로는 2026-10-11 결정으로 제거됐고 ICE는 Cloudflare STUN 전용이다.
      expect(repoExists("deploy", "cloudflare-realtime", "src", "turn.ts")).toBe(false);
      expect(readText("apps", "web", "src", "domains", "creator", "live", "studio-ice-configuration.ts")).toContain("stun:stun.cloudflare.com:3478");
      expect(readText("apps", "web", "src", "domains", "creator", "live", "huddle", "studio-p2p-huddle-protocol.ts")).toContain("HUDDLE_MAX_REMOTE_PEERS = 3;");
    },
  },
  {
    lesson: "seminar-virtual-studio", claim: "근접 영상 168/216px, 정원 24→8→3, 인사 160/220px 는 호출부 없음", needles: ["168px", "216px", "160/220px", "24", "studio-world-publication.repository.ts"],
    check: () => {
      const proximity = readText("apps", "web", "src", "domains", "creator", "virtual-space", "hud", "space-proximity-media.ts");
      expect(proximity).toContain("SPACE_PROXIMITY_MEDIA_RADIUS = 168;");
      expect(proximity).toContain("SPACE_PROXIMITY_MEDIA_LEAVE_RADIUS = 216;");
      expect(readText("apps", "web", "src", "domains", "creator", "virtual-space", "studio-virtual-space-model.ts")).toContain("STUDIO_VIRTUAL_SPACE_MAX_PARTICIPANTS = 24;");
      expect(readText("apps", "web", "src", "domains", "creator", "live", "studio-live-p2p-overlay-transport.ts")).toContain("STUDIO_LIVE_P2P_MAX_PEERS = 8;");
      expect(readText("apps", "web", "src", "domains", "creator", "virtual-space", "studio-virtual-space-proximity.ts")).toMatch(/STUDIO_PROXIMITY_GREET_RADIUS = 160;[\s\S]*STUDIO_PROXIMITY_FAREWELL_RADIUS = 220;/u);
      // updateStudioProximity(인사 160/220px 를 쓰는 함수)는 정의한 파일 밖에서 부르는 곳이 없다.
      expect(factScan().greetingProximity).toEqual(["apps/web/src/domains/creator/virtual-space/studio-virtual-space-proximity.ts"]);
      expect(repoExists("apps", "api", "src", "modules", "studio-project-graph", "studio-world-publication.repository.ts")).toBe(true);
    },
  },
  {
    lesson: "seminar-ai-routing", claim: "브라우저 하루 25회·64,000토큰, 402·429 만 다음 무료 경로로", needles: ["25회", "64,000토큰", "402·429"],
    check: () => {
      const budget = readText("apps", "web", "src", "shared", "ai", "free-ai-runtime-budget.ts");
      expect(budget).toContain("MANAGED_FREE_DAILY_REQUEST_LIMIT = 25;");
      expect(budget).toContain("MANAGED_FREE_DAILY_RESERVED_TOKEN_LIMIT = 64_000;");
      expect(readText("apps", "web", "src", "shared", "ai", "user-ai-transport.ts")).toContain("response.status === 402 || response.status === 429");
    },
  },
  {
    lesson: "seminar-local-ai", claim: "기기 안 이미지 AI 5종(채색·배경 제거·선 추출·4배 확대·화풍 변환)", needles: ["5종", "4배 확대"],
    check: () => {
      expect(cardText("onnx-runtime-web-inference")).toContain("채색, 배경 제거, 사진에서 선 추출, 4배 업스케일, 애니풍 변환");
    },
  },
  {
    lesson: "seminar-on-device-ai", claim: "ONNX 모델 파일 6개 합계 119,438,571바이트, 가장 큰 채색 모델 79,269,994바이트", needles: ["6개", "119,438,571바이트", "79MB", "123MB", "studio-onnx-inference-provider.ts"],
    check: () => {
      const files = onnxModelFiles();
      expect(files).toHaveLength(6);
      expect(files.reduce((sum, file) => sum + file.bytes, 0)).toBe(119_438_571);
      expect([...files].sort((a, b) => b.bytes - a.bytes)[0]).toEqual({ name: "tag2pix.onnx", bytes: 79_269_994 });
      expect(cardText("transformers-js-translation")).toContain("123");
      expect(fileIndex().get("studio-onnx-inference-provider.ts")).toBeDefined();
    },
  },
  {
    lesson: "seminar-references", claim: "AI 참고 이미지 요청당 16장·장당 12MiB 초과는 유료 요청 전에 차단", needles: ["16장", "12MiB", "studio-ai-reference-images.ts"],
    check: () => {
      const limits = flat("apps", "web", "src", "domains", "creator", "ai", "studio-ai-reference-images.ts");
      expect(limits).toContain("maxImages: 16,");
      expect(limits).toContain("maxDecodedBytesPerImage: 12 * 1_024 * 1_024,");
    },
  },
  {
    lesson: "seminar-cost", claim: "Supabase 가 현재 권위, Neon 은 legacy 보존", needles: ["Supabase PostgreSQL이 현재 권위", "Neon은 legacy로 보존"],
    check: () => {
      // 1차 근거는 기술 지도의 무료 서비스 표(코드 안), 문서는 내려받은 환경에서만 보조로 대조한다.
      const freeTier = mapText("free-tier");
      expect(freeTier).toContain("2026-09-26 사용자 승인으로 Supabase에서 빈 상태로 새로 시작했고");
      expect(freeTier).toContain("옛 Neon은 보존합니다");
      expect(repoExists("docs", "operations", "federated-free-database-data-plane.md")).toBe(true);
      const doc = readIfPresent("docs", "operations", "federated-free-database-data-plane.md");
      if (doc !== null) expect(doc.replace(/\s+/gu, " ")).toContain("기존 Neon 원본 보존");
    },
  },
  {
    lesson: "seminar-free-infra", claim: "Render 15분 절전·첫 응답 약 1분(DEPLOY.md), 서버 사용자당 200회·1,000,000토큰, UTC 하루", needles: ["15분", "약 1분", "DEPLOY.md", "2026-09-26", "200회·1,000,000토큰", "UTC"],
    check: () => {
      const deploy = flat("DEPLOY.md");
      expect(deploy).toContain("15분 동안 없으면 spin down");
      expect(deploy).toContain("cold start는 약 1분 걸릴 수 있습니다");
      const usage = readText("apps", "api", "src", "modules", "studio-ai", "studio-ai-usage.ts");
      expect(usage).toContain("DEFAULT_STUDIO_AI_DAILY_REQUEST_LIMIT = 200;");
      expect(usage).toContain("DEFAULT_STUDIO_AI_DAILY_TOKEN_LIMIT = 1_000_000;");
      expect(readText("apps", "web", "src", "shared", "ai", "free-ai-runtime-budget.ts")).toContain("Date.UTC(");
    },
  },
  {
    lesson: "seminar-auth", claim: "소셜 로그인 중간 쿠키·상태 10분", needles: ["10분"],
    check: () => {
      expect(readText("apps", "api", "src", "server", "oauth.ts")).toContain("maxAgeMs = 10 * 60_000");
    },
  },
  {
    lesson: "seminar-identity-share", claim: "공유 채널 13종, PKCE 는 GitHub, 카카오 SDK 는 SRI", needles: ["13종", "PKCE", "SRI"],
    check: () => {
      const share = readText("apps", "web", "src", "shared", "lib", "share.ts");
      const union = /export type ShareChannel =([^;]*);/u.exec(share)?.[1] ?? "";
      expect(countMatches(union, /"[a-z]+"/gu)).toBe(13);
      const oauth = readText("apps", "api", "src", "server", "oauth.ts");
      const pkce = oauth.indexOf('searchParams.set("code_challenge"');
      expect(pkce).toBeGreaterThan(0);
      expect(oauth.slice(Math.max(0, pkce - 400), pkce)).toContain('id === "github"');
      expect(readText("apps", "web", "src", "shared", "lib", "kakao-share.ts")).toContain("script.integrity = KAKAO_SDK_INTEGRITY;");
    },
  },
  {
    lesson: "seminar-media", claim: "제품 투어 영상 8분 24초(504초)", needles: ["8분 24초", "product-tour-manifest.json"],
    check: () => {
      const manifest = JSON.parse(readText("apps", "web", "public", "brand", "product-tour-manifest.json")) as { readonly duration: number };
      expect(manifest.duration).toBe(8 * 60 + 24);
    },
  },
  {
    lesson: "seminar-quality", claim: "그림 품질 합격 예산: 포인터 추가 처리 p95 8ms·p99 16.7ms", needles: ["p95 8ms·p99 16.7ms", "studio-brush-frame-budget-policy.ts"],
    check: () => {
      const policy = readText("scripts", "studio-brush-frame-budget-policy.ts");
      expect(policy).toContain("pointerAppendP95Ms: 8,");
      expect(policy).toContain("pointerAppendP99Ms: 16.7,");
    },
  },
  {
    lesson: "seminar-open-source", claim: "pnpm 패치 N개(pnpm-workspace.yaml 에서 센 값) + 포크 2개(wgpu 29.0.4 는 toon-fabric 피처 뒤, braces 는 중첩 깊이 100 가드)", needles: ["포크는 둘", "wgpu 29.0.4", "toon-fabric", "crates/vendor/wgpu-toon", "patches/braces", "깊이 100", "CC BY-NC 4.0"],
    check: () => {
      // 패치 개수는 하드코딩하지 않고 pnpm-workspace.yaml 의 patchedDependencies 에서 센다. 패치 파일 수와도 맞아야 한다.
      const count = patchedDependencyCount();
      expect(readdirSync(repo("patches")).filter((name) => name.endsWith(".patch"))).toHaveLength(count);
      const lesson = lessons.find((candidate) => candidate.id === "seminar-open-source");
      expect(lesson?.script.ko).toContain(`pnpm 패치 ${count}개`);
      expect(lesson?.takeaway.ko).toContain(`패치 ${count}개와 포크 2개`);
      expect(lesson?.points[0]?.ko).toContain(`패치 ${count}개`);
      const cargo = readText("crates", "vendor", "wgpu-toon", "Cargo.toml");
      expect(cargo).toMatch(/name = "wgpu"\s+version = "29\.0\.4"/u);
      expect(cargo).toContain("toon-fabric = []");
      expect(cargo).toContain("our upstream PR candidate");
      expect(readdirSync(repo("crates", "vendor", "wgpu-toon", "PATCHES"))).toHaveLength(1);
      // braces: 취약 범위를 저장소 포크(patches/braces)로 대체하고, 포크는 중첩 깊이 100 가드를 가진다.
      expect(flat("pnpm-workspace.yaml")).toContain("'braces@>=3.0.0 <3.0.4': 'file:patches/braces'");
      expect(readText("patches", "braces", "lib", "constants.js")).toContain("MAX_DEPTH: 100,");
      expect(flat("THIRD_PARTY_NOTICES.md")).toContain("Remotion License");
    },
  },
  {
    lesson: "seminar-benchmark", claim: "clean-room 규칙(디컴파일·반입 금지)과 GPL 코어 reference-only(ADR 0008)", needles: ["clean-room", "디컴파일", "GPL"],
    check: () => {
      // 1차 근거는 경쟁·참고 제품 지도(코드 안)의 clean-room 원칙과 ADR 0008 표기, 문서는 내려받은 환경에서만 보조로 대조한다.
      const competitors = mapText("competitors");
      expect(competitors).toContain("clean-room");
      expect(competitors).toContain("ADR 0008");
      expect(repoExists("docs", "studio-commercial-clean-room-radar-2026-07-28.md")).toBe(true);
      expect(repoExists("docs", "adr", "0008-license-isolation-policy.md")).toBe(true);
      const radar = readIfPresent("docs", "studio-commercial-clean-room-radar-2026-07-28.md");
      if (radar !== null) expect(radar).toContain("상용 바이너리 디컴파일, 비공개 소스·프리셋·에셋 반입");
      const adr = readIfPresent("docs", "adr", "0008-license-isolation-policy.md");
      if (adr !== null) expect(adr).toContain("Krita GPL 코어는 reference-only다.");
    },
  },
  {
    lesson: "seminar-open-api", claim: "공급자 26개, 6초, 2MiB, 개발자 매니페스트 권한 범위 10개, 표지 중계 킬스위치", needles: ["26개", "6초", "2MiB", "10개"],
    check: () => {
      const providers = /export type ResourceProvider =([^;]*);/u.exec(readText("packages", "core", "src", "creator-resources.ts"))?.[1] ?? "";
      expect(countMatches(providers, /"[a-z]+"/gu)).toBe(26);
      const engine = readText("apps", "api", "src", "modules", "creator-resources", "resource-engine.ts");
      expect(engine).toContain("AbortSignal.timeout(6000)");
      expect(engine).toContain("MAX_BODY = 2 * 1024 * 1024;");
      const manifest = /scopes: \[([^\]]*)\]/u.exec(readText("apps", "api", "src", "modules", "integration-platform", "integration-platform.service.ts"))?.[1] ?? "";
      expect(countMatches(manifest, /"[a-z.]+"/gu)).toBe(10);
      expect(readText("packages", "core", "src", "catalog", "cover-policy.ts")).toContain("COVER_IMAGE_POLICY");
    },
  },
  {
    lesson: "seminar-ai-harness", claim: "하네스 필수 파일 19개, loop 명령 파일 23개", needles: ["19개", "23개", "AGENTS.md"],
    check: () => {
      const harness = readText("scripts", "agent-harness.mjs");
      const required = /const REQUIRED_FILES = \[([^\]]*)\]/u.exec(harness)?.[1] ?? "";
      expect(countMatches(required, /"[^"]+"/gu)).toBe(19);
      expect(readdirSync(repo(".opencode", "command")).filter((name) => name.startsWith("loop"))).toHaveLength(23);
    },
  },
  {
    lesson: "seminar-build-alignment", claim: "승인 SHA 40자리(절차)·번들에는 SHA 없음, pnpm 11/Node 24.16/--frozen-lockfile, 공유 계약 패키지, 내용 해시 buildId 12자, 프로토콜 버전 8 거절, 사라진 청크 한 번 새로고침", needles: ["40자리", "SHA를 말하지 않아", "절차가 보증", "pnpm 11", "Node 24.16", "--frozen-lockfile", "@toonstudio/contracts", "buildId(12자)", "프로토콜 버전(8)", "한 번만 새로고침"],
    check: () => {
      const deploy = readText("scripts", "deploy-cloudflare-static.mjs");
      expect(deploy).toContain("approvedSha?.length !== 40");
      expect(deploy).toContain('["branch", "--show-current"]');
      expect(deploy).toContain('["status", "--porcelain"]');
      expect(deploy).toContain('["rev-parse", "HEAD"]');
      const pkg = JSON.parse(readText("package.json")) as { readonly packageManager: string; readonly engines: { readonly node: string } };
      expect(pkg.packageManager).toBe("pnpm@11.4.0");
      expect(pkg.engines.node).toBe(">=24.16.0");
      expect(readText(".github", "workflows", "admin-hardening-regression.yml")).toContain("pnpm install --frozen-lockfile");
      expect(readText("apps", "web", "src", "shared", "lib", "strict-raster-image-inspector.ts")).toContain("@toonstudio/contracts");
      expect(readText("apps", "api", "src", "modules", "catalog", "catalog.controller.ts")).toContain("@toonstudio/contracts");
      // 프런트 buildId: 내용 해시(SHA-256)의 앞 12자. 번들과 API 헬스 응답에는 커밋 SHA 가 없다(도감 카드가 코드 기준으로 확인).
      expect(readText("apps", "web", "src", "app", "service-worker", "studio-service-worker-precache-plan.ts")).toContain("return digest(fingerprint).slice(0, 12);");
      expect(readText("apps", "web", "vite.config.ts")).toContain('createHash("sha256")');
      expect(cardText("build-fingerprint-map")).toContain("번들과 API 헬스 응답에는 커밋 SHA가 없음");
      // 실시간 프로토콜 버전 8 은 z.literal 로 강제하고, 사라진 청크는 자동 새로고침을 한 번만 시도한다(오류 경계는 세션당, import 래퍼는 청크당).
      const protocol = readText("apps", "api", "src", "modules", "creator", "studio-live.protocol.ts");
      expect(protocol).toContain("STUDIO_CRDT_PROTOCOL_VERSION = 8 as const;");
      expect(protocol).toContain("z.literal(STUDIO_CRDT_PROTOCOL_VERSION)");
      expect(readText("apps", "web", "src", "app", "errors", "chunk-reload-guard.ts")).toContain("세션당 1회");
    },
  },
];

describe("대본의 수치·파일은 원본과 같다", () => {
  it("대조표는 알려진 레슨만 가리키고, 표의 문구가 실제 대본(한국어)에 들어 있다", () => {
    const ids = new Set(lessons.map((lesson) => lesson.id));
    const problems: string[] = [];
    for (const fact of LESSON_FACTS) {
      if (!ids.has(fact.lesson)) problems.push(`${fact.lesson}: 없는 레슨`);
      const script = lessons.find((lesson) => lesson.id === fact.lesson)?.script.ko ?? "";
      for (const needle of fact.needles) if (!script.includes(needle)) problems.push(`${fact.lesson}: 대본에 "${needle}" 없음(${fact.claim})`);
    }
    expect(problems).toEqual([]);
  });

  it.each(LESSON_FACTS.map((fact): [string, string, LessonFact] => [fact.lesson, fact.claim, fact]))("%s · %s", (_lesson, _claim, fact) => {
    fact.check();
  }, 60_000);
});
