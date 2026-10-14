/**
 * Convert a finished macro session into an Auto Action set.
 * Kept separate from studio-macro-recorder so Studio static chunk does not pull zod/auto-actions.
 */

import {
  STUDIO_AUTO_ACTION_BLEND_MODES,
  STUDIO_AUTO_ACTION_LIMITS,
  normalizeStudioAutoActionSet,
  type StudioAutoActionCommand,
  type StudioAutoActionSet,
} from "./studio-auto-actions";

import {
  STUDIO_MACRO_MAX_COMMANDS,
  STUDIO_MACRO_TRUNCATED_NAME_SUFFIX,
  getStudioMacroTruncationNotice,
  type StudioMacroCommand,
  type StudioMacroSession,
} from "./studio-macro-recorder";

function macroCommandToAutoAction(
  command: StudioMacroCommand,
  index: number
): StudioAutoActionCommand | null {
  const id = `macro-${index + 1}`;
  switch (command.type) {
    case "set-opacity":
      return { id, enabled: true, type: "element.set-opacity", opacity: command.opacity };
    case "set-hidden":
      return { id, enabled: true, type: "element.set-hidden", hidden: command.hidden };
    case "set-locked":
      return { id, enabled: true, type: "element.set-locked", locked: command.locked };
    case "set-blend-mode": {
      const blendMode = (STUDIO_AUTO_ACTION_BLEND_MODES as readonly string[]).includes(command.blendMode)
        ? (command.blendMode as (typeof STUDIO_AUTO_ACTION_BLEND_MODES)[number])
        : "source-over";
      return { id, enabled: true, type: "element.set-blend-mode", blendMode };
    }
    case "lettering-font-size":
      return { id, enabled: true, type: "lettering.set-size", fontSize: command.fontSize };
    case "lettering-color":
      return { id, enabled: true, type: "lettering.set-color", color: command.color };
    case "lettering-font":
      return { id, enabled: true, type: "lettering.set-font", font: command.font };
    case "page-set-background":
      return { id, enabled: true, type: "page.set-background", background: command.background };
    case "page-apply-grade-preset": {
      const preset = command.preset as
        | "neutral"
        | "recall"
        | "night"
        | "dawn"
        | "dusk"
        | "horror"
        | "dreamy"
        | "mono-manuscript"
        | "rainy"
        | "warm-afternoon";
      return { id, enabled: true, type: "page.apply-grade-preset", preset };
    }
    default:
      return null;
  }
}

/** Convert a finished recording into an Auto Action set for dry-run/apply. */
export function studioMacroSessionToAutoActionSet(session: StudioMacroSession): StudioAutoActionSet {
  const mapped: StudioAutoActionCommand[] = [];
  session.commands.forEach((command, index) => {
    const action = macroCommandToAutoAction(command, index);
    if (action) mapped.push(action);
  });
  // A macro session holds up to STUDIO_MACRO_MAX_COMMANDS (80) commands, but an
  // Auto Action set allows fewer (64). Keep the earliest commands and surface
  // the overflow in the name/description instead of failing or dropping silently.
  const overflowCount = Math.max(0, mapped.length - STUDIO_AUTO_ACTION_LIMITS.maxCommands);
  const commands = overflowCount > 0 ? mapped.slice(0, STUDIO_AUTO_ACTION_LIMITS.maxCommands) : mapped;
  if (commands.length === 0) {
    commands.push({
      id: "macro-empty-1",
      enabled: false,
      type: "element.set-opacity",
      opacity: 1,
    });
  }
  const sessionNotice = getStudioMacroTruncationNotice(session);
  const truncated = sessionNotice !== null || overflowCount > 0;
  let name = session.name;
  let description: string | undefined;
  if (truncated) {
    if (!name.endsWith(STUDIO_MACRO_TRUNCATED_NAME_SUFFIX)) {
      // DisplayNameSchema caps names at 120 code units; macro names are capped
      // at 80, so the suffix always fits — slice defensively anyway.
      name = `${name.slice(0, 120 - STUDIO_MACRO_TRUNCATED_NAME_SUFFIX.length)}${STUDIO_MACRO_TRUNCATED_NAME_SUFFIX}`;
    }
    const parts: string[] = [
      sessionNotice ??
        `매크로 녹화 상한 ${STUDIO_MACRO_MAX_COMMANDS}개에 도달해 이후 명령이 잘렸습니다.`,
    ];
    if (overflowCount > 0) {
      parts.push(
        `자동 액션 상한 ${STUDIO_AUTO_ACTION_LIMITS.maxCommands}개에 맞춰 앞 ${STUDIO_AUTO_ACTION_LIMITS.maxCommands}개 명령만 담았습니다.`
      );
    }
    description = parts.join(" ");
  }
  return normalizeStudioAutoActionSet({
    kind: "toonstudio-studio-auto-actions",
    version: 1,
    id: `macro-set-${session.startedAt ?? 0}`,
    name,
    // Omit the key entirely when there is no notice: normalizeStudioAutoActionSet
    // rejects undefined values in its structured-value safety check.
    ...(description ? { description } : {}),
    commands,
  });
}
