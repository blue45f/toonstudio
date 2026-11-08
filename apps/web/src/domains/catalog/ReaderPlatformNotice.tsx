import { ArrowUpRight, BookOpen, Sparkles } from "lucide-react";

import { formatI18nTemplate, useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

import "./reader-reference-layout.css";

/** 원고 제공 여부를 확정하지 않은 대기 화면 대신 실제 감상 경로를 먼저 안내한다. */
export function ReaderPlatformNotice({
  platformLink,
  detailPath,
}: {
  readonly platformLink: { name: string; url: string } | null;
  readonly detailPath: string;
}) {
  const bt = useBilingual("TitleReaderPage");
  return (
    <section className="reader-platform-notice" aria-label={bt("회차 내용", "Episode content")}>
      <div className="reader-platform-art" aria-hidden="true">
        <Sparkles className="reader-platform-sparkles" strokeWidth={1.5} />
        <BookOpen className="reader-platform-book" strokeWidth={1.4} />
      </div>
      <h1>{platformLink
        ? bt("이 회차는 외부 플랫폼에서 읽어요", "Read this episode on its official platform")
        : bt("공식 감상 경로를 확인해 주세요", "Find the official reading link")}</h1>
      <p className="reader-platform-description">{bt("이 사이트에는 회차 컷이 제공되지 않아요.", "Episode panels are not provided on this site.")}<br />
        {platformLink
          ? bt("공식 플랫폼에서 감상해 주세요.", "Continue reading on the official platform.")
          : bt("작품 상세에서 공식 감상 경로를 확인해 주세요.", "Check the title details for its official reading links.")}
      </p>
      <div className="reader-platform-actions">
        {platformLink && <a className="reader-platform-primary" href={platformLink.url} target="_blank" rel="noopener noreferrer">
          {formatI18nTemplate(bt("{v0}에서 읽기", "Read on {v0}"), { v0: platformLink.name })}
          <ArrowUpRight size={18} aria-hidden="true" />
        </a>}
        <Link className="reader-platform-detail" href={detailPath}>{bt("작품 상세로", "Title details")}</Link>
      </div>
      <p className="reader-platform-progress-note">{bt("컷이 제공되지 않아 읽기 진도를 기록하지 않아요.", "Reading progress is not recorded because panels are not provided.")}</p>
    </section>
  );
}
