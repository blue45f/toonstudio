/**
 * 컷 가져오기 화면의 공용 클래스 — 이웃 가져오기 화면(StudioImportIntake·StudioExportPanel)의 표면·입력 규격과 기존 의미 토큰만 쓴다.
 * 색을 직접 쓰지 않으므로 테마(라이트/다크/고대비)가 바뀌어도 그대로 따라간다.
 */

import { cn } from "@/shared/lib/utils";

export const PANEL_FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/** 단계 하나를 담는 표면. 중첩 카드를 만들지 않도록 안쪽 구획은 border 만 쓴다. */
export const PANEL_SURFACE = "rounded-2xl border border-line bg-card p-4 sm:p-5";
export const PANEL_SUBSURFACE = "rounded-xl border border-line bg-panel/55 p-3";

export const PANEL_INPUT =
  "min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg disabled:cursor-not-allowed disabled:opacity-45 " + PANEL_FOCUS_RING;

export const PANEL_LABEL = "block text-xs font-bold text-fg-2";
export const PANEL_HINT = "text-xs leading-5 text-fg-3";
export const PANEL_HEADING = "text-base font-black text-fg sm:text-lg";

/**
 * 라벨 안에 숨긴(sr-only) 라디오 input 이 포커스를 받는 칩의 포커스 표시.
 * 포커스는 input 에 있으므로 라벨 자신의 focus-visible 로는 키보드 위치가 보이지 않는다 — 안쪽 input 의 focus-visible 을
 * has() 로 받아 라벨 테두리에 그린다(AmbientSettingsSection 의 라디오 선택지와 같은 처리).
 */
const PANEL_CHIP_INNER_FOCUS_RING =
  "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent "
  + "has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-45";

/** 골라서 켜는 칩/버튼(활성은 accent 면). 단추(button)와 숨긴 라디오를 감싼 라벨(label) 둘 다에 쓴다. */
export function panelChipClass(active: boolean): string {
  return cn(
    "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45",
    PANEL_FOCUS_RING,
    PANEL_CHIP_INNER_FOCUS_RING,
    active ? "border-accent/60 bg-accent-soft text-fg" : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg",
  );
}

/** 작은 보조 버튼(아이콘 포함). */
export const PANEL_SMALL_BUTTON = cn(
  "inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-xl border border-line bg-card px-3 text-xs font-bold text-fg-2 transition-colors duration-150 hover:border-line-strong hover:text-fg disabled:cursor-not-allowed disabled:opacity-45",
  PANEL_FOCUS_RING,
);

export type PanelTone = "info" | "good" | "warn" | "bad";

export const PANEL_TONE_CLASS: Readonly<Record<PanelTone, string>> = Object.freeze({
  info: "border-accent/30 bg-accent-soft/55 text-fg-2",
  good: "border-good/30 bg-good/10 text-good",
  warn: "border-warn/35 bg-warn/10 text-warn",
  bad: "border-bad/35 bg-bad/10 text-bad",
});

/** 로딩 자리표시(스피너 대신 스켈레톤). 모션 감소 설정에서는 정지한다. */
export const PANEL_SKELETON = "rounded-lg bg-raised motion-safe:animate-pulse";
