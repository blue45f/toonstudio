// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MemoryRouter } from "react-router-dom";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DICT } from "@/shared/lib/i18n-core";

import { downloadEcosystemJson } from "./ecosystem-preview";
import { ReaderFeedbackForm } from "./ReaderFeedbackForm";
import { ReaderFeedbackSummaryPanel } from "./ReaderFeedbackSummaryPanel";
import { createExampleReaderFeedback } from "./reader-feedback-example";

/**
 * 독자 피드백이 문서(docs/features/reader-feedback-summary.md)에 적은 개인정보·보안 약속을 지키는지 묶어 두는 테스트.
 * - 서버로 보내지 않는다: 소스가 네트워크 클라이언트를 가져오거나 부르지 않는다.
 * - HTML 로 해석하지 않는다: HTML 문자열을 심는 API 를 쓰지 않는다.
 * - 독자가 쓴 글은 화면 메모리 밖에 남지 않는다: 번역 문구 사전(외부 번역 서비스로 나갈 수 있는 글)과 브라우저 저장소에 들어가지 않는다.
 */
vi.mock("./ecosystem-preview", () => ({ downloadEcosystemJson: vi.fn() }));

const SOURCE_DIR = "apps/web/src/domains/creator/ecosystem";
const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

/** 이 기능의 화면·도메인 소스(시험 제외). */
const FEATURE_SOURCES = readdirSync(resolve(process.cwd(), SOURCE_DIR))
  .filter((name) => /^(?:ReaderFeedback[A-Za-z]*\.tsx|reader-feedback-[a-z-]+\.ts)$/u.test(name))
  .map((name) => ({ name, text: read(`${SOURCE_DIR}/${name}`) }));

/** 가져와도 되는 외부 모듈. 새로 늘리려면 외부 전송·개인정보 영향을 검토한 뒤 문서와 함께 고친다. */
const ALLOWED_PACKAGES: ReadonlySet<string> = new Set([
  "react",
  "react-router-dom",
  "lucide-react",
  "zod",
  "@/shared/lib/i18n-bilingual-copy",
  "@/shared/lib/utils",
]);
/** 같은 도메인의 기존 모듈 중 허용하는 것: 파일 내려받기 도우미(Blob + 객체 URL, 네트워크 없음). */
const ALLOWED_SIBLINGS: ReadonlySet<string> = new Set(["./ecosystem-preview"]);

const FORBIDDEN_APIS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bfetch\s*\(/u, "fetch"],
  [/\bXMLHttpRequest\b/u, "XMLHttpRequest"],
  [/\bsendBeacon\b/u, "navigator.sendBeacon"],
  [/\bnew\s+(?:WebSocket|EventSource|Image|Worker|SharedWorker)\b/u, "소켓·이미지 핑·워커"],
  [/\bimport\s*\(/u, "동적 import"],
  [/dangerouslySetInnerHTML|\.(?:inner|outer)HTML\b|insertAdjacentHTML|document\.write/u, "HTML 문자열 주입"],
  [/\beval\s*\(|\bnew\s+Function\b/u, "동적 코드 실행"],
  [/\bdocument\.cookie\b|\bindexedDB\b|\bsessionStorage\b/u, "쿠키·IndexedDB·sessionStorage"],
];

describe("독자 피드백 소스는 서버 전송·HTML 해석 없음 약속을 어기는 API 를 쓰지 않는다", () => {
  it("검사 대상 소스를 실제로 찾는다(빈 목록으로 통과하지 않는다)", () => {
    const names = FEATURE_SOURCES.map((source) => source.name);
    expect(names).toEqual(expect.arrayContaining([
      "ReaderFeedbackForm.tsx", "ReaderFeedbackSummaryPanel.tsx", "ReaderFeedbackGroupView.tsx",
      "reader-feedback-io.ts", "reader-feedback-import.ts", "reader-feedback-text.ts",
    ]));
    expect(names.length).toBeGreaterThanOrEqual(15);
  });

  it("가져오는 모듈은 허용 목록과 이 기능의 파일뿐이라 네트워크 클라이언트가 몰래 들어오지 않는다", () => {
    const own = new Set(FEATURE_SOURCES.map((source) => `./${source.name.replace(/\.tsx?$/u, "")}`));
    // `import {…} from "x"`, `export * from "x"` 와 부수효과만 있는 `import "x"` 를 모두 잡는다.
    const importSpecifier = /^\s*(?:(?:import|export)\b[^;"']*?\sfrom\s+|import\s+)["']([^"']+)["']/gmu;
    const found = new Set<string>();
    for (const { name, text } of FEATURE_SOURCES) {
      for (const match of text.matchAll(importSpecifier)) {
        const specifier = match[1]!;
        found.add(specifier);
        const allowed = specifier.startsWith("./") ? own.has(specifier) || ALLOWED_SIBLINGS.has(specifier) : ALLOWED_PACKAGES.has(specifier);
        expect(allowed, `${name}이 허용 목록에 없는 모듈 "${specifier}"을 가져옵니다. 외부 전송·개인정보 영향을 검토한 뒤 이 목록과 문서를 함께 고치세요`).toBe(true);
      }
    }
    // 정규식이 실제로 import 를 읽고 있다(아무것도 못 읽어 통과하는 일이 없다).
    expect(Array.from(found)).toEqual(expect.arrayContaining(["react", "zod", "./reader-feedback-schema"]));
  });

  it("네트워크·HTML 문자열 주입·동적 코드 실행 API 를 쓰지 않는다", () => {
    for (const { name, text } of FEATURE_SOURCES) {
      for (const [pattern, label] of FORBIDDEN_APIS) {
        expect(pattern.test(text), `${name}에서 ${label} 사용이 보입니다. 독자 응답을 서버로 보내거나 HTML 로 해석하지 않는다는 문서의 약속과 충돌합니다`).toBe(false);
      }
    }
  });

  it("localStorage 는 숨긴 의견 id 를 기억하는 요약 화면만 만진다", () => {
    expect(FEATURE_SOURCES.filter((source) => /\blocalStorage\b/u.test(source.text)).map((source) => source.name)).toEqual(["ReaderFeedbackSummaryPanel.tsx"]);
  });
});

/**
 * `bt(ko, en)` 는 넘긴 문자열 쌍을 번역 문구 사전에 올린다. 값(작품 이름·닉네임·의견·숫자)을 끼운 템플릿 문자열을 넘기면 값마다
 * 새 문구가 등록되어, 독자가 쓴 글이 사전(외부 번역 서비스로 나갈 수 있는 곳)에 들어간다. 값은 `{이름}` 자리표시자로 두고
 * `formatI18nTemplate` 로 번역 뒤에 채워야 한다. 호출 인자에 보간이 있는 템플릿 문자열·문자열 이어 붙이기가 있으면 찾아낸다.
 */
const COPY_FUNCTIONS: ReadonlySet<string> = new Set(["bt", "localize"]);

function dynamicCopyCalls(fileName: string, text: string): string[] {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const isDynamic = (node: ts.Node): boolean =>
    ts.isTemplateExpression(node)
    || (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken)
    || ts.forEachChild(node, (child) => (isDynamic(child) ? true : undefined)) === true;
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && COPY_FUNCTIONS.has(node.expression.text) && node.arguments.some(isDynamic)) {
      found.push(`${fileName}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe("문구 쌍(bt)에는 값을 끼우지 않는다", () => {
  it("검사기가 값이 끼는 호출을 실제로 찾아낸다(아무것도 못 찾아 통과하는 일이 없다)", () => {
    const sample = [
      "const a = bt(`회차는 ${max}`, `episode ${max}`);",
      'const b = bt("고정 문구", "fixed" + suffix);',
      'const c = localize(label.ko, `${label.en}!`);',
      'const ok = formatI18nTemplate(bt("회차는 {max}", "episode {max}"), { max });',
      "const fine = bt(LABELS[id].ko, LABELS[id].en);",
    ].join("\n");
    expect(dynamicCopyCalls("sample.tsx", sample)).toEqual(["sample.tsx:1", "sample.tsx:2", "sample.tsx:3"]);
  });

  it("이 기능의 소스는 bt()·localize() 인자에 템플릿 보간이나 문자열 이어 붙이기를 쓰지 않는다", () => {
    const found = FEATURE_SOURCES.flatMap(({ name, text }) => dynamicCopyCalls(name, text));
    expect(found, "값은 {이름} 자리표시자로 두고 formatI18nTemplate 로 채우세요(값마다 번역 키가 생기고, 독자가 쓴 글이 번역 사전에 들어갈 수 있습니다)").toEqual([]);
  });
});

const download = vi.mocked(downloadEcosystemJson);
const EXAMPLES = createExampleReaderFeedback();

/**
 * 독자가 쓴 값을 알아볼 수 있게 하는 표지. 화면 문구와 겹치지 않는다.
 * 번역 문구 사전은 시험 파일 안에서 공유되는 전역 상태라, 시험마다 다른 표지를 써서 어느 화면이 샜는지 가려지게 한다.
 */
const marks = (tag: string) => ({ title: `${tag}작품QZ`, nickname: `${tag}닉QZ`, comment: `${tag}의견QZ입니다`, file: `${tag}파일QZ` });

/** 문구 사전(ko·en 원문)에 등록된 모든 글. ko·en 이 아닌 언어에서는 이 글이 외부 번역 서비스로 나갈 수 있다. */
const registeredCopy = () => [...Object.values(DICT.ko), ...Object.values(DICT.en)];

const storedText = (storage: Storage) => Array.from({ length: storage.length }, (_, index) => {
  const key = storage.key(index) ?? "";
  return `${key}=${storage.getItem(key) ?? ""}`;
}).join("\n");

/** 표지가 번역 문구 사전이나 브라우저 저장소 어디에도 들어가지 않았음을 확인한다. */
function expectNoLeak(markers: ReturnType<typeof marks>) {
  const copy = registeredCopy();
  const stores = [storedText(window.localStorage), storedText(window.sessionStorage)];
  for (const mark of Object.values(markers)) {
    expect(copy.filter((text) => text.includes(mark)), `"${mark}"가 번역 문구 사전에 등록됐습니다`).toEqual([]);
    for (const store of stores) expect(store, `"${mark}"가 브라우저 저장소에 남았습니다`).not.toContain(mark);
  }
}

afterEach(() => {
  cleanup();
  download.mockClear();
  Reflect.deleteProperty(window.navigator, "clipboard");
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe("독자가 쓴 글은 화면 메모리 밖으로 새지 않는다", () => {
  it("작가용 요약: 가져온 제목·닉네임·의견·파일 이름이 번역 문구 사전이나 브라우저 저장소에 남지 않는다", async () => {
    const mark = marks("요약");
    const response = {
      ...EXAMPLES[2]!, id: "privacy-panel", nickname: mark.nickname, comment: mark.comment, spoiler: false,
      target: { kind: "manual" as const, id: null, title: mark.title, episode: 1 },
    };
    const file = new File([JSON.stringify({ kind: "toonstudio-reader-feedback", version: 1, exportedAt: "2026-10-16T01:05:00.000Z", responses: [response] })], `${mark.file}.json`, { type: "application/json" });
    render(<MemoryRouter><ReaderFeedbackSummaryPanel /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText(/응답 파일 선택/u), { target: { files: [file, new File(["{ 깨짐"], `${mark.file}-깨짐.json`)] } });
    await screen.findByText(/응답 1개 추가/u);
    // 값이 실제로 화면에 그려졌는데도(= 검사가 비어 있지 않다) 사전·저장소에는 없다.
    expect(screen.getAllByText(mark.comment).length).toBeGreaterThan(0);
    expect(screen.getAllByText(mark.nickname).length).toBeGreaterThan(0);
    expect(screen.getAllByText(new RegExp(mark.file, "u")).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: "이 의견 숨기기" })[0]!);
    expectNoLeak(mark);
  });

  it("독자용 폼: 쓴 제목·닉네임·의견이 저장·복사한 뒤에도 번역 문구 사전이나 브라우저 저장소에 남지 않는다", async () => {
    const mark = marks("폼");
    Object.defineProperty(window.navigator, "clipboard", { value: { writeText: vi.fn(async () => undefined) }, configurable: true });
    render(<ReaderFeedbackForm />);
    fireEvent.change(screen.getByLabelText("작품 이름"), { target: { value: mark.title } });
    fireEvent.click(screen.getByRole("radio", { name: "재밌었어요" }));
    fireEvent.change(screen.getByLabelText("자유 의견 (선택)"), { target: { value: mark.comment } });
    fireEvent.change(screen.getByLabelText("닉네임 (선택)"), { target: { value: mark.nickname } });
    fireEvent.click(screen.getByRole("button", { name: "파일로 저장" }));
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "내용 복사" }));
    await screen.findByText(/내용을 복사했어요/u);
    // 미리 보기에는 값이 있다(= 검사가 비어 있지 않다).
    expect((screen.getByLabelText("내보낼 파일 내용 (읽기 전용)") as HTMLTextAreaElement).value).toContain(mark.comment);
    expectNoLeak(mark);
  });
});
