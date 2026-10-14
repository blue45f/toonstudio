/**
 * Studio Dialogue Bubble Fit — 대사-말풍선 핏 **사전 경고** 순수 코어 (REPORT L-2).
 *
 * 왜 이 모듈이 따로 있어야 하는가
 * ------------------------------
 * 말풍선이 대사를 담는지는 지금까지 **식자·커밋 시점**에야 드러났다:
 *  · 기본 모드는 커밋 때 상자 높이가 자동으로 커지고(fitBubbleBoxHeightToText),
 *  · "크기 고정"(autoShrinkText)은 렌더 때 폰트가 조용히 줄어들며,
 *  · 하한에서도 못 들어가면 Konva.Text가 남는 줄을 경고 없이 버린다.
 * 그래서 작가는 식자에 착수한 뒤에야 "이 컷은 안 들어간다"를 알고 재배치 왕복을 했다.
 *
 * 이 모듈이 추가하는 것:
 *  · 대사가 확정·수정되는 즉시(대사 일괄 편집 패널이 pages를 받는 그 시점) 기존 핏
 *    엔진(studio-bubble-text-fit)의 **바로 그 판정**을 미리 돌려, 넘침이 예상되는
 *    컷을 목록으로 준다. 새 추정 공식을 만들지 않는다 — 렌더·커밋과 같은
 *    bubbleTextFitsInBox/fitBubbleBoxHeightToText/fitBubbleFontSize를 그대로 쓰므로
 *    "사전 경고는 넘친다는데 실제로는 들어간다"는 모순이 구조적으로 생기지 않는다.
 *  · 결과는 어디까지나 **예상 경고**다. 대사를 고치거나 상자를 키우는 일은 하지
 *    않는다 — 자동 수정이 아니라 식자 착수 전 목록화가 이 기능의 몫이다
 *    (studio-dialogue-spellcheck의 "의심" 규율과 동일).
 *
 * 정직성 규칙:
 *  · 말풍선 크기(width/height)가 없거나 잘못된 요소는 "들어간다"고 거짓말하지 않고
 *    kind "unmeasurable"로 따로 센다(가져오기·레거시 문서에서 생길 수 있다).
 *  · 테마를 모르는 호출부에서는 행간을 테마 기본값의 **최댓값**(과소평가하면 대사가
 *    사라지는 쪽 오류)으로 잡는 text-fit의 폴백을 그대로 따른다 — 경고가 실제보다
 *    이르게 뜰 수는 있어도, 늦게 떠서 대사가 잘리는 일은 없다.
 *  · 숨김 대사는 기본 제외(화면에 없는 대사는 게시물에 없다 — spellcheck와 동일).
 *    잠긴 대사는 읽기가 잠금과 무관하므로 검사한다.
 *  · 텍스트 요소(elType "text")는 말풍선 상자가 없어 핏 개념이 없다 — 세지 않는다.
 *
 * 규칙(studio-dialogue-batch.ts와 동일 규율):
 *  - Konva/DOM 의존 없음(전부 순수·결정적). 텍스트 폭 측정은 text-fit과 같은
 *    BubbleTextMeasurer 포트로 주입받는다(기본값은 실제 캔버스 측정기).
 *  - 입력 배열/객체는 절대 변형하지 않는다. 사용자 노출 문자열은 한글.
 */

import { isEffectivelyHidden, type LayerGroup } from "../studio-layers";
import {
  dialogueExcerpt,
  isDialogueElement,
  type DialogueElementLike,
} from "./studio-dialogue-batch";
import {
  bubbleLetterSpacing,
  bubbleTextFitsInBox,
  createCanvasBubbleTextMeasurer,
  fitBubbleBoxHeightToText,
  fitBubbleFontSize,
  resolveBubbleFontFamily,
  resolveBubbleFontSize,
  resolveBubbleFontStyle,
  resolveBubbleLineHeight,
  type BubbleTextMeasurer,
  type BubbleWebtoonTheme,
} from "./studio-bubble-text-fit";

// ── 구조 타입 — BubbleEl(studio-element-model)의 핏 판정에 필요한 최소 부분집합 ──

/** 말풍선 요소의 핏 관련 필드 — DialogueElementLike에 없는 타이포그래피 필드를 얹는다. */
export type BubbleFitElementLike = DialogueElementLike & {
  fontSize?: number;
  lineHeight?: number;
  vertical?: boolean;
  font?: string;
  fontStyle?: string;
  /** true면 높이 대신 폰트 자동 축소 모드(studio-bubble-text-fit의 fitBubbleFontSize 경로). */
  autoShrinkText?: boolean;
  autoShrinkMinFontSize?: number;
};

/** 페이지 최소 형태 — DialoguePageLike와 구조 호환(호출부는 pages를 그대로 넘긴다). */
export type BubbleFitPageLike = {
  id: string;
  elements: readonly BubbleFitElementLike[];
  groups?: LayerGroup[];
};

// ── 데이터 모델 ─────────────────────────────────────────────────────────────

export type BubbleFitWarningKind =
  /** 지금 상자로는 대사가 다 들어가지 않을 것으로 예상됨. */
  | "overflow"
  /** 들어가긴 하지만 자동 축소로 글자가 눈에 띄게 작아질 것으로 예상됨. */
  | "shrink"
  /** 말풍선 크기가 없어 핏을 계산할 수 없음 — "들어간다"는 뜻이 아니다. */
  | "unmeasurable";

export type BubbleFitSeverity = "warning" | "info";

export interface BubbleFitWarning {
  readonly id: string;
  /** 요소 id(DialogueBatchItem.id와 같은 공간). */
  readonly itemId: string;
  readonly pageId: string;
  /** 0 기준 페이지 순번(표시할 땐 +1). */
  readonly pageIndex: number;
  readonly kind: BubbleFitWarningKind;
  readonly severity: BubbleFitSeverity;
  /** 사용자에게 보여 줄 한 줄 설명 — 전부 "예상" 어조. */
  readonly message: string;
  /** 대사 한 줄 미리보기(목록 행 식별용). */
  readonly excerpt: string;
  /** 실효 폰트 크기(px). */
  readonly fontSize: number;
  /** 말풍선 전체 폭/높이(px). 크기를 모르면 null. */
  readonly boxWidth: number | null;
  readonly boxHeight: number | null;
  /** 대사가 다 들어가려면 필요한 말풍선 전체 높이(px). overflow(확장 모드)에서만. */
  readonly requiredHeight?: number;
  /** 부족한 높이(px, 양수). overflow(확장 모드)에서만. */
  readonly overflowPx?: number;
  /** 자동 축소로 실제로 들어가게 될 폰트 크기(px). shrink에서만. */
  readonly fittedFontSize?: number;
}

export interface DialogueBubbleFitOptions {
  /** 텍스트 폭 측정기. 미지정 시 실제 캔버스 측정기(text-fit 기본값과 동일). */
  readonly measurer?: BubbleTextMeasurer;
  /** 숨김 대사도 검사(기본 false — 화면에 안 보이는 대사는 게시물에 없다). */
  readonly includeHidden?: boolean;
  /** 작품 테마 — 행간·자간 기본값 결정. 모르면 undefined(보수적 폴백). */
  readonly theme?: BubbleWebtoonTheme;
}

/** QC 체크리스트 합류용 요약 — spellcheck summary와 같은 결(건수 중심). */
export interface DialogueBubbleFitSummary {
  /** 검사 대상 말풍선 수(숨김 제외 기준). */
  readonly totalBubbleCount: number;
  /** 실제로 핏을 계산한 말풍선 수. */
  readonly checkedCount: number;
  /** 경고 없이 들어가는 말풍선 수. */
  readonly okCount: number;
  readonly overflowCount: number;
  readonly shrinkCount: number;
  readonly unmeasurableCount: number;
  /** overflow + shrink (unmeasurable은 "경고"가 아니라 "확인 불가"라 따로 센다). */
  readonly warningCount: number;
  /** 경고(overflow/shrink)가 하나라도 있는 페이지 수. */
  readonly affectedPageCount: number;
}

export interface DialogueBubbleFitResult {
  readonly warnings: readonly BubbleFitWarning[];
  readonly summary: DialogueBubbleFitSummary;
}

// ── 사전 계산 ───────────────────────────────────────────────────────────────

function finitePositive(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * 전체 페이지의 말풍선을 대상으로 핏 사전 계산을 돌린다.
 * 반환 warnings는 페이지 순서 → 요소 순서(문서 순서) 그대로다(패널 그룹핑이 페이지
 * 순서를 다시 만들지 않도록). ok인 말풍선은 warnings에 넣지 않고 summary로만 센다.
 */
export function previewDialogueBubbleFit(
  pages: readonly BubbleFitPageLike[],
  options: DialogueBubbleFitOptions = {}
): DialogueBubbleFitResult {
  const measurer = options.measurer ?? createCanvasBubbleTextMeasurer();
  const includeHidden = options.includeHidden ?? false;
  const warnings: BubbleFitWarning[] = [];
  let totalBubbleCount = 0;
  let checkedCount = 0;
  let okCount = 0;
  const affectedPages = new Set<string>();

  pages.forEach((page, pageIndex) => {
    const groups = page.groups ?? [];
    for (const el of page.elements) {
      if (!isDialogueElement(el) || el.type !== "bubble") continue;
      if (!includeHidden && isEffectivelyHidden(el, groups)) continue;
      totalBubbleCount += 1;
      // isDialogueElement의 타입 가드가 핏 필드(fontSize 등)를 좁혀 버리므로,
      // 타이포그래피 필드는 가드 전 원본 타입(BubbleFitElementLike)으로 읽는다.
      const source: BubbleFitElementLike = el;

      const fontSize = resolveBubbleFontSize(source.fontSize);
      const boxWidth = finitePositive(el.width);
      const boxHeight = finitePositive(el.height);
      const base: Omit<BubbleFitWarning, "kind" | "severity" | "message"> = {
        id: `bubble-fit:${el.id}`,
        itemId: el.id,
        pageId: page.id,
        pageIndex,
        excerpt: dialogueExcerpt(el.text),
        fontSize,
        boxWidth,
        boxHeight,
      };

      if (boxWidth == null || boxHeight == null) {
        warnings.push({
          ...base,
          kind: "unmeasurable",
          severity: "info",
          message: "말풍선 크기가 없어 핏을 확인할 수 없어요.",
        });
        continue;
      }
      checkedCount += 1;

      const lineHeight = resolveBubbleLineHeight({
        lineHeight: source.lineHeight,
        vertical: source.vertical,
        theme: options.theme,
      });
      const fontFamily = resolveBubbleFontFamily(source.font);
      const fontStyle = resolveBubbleFontStyle(source.fontStyle);
      const letterSpacing = bubbleLetterSpacing(options.theme);
      const fitInput = {
        text: el.text,
        boxWidth,
        boxHeight,
        fontFamily,
        fontStyle,
        lineHeight,
        vertical: source.vertical,
        letterSpacing,
      };

      if (bubbleTextFitsInBox(fitInput, fontSize, measurer)) {
        okCount += 1;
        continue;
      }

      if (source.autoShrinkText) {
        // 크기 고정 모드 — 렌더가 실제로 할 폰트 축소를 미리 돌려 본다.
        const fit = fitBubbleFontSize(
          {
            ...fitInput,
            maxFontSize: fontSize,
            minFontSize: source.autoShrinkMinFontSize,
          },
          measurer
        );
        if (!fit.overflow) {
          warnings.push({
            ...base,
            kind: "shrink",
            severity: "info",
            fittedFontSize: fit.fontSize,
            message: `자동 축소로 글자가 ${fit.fontSize}px까지 줄어들 것으로 보여요. (지금 ${fontSize}px)`,
          });
          affectedPages.add(page.id);
          continue;
        }
        warnings.push({
          ...base,
          kind: "overflow",
          severity: "warning",
          fittedFontSize: fit.fontSize,
          message: `자동 축소 하한(${fit.fontSize}px)에서도 대사가 다 들어가지 않을 것으로 보여요.`,
        });
        affectedPages.add(page.id);
        continue;
      }

      // 기본 모드 — 커밋 때 늘어날 높이를 미리 계산해 부족분을 숫자로 준다.
      const requiredHeight = fitBubbleBoxHeightToText(
        {
          text: el.text,
          boxWidth,
          fontSize,
          fontFamily,
          fontStyle,
          lineHeight,
          letterSpacing,
          vertical: source.vertical,
          minHeight: boxHeight,
        },
        measurer
      );
      const overflowPx = Math.max(1, Math.ceil(requiredHeight - boxHeight));
      warnings.push({
        ...base,
        kind: "overflow",
        severity: "warning",
        requiredHeight,
        overflowPx,
        message: `지금 말풍선 높이로는 약 ${overflowPx}px 부족할 것으로 보여요. 식자 때 상자를 키우거나 대사를 줄여 주세요.`,
      });
      affectedPages.add(page.id);
    }
  });

  const overflowCount = warnings.filter((w) => w.kind === "overflow").length;
  const shrinkCount = warnings.filter((w) => w.kind === "shrink").length;
  const unmeasurableCount = warnings.filter((w) => w.kind === "unmeasurable").length;

  return {
    warnings,
    summary: {
      totalBubbleCount,
      checkedCount,
      okCount,
      overflowCount,
      shrinkCount,
      unmeasurableCount,
      warningCount: overflowCount + shrinkCount,
      affectedPageCount: affectedPages.size,
    },
  };
}

/** 경고를 페이지 순서대로 묶는다 — 패널 목록 표시용(입력 순서를 그대로 보존). */
export function groupBubbleFitWarnings(
  warnings: readonly BubbleFitWarning[]
): { pageId: string; pageIndex: number; warnings: BubbleFitWarning[] }[] {
  const groups: { pageId: string; pageIndex: number; warnings: BubbleFitWarning[] }[] = [];
  for (const warning of warnings) {
    const last = groups[groups.length - 1];
    if (last && last.pageId === warning.pageId) {
      last.warnings.push(warning);
    } else {
      groups.push({ pageId: warning.pageId, pageIndex: warning.pageIndex, warnings: [warning] });
    }
  }
  return groups;
}
