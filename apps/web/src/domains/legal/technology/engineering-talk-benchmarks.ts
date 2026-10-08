import { COMPETITOR_DOMAIN_SUMMARY } from "./engineering-map-competitors-summary";
import type { LocalizedText } from "./engineering-story-content";
import { TALK_TABLE_MAX_ROWS, sourcedTable, t } from "./engineering-talk-kit";

/**
 * 세미나 발표의 "벤치마크 지도" 표(`talk-benchmarks`).
 *
 * - 제품 이름·개수는 하드코딩하지 않는다. 경쟁·참고 제품 지도의 영역별 요약(`COMPETITOR_DOMAIN_SUMMARY`, 지도 행에서 계산)을 그대로 받는다.
 * - 표는 8행까지만 읽히므로 영역을 손으로 정한 묶음(`BENCHMARK_GROUPS`)으로 합친다. 어느 묶음에도 없는 새 영역은 마지막 묶음에 들어가
 *   이름이 사라지는 일이 없다.
 * - "참고한 제품"은 비교 기록이 있는 제품(`studiedNames`)만 센다. 감시 목록·대상 목록에만 있어 "미조사"로 적힌 제품(`watchedNames`)은
 *   직접 비교한 기록이 없어 표에서 빼고 개수만 밝힌다(지도의 작성 규칙과 같다).
 * - 이름이 너무 많아 글자가 읽히지 않을 정도가 되면(`BENCHMARK_NAME_CHAR_BUDGET`) 영역마다 앞쪽 이름만 남기고 "외 N곳"을 붙이며,
 *   전체는 기술 지도에서 보도록 안내한다. 이름이 예산 안이면 모든 이름이 표에 있다(콘텐츠 테스트가 두 경우를 모두 확인).
 * - "배운 점 한 줄"은 묶음마다 손으로 쓴다. 지도 행의 `learned` 칸에서 근거를 찾을 수 있는 말만 쓰고 콘텐츠 테스트가 근거 낱말을 대조한다.
 */

export interface BenchmarkGroupDef {
  readonly key: string;
  readonly label: LocalizedText;
  /** 경쟁·참고 제품 지도의 영역 키(`engineering-map-competitors-kit.ts` 의 `D` 의 키). 영역 순서가 묶음 안의 이름 순서다. */
  readonly domainIds: readonly string[];
  readonly learned: LocalizedText;
  /** 어느 묶음에도 없는 영역을 받는 마지막 묶음. */
  readonly catchAll?: boolean;
}

export const BENCHMARK_GROUPS: readonly BenchmarkGroupDef[] = [
  {
    key: "drawing-animation",
    label: t("그림·애니메이션", "Drawing & animation"),
    domainIds: ["drawing", "animation"],
    learned: t(
      "손떨림 보정·비파괴 편집·변형 구조를 배우되 코드·자산은 가져오지 않음",
      "Learned stroke stabilizing, non-destructive edits and deformation; took no code or assets",
    ),
  },
  {
    key: "three-d",
    label: t("3D·캐릭터", "3D & characters"),
    domainIds: ["threeD"],
    learned: t(
      "포즈·품질 기준을 배우되 상용 런타임·자산은 넣지 않음",
      "Learned posing and quality bars; shipped no commercial runtimes or assets",
    ),
  },
  {
    key: "collaboration",
    label: t("협업·가상공간", "Collaboration & virtual space"),
    domainIds: ["collab"],
    learned: t(
      "커서·근접 대화·P2P 표기를 배우되 ‘동등’ 주장은 하지 않음",
      "Learned cursors, nearby talk and P2P labels; claim no parity",
    ),
  },
  {
    key: "storyboard-design",
    label: t("콘티·검토·디자인", "Storyboard, review & design"),
    domainIds: ["storyboard", "design"],
    learned: t(
      "검토 상태 보드·만료 검토 링크·짧은 템플릿 길을 배움",
      "Learned review status boards, expiring review links and the short template path",
    ),
  },
  {
    key: "publishing",
    label: t("웹툰 유통·생태계", "Webtoon publishing"),
    domainIds: ["publishing"],
    learned: t(
      "예약·분석·연재 흐름을 배우되 외부 게시·수익 연동은 주장하지 않음",
      "Learned scheduling, analytics and release flows; claim no external publishing or revenue sync",
    ),
  },
  {
    key: "ai",
    label: t("AI·에이전트", "AI & agents"),
    domainIds: ["ai"],
    learned: t(
      "공급자 라우팅을 배우되 애매한 실패는 다시 보내지 않음",
      "Learned provider routing; never resend an ambiguous failure",
    ),
  },
  {
    key: "engines",
    label: t("엔진·표준", "Engines & standards"),
    domainIds: ["engines"],
    learned: t(
      "엔진은 미리 하나를 고르고 몰래 갈아타지 않으며 맞지 않으면 채택하지 않음",
      "Pick one engine up front, never switch silently, and adopt none that does not fit",
    ),
  },
  {
    key: "other",
    label: t("마켓·계정·그 밖", "Marketplaces, accounts & more"),
    domainIds: ["market", "identity"],
    learned: t(
      "제품별로 배운 점은 기술 지도에서 확인",
      "See the tech map for what each product taught us",
    ),
    catchAll: true,
  },
];

/**
 * 표에 쓰는 이름 글자 수(쉼표 포함)의 합 상한. 1280×720에서 표 글자가 읽히는 크기(약 11px 이상)를 지키는 선이며 화면 측정으로 정했다.
 * 넘으면 영역마다 앞쪽 이름만 남기고 "외 N곳"을 붙인다.
 */
export const BENCHMARK_NAME_CHAR_BUDGET = 650;

/** 한글이 든 제품 이름의 영어 표기. 영어 칸에는 한글을 쓰지 않으므로, 지도에 한글 이름이 더해지면 여기에 영어 표기를 더한다(테스트가 확인). */
const BENCHMARK_NAME_EN: Readonly<Record<string, string>> = {};

const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힣]/u;

/** 영역 하나의 요약 입력(`CompetitorDomainSummary` 에서 표에 필요한 것만). */
export interface BenchmarkDomainInput {
  readonly domainId: string;
  /** 비교·적용·불채택 관찰이 있는 제품 이름(지도 순서). */
  readonly studiedNames: readonly string[];
  /** 감시 목록·대상 목록에만 있어 표에서 빼는 제품 수. */
  readonly watchedCount: number;
}

export interface BenchmarkAreaRow {
  readonly key: string;
  readonly label: LocalizedText;
  readonly learned: LocalizedText;
  /** 이 묶음에 든 직접 살펴본 제품의 전체 수. */
  readonly total: number;
  /** 표에 이름이 보이는 제품(지도 순서). */
  readonly shown: readonly string[];
  /** 표에서 이름이 빠지고 "외 N곳"으로만 센 제품 수. 예산 안이면 0. */
  readonly omitted: number;
}

export interface BenchmarkPlan {
  readonly areas: readonly BenchmarkAreaRow[];
  /** 지도 행 전체(비교 기록이 있는 제품 + 감시 목록에만 있는 제품). */
  readonly total: number;
  /** 비교 기록이 있는 제품(표에 오르는 대상). */
  readonly studied: number;
  /** 감시 목록에만 있는 제품(표에서 뺌). */
  readonly watchOnly: number;
  /** 예산 때문에 표에서 이름이 빠진 제품 수. */
  readonly omitted: number;
}

function groupIndexOf(domainId: string): number {
  const found = BENCHMARK_GROUPS.findIndex((group) => group.domainIds.includes(domainId));
  return found >= 0 ? found : BENCHMARK_GROUPS.findIndex((group) => group.catchAll);
}

/** 이름 목록을 글자 수 예산(쉼표·공백 포함) 안에서 앞쪽부터 남긴다. 한 개는 항상 남긴다. */
function takeWithinBudget(names: readonly string[], budget: number): readonly string[] {
  const kept: string[] = [];
  let used = 0;
  for (const name of names) {
    const next = used + (kept.length > 0 ? 2 : 0) + name.length;
    if (kept.length > 0 && next > budget) break;
    kept.push(name);
    used = next;
  }
  return kept;
}

/**
 * 영역별 요약을 묶음별로 모아 표 계획을 만든다. 순수 함수라 콘텐츠 테스트가 가짜 영역으로 예산 넘침을 확인한다.
 * 묶음 안의 이름 순서는 묶음의 영역 순서, 그다음 지도 순서다.
 */
export function planBenchmarks(domains: readonly BenchmarkDomainInput[], budget: number = BENCHMARK_NAME_CHAR_BUDGET): BenchmarkPlan {
  const byGroup = BENCHMARK_GROUPS.map(() => [] as BenchmarkDomainInput[]);
  for (const domain of domains) byGroup[groupIndexOf(domain.domainId)]?.push(domain);
  const present = BENCHMARK_GROUPS.flatMap((group, index) => {
    const rank = (domain: BenchmarkDomainInput): number => {
      const position = group.domainIds.indexOf(domain.domainId);
      return position >= 0 ? position : group.domainIds.length;
    };
    const names = [...(byGroup[index] ?? [])].sort((a, b) => rank(a) - rank(b)).flatMap((domain) => domain.studiedNames);
    return names.length > 0 ? [{ group, names }] : [];
  });
  const totalChars = present.reduce((sum, entry) => sum + entry.names.join(", ").length, 0);
  const overBudget = totalChars > budget;
  const areas = present.slice(0, TALK_TABLE_MAX_ROWS).map((entry): BenchmarkAreaRow => {
    const quota = overBudget ? Math.max(40, Math.floor((budget * entry.names.join(", ").length) / totalChars)) : Number.POSITIVE_INFINITY;
    const shown = overBudget ? takeWithinBudget(entry.names, quota) : entry.names;
    return {
      key: entry.group.key,
      label: entry.group.label,
      learned: entry.group.learned,
      total: entry.names.length,
      shown,
      omitted: entry.names.length - shown.length,
    };
  });
  const studied = domains.reduce((sum, domain) => sum + domain.studiedNames.length, 0);
  const watchOnly = domains.reduce((sum, domain) => sum + domain.watchedCount, 0);
  return {
    areas,
    total: studied + watchOnly,
    studied,
    watchOnly,
    omitted: areas.reduce((sum, area) => sum + area.omitted, 0),
  };
}

function enName(name: string): string | null {
  if (!HANGUL.test(name)) return name;
  return BENCHMARK_NAME_EN[name] ?? null;
}

/** 표의 이름 칸. 예산을 넘겨 빠진 제품이 있으면 "외 N곳"을 붙인다. */
export function benchmarkNamesCell(area: BenchmarkAreaRow): LocalizedText {
  const ko = area.shown.join(", ");
  const en = area.shown.flatMap((name) => {
    const english = enName(name);
    return english ? [english] : [];
  }).join(", ");
  if (area.omitted === 0) return t(ko, en);
  return t(`${ko}, 외 ${area.omitted}곳`, `${en}, +${area.omitted} more`);
}

export const BENCHMARK_PLAN: BenchmarkPlan = planBenchmarks(
  COMPETITOR_DOMAIN_SUMMARY.map((domain) => ({
    domainId: domain.domainId,
    studiedNames: domain.studiedNames,
    watchedCount: domain.watchedNames.length,
  })),
);

/** 표의 제목·리드. 개수는 모두 계획에서 계산한다. */
export const BENCHMARK_TITLE: LocalizedText = t(
  `참고한 제품 ${BENCHMARK_PLAN.studied}곳, 영역별 한 장`,
  `${BENCHMARK_PLAN.studied} products we studied, one map by area`,
);

export const BENCHMARK_LEAD: LocalizedText = BENCHMARK_PLAN.watchOnly > 0
  ? t(
    `비교 기록이 있는 ${BENCHMARK_PLAN.studied}곳을 영역별로 묶었습니다. 우열과 가격은 말하지 않고 배운 점만 가져왔으며, 감시 목록에만 있는 ${BENCHMARK_PLAN.watchOnly}곳을 더한 전체 ${BENCHMARK_PLAN.total}곳은 기술 지도에서 봅니다.`,
    `The ${BENCHMARK_PLAN.studied} products with a recorded comparison are grouped by area. No rankings or prices, only what we learned; all ${BENCHMARK_PLAN.total}, including ${BENCHMARK_PLAN.watchOnly} that are only on the watch list, are in the tech map.`,
  )
  : t(
    `경쟁·참고 제품 ${BENCHMARK_PLAN.studied}곳을 영역별로 묶었습니다. 우열과 가격은 말하지 않고 배운 점만 가져왔으며, 제품별 내용은 기술 지도에서 봅니다.`,
    `All ${BENCHMARK_PLAN.studied} competitor and reference products are grouped by area. No rankings or prices, only what we learned; per-product detail lives in the tech map.`,
  );

export const BENCHMARKS = sourcedTable(
  [t("영역", "Area"), t("참고한 제품", "Products we studied"), t("배운 점 한 줄", "One line learned")],
  BENCHMARK_PLAN.areas.map((area) => [
    area.key,
    t(`${area.label.ko} (${area.total})`, `${area.label.en} (${area.total})`),
    benchmarkNamesCell(area),
    area.learned,
  ] as const),
);
