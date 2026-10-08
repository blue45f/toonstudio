import { BookOpen, ExternalLink, Map as MapIcon, Scale, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { GuidePathList } from "./EngineeringGuideBlocks";
import { EngineeringDisclosure } from "./EngineeringLongform";
import { EngineeringStatusBadge } from "./EngineeringStoryUi";
import { isLicenseCaution, licenseBasis, mapRowHref, officialLinksForName } from "./engineering-library-card-helpers";
import { LIBRARY_KIND_LABELS, type LibraryCard } from "./engineering-library-guide-types";
import { localizedLicense } from "./engineering-library-license-labels";
import type { LocalizedText } from "./engineering-story-content";
import { useLibraryAtlasNames } from "./use-library-atlas-names";

import Link from "@/shared/navigation/router-link";
import { cx } from "@/shared/lib/cx";
import { translateBilingualValueForActiveLocale, useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("EngineeringLibraryCard", ko, en);

const text = (value: LocalizedText): string => bi(value.ko, value.en);

const CHIP = "inline-flex min-h-7 items-center gap-1 rounded-full border px-2.5 py-1 font-display text-[0.66rem] font-bold";

/** 라이선스 칩. 비상업·카피레프트처럼 조건이 까다로운 라벨은 색과 아이콘, 글자로 함께 표시한다(법률 판단 아님). */
function LicenseChip({ license }: { readonly license: string }) {
  const caution = isLicenseCaution(license);
  return (
    <span
      className={cx(CHIP, caution ? "border-warn/50 bg-warn/12 text-warn" : "border-line bg-card text-fg-2")}
      title={
        caution
          ? bi(
              "사용 조건을 따로 확인해야 하는 라이선스입니다. 이 페이지는 법률 판단을 하지 않고 설치본과 저장소 문서의 라벨만 적습니다.",
              "A license whose terms need separate checking. This page makes no legal judgment and only lists the labels in the installed package and repository documents.",
            )
          : undefined
      }
    >
      {caution ? <TriangleAlert size={11} aria-hidden="true" /> : <Scale size={11} aria-hidden="true" />}
      <span className="sr-only">{bi("라이선스", "License")}: </span>
      {text(localizedLicense(license))}
      {caution ? <span className="sr-only"> ({bi("조건 확인 필요", "terms need checking")})</span> : null}
    </span>
  );
}

type InfoTone = "good" | "warn" | "plain";

const INFO_TONES: Readonly<Record<InfoTone, string>> = {
  good: "bg-good/10",
  warn: "bg-warn/10",
  plain: "border border-line/65 bg-card/65",
};

/** 카드 펼침 안의 한 칸(왜 골랐나 · 검토한 대안 · 대가 · 쓰는 곳). */
function InfoBox({ tone, title, children }: { readonly tone: InfoTone; readonly title: string; readonly children: ReactNode }) {
  return (
    <div className={cx("min-w-0 rounded-2xl px-4 py-3.5", INFO_TONES[tone])}>
      <p className="text-xs font-black text-fg">{title}</p>
      <div className="mt-1.5 text-sm leading-7 text-fg-2 sm:text-base sm:leading-8">{children}</div>
    </div>
  );
}

const LINK_CHIP =
  "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold leading-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:min-h-9";

/** 도감 카드 링크 칩. 이름은 렌더 뒤에 풀리고, 풀리기 전·실패 시에는 id 로 대신 그린다. */
function AtlasChips({ atlasIds }: { readonly atlasIds: readonly string[] }) {
  const names = useLibraryAtlasNames(atlasIds.length > 0);
  if (atlasIds.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-black text-fg-3">{bi("기술 도감 카드", "Tech atlas cards")}</span>
      {atlasIds.map((id) => (
        <Link
          key={id}
          href={`/about/technology/atlas#${id}`}
          data-atlas-id={id}
          className={cx(LINK_CHIP, "border-accent/35 bg-accent-soft text-accent hover:border-accent/60")}
        >
          <BookOpen size={12} aria-hidden="true" className="shrink-0" />
          {names?.get(id) ?? id}
        </Link>
      ))}
    </div>
  );
}

/**
 * 라이브러리 카드 하나. 접힌 상태에서도 이름 · 종류 · 상태 · 라이선스 · 한 줄 소개가 보이고,
 * 펼치면 하는 일 · 왜 골랐나 · 검토한 대안 · 대가 · 쓰는 곳(파일) · 라이선스 근거 · 공식 링크 · 도감 링크가 나온다.
 * `<li id="library-<카드 id>">` 앵커로 들어오면 목차 도구가 이 카드를 자동으로 펼친다.
 */
export function EngineeringLibraryCard({ card }: { readonly card: LibraryCard }) {
  useBilingualI18nRevision();
  const basis = licenseBasis(card);
  const officialLinks = officialLinksForName(card.name);

  return (
    <li id={`library-${card.id}`} className="scroll-mt-40">
      <EngineeringDisclosure
        className="border-line/75 bg-card/60"
        bodyClassName="grid gap-5 p-4 sm:p-6"
        summary={(
          <span className="grid min-w-0 flex-1 gap-1.5 py-1.5">
            <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
              <span className="text-balance break-keep text-lg font-black leading-7 text-fg sm:text-xl">{card.name}</span>
              <span className={cx(CHIP, "border-line bg-panel text-fg-2")}>{text(LIBRARY_KIND_LABELS[card.kind])}</span>
              <EngineeringStatusBadge status={card.status} />
              <LicenseChip license={card.license} />
            </span>
            <span className="break-keep text-sm font-medium leading-7 text-fg-2 sm:text-base">{text(card.oneLine)}</span>
          </span>
        )}
      >
        <p className="max-w-4xl text-base leading-8 text-fg">
          <strong className="mr-2 text-sm font-black text-accent">{bi("하는 일", "What it does")}</strong>
          {text(card.usedFor)}
        </p>

        <div className="grid gap-3 lg:grid-cols-2">
          <InfoBox tone="good" title={bi("왜 골랐나", "Why we chose it")}>
            {text(card.why)}
          </InfoBox>
          {card.alternatives ? (
            <InfoBox tone="plain" title={bi("검토한 대안", "Alternatives weighed")}>
              {text(card.alternatives)}
            </InfoBox>
          ) : null}
          <InfoBox tone="warn" title={bi("대가·주의", "Cost and cautions")}>
            {text(card.cost)}
          </InfoBox>
          <InfoBox tone="plain" title={bi("쓰는 곳 (파일)", "Where it is used (files)")}>
            <GuidePathList paths={card.paths} label={bi("쓰는 곳 파일", "Files where it is used")} />
          </InfoBox>
        </div>

        <dl className="grid gap-x-5 gap-y-2 text-sm leading-7 text-fg-2 sm:grid-cols-[max-content_minmax(0,1fr)]">
          <dt className="font-black text-fg-3">{bi("라이선스", "License")}</dt>
          <dd className="min-w-0">
            <code className="eng-code rounded-lg px-2 py-0.5 font-mono text-xs">{text(localizedLicense(card.license))}</code>
            <span className="ml-2 text-xs text-fg-3">
              {basis.kind === "package" ? (
                <>
                  {bi("근거: 설치본 package.json", "Basis: installed package.json")} · <code className="break-all font-mono">{basis.value}</code>
                </>
              ) : basis.kind === "file" ? (
                <>
                  {bi("근거 파일", "Basis file")} · <code className="break-all font-mono">{basis.value}</code>
                </>
              ) : (
                bi("근거: 표준 또는 서비스 조건", "Basis: the standard or service terms")
              )}
            </span>
          </dd>
        </dl>

        {officialLinks.length > 0 || card.mapRowId ? (
          <div className="flex flex-wrap items-center gap-2">
            {officialLinks.length > 0 ? <span className="text-xs font-black text-fg-3">{bi("공식 사이트·저장소", "Official site or repository")}</span> : null}
            {officialLinks.map((link) => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${link.name} · ${bi("공식 사이트", "Official site")}`}
                className={cx(LINK_CHIP, "border-line bg-card/75 text-fg-2 hover:border-accent/50 hover:text-accent")}
              >
                {link.name}
                <ExternalLink size={11} aria-hidden="true" className="shrink-0 opacity-70" />
              </a>
            ))}
            {card.mapRowId ? (
              <Link
                href={mapRowHref(card.mapRowId)}
                data-map-row-id={card.mapRowId}
                className={cx(LINK_CHIP, "border-line bg-card/75 text-fg-2 hover:border-accent/50 hover:text-accent")}
              >
                <MapIcon size={12} aria-hidden="true" className="shrink-0" />
                {bi("오픈소스 지도에서 보기", "See it in the open-source map")}
              </Link>
            ) : null}
          </div>
        ) : null}

        <AtlasChips atlasIds={card.atlasIds ?? []} />
      </EngineeringDisclosure>
    </li>
  );
}
