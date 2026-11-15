import { ArrowRight } from "lucide-react";

export function StudioProjectCenterDisabledGuidance({
  sectionLabel,
  description,
  hasFileControl,
  onOpenSection,
  onOpenFileControl,
}: {
  readonly sectionLabel: string;
  readonly description: string;
  readonly hasFileControl: boolean;
  readonly onOpenSection: () => void;
  readonly onOpenFileControl: () => void;
}) {
  return (
    <div
      data-project-center-disabled-guidance="true"
      className="col-span-full border-t border-line/60 bg-panel/45 px-3 py-2 text-[0.6rem]"
    >
      <p data-search-unavailable-reason="true" className="leading-relaxed text-fg-2">
        이유: 현재 프로젝트 문서·저장 상태에서 바로 사용할 수 없습니다 ({description || sectionLabel}).
      </p>
      <p data-search-required-mode="true" className="mt-0.5 font-semibold text-accent">
        필요 모드: 활성 프로젝트 문서 저장·준비 완료 상태 ({sectionLabel})
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          data-project-keep-open
          data-project-center-control="true"
          data-search-alternative-action="true"
          onClick={onOpenSection}
          className="inline-flex min-h-7 items-center gap-1 rounded-md border border-accent/50 bg-accent-soft px-2 py-0.5 font-semibold text-accent hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          <span>{sectionLabel} 구획에서 조건 확인</span>
          <ArrowRight size={11} aria-hidden />
        </button>
        {hasFileControl ? (
          <button
            type="button"
            data-project-keep-open
            data-project-center-control="true"
            data-search-alternative-action="true"
            onClick={onOpenFileControl}
            className="inline-flex min-h-7 items-center gap-1 rounded-md border border-line bg-card px-2 py-0.5 font-semibold text-fg-2 hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <span>파일 제어 열기</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
