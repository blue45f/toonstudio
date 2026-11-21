/**
 * Studio Puppet Warp Panel
 * 퍼펫 워프(핀 메쉬 변형) 인스펙터 — 쉬운 모드(Simple)/전문 모드(Pro) 접근성 + 핀 목록(삭제) + 초기화/적용/취소.
 */
import { r3c07StatusText } from "./studio-panel-status-i18n-r3c07";
import { r44CreatorStatusText } from "./r44-cat1-status-i18n";
import { Check, RotateCcw, Sparkles, Trash2, Waypoints, X } from "lucide-react";
import { useId, useState } from "react";

import { StudioToggleChip } from "./studio-panel-ui";
import { MAX_PUPPET_PINS, type PuppetPin } from "./studio-puppet-warp";

import type { ReactElement } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

export type StudioPuppetWarpEditorMode = "simple" | "pro";

export type StudioPuppetWarpPanelProps = {
  /** 퍼펫 워프 모드 on/off — on 이면 캔버스 클릭으로 핀을 추가하고 드래그로 옮길 수 있다. */
  active: boolean;
  pins: PuppetPin[];
  /** 원본 로드·굽기 진행 중 — 컨트롤 잠금. */
  busy?: boolean;
  /** 적용 가능 여부 — 핀이 없거나 전부 원본 위치 그대로(변형 없음)면 false. */
  canApply?: boolean;
  /** 초기 편집 난이도 모드(Simple: 초보자 안내, Pro: 핀 좌표·이동량 상세 표시). */
  initialMode?: StudioPuppetWarpEditorMode;
  /** 모드 토글(진입/종료) — 진입 시 핀 목록을 비운 새 세션으로 시작한다. */
  onToggle: () => void;
  onRemovePin: (id: string) => void;
  /** 핀은 그대로 두고 전부 원본 위치로 되돌린다(드래그만 취소). */
  onResetPositions: () => void;
  /** 적용 — 현재 핀 배치대로 원본 해상도를 왜곡해 이미지 교체(히스토리 1건). */
  onApply: () => void;
  /** 취소 — 핀 전부 버리고 모드 종료(굽기 없음). */
  onCancel: () => void;
};

export function StudioPuppetWarpPanel({
  active,
  pins,
  busy = false,
  canApply = false,
  initialMode = "simple",
  onToggle,
  onRemovePin,
  onResetPositions,
  onApply,
  onCancel,
}: StudioPuppetWarpPanelProps): ReactElement {
  const statusId = useId();
  const [editorMode, setEditorMode] = useState<StudioPuppetWarpEditorMode>(initialMode);

  const statusText = busy
    ? "퍼펫 워프를 원본 해상도로 적용하는 중입니다. 완료될 때까지 설정을 유지합니다."
    : pins.length === 0
      ? `이미지를 클릭해 핀을 놓으세요(최대 ${MAX_PUPPET_PINS}개). 핀을 드래그하면 주변 메쉬가 함께 움직입니다.`
      : !canApply
        ? "핀을 원본 위치에서 움직여 변형을 만든 뒤 적용하세요."
        : r44CreatorStatusText(
            "r44cat1.creator.puppetWarp.readyStatus",
            "변형을 적용할 준비가 됐습니다. 적용 전까지 원본 픽셀은 바뀌지 않습니다.",
          );

  return (
    <div
      data-studio-puppet-warp-panel="true"
      data-puppet-warp-mode={editorMode}
      className="mt-2.5 space-y-2.5 overflow-hidden rounded-xl border border-line bg-card/55 p-3 break-keep"
    >
      {/* 상단 컬러 스펙트럼 리본 */}
      <div
        aria-hidden="true"
        className="h-1 w-full rounded-full bg-[linear-gradient(90deg,var(--color-accent),var(--color-accent-2),var(--color-cool))]"
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-bold text-fg">
          <Waypoints size={14} className="text-accent" aria-hidden />
          <span>퍼펫 워프</span>
          <span className="rounded-full bg-raised px-2 py-0.5 text-[0.64rem] font-semibold tabular-nums text-fg-2">
            핀 {pins.length}/{MAX_PUPPET_PINS}
          </span>
        </p>
        <StudioToggleChip
          active={active}
          disabled={busy}
          onClick={onToggle}
          title={
            busy
              ? "현재 변형을 적용한 뒤 퍼펫 워프를 종료할 수 있습니다."
              : active
                ? "퍼펫 워프를 끕니다(놓은 핀은 버려집니다)."
                : "퍼펫 워프를 켜고 이미지 위에 핀을 놓아 모양을 변형합니다."
          }
        >
          {active ? "조정 중" : "시작"}
        </StudioToggleChip>
      </div>

      {/* Simple / Pro 접근성 모드 전환 */}
      <div
        role="radiogroup"
        aria-label="퍼펫 워프 편집 모드"
        className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-panel/70 p-1"
      >
        {(
          [
            { id: "simple", label: "쉬운 모드" },
            { id: "pro", label: "전문 모드" },
          ] as const
        ).map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={editorMode === option.id}
            data-studio-puppet-mode={option.id}
            onClick={() => setEditorMode(option.id)}
            className={cn(
              "min-h-11 rounded-lg px-2 text-xs font-semibold transition-[transform,background-color,color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.97] motion-reduce:transition-none motion-reduce:transform-none",
              editorMode === option.id
                ? "bg-accent-soft text-accent"
                : "text-fg-3 hover:bg-raised hover:text-fg",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {active ? (
        <>
          {editorMode === "simple" ? (
            <ol className="grid grid-cols-3 gap-1 rounded-xl bg-panel/60 p-2 text-center text-[0.66rem] text-fg-2">
              <li className={cn("rounded-lg px-1 py-1", pins.length === 0 && "bg-accent-soft font-bold text-accent")}>
                1. 관절 핀 찍기
              </li>
              <li className={cn("rounded-lg px-1 py-1", pins.length > 0 && !canApply && "bg-accent-soft font-bold text-accent")}>
                2. 핀 끌어 변형
              </li>
              <li className={cn("rounded-lg px-1 py-1", canApply && "bg-good/15 font-bold text-good")}>
                3. 적용 확정
              </li>
            </ol>
          ) : null}

          {pins.length === 0 ? (
            <p id={statusId} className="text-[0.72rem] leading-relaxed text-fg-3" role="status">
              {statusText}
            </p>
          ) : (
            <ul className="space-y-1.5" aria-label="배치된 퍼펫 핀 목록">
              {pins.map((p, index) => {
                const moved = p.x !== p.restX || p.y !== p.restY;
                const deltaPx = Math.round(Math.hypot(p.x - p.restX, p.y - p.restY));
                return (
                  <li
                    key={p.id}
                    className="flex items-center gap-1.5 rounded-lg border border-line/60 bg-panel/50 px-2 py-1"
                  >
                    <span className="w-12 shrink-0 text-[0.68rem] font-semibold text-fg-2">
                      핀 {index + 1}
                    </span>
                    <span
                      className={cn(
                        "flex-1 truncate text-[0.68rem] tabular-nums",
                        moved ? "font-semibold text-accent" : "text-fg-3",
                      )}
                    >
                      {editorMode === "pro"
                        ? `${Math.round(p.x)}, ${Math.round(p.y)} (${moved ? `Δ${deltaPx}px` : "고정"})`
                        : moved
                          ? "이동됨"
                          : "원본 위치"}
                    </span>
                    <button
                      type="button"
                      aria-label={`핀 ${index + 1} 삭제`}
                      title="이 핀 삭제"
                      disabled={busy}
                      onClick={() => onRemovePin(p.id)}
                      className="grid size-11 shrink-0 place-items-center rounded-lg border border-line text-fg-3 transition-colors hover:bg-raised hover:text-fg disabled:cursor-not-allowed disabled:opacity-45 sm:size-8 pointer-coarse:size-11"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {pins.length > 0 ? (
            <p id={statusId} className="text-[0.72rem] leading-relaxed text-fg-3" role="status">
              {statusText}
              {!busy && canApply
                ? " 팔다리를 굽히는 정도의 자연스러운 범위를 권장합니다."
                : null}
              {" 잘못 놓은 핀은 캔버스에서 Alt(Option)+클릭으로 바로 지울 수 있어요."}
            </p>
          ) : null}

          <div className="flex items-center gap-1.5 border-t border-line/50 pt-2">
            <button
              type="button"
              onClick={onApply}
              disabled={busy || !canApply}
              aria-describedby={statusId}
              className={cn(
                buttonClass({ size: "sm", variant: "solid" }),
                "min-h-11 flex-1 gap-1 active:scale-[0.97] motion-reduce:transform-none sm:min-h-9 pointer-coarse:min-h-11",
              )}
              title={
                busy
                  ? "현재 변형을 적용하는 중입니다."
                  : !canApply
                    ? pins.length === 0
                      ? "이미지에 핀을 먼저 놓으세요."
                      : "핀을 원본 위치에서 움직인 뒤 적용하세요."
                    : "지금 핀 배치대로 이미지를 원본 해상도로 왜곡해 반영합니다(⌘Z 복구 가능)."
              }
            >
              <Check className="size-3.5" aria-hidden />
              {busy ? "적용 중..." : "적용"}
            </button>
            <button
              type="button"
              onClick={onResetPositions}
              disabled={busy || pins.length === 0}
              aria-describedby={statusId}
              className={buttonClass({
                size: "sm",
                variant: "quiet",
                className: "min-h-11 sm:min-h-9 pointer-coarse:min-h-11",
              })}
              title={
                busy
                  ? "현재 변형을 적용하는 중입니다."
                  : pins.length === 0
                    ? r3c07StatusText(
                        "studio.panelStatus.r3c07.puppetWarp.noPinsToReset",
                        "되돌릴 핀이 아직 없습니다.",
                      )
                    : "핀은 그대로 두고 전부 원본 위치로 되돌립니다."
              }
            >
              <RotateCcw className="size-3.5" aria-hidden />
              초기화
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className={buttonClass({
                size: "sm",
                variant: "quiet",
                className: "min-h-11 sm:min-h-9 pointer-coarse:min-h-11",
              })}
              title="핀을 전부 버리고 퍼펫 워프를 종료합니다(Esc)."
            >
              <X className="size-3.5" aria-hidden />
              취소
            </button>
          </div>
        </>
      ) : (
        <div className="flex items-start gap-2 rounded-xl bg-panel/50 p-2.5 text-[0.72rem] leading-relaxed text-fg-2">
          <Sparkles size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
          <p>
            {editorMode === "simple"
              ? "시작을 누른 뒤 캐릭터 팔·다리 관절에 핀을 찍어 부드럽게 포즈를 조정해 보세요. 적용 전까지 원본은 바뀌지 않습니다."
              : "시작을 누르면 이미지 위에 메쉬 제어 핀을 배치하고 좌표·변위량(px)을 보며 정밀 변형할 수 있습니다."}
          </p>
        </div>
      )}
    </div>
  );
}
