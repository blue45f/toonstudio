import { describe, expect, it } from "vitest";

import { parseKraMaindoc } from "../kra-maindoc";
import { KRA_LIMITS, KraError, type KraErrorCode, type KraLimits } from "../kra-types";

const DOCTYPE = "<!DOCTYPE DOC PUBLIC '-//KDE//DTD krita 2.0//EN' 'http://www.calligra.org/DTD/krita-2.0.dtd'>";

function doc(body: string, head = `<?xml version="1.0" encoding="UTF-8"?>\n${DOCTYPE}\n`): string {
  return `${head}<DOC xmlns="http://www.calligra.org/DTD/krita" kritaVersion="5.2.2" syntaxVersion="2.0" editor="Krita"><IMAGE name="x" width="8" height="8" colorspacename="RGBA">${body}</IMAGE></DOC>`;
}

function codeOf(text: string, limits: KraLimits = KRA_LIMITS): KraErrorCode {
  try {
    parseKraMaindoc(text, limits);
  } catch (error) {
    if (error instanceof KraError) return error.code;
    throw error;
  }
  throw new Error("예외가 발생하지 않았다");
}

describe("maindoc.xml 파서", () => {
  it("Krita의 DOCTYPE 한 줄을 떼고 문서 정보와 이미지 속성을 읽는다", () => {
    const parsed = parseKraMaindoc(doc("<layers/>"), KRA_LIMITS);
    expect(parsed).toMatchObject({ editor: "Krita", kritaVersion: "5.2.2", syntaxVersion: "2.0", nodes: [], nodeCount: 0 });
    expect(parsed.image).toMatchObject({ name: "x", width: "8", height: "8", colorspacename: "RGBA" });
  });

  it("큰따옴표 식별자와 DOCTYPE이 없는 문서도 읽는다", () => {
    const quoted = `<?xml version="1.0"?>\n<!DOCTYPE DOC PUBLIC "-//KDE//DTD krita 2.0//EN" "http://www.calligra.org/DTD/krita-2.0.dtd">\n`;
    expect(parseKraMaindoc(doc("", quoted), KRA_LIMITS).image["name"]).toBe("x");
    expect(parseKraMaindoc(doc("", ""), KRA_LIMITS).image["name"]).toBe("x");
  });

  it("레이어, 중첩 그룹, 마스크를 위에서 아래 순서로 트리에 담는다", () => {
    const parsed = parseKraMaindoc(
      doc(
        `<layers>
          <layer name="top" nodetype="paintlayer"><masks><mask name="m1" nodetype="transparencymask"/><mask name="m2" nodetype="selectionmask"/></masks></layer>
          <layer name="grp" nodetype="grouplayer"><layers>
            <layer name="inner" nodetype="paintlayer"/>
            <layer name="deep" nodetype="grouplayer"><layers><layer name="leaf" nodetype="paintlayer"/></layers></layer>
          </layers></layer>
          <layer name="bottom" nodetype="paintlayer"/>
        </layers>`,
      ),
      KRA_LIMITS,
    );
    expect(parsed.nodes.map((node) => node.attributes["name"])).toEqual(["top", "grp", "bottom"]);
    expect(parsed.nodes[0]!.masks.map((mask) => [mask.element, mask.attributes["name"]])).toEqual([
      ["mask", "m1"],
      ["mask", "m2"],
    ]);
    const group = parsed.nodes[1]!;
    expect(group.children.map((child) => child.attributes["name"])).toEqual(["inner", "deep"]);
    expect(group.children[1]!.children[0]!.attributes["name"]).toBe("leaf");
    // 레이어 6개 + 마스크 2개
    expect(parsed.nodeCount).toBe(8);
  });

  it("속성 순서에 의존하지 않고 모든 속성을 문자열로 보존한다 (문서에 없는 키 포함)", () => {
    const parsed = parseKraMaindoc(doc('<layers><layer zzz="1" name="a" nodetype="paintlayer" future-key="값"/></layers>'), KRA_LIMITS);
    expect(parsed.nodes[0]!.attributes).toEqual({ zzz: "1", name: "a", nodetype: "paintlayer", "future-key": "값" });
  });

  it("속성 맵은 프로토타입이 없는 얼린 객체다", () => {
    const parsed = parseKraMaindoc(doc('<layers><layer name="a" hasOwnProperty-like="x"/></layers>'), KRA_LIMITS);
    const attributes = parsed.nodes[0]!.attributes;
    expect(Object.getPrototypeOf(attributes)).toBeNull();
    expect(Object.isFrozen(attributes)).toBe(true);
    expect(Object.keys(attributes).sort()).toEqual(["hasOwnProperty-like", "name"]);
  });

  it("Object.prototype 이름을 쓴 속성은 안전 XML 파서가 거부하고 프로토타입을 건드리지 않는다", () => {
    for (const name of ["__proto__", "constructor", "toString"]) {
      expect(codeOf(doc(`<layers><layer name="a" ${name}="x"/></layers>`))).toBe("maindoc-invalid");
    }
    expect(({} as Record<string, unknown>)["x"]).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(Object.prototype, "name")).toBe(false);
  });

  it("엔티티와 CDATA를 해석한다", () => {
    const parsed = parseKraMaindoc(doc('<layers><layer name="a &amp; b &lt;c&gt; &quot;d&quot; &#xD55C;"/></layers>'), KRA_LIMITS);
    expect(parsed.nodes[0]!.attributes["name"]).toBe('a & b <c> "d" 한');
  });

  it("루트가 DOC가 아니면 거부한다", () => {
    expect(codeOf('<?xml version="1.0"?><NOTDOC><IMAGE/></NOTDOC>')).toBe("maindoc-invalid");
  });

  it("IMAGE가 없으면 거부한다", () => {
    expect(codeOf('<?xml version="1.0"?><DOC xmlns="http://www.calligra.org/DTD/krita"></DOC>')).toBe("maindoc-invalid");
  });

  it.each([
    ["XML이 아님", "not xml at all"],
    ["닫히지 않은 요소", "<DOC><IMAGE name='x'>"],
    ["빈 문서", ""],
  ])("잘못된 XML을 거부한다: %s", (_label, text) => {
    expect(codeOf(text)).toBe("maindoc-invalid");
  });

  describe("적대적 DOCTYPE과 엔티티", () => {
    it("내부 부분집합이 있는 DOCTYPE은 떼지 않고 거부한다", () => {
      const evil = `<?xml version="1.0"?>\n<!DOCTYPE DOC PUBLIC '-//KDE//DTD krita 2.0//EN' 'x' [ <!ENTITY a "AAAA"> ]>\n<DOC><IMAGE name="&a;"/></DOC>`;
      expect(codeOf(evil)).toBe("maindoc-invalid");
    });

    it("외부 엔티티 시도를 거부한다", () => {
      const evil = `<?xml version="1.0"?>\n<!DOCTYPE DOC SYSTEM "file:///etc/passwd">\n<DOC><IMAGE name="x"/></DOC>`;
      expect(codeOf(evil)).toBe("maindoc-invalid");
    });

    it("엔티티 폭발(billion laughs)을 거부한다", () => {
      const lol = `<?xml version="1.0"?>\n<!DOCTYPE DOC [ <!ENTITY a "aaaaaaaaaa"> <!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;"> ]>\n<DOC><IMAGE name="&b;"/></DOC>`;
      expect(codeOf(lol)).toBe("maindoc-invalid");
    });

    it("본문 중간의 DOCTYPE은 거부한다", () => {
      expect(codeOf(`<DOC><IMAGE name="x"/><!DOCTYPE DOC PUBLIC 'a' 'b'></DOC>`)).toBe("maindoc-invalid");
    });

    it("정의하지 않은 엔티티와 잘못된 문자 참조를 거부하고, 엔티티를 한 단계만 풀어 이중 확장하지 않는다", () => {
      expect(codeOf(doc('<layers><layer name="&undefined;"/></layers>'))).toBe("maindoc-invalid");
      expect(codeOf(doc('<layers><layer name="&#x110000;"/></layers>'))).toBe("maindoc-invalid");
      const parsed = parseKraMaindoc(doc('<layers><layer name="&amp;amp; &lt;&lt;"/></layers>'), KRA_LIMITS);
      expect(parsed.nodes[0]!.attributes["name"]).toBe("&amp; <<");
    });
  });

  describe("오류 메시지", () => {
    it("파일에서 온 긴 문자열을 메시지에 그대로 싣지 않는다", () => {
      for (const text of [`<${"a".repeat(100_000)}/>`, `<${"a".repeat(100_000)}><IMAGE/></${"a".repeat(100_000)}>`, `<DOC ${"a".repeat(100_000)}="1"/>`]) {
        try {
          parseKraMaindoc(text, KRA_LIMITS);
          throw new Error("예외가 발생하지 않았다");
        } catch (error) {
          expect(error).toBeInstanceOf(KraError);
          expect((error as KraError).message.length).toBeLessThan(400);
        }
      }
    });
  });

  describe("한도", () => {
    const layers = (count: number) => `<layers>${'<layer name="a"/>'.repeat(count)}</layers>`;

    it("노드 수가 한도를 넘으면 거부한다 (마스크도 센다)", () => {
      expect(codeOf(doc(layers(5)), { ...KRA_LIMITS, maxNodes: 4 })).toBe("limit-exceeded");
      expect(() => parseKraMaindoc(doc(layers(4)), { ...KRA_LIMITS, maxNodes: 4 })).not.toThrow();
      const withMasks = '<layers><layer name="a"><masks><mask name="m"/><mask name="n"/></masks></layer></layers>';
      expect(codeOf(doc(withMasks), { ...KRA_LIMITS, maxNodes: 2 })).toBe("limit-exceeded");
    });

    it("그룹 중첩이 한도를 넘으면 거부한다", () => {
      const nested = (depth: number): string =>
        depth === 0 ? '<layer name="leaf"/>' : `<layer name="g${depth}"><layers>${nested(depth - 1)}</layers></layer>`;
      const text = doc(`<layers>${nested(5)}</layers>`);
      expect(codeOf(text, { ...KRA_LIMITS, maxGroupDepth: 5 })).toBe("limit-exceeded");
      expect(() => parseKraMaindoc(text, { ...KRA_LIMITS, maxGroupDepth: 6 })).not.toThrow();
    });

    it("문자 수가 한도를 넘으면 파싱 전에 거부한다 (한도와 같으면 받아들인다)", () => {
      const text = doc("<layers/>");
      expect(codeOf(text, { ...KRA_LIMITS, maxMaindocCharacters: text.length - 1 })).toBe("limit-exceeded");
      expect(() => parseKraMaindoc(text, { ...KRA_LIMITS, maxMaindocCharacters: text.length })).not.toThrow();
    });

    it("기본 한도에서 그룹 중첩 64단계는 읽고 65단계는 거부한다", () => {
      const nested = (level: number): string =>
        level === 0 ? '<layer name="leaf"/>' : `<layer name="g${level}"><layers>${nested(level - 1)}</layers></layer>`;
      // 그룹 63개 + 잎 1개 = 64단계
      expect(() => parseKraMaindoc(doc(`<layers>${nested(63)}</layers>`), KRA_LIMITS)).not.toThrow();
      expect(codeOf(doc(`<layers>${nested(64)}</layers>`))).toBe("limit-exceeded");
    });

    it("기본 한도에서 노드 20,000개는 읽고 20,001개는 거부한다", () => {
      const layers = (count: number) => `<layers>${'<layer name="a"/>'.repeat(count)}</layers>`;
      expect(parseKraMaindoc(doc(layers(20_000)), KRA_LIMITS).nodeCount).toBe(20_000);
      expect(codeOf(doc(layers(20_001)))).toBe("limit-exceeded");
    });
  });
});
