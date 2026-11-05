const WHITESPACE_CONTENT_ELEMENTS = new Set([
  "text", "tspan", "textpath", "title", "desc", "foreignobject", "style", "script", "metadata",
]);

/** SVG 도형 태그 사이의 들여쓰기만 줄인다. 텍스트·보존 영역·주석은 바이트 그대로 남긴다. */
export function compactSvgStructureWhitespace(source: string): string {
  // 외부 DTD와 알 수 없는 XML 구조는 건드리지 않는다. 실제 precache 바이트 검사는 계속 적용된다.
  if (/<!DOCTYPE/iu.test(source)) return source;
  const tokens = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<(?:[^"'<>]|"[^"]*"|'[^']*')*>/gu;
  const stack: { name: string; preserve: boolean }[] = [];
  const parts: string[] = [];
  let cursor = 0;
  let preserveDepth = 0;
  for (const match of source.matchAll(tokens)) {
    const text = source.slice(cursor, match.index);
    if (cursor === 0 || preserveDepth > 0 || !/^[\t\n\r ]*$/u.test(text)) parts.push(text);
    const token = match[0];
    parts.push(token);
    cursor = match.index + token.length;
    const [, closing, name] = /^<\s*(\/?)\s*([\w:.-]+)/u.exec(token) ?? [];
    if (!name) continue;
    if (closing) {
      const opening = stack.pop();
      if (!opening || opening.name !== name) return source;
      if (opening.preserve) preserveDepth -= 1;
    } else if (!/\/\s*>$/u.test(token)) {
      const preserve = WHITESPACE_CONTENT_ELEMENTS.has(name.split(":").at(-1)?.toLowerCase() ?? "")
        || /\bxml:space\s*=\s*(["'])preserve\1/u.test(token);
      stack.push({ name, preserve });
      if (preserve) preserveDepth += 1;
    }
  }
  if (stack.length > 0) return source;
  parts.push(source.slice(cursor));
  return parts.join("");
}
