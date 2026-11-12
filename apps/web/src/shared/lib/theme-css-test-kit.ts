import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const designCss = readFileSync(new URL("../../app/styles/design-themes.css", import.meta.url), "utf8");
const unifiedCss = readFileSync(new URL("../../app/styles/unified-theme-contract.css", import.meta.url), "utf8");

interface CssNode {
  readonly type: string;
  readonly selector?: string;
  readonly name?: string;
  readonly params?: string;
  readonly prop?: string;
  readonly value?: string;
  readonly nodes?: readonly CssNode[];
}

// 이미 선언·설치된 Tailwind PostCSS 패키지의 파서만 사용한다. 새 의존성이나 플러그인 실행은 없다.
const projectRequire = createRequire(import.meta.url);
const postcssRequire = createRequire(projectRequire.resolve("@tailwindcss/postcss"));
const postcss = postcssRequire("postcss") as { parse(source: string): { nodes: readonly CssNode[] } };
type ThemeColorMode = "normal" | "forced-colors";

/** 현재 정본의 무조건 root 규칙을 읽는다. 명시한 강제 색상 외의 조건부 CSS는 평가하지 않는다. */
export function readThemeCustomPropertiesFromCss(
  themeId: string, source: string, mode: ThemeColorMode = "normal",
): ReadonlyMap<string, string> {
  if (!/^[a-z-]+$/u.test(themeId)) throw new Error(`잘못된 테마 식별자: ${themeId}`);
  const themeAttribute = `[data-design-theme="${themeId}"]`;
  const properties = new Map<string, string>();
  let hasPalette = false;
  const visit = (nodes: readonly CssNode[]): void => {
    for (const node of nodes) {
      if (node.type === "atrule") {
        // 부모 조건을 버리고 하위 규칙을 평탄화하지 않는다. 미확정 화면폭·supports 등은 별도 검사 대상이다.
        if (mode === "forced-colors" && node.name === "media" && node.params?.trim() === "(forced-colors: active)") {
          visit(node.nodes ?? []);
        }
        continue;
      }
      if (node.type !== "rule" || !node.selector) continue;
      const selectors = node.selector.split(/,(?![^()]*\))/u).map((entry) => entry.trim());
      const matches = selectors.some((entry) => entry === `:root${themeAttribute}`
        || entry === ":root[data-design-theme]"
        || (entry.startsWith(":root:is(") && entry.endsWith(")")
          && entry.slice(9, -1).split(",").map((part) => part.trim()).includes(themeAttribute)));
      if (!matches) continue;
      for (const declaration of node.nodes ?? []) {
        if (declaration.type !== "decl" || !declaration.prop?.startsWith("--") || declaration.value === undefined) continue;
        properties.set(declaration.prop, declaration.value.trim());
        if (declaration.prop.startsWith("--ui-palette-")) hasPalette = true;
      }
    }
  };
  visit(postcss.parse(source).nodes);
  if (!hasPalette) throw new Error(`테마 원시 팔레트가 없습니다: ${themeId}`);
  return properties;
}

export function readThemeCustomProperties(
  themeId: string, includeUnified = false, mode: ThemeColorMode = "normal",
): ReadonlyMap<string, string> {
  return readThemeCustomPropertiesFromCss(themeId, `${designCss}\n${includeUnified ? unifiedCss : ""}`, mode);
}

/** 지원하지 않는 계산식은 그대로 반환하여 호출 측 색 계산이 실패하게 한다. 누락/순환은 즉시 실패한다. */
export function resolveThemeCustomProperty(properties: ReadonlyMap<string, string>, name: string): string {
  const seen = new Set<string>();
  let current = name;
  for (;;) {
    if (seen.has(current)) throw new Error(`테마 별칭 순환: ${[...seen, current].join(" → ")}`);
    seen.add(current);
    const value = properties.get(current);
    if (value === undefined) throw new Error(`테마 토큰이 없습니다: ${current}`);
    const alias = /^var\((--[a-z0-9-]+)\)$/u.exec(value)?.[1];
    if (!alias) return value;
    current = alias;
  }
}
