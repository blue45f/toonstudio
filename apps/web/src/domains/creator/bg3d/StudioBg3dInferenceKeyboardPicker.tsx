/**
 * 키보드 점 고르기 — 포인터 없이도 가까운 끝점·중간점·중심을 목록에서 골라 같은 결과에 도달한다.
 *
 * 줄자의 시작/끝점, 벽 시작점처럼 "어느 점을 찍을까"를 포인터 대신 목록 + 방향키 + Enter로 정한다.
 * 이어서 방향키 축 잠금과 길이 입력(VCB)을 쓰면 마우스로 한 것과 같은 정확한 측정이 된다.
 * 목록은 ARIA listbox이며 방향키를 스스로 소유한다(세션의 축 잠금 키 라우팅이 가로채지 않는다).
 */

import { useEffect, useId, useRef, useState } from "react";

import { StudioBg3dInferenceMarker } from "./StudioBg3dInferenceMarker";
import { formatStudioBg3dMeasurementLength } from "./studio-bg3d-measurement";

import type { KeyboardEvent, MouseEvent } from "react";

import type {
  StudioBg3dInferencePickCandidate,
  StudioBg3dInferenceService,
} from "./studio-bg3d-inference-service";
import type { StudioBg3dInferenceVec3 } from "./studio-bg3d-inference-math";
import type { StudioBg3dInferenceResult } from "./studio-bg3d-inference-types";
import type { StudioBg3dMeasurementUnit } from "./studio-bg3d-measurement";

const DEFAULT_LIMIT = 12;

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export interface StudioBg3dInferenceKeyboardPickerProps {
  readonly service: StudioBg3dInferenceService;
  readonly unit: StudioBg3dMeasurementUnit;
  readonly onPick: (point: StudioBg3dInferenceVec3, result: StudioBg3dInferenceResult) => void;
  readonly limit?: number;
}

export function StudioBg3dInferenceKeyboardPicker({
  service,
  unit,
  onPick,
  limit = DEFAULT_LIMIT,
}: StudioBg3dInferenceKeyboardPickerProps) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  // 서비스가 같은 색인·기준·개수의 결과를 캐시하므로 렌더마다 불러도 정렬을 되풀이하지 않는다.
  const candidates: readonly StudioBg3dInferencePickCandidate[] = open ? service.listPickCandidates(limit) : [];
  const hasCandidates = candidates.length > 0;
  useEffect(() => {
    // 목록이 그려진 뒤 포커스를 옮겨 방향키 탐색을 바로 시작한다.
    if (open && hasCandidates) listRef.current?.focus();
  }, [open, hasCandidates]);
  const safeIndex = candidates.length === 0 ? 0 : Math.min(activeIndex, candidates.length - 1);
  const optionId = (index: number) => `${listId}-option-${index}`;

  const choose = (candidate: StudioBg3dInferencePickCandidate | undefined) => {
    if (!candidate) return;
    const result = service.pickCandidate(candidate);
    onPick(candidate.point, result);
  };

  /** 옵션별 핸들러 대신 목록에서 위임해 처리한다 — 키보드 처리가 목록 하나에 모인다. */
  const handleClick = (event: MouseEvent<HTMLUListElement>) => {
    const option = (event.target as HTMLElement).closest<HTMLElement>("[data-option-index]");
    const index = option ? Number(option.dataset["optionIndex"]) : Number.NaN;
    if (!Number.isInteger(index)) return;
    setActiveIndex(index);
    choose(candidates[index]);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (candidates.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((safeIndex + 1) % candidates.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((safeIndex - 1 + candidates.length) % candidates.length);
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(candidates.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(candidates[safeIndex]);
    }
  };

  return (
    <div className="grid gap-1.5">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        className="inline-flex min-h-11 items-center justify-between gap-2 rounded-lg border border-line bg-panel px-3 text-xs font-semibold text-fg-2 transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:min-h-9"
        onClick={() => {
          if (!open) setActiveIndex(0);
          setOpen(!open);
        }}
      >
        <span>키보드로 점 고르기</span>
        <span aria-hidden="true" className="text-fg-3">{open ? "접기" : "펼치기"}</span>
      </button>
      <div id={listId} hidden={!open}>
        {open ? (
          candidates.length === 0 ? (
            <p role="status" className="rounded-lg border border-dashed border-line px-3 py-2 text-[0.68rem] text-fg-3">
              고를 수 있는 점이 없습니다. 장면에 객체를 놓으면 끝점·중간점·중심이 여기에 나타납니다.
            </p>
          ) : (
            <ul
              ref={listRef}
              role="listbox"
              tabIndex={0}
              aria-label="가까운 스냅 점 목록"
              aria-activedescendant={optionId(safeIndex)}
              data-bg3d-arrow-owner="true"
              className="max-h-44 overflow-y-auto rounded-lg border border-line bg-panel p-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              onKeyDown={handleKeyDown}
              onClick={handleClick}
              onMouseDown={(event) => event.preventDefault()}
            >
              {candidates.map((candidate, index) => {
                const selected = index === safeIndex;
                const distance = formatStudioBg3dMeasurementLength(candidate.distanceMeters, unit);
                return (
                  <li
                    key={candidate.id}
                    id={optionId(index)}
                    role="option"
                    data-option-index={index}
                    aria-selected={selected}
                    className={cx(
                      "flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 text-xs sm:min-h-8",
                      selected ? "bg-accent-soft text-fg" : "text-fg-2 hover:bg-raised",
                    )}
                  >
                    <StudioBg3dInferenceMarker kind={candidate.kind} size={16} />
                    <span className="min-w-0 flex-1 truncate font-semibold">{candidate.label}</span>
                    <span className="shrink-0 tabular-nums text-fg-3">{distance ?? "—"}</span>
                  </li>
                );
              })}
            </ul>
          )
        ) : null}
      </div>
      <p className="text-[0.62rem] leading-relaxed text-fg-3">
        목록에서 ↑↓로 이동하고 Enter로 점을 정합니다. 이어서 방향키로 축을 잠그고 길이를 입력하세요.
      </p>
    </div>
  );
}
