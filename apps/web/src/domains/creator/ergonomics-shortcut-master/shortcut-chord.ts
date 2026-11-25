import type { NormalizedModifier, NormalizedShortcutChord, ShortcutOsPlatform } from "./shortcut-ergonomics-engine";

const KEY_ALIAS_MAP: Readonly<Record<string, string>> = {
  space: "Space", spacebar: "Space", " ": "Space", tab: "Tab", enter: "Enter", return: "Enter",
  esc: "Escape", escape: "Escape", backspace: "Backspace", delete: "Delete", del: "Delete",
  bracketleft: "[", bracketright: "]", semicolon: ";", comma: ",", period: ".", slash: "/",
  minus: "-", equal: "=", plus: "+", arrowup: "ArrowUp", arrowdown: "ArrowDown", arrowleft: "ArrowLeft", arrowright: "ArrowRight",
};

const isApplePlatform = (platform: ShortcutOsPlatform): boolean => platform === "mac" || platform === "ipad";

function normalizeBaseKey(rawToken: string): string | null {
  const trimmed = rawToken.trim();
  if (!trimmed) return null;
  const alias = KEY_ALIAS_MAP[trimmed.toLowerCase()];
  if (Object.hasOwn(KEY_ALIAS_MAP, trimmed.toLowerCase()) && alias) return alias;
  if (/^key[a-z]$/i.test(trimmed)) return trimmed.slice(3).toUpperCase();
  if (/^digit[0-9]$/i.test(trimmed)) return trimmed.slice(5);
  if (/^f([1-9]|1[0-2])$/i.test(trimmed)) return trimmed.toUpperCase();
  if (/^[a-z0-9[\];,./\-=+]$/i.test(trimmed)) return trimmed.length === 1 ? trimmed.toUpperCase() : trimmed;
  return null;
}

const invalidChord = (raw: string, displayLabel: string, reasonKo: string, reasonEn: string): NormalizedShortcutChord => ({
  valid: false, raw, canonical: "", platformKey: "", displayLabel, modifiers: [], key: "", reasonKo, reasonEn,
});

/** OS별 Meta(⌘)/Ctrl 기준으로 단축키 문자열을 정규화한다. */
export function normalizeShortcutChord(
  raw: string,
  platform: ShortcutOsPlatform = "mac",
  options?: { readonly preserveExplicitCtrlOnApple?: boolean },
): NormalizedShortcutChord {
  const cleaned = raw.trim();
  if (!cleaned) return invalidChord(raw, "—", "단축키가 비어 있습니다.", "Shortcut chord is empty.");

  const hasTrailingPlusKey = cleaned.endsWith("++");
  const tokenSource = hasTrailingPlusKey ? cleaned.slice(0, -2) : cleaned;
  const rawTokens = cleaned === "+" ? ["+"] : tokenSource.split("+").map((token) => token.trim());
  if (hasTrailingPlusKey) rawTokens.push("+");
  if (rawTokens.some((token) => !token)) {
    return invalidChord(raw, cleaned, "키 사이의 빈 구분자를 확인해 주세요.", "Empty shortcut token.");
  }
  let hasMod = false, hasMeta = false, hasCtrl = false, hasAlt = false, hasShift = false;
  let keyToken: string | null = null;
  for (const token of rawTokens) {
    const lower = token.toLowerCase();
    if (lower === "mod" || lower === "primary") hasMod = true;
    else if (lower === "meta" || lower === "cmd" || lower === "command" || token === "⌘") hasMeta = true;
    else if (lower === "ctrl" || lower === "control" || token === "⌃") hasCtrl = true;
    else if (lower === "alt" || lower === "opt" || lower === "option" || token === "⌥") hasAlt = true;
    else if (lower === "shift" || token === "⇧") hasShift = true;
    else {
      const normalizedKey = normalizeBaseKey(token);
      if (!normalizedKey || keyToken !== null) {
        return invalidChord(raw, cleaned, `인식할 수 없는 키 조합입니다: "${cleaned}"`, `Unrecognized shortcut chord: "${cleaned}"`);
      }
      keyToken = normalizedKey;
    }
  }
  if (!keyToken) return invalidChord(raw, cleaned, "보조키 외에 실제 실행 키가 필요합니다.", "A non-modifier trigger key is required.");

  const apple = isApplePlatform(platform);
  const keepCtrl = options?.preserveExplicitCtrlOnApple === true;
  const resolvedModifiers: NormalizedModifier[] = [];
  const canonicalParts: string[] = [];
  if (apple) {
    if (hasMod || hasMeta || (!keepCtrl && hasCtrl)) { resolvedModifiers.push("Meta"); canonicalParts.push("Mod"); }
    if (keepCtrl && hasCtrl) { resolvedModifiers.push("Ctrl"); canonicalParts.push("Ctrl"); }
  } else if (hasMod || hasMeta || hasCtrl) {
    resolvedModifiers.push("Ctrl"); canonicalParts.push("Mod");
  }
  if (hasAlt) { resolvedModifiers.push("Alt"); canonicalParts.push("Alt"); }
  if (hasShift) { resolvedModifiers.push("Shift"); canonicalParts.push("Shift"); }
  canonicalParts.push(keyToken);

  const displayParts: string[] = resolvedModifiers.map((m) =>
    m === "Meta" ? "⌘" : m === "Ctrl" ? (apple ? "⌃" : "Ctrl") : m === "Alt" ? (apple ? "⌥" : "Alt") : apple ? "⇧" : "Shift",
  );
  displayParts.push(keyToken);
  return {
    valid: true, raw, canonical: canonicalParts.join("+"), platformKey: [...resolvedModifiers, keyToken].join("+"),
    displayLabel: displayParts.join("+"), modifiers: resolvedModifiers, key: keyToken, reasonKo: null, reasonEn: null,
  };
}
