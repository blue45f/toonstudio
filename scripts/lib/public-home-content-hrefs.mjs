import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const HOME_CONTENT = new URL("../../apps/web/src/domains/marketing/reference-home-content.ts", import.meta.url);

/**
 * 홈 바로가기·Luna 제안의 정본은 reference-home-content.ts 의 `as const` 배열이다. 브라우저 게이트가 기대 목록을
 * 다시 적어 두면 홈 구성이 바뀔 때마다 게이트가 낡아 실제 결함과 구분되지 않으므로, 화면이 그 순서대로 그리는지만 본다.
 * Playwright 에 의존하지 않아 단위 시험이 이 파서를 그대로 고정한다.
 * @param {string} name 읽을 배열 상수 이름(예: HOME_QUICK_STARTS)
 * @param {string} [source] 소스 문자열(기본: reference-home-content.ts)
 * @returns {string[]} 배열 항목의 href, 선언 순서대로
 */
export function readHomeContentHrefs(name, source = readFileSync(HOME_CONTENT, "utf8")) {
  const block = new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const;`, "u").exec(source)?.[1] ?? "";
  const hrefs = [...block.matchAll(/href:\s*"([^"]+)"/gu)].map((match) => match[1]);
  assert(hrefs.length > 0, `${name} 에서 href 를 읽지 못했습니다`);
  return hrefs;
}
