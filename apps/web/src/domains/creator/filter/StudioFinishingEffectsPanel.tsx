/**
 * 원터치 마감 효과 퀵 패널 (효과 그래프 표면)
 *
 * 그래프를 직접 조립하지 않아도 글로우·그림자·부풀림을 토글 한 번으로
 * 출력 직전 체인에 적용하고, 커밋 전에 전/후 렌더 계획 차이를 비교한다.
 * 픽셀 렌더링은 호스트 렌더러 몫이며, 호스트가 renderPreviewUrl을 주면
 * 전/후 이미지를 분할 슬라이더로 겹쳐 보여준다.
 */

import { creatorRestStatusText } from "../creator-rest-status-i18n";
import { Check, Eye, RotateCcw, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

import type { StudioAdjustmentEffectGraph } from "./studio-adjustment-effect-graph";
import {
  STUDIO_FINISHING_EFFECT_PRESETS,
  buildStudioFinishingComparePreview,
  isStudioFinishingEffectApplied,
  toggleStudioFinishingEffect,
  type StudioFinishingEffectId,
} from "./studio-finishing-effects";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

export interface StudioFinishingEffectsPanelProps {
  /** 현재 커밋된 효과 그래프. */
  readonly graph: StudioAdjustmentEffectGraph;
  /** 확정 시 후보 그래프를 한 번에 커밋한다. */
  readonly onCommit?: (nextGraph: StudioAdjustmentEffectGraph) => void;
  /** 호스트 렌더러가 있으면 전/후 미리보기 이미지 URL을 제공한다. */
  readonly renderPreviewUrl?: (graph: StudioAdjustmentEffectGraph) => string | null;
  readonly className?: string;
}

const CHANGE_BADGE: Record<string, { text: string; className: string }> = {
  added: { text: "추가됨", className: "border-accent/45 bg-accent-soft text-fg" },
  removed: { text: "제거됨", className: "border-line bg-raised text-fg-3" },
  updated: { text: "값 복원", className: "border-accent/45 bg-accent-soft text-fg" },
  unchanged: { text: "유지", className: "border-line/60 text-fg-3" },
};

export function StudioFinishingEffectsPanel({
  graph,
  onCommit,
  renderPreviewUrl,
  className,
}: StudioFinishingEffectsPanelProps) {
  // 패널을 연 시점의 그래프를 전(before) 기준으로 고정한다.
  const [baseGraph] = useState<StudioAdjustmentEffectGraph>(graph);
  const [selected, setSelected] = useState<ReadonlySet<StudioFinishingEffectId>>(
    () =>
      new Set(
        STUDIO_FINISHING_EFFECT_PRESETS.filter((preset) =>
          isStudioFinishingEffectApplied(graph, preset.id),
        ).map((preset) => preset.id),
      ),
  );
  const [showCompare, setShowCompare] = useState<boolean>(true);
  const [splitPercent, setSplitPercent] = useState<number>(50);
  const [error, setError] = useState<string | null>(null);
  const [committed, setCommitted] = useState<boolean>(false);

  // 선택 토글을 순서대로 적용한 후보 그래프. 실패하면 직전 그래프와 오류를 유지한다.
  const candidate = useMemo(() => {
    let next = baseGraph;
    try {
      for (const preset of STUDIO_FINISHING_EFFECT_PRESETS) {
        const applied = isStudioFinishingEffectApplied(next, preset.id);
        if (selected.has(preset.id) !== applied) {
          next = toggleStudioFinishingEffect(next, preset.id, `finishing-panel-${preset.id}`);
        }
      }
      return { graph: next, error: null as string | null };
    } catch {
      return { graph: baseGraph, error: creatorRestStatusText("creatorRest.status.finishing.previewFailed", "효과를 붙일 연결이 없어 미리보기를 만들지 못했습니다.") };
    }
  }, [baseGraph, selected]);

  const compare = useMemo(() => {
    try {
      return buildStudioFinishingComparePreview({
        before: baseGraph,
        after: candidate.graph,
        webGpuAvailable: false,
        sourceColorSpace: "srgb",
      });
    } catch {
      return null;
    }
  }, [baseGraph, candidate.graph]);

  const hasChanges = compare
    ? compare.changes.some((item) => item.change !== "unchanged")
    : false;
  const beforeUrl = renderPreviewUrl?.(baseGraph) ?? null;
  const afterUrl = renderPreviewUrl?.(candidate.graph) ?? null;

  const togglePreset = (id: StudioFinishingEffectId) => {
    setCommitted(false);
    setError(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleReset = () => {
    setCommitted(false);
    setError(null);
    setSelected(
      new Set(
        STUDIO_FINISHING_EFFECT_PRESETS.filter((preset) =>
          isStudioFinishingEffectApplied(baseGraph, preset.id),
        ).map((preset) => preset.id),
      ),
    );
  };

  const handleCommit = () => {
    if (!hasChanges || candidate.error) return;
    try {
      onCommit?.(candidate.graph);
      setCommitted(true);
    } catch {
      setError(creatorRestStatusText("creatorRest.status.finishing.applyFailed", "효과 적용에 실패했습니다. 그래프를 확인해 주세요."));
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-line bg-card p-3 text-xs text-fg shadow-sm",
        className,
      )}
      data-testid="studio-finishing-effects-panel"
    >
      <div className="flex items-center justify-between border-b border-line/60 pb-2">
        <div className="flex items-center gap-1.5 font-semibold text-fg-2">
          <Sparkles size={15} className="text-accent" aria-hidden />
          <span>원터치 마감 효과</span>
        </div>
        <button
          type="button"
          onClick={() => setShowCompare(!showCompare)}
          className={buttonClass({
            size: "sm",
            variant: showCompare ? "solid" : "ghost",
            className: cn(
              "h-6 px-2 text-[11px] gap-1",
              showCompare
                ? "border-accent/45 bg-accent-soft text-fg"
                : "text-fg-3 hover:bg-raised hover:text-fg",
            ),
          })}
          title="적용 전과 후를 비교"
        >
          <Eye size={12} />
          <span>{showCompare ? "비교 보기" : "한 화면"}</span>
        </button>
      </div>

      <p className="text-[11px] leading-relaxed text-fg-3">
        마감에 자주 쓰는 효과를 한 번에 켜고 끕니다. 확정하기 전에 아래에서 전/후를
        비교할 수 있습니다.
      </p>

      <div className="grid grid-cols-3 gap-1.5">
        {STUDIO_FINISHING_EFFECT_PRESETS.map((preset) => {
          const isOn = selected.has(preset.id);
          return (
            <button
              key={preset.id}
              type="button"
              aria-pressed={isOn}
              onClick={() => togglePreset(preset.id)}
              title={preset.tip}
              className={cn(
                "flex flex-col items-start gap-0.5 rounded border p-2 text-left transition-colors",
                isOn
                  ? "border-accent/55 bg-accent-soft/35 text-fg"
                  : "border-line/70 bg-panel/45 text-fg-2 hover:bg-raised",
              )}
            >
              <span className="flex w-full items-center justify-between text-[11px] font-medium">
                {preset.label}
                {isOn && <Check size={12} className="text-accent" aria-hidden />}
              </span>
              <span className="text-[10px] leading-snug text-fg-3">{preset.tip}</span>
            </button>
          );
        })}
      </div>

      {showCompare && compare && (
        <div className="flex flex-col gap-2 border-t border-line/60 pt-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-medium text-fg-2">전/후 비교</span>
            <span className="tabular-nums text-fg-3">
              렌더 단계 {compare.beforePlan.steps.length} → {compare.afterPlan.steps.length}
            </span>
          </div>

          {beforeUrl && afterUrl ? (
            <div className="flex flex-col gap-1">
              <div className="relative overflow-hidden rounded-lg border border-line/70">
                <img src={beforeUrl} alt="마감 효과 적용 전" className="block w-full" />
                <img
                  src={afterUrl}
                  alt="마감 효과 적용 후"
                  className="absolute inset-0 block h-full w-full"
                  style={{ clipPath: `inset(0 0 0 ${splitPercent}%)` }}
                />
                <span className="absolute left-1.5 top-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
                  전
                </span>
                <span className="absolute right-1.5 top-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
                  후
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={splitPercent}
                aria-label="전후 비교 위치"
                onChange={(e) => setSplitPercent(Number(e.target.value))}
                className="h-6 w-full cursor-pointer accent-accent"
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1.5">
              <div className="rounded-lg border border-line/70 bg-panel/45 p-2">
                <div className="mb-1 text-[10px] font-medium text-fg-3">전</div>
                <div className="flex flex-wrap gap-1">
                  {STUDIO_FINISHING_EFFECT_PRESETS.map((preset) => (
                    <span
                      key={preset.id}
                      className={cn(
                        "rounded-full border px-1.5 py-0.5 text-[10px]",
                        isStudioFinishingEffectApplied(baseGraph, preset.id)
                          ? "border-accent/45 bg-accent-soft text-fg"
                          : "border-line/60 text-fg-3",
                      )}
                    >
                      {preset.label}
                    </span>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-line/70 bg-panel/45 p-2">
                <div className="mb-1 text-[10px] font-medium text-fg-3">후</div>
                <div className="flex flex-wrap gap-1">
                  {compare.changes.map((item) => (
                    <span
                      key={item.id}
                      className={cn(
                        "rounded-full border px-1.5 py-0.5 text-[10px]",
                        CHANGE_BADGE[item.change].className,
                      )}
                    >
                      {item.label} · {CHANGE_BADGE[item.change].text}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {(error ?? candidate.error) && (
        <p role="alert" className="text-[11px] text-danger">
          {error ?? candidate.error}
        </p>
      )}
      {committed && (
        <p className="text-[11px] text-fg-2">마감 효과를 적용했습니다.</p>
      )}

      <div className="flex items-center justify-end gap-2 border-t border-line/60 pt-2">
        <button
          type="button"
          onClick={handleReset}
          className={buttonClass({
            size: "sm",
            variant: "ghost",
            className: "h-7 gap-1 px-2 text-[11px] text-fg-3 hover:bg-raised hover:text-fg",
          })}
        >
          <RotateCcw size={11} />
          <span>되돌리기</span>
        </button>
        <button
          type="button"
          onClick={handleCommit}
          disabled={!hasChanges || Boolean(candidate.error)}
          className={buttonClass({
            size: "sm",
            variant: "solid",
            className: cn(
              "h-7 px-3 text-[11px] font-medium gap-1.5",
              hasChanges && !candidate.error
                ? "bg-accent text-on-accent hover:bg-accent-2"
                : "cursor-not-allowed bg-raised text-fg-3",
            ),
          })}
        >
          <Check size={13} />
          <span>효과 적용</span>
        </button>
      </div>
    </div>
  );
}
