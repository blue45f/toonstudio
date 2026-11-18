/**
 * Studio Smudge Panel
 * 문지르기 브러시 컨트롤 — 켜면 메인 캔버스에서 선택된 이미지 위 드래그가 문지르기 스트로크로
 * 처리된다. 이 패널 자신은 드래그도 픽셀 블렌드도 하지 않는 순수 컨트롤(무장 토글 + 브러시
 * 크기·강도 슬라이더)이다 — 실제 스트로크 수집·비동기 블렌드 적용은 StudioPage 의
 * onStageDown/onStageMove/onStageUp/applySmudgeStroke 가 담당한다(크롭·마술봉과 동일하게
 * "패널은 상태만 보여주고 캔버스 제스처는 상위가 처리").
 *
 * 실시간 픽셀 미리보기는 없다 — 브러시 반경 커서만 드래그 중 표시되고, 실제 블렌드는 드래그(한
 * 스트로크) 종료 시 한 번에 적용된다(crop/픽셀 조정과 동일한 "제스처 1회 = 커밋 1회" 관례).
 */
import { Blend } from "lucide-react";
import { useId, useState } from "react";

import {
  DEFAULT_STUDIO_BLEND_REFER_OPTIONS,
  normalizeStudioBlendReferOptions,
  type StudioBlendBrushSubMode,
  type StudioBlendReferLayerOptions,
} from "./brush/studio-blend-refer-layer";
import { StudioSliderRow, StudioToggleChip } from "./studio-panel-ui";
import { studioRetouchToolHelp } from "./studio-retouch-help";
import { SMUDGE_RADIUS_RANGE, SMUDGE_STRENGTH_RANGE } from "./studio-smudge";
import { StudioRetouchQuickGuide } from "./StudioRetouchQuickGuide";

import type { ReactElement } from "react";

export type StudioSmudgePanelProps = {
  /** 문지르기 브러시가 무장(켜짐) 상태인지. */
  active: boolean;
  /** 브러시 반경(캔버스 표시 px, SMUDGE_RADIUS_RANGE). */
  radius: number;
  /** 문지름 강도(%, SMUDGE_STRENGTH_RANGE). */
  strength: number;
  /** 스트로크 커밋(픽셀 재인코딩) 진행 중 — 다른 픽셀 도구와 동일 관례로 잠그지 않고 표시만. */
  busy?: boolean;
  /** 문서 잠금 등 상위 게이트 — 제공되면 패널 전체를 잠그고 복구 안내를 표시한다. */
  disabled?: boolean;
  onToggleActive: () => void;
  onRadiusChange: (value: number) => void;
  onStrengthChange: (value: number) => void;
  onOpenTutorial?: () => void;
  /** 선택적 CSP 5.1.5 색 섞기 서브모드(문지르기/흐리기/선명화) 및 타 레이어 참조 설정. */
  blendOptions?: Partial<StudioBlendReferLayerOptions> | null;
  onBlendOptionsChange?: (next: StudioBlendReferLayerOptions) => void;
};

export function StudioSmudgePanel({
  active,
  radius,
  strength,
  busy = false,
  disabled = false,
  onToggleActive,
  onRadiusChange,
  onStrengthChange,
  onOpenTutorial,
  blendOptions,
  onBlendOptionsChange,
}: StudioSmudgePanelProps): ReactElement {
  const titleId = useId();
  const help = studioRetouchToolHelp("smudge");
  const locked = busy || disabled;
  const [fallbackBlend, setFallbackBlend] = useState<StudioBlendReferLayerOptions>(
    DEFAULT_STUDIO_BLEND_REFER_OPTIONS,
  );
  const resolvedBlend = normalizeStudioBlendReferOptions(
    blendOptions ?? fallbackBlend,
  );
  const commitBlendOptions = (next: StudioBlendReferLayerOptions): void => {
    if (blendOptions === undefined) {
      setFallbackBlend(next);
    }
    onBlendOptionsChange?.(next);
  };

  return (
    <section
      className="mt-2.5 space-y-2 rounded-xl border border-line bg-card/45 p-2.5"
      aria-labelledby={titleId}
    >
      <div className="min-w-0">
        <h3
          id={titleId}
          aria-label={`${help.actionName} · ${help.technicalName}`}
          className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs font-semibold tracking-tight text-fg-2"
        >
          <Blend size={12} aria-hidden />
          {help.actionName}
          <span className="text-[0.66rem] font-medium text-fg-3">{help.technicalName}</span>
        </h3>
        <p className="mt-0.5 text-[0.68rem] leading-relaxed text-fg-3 text-pretty">
          {help.summary}
        </p>
      </div>

      <StudioToggleChip
        active={active}
        disabled={locked}
        onClick={onToggleActive}
        aria-label={`${help.actionName} ${active ? "끄기" : "켜기"}`}
        title={
          busy
            ? help.busyMessage
            : `${help.summary} 결과는 손을 뗄 때 한 획으로 반영됩니다.`
        }
      >
        <span className="inline-flex items-center gap-1">
          <Blend className="size-3" aria-hidden />
          {active ? "색 밀기 끝내기" : "색 밀기 시작"}
        </span>
      </StudioToggleChip>

      <StudioSliderRow
        label="브러시 크기"
        min={SMUDGE_RADIUS_RANGE.min}
        max={SMUDGE_RADIUS_RANGE.max}
        step={SMUDGE_RADIUS_RANGE.step}
        value={radius}
        disabled={locked}
        onChange={onRadiusChange}
        readout={`${radius}px`}
      />

      <StudioSliderRow
        label="밀기 강도"
        min={SMUDGE_STRENGTH_RANGE.min}
        max={SMUDGE_STRENGTH_RANGE.max}
        step={SMUDGE_STRENGTH_RANGE.step}
        value={strength}
        disabled={locked}
        onChange={onStrengthChange}
        readout={`${strength}%`}
      />

      <details
        data-studio-blend-refer-options="true"
        className="rounded-lg border border-line/65 bg-canvas/50 px-2.5 py-1.5 text-xs [word-break:keep-all]"
      >
        <summary className="flex min-h-11 cursor-pointer items-center justify-between font-semibold text-fg-2">
          <span>섞기 방식 · 다른 레이어 색 참조</span>
          <span className="text-[0.65rem] text-fg-3">
            {resolvedBlend.subMode === "blur"
              ? "흐리기"
              : resolvedBlend.subMode === "sharpen"
                ? "선명화"
                : "문지르기"}
          </span>
        </summary>
        <div className="space-y-2 border-t border-line/50 pt-2">
          <label className="flex min-h-11 items-center justify-between gap-2">
            <span className="text-fg-2">브러시 동작</span>
            <select
              aria-label="브러시 동작"
              disabled={locked}
              value={resolvedBlend.subMode}
              onChange={(e) =>
                commitBlendOptions({
                  ...resolvedBlend,
                  subMode: e.target.value as StudioBlendBrushSubMode,
                })
              }
              className="min-h-11 rounded-lg border border-line bg-card px-2 text-xs text-fg disabled:opacity-50"
            >
              <option value="smudge">문질러 색 밀기</option>
              <option value="blur">경계 부드럽게 흐리기</option>
              <option value="sharpen">경계 또렷하게 살리기</option>
            </select>
          </label>
          <label className="flex min-h-11 cursor-pointer items-center justify-between gap-2">
            <span className="text-fg-2">보이는 다른 레이어 색 함께 참조</span>
            <input
              type="checkbox"
              aria-label="보이는 다른 레이어 색 함께 참조"
              disabled={locked}
              checked={resolvedBlend.referVisibleLayers}
              onChange={(e) =>
                commitBlendOptions({
                  ...resolvedBlend,
                  referVisibleLayers: e.target.checked,
                })
              }
              className="size-4 accent-accent disabled:opacity-50"
            />
          </label>
        </div>
      </details>

      <StudioRetouchQuickGuide
        toolId="smudge"
        active={active}
        busy={busy}
        disabled={disabled}
        onOpenTutorial={onOpenTutorial}
      />
    </section>
  );
}
