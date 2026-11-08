import { ArrowDown, ArrowUpRight, ChevronDown, List, Printer } from "lucide-react";
import type { ReactNode } from "react";

import { DocumentReadingProgress, LegalRelatedDocs, type LegalDocOutlineItem } from "./LegalDocTools";
import { formatPolicyDate, shortContentHash, type PolicyDocument } from "./policy-content";
import "./privacy-policy-layout.css";

import { Container } from "@/shared/components/section";
import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import { useDocumentTitle } from "@/shared/seo/use-document-title";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("PrivacyPolicyLayout", ko, en);

interface PrivacyPolicyLayoutProps {
  doc: PolicyDocument;
  outline: readonly LegalDocOutlineItem[];
  summaries: { ko: readonly string[]; en: readonly string[] };
  children: ReactNode;
}

function ContentsLinks({ outline }: { outline: readonly LegalDocOutlineItem[] }) {
  return (
    <ol className="privacy-policy__contents-list">
      {outline.map((item) => (
        <li key={item.id}><a href={`#${item.id}`}>{item.label}</a></li>
      ))}
    </ol>
  );
}

/** DocsShell 와이어프레임의 문서 우선 구조를 개인정보 안내에만 적용한다. */
export function PrivacyPolicyLayout({ doc, outline, summaries, children }: PrivacyPolicyLayoutProps) {
  useBilingualI18nRevision();
  const title = doc.name || bi("개인정보처리방침", "Privacy Policy");
  const effective = formatPolicyDate(doc.effectiveAt);
  useDocumentTitle(title);

  return (
    <Container size="wide" className="policy-page privacy-policy py-8 sm:py-10 lg:py-12">
      <DocumentReadingProgress />
      <div className="privacy-policy__intro">
        <header className="privacy-policy__header">
          <p className="eyebrow text-accent">{bi("개인정보 안내", "Privacy")}</p>
          <h1 id="privacy-policy-title">{title}</h1>
          <dl className="privacy-policy__metadata">
            {effective ? <div><dt>{bi("시행일", "Effective")}</dt><dd>{effective}</dd></div> : null}
            <div><dt>{bi("버전", "Version")}</dt><dd>{doc.versionLabel}</dd></div>
            <div><dt>{bi("문서 ID", "Document ID")}</dt><dd><code>{shortContentHash(doc.contentHash)}</code></dd></div>
          </dl>
        </header>

        <section className="privacy-policy__summary" aria-labelledby="privacy-summary-title">
          <h2 id="privacy-summary-title">{bi("먼저 보는 쉬운 말 요약", "A plain-language summary first")}</h2>
          <ul>{bi(summaries.ko, summaries.en).map((item) => <li key={item}>{item}</li>)}</ul>
          <p>{bi(
            "아래 요약은 이해를 돕기 위한 안내이며, 권리와 의무는 전체 정책 본문을 기준으로 합니다.",
            "The summary below is a guide to help understanding; rights and duties follow the full policy text.",
          )}</p>
          <div className="privacy-policy__quick-actions">
            <a className="privacy-policy__body-link" href="#privacy-policy-document">
              {bi("전체 정책 읽기", "Read the full policy")}<ArrowDown size={16} aria-hidden="true" />
            </a>
            <button type="button" onClick={() => window.print()}>
              <Printer size={17} aria-hidden="true" />{bi("인쇄·PDF 저장", "Print / save as PDF")}
            </button>
          </div>
        </section>
      </div>

      <div className="privacy-policy__layout">
        <aside className="privacy-policy__navigation">
          <details className="privacy-policy__mobile-contents">
            <summary>
              <List size={18} aria-hidden="true" />
              <span>{bi("문서 목차", "Contents")}</span>
              <span className="privacy-policy__clause-count">{bi(`${outline.length}개 조항`, `${outline.length} clauses`)}</span>
              <ChevronDown size={16} aria-hidden="true" />
            </summary>
            <nav aria-label={bi("개인정보처리방침 모바일 목차", "Privacy policy mobile contents")}>
              <ContentsLinks outline={outline} />
            </nav>
          </details>
          <nav className="privacy-policy__desktop-contents" aria-label={bi("개인정보처리방침 목차", "Privacy policy contents")}>
            <h2>{bi("문서 목차", "Contents")}</h2>
            <ContentsLinks outline={outline} />
          </nav>
        </aside>

        <article id="privacy-policy-document" className="privacy-policy__document" aria-labelledby="privacy-policy-title" tabIndex={-1}>
          {children}
        </article>

        <aside className="privacy-policy__tools" aria-labelledby="privacy-tools-title">
          <h2 id="privacy-tools-title">{bi("관련 안내", "Related guidance")}</h2>
          <a href="/support">
            {bi("문의 안내", "Support guide")}<ArrowUpRight size={16} aria-hidden="true" />
          </a>
          <p>{bi("문서의 버전과 시행일을 함께 확인하세요.", "Check the version and effective date with the document.")}</p>
        </aside>
      </div>
      <LegalRelatedDocs currentHref="/privacy" />
    </Container>
  );
}
