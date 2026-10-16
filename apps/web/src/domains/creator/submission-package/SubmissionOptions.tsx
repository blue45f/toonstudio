import { useId } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { WEBTOON_WIDTH_STANDARDS } from "../studio-webtoon-guides";

import type { SubmissionCoverLocaleChoice } from "./submission-package-draft-store";
import type { SubmissionTargetWidthId } from "./submission-package-types";

const SELECT_CLASS =
  "mt-1 w-full rounded-xl border border-line bg-card px-3 py-2 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/80";

export interface SubmissionOptionsProps {
  readonly targetWidth: SubmissionTargetWidthId;
  readonly includeCoverPdf: boolean;
  readonly coverLocale: SubmissionCoverLocaleChoice;
  readonly onTargetWidth: (value: SubmissionTargetWidthId) => void;
  readonly onIncludeCoverPdf: (value: boolean) => void;
  readonly onCoverLocale: (value: SubmissionCoverLocaleChoice) => void;
}

function isTargetWidthId(value: string): value is SubmissionTargetWidthId {
  return value === "any" || WEBTOON_WIDTH_STANDARDS.some((standard) => standard.id === value);
}

function isCoverLocale(value: string): value is SubmissionCoverLocaleChoice {
  return value === "auto" || value === "ko" || value === "en";
}

export function SubmissionOptions({ targetWidth, includeCoverPdf, coverLocale, onTargetWidth, onIncludeCoverPdf, onCoverLocale }: SubmissionOptionsProps) {
  const bt = useBilingual("SubmissionOptions");
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const widthId = `${baseId}-width`;
  const widthHintId = `${baseId}-width-hint`;
  const pdfId = `${baseId}-pdf`;
  const pdfHintId = `${baseId}-pdf-hint`;
  const localeId = `${baseId}-locale`;

  return (
    <fieldset className="space-y-4 rounded-2xl border border-line bg-panel p-4 sm:p-5" aria-labelledby={titleId}>
      <legend id={titleId} className="px-1 text-base font-black text-fg">
        {bt("만드는 방식", "Options")}
      </legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={widthId} className="text-sm font-bold text-fg">
            {bt("가로 폭 점검 기준", "Width to check against")}
          </label>
          <select
            id={widthId}
            className={SELECT_CLASS}
            value={targetWidth}
            aria-describedby={widthHintId}
            onChange={(event) => {
              if (isTargetWidthId(event.target.value)) onTargetWidth(event.target.value);
            }}
          >
            {WEBTOON_WIDTH_STANDARDS.map((standard) => (
              <option key={standard.id} value={standard.id}>
                {standard.label} {standard.width}px
              </option>
            ))}
            <option value="any">{bt("점검하지 않음", "Do not check")}</option>
          </select>
          <p id={widthHintId} className="mt-1 text-xs leading-relaxed text-fg-3">
            {bt(
              "스튜디오의 표준폭 가이드(네이버 690·카카오 720 등)를 기준으로 고른 이미지의 가로 폭을 비교해요. 작업용 가이드이므로 투고처의 최신 안내가 우선이에요.",
              "Compares the width of the images you chose with Studio's standard-width guides (Naver 690, Kakao 720 and so on). These are working guides, so the submission site's current guidelines come first.",
            )}
          </p>
        </div>
        <div>
          <label htmlFor={localeId} className="text-sm font-bold text-fg">
            {bt("표지 언어", "Cover language")}
          </label>
          <select
            id={localeId}
            className={SELECT_CLASS}
            value={coverLocale}
            onChange={(event) => {
              if (isCoverLocale(event.target.value)) onCoverLocale(event.target.value);
            }}
          >
            <option value="auto">{bt("지금 화면 언어와 같게", "Same as the app language")}</option>
            <option value="ko">한국어</option>
            <option value="en">English</option>
          </select>
        </div>
      </div>
      <div>
        <label htmlFor={pdfId} className="flex min-h-11 cursor-pointer items-start gap-2 text-sm font-bold text-fg">
          <input id={pdfId} type="checkbox" className="mt-1 size-4 shrink-0 accent-accent" checked={includeCoverPdf} aria-describedby={pdfHintId} onChange={(event) => onIncludeCoverPdf(event.target.checked)} />
          <span>{bt("표지 요약 PDF도 넣기", "Also include a summary PDF of the cover")}</span>
        </label>
        <p id={pdfHintId} className="ml-6 text-xs leading-relaxed text-fg-3">
          {bt(
            "글이 아닌 그림으로 그려서 글자를 선택하거나 검색할 수는 없어요. 읽는 글은 cover.md 에 들어가요. 브라우저가 그릴 수 없으면 PDF 없이 만들고 알려 드려요.",
            "It is drawn as pictures, so the text cannot be selected or searched; the readable text is in cover.md. If the browser cannot draw it, the package is built without the PDF and you are told.",
          )}
        </p>
      </div>
    </fieldset>
  );
}
