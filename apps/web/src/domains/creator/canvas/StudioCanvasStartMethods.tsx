import {
  BookOpenText,
  Brush,
  ChevronDown,
  GraduationCap,
  Image as ImageIcon,
  Mountain,
  Sparkles,
  UserRound,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";
import { useId, type KeyboardEvent } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { StudioCreationMode } from "../studio-creation-mode";

const SCENE_ROOT = "/brand/studio-canvas-previews";

type CanvasStartAccent = "violet" | "blue" | "pink" | "cyan" | "amber" | "aurora";

interface CanvasStartAction {
  readonly mode: StudioCreationMode;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly icon: LucideIcon;
  readonly accent: CanvasStartAccent;
}

/** 참고용 예시 장면(브랜드 일러스트). 고른 장르를 도구에 넘기지 않으므로 선택지로 꾸미지 않는다. */
interface CanvasScenePreset {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly art: string;
}

/** 왼쪽 도구 막대의 "만들기(작업 모드)"와 같은 여섯 갈래. 아이콘은 편집기 도구와 같은 선형 아이콘을 쓴다. */
const CANVAS_START_ACTIONS: readonly CanvasStartAction[] = [
  { mode: "draw", labelKo: "직접 그리기", labelEn: "Draw", descriptionKo: "브러시와 선화부터", descriptionEn: "Brushes & line art", icon: Brush, accent: "violet" },
  { mode: "story", labelKo: "컷과 대사", labelEn: "Panels & dialogue", descriptionKo: "말풍선·텍스트 구성", descriptionEn: "Balloons & text", icon: BookOpenText, accent: "blue" },
  { mode: "character", labelKo: "캐릭터 배치", labelEn: "Place characters", descriptionKo: "3D 캐릭터·표정·포즈", descriptionEn: "3D characters, expression & pose", icon: UserRound, accent: "pink" },
  { mode: "background", labelKo: "배경 만들기", labelEn: "Backgrounds", descriptionKo: "장면·원근·3D 배경", descriptionEn: "Scene, perspective, 3D", icon: Mountain, accent: "cyan" },
  { mode: "assets", labelKo: "에셋 불러오기", labelEn: "Add assets", descriptionKo: "소재와 참고 이미지", descriptionEn: "Materials & references", icon: ImageIcon, accent: "amber" },
  { mode: "ai", labelKo: "AI 첫 장면", labelEn: "AI first scene", descriptionKo: "구도와 연출 제안", descriptionEn: "Composition ideas", icon: WandSparkles, accent: "aurora" },
] as const;

const CANVAS_SCENE_PRESETS: readonly CanvasScenePreset[] = [
  { id: "romance", labelKo: "로맨스", labelEn: "Romance", descriptionKo: "벚꽃길의 첫 만남", descriptionEn: "First meeting under blossoms", art: `${SCENE_ROOT}/romance.webp` },
  { id: "sf", labelKo: "SF", labelEn: "Sci-fi", descriptionKo: "네온 도시의 추격", descriptionEn: "Chase in a neon city", art: `${SCENE_ROOT}/sf.webp` },
  { id: "action", labelKo: "액션", labelEn: "Action", descriptionKo: "폐허 도시의 전투", descriptionEn: "Battle in ruins", art: `${SCENE_ROOT}/action.webp` },
  { id: "fantasy", labelKo: "판타지", labelEn: "Fantasy", descriptionKo: "용의 절벽과 구름", descriptionEn: "Dragon cliffs", art: `${SCENE_ROOT}/fantasy.webp` },
  { id: "daily", labelKo: "일상", labelEn: "Slice of life", descriptionKo: "밤의 작업실", descriptionEn: "Studio at night", art: `${SCENE_ROOT}/daily.webp` },
  { id: "horror", labelKo: "호러", labelEn: "Horror", descriptionKo: "안개 낀 오두막", descriptionEn: "Cabin in the fog", art: `${SCENE_ROOT}/horror.webp` },
] as const;

export interface StudioCanvasStartMethodsProps {
  readonly scenesOpen: boolean;
  readonly onToggleScenes: () => void;
  readonly onLaunch: (mode: StudioCreationMode) => void;
  readonly onOpenTutorial?: () => void;
  readonly onCloseWithEscape: (event: KeyboardEvent<HTMLElement>) => void;
}

/** 사용자가 시작 방법을 펼친 뒤에만 읽는 선택지와 참고 장면이다. */
export function StudioCanvasStartMethods({
  scenesOpen,
  onToggleScenes,
  onLaunch,
  onOpenTutorial,
  onCloseWithEscape,
}: StudioCanvasStartMethodsProps) {
  const bt = useBilingual("StudioCinematicCanvasWelcome");
  const headingId = useId();
  const scenesId = useId();

  return (
    <>
      <header className="studio-canvas-start__header">
        <div className="studio-canvas-start__title">
          <span className="studio-canvas-start__eyebrow">
            <Sparkles size={12} aria-hidden="true" /> START YOUR SCENE
          </span>
          <h2 id={headingId}>{bt("첫 장면을 어떻게 시작할까요?", "How do you want to start?")}</h2>
          <p>
            {bt(
              "바로 그려도 됩니다. 방식을 고르면 필요한 도구와 패널을 준비해요.",
              "Start drawing right away, or pick a way to start and the right tools open.",
            )}
          </p>
        </div>
        <div className="studio-canvas-start__header-actions">
          <button
            type="button"
            className="studio-canvas-start__scenes-toggle"
            onKeyDown={onCloseWithEscape}
            aria-expanded={scenesOpen}
            aria-controls={scenesId}
            onClick={onToggleScenes}
          >
            {bt("예시 장면", "Example scenes")}
            <ChevronDown size={14} aria-hidden="true" />
          </button>

        </div>
      </header>

      <ul className="studio-canvas-start__modes" aria-labelledby={headingId}>
        {CANVAS_START_ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <li key={action.mode}>
              <button
                type="button"
                data-canvas-start-mode={action.mode}
                data-accent={action.accent}
                onKeyDown={onCloseWithEscape}
                onClick={() => onLaunch(action.mode)}
              >
                <span className="studio-canvas-start__mode-icon" aria-hidden="true"><Icon size={18} /></span>
                <span className="studio-canvas-start__mode-copy">
                  <strong>{bt(action.labelKo, action.labelEn)}</strong>
                  <small>{bt(action.descriptionKo, action.descriptionEn)}</small>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {scenesOpen ? (
        <div id={scenesId} className="studio-canvas-start__scenes">
          <div className="studio-canvas-start__scenes-head">
            <p>
              {bt(
                "장르별 참고용 예시 일러스트예요. 배경은 배경 도구에서 직접 만들 수 있어요.",
                "Reference illustrations by genre. Build your own background with the background tools.",
              )}
            </p>
            <button
              type="button"
              className="studio-canvas-start__scenes-action"
              data-canvas-scene-open-background="true"
              onKeyDown={onCloseWithEscape}
              onClick={() => onLaunch("background")}
            >
              <Mountain size={14} aria-hidden="true" />
              {bt("배경 도구 열기", "Open background tools")}
            </button>
          </div>
          {/* 가로로 넘치는 예시 목록에 직접 초점을 두어 화살표로 스크롤한다. */}
          {/* 스크롤 가능한 목록의 Tab·화살표 및 Escape 조작을 위한 제한된 예외다. */}
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex, jsx-a11y/no-noninteractive-element-interactions */}
          <ul className="studio-cinematic-canvas-welcome__scene-strip" aria-label={bt("예시 장면", "Example scenes")} tabIndex={0} data-studio-shortcut-boundary="true" onKeyDown={onCloseWithEscape}>
            {CANVAS_SCENE_PRESETS.map((preset) => (
              <li key={preset.id} data-canvas-scene-example={preset.id}>
                <span
                  className="studio-canvas-start__scene-art"
                  style={{ backgroundImage: `url("${preset.art}")` }}
                  aria-hidden="true"
                />
                <span className="studio-canvas-start__scene-badge">{bt("예시", "Example")}</span>
                <span className="studio-canvas-start__scene-copy">
                  <strong>{bt(preset.labelKo, preset.labelEn)}</strong>
                  <small>{bt(preset.descriptionKo, preset.descriptionEn)}</small>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="studio-canvas-start__footer">
        <p className="studio-canvas-start__hint">
          {bt(
            "닫아도 왼쪽 도구 막대의 ‘만들기’에서 언제든 다시 고를 수 있어요.",
            "You can reopen these anytime from “Create” in the left tool rail.",
          )}
        </p>
        {onOpenTutorial ? (
          <button
            type="button"
            className="studio-canvas-start__tutorial"
            data-canvas-start-tutorial="true"
            onKeyDown={onCloseWithEscape}
            onClick={onOpenTutorial}
          >
            <GraduationCap size={14} aria-hidden="true" />
            {bt("처음이라면 사용법 따라 하기", "New here? Follow the guided tour")}
          </button>
        ) : null}
      </div>
    </>
  );
}
