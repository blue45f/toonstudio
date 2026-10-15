import { fitBubbleBoxHeightToText, bubbleHorizontalPadding, type BubbleTextMeasurer } from "../lettering/studio-bubble-text-fit";
import { evaluateLocalizationOverflow } from "../lettering/studio-localization-overflow-gate";
import { clampPromoCaption, normalizePromoCaption, PROMO_CAPTION_JOINER, PROMO_CAPTION_LIMIT } from "./promo-document-cuts";
import { PROMO_DEFAULT_PRESENTATION, parsePromoProject, promoSize, promoSrt, promoVtt } from "./promo-model";
import { isPromoLocaleCode, promoTranslationRowKey, promoTranslationState, type PromoTranslationBundle, type PromoTranslationDraft, type PromoTranslationRow, type PromoTranslationState } from "./promo-translation-drafts";

import type { PromoProject } from "./promo-model";

/**
 * 로케일별 자막 일괄 출력의 순수 규칙.
 *
 * 번역 초안(승인·오래됨 판정 포함)에서 컷 자막을 로케일 문구로 치환해 로케일별 SRT·WebVTT·프로젝트 JSON을 만든다.
 * 음성은 만들지 않는다 — 한국어 내레이션 음원과 음성 스튜디오 대사는 로케일 프로젝트에서 빼고, 외부 TTS를 호출하지 않는다.
 */
export const PROMO_LOCALE_BATCH_FORMAT = "toonstudio-promo-locales";
export const PROMO_LOCALE_BATCH_VERSION = 1;
/** 한 자막이 이어 붙일 수 있는 연속 대사 수 상한. */
const MAX_JOINED_ROWS = 8;

export type PromoLocaleCaptionState = PromoTranslationState | "unlinked" | "empty";

export interface PromoLocaleResolution {
  readonly panelId: string;
  /** 0부터 센 컷 순번. */
  readonly index: number;
  /** 공백을 정리한 현재 자막(원문). */
  readonly source: string;
  readonly state: PromoLocaleCaptionState;
  /** 번역문. 연결된 모든 대사에 번역이 있을 때만 채운다(승인 여부와 무관). */
  readonly translated: string | null;
}

export interface PromoLocalePolicy {
  /** 승인되지 않은 초안도 자막으로 쓴다. 기본은 승인본만 쓴다. */
  readonly includeDrafts: boolean;
  /** 원문이 바뀐 뒤의 오래된 번역도 자막으로 쓴다. 쓰더라도 경고는 남는다. */
  readonly includeStale: boolean;
}
export const PROMO_LOCALE_DEFAULT_POLICY: PromoLocalePolicy = Object.freeze({ includeDrafts: false, includeStale: false });

export type PromoLocaleCounts = Readonly<Record<Exclude<PromoLocaleCaptionState, "empty">, number>>;
export interface PromoLocaleSummary {
  readonly locale: string;
  /** 자막이 있는 컷 수. */
  readonly captioned: number;
  readonly empty: number;
  readonly counts: PromoLocaleCounts;
  /** 자막 있는 컷이 모두 승인된 번역이다 — 일괄 출력에서 기본으로 고르는 로케일. */
  readonly ready: boolean;
}

export interface PromoLocaleRequest {
  readonly locale: string;
  /** 비우면 원문 제목을 그대로 쓴다. */
  readonly title: string;
  /** 마지막 2초 안내 문구. 비우면 원문을 그대로 쓴다. */
  readonly cta: string;
  readonly policy: PromoLocalePolicy;
}

export interface PromoLocaleWarning {
  readonly code: "stale" | "draft" | "missing" | "unlinked" | "overflow" | "json-truncated" | "title-source" | "cta-source" | "caption-mode";
  readonly severity: "warning" | "info";
  /** 0부터 센 컷 순번. 컷에 속하지 않으면 없다. */
  readonly index?: number;
  readonly message: string;
}

const ZERO_COUNTS: PromoLocaleCounts = Object.freeze({ approved: 0, draft: 0, stale: 0, missing: 0, unlinked: 0 });

/** 로케일 표시 이름(한국어). 브라우저가 모르는 코드는 코드를 그대로 보여 준다. */
export function promoLocaleLabel(locale: string): string {
  try {
    return new Intl.DisplayNames(["ko"], { type: "language" }).of(locale) ?? locale;
  } catch {
    return locale;
  }
}

// ── 컷 ↔ 원문 대사 ↔ 번역 초안 ─────────────────────────────────────────────

function effectiveRows(bundle: PromoTranslationBundle, locale: string): PromoTranslationRow[] {
  if (bundle.rows.length) return [...bundle.rows];
  // 현재 원문(rows)이 없는 파일은 초안이 번역한 원문 그대로를 "현재 원문"으로 본다 — 오래됨은 판정할 수 없다.
  const rows = new Map<string, PromoTranslationRow>();
  for (const draft of bundle.drafts) {
    if (draft.locale !== locale) continue;
    const key = promoTranslationRowKey(draft.pageId, draft.elementId);
    if (!rows.has(key)) rows.set(key, { pageId: draft.pageId, elementId: draft.elementId, source: draft.source });
  }
  return [...rows.values()];
}

/**
 * 자막과 글자 그대로 같은 연속 대사 구간을 찾는다. 앞선 컷이 차지한 다음 자리부터 먼저 찾아,
 * 같은 문구가 문서에 여러 번 나와도 읽기 순서대로 짝을 맞춘다. 말풍선을 이은 자막은 연속 구간으로 풀어 낸다.
 */
function findRowRun(caption: string, sources: readonly string[], cursor: number): { start: number; length: number } | null {
  const scan = (from: number, to: number): { start: number; length: number } | null => {
    for (let start = from; start < to; start += 1) {
      let joined = "";
      for (let end = start; end < Math.min(sources.length, start + MAX_JOINED_ROWS); end += 1) {
        const piece = sources[end] ?? "";
        if (!piece) break;
        joined = end === start ? piece : `${joined}${PROMO_CAPTION_JOINER}${piece}`;
        if (joined === caption) return { start, length: end - start + 1 };
        if (joined.length > caption.length) break;
      }
    }
    return null;
  };
  return scan(cursor, sources.length) ?? scan(0, cursor);
}

/** 컷마다 자막이 어느 원문 대사(문서 말풍선·창작 생태계 대사)의 어떤 번역 초안인지 짝지어 상태를 판정한다. */
export function resolvePromoLocale(project: Pick<PromoProject, "panels">, bundle: PromoTranslationBundle, locale: string): PromoLocaleResolution[] {
  const rows = effectiveRows(bundle, locale);
  const sources = rows.map((row) => normalizePromoCaption(row.source));
  const drafts = new Map<string, PromoTranslationDraft>();
  for (const draft of bundle.drafts) if (draft.locale === locale) drafts.set(promoTranslationRowKey(draft.pageId, draft.elementId), draft);
  let cursor = 0;
  return project.panels.map((panel, index): PromoLocaleResolution => {
    const source = normalizePromoCaption(panel.caption);
    if (!source) return { panelId: panel.id, index, source, state: "empty", translated: null };
    const run = findRowRun(source, sources, cursor);
    if (!run) return { panelId: panel.id, index, source, state: "unlinked", translated: null };
    cursor = run.start + run.length;
    const parts = rows.slice(run.start, run.start + run.length).map((row) => {
      const draft = drafts.get(promoTranslationRowKey(row.pageId, row.elementId));
      const usable = draft && normalizePromoCaption(draft.text) ? draft : undefined;
      return { state: promoTranslationState(row, usable), text: usable ? normalizePromoCaption(usable.text) : "" };
    });
    const states = parts.map((part) => part.state);
    const state: PromoTranslationState = states.includes("missing") ? "missing"
      : states.includes("stale") ? "stale"
        : states.includes("draft") ? "draft" : "approved";
    return { panelId: panel.id, index, source, state, translated: state === "missing" ? null : parts.map((part) => part.text).join(PROMO_CAPTION_JOINER) };
  });
}

export function summarizePromoLocale(resolutions: readonly PromoLocaleResolution[], locale: string): PromoLocaleSummary {
  const counts: Record<keyof PromoLocaleCounts, number> = { ...ZERO_COUNTS };
  let empty = 0;
  for (const resolution of resolutions) {
    if (resolution.state === "empty") empty += 1;
    else counts[resolution.state] += 1;
  }
  const captioned = resolutions.length - empty;
  return { locale, captioned, empty, counts, ready: captioned > 0 && counts.approved === captioned };
}

/** 정책에 따라 컷마다 실제로 쓸 자막. 쓰지 않는 번역은 원문으로 되돌린다(자막을 비우지 않는다). */
export function promoLocaleCaptionText(resolution: PromoLocaleResolution, policy: PromoLocalePolicy): { readonly text: string; readonly translated: boolean } {
  if (resolution.state === "empty") return { text: "", translated: false };
  const translation = resolution.translated;
  const usable = translation !== null && (resolution.state === "approved"
    || (resolution.state === "draft" && policy.includeDrafts)
    || (resolution.state === "stale" && policy.includeStale));
  return usable ? { text: translation, translated: true } : { text: resolution.source, translated: false };
}

// ── 넘침 게이트 ────────────────────────────────────────────────────────────

/** 자막 영역은 promo-canvas.ts의 drawPromoFrame과 같은 값이다(글자 = 짧은 변의 5.1%, 최대 3줄, 줄 간격 1.4). */
export const PROMO_CAPTION_MAX_LINES = 3;
const CAPTION_FONT_RATIO = 0.051;
const CAPTION_LINE_HEIGHT = 1.4;
const CAPTION_FONT_FAMILY = "sans-serif";
const CAPTION_FONT_STYLE = "bold";

export interface PromoCaptionBox {
  readonly boxWidth: number;
  readonly boxHeight: number;
  readonly fontSize: number;
  readonly lineHeight: number;
}
/** 1080 기준 자막 영역을 말풍선 넘침 게이트가 쓰는 상자 치수로 옮긴다(비율은 해상도와 무관하다). */
export function promoCaptionBox(project: Pick<PromoProject, "ratio" | "presentation">, measurer: BubbleTextMeasurer): PromoCaptionBox {
  const { width, height } = promoSize(project.ratio, 1080);
  const unit = Math.min(width, height);
  const presentation = { ...PROMO_DEFAULT_PRESENTATION, ...project.presentation };
  const safe = presentation.safeArea && project.ratio === "9:16";
  const fontSize = unit * CAPTION_FONT_RATIO;
  const boxWidth = width * (safe ? 0.7 : 0.8) + bubbleHorizontalPadding(fontSize) * 2;
  // 3줄이 정확히 들어가는 높이 — 게이트가 쓰는 안전 여유까지 같은 함수로 맞춘다.
  const boxHeight = fitBubbleBoxHeightToText({
    text: Array.from({ length: PROMO_CAPTION_MAX_LINES }, () => "가").join("\n"),
    boxWidth, fontSize, fontFamily: CAPTION_FONT_FAMILY, fontStyle: CAPTION_FONT_STYLE, lineHeight: CAPTION_LINE_HEIGHT,
  }, measurer);
  return { boxWidth, boxHeight, fontSize, lineHeight: CAPTION_LINE_HEIGHT };
}

// ── 계획 ───────────────────────────────────────────────────────────────────

export interface PromoLocalePlan {
  readonly request: PromoLocaleRequest;
  readonly summary: PromoLocaleSummary;
  readonly resolutions: readonly PromoLocaleResolution[];
  /** 컷 순서대로 실제로 쓸 자막. */
  readonly captions: readonly { readonly text: string; readonly translated: boolean }[];
  readonly warnings: readonly PromoLocaleWarning[];
}

function cutLabel(index: number): string {
  return `컷 ${index + 1}`;
}

export function planPromoLocale(
  project: PromoProject,
  bundle: PromoTranslationBundle,
  request: PromoLocaleRequest,
  measurer: BubbleTextMeasurer,
): PromoLocalePlan {
  const resolutions = resolvePromoLocale(project, bundle, request.locale);
  const summary = summarizePromoLocale(resolutions, request.locale);
  const captions = resolutions.map((resolution) => promoLocaleCaptionText(resolution, request.policy));
  const warnings: PromoLocaleWarning[] = [];
  const box = promoCaptionBox(project, measurer);
  for (const resolution of resolutions) {
    const label = cutLabel(resolution.index);
    const used = captions[resolution.index];
    if (resolution.state === "stale") {
      warnings.push({
        code: "stale", severity: "warning", index: resolution.index,
        message: used?.translated
          ? `${label}: 번역 초안이 이전 원문 기준이라 오래되었어요. 그대로 썼으니 의미가 맞는지 확인하세요.`
          : `${label}: 번역 초안이 이전 원문 기준이라 오래되었어요. 한국어 원문 자막을 썼어요. 다시 번역·승인한 뒤 내보내거나 '오래된 번역도 사용'을 켜세요.`,
      });
    } else if (resolution.state === "draft") {
      warnings.push({
        code: "draft", severity: used?.translated ? "warning" : "info", index: resolution.index,
        message: used?.translated
          ? `${label}: 승인되지 않은 초안을 썼어요. 공개 전에 검토·승인하세요.`
          : `${label}: 승인되지 않은 초안이라 한국어 원문 자막을 썼어요. '승인 전 초안도 사용'을 켜면 초안을 써요.`,
      });
    } else if (resolution.state === "missing") {
      warnings.push({ code: "missing", severity: "warning", index: resolution.index, message: `${label}: 이 로케일 번역이 없어 한국어 원문 자막을 썼어요.` });
    } else if (resolution.state === "unlinked") {
      warnings.push({ code: "unlinked", severity: "warning", index: resolution.index, message: `${label}: 이 자막과 글자까지 같은 원문 대사(번역 초안의 원문)를 찾지 못했어요. 자막을 고쳤거나 다른 작품의 초안일 수 있어요. 한국어 원문 자막을 썼어요.` });
    }
    if (used?.translated) {
      const text = used.text;
      const verdict = evaluateLocalizationOverflow({
        text, sourceText: resolution.source, sourceLocale: "ko", targetLocale: request.locale,
        boxWidth: box.boxWidth, boxHeight: box.boxHeight, fontSize: box.fontSize, fontFamily: CAPTION_FONT_FAMILY, fontStyle: CAPTION_FONT_STYLE, lineHeight: box.lineHeight,
      }, measurer, { minFontScale: 1 });
      if (!verdict.fits) {
        warnings.push({
          code: "overflow", severity: "warning", index: resolution.index,
          message: `${label}: 번역 자막이 자막 영역(${PROMO_CAPTION_MAX_LINES}줄)에 다 들어가지 않아요(약 ${verdict.lines.length}줄 필요). 영상에서는 말줄임표로 잘리니 문장을 줄여 주세요. SRT·VTT에는 전체가 들어가요.`,
        });
      }
      if (text.length > PROMO_CAPTION_LIMIT) {
        warnings.push({ code: "json-truncated", severity: "warning", index: resolution.index, message: `${label}: 자막이 ${PROMO_CAPTION_LIMIT}자를 넘어 프로젝트 JSON에는 ${PROMO_CAPTION_LIMIT}자까지만 담았어요. SRT·VTT에는 전체가 들어가요.` });
      }
    }
  }
  const captionMode = project.voiceStudio?.captionMode;
  if (captionMode && captionMode !== "scene") {
    warnings.push({ code: "caption-mode", severity: "info", message: "자막 모드가 '대사 클립·단어별·자막 없음'이어도 로케일 자막은 컷 자막(장면 자막) 기준으로 만들었어요." });
  }
  if (!request.title.trim() && project.title.trim()) warnings.push({ code: "title-source", severity: "info", message: "제목을 입력하지 않아 한국어 원문 제목을 썼어요." });
  if (!request.cta.trim() && project.cta.trim()) warnings.push({ code: "cta-source", severity: "info", message: "마지막 2초 안내 문구를 입력하지 않아 한국어 원문을 썼어요." });
  return { request, summary, resolutions, captions, warnings };
}

// ── 로케일 프로젝트와 파일 ──────────────────────────────────────────────────

/**
 * 로케일 프로젝트 — 자막·제목·안내 문구만 바꾼다. 한국어 내레이션 음원과 음성 스튜디오 대사는 이 로케일의
 * 소리가 아니므로 뺀다(그대로 두면 대사 자막 모드에서 한국어 자막이 SRT에 섞여 나온다).
 */
export function localizePromoProject(project: PromoProject, plan: PromoLocalePlan): { readonly full: PromoProject; readonly forJson: PromoProject } {
  const title = plan.request.title.trim() || project.title;
  const cta = plan.request.cta.trim() || project.cta;
  const build = (clamp: boolean): PromoProject => ({
    ...project,
    title,
    cta,
    voiceover: null,
    voiceStudio: undefined,
    panels: project.panels.map((panel, index) => {
      const text = plan.captions[index]?.text ?? panel.caption;
      return { ...panel, caption: clamp ? clampPromoCaption(text).text : text };
    }),
  });
  return { full: build(false), forJson: build(true) };
}

export function promoLocaleFilePaths(locale: string): { readonly srt: string; readonly vtt: string; readonly json: string } {
  return { srt: `${locale}/captions.srt`, vtt: `${locale}/captions.vtt`, json: `${locale}/project.json` };
}

/** 로케일 하나의 파일. 프로젝트 JSON은 다시 읽히는지 검증하고, 읽히지 않으면 아무것도 만들지 않는다. */
export function buildPromoLocaleFiles(project: PromoProject, plan: PromoLocalePlan): Record<string, string> {
  const { full, forJson } = localizePromoProject(project, plan);
  const paths = promoLocaleFilePaths(plan.request.locale);
  let json: string;
  try {
    json = JSON.stringify(parsePromoProject(forJson));
  } catch (error) {
    throw new Error(`${plan.request.locale} 프로젝트 JSON을 만들 수 없어요: ${error instanceof Error ? error.message : "알 수 없는 오류"}`, { cause: error });
  }
  return { [paths.srt]: promoSrt(full), [paths.vtt]: promoVtt(full), [paths.json]: json };
}

export interface PromoLocaleBatchResult {
  /** ZIP에 넣을 파일(경로 → 내용). */
  readonly files: Record<string, string>;
  readonly plans: readonly PromoLocalePlan[];
  readonly warningCount: number;
}

function readme(plans: readonly PromoLocalePlan[]): string {
  return [
    "ToonStudio 로케일별 홍보 자막 묶음",
    "",
    "로케일마다 폴더가 하나씩 있어요.",
    "- captions.srt / captions.vtt : 컷 자막과 마지막 안내 문구의 자막 파일",
    "- project.json : 자막·제목·안내 문구만 바꾼 홍보 프로젝트. 홍보영상 편집기의 「프로젝트 JSON 불러오기」로 열 수 있어요.",
    "",
    "주의",
    "- 번역은 불러온 번역 초안을 그대로 옮긴 거예요. 이 도구는 번역하거나 고쳐 쓰지 않아요.",
    "- 한국어 내레이션 음원과 음성 스튜디오 대사는 로케일 프로젝트에서 뺐어요. 오디오는 만들지 않았고 외부 음성 합성도 쓰지 않았어요.",
    "- 승인되지 않은 초안·오래된 번역·번역이 없는 컷은 manifest.json 의 warnings 에 컷 번호와 함께 적어 두었어요.",
    "- 프로젝트 JSON 에는 컷 이미지·BGM 이 들어 있으니 공유 대상을 확인하세요.",
    "",
    `포함된 로케일: ${plans.map((plan) => plan.request.locale).join(", ")}`,
    "",
  ].join("\n");
}

/** 로케일 묶음 전체 — manifest.json·README.txt·로케일별 파일. 같은 입력이면 같은 내용이다(시각을 넣지 않는다). */
export function buildPromoLocaleBatch(input: {
  readonly project: PromoProject;
  readonly bundle: PromoTranslationBundle;
  readonly requests: readonly PromoLocaleRequest[];
  readonly measurer: BubbleTextMeasurer;
}): PromoLocaleBatchResult {
  const { project, bundle, requests, measurer } = input;
  if (!project.panels.length) throw new Error("컷이 없어 내보낼 수 없어요. 컷을 먼저 추가해 주세요.");
  if (!requests.length) throw new Error("내보낼 로케일을 하나 이상 골라 주세요.");
  const seen = new Set<string>();
  for (const request of requests) {
    if (!isPromoLocaleCode(request.locale) || seen.has(request.locale)) throw new Error(`로케일 코드가 올바르지 않거나 중복되었어요: ${request.locale}`);
    seen.add(request.locale);
    if (request.title.length > 80 || request.cta.length > 80) throw new Error(`${request.locale}: 제목과 안내 문구는 80자까지 쓸 수 있어요.`);
  }
  const plans = requests.map((request) => planPromoLocale(project, bundle, request, measurer));
  const files: Record<string, string> = {};
  for (const plan of plans) Object.assign(files, buildPromoLocaleFiles(project, plan));
  const manifest = {
    format: PROMO_LOCALE_BATCH_FORMAT,
    version: PROMO_LOCALE_BATCH_VERSION,
    project: { title: project.title, seconds: project.seconds, ratio: project.ratio, panelCount: project.panels.length },
    source: { documentId: bundle.documentId, revision: bundle.revision, draftCount: bundle.drafts.length, documentRows: bundle.rows.length },
    locales: plans.map((plan) => ({
      locale: plan.request.locale,
      files: Object.values(promoLocaleFilePaths(plan.request.locale)),
      policy: plan.request.policy,
      captions: { captioned: plan.summary.captioned, empty: plan.summary.empty, ...plan.summary.counts, translatedUsed: plan.captions.filter((caption) => caption.translated).length },
      warnings: plan.warnings.map((warning) => ({ code: warning.code, severity: warning.severity, cut: warning.index === undefined ? null : warning.index + 1, message: warning.message })),
    })),
  };
  files["manifest.json"] = JSON.stringify(manifest, null, 2);
  files["README.txt"] = readme(plans);
  return { files, plans, warningCount: plans.reduce((sum, plan) => sum + plan.warnings.filter((warning) => warning.severity === "warning").length, 0) };
}
