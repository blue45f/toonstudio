import { ArrowRight, Search } from "lucide-react";

import { requestStudioCommandSearch } from "../studio-help-center-channel";

import { useAllToolsCrossSurfaceMatches } from "./studio-command-search-unavailability";

export function StudioAllToolsCrossSurfaceGuidance({
  query,
  onUsed,
}: {
  readonly query: string;
  readonly onUsed: () => void;
}) {
  const matches = useAllToolsCrossSurfaceMatches(query);
  if (matches.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="다른 메뉴·인스펙터에 있는 관련 기능 안내"
      data-unavailable-in-document="true"
      className="space-y-2 rounded-xl border border-accent/35 bg-accent-soft/40 p-3 text-xs text-fg"
    >
      <p className="font-semibold text-fg">
        좌측 도구막대에는 없지만 메뉴·인스펙터에 있는 기능 {matches.length}건을 찾았습니다.
      </p>
      <p
        data-search-unavailable-reason="true"
        className="text-[0.72rem] leading-relaxed text-fg-2"
      >
        이유: 이 항목은 좌측 도구 전환 아이콘이 아니라 상단 메뉴 명령 또는 우측 인스펙터 설정입니다.
      </p>
      <p
        data-search-required-mode="true"
        className="text-[0.7rem] font-semibold text-accent"
      >
        필요 모드: 통합 기능·설정 검색(⌘K / F1) 또는 인스펙터 설정 패널
      </p>
      <ul className="space-y-1 text-[0.7rem] text-fg-2">
        {matches.map(({ entry }) => (
          <li key={entry.id} className="truncate">
            · <strong className="font-semibold text-fg">{entry.label}</strong> ({entry.location})
          </li>
        ))}
      </ul>
      <button
        type="button"
        data-search-alternative-action="true"
        onClick={() => {
          onUsed();
          requestStudioCommandSearch({ scope: "all", query: query.trim() });
        }}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-accent bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent hover:opacity-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        <Search size={13} aria-hidden />
        <span>통합 기능·설정 검색에서 “{query.trim()}” 열기</span>
        <ArrowRight size={13} aria-hidden />
      </button>
    </div>
  );
}

export function StudioAllToolsDisabledItemGuidance({
  toolLabel,
  unavailableReason,
  onUsed,
}: {
  readonly toolLabel: string;
  readonly unavailableReason?: string;
  readonly onUsed: () => void;
}) {
  return (
    <div
      data-all-tools-disabled-guidance="true"
      className="col-span-full ml-8 pb-2 pr-2 text-xs"
    >
      <p
        data-search-unavailable-reason="true"
        className="text-[0.7rem] leading-relaxed text-fg-2"
      >
        이유: {unavailableReason ?? "현재 선택한 요소나 레이어 편집 조건이 맞지 않아 비활성 상태입니다."}
      </p>
      <p
        data-search-required-mode="true"
        className="mt-0.5 text-[0.68rem] font-semibold text-accent"
      >
        필요 모드: 편집 가능한 레이어·대상 선택 상태
      </p>
      <button
        type="button"
        data-search-alternative-action="true"
        onClick={() => {
          onUsed();
          requestStudioCommandSearch({ scope: "all", query: toolLabel });
        }}
        className="mt-1 inline-flex min-h-8 items-center gap-1 rounded-md border border-line bg-card px-2.5 py-1 text-[0.68rem] font-semibold text-fg-2 hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        <span>통합 검색에서 사용 조건·대안 보기</span>
        <ArrowRight size={12} aria-hidden />
      </button>
    </div>
  );
}
