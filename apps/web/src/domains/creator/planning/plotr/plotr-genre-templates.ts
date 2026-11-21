/**
 * Plotr 대본 도우미 + 1클릭 초보자 장르 템플릿 통합 레지스트리 및 순수 초안·추출 엔진.
 */
import type { DualSubwayTimelineDocument } from "../studio-dual-subway-timeline";
import type { SpatialStoryBoardDocument } from "../studio-spatial-story-board-canvas";
import type {
  CodexEntityEntry,
  ScriptSceneCard,
} from "../../writer-room/studio-scrivenings-snapshot-codex";
import type {
  PlotrConsistencyAsset,
  PlotrGenreTemplateId,
  PlotrOutputFormat,
  PlotrScriptHelperConfig,
} from "./plotr-types";
import { PLOTR_TEMPLATES_PRIMARY } from "./plotr-genre-template-presets";
import { PLOTR_TEMPLATES_SECONDARY } from "./plotr-genre-template-presets-extra";

export interface PlotrGenreTemplate {
  readonly id: PlotrGenreTemplateId;
  readonly labelKo: string;
  readonly badgeKo: string;
  readonly summaryKo: string;
  readonly defaultFormat: PlotrOutputFormat;
  readonly title: string;
  readonly accentOklch: string;
  readonly helper: PlotrScriptHelperConfig;
  readonly rawScript: string;
  readonly assets: readonly PlotrConsistencyAsset[];
  readonly scenes: readonly ScriptSceneCard[];
  readonly codexEntries: readonly CodexEntityEntry[];
  readonly subwayTimeline: DualSubwayTimelineDocument;
  readonly spatialBoard: SpatialStoryBoardDocument;
}

export const PLOTR_TREND_TAGS: readonly string[] = Object.freeze([
  "계약결혼",
  "회귀각성",
  "비밀정체",
  "역전사이다",
  "시간제한",
  "혐관로맨스",
  "폐쇄공간",
  "단서추리",
]);

export const PLOTR_REWRITE_DIRECTIVES: readonly string[] = Object.freeze([
  "주인공을 더 냉소적으로 다듬기",
  "긴장감을 높이고 대사를 짧게 끊기",
  "마지막 컷 클리프행어를 강하게 바꾸기",
  "감정 여운과 나레이션을 보강하기",
]);

export const PLOTR_GENRE_TEMPLATES: readonly PlotrGenreTemplate[] = Object.freeze([
  ...PLOTR_TEMPLATES_PRIMARY,
  ...PLOTR_TEMPLATES_SECONDARY,
]);

export function findPlotrGenreTemplate(
  id: PlotrGenreTemplateId,
): PlotrGenreTemplate {
  return (
    PLOTR_GENRE_TEMPLATES.find((tpl) => tpl.id === id) ??
    PLOTR_GENRE_TEMPLATES[0]!
  );
}

/**
 * 플로터 대본 도우미 클린룸 생성기:
 * 장르·독자·분위기·분량·트렌드 태그·한 줄 소재로 바로 컷 분해 가능한 대본 초안을 만든다.
 */
export function generatePlotrScriptDraft(config: PlotrScriptHelperConfig): string {
  const genre = config.genre.trim() || "판타지";
  const mood = config.mood.trim() || "긴장감 있게";
  const logline =
    config.logline.trim() ||
    `${genre} 세계의 주인공이 예상치 못한 사건과 마주해 첫 선택을 내린다.`;
  const tagsLine =
    config.trendTags.length > 0 ? config.trendTags.join(" · ") : "반전 시작";
  const setting = config.worldSettingNote.trim() || `${genre} 핵심 무대`;
  const cutCount = config.length === "short" ? 4 : config.length === "long" ? 6 : 5;

  const lines: string[] = [
    `[컷 1] ${setting}. ${mood} 공기 속에서 주인공이 사건의 첫 징후를 마주한다.`,
    `주인공: (나레이션) ${logline}`,
    `[컷 2] 낯선 조력자가 핵심 단서(${tagsLine})를 건네며 시간제한이 시작됐음을 알린다.`,
    `조력자: "지금 결정하지 않으면 오늘 밤 모든 게 뒤집혀."`,
    `[컷 3] 주인공이 숨을 고르며 정면으로 시선을 올린다. 배경 빛이 강하게 갈라진다.`,
    `주인공: "피할 생각 없어. 판은 내가 먼저 엎는다."`,
    `[컷 4] 예상 밖의 상대가 어둠 너머에서 모습을 드러내며 첫 대치가 완성된다.`,
    `상대역: "흥미롭군. 그 선택의 대가를 감당할 수 있을까?"`,
  ];

  if (cutCount >= 5) {
    lines.push(
      `[컷 5] 클로즈업. 주인공의 손에 쥔 핵심 소품이 빛나며 다음 화 사건이 점화된다.`,
      `주인공: (나레이션) 진짜 반전은 바로 다음 문 너머에서 시작됐다.`,
    );
  }
  if (cutCount >= 6) {
    lines.push(
      `[컷 6] 넓은 풀샷으로 흔들리는 무대 전경과 남겨진 질문을 비추며 회차를 마무리한다.`,
      `조력자: "돌이킬 수 없어. 이제 시작이야."`,
    );
  }
  return lines.join("\n");
}

/**
 * 플로터 'AI로 수정' 지시문 반영(로컬 결정론적 리라이트).
 */
export function revisePlotrScriptByDirective(
  currentScript: string,
  directive: string,
): string {
  const trimmedScript = currentScript.trim();
  const cleanDirective = directive.trim();
  if (!trimmedScript || !cleanDirective) return trimmedScript;

  const lines = trimmedScript.split("\n");
  if (/냉소|차갑|단호/u.test(cleanDirective)) {
    return lines
      .map((line) =>
        line.includes(":") && !line.includes("(나레이션)")
          ? line.replace(/!|…/gu, ".").replace(/"([^"]+)"/u, '"감상은 필요 없어. $1"')
          : line,
      )
      .join("\n");
  }
  if (/긴박|짧게|속도/u.test(cleanDirective)) {
    return lines
      .map((line) =>
        line.startsWith("[컷")
          ? `${line} (빠른 템포, 날카로운 클로즈업)`
          : line,
      )
      .join("\n");
  }
  if (/클리프행어|엔딩|마지막/u.test(cleanDirective)) {
    const nextNumber =
      (trimmedScript.match(/\[컷\s*\d+\]/gu)?.length ?? 0) + 1;
    return [
      trimmedScript,
      `[컷 ${nextNumber}] 화면이 암전되기 직전, 정체를 숨긴 인물이 주인공의 이름을 부른다.`,
      `미지의 인물: "아직 끝나지 않았어. 진짜 거래는 지금부터야."`,
    ].join("\n");
  }
  return `${trimmedScript}\n[연출 보강 메모 — ${cleanDirective}]`;
}

/**
 * 대본 텍스트에서 화자·배경·소품 후보를 자동 추출해 일관성 소재 카드로 변환한다.
 */
export function extractConsistencyAssetsFromScript(
  script: string,
  existing: readonly PlotrConsistencyAsset[] = [],
): readonly PlotrConsistencyAsset[] {
  const swatches = [
    "oklch(0.66 0.18 340)",
    "oklch(0.6 0.18 250)",
    "oklch(0.68 0.16 155)",
    "oklch(0.72 0.15 75)",
  ];
  const byName = new Map(existing.map((item) => [item.name.trim(), item]));
  const result: PlotrConsistencyAsset[] = [...existing];
  let idx = existing.length;

  const addIfMissing = (
    category: PlotrConsistencyAsset["category"],
    name: string,
    material: string,
  ) => {
    const clean = name.trim();
    if (!clean || clean.length > 18 || byName.has(clean)) return;
    const created: PlotrConsistencyAsset = {
      id: `asset-auto-${category}-${idx + 1}`,
      category,
      name: clean,
      visualNote: "",
      swatchOklch: swatches[idx % swatches.length]!,
      costumeOrMaterial: material,
    };
    idx += 1;
    byName.set(clean, created);
    result.push(created);
  };

  for (const rawLine of script.split("\n")) {
    const line = rawLine.trim();
    const speakerMatch = /^([가-힣A-Za-z0-9\s]{1,12})\s*:/u.exec(line);
    if (speakerMatch) {
      const speaker = speakerMatch[1]!.trim();
      if (!/^컷\s*\d+$/u.test(speaker) && speaker !== "장면") {
        addIfMissing("character", speaker, "대본에서 추출한 주요 등장인물");
      }
    }
    const locMatch = /((?:[가-힣0-9]{1,8}\s+)?[가-힣0-9]{0,6}(?:연회장|교실|현관|미술실|도서관|성채|측정실|게이트|회송역|옥상|복도|통로))/u.exec(
      line,
    );
    if (locMatch) {
      addIfMissing("location", locMatch[1]!, "대본에서 추출한 주요 배경 공간");
    }
    const propMatch = /([가-힣]{1,8}(?:시계|단검|스케치북|녹음기|편지|반지|열쇠|우산|방패))/u.exec(
      line,
    );
    if (propMatch) {
      addIfMissing("prop", propMatch[1]!, "장면의 핵심 일관성 소품");
    }
  }

  return Object.freeze(result);
}
