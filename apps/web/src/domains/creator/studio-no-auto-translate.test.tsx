// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { acquireStudioNoAutoTranslate, useStudioNoAutoTranslate } from "./studio-no-auto-translate";

function Probe() {
  useStudioNoAutoTranslate();
  return null;
}

afterEach(() => {
  cleanup();
  document.body.removeAttribute("translate");
});

describe("편집기 자동 번역 끄기", () => {
  it("편집기가 떠 있는 동안만 body 에 translate=no 를 걸고, 닫으면 속성을 지운다", () => {
    expect(document.body.hasAttribute("translate")).toBe(false);
    const view = render(<Probe />);
    expect(document.body.getAttribute("translate")).toBe("no");
    view.unmount();
    expect(document.body.hasAttribute("translate")).toBe(false);
  });

  it("편집기가 오기 전의 값이 있으면 닫을 때 그 값으로 되돌린다", () => {
    document.body.setAttribute("translate", "yes");
    const view = render(<Probe />);
    expect(document.body.getAttribute("translate")).toBe("no");
    view.unmount();
    expect(document.body.getAttribute("translate")).toBe("yes");
  });

  it("편집기가 둘 이상 떠 있으면 마지막 하나가 닫힐 때까지 유지한다", () => {
    const first = render(<Probe />);
    const second = render(<Probe />);
    first.unmount();
    expect(document.body.getAttribute("translate")).toBe("no");
    second.unmount();
    expect(document.body.hasAttribute("translate")).toBe(false);
  });

  it("해제 함수를 여러 번 불러도 다른 보유자의 몫을 건드리지 않는다", () => {
    const release = acquireStudioNoAutoTranslate();
    const other = acquireStudioNoAutoTranslate();
    release();
    release();
    expect(document.body.getAttribute("translate")).toBe("no");
    other();
    expect(document.body.hasAttribute("translate")).toBe(false);
  });

  it("렌더가 끝난 같은 동기 구간(번역기의 마이크로태스크보다 앞)에 이미 속성이 붙어 있다", async () => {
    const view = render(<Probe />);
    // render() 는 act 로 커밋과 레이아웃 효과를 동기로 끝낸다 — 마이크로태스크를 한 번도 비우기 전이다.
    expect(document.body.getAttribute("translate")).toBe("no");
    await Promise.resolve();
    expect(document.body.getAttribute("translate")).toBe("no");
    view.unmount();
  });
});

describe("편집기 자동 번역 끄기 — 배선 계약", () => {
  const root = process.cwd();

  it("편집기 어댑터가 훅을 부른다", () => {
    const source = readFileSync(resolve(root, "apps/web/src/domains/creator/studio-legacy-editor-adapter.tsx"), "utf8");
    expect(source).toMatch(/import \{ useStudioNoAutoTranslate \} from "\.\/studio-no-auto-translate";/u);
    expect(source).toMatch(/\n\s+useStudioNoAutoTranslate\(\);\n/u);
  });

  it("공개 사이트의 번역을 막지 않도록 index.html 에는 notranslate·translate=no 를 두지 않는다", () => {
    const html = readFileSync(resolve(root, "apps/web/index.html"), "utf8");
    expect(html).not.toMatch(/notranslate/iu);
    expect(html).not.toMatch(/translate\s*=\s*["']no["']/iu);
  });
});
