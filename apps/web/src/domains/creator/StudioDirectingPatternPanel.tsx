/**
 * 연출 패턴 라이브러리 표면 (REPORT C-2).
 *
 * 장면 목적별로 패턴을 고르면 단계(비트 종류·샷 사이즈·예상 높이)를 미리
 * 보여주고, 삽입 버튼 한 번으로 실제 비트 배열을 호스트에 넘긴다.
 * 삽입된 비트는 일반 비트와 동일하므로 이 패널은 삽입 이후를 관여하지
 * 않는다 — 패턴 목록과 미리보기만 담당하는 것이 의도된 경계다.
 * 미리보기 수치는 플래너를 실제로 돌린 결과(previewDirectingPattern)라
 * 삽입 후 플래너가 보여줄 값과 어긋나지 않는다.
 */
import { useMemo, useState, type ReactElement } from "react";

import {
  DIRECTING_BEAT_KIND_LABELS,
  DIRECTING_PATTERNS,
  DIRECTING_SHOT_SIZE_LABELS,
  buildDirectingPatternBeats,
  previewDirectingPattern,
  type DirectingPatternId,
} from "./studio-directing-patterns";
import type { StudioStoryBeat } from "./studio-storyboard-planner";

import { cn } from "@/shared/lib/utils";

export interface StudioDirectingPatternPanelProps {
  /** 삽입될 비트가 속할 장면. 비어 있으면 삽입할 수 없다(호스트가 장면을 먼저 골라야 한다). */
  sceneId: string;
  /** 호스트가 공급하는 다음 order (기존 비트 마지막 order + 1). */
  nextOrder: number;
  characterIds?: readonly string[];
  locationId?: string | null;
  /** 비트 id 접두사. 작품·회차 단위 네임스페이스를 호스트가 정한다. */
  idPrefix?: string;
  /** 삽입 확정 시 완성된 비트 배열을 호스트(비트 상태 소유자)에 넘긴다. */
  onInsert: (beats: readonly StudioStoryBeat[], patternId: DirectingPatternId) => void;
}

export function StudioDirectingPatternPanel({
  sceneId,
  nextOrder,
  characterIds,
  locationId,
  idPrefix,
  onInsert,
}: StudioDirectingPatternPanelProps): ReactElement {
  const [selectedId, setSelectedId] = useState<DirectingPatternId>(DIRECTING_PATTERNS[0]!.id);
  const [lastInsertedId, setLastInsertedId] = useState<DirectingPatternId | null>(null);

  const selected = DIRECTING_PATTERNS.find((pattern) => pattern.id === selectedId) ?? DIRECTING_PATTERNS[0]!;
  const preview = useMemo(() => previewDirectingPattern(selected.id), [selected.id]);
  const canInsert = sceneId.trim().length > 0;

  const handleInsert = (): void => {
    const beats = buildDirectingPatternBeats(selected.id, {
      sceneId,
      startOrder: nextOrder,
      idPrefix,
      characterIds,
      locationId,
    });
    onInsert(beats, selected.id);
    setLastInsertedId(selected.id);
  };

  return (
    <section aria-label="연출 패턴 라이브러리" className="rounded-2xl border border-line bg-card/40 p-3">
      <h3 className="text-xs font-bold text-fg">연출 패턴 라이브러리</h3>
      <p className="mt-1 text-[11px] leading-relaxed text-fg-3">
        장면 목적에 맞는 샷 시퀀스를 비트로 삽입합니다. 삽입한 비트는 일반 비트와
        똑같이 고치고, 지우고, 순서를 바꿀 수 있습니다. 요약 문안은 출발점이니
        자기 장면으로 바꿔 쓰세요.
      </p>

      <div className="mt-2 flex flex-wrap gap-1.5" role="listbox" aria-label="장면 목적">
        {DIRECTING_PATTERNS.map((pattern) => (
          <button
            key={pattern.id}
            type="button"
            role="option"
            aria-selected={pattern.id === selected.id}
            onClick={() => setSelectedId(pattern.id)}
            className={cn(
              "min-h-11 rounded-full border px-3 text-xs",
              pattern.id === selected.id
                ? "border-accent bg-accent/15 text-fg"
                : "border-line bg-black/30 text-fg-2",
            )}
          >
            {pattern.purpose} · {pattern.steps.length}컷
          </button>
        ))}
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-fg-2">{selected.description}</p>

      <ol className="mt-2 space-y-1">
        {selected.steps.map((entry, index) => {
          const shot = preview.shots[index];
          return (
            <li
              key={`${selected.id}-${index}`}
              className="flex items-baseline justify-between gap-2 rounded-lg bg-black/25 px-2 py-1.5 text-[11px]"
            >
              <span className="text-fg-2">
                <span className="font-semibold text-fg">{index + 1}. {DIRECTING_BEAT_KIND_LABELS[entry.kind]}</span>
                {" — "}
                {entry.summary}
              </span>
              {shot ? (
                <span className="shrink-0 text-fg-3">
                  {DIRECTING_SHOT_SIZE_LABELS[shot.shotSize]} · 약 {shot.estimatedHeightPx}px
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[11px] text-fg-3">
          예상 캔버스 높이 약 {preview.estimatedCanvasHeightPx.toLocaleString()}px
        </span>
        <button
          type="button"
          onClick={handleInsert}
          disabled={!canInsert}
          className="min-h-11 rounded-full bg-accent px-4 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          이 패턴으로 {selected.steps.length}컷 삽입
        </button>
      </div>
      {!canInsert ? (
        <p className="mt-1 text-[11px] text-fg-3">삽입할 장면을 먼저 선택하세요.</p>
      ) : null}
      {lastInsertedId === selected.id ? (
        <p className="mt-1 text-[11px] text-fg-2" role="status">
          삽입했습니다. 비트 목록에서 일반 비트처럼 편집할 수 있습니다.
        </p>
      ) : null}
    </section>
  );
}
