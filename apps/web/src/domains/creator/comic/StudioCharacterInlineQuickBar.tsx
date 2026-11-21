/**
 * Tooning Plus 1클릭 인라인 캐릭터 컷툰 스위처.
 *
 * 캔버스 위 캐릭터 요소를 선택하면 상단 인라인 퀵바가 나타나며,
 * 표정 12종 · 포즈 10종 · 좌우반전 · 의상 교체를 팝오버에서 1클릭으로 즉시 전환한다.
 * Calm 5대 핵심 액션 예산과 44px 터치 타깃, OKLCH 시맨틱 토큰을 준수하는 독립 `React.lazy` 모듈이다.
 */

import { FlipHorizontal2, PersonStanding, RotateCcw, Shirt, Smile, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { cn } from "@/shared/lib/utils";

import type { ReactElement } from "react";

export type CharacterExpressionId =
  | "neutral"
  | "happy"
  | "shy"
  | "surprised"
  | "angry"
  | "sad"
  | "flustered"
  | "smug"
  | "tired"
  | "sparkle"
  | "suspicious"
  | "blank";

export type CharacterPoseId =
  | "standing"
  | "wave"
  | "arms-crossed"
  | "pointing"
  | "cheer"
  | "thinking"
  | "running"
  | "sitting"
  | "bow"
  | "look-back";

export interface CharacterOutfitOption {
  readonly id: string;
  readonly labelKo: string;
  readonly categoryKo: string;
}

export interface CharacterInlineQuickState {
  readonly characterId: string;
  readonly characterName: string;
  readonly expressionId: CharacterExpressionId;
  readonly poseId: CharacterPoseId;
  readonly outfitId: string;
  readonly flipX: boolean;
}

export interface StudioCharacterInlineQuickBarProps {
  readonly state: CharacterInlineQuickState;
  readonly outfits?: readonly CharacterOutfitOption[];
  /** 캔버스 앵커 좌표(지정 시 절대 위치 플로팅, 생략 시 인라인 배치). */
  readonly anchor?: { readonly leftPx: number; readonly topPx: number } | null;
  readonly disabled?: boolean;
  readonly onChangeExpression: (expressionId: CharacterExpressionId) => void;
  readonly onChangePose: (poseId: CharacterPoseId) => void;
  readonly onChangeOutfit: (outfitId: string) => void;
  readonly onToggleFlipX: (nextFlipX: boolean) => void;
  readonly onReset?: () => void;
  readonly className?: string;
}

type PopoverKind = "expression" | "pose" | "outfit" | null;

const EXPRESSION_CATALOG: readonly {
  readonly id: CharacterExpressionId;
  readonly labelKo: string;
  readonly nuanceKo: string;
}[] = Object.freeze([
  { id: "neutral", labelKo: "기본", nuanceKo: "담담한 일상 톤" },
  { id: "happy", labelKo: "활짝 웃음", nuanceKo: "밝은 긍정 리액션" },
  { id: "shy", labelKo: "수줍은 미소", nuanceKo: "볼 붉힘·설렘" },
  { id: "surprised", labelKo: "깜짝 놀람", nuanceKo: "눈 크게·충격" },
  { id: "angry", labelKo: "버럭 분노", nuanceKo: "눈썹 찡그림·강조" },
  { id: "sad", labelKo: "눈물 슬픔", nuanceKo: "울먹임·상심" },
  { id: "flustered", labelKo: "식은땀 당황", nuanceKo: "어쩔 줄 모름" },
  { id: "smug", labelKo: "의기양양", nuanceKo: "자신만만·장난기" },
  { id: "tired", labelKo: "지침 피곤", nuanceKo: "다크서클·탈진" },
  { id: "sparkle", labelKo: "반짝 설렘", nuanceKo: "기대감·동경" },
  { id: "suspicious", labelKo: "의심 째려봄", nuanceKo: "반신반의 시선" },
  { id: "blank", labelKo: "멍함", nuanceKo: "정적·무표정 개그" },
]);

const POSE_CATALOG: readonly {
  readonly id: CharacterPoseId;
  readonly labelKo: string;
  readonly tagKo: string;
}[] = Object.freeze([
  { id: "standing", labelKo: "기본 서기", tagKo: "정면" },
  { id: "wave", labelKo: "손 흔들기", tagKo: "인사" },
  { id: "arms-crossed", labelKo: "팔짱 끼기", tagKo: "단호" },
  { id: "pointing", labelKo: "손가락 가리키기", tagKo: "설명" },
  { id: "cheer", labelKo: "양손 번쩍", tagKo: "환호" },
  { id: "thinking", labelKo: "턱 괴고 고민", tagKo: "추리" },
  { id: "running", labelKo: "달리기", tagKo: "역동" },
  { id: "sitting", labelKo: "의자 앉기", tagKo: "대화" },
  { id: "bow", labelKo: "고개 숙여 인사", tagKo: "예의" },
  { id: "look-back", labelKo: "뒤돌아보기", tagKo: "여운" },
]);

const DEFAULT_OUTFITS: readonly CharacterOutfitOption[] = Object.freeze([
  { id: "casual-daily", labelKo: "일상 캐주얼", categoryKo: "데일리" },
  { id: "school-summer", labelKo: "교복 하복", categoryKo: "학원" },
  { id: "office-suit", labelKo: "오피스 정장", categoryKo: "직장" },
  { id: "tracksuit", labelKo: "트레이닝복", categoryKo: "홈웨어" },
  { id: "fantasy-dress", labelKo: "로판 드레스", categoryKo: "판타지" },
  { id: "winter-coat", labelKo: "겨울 코트", categoryKo: "계절" },
]);

const TRANSITION_CLASS =
  "transition-[background-color,border-color,color,transform] duration-150 motion-reduce:transition-none";

const BAR_BUTTON_CLASS = cn(
  "inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold [word-break:keep-all] enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45",
  TRANSITION_CLASS,
);

const OPTION_TILE_CLASS = cn(
  "flex min-h-11 flex-col items-start justify-center rounded-lg border px-2.5 py-1.5 text-left [word-break:keep-all] enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45",
  TRANSITION_CLASS,
);

export function StudioCharacterInlineQuickBar({
  state,
  outfits,
  anchor = null,
  disabled = false,
  onChangeExpression,
  onChangePose,
  onChangeOutfit,
  onToggleFlipX,
  onReset,
  className,
}: StudioCharacterInlineQuickBarProps): ReactElement {
  const [openPopover, setOpenPopover] = useState<PopoverKind>(null);
  const outfitList = outfits && outfits.length > 0 ? outfits : DEFAULT_OUTFITS;

  const activeExpressionLabel =
    EXPRESSION_CATALOG.find((item) => item.id === state.expressionId)?.labelKo ?? "기본";
  const activePoseLabel =
    POSE_CATALOG.find((item) => item.id === state.poseId)?.labelKo ?? "기본 서기";
  const activeOutfitLabel =
    outfitList.find((item) => item.id === state.outfitId)?.labelKo ?? outfitList[0]?.labelKo ?? "기본 의상";

  useEffect(() => {
    if (!openPopover) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenPopover(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [openPopover]);

  const togglePopover = useCallback(
    (target: Exclude<PopoverKind, null>) => {
      if (disabled) return;
      setOpenPopover((prev) => (prev === target ? null : target));
    },
    [disabled],
  );

  const handleSelectExpression = useCallback(
    (id: CharacterExpressionId) => {
      onChangeExpression(id);
      setOpenPopover(null);
    },
    [onChangeExpression],
  );

  const handleSelectPose = useCallback(
    (id: CharacterPoseId) => {
      onChangePose(id);
      setOpenPopover(null);
    },
    [onChangePose],
  );

  const handleSelectOutfit = useCallback(
    (id: string) => {
      onChangeOutfit(id);
      setOpenPopover(null);
    },
    [onChangeOutfit],
  );

  return (
    <div
      data-testid="studio-character-inline-quick-bar"
      style={
        anchor
          ? {
              position: "absolute",
              left: `${anchor.leftPx}px`,
              top: `${anchor.topPx}px`,
            }
          : undefined
      }
      className={cn("relative z-30 inline-flex flex-col items-start gap-2 [word-break:keep-all]", className)}
    >
      {/* 5대 핵심 액션 인라인 툴바 */}
      <div
        role="toolbar"
        aria-label={`${state.characterName} 인라인 캐릭터 스위처`}
        className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-line bg-panel/95 p-2 shadow-sm"
      >
        <span className="inline-flex min-h-11 items-center rounded-lg border border-line bg-raised px-2.5 text-xs font-semibold text-fg">
          {state.characterName}
        </span>

        <button
          type="button"
          disabled={disabled}
          aria-expanded={openPopover === "expression"}
          aria-controls="character-quick-popover-expression"
          onClick={() => togglePopover("expression")}
          className={cn(
            BAR_BUTTON_CLASS,
            openPopover === "expression"
              ? "border-accent bg-accent text-on-accent"
              : "border-line bg-card text-fg hover:bg-raised",
          )}
        >
          <Smile size={15} aria-hidden />
          <span>표정 · {activeExpressionLabel}</span>
        </button>

        <button
          type="button"
          disabled={disabled}
          aria-expanded={openPopover === "pose"}
          aria-controls="character-quick-popover-pose"
          onClick={() => togglePopover("pose")}
          className={cn(
            BAR_BUTTON_CLASS,
            openPopover === "pose"
              ? "border-accent bg-accent text-on-accent"
              : "border-line bg-card text-fg hover:bg-raised",
          )}
        >
          <PersonStanding size={15} aria-hidden />
          <span>포즈 · {activePoseLabel}</span>
        </button>

        <button
          type="button"
          disabled={disabled}
          aria-expanded={openPopover === "outfit"}
          aria-controls="character-quick-popover-outfit"
          onClick={() => togglePopover("outfit")}
          className={cn(
            BAR_BUTTON_CLASS,
            openPopover === "outfit"
              ? "border-accent bg-accent text-on-accent"
              : "border-line bg-card text-fg hover:bg-raised",
          )}
        >
          <Shirt size={15} aria-hidden />
          <span>의상 · {activeOutfitLabel}</span>
        </button>

        <button
          type="button"
          disabled={disabled}
          aria-pressed={state.flipX}
          onClick={() => onToggleFlipX(!state.flipX)}
          className={cn(
            BAR_BUTTON_CLASS,
            state.flipX
              ? "border-accent bg-accent-soft/65 text-fg"
              : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
          )}
        >
          <FlipHorizontal2 size={15} aria-hidden />
          <span>좌우 반전</span>
        </button>

        {onReset ? (
          <button
            type="button"
            disabled={disabled}
            aria-label="캐릭터 상태 초기화"
            onClick={() => {
              setOpenPopover(null);
              onReset();
            }}
            className={cn(
              BAR_BUTTON_CLASS,
              "min-w-11 border-line bg-card px-2.5 text-fg-2 hover:bg-raised hover:text-fg",
            )}
          >
            <RotateCcw size={15} aria-hidden />
          </button>
        ) : null}
      </div>

      {/* 표정 12종 팝오버 */}
      {openPopover === "expression" ? (
        <div
          id="character-quick-popover-expression"
          role="dialog"
          aria-label="표정 12종 선택"
          className="w-80 max-w-[92vw] rounded-2xl border border-line bg-panel p-2 shadow-md"
        >
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-xs font-semibold text-fg tabular-nums">표정 선택 (12종)</span>
            <button
              type="button"
              aria-label="표정 팝오버 닫기"
              onClick={() => setOpenPopover(null)}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-transparent text-fg-2 hover:border-line hover:bg-raised"
            >
              <X size={15} aria-hidden />
            </button>
          </div>
          <div className="grid max-h-72 grid-cols-3 gap-1.5 overflow-y-auto overscroll-contain">
            {EXPRESSION_CATALOG.map((item) => {
              const active = state.expressionId === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => handleSelectExpression(item.id)}
                  className={cn(
                    OPTION_TILE_CLASS,
                    active
                      ? "border-accent bg-accent text-on-accent"
                      : "border-line bg-card text-fg hover:bg-raised",
                  )}
                >
                  <span className="text-xs font-semibold">{item.labelKo}</span>
                  <span
                    className={cn(
                      "text-[11px]",
                      active ? "text-on-accent/85" : "text-fg-2",
                    )}
                  >
                    {item.nuanceKo}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* 포즈 10종 팝오버 */}
      {openPopover === "pose" ? (
        <div
          id="character-quick-popover-pose"
          role="dialog"
          aria-label="포즈 10종 선택"
          className="w-80 max-w-[92vw] rounded-2xl border border-line bg-panel p-2 shadow-md"
        >
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-xs font-semibold text-fg tabular-nums">포즈 선택 (10종)</span>
            <button
              type="button"
              aria-label="포즈 팝오버 닫기"
              onClick={() => setOpenPopover(null)}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-transparent text-fg-2 hover:border-line hover:bg-raised"
            >
              <X size={15} aria-hidden />
            </button>
          </div>
          <div className="grid max-h-72 grid-cols-2 gap-1.5 overflow-y-auto overscroll-contain">
            {POSE_CATALOG.map((item) => {
              const active = state.poseId === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => handleSelectPose(item.id)}
                  className={cn(
                    OPTION_TILE_CLASS,
                    active
                      ? "border-accent bg-accent text-on-accent"
                      : "border-line bg-card text-fg hover:bg-raised",
                  )}
                >
                  <span className="text-xs font-semibold">{item.labelKo}</span>
                  <span
                    className={cn(
                      "text-[11px]",
                      active ? "text-on-accent/85" : "text-fg-2",
                    )}
                  >
                    {item.tagKo}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* 의상 교체 팝오버 */}
      {openPopover === "outfit" ? (
        <div
          id="character-quick-popover-outfit"
          role="dialog"
          aria-label="의상 교체 선택"
          className="w-80 max-w-[92vw] rounded-2xl border border-line bg-panel p-2 shadow-md"
        >
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-xs font-semibold text-fg tabular-nums">
              의상 교체 ({outfitList.length}종)
            </span>
            <button
              type="button"
              aria-label="의상 팝오버 닫기"
              onClick={() => setOpenPopover(null)}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-transparent text-fg-2 hover:border-line hover:bg-raised"
            >
              <X size={15} aria-hidden />
            </button>
          </div>
          <div className="grid max-h-72 grid-cols-2 gap-1.5 overflow-y-auto overscroll-contain">
            {outfitList.map((outfit) => {
              const active = state.outfitId === outfit.id;
              return (
                <button
                  key={outfit.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => handleSelectOutfit(outfit.id)}
                  className={cn(
                    OPTION_TILE_CLASS,
                    active
                      ? "border-accent bg-accent text-on-accent"
                      : "border-line bg-card text-fg hover:bg-raised",
                  )}
                >
                  <span className="text-xs font-semibold">{outfit.labelKo}</span>
                  <span
                    className={cn(
                      "text-[11px]",
                      active ? "text-on-accent/85" : "text-fg-2",
                    )}
                  >
                    {outfit.categoryKo}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default StudioCharacterInlineQuickBar;
