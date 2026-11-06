/**
 * 접근성 있는 웹툰 만들기 (`/learn/accessibility`) — 키보드 작업, 말로 대사 입력, 보기 편한 화면,
 * 독자를 위한 대체 텍스트·읽기 순서, 캐릭터 토크 낭독을 한 쪽에 모은 학습 안내.
 *
 * 내용은 `accessible-webtoon-guide.ts`의 정적 데이터이고, 이 컴포넌트는 활성 로케일로 문구를 고르기만
 * 한다. 모든 기능에는 상태(지금 쓸 수 있어요 / 일부만 / 준비 중)를 아이콘과 글자로 함께 표시해,
 * 아직 화면에 연결되지 않은 기능을 현재 기능처럼 읽히지 않게 한다.
 *
 * 접근성: 제목 계층(h1→h2→h3), 목차 nav, 표 캡션·행 머리글, 키 조합은 `<kbd>`, 점검표 진행은
 * aria-live 상태, 새 창으로 열리는 외부 링크는 접근 가능한 이름에 "새 창"을 포함한다.
 */

import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Info,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import { Fragment, useId, useState } from "react";
import { Link } from "react-router-dom";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useI18n } from "@/shared/lib/i18n";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import { useDocumentTitle } from "@/shared/seo/use-document-title";

import {
  ACCESSIBLE_WEBTOON_GUIDE_VERIFIED_AT,
  GUIDE_CHECKLIST,
  GUIDE_DICTATION_MESSAGES,
  GUIDE_LIMITS,
  GUIDE_REFERENCES,
  GUIDE_SECTIONS,
  GUIDE_SHORTCUTS,
  GUIDE_STATUS_LABELS,
  type GuideSection,
  type GuideStatus,
} from "./accessible-webtoon-guide";

const SCOPE = "learnAccessibilityGuide";

const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const CARD = "rounded-2xl border border-line bg-canvas p-5";
const SECTION = "scroll-mt-24 rounded-3xl border border-line bg-panel p-6 sm:p-8";
const TEXT_LINK = cn(
  "inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-bold text-fg-2",
  "hover:border-accent/60 hover:text-accent",
  FOCUS_RING,
);
const TABLE_HEAD = "border-b border-line px-3 py-2 text-left text-xs font-bold text-fg-2";
const TABLE_CELL = "border-b border-line px-3 py-3 align-top";

const STATUS_TONE: Readonly<Record<GuideStatus, string>> = {
  available: "border-good/40 bg-good/10 text-fg",
  partial: "border-warn/40 bg-warn/10 text-fg",
  planned: "border-line bg-raised text-fg-2",
};

const STATUS_ICON = {
  available: CheckCircle2,
  partial: TriangleAlert,
  planned: Clock3,
} as const;

function StatusChip({ status }: { readonly status: GuideStatus }) {
  const t = useBilingual(SCOPE);
  const label = GUIDE_STATUS_LABELS[status];
  const Icon = STATUS_ICON[status];
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold", STATUS_TONE[status])}
    >
      <Icon size={14} aria-hidden />
      {t(label.ko, label.en)}
    </span>
  );
}

function Kbd({ children }: { readonly children: string }) {
  return (
    <kbd className="rounded-md border border-line bg-raised px-1.5 py-0.5 font-mono text-[0.85em] text-fg">
      {children}
    </kbd>
  );
}

function ShortcutTable() {
  const t = useBilingual(SCOPE);
  return (
    <div className="mt-6">
      <h3 className="text-lg font-bold">{t("자주 쓰는 단축키", "Common shortcuts")}</h3>
      <p className="mt-1 text-sm leading-6 text-fg-3">
        {t(
          "기본 설정 기준이에요. Ctrl/⌘는 윈도우·리눅스에서는 Ctrl, 맥에서는 Command 키예요. 단축키를 바꿨거나 글자를 입력하는 중이면 다르게 동작할 수 있어요.",
          "These are the defaults. Ctrl/⌘ means Ctrl on Windows and Linux and Command on Mac. If you changed shortcuts or are typing, they may behave differently.",
        )}
      </p>
      <div
        role="region"
        aria-label={t("단축키 표", "Shortcut table")}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- 가로로 넘칠 수 있는 표를 키보드만으로 스크롤하려면 영역에 포커스가 필요하다(WCAG 2.1.1).
        tabIndex={0}
        className={cn("mt-3 overflow-x-auto rounded-2xl border border-line", FOCUS_RING)}
      >
        <table className="w-full min-w-[26rem] border-collapse text-sm">
          <caption className="sr-only">{t("Studio 기본 단축키", "Studio default shortcuts")}</caption>
          <thead>
            <tr>
              <th scope="col" className={TABLE_HEAD}>{t("동작", "Action")}</th>
              <th scope="col" className={TABLE_HEAD}>{t("키", "Keys")}</th>
            </tr>
          </thead>
          <tbody>
            {GUIDE_SHORTCUTS.map((row) => (
              <tr key={row.id}>
                <th scope="row" className={cn(TABLE_CELL, "text-left font-medium text-fg")}>
                  {t(row.action.ko, row.action.en)}
                </th>
                <td className={cn(TABLE_CELL, "text-fg-2")}>
                  {row.combos.map((combo, index) => (
                    <Fragment key={combo.ko}>
                      {index > 0 ? <span className="mx-1.5 text-fg-3">{t("또는", "or")}</span> : null}
                      <Kbd>{combo.ko === combo.en ? combo.ko : t(combo.ko, combo.en)}</Kbd>
                    </Fragment>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DictationMessageTable() {
  const t = useBilingual(SCOPE);
  return (
    <div className="mt-6">
      <h3 className="text-lg font-bold">{t("이런 안내가 나오면", "If you see one of these messages")}</h3>
      <p className="mt-1 text-sm leading-6 text-fg-3">
        {t(
          "받아쓰기 부품이 보여 주는 안내와 해결 방법이에요. 안내 문구는 화면에 나오는 한국어 그대로 적었어요.",
          "These are the messages the dictation part shows and how to resolve them. The message column quotes the Korean text exactly as it appears on screen.",
        )}
      </p>
      <div
        role="region"
        aria-label={t("받아쓰기 안내 표", "Dictation messages table")}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- 가로로 넘칠 수 있는 표를 키보드만으로 스크롤하려면 영역에 포커스가 필요하다(WCAG 2.1.1).
        tabIndex={0}
        className={cn("mt-3 overflow-x-auto rounded-2xl border border-line", FOCUS_RING)}
      >
        <table className="w-full min-w-[36rem] border-collapse text-sm">
          <caption className="sr-only">{t("받아쓰기 안내와 해결 방법", "Dictation messages and fixes")}</caption>
          <thead>
            <tr>
              <th scope="col" className={TABLE_HEAD}>{t("화면에 나오는 안내", "Message on screen")}</th>
              <th scope="col" className={TABLE_HEAD}>{t("뜻", "Meaning")}</th>
              <th scope="col" className={TABLE_HEAD}>{t("할 일", "What to do")}</th>
            </tr>
          </thead>
          <tbody>
            {GUIDE_DICTATION_MESSAGES.map((row) => (
              <tr key={row.id}>
                <th scope="row" lang="ko" className={cn(TABLE_CELL, "text-left font-medium text-fg")}>
                  {row.message}
                </th>
                <td className={cn(TABLE_CELL, "text-fg-2")}>{t(row.meaning.ko, row.meaning.en)}</td>
                <td className={cn(TABLE_CELL, "text-fg-2")}>{t(row.action.ko, row.action.en)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GuideSectionBlock({ section }: { readonly section: GuideSection }) {
  const t = useBilingual(SCOPE);
  const headingId = `guide-${section.id}-title`;
  return (
    <section id={`guide-${section.id}`} aria-labelledby={headingId} className={SECTION}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={headingId} className="text-2xl font-bold">
          {t(section.title.ko, section.title.en)}
        </h2>
        <StatusChip status={section.status} />
      </div>
      <p className="mt-3 max-w-3xl leading-7 text-fg-2">{t(section.summary.ko, section.summary.en)}</p>

      <ul className="mt-6 grid gap-4 md:grid-cols-2">
        {section.points.map((point) => (
          <li key={point.id} className={CARD}>
            <h3 className="font-bold text-fg">{t(point.title.ko, point.title.en)}</h3>
            <p className="mt-2 text-sm leading-7 text-fg-2">{t(point.body.ko, point.body.en)}</p>
          </li>
        ))}
      </ul>

      {section.id === "keyboard" ? <ShortcutTable /> : null}
      {section.id === "dictation" ? <DictationMessageTable /> : null}

      <ul className="mt-6 flex flex-wrap gap-2" aria-label={t(`${section.title.ko} 관련 링크`, `Links for ${section.title.en}`)}>
        {section.links.map((link) => (
          <li key={link.href}>
            <Link to={link.href} className={TEXT_LINK}>
              {t(link.label.ko, link.label.en)}
              <ArrowRight size={14} aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function LimitsSection() {
  const t = useBilingual(SCOPE);
  return (
    <section id="guide-limits" aria-labelledby="guide-limits-title" className={cn(SECTION, "border-warn/40")}>
      <div className="flex items-start gap-3">
        <TriangleAlert size={22} className="mt-1 shrink-0 text-warn" aria-hidden />
        <div className="min-w-0">
          <h2 id="guide-limits-title" className="text-2xl font-bold">
            {t("알아 둘 한계", "Limits to know")}
          </h2>
          <p className="mt-2 max-w-3xl leading-7 text-fg-2">
            {t(
              "이 안내가 약속하지 않는 것들이에요. 접근성 문제가 작업을 막고 있다면 화면 이름, 사용 장치, 막힌 행동을 알려 주세요.",
              "Things this guide does not promise. If an accessibility problem blocks your work, tell us the screen, your device and the blocked action.",
            )}
          </p>
        </div>
      </div>
      <ul className="mt-6 grid gap-4 md:grid-cols-2">
        {GUIDE_LIMITS.map((limit) => (
          <li key={limit.id} className={CARD}>
            <h3 className="font-bold text-fg">{t(limit.title.ko, limit.title.en)}</h3>
            <p className="mt-2 text-sm leading-7 text-fg-2">{t(limit.body.ko, limit.body.en)}</p>
          </li>
        ))}
      </ul>
      <div className="mt-6">
        <Link to="/feedback?type=bug&tag=accessibility" className={TEXT_LINK}>
          {t("접근성 문제 제보", "Report an accessibility problem")}
          <ArrowRight size={14} aria-hidden />
        </Link>
      </div>
    </section>
  );
}

function ChecklistSection() {
  const t = useBilingual(SCOPE);
  const [checked, setChecked] = useState<ReadonlySet<string>>(() => new Set());
  const total = GUIDE_CHECKLIST.length;

  const toggle = (id: string) => {
    setChecked((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <section id="guide-checklist" aria-labelledby="guide-checklist-title" className={SECTION}>
      <h2 id="guide-checklist-title" className="text-2xl font-bold">
        {t("게시 전 점검표", "Pre-publish checklist")}
      </h2>
      <p className="mt-2 max-w-3xl leading-7 text-fg-2">
        {t(
          "작품을 게시하기 전에 하나씩 확인해 보세요. 체크 표시는 저장되지 않고 이 화면을 떠나면 사라져요.",
          "Go through these before you publish. Your ticks are not saved and disappear when you leave this page.",
        )}
      </p>
      <fieldset className="mt-5 min-w-0 border-0 p-0">
        <legend className="sr-only">{t("게시 전 점검 항목", "Pre-publish checks")}</legend>
        <ul className="grid gap-3">
          {GUIDE_CHECKLIST.map((item) => (
            <li key={item.id} className={cn(CARD, "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between")}>
              <label className="flex min-h-11 flex-1 cursor-pointer items-start gap-3 text-sm leading-6 text-fg">
                <input
                  type="checkbox"
                  checked={checked.has(item.id)}
                  onChange={() => toggle(item.id)}
                  className="mt-1 size-5 shrink-0 accent-[var(--color-accent)]"
                />
                <span>{t(item.label.ko, item.label.en)}</span>
              </label>
              {item.link ? (
                <Link to={item.link.href} className={cn(TEXT_LINK, "shrink-0")}>
                  {t(item.link.label.ko, item.link.label.en)}
                  <ArrowRight size={14} aria-hidden />
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      </fieldset>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <p role="status" aria-live="polite" className="text-sm font-bold text-fg">
          {t(`${checked.size}/${total}개 확인했어요`, `${checked.size} of ${total} checked`)}
        </p>
        <button
          type="button"
          onClick={() => setChecked(new Set())}
          disabled={checked.size === 0}
          className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11 gap-1.5" })}
        >
          <RotateCcw size={14} aria-hidden />
          {t("점검표 처음으로", "Clear the checklist")}
        </button>
      </div>
    </section>
  );
}

function ReferencesSection() {
  const t = useBilingual(SCOPE);
  return (
    <section id="guide-references" aria-labelledby="guide-references-title" className={SECTION}>
      <h2 id="guide-references-title" className="text-2xl font-bold">
        {t("참고 자료", "References")}
      </h2>
      <p className="mt-2 max-w-3xl leading-7 text-fg-2">
        {t(
          "표준과 브라우저 공식 문서예요. 외부 사이트는 새 창으로 열려요.",
          "Standards and official browser documentation. External sites open in a new tab.",
        )}
      </p>
      <ul className="mt-5 grid gap-3 md:grid-cols-2">
        {GUIDE_REFERENCES.map((reference) => (
          <li key={reference.id} className={CARD}>
            <a
              href={reference.href}
              target="_blank"
              rel="noopener noreferrer"
              className={cn("inline-flex min-h-11 items-center gap-1.5 rounded-lg font-bold text-accent hover:underline", FOCUS_RING)}
            >
              {t(reference.label.ko, reference.label.en)}
              <ExternalLink size={14} aria-hidden />
              <span className="sr-only">{t("(새 창)", "(opens in a new tab)")}</span>
            </a>
            <p className="mt-1 text-sm leading-6 text-fg-2">{t(reference.note.ko, reference.note.en)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

type VisionSimId = "wcag-aa-contrast-45" | "deuteranopia-safe" | "screenreader-alt-script";
type ReadingAidId = "panel-order-aria-flow" | "sfx-caption-brackets" | "dyslexia-line-height";

const VISION_SIM_OPTIONS: readonly {
  readonly id: VisionSimId;
  readonly ko: string;
  readonly en: string;
  readonly detailKo: string;
  readonly detailEn: string;
}[] = [
  {
    id: "wcag-aa-contrast-45",
    ko: "WCAG 4.5:1 명도 대비 검증",
    en: "WCAG 4.5:1 Contrast Check",
    detailKo: "말풍선 바탕과 대사 글자색의 명도 대비가 본문 4.5:1 · 큰 글씨 3:1 이상인지 점검합니다.",
    detailEn: "Verifies speech balloon background and dialogue text meet 4.5:1 body and 3:1 large text contrast.",
  },
  {
    id: "deuteranopia-safe",
    ko: "적록 색각이상 안전 팔레트",
    en: "Deuteranopia-Safe Palette",
    detailKo: "적록 색각이상(Deuteranopia) 독자도 캐릭터 진영과 감정 이펙트를 명도·패턴으로 구분하게 합니다.",
    detailEn: "Ensures faction colors and emotion effects remain distinguishable via luminance and pattern cues.",
  },
  {
    id: "screenreader-alt-script",
    ko: "스크린리더 상황해설 대본",
    en: "Screen Reader Alt Script",
    detailKo: "시각장애 독자를 위해 배경·인물 표정·행동을 컷 단위 대체 텍스트 대본으로 구조화합니다.",
    detailEn: "Structures scene descriptions, facial expressions, and actions into per-panel alt-text scripts.",
  },
];

const READING_AID_OPTIONS: readonly {
  readonly id: ReadingAidId;
  readonly ko: string;
  readonly en: string;
  readonly detailKo: string;
  readonly detailEn: string;
}[] = [
  {
    id: "panel-order-aria-flow",
    ko: "컷 읽기 순서 ARIA 흐름",
    en: "Panel Order ARIA Flow",
    detailKo: "복잡한 연출 컷에서도 스크린리더와 키보드 초점이 의도한 대사 순서대로 이동하도록 고정합니다.",
    detailEn: "Locks DOM and ARIA reading order so assistive focus follows intended panel and balloon sequence.",
  },
  {
    id: "sfx-caption-brackets",
    ko: "효과음(SFX) 대괄호 자막",
    en: "SFX Bracket Captions",
    detailKo: "손글씨 효과음을 [쾅], [바스락] 형태의 텍스트 자막으로 병기해 청각·시각 보조기기에 전달합니다.",
    detailEn: "Pairs hand-lettered sound effects with bracketed text captions like [THUD] and [RUSTLE].",
  },
  {
    id: "dyslexia-line-height",
    ko: "난독증 친화 행간·자간",
    en: "Dyslexia-Friendly Spacing",
    detailKo: "세로쓰기 대신 가로 정렬과 1.6배 이상 줄간격을 확보해 인지 피로를 줄입니다.",
    detailEn: "Enforces horizontal alignment with 1.6x+ line spacing to reduce reading cognitive load.",
  },
];

export function AccessibleWebtoonGuidePage() {
  const t = useBilingual(SCOPE);
  const lang = useI18n((state) => state.lang);
  const isKo = lang.startsWith("ko");
  const pickLang = (ko: string, en: string) => (isKo ? ko : en);
  const titleId = useId();
  useDocumentTitle(t("접근성 있는 웹툰 만들기 · 툰스튜디오", "Making webtoons accessible · ToonStudio"));
  const [visionSim, setVisionSim] = useState<VisionSimId>("wcag-aa-contrast-45");
  const [readingAid, setReadingAid] = useState<ReadingAidId>("panel-order-aria-flow");

  const activeVision = VISION_SIM_OPTIONS.find((item) => item.id === visionSim) ?? VISION_SIM_OPTIONS[0];
  const activeAid = READING_AID_OPTIONS.find((item) => item.id === readingAid) ?? READING_AID_OPTIONS[0];

  const statuses: readonly GuideStatus[] = ["available", "partial", "planned"];
  const toc = [
    ...GUIDE_SECTIONS.map((section) => ({ id: `guide-${section.id}`, label: t(section.title.ko, section.title.en) })),
    { id: "guide-limits", label: t("알아 둘 한계", "Limits to know") },
    { id: "guide-checklist", label: t("게시 전 점검표", "Pre-publish checklist") },
    { id: "guide-references", label: t("참고 자료", "References") },
  ];

  return (
    <article aria-labelledby={titleId} className="mx-auto max-w-5xl space-y-8 px-4 py-8 text-fg sm:px-6 sm:py-12">
      <header className="rounded-3xl border border-line bg-panel p-6 sm:p-10">
        <p className="text-xs font-bold tracking-[.16em] text-accent">ACCESSIBLE WEBTOON</p>
        <h1 id={titleId} className="mt-4 max-w-3xl text-3xl font-bold leading-tight sm:text-5xl">
          {t("접근성 있는 웹툰 만들기", "Making webtoons accessible")}
        </h1>
        <p className="mt-5 max-w-3xl text-base leading-8 text-fg-2 sm:text-lg">
          {t(
            "키보드로 작업하고, 말로 대사를 넣고, 보기 편한 화면을 고르고, 이미지를 볼 수 없는 독자도 이야기를 따라올 수 있게 만드는 방법을 ToonStudio 기능과 함께 정리했어요.",
            "How to work from the keyboard, put dialogue in by voice, choose a comfortable display, and let readers follow the story even if they cannot see the images — mapped to ToonStudio features.",
          )}
        </p>

        <div role="note" className="mt-6 flex items-start gap-3 rounded-2xl border border-line bg-canvas p-4 text-sm leading-6 text-fg-2">
          <Info size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden />
          <p>
            {t(
              `${ACCESSIBLE_WEBTOON_GUIDE_VERIFIED_AT} 기준으로 ToonStudio 화면과 코드에서 확인한 내용만 적었어요. 아직 화면에 연결되지 않은 기능은 ‘준비 중’, 브라우저나 기기에 따라 달라지는 기능은 ‘일부만’으로 표시했어요. 이 안내는 접근성 기준을 참고할 뿐, 어떤 작품이나 화면이 특정 기준을 충족한다고 보증하지 않아요.`,
              `Only what we verified in ToonStudio's screens and code as of ${ACCESSIBLE_WEBTOON_GUIDE_VERIFIED_AT} is listed. Features not yet wired into a screen are marked Coming soon, and ones that depend on your browser or device are marked Partly. This guide draws on accessibility standards but does not guarantee that any work or screen meets a given standard.`,
            )}
          </p>
        </div>

        <div className="mt-6">
          <h2 className="text-sm font-bold text-fg">{t("상태 표시", "Status labels")}</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {statuses.map((status) => (
              <li key={status}>
                <StatusChip status={status} />
              </li>
            ))}
          </ul>
        </div>

        <nav aria-label={t("이 안내의 목차", "On this page")} className="mt-6">
          <ol className="flex flex-wrap gap-2">
            {toc.map((entry) => (
              <li key={entry.id}>
                <a href={`#${entry.id}`} className={cn(TEXT_LINK, "py-1.5")}>
                  {entry.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </header>

      <section
        data-testid="accessible-guide-rea-wcag-bar"
        aria-label={pickLang("배리어프리 웹툰 WCAG 벤치마크 워크벤치", "Barrier-free webtoon WCAG benchmark workbench")}
        className="mb-5 rounded-2xl border border-line bg-card p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-accent">
            {pickLang("REA 시각 시뮬레이션 · 읽기 보조 규격 워크벤치", "REA Vision Simulation & Reading Aid Workbench")}
          </span>
          <span className="rounded-lg border border-line bg-panel px-3 py-1.5 font-mono text-xs text-fg-3">
            W3C WCAG 2.2 AA · Naver Barrier-Free Webtoon · Audio Webtoon Standard
          </span>
        </div>
        <div
          className="mt-3 flex flex-wrap items-center gap-2"
          role="group"
          aria-label={pickLang("시각 접근성 시뮬레이션", "Vision accessibility simulation")}
        >
          <span className="text-xs font-semibold text-fg-2">
            {pickLang("시각 검증", "Vision Sim")}
          </span>
          {VISION_SIM_OPTIONS.map((item) => {
            const active = item.id === visionSim;
            return (
              <button
                key={item.id}
                type="button"
                data-testid={`a11y-guide-rea-vision-${item.id}`}
                aria-pressed={active}
                onClick={() => setVisionSim(item.id)}
                className={
                  active
                    ? "rounded-lg border border-accent bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent"
                    : "rounded-lg border border-line bg-panel px-3 py-1.5 text-xs font-semibold text-fg-2"
                }
              >
                {pickLang(item.ko, item.en)}
              </button>
            );
          })}
        </div>
        <div
          className="mt-2 flex flex-wrap items-center gap-2"
          role="group"
          aria-label={pickLang("읽기 보조 규칙", "Reading aid rule")}
        >
          <span className="text-xs font-semibold text-fg-2">
            {pickLang("읽기 보조", "Reading Aid")}
          </span>
          {READING_AID_OPTIONS.map((item) => {
            const active = item.id === readingAid;
            return (
              <button
                key={item.id}
                type="button"
                data-testid={`a11y-guide-rea-aid-${item.id}`}
                aria-pressed={active}
                onClick={() => setReadingAid(item.id)}
                className={
                  active
                    ? "rounded-lg border border-accent bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent"
                    : "rounded-lg border border-line bg-panel px-3 py-1.5 text-xs font-semibold text-fg-2"
                }
              >
                {pickLang(item.ko, item.en)}
              </button>
            );
          })}
        </div>
        <p
          data-testid="accessible-guide-rea-status"
          aria-live="polite"
          className="mt-3 rounded-xl border border-line bg-panel px-3 py-1.5 font-mono text-xs text-fg"
        >
          {pickLang(
            `${activeVision.ko} + ${activeAid.ko} · ${activeVision.detailKo} (${activeAid.detailKo})`,
            `${activeVision.en} + ${activeAid.en} · ${activeVision.detailEn} (${activeAid.detailEn})`,
          )}
        </p>
      </section>

      {GUIDE_SECTIONS.map((section) => (
        <GuideSectionBlock key={section.id} section={section} />
      ))}
      <LimitsSection />
      <ChecklistSection />
      <ReferencesSection />

      <footer className="grid gap-5 rounded-3xl border border-line bg-panel p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div>
          <p className="text-xs font-bold tracking-[.14em] text-accent">LEARN → MAKE</p>
          <h2 className="mt-2 text-2xl font-bold">{t("직접 해 보세요", "Try it yourself")}</h2>
          <p className="mt-2 max-w-3xl leading-7 text-fg-2">
            {t(
              "Studio를 열어 F1로 ‘애플리케이션 설정’을 찾고, 내게 맞는 프로필을 골라 보세요.",
              "Open Studio, find Application settings with F1, and try the profile that suits you.",
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Link to="/studio/new" className={buttonClass({ size: "md", className: "min-h-11" })}>
            {t("새 작업 시작", "Start a project")}
          </Link>
          <Link to="/accessibility" className={buttonClass({ variant: "outline", size: "md", className: "min-h-11" })}>
            {t("접근성 안내", "Accessibility statement")}
          </Link>
          <Link to="/learn" className={buttonClass({ variant: "outline", size: "md", className: "min-h-11" })}>
            {t("학습 홈으로", "Back to Learn")}
          </Link>
        </div>
      </footer>
    </article>
  );
}
