import { readFile } from "node:fs/promises";

import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { compactSvgStructureWhitespace } from "../../apps/web/config/compact-svg-structure";

const root = new URL("../../apps/web/public/", import.meta.url);

describe("고정 SVG 복사본의 구조 공백 압축", () => {
  it("도형 사이 들여쓰기만 제거하고 따옴표 안의 >와 속성은 보존한다", () => {
    expect(compactSvgStructureWhitespace('<svg>\n  <g aria-label="x > y">\n    <path d="M 1 2 L 3 4"/>\n  </g>\n</svg>\n'))
      .toBe('<svg><g aria-label="x > y"><path d="M 1 2 L 3 4"/></g></svg>\n');
  });

  it.each(["text", "tspan", "textPath", "title", "desc", "foreignObject", "style", "script", "metadata"])(
    "%s 영역 안의 의미 있는 공백은 그대로 둔다", (name) => {
      const block = `<${name}> \n  <![CDATA[ a < b  c ]]> \n </${name}>`;
      expect(compactSvgStructureWhitespace(`<svg>\n ${block}\n <path/>\n</svg>`))
        .toBe(`<svg>${block}<path/></svg>`);
    },
  );

  it("중첩된 text/tspan과 xml:space=preserve는 후손의 공백까지 보존한다", () => {
    const text = '<text>시작 <tspan> 중간 </tspan> 끝</text>';
    const preserved = '<g xml:space="preserve"> \n <g> \n <path/> \n </g> \n </g>';
    expect(compactSvgStructureWhitespace(`<svg>\n${text}\n${preserved}\n</svg>`))
      .toBe(`<svg>${text}${preserved}</svg>`);
  });

  it("라이선스 주석, 처리 지시문과 CDATA를 바이트 그대로 보존한다", () => {
    const comment = '<!-- Copyright holder\n  SPDX-License-Identifier: MIT\n -->';
    const cdata = '<![CDATA[ <g>  공백 </g> ]]>';
    expect(compactSvgStructureWhitespace(`<?xml version="1.0"?><svg>\n${comment}\n${cdata}\n</svg>`))
      .toBe(`<?xml version="1.0"?><svg>${comment}${cdata}</svg>`);
  });

  it.each(['<!DOCTYPE svg><svg> \n <path/> \n </svg>', '<svg> \n <g> \n </svg>'])(
    "안전하게 해석할 수 없는 XML은 원본을 유지한다", (source) => {
      expect(compactSvgStructureWhitespace(source)).toBe(source);
    },
  );

  it.each(["brand/production-os-hero.svg", "brand/production-os-workspace.svg"])(
    "%s의 속성·그림·사용자 문구·메타데이터를 보존하고 반복 실행은 동일하다", async (file) => {
      const source = await readFile(new URL(file, root), "utf8");
      const compact = compactSvgStructureWhitespace(source);
      const before = new JSDOM(source, { contentType: "image/svg+xml" });
      const after = new JSDOM(compact, { contentType: "image/svg+xml" });
      try {
        const elements = (dom) => [...dom.window.document.querySelectorAll("*")].map((element) => ({
          name: element.tagName,
          attributes: [...element.attributes].map((attribute) => [attribute.name, attribute.value]),
          text: ["text", "tspan", "textPath", "title", "desc", "metadata", "style", "script"].includes(element.localName)
            ? element.innerHTML : null,
        }));
        expect(elements(after)).toEqual(elements(before));
        expect(compactSvgStructureWhitespace(compact)).toBe(compact);
        expect(Buffer.byteLength(compact)).toBeLessThan(Buffer.byteLength(source));
      } finally {
        before.window.close(); after.window.close();
      }
    },
  );
});
