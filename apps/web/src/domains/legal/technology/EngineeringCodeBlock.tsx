import { Check, Code2, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { EngineeringCodeLanguage } from "./engineering-atlas-types";
import { CODE_LANGUAGE_LABEL, codeLineText, tokenizeCode } from "./engineering-code-highlight";
import "./engineering-surfaces.css";

import { cx } from "@/shared/lib/cx";
import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("EngineeringCodeBlock", ko, en);

export interface EngineeringCodeBlockProps {
  readonly code: string;
  readonly language: EngineeringCodeLanguage;
  /** 헤더에 보여줄 이름. 없으면 언어 이름을 쓴다. */
  readonly title?: string;
  /** 단순화하기 전 실제 구현 경로. */
  readonly sourcePath?: string;
  /** `slide`는 발표 화면용: 복사 버튼 없이 컨테이너 폭에 비례해 글자를 키운다. */
  readonly variant?: "page" | "slide";
  readonly showLineNumbers?: boolean;
  readonly className?: string;
}

/** 키보드로 가로 스크롤할 수 있는 읽기 쉬운 코드 표면. 구문 강조는 장식이며 복사본은 원본과 같다. */
export function EngineeringCodeBlock({
  code,
  language,
  title,
  sourcePath,
  variant = "page",
  showLineNumbers,
  className,
}: EngineeringCodeBlockProps) {
  useBilingualI18nRevision();
  const lines = tokenizeCode(code, language);
  const numbered = showLineNumbers ?? (variant === "page" && lines.length > 5);
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const languageLabel = CODE_LANGUAGE_LABEL[language];
  const label = title ?? languageLabel;

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async (): Promise<void> => {
    clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(lines.map(codeLineText).join("\n"));
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
    timer.current = setTimeout(() => setStatus("idle"), 2200);
  };

  return (
    <figure className={cx("eng-code overflow-hidden rounded-2xl", className)} data-variant={variant} data-language={language}>
      <figcaption className="eng-code__header flex items-center justify-between gap-3 px-4 py-2.5">
        <span className="eng-code__label inline-flex min-w-0 items-center gap-2 font-display text-[0.64rem] font-bold uppercase tracking-[0.15em]">
          <Code2 size={14} aria-hidden="true" className="shrink-0" />
          <span className="truncate">{label}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {title ? <span className="eng-code__lang">{languageLabel}</span> : null}
          {variant === "page" ? (
            <button type="button" className="eng-code__copy" onClick={() => void copy()}>
              {status === "copied" ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
              <span>
                {status === "copied" ? bi("복사됨", "Copied") : status === "failed" ? bi("복사 실패", "Copy failed") : bi("복사", "Copy")}
              </span>
              <span className="sr-only">{bi("코드 전체를 클립보드에 복사", "Copy the whole code to the clipboard")}</span>
            </button>
          ) : null}
        </span>
      </figcaption>
      <div
        className="eng-code__scroll"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- 가로로 넘치는 코드를 키보드만으로 읽을 수 있어야 하므로 스크롤 영역에 포커스가 필요하다(WCAG 2.1.1).
        tabIndex={0}
        role="region"
        aria-label={bi(`${label} 코드`, `${label} code`)}
      >
        <pre className="eng-code__pre">
          <code>
            {lines.map((line, lineIndex) => (
              <span key={lineIndex} className="eng-code__line">
                {numbered ? (
                  <span className="eng-code__no" aria-hidden="true">
                    {lineIndex + 1}
                  </span>
                ) : null}
                <span className="eng-code__text">
                  {line.map((token, tokenIndex) => (
                    <span key={tokenIndex} className={`tok tok-${token.kind}`}>
                      {token.text}
                    </span>
                  ))}
                  {"\n"}
                </span>
              </span>
            ))}
          </code>
        </pre>
      </div>
      {sourcePath ? (
        <p className="eng-code__source">
          <span>{bi("단순화 전 원본", "Simplified from")}</span> <code>{sourcePath}</code>
        </p>
      ) : null}
      <span className="sr-only" role="status" aria-live="polite">
        {status === "copied" ? bi("코드를 복사했습니다", "Code copied") : status === "failed" ? bi("복사하지 못했습니다", "Could not copy") : ""}
      </span>
    </figure>
  );
}
