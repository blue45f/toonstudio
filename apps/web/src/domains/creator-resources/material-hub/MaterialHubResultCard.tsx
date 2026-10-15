import { Check } from "lucide-react";
import { useState } from "react";

import { RESOURCE_BUTTON } from "../navigation";
import { resourceUsageDescription, resourceUsageLabel } from "../resource-usage";

import type { MaterialAsset } from "../material-atlas/model";
import type { CreatorResource, ResourceLicense } from "@/shared/lib/creator-resources";

import { TypographicCover } from "@/shared/components/typographic-cover";
import { RESOURCE_LABELS } from "@/shared/lib/creator-resources";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

const BADGE_CODE: Readonly<Record<ResourceLicense, string>> = {
  CC0: "CC0",
  "CC-BY-4.0": "CC BY 4.0",
  "reference-only": "REF",
  "book-promotion": "BOOK",
  "metadata-only": "META",
};

const BADGE_TONE: Readonly<Record<ResourceLicense, string>> = {
  CC0: "border-good/50 bg-good/10",
  "CC-BY-4.0": "border-cool/50 bg-cool/10",
  "reference-only": "border-warn/50 bg-warn/10",
  "book-promotion": "border-line bg-raised",
  "metadata-only": "border-line bg-raised",
};

/** resourceUsageLabel 의 영문 짝. 한글 문구는 기존 헬퍼 그대로 쓴다(법적 고지라 지우거나 완화하지 않는다). */
const USAGE_LABEL_EN: Readonly<Record<ResourceLicense, string>> = {
  CC0: "Open use confirmed",
  "CC-BY-4.0": "Attribution required",
  "reference-only": "Reference only",
  "book-promotion": "Book promotion",
  "metadata-only": "Info and source link",
};

const USAGE_DESCRIPTION_EN: Readonly<Record<ResourceLicense, string>> = {
  CC0: "The official provider's open-use notice was checked. Check portrait, trademark and other rights separately.",
  "CC-BY-4.0": "Public data that requires attribution. Keep the provider, license and retrieval time with the result.",
  "reference-only": "Only a safe preview and metadata are kept. Direct import into Studio is not allowed until you confirm the work's rights, marks, likeness and third-party terms.",
  "book-promotion": "Bibliographic data for book promotion. Check the permitted scope before reselling or altering it.",
  "metadata-only": "Search metadata. It does not grant permission to redistribute or adapt the images or text.",
};

export interface MaterialHubResultCardProps {
  readonly item: CreatorResource;
  readonly saved: boolean;
  readonly saveDisabled: boolean;
  /** 스튜디오 전달 계약(MATERIAL_DROP_KEY)으로 보낼 수 있는 자료면 그 자산, 아니면 null */
  readonly studioAsset: MaterialAsset | null;
  readonly onToggleSaved: (item: CreatorResource) => void;
  readonly onSendToStudio: (asset: MaterialAsset) => void;
}

export function MaterialHubResultCard({ item, saved, saveDisabled, studioAsset, onToggleSaved, onSendToStudio }: MaterialHubResultCardProps) {
  const bt = useBilingual("MaterialHubResultCard");
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(item.imageUrl) && !imageFailed;
  const providerLabel = RESOURCE_LABELS[item.provider];
  const credit = item.provenance?.attribution || item.credit || providerLabel;

  return (
    <article data-hub-card={item.id} className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-panel">
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-raised">
        {showImage
          ? <img src={item.imageUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} className="absolute inset-0 h-full w-full object-cover" />
          : <TypographicCover title={item.title} seed={item.id} className="absolute inset-0" />}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <h5 tabIndex={-1} className="break-words text-sm font-bold leading-5">{item.title}</h5>
        <p className="text-xs leading-5 text-fg-2">{item.creator || bt("저작자·기관 원문 확인", "Check the source for the creator")}{item.dateLabel ? ` · ${item.dateLabel}` : ""}</p>
        <p className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className={`inline-flex min-h-7 items-center gap-1 rounded-full border px-2.5 font-semibold text-fg ${BADGE_TONE[item.license]}`}>
            <span aria-hidden="true">{BADGE_CODE[item.license]}</span>
            <span>{bt(resourceUsageLabel(item), USAGE_LABEL_EN[item.license])}</span>
          </span>
        </p>
        <p className="text-xs leading-5 text-fg-2">
          <span className="font-semibold text-fg">{bt("제공", "From")}</span> {providerLabel}
          {credit && credit !== providerLabel ? <span className="block text-fg-3">{credit}</span> : null}
        </p>
        <details className="text-xs leading-5 text-fg-2">
          <summary className="min-h-11 cursor-pointer py-2.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">{bt("이용조건·조회일", "Terms and retrieval date")}</summary>
          <p>{bt(resourceUsageDescription(item), USAGE_DESCRIPTION_EN[item.license])}</p>
          {item.provenance?.rightsStatement ? <p className="mt-1">{item.provenance.rightsStatement}</p> : null}
          {item.licenseUrl ? <a className="mt-1 inline-flex min-h-11 items-center underline" href={item.licenseUrl} target="_blank" rel="noopener noreferrer">{bt("이용조건 원문 ↗", "Terms ↗")}</a> : null}
          <p>{bt("조회", "Retrieved")}: <time dateTime={item.fetchedAt}>{item.fetchedAt.slice(0, 10)}</time></p>
        </details>
        <div className="mt-auto flex flex-wrap gap-2 pt-1">
          <a className={RESOURCE_BUTTON} href={item.sourceUrl} target="_blank" rel="noopener noreferrer" aria-label={bt(`${item.title} 원문 확인 (새 탭)`, `${item.title} — open the source (new tab)`)}>
            {bt("원문 확인 ↗", "Source ↗")}
          </a>
          <button
            type="button"
            className={`${RESOURCE_BUTTON} gap-1.5 ${saved ? "border-accent bg-accent-soft" : ""}`}
            aria-pressed={saved}
            disabled={saveDisabled}
            aria-label={bt(`${item.title} 장면 보드에 담기`, `${item.title} — add to scene board`)}
            onClick={() => onToggleSaved(item)}
          >
            {saved ? <Check size={14} aria-hidden="true" /> : null}{bt("장면 보드에 담기", "Add to board")}
          </button>
          {studioAsset
            ? (
              <button type="button" className={RESOURCE_BUTTON} aria-label={bt(`${item.title} 스튜디오로 보내기`, `${item.title} — send to Studio`)} onClick={() => onSendToStudio(studioAsset)}>
                {bt("스튜디오로 보내기", "Send to Studio")}
              </button>
            )
            : (
              <p className="basis-full text-xs leading-5 text-fg-3">
                {item.license === "reference-only"
                  ? bt("레퍼런스 전용 자료라 스튜디오로 직접 보내지 않아요. 보드에 담아 참고하세요.", "Reference-only material is not sent to Studio directly. Add it to the board as a reference.")
                  : bt("스튜디오로는 CC0 3D·재질 자료만 보낼 수 있어요.", "Only CC0 3D and material items can be sent to Studio.")}
              </p>
            )}
        </div>
      </div>
    </article>
  );
}
