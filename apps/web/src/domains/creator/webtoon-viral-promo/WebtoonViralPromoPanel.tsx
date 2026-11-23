/**
 * 완성 웹툰 바이럴 홍보 스튜디오 패널 (로컬 HTML/SVG 생성기 · 팬덤 위젯 · 투명 IP 수익 시뮬레이터).
 * Calm Atelier 시맨틱 토큰 전용(원시 색상 미사용 · 명시적 transition 속성만 사용 · 외부 서버/가짜 통계 없음).
 */

import { Check, CheckSquare, Code2, Copy, Download, Globe2, Megaphone, Sparkles } from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  DEFAULT_FANDOM_WIDGET_INPUT, DEFAULT_GLOBAL_IP_REVENUE_PARAMS, buildFandomReactionWidgetSpec,
  buildLaunchPromotionChecklist, simulateGlobalIpRevenue, type FandomPollCategory, type GlobalIpRevenueParams,
} from "./fandom-widget-and-ip-revenue";
import {
  DEFAULT_WEBTOON_PROMO_INPUT, PROMO_MOOD_THEME_LIST, buildPromoFileSlug, buildSnsTeaserCardPack,
  buildStandalonePromoLandingHtml, type WebtoonPromoInput, type WebtoonPromoPlatformLinks,
} from "./viral-landing-builder";

export interface WebtoonViralPromoPanelProps {
  readonly initialTitle?: string;
  readonly initialAuthorName?: string;
  readonly initialGenre?: string;
}

type PromoStudioTab = "landing-sns" | "fandom-widget" | "ip-revenue";
type BasicTextKey = "title" | "authorName" | "genre" | "tagline";
type NumericRevenueKey = "monthlyFreeReaders" | "krPaidConversionRatePct" | "goodsKeyringMonthlyUnits" | "goodsBookSeasonUnits";

const BASIC_FIELDS: readonly { readonly key: BasicTextKey; readonly ko: string; readonly en: string }[] = [
  { key: "title", ko: "작품 제목", en: "Work Title" },
  { key: "authorName", ko: "작가명", en: "Author" },
  { key: "genre", ko: "장르", en: "Genre" },
  { key: "tagline", ko: "한 줄 태그라인", en: "Tagline" },
];

const PLATFORM_FIELDS: readonly { readonly key: keyof WebtoonPromoPlatformLinks; readonly ko: string; readonly en: string; readonly placeholder: string }[] = [
  { key: "naverWebtoon", ko: "네이버웹툰", en: "Naver Webtoon", placeholder: "https://comic.naver.com/..." },
  { key: "kakaoPage", ko: "카카오페이지", en: "KakaoPage", placeholder: "https://page.kakao.com/..." },
  { key: "x", ko: "X (트위터)", en: "X (Twitter)", placeholder: "https://x.com/..." },
  { key: "instagram", ko: "인스타그램", en: "Instagram", placeholder: "https://www.instagram.com/..." },
  { key: "youtube", ko: "유튜브", en: "YouTube", placeholder: "https://www.youtube.com/..." },
];

const SLIDER_SPECS: readonly { readonly key: NumericRevenueKey; readonly ko: string; readonly en: string; readonly min: number; readonly max: number; readonly step: number; readonly suffix?: string }[] = [
  { key: "monthlyFreeReaders", ko: "월 무료 유입 독자 수", en: "Monthly Free Readers", min: 1000, max: 300000, step: 1000 },
  { key: "krPaidConversionRatePct", ko: "한국 유료 미리보기 전환율", en: "KR Paid Conversion Rate", min: 0.5, max: 25, step: 0.5, suffix: "%" },
  { key: "goodsKeyringMonthlyUnits", ko: "아크릴 키링 월 예상 판매량", en: "Monthly Keyring Units", min: 0, max: 1500, step: 10 },
  { key: "goodsBookSeasonUnits", ko: "단행본 시즌(3개월) 예상 판매량", en: "Season Print Book Units", min: 0, max: 3000, step: 50 },
];

const FOCUS_RING = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const INPUT_CLS = `min-h-11 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-fg placeholder:text-fg-3 ${FOCUS_RING}`;
const BTN_SOLID = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 ${FOCUS_RING} break-keep`;
const BTN_OUTLINE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg transition-colors motion-reduce:transition-none hover:border-line-strong hover:bg-raised ${FOCUS_RING} break-keep`;

function triggerTextDownload(filename: string, content: string, mimeType: string): void {
  if (typeof document === "undefined" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return;
  const blob = new Blob([content], { type: mimeType });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

function formatKrw(value: number, isEn: boolean): string {
  const formatted = Math.round(value).toLocaleString(isEn ? "en-US" : "ko-KR");
  return isEn ? `KRW ${formatted}` : `${formatted}원`;
}

export function WebtoonViralPromoPanel({ initialTitle, initialAuthorName, initialGenre }: WebtoonViralPromoPanelProps = {}): ReactElement {
  const uid = useId();
  const lang = useI18n((state) => state.lang);
  const isEn = lang === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const [activeTab, setActiveTab] = useState<PromoStudioTab>("landing-sns");
  const [statusMessage, setStatusMessage] = useState("");
  const [showLandingCode, setShowLandingCode] = useState(false);
  const [widgetPreviewFormat, setWidgetPreviewFormat] = useState<"html" | "json">("html");
  const [promoInput, setPromoInput] = useState<WebtoonPromoInput>(() => ({
    ...DEFAULT_WEBTOON_PROMO_INPUT,
    title: initialTitle?.trim() || DEFAULT_WEBTOON_PROMO_INPUT.title,
    authorName: initialAuthorName?.trim() || DEFAULT_WEBTOON_PROMO_INPUT.authorName,
    genre: initialGenre?.trim() || DEFAULT_WEBTOON_PROMO_INPUT.genre,
  }));

  const [episodeLabel, setEpisodeLabel] = useState(DEFAULT_FANDOM_WIDGET_INPUT.episodeLabel);
  const [pollCategory, setPollCategory] = useState<FandomPollCategory>(DEFAULT_FANDOM_WIDGET_INPUT.pollCategory);
  const [pollQuestion, setPollQuestion] = useState(DEFAULT_FANDOM_WIDGET_INPUT.pollQuestion);
  const [pollOptionsText, setPollOptionsText] = useState(DEFAULT_FANDOM_WIDGET_INPUT.pollOptions.join("\n"));
  const [checkedChecklistIds, setCheckedChecklistIds] = useState<readonly string[]>(["d14-rights-bom"]);
  const [revenueParams, setRevenueParams] = useState<GlobalIpRevenueParams>(DEFAULT_GLOBAL_IP_REVENUE_PARAMS);

  const landingHtml = useMemo(() => buildStandalonePromoLandingHtml(promoInput), [promoInput]);
  const landingFilename = useMemo(() => `${buildPromoFileSlug(promoInput.title)}-promo-landing.html`, [promoInput.title]);
  const landingByteSize = useMemo(() => new TextEncoder().encode(landingHtml).length, [landingHtml]);
  const snsPack = useMemo(() => buildSnsTeaserCardPack(promoInput), [promoInput]);

  const widgetSpec = useMemo(() => {
    const options = pollOptionsText.split(/\r?\n/u).map((s) => s.trim()).filter(Boolean);
    return buildFandomReactionWidgetSpec({
      workTitle: promoInput.title,
      episodeLabel,
      authorName: promoInput.authorName,
      pollCategory,
      pollQuestion,
      pollOptions: options,
      moodTheme: promoInput.moodTheme,
    });
  }, [episodeLabel, pollCategory, pollOptionsText, pollQuestion, promoInput.authorName, promoInput.moodTheme, promoInput.title]);

  const checklist = useMemo(
    () =>
      buildLaunchPromotionChecklist({
        workTitle: promoInput.title,
        genre: promoInput.genre,
        platformLinks: promoInput.platformLinks,
        hasGlobalPlan: revenueParams.enableJapanLaunch || revenueParams.enableNorthAmericaLaunch,
        hasGoodsPlan: revenueParams.goodsKeyringMonthlyUnits > 0 || revenueParams.goodsBookSeasonUnits > 0,
      }),
    [promoInput.genre, promoInput.platformLinks, promoInput.title, revenueParams.enableJapanLaunch, revenueParams.enableNorthAmericaLaunch, revenueParams.goodsBookSeasonUnits, revenueParams.goodsKeyringMonthlyUnits],
  );

  const revenueResult = useMemo(() => simulateGlobalIpRevenue(revenueParams), [revenueParams]);

  const downloadFile = (filename: string, content: string, mimeType: string, koMsg: string, enMsg: string): void => {
    triggerTextDownload(filename, content, mimeType);
    setStatusMessage(pick(koMsg, enMsg));
  };

  const copyText = (text: string, doneLabel: string): void => {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text).then(() => setStatusMessage(doneLabel), () => setStatusMessage(doneLabel));
      return;
    }
    setStatusMessage(doneLabel);
  };

  const updateCutCaption = (index: 0 | 1 | 2, value: string): void => {
    setPromoInput((prev) => {
      const next = [...prev.highlightCutCaptions];
      while (next.length < 3) next.push("");
      next[index] = value;
      return { ...prev, highlightCutCaptions: next };
    });
  };

  const completedCount = checklist.items.filter((item) => checkedChecklistIds.includes(item.id)).length;
  const tabs: readonly { readonly id: PromoStudioTab; readonly label: string }[] = [
    { id: "landing-sns", label: pick("홍보 랜딩·SNS 카드 팩", "Landing & SNS Cards") },
    { id: "fandom-widget", label: pick("팬덤 리액션·투표 위젯", "Fandom Widget & Launch") },
    { id: "ip-revenue", label: pick("IP 수익 시뮬레이터", "IP Revenue Simulator") },
  ];

  return (
    <section
      className="flex flex-col gap-5 rounded-2xl border border-line bg-panel p-5 text-fg break-keep"
      aria-label={pick("완성 웹툰 바이럴 홍보 스튜디오", "Webtoon Viral Promo Studio")}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Megaphone className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 className="text-base font-bold text-fg">{pick("완성 웹툰 바이럴 홍보 스튜디오", "Webtoon Viral Promo Studio")}</h2>
          </div>
          <p className="text-xs text-fg-2">
            {pick("외부 개발자·디자이너 없이 정적 홍보 랜딩 HTML, 3종 SNS 티저 SVG, 팬덤 위젯, 투명 IP 수익 시나리오를 로컬에서 즉시 생성합니다.", "Generate zero-CDN static promo HTML, 3 SNS SVG teaser cards, fandom widgets, and transparent IP revenue scenarios locally.")}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-good-soft px-3 py-1 text-xs font-semibold text-good">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          {pick("100% 로컬 생성 · 외부 CDN 0건", "100% Local · 0 External CDNs")}
        </span>
      </header>

      <div role="tablist" aria-label={pick("홍보 스튜디오 기능 탭", "Promo studio tabs")} className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button key={tab.id} id={`${uid}-tab-${tab.id}`} type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={`${uid}-panel-${tab.id}`} onClick={() => setActiveTab(tab.id)} className={activeTab === tab.id ? BTN_SOLID : BTN_OUTLINE}>
            {tab.label}
          </button>
        ))}
      </div>

      {statusMessage ? (
        <div role="status" aria-live="polite" className="flex items-center gap-2 rounded-lg bg-accent-soft px-3 py-2 text-xs font-semibold text-accent">
          <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{statusMessage}</span>
        </div>
      ) : null}

      {activeTab === "landing-sns" ? (
        <div id={`${uid}-panel-landing-sns`} role="tabpanel" aria-labelledby={`${uid}-tab-landing-sns`} className="flex flex-col gap-5">
          <div className="grid gap-3 md:grid-cols-2">
            {BASIC_FIELDS.map((field) => (
              <div key={field.key}>
                <label htmlFor={`${uid}-${field.key}`} className="mb-1 block text-xs font-semibold text-fg-2">{pick(field.ko, field.en)}</label>
                <input id={`${uid}-${field.key}`} type="text" value={promoInput[field.key]} onChange={(e) => setPromoInput((p) => ({ ...p, [field.key]: e.target.value }))} className={INPUT_CLS} />
              </div>
            ))}
          </div>

          <div className="border-t border-line pt-4">
            <p className="mb-2 text-xs font-semibold text-fg-2">{pick("대표 무드 테마 4종", "4 Mood Themes")}</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {PROMO_MOOD_THEME_LIST.map((theme) => {
                const active = promoInput.moodTheme === theme.id;
                return (
                  <button key={theme.id} type="button" aria-pressed={active} onClick={() => setPromoInput((p) => ({ ...p, moodTheme: theme.id }))} className={`flex min-h-11 cursor-pointer flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left text-xs ${FOCUS_RING} ${active ? "border-accent bg-accent-soft text-fg" : "border-line bg-card text-fg-2 hover:bg-raised"}`}>
                    <span className="font-bold text-fg">{pick(theme.labelKo, theme.labelEn)}</span>
                    <span className="text-[11px] text-fg-3">{pick(theme.descriptionKo, theme.descriptionEn)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 border-t border-line pt-4 md:grid-cols-3">
            {([0, 1, 2] as const).map((idx) => (
              <div key={idx}>
                <label htmlFor={`${uid}-cut-${idx}`} className="mb-1 block text-xs font-semibold text-fg-2">{pick(`하이라이트 CUT 0${idx + 1} 훅 캡션`, `Highlight CUT 0${idx + 1} Caption`)}</label>
                <input id={`${uid}-cut-${idx}`} type="text" value={promoInput.highlightCutCaptions[idx] ?? ""} onChange={(e) => updateCutCaption(idx, e.target.value)} className={INPUT_CLS} />
              </div>
            ))}
          </div>

          <div className="grid gap-2.5 border-t border-line pt-4 sm:grid-cols-2 lg:grid-cols-5">
            {PLATFORM_FIELDS.map((field) => (
              <div key={field.key}>
                <label htmlFor={`${uid}-link-${field.key}`} className="mb-1 block text-xs font-semibold text-fg-2">{pick(field.ko, field.en)}</label>
                <input id={`${uid}-link-${field.key}`} type="url" value={promoInput.platformLinks[field.key] ?? ""} placeholder={field.placeholder} onChange={(e) => setPromoInput((p) => ({ ...p, platformLinks: { ...p.platformLinks, [field.key]: e.target.value } }))} className={INPUT_CLS} />
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3 border-t border-line pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-fg">{pick("단일 파일 정적 홍보 랜딩 HTML", "Standalone Static Promo HTML")}</h3>
                <p className="text-xs text-fg-2 tabular-nums">
                  {pick(`OpenGraph + Twitter Card + 3컷 세로 스트립 완비 · ${(landingByteSize / 1024).toFixed(1)} KB`, `OpenGraph + Twitter Card + 3-cut vertical strip · ${(landingByteSize / 1024).toFixed(1)} KB`)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={BTN_SOLID} onClick={() => downloadFile(landingFilename, landingHtml, "text/html;charset=utf-8", `${landingFilename} 다운로드를 시작했습니다.`, `Downloaded ${landingFilename}.`)}>
                  <Download className="h-3.5 w-3.5" aria-hidden="true" /> {pick("랜딩 HTML 다운로드", "Download HTML")}
                </button>
                <button type="button" className={BTN_OUTLINE} onClick={() => copyText(landingHtml, pick("정적 랜딩 HTML 코드를 복사했습니다.", "Copied landing HTML."))}>
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" /> {pick("HTML 코드 복사", "Copy HTML")}
                </button>
                <button type="button" className={BTN_OUTLINE} onClick={() => setShowLandingCode((v) => !v)}>
                  <Code2 className="h-3.5 w-3.5" aria-hidden="true" /> {showLandingCode ? pick("코드 접기", "Hide Code") : pick("HTML 미리보기 코드", "Inspect Code")}
                </button>
              </div>
            </div>
            {showLandingCode ? <pre className="max-h-56 overflow-auto rounded-lg bg-canvas p-3 text-[11px] leading-relaxed text-fg-2"><code>{landingHtml}</code></pre> : null}
          </div>

          <div className="flex flex-col gap-3 border-t border-line pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-fg">{pick("3종 SNS 티저 SVG 카드 팩", "3-Platform SNS SVG Teaser Pack")}</h3>
              <button type="button" className={BTN_OUTLINE} onClick={() => copyText(snsPack.combinedCopyText, pick("3개 플랫폼 전체 홍보 카피·해시태그를 복사했습니다.", "Copied all SNS copies."))}>
                <Copy className="h-3.5 w-3.5" aria-hidden="true" /> {pick("전체 SNS 카피 복사", "Copy All Copies")}
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {snsPack.cards.map((card) => (
                <article key={card.id} className="flex flex-col gap-2.5 rounded-xl bg-card p-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-fg">{pick(card.platformLabelKo, card.platformLabelEn)}</span>
                    <span className="rounded bg-raised px-2 py-0.5 text-[11px] font-semibold text-fg-2 tabular-nums">{card.aspectRatio} · {card.width}×{card.height}</span>
                  </div>
                  <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(card.svg)}`} alt={`${promoInput.title} ${pick(card.platformLabelKo, card.platformLabelEn)}`} className="max-h-56 w-full rounded-lg bg-canvas object-contain" />
                  <p className="line-clamp-3 whitespace-pre-line text-[11px] text-fg-2">{card.hookCopy}</p>
                  <div className="mt-auto flex flex-wrap gap-2 pt-1">
                    <button type="button" className={BTN_SOLID} onClick={() => downloadFile(card.filename, card.svg, "image/svg+xml;charset=utf-8", `${card.filename} SVG를 저장했습니다.`, `Saved ${card.filename}.`)}>
                      <Download className="h-3.5 w-3.5" aria-hidden="true" /> {pick("SVG 다운로드", "Download SVG")}
                    </button>
                    <button type="button" className={BTN_OUTLINE} onClick={() => copyText(card.hookCopy, pick(`${card.platformLabelKo} 카피를 복사했습니다.`, `Copied ${card.platformLabelEn} copy.`))}>
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" /> {pick("카피 복사", "Copy Copy")}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "fandom-widget" ? (
        <div id={`${uid}-panel-fandom-widget`} role="tabpanel" aria-labelledby={`${uid}-tab-fandom-widget`} className="flex flex-col gap-5">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label htmlFor={`${uid}-episode`} className="mb-1 block text-xs font-semibold text-fg-2">{pick("회차 라벨", "Episode Label")}</label>
              <input id={`${uid}-episode`} type="text" value={episodeLabel} onChange={(e) => setEpisodeLabel(e.target.value)} className={INPUT_CLS} />
            </div>
            <div>
              <span className="mb-1 block text-xs font-semibold text-fg-2">{pick("팬덤 투표 유형", "Fandom Poll Type")}</span>
              <div className="flex flex-wrap gap-2">
                <button type="button" aria-pressed={pollCategory === "branch-choice"} onClick={() => setPollCategory("branch-choice")} className={pollCategory === "branch-choice" ? BTN_SOLID : BTN_OUTLINE}>{pick("다음 화 분기 투표", "Next-Episode Branch")}</button>
                <button type="button" aria-pressed={pollCategory === "character-popularity"} onClick={() => setPollCategory("character-popularity")} className={pollCategory === "character-popularity" ? BTN_SOLID : BTN_OUTLINE}>{pick("인기 캐릭터 투표", "Character Popularity")}</button>
              </div>
            </div>
            <div className="md:col-span-2">
              <label htmlFor={`${uid}-poll-q`} className="mb-1 block text-xs font-semibold text-fg-2">{pick("투표 질문 문구", "Poll Question")}</label>
              <input id={`${uid}-poll-q`} type="text" value={pollQuestion} onChange={(e) => setPollQuestion(e.target.value)} className={INPUT_CLS} />
            </div>
            <div className="md:col-span-2">
              <label htmlFor={`${uid}-poll-opts`} className="mb-1 block text-xs font-semibold text-fg-2">{pick("투표 선택지 (줄바꿈으로 2~6개 입력)", "Poll Options (2-6 lines)")}</label>
              <textarea id={`${uid}-poll-opts`} rows={3} value={pollOptionsText} onChange={(e) => setPollOptionsText(e.target.value)} className={`w-full rounded-lg border border-line bg-canvas p-3 text-sm text-fg ${FOCUS_RING}`} />
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-line pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-fg">{pick("컷 리액션 4종 + 팬덤 투표 정적 임베드", "4 Cut Reactions + Poll Static Embed")}</h3>
                <p className="text-xs text-fg-2">{pick(widgetSpec.honestyNotice, widgetSpec.honestyNoticeEn)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={BTN_SOLID} onClick={() => downloadFile(widgetSpec.htmlFilename, widgetSpec.embedHtml, "text/html;charset=utf-8", `${widgetSpec.htmlFilename} 다운로드를 시작했습니다.`, `Downloaded ${widgetSpec.htmlFilename}.`)}>
                  <Download className="h-3.5 w-3.5" aria-hidden="true" /> {pick("위젯 HTML 내보내기", "Export Widget HTML")}
                </button>
                <button type="button" className={BTN_OUTLINE} onClick={() => downloadFile(widgetSpec.jsonFilename, widgetSpec.configJson, "application/json;charset=utf-8", `${widgetSpec.jsonFilename} 다운로드를 시작했습니다.`, `Downloaded ${widgetSpec.jsonFilename}.`)}>
                  <Download className="h-3.5 w-3.5" aria-hidden="true" /> {pick("설정 JSON 내보내기", "Export JSON")}
                </button>
                <button type="button" className={BTN_OUTLINE} onClick={() => copyText(widgetPreviewFormat === "html" ? widgetSpec.embedHtml : widgetSpec.configJson, pick("위젯 코드를 클립보드에 복사했습니다.", "Copied widget snippet."))}>
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" /> {pick("현재 코드 복사", "Copy Code")}
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {widgetSpec.config.reactions.map((reaction) => (
                <span key={reaction.id} className="rounded-lg bg-raised px-3 py-1.5 text-xs font-semibold text-fg">{pick(reaction.label, reaction.labelEn)}</span>
              ))}
              <button type="button" onClick={() => setWidgetPreviewFormat((f) => (f === "html" ? "json" : "html"))} className={`ml-auto ${BTN_OUTLINE}`}>
                {widgetPreviewFormat === "html" ? pick("JSON 보기 전환", "Switch to JSON") : pick("HTML 보기 전환", "Switch to HTML")}
              </button>
            </div>
            <pre className="max-h-48 overflow-auto rounded-lg bg-canvas p-3 text-[11px] leading-relaxed text-fg-2"><code>{widgetPreviewFormat === "html" ? widgetSpec.embedHtml : widgetSpec.configJson}</code></pre>
          </div>

          <div className="flex flex-col gap-3 border-t border-line pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CheckSquare className="h-4 w-4 text-accent" aria-hidden="true" />
                <h3 className="text-sm font-bold text-fg">{pick("D-14 ~ D+7 런칭 홍보 실행 체크리스트", "D-14 to D+7 Launch Promo Checklist")}</h3>
              </div>
              <span className="rounded-full bg-raised px-3 py-1 text-xs font-bold text-fg tabular-nums">{completedCount} / {checklist.items.length}</span>
            </div>
            <ul className="flex flex-col gap-2">
              {checklist.items.map((item) => {
                const checkboxId = `${uid}-chk-${item.id}`;
                return (
                  <li key={item.id} className="flex items-start gap-3 rounded-lg bg-card p-3">
                    <input id={checkboxId} type="checkbox" checked={checkedChecklistIds.includes(item.id)} onChange={() => setCheckedChecklistIds((prev) => (prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id]))} className="mt-1 h-4 w-4 shrink-0 accent-accent" />
                    <label htmlFor={checkboxId} className="flex flex-1 cursor-pointer flex-col gap-0.5 text-xs">
                      <span className="font-bold text-fg"><span className="mr-2 rounded bg-accent-soft px-1.5 py-0.5 font-mono text-[11px] text-accent">{item.dayOffset}</span>{pick(item.titleKo, item.titleEn)}</span>
                      <span className="text-fg-2">{pick(item.detailKo, item.detailEn)}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : null}

      {activeTab === "ip-revenue" ? (
        <div id={`${uid}-panel-ip-revenue`} role="tabpanel" aria-labelledby={`${uid}-tab-ip-revenue`} className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-warning-soft px-3.5 py-2.5 text-xs font-semibold text-warn">
            <span>{pick("가정 기반 로컬 수식 시뮬레이션 · 실제 플랫폼 정산액 및 흥행 보장 아님", "Assumption-based local formula simulation · Not guaranteed platform payouts")}</span>
            <span className="tabular-nums">{pick(`원천징수 ${revenueResult.sanitizedParams.withholdingTaxPct}% 반영`, `Withholding ${revenueResult.sanitizedParams.withholdingTaxPct}% applied`)}</span>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {SLIDER_SPECS.map((spec) => {
              const value = revenueParams[spec.key];
              const display = spec.suffix === "%" ? `${value.toFixed(1)}%` : value.toLocaleString(isEn ? "en-US" : "ko-KR");
              return (
                <div key={spec.key}>
                  <label htmlFor={`${uid}-${spec.key}`} className="flex justify-between text-xs font-semibold text-fg-2">
                    <span>{pick(spec.ko, spec.en)}</span>
                    <span className="font-bold text-fg tabular-nums">{display}</span>
                  </label>
                  <input id={`${uid}-${spec.key}`} type="range" min={spec.min} max={spec.max} step={spec.step} value={value} onChange={(e) => setRevenueParams((p) => ({ ...p, [spec.key]: Number(e.target.value) }))} className="mt-1.5 w-full accent-accent" />
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-4 border-t border-line pt-4 text-xs">
            <span className="inline-flex items-center gap-1.5 font-semibold text-fg-2">
              <Globe2 className="h-4 w-4 text-cool" aria-hidden="true" /> {pick("글로벌 번역 연재 진출 권역", "Global Translation Regions")}
            </span>
            <label htmlFor={`${uid}-jp`} className="inline-flex min-h-11 cursor-pointer items-center gap-2 font-semibold text-fg">
              <input id={`${uid}-jp`} type="checkbox" checked={revenueParams.enableJapanLaunch} onChange={(e) => setRevenueParams((p) => ({ ...p, enableJapanLaunch: e.target.checked }))} className="h-4 w-4 accent-accent" />
              {pick("일본 번역 연재 포함", "Include Japan")}
            </label>
            <label htmlFor={`${uid}-na`} className="inline-flex min-h-11 cursor-pointer items-center gap-2 font-semibold text-fg">
              <input id={`${uid}-na`} type="checkbox" checked={revenueParams.enableNorthAmericaLaunch} onChange={(e) => setRevenueParams((p) => ({ ...p, enableNorthAmericaLaunch: e.target.checked }))} className="h-4 w-4 accent-accent" />
              {pick("북미·영어권 번역 연재 포함", "Include North America")}
            </label>
          </div>

          <div className="grid gap-3 border-t border-line pt-4 md:grid-cols-3">
            {[revenueResult.scenarios.conservative, revenueResult.scenarios.base, revenueResult.scenarios.optimistic].map((scenario) => (
              <article key={scenario.id} className={`flex flex-col gap-2 rounded-xl p-4 ${scenario.id === "base" ? "bg-accent-soft" : "bg-card"}`}>
                <span className="text-xs font-bold text-fg-2">{pick(scenario.labelKo, scenario.labelEn)}</span>
                <p className="text-xl font-extrabold text-fg tabular-nums">
                  {formatKrw(scenario.monthlyNetPayoutKrw, isEn)}
                  <span className="ml-1 text-xs font-medium text-fg-3">{pick("/월", "/mo")}</span>
                </p>
                <dl className="grid grid-cols-2 gap-1.5 text-[11px] tabular-nums">
                  <dt className="text-fg-3">{pick("시즌(3개월) 실수령", "Season (3m) Net")}</dt>
                  <dd className="text-right font-semibold text-fg">{formatKrw(scenario.seasonNetPayoutKrw, isEn)}</dd>
                  <dt className="text-fg-3">{pick("플랫폼·에이전시 수수료", "Platform Fees")}</dt>
                  <dd className="text-right font-semibold text-fg-2">{formatKrw(scenario.monthlyPlatformFeesKrw, isEn)}</dd>
                  <dt className="text-fg-3">{pick("원천징수(3.3%)", "Withholding 3.3%")}</dt>
                  <dd className="text-right font-semibold text-fg-2">{formatKrw(scenario.monthlyWithholdingTaxKrw, isEn)}</dd>
                  <dt className="text-fg-3">{pick("손익분기 회차", "Break-even Ep.")}</dt>
                  <dd className="text-right font-bold text-accent">
                    {scenario.breakEvenEpisodeCount === null ? pick("미도달", "Unreached") : pick(`${scenario.breakEvenEpisodeCount}화`, `Ep. ${scenario.breakEvenEpisodeCount}`)}
                  </dd>
                </dl>
              </article>
            ))}
          </div>

          <p className="border-t border-line pt-3 text-[11px] leading-relaxed text-fg-3">{pick(revenueResult.disclaimer, revenueResult.disclaimerEn)}</p>
        </div>
      ) : null}
    </section>
  );
}
