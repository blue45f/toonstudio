import {
  Accessibility,
  ArrowRight,
  Bot,
  Copyright,
  Database,
  FileText,
  Printer,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

import { LEGAL_DOCUMENTS, type LegalDocumentEntry } from "./legal-documents";
import "./policy-page.css";

import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("LegalDocTools", ko, en);

const DOCUMENT_ICONS: Readonly<Record<LegalDocumentEntry["id"], LucideIcon>> = {
  terms: FileText,
  privacy: ShieldCheck,
  copyright: Copyright,
  crawler: Bot,
  accessibility: Accessibility,
  data: Database,
};

/** 문서 읽기 진행률 바: 긴 문서의 현재 위치를 상단 고정 바에 표시한다. (PolicyPage에서 공유 템플릿으로 승격) */
export function DocumentReadingProgress() {
  useBilingualI18nRevision();
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const update = () => {
      const element = document.documentElement;
      const total = element.scrollHeight - element.clientHeight;
      setProgress(total > 0 ? Math.min(1, Math.max(0, element.scrollTop / total)) : 0);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  return (
    <div
      className="policy-page__progress"
      role="progressbar"
      aria-label={bi("문서 읽기 진행률", "Document reading progress")}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
    >
      <div className="policy-page__progress-bar" style={{ transform: `scaleX(${progress})` }} />
    </div>
  );
}

export interface LegalDocOutlineItem {
  readonly id: string;
  readonly label: string;
}

/** prose 문서용 인라인 목차: 번호 앵커 목록 + 인쇄 버튼. (CopyrightPage의 목차를 공유 템플릿으로 승격) */
export function LegalDocOutline({ sections }: { sections: readonly LegalDocOutlineItem[] }) {
  useBilingualI18nRevision();
  return (
    <nav aria-label={bi("문서 목차", "Document outline")} className="mt-6 rounded-2xl border border-line bg-panel/60 p-4">
      <h2 className="text-sm font-bold text-fg">{bi("문서 목차", "Contents")}</h2>
      <ol className="mt-3 space-y-1">
        {sections.map((section, index) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              className="flex min-h-10 items-start gap-2 rounded-lg px-2 py-2 text-sm leading-6 text-fg-2 hover:bg-card hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
            >
              <span className="mt-px font-mono text-xs text-accent">{String(index + 1).padStart(2, "0")}</span>
              <span>{section.label}</span>
            </a>
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={() => window.print()}
        className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-line-strong bg-card px-3 text-xs font-bold text-fg-2 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
      >
        <Printer size={15} aria-hidden="true" />
        {bi("인쇄·PDF 저장", "Print / save as PDF")}
      </button>
    </nav>
  );
}

/** 관련 문서 이동: 법무·신뢰 문서군 안에서 현재 문서를 뺀 나머지를 하단에 연결한다. */
export function LegalRelatedDocs({ currentHref }: { currentHref: string }) {
  useBilingualI18nRevision();
  const related = LEGAL_DOCUMENTS.filter((doc) => doc.href !== currentHref);
  return (
    <section aria-labelledby="legal-related-docs-title" className="mt-12 border-t border-line pt-8">
      <h2 id="legal-related-docs-title" className="font-display text-lg font-bold text-fg">
        {bi("관련 문서", "Related documents")}
      </h2>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {related.map((doc) => {
          const Icon = DOCUMENT_ICONS[doc.id];
          const name = bi(doc.name.ko, doc.name.en);
          return (
            <li key={doc.id} className="min-w-0">
              {/* 정책 문서와 같은 정적 문서 이동이라 라우터 Link가 아닌 기본 앵커를 쓴다 (라우터 밖 렌더에서도 동작). */}
              <a
                href={doc.href}
                className="group flex h-full items-start gap-3 rounded-2xl border border-line bg-card/40 p-4 transition hover:border-line-strong hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-panel text-accent">
                  <Icon size={18} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 font-bold text-fg">
                    {name}
                    <ArrowRight size={13} className="shrink-0 text-fg-3 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
                  </span>
                  <span className="mt-1 block text-sm leading-6 text-fg-2">{bi(doc.summary.ko, doc.summary.en)}</span>
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
