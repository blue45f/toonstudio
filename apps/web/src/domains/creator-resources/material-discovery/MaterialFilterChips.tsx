import { HorizontalScrollRail } from "@/shared/components/HorizontalScrollRail";

import type { MaterialKind, MaterialProvider } from "../material-atlas/model";
import { MATERIAL_KINDS, MATERIAL_PROVIDERS } from "../material-atlas/model";
import "./material-discovery.css";

interface Props {
  provider: MaterialProvider | "all";
  kind: MaterialKind | "all";
  counts: { provider: Record<string, number>; kind: Record<string, number> };
  onProvider: (value: MaterialProvider | "all") => void;
  onKind: (value: MaterialKind | "all") => void;
}

/**
 * 원클릭 필터 칩. 기존 select와 동일한 값을 URL 파라미터로 유지한다.
 * 좁은 화면·모바일·일반 휠 마우스에서도 가로 레일로 매끄럽게 탐색할 수 있다.
 */
export function MaterialFilterChips({ provider, kind, counts, onProvider, onKind }: Props) {
  const providerOptions: Array<{ value: MaterialProvider | "all"; label: string }> = [
    { value: "all", label: "모든 제공처" },
    ...(Object.keys(MATERIAL_PROVIDERS) as MaterialProvider[]).map((id) => ({
      value: id as MaterialProvider | "all",
      label: MATERIAL_PROVIDERS[id].name,
    })),
  ];
  const kindOptions: Array<{ value: MaterialKind | "all"; label: string }> = [
    { value: "all", label: "모든 종류" },
    ...(Object.keys(MATERIAL_KINDS) as MaterialKind[]).map((id) => ({
      value: id as MaterialKind | "all",
      label: MATERIAL_KINDS[id],
    })),
  ];

  return (
    <div className="grid gap-3">
      <div className="min-w-0">
        <p id="md-provider-label" className="text-sm font-semibold">
          제공처
        </p>
        <HorizontalScrollRail
          trackRole="group"
          ariaLabelledBy="md-provider-label"
          prevLabel="이전 제공처 필터 보기"
          nextLabel="다음 제공처 필터 보기"
          showHint={false}
          showProgress
          className="md-chip-rail mt-2"
          trackClassName="md-chips"
        >
          {providerOptions.map((option) => (
            <button
              type="button"
              key={option.value}
              className="md-chip"
              aria-pressed={provider === option.value}
              onClick={() => onProvider(option.value)}
            >
              {option.label}
              {option.value !== "all" && counts.provider[option.value] !== undefined ? (
                <small>{counts.provider[option.value]}</small>
              ) : null}
            </button>
          ))}
        </HorizontalScrollRail>
      </div>

      <div className="min-w-0">
        <p id="md-kind-label" className="text-sm font-semibold">
          소재 종류
        </p>
        <HorizontalScrollRail
          trackRole="group"
          ariaLabelledBy="md-kind-label"
          prevLabel="이전 소재 종류 필터 보기"
          nextLabel="다음 소재 종류 필터 보기"
          hintText="마우스 휠·드래그로 필터 칩 가로 이동"
          showHint
          showProgress
          className="md-chip-rail mt-2"
          trackClassName="md-chips"
        >
          {kindOptions.map((option) => (
            <button
              type="button"
              key={option.value}
              className="md-chip"
              aria-pressed={kind === option.value}
              onClick={() => onKind(option.value)}
            >
              {option.label}
              {option.value !== "all" && counts.kind[option.value] !== undefined ? (
                <small>{counts.kind[option.value]}</small>
              ) : null}
            </button>
          ))}
        </HorizontalScrollRail>
      </div>
    </div>
  );
}
