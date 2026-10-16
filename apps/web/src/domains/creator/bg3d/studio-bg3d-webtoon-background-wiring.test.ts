import { readdirSync, readFileSync } from "node:fs";

import ts from "typescript";
import { describe, expect, it } from "vitest";

// 웹툰 배경 선택기·방 만들기 패널이 편집기에 실제로 이어져 있고, 새 코드가 편집기 활성화 번들(정적 import 폐포)로
// 새어 들어가지 않는지 소스 수준에서 고정한다. 번들 기준선(scripts/bundle-baseline.json)의 여유가 작아서,
// 지연 로드 경계가 깨지면 빌드 게이트가 먼저 실패하기 전에 여기서 원인을 바로 알 수 있게 한다.

const DIRECTORY = new URL("./", import.meta.url);

function source(fileName: string): string {
  return readFileSync(new URL(fileName, DIRECTORY), "utf8");
}

interface ModuleEdges {
  readonly staticEdges: string[];
  readonly dynamicEdges: string[];
}

function moduleEdges(fileName: string): ModuleEdges {
  const sourceFile = ts.createSourceFile(
    fileName,
    source(fileName),
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const staticEdges: string[] = [];
  const dynamicEdges: string[] = [];
  const visit = (node: ts.Node): void => {
    // 값 import 와 값 re-export 만 정적 의존이다(import type / export type 은 번들에 들어가지 않는다).
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && !node.importClause?.isTypeOnly) {
      staticEdges.push(node.moduleSpecifier.text);
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) && !node.isTypeOnly) {
      staticEdges.push(node.moduleSpecifier.text);
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      dynamicEdges.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return { staticEdges, dynamicEdges };
}

function productionFiles(): string[] {
  return readdirSync(DIRECTORY)
    .filter((name) => /\.(ts|tsx)$/u.test(name) && !/\.(test|spec)\.(ts|tsx)$/u.test(name));
}

/** 이 디렉터리의 제품 코드 중 지정한 모듈을 정적으로 가져오는 파일. */
function staticImporters(specifier: string): string[] {
  return productionFiles().filter((name) => moduleEdges(name).staticEdges.includes(specifier)).sort();
}

const LAZY_MODULES = [
  "./StudioBg3dRoomBuilderPanel",
  "./StudioBg3dWebtoonBackgroundPicker",
  "./studio-bg3d-webtoon-background-templates",
  "./studio-bg3d-street-builder",
] as const;

describe("웹툰 배경·방 만들기 지연 로드 경계", () => {
  it("런타임 바인딩은 방 만들기 패널과 선택기를 import() 로만 가져온다", () => {
    const edges = moduleEdges("studio-bg3d-editor-runtime-bindings.ts");
    expect(edges.dynamicEdges).toEqual(expect.arrayContaining(["./StudioBg3dRoomBuilderPanel", "./StudioBg3dWebtoonBackgroundPicker"]));
    for (const lazy of LAZY_MODULES) expect(edges.staticEdges, lazy).not.toContain(lazy);
    const bindings = source("studio-bg3d-editor-runtime-bindings.ts");
    expect(bindings).toMatch(/export const StudioBg3dRoomBuilderPanel = createLazyComponent\(/u);
    expect(bindings).toMatch(/export const StudioBg3dWebtoonBackgroundPicker = createLazyComponent\(/u);
  });

  it("지연 모듈을 정적으로 가져오는 제품 코드는 정해진 곳뿐이다(편집기 활성화 번들로 새지 않는다)", () => {
    expect(staticImporters("./StudioBg3dRoomBuilderPanel")).toEqual([]);
    expect(staticImporters("./StudioBg3dWebtoonBackgroundPicker")).toEqual([]);
    expect(staticImporters("./studio-bg3d-webtoon-background-templates")).toEqual(["StudioBg3dWebtoonBackgroundPicker.tsx"]);
    expect(staticImporters("./studio-bg3d-street-builder")).toEqual(["studio-bg3d-webtoon-background-templates.ts"]);
  });

  it("활성화 번들에 남는 룸 빌더와 가구 모듈은 렌더러·무거운 의존을 끌어오지 않는다", () => {
    for (const file of ["studio-bg3d-room-builder.ts", "studio-bg3d-room-furniture.ts"]) {
      const edges = moduleEdges(file);
      expect(edges.dynamicEdges, file).toEqual([]);
      for (const edge of edges.staticEdges) expect(edge, `${file} -> ${edge}`).toMatch(/^(\.\/studio-bg3d-room-furniture|\.\.\/studio-id)$/u);
    }
  });

  it("선택기와 카탈로그·거리 생성기는 three 나 렌더러를 가져오지 않는다", () => {
    for (const file of ["StudioBg3dWebtoonBackgroundPicker.tsx", "studio-bg3d-webtoon-background-templates.ts", "studio-bg3d-street-builder.ts"]) {
      const edges = moduleEdges(file);
      expect(edges.dynamicEdges, file).toEqual([]);
      for (const edge of edges.staticEdges) {
        expect(edge, `${file} -> ${edge}`).not.toMatch(/^(three|@react-three\/)/u);
        expect(edge, `${file} -> ${edge}`).not.toMatch(/StudioBackground3D|runtime-bindings/u);
      }
    }
  });
});

describe("웹툰 배경·방 만들기 편집기 연결", () => {
  const sidebar = source("StudioBg3dEditorSidebar.tsx");
  const host = source("studio-bg3d-editor-scene-ops-host.ts");

  function expectInOrder(value: string, markers: readonly string[]): void {
    let cursor = -1;
    for (const marker of markers) {
      const next = value.indexOf(marker, cursor + 1);
      expect(next, marker).toBeGreaterThan(cursor);
      cursor = next;
    }
  }

  it("사이드바 템플릿 탭은 선택기를 맨 위에, 방 만들기 패널을 아래에 두고 둘 다 탭이 열렸을 때만 그린다", () => {
    expectInOrder(sidebar, [
      '<section hidden={hideOnTab("templates")}>',
      '{activePanelTab === "templates" ? (',
      "<StudioBg3dWebtoonBackgroundPicker",
      "onBuild={h.addGeneratedParts}",
      "씬 템플릿",
      "<StudioBg3dSceneTemplatePanel",
      "방 만들기",
      '{activePanelTab === "templates" ? (',
      "<StudioBg3dRoomBuilderPanel",
      "onInsert={() => addRoomBuild({ autoCutaway: roomAutoCutaway })}",
    ]);
  });

  it("선택기와 방 만들기 패널이 같은 자동 단면 상태를 공유하고 기본값은 켜짐이다", () => {
    expect(sidebar).toContain("const [roomAutoCutaway, setRoomAutoCutaway] = useState(true);");
    expect(sidebar.match(/autoCutaway=\{roomAutoCutaway\}/gu)).toHaveLength(2);
    expect(sidebar.match(/onAutoCutawayChange=\{setRoomAutoCutaway\}/gu)).toHaveLength(2);
  });

  it("두 패널은 모두 지연 로드 경계(Suspense) 안에 있다", () => {
    for (const component of ["<StudioBg3dWebtoonBackgroundPicker", "<StudioBg3dRoomBuilderPanel"]) {
      const index = sidebar.indexOf(component);
      expect(index, component).toBeGreaterThan(0);
      const before = sidebar.slice(Math.max(0, index - 400), index);
      expect(before, component).toContain("<Suspense");
    }
  });

  it("호스트는 도형 묶음 추가 경로 하나를 두고 합성·방 추가가 그 위에서 동작한다", () => {
    expect(host).toContain("h.addGeneratedParts = addGeneratedParts;");
    const composite = host.slice(host.indexOf("const addComposite = "), host.indexOf("h.addComposite = addComposite;"));
    expect(composite).toContain("addGeneratedParts(");
    const room = host.slice(host.indexOf("const addRoomBuild = "), host.indexOf("h.addRoomBuild = addRoomBuild;"));
    expect(room).toContain("addGeneratedParts(");
    expect(room).toContain("R.planStudioBg3dRoomBuild(roomBuilderSpec");
    expect(room).toContain("autoCutawayCamera: autoCutaway ? view : null");
  });
});
