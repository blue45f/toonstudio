import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * 상태 문구 사전의 코어/본문 분리 계약.
 *
 * 사전은 모듈이 평가될 때 ko/en 키를 동기로 등록한다. 진입 그래프(앱 셸·Studio 첫 청크)에 닿는 소비 파일이
 * 지연 표면 전용 키까지 끌어오지 않도록 사전을 둘로 나눴다.
 *   - 코어(`*-core.ts`): 진입 그래프 소비 파일이 쓰는 키와 해석 헬퍼
 *   - 본문(원래 경로): 지연 표면 전용 키. 코어를 re-export 해 함께 불러온다
 * 진입 그래프에 본문이 정적으로 닿지 않게 하는 일은 scripts/check-studio-eager-graph.mjs 의 지연 고정 파일
 * 규칙이 맡는다. 이 시험은 반대쪽, 곧 "키를 쓰는 파일은 그 키를 등록하는 모듈을 직접 import 한다"를 고정한다.
 * 어긴 파일은 영어 화면에서 키 등록 없이 한국어 폴백만 보인다.
 */

const SRC_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const posix = (value: string): string => value.split(path.sep).join("/");

interface SplitDictionary {
  readonly body: string;
  readonly core: string;
}

const DICTIONARIES: readonly SplitDictionary[] = [
  { body: "shared/rest-status-i18n.ts", core: "shared/rest-status-i18n-core.ts" },
  { body: "domains/auth/components/auth-rest-status-i18n.ts", core: "domains/auth/components/auth-rest-status-i18n-core.ts" },
  { body: "domains/creator/studio-panel-status-i18n-r3c06.ts", core: "domains/creator/status-i18n/studio-panel-status-i18n-r3c06-core.ts" },
  { body: "domains/creator/studio-panel-status-i18n-r3c07.ts", core: "domains/creator/status-i18n/studio-panel-status-i18n-r3c07-core.ts" },
  { body: "domains/creator/studio-vrm-panel-status-i18n.ts", core: "domains/creator/status-i18n/studio-vrm-panel-status-i18n-core.ts" },
  { body: "domains/creator/ai/studio-ai-error-i18n-t4t5.ts", core: "domains/creator/ai/studio-ai-error-i18n-t4t5-core.ts" },
];

function collectSourceFiles(directory: string, found: string[] = []): string[] {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) collectSourceFiles(absolute, found);
    else if (/\.(ts|tsx)$/u.test(entry.name) && !/\.(test|spec)\.(ts|tsx)$/u.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      found.push(posix(path.relative(SRC_ROOT, absolute)));
    }
  }
  return found;
}

const sources = new Map<string, string>(
  collectSourceFiles(SRC_ROOT).map((file) => [file, readFileSync(path.join(SRC_ROOT, file), "utf-8")] as const),
);

/** 등록 블록(`registerI18nLocaleEntries("ko"|"en", { … })`)이나 상수 객체에 적힌 `"키": "값"` 줄의 키. */
function registeredKeys(source: string): Set<string> {
  return new Set([...source.matchAll(/^\s*"((?:studio|rest|authRest)\.[^"]+)":/gmu)].map((match) => match[1] ?? ""));
}

/** consumer 가 target(확장자 없는 경로 기준)을 상대·`@/` 지정자로 import 하는지. */
function imports(consumer: string, source: string, target: string): boolean {
  const wanted = target.replace(/\.ts$/u, "");
  for (const match of source.matchAll(/(?:from\s+|import\s+)["']([^"']+)["']/gu)) {
    const specifier = match[1] ?? "";
    let resolved: string | null = null;
    if (specifier.startsWith(".")) resolved = path.posix.normalize(path.posix.join(path.posix.dirname(consumer), specifier));
    else if (specifier.startsWith("@/")) resolved = specifier.slice(2);
    if (resolved === wanted) return true;
  }
  return false;
}

describe("상태 문구 사전 코어/본문 분리 계약", () => {
  for (const { body, core } of DICTIONARIES) {
    describe(path.posix.basename(body, ".ts"), () => {
      const bodySource = sources.get(body) ?? "";
      const coreSource = sources.get(core) ?? "";

      it("본문과 코어가 모두 있고 본문이 코어를 re-export 해 함께 불러온다", () => {
        expect(bodySource.length, `${body} 없음`).toBeGreaterThan(0);
        expect(coreSource.length, `${core} 없음`).toBeGreaterThan(0);
        const coreSpecifier = `./${path.posix.relative(path.posix.dirname(body), core).replace(/\.ts$/u, "")}`;
        expect(bodySource).toMatch(new RegExp(`^export \\{[^}]*\\} from "${coreSpecifier.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}";$`, "mu"));
      });

      it("코어와 본문의 키가 겹치지 않고 둘 다 비어 있지 않다", () => {
        const bodyKeys = registeredKeys(bodySource);
        const coreKeys = registeredKeys(coreSource);
        expect(coreKeys.size, "코어 키 없음").toBeGreaterThan(0);
        expect(bodyKeys.size, "본문 키 없음").toBeGreaterThan(0);
        expect([...coreKeys].filter((key) => bodyKeys.has(key))).toEqual([]);
      });

      it("키를 쓰는 모든 파일이 그 키를 등록하는 모듈을 직접 import 한다", () => {
        const bodyKeys = registeredKeys(bodySource);
        const coreKeys = registeredKeys(coreSource);
        const violations: string[] = [];
        // 키는 모두 "<네임스페이스>.<그룹>." 으로 시작하므로 먼저 접두어로 걸러 전체 소스를 키마다 훑지 않는다.
        const prefixes = [...new Set([...bodyKeys, ...coreKeys].map((key) => `"${key.split(".").slice(0, 2).join(".")}.`))];
        for (const [file, source] of sources) {
          if (file === body || file === core) continue;
          if (!prefixes.some((prefix) => source.includes(prefix))) continue;
          const usesBody = [...bodyKeys].some((key) => source.includes(`"${key}"`));
          const usesCore = [...coreKeys].some((key) => source.includes(`"${key}"`));
          if (!usesBody && !usesCore) continue;
          const importsBody = imports(file, source, body);
          const importsCore = imports(file, source, core);
          if (usesBody && !importsBody) violations.push(`${file}: 본문 키를 쓰지만 본문을 import 하지 않음`);
          if (usesCore && !importsBody && !importsCore) violations.push(`${file}: 코어 키를 쓰지만 코어(또는 본문)를 import 하지 않음`);
        }
        expect(violations).toEqual([]);
      });
    });
  }
});
