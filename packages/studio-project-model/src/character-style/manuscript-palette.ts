import { collectManuscriptHexColors } from "./color-channels";

const sampleColors = [
  { nameKo: "슬레이트 네이비", oklch: "oklch(0.28 0.04 252)" },
  { nameKo: "앰버", oklch: "oklch(0.76 0.11 72)" },
  { nameKo: "코랄", oklch: "oklch(0.64 0.19 24)" },
] as const;

interface SwatchDirections {
  readonly hex: string;
  readonly oklch: string;
  readonly names: Set<string>;
  readonly restrictions: Set<string>;
}

const forbiddenHeading = /(?:금지색|제외색)(?:은|는)?\s*[:：=]?$|(?:사용\s*금지|적용\s*금지|사용\s*제외|(?:^|\s)(?:금지|제외))\s*[:：=]$/u;
const forbiddenAfterColor = /^(?:[은는을를]\s*)?(?:(?:사용|적용|채색)\s*)?(?:금지|제외)(?!\s*(?:아님|아니|해제|취소))(?:합니다|하세요|한다|함|하고|할\s*것)?(?=$|[\s)])/u;
const doNotUseColor = /^(?:[은는을를]\s*)?(?:쓰지|사용하지|적용하지|칠하지)\s*(?:마세요|말아\s*주세요|말\s*것|말자|않는다|않습니다|않아요|않음|않기)(?=$|[\s)])/u;
const explicitUse = /^(?:[을를]\s*)?(?:사용|적용|채택|허용)(?:합니다|한다|하세요|하고|함)?$/u;

function collectSwatchDirections(inputText: string): SwatchDirections[] {
  const swatches = new Map<string, SwatchDirections>();
  // 금지색 목록의 쉼표는 다음 항목이 색 값만 가질 때에만 금지 범위를 잇는다.
  for (const line of inputText.split(/[\r\n;|.!?。！？]/u)) {
    let listHeading = "";
    for (const cell of line.split(",")) {
      const entry = cell.trim();
      const mentions = Array.from(entry.matchAll(/#[a-z\d_]+/giu));
      const first = mentions[0];
      if (!first) {
        listHeading = "";
        continue;
      }
      const heading = entry.slice(0, first.index).trim();
      const onlyColors = /^(?:[\s/·]|및|또는|그리고|와|과)*$/u.test(entry.slice(first.index).replace(/#[a-z\d_]+/giu, ""));
      if (heading || !onlyColors) listHeading = "";
      if (forbiddenHeading.test(heading) && onlyColors) listHeading = heading;

      for (const [index, mention] of mentions.entries()) {
        const [color] = collectManuscriptHexColors(mention[0]);
        if (!color) continue;
        const swatch = swatches.get(color.oklch) ?? { ...color, names: new Set<string>(), restrictions: new Set<string>() };
        swatches.set(color.oklch, swatch);
        const previous = mentions[index - 1];
        const rawBefore = entry.slice(previous ? previous.index + previous[0].length : 0, mention.index);
        const rawAfter = entry.slice(mention.index + mention[0].length, mentions[index + 1]?.index);
        const before = rawBefore.trim();
        const after = rawAfter.trim();
        const denied = forbiddenAfterColor.exec(after) ?? doNotUseColor.exec(after);
        if (listHeading || forbiddenHeading.test(before) || denied) {
          // 긴 자유 서술을 잘라 관계를 바꾸지 않고, 해당 색에 직접 붙은 지시를 인용한다.
          const prefix = listHeading && listHeading !== before ? `${listHeading} ` : rawBefore;
          const context = prefix.trim().length <= 60 ? prefix.trimStart() : "원고의 금지색 ";
          const suffix = denied ? rawAfter.slice(0, rawAfter.indexOf(denied[0]) + denied[0].length) : "";
          const quote = `${context}${mention[0]}${suffix}`;
          swatch.restrictions.add(quote);
        } else if (!after && !previous) {
          const label = /^([\p{L}\p{N}][\p{L}\p{M}\p{N} ()/·_-]{0,59}?)\s*[:：=]$/u.exec(before)?.[1];
          if (label) swatch.names.add(label.trim());
        } else if (explicitUse.test(after) && !previous && /^[\p{L}\p{N}][\p{L}\p{N} ]{0,55}?(?:에서|에)(?:는|만)?$/u.test(before)) {
          swatch.names.add(before);
        }
      }
    }
  }
  return [...swatches.values()];
}

function reviewRestrictions(withheld: SwatchDirections[]): string {
  if (!withheld.length) return "";
  const notes: string[] = [];
  for (const { hex, names, restrictions } of withheld) {
    const used = [...names].join(" · ");
    const denied = [...restrictions].join(" / ");
    const note = used ? `${hex}의 사용 표기 「${used}」와 금지 표기 「${denied}」` : `「${denied}」`;
    if ([...notes, note].join(", ").length > 250) break;
    notes.push(note);
  }
  const rest = withheld.length - notes.length;
  const listed = notes.length ? notes.join(", ") : "";
  const remaining = rest ? `${listed ? " 외 " : ""}${rest}색의 원문 지시` : "";
  return ` 사용을 보류한 색의 범위를 확인하세요. ${listed}${remaining}.`;
}

/** 원고에서 확인한 지정색과 수동 비교용 예시를 구분하는 로컬 배색 안내. */
export function buildLocalColorMood(inputText: string) {
  const swatches = collectSwatchDirections(inputText);
  const colors = swatches.filter((color) => color.restrictions.size === 0);
  const withheld = swatches.filter((color) => color.restrictions.size > 0);
  const palette = colors.slice(0, 8).map(({ hex, oklch, names }) => {
    const listed = [...names].slice(0, 4).join(" · ");
    const extra = names.size > 4 ? ` 외 ${names.size - 4}개` : "";
    return {
      role: "원고 지정색", nameKo: hex, oklch,
      usageTip: names.size ? `원고에서 이 색에 붙인 표기 — ${listed}${extra}.` : "색상 선택기에서 원본 HEX를 확인하고 원고의 사용 조건을 따르세요.",
    };
  });
  for (const sample of sampleColors.slice(0, Math.max(0, 3 - palette.length))) {
    palette.push({ ...sample, role: "예시 후보", usageTip: "비교용 견본입니다. 원고의 색별 사용 범위를 확인한 뒤 선택하세요." });
  }
  let summary = swatches.length ? `원고의 서로 다른 HEX ${swatches.length}색을 확인했습니다.` : "원고에 HEX 지정색이 없어 비교용 예시 세 색을 제안합니다.";
  if (colors.length > 8) summary += " 입력 순서대로 처음 여덟 색을 표시합니다.";
  if (colors.length > 0 && colors.length < 3) summary += " 나머지는 비교용 예시입니다.";
  if (withheld.length && !colors.length) summary += " 팔레트 세 색은 모두 비교용 예시입니다.";
  return {
    emotionLabel: colors.length ? "원고 지정색" : "예시 배색",
    moodSummary: summary + reviewRestrictions(withheld),
    palette,
    lightingGuide: "기준색을 별도 견본으로 남긴 뒤 조명 레이어를 켜고 꺼서 밝기와 색 변화를 비교하세요.",
    contrastWarning: "대사 글자와 말풍선 바탕의 대비를 확인하세요. 반투명 색은 최종 배경 위에 합성한 뒤 측정하세요.",
  };
}
