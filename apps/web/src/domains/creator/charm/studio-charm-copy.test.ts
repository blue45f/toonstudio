import { readdirSync, readFileSync } from "node:fs";

import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * 참 바 문구가 번역 소스로 등록하는 것은 정적 문구뿐인지 소스에서 확인한다.
 *
 * `bi(ko, en)` 은 쌍마다 전역 번역 사전에 키를 등록하고 영문을 기계 번역 소스로 올린다. 그래서 `bi` 의 인자에 내 소재
 * 이름 같은 동적 값을 끼워 넣으면 ① 사용자가 만든 텍스트가 ja 등 다른 언어에서 외부 번역 API 로 나갈 수 있고
 * ② 새 문구마다 전역 번역 갱신(다시 그리기)이 일어난다. 동적 값은 번역된 틀에 자리표시(`{label}`)로 채운다
 * (`biFill`). 실제로 등록되는지는 `StudioCharmBar.i18n.test.tsx` 가 실행해서 확인한다.
 */

/** 참 바 폴더에서 화면 문구를 만드는 소스 파일(시험·시험 도구 제외). */
function charmSourceFiles(): { readonly name: string; readonly file: ts.SourceFile }[] {
  const directory = new URL("./", import.meta.url);
  return readdirSync(directory)
    .filter((name) => /\.tsx?$/u.test(name) && !/\.test(?:-fixture)?\.tsx?$/u.test(name))
    .map((name) => ({
      name,
      file: ts.createSourceFile(
        name,
        readFileSync(new URL(name, directory), "utf8"),
        ts.ScriptTarget.Latest,
        true,
        name.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      ),
    }));
}

function callsOf(file: ts.SourceFile, names: ReadonlySet<string>): ts.CallExpression[] {
  const found: ts.CallExpression[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && names.has(node.expression.text)) found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

function isStaticText(node: ts.Expression): boolean {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
}

/** 번역 사전에 문구를 등록하는 전역 함수들. 참 바 폴더에서는 `studio-charm-copy.ts` 만 부를 수 있다. */
const REGISTRATION_FUNCTIONS: ReadonlySet<string> = new Set([
  "defineBilingualText",
  "defineBilingualAutoText",
  "defineBilingualMap",
  "defineStaticSourceText",
  "translateAuthoredSourceText",
  "translateBilingualPair",
  "translateBilingualValueForActiveLocale",
  "translateBilingualValueForLocale",
  "translateCurrentBilingualValue",
  "translateCurrentStaticSourceText",
  "translateStaticSourceTextForLocale",
  "translateBilingualText",
  "translateBilingual",
  "useBilingual",
  "useBilingualLocalizer",
  "registerI18nEnglishSourceEntries",
  "registerI18nLocaleEntries",
  "registerI18nRuntimeSourceEntries",
]);

describe("참 바 문구: 번역 소스는 정적 문구뿐이다(소스 검사)", () => {
  it("bi()·biFill() 의 한글·영문 인자는 모두 정적 문자열이다(동적 값은 자리표시로 채운다)", () => {
    const violations: string[] = [];
    let checked = 0;
    for (const { name, file } of charmSourceFiles()) {
      // 래퍼(`biFill` 이 `bi` 를 부르는 한 줄)를 정의하는 파일은 호출처가 아니다.
      if (name === "studio-charm-copy.ts") continue;
      for (const call of callsOf(file, new Set(["bi", "biFill"]))) {
        checked += 1;
        const callee = (call.expression as ts.Identifier).text;
        call.arguments.slice(0, 2).forEach((argument, index) => {
          if (isStaticText(argument)) return;
          const { line } = file.getLineAndCharacterOfPosition(argument.getStart(file));
          violations.push(`${name}:${line + 1} ${callee}() ${index === 0 ? "한글" : "영문"} 인자가 동적이다: ${argument.getText(file).slice(0, 60)}`);
        });
        if (call.arguments.length < 2) {
          const { line } = file.getLineAndCharacterOfPosition(call.getStart(file));
          violations.push(`${name}:${line + 1} ${callee}() 인자가 모자란다`);
        }
      }
    }
    expect(checked).toBeGreaterThan(40);
    expect(violations).toEqual([]);
  });

  it("전역 번역 등록 함수는 studio-charm-copy.ts 밖에서 직접 부르지 않는다", () => {
    const direct: string[] = [];
    for (const { name, file } of charmSourceFiles()) {
      if (name === "studio-charm-copy.ts") continue;
      for (const call of callsOf(file, REGISTRATION_FUNCTIONS)) {
        const { line } = file.getLineAndCharacterOfPosition(call.getStart(file));
        direct.push(`${name}:${line + 1} ${(call.expression as ts.Identifier).text}()`);
      }
    }
    expect(direct).toEqual([]);
  });
});
