import { readFileSync } from "node:fs";

import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * 에디터 시작 경로(Studio 라우트 정적 폐포)의 번들 경계.
 *
 * 2026-10-15 CI(실행 38658151982)의 Studio 번들 기준선 실패에서 아래 세 경계가
 * 정적 폐포 증가의 대부분이었다. 경계를 되돌리면 이 테스트가 먼저 실패한다.
 *
 * 1) 조건부 표면 슬롯 — 에디터가 상시 렌더하지만 표면은 조건(URL 맥락·딥링크)이 있을 때만
 *    존재한다. 슬롯 파일이 무거운 본체를 정적으로 import하면 그 표면이 없는 대부분의
 *    에디터 진입도 본체 청크 묶음을 내려받는다. 슬롯은 조건을 값싸게 판정하고 본체는
 *    동적 import로만 연다.
 *    - 회차 단계 칩: 제작 허브 모델 청크 묶음 약 190KB raw
 *    - 강좌 실습 미션 바: 강좌 콘텐츠 약 47KB raw
 * 2) 시작 경로가 정적으로 import하는 순수 코어 — 퍼지 검색 엔진(fuse.js·es-hangul)을
 *    끌어오면 대사 검색 패널을 열지 않는 에디터 진입도 약 31KB raw(gzip 약 11.5KB)를
 *    내려받는다. 검색은 지연 로딩 패널만 쓰는 별도 모듈(studio-dialogue-batch-search)에 둔다.
 */

interface LazyGate {
  readonly name: string;
  /** 슬롯(상시 렌더되는 얇은 파일). 본체를 정적으로 import하면 안 된다. */
  readonly slot: string;
  /** 지연 로딩되는 본체. */
  readonly body: string;
  /** 슬롯이 동적 import로 여는 모듈 지정자(정확히 이 하나). */
  readonly dynamicSpecifier: string;
  /** 슬롯이 정적으로 import하면 안 되는 지정자(본체와 본체가 끌어오는 무거운 경계). */
  readonly forbiddenInSlot: readonly string[];
  /** 무거운 경계는 본체만 소유한다. */
  readonly ownedByBody: readonly string[];
  /** 슬롯을 장착하는 호스트: 슬롯만 참조하고 본체는 정적·동적 어느 쪽으로도 참조하지 않는다. */
  readonly host: {
    readonly file: string;
    readonly slotSpecifier: string;
    readonly bodySpecifier: string;
  };
}

const GATES: readonly LazyGate[] = [
  {
    name: "에디터 헤더 회차 단계 칩",
    slot: "studio-shell/StudioEpisodeStageChipSlot.tsx",
    body: "studio-shell/StudioEpisodeStageChip.tsx",
    dynamicSpecifier: "./StudioEpisodeStageChip",
    forbiddenInSlot: [
      "../public/episode-stage",
      "../public/production-projects",
      "@/shared/components/episode-stage-stepper",
      "./StudioEpisodeStageChip",
    ],
    ownedByBody: ["../public/episode-stage", "../public/production-projects"],
    host: {
      file: "studio-router/StudioDocumentLayout.tsx",
      slotSpecifier: "../studio-shell/StudioEpisodeStageChipSlot",
      bodySpecifier: "../studio-shell/StudioEpisodeStageChip",
    },
  },
  {
    name: "강좌 실습 미션 바",
    slot: "studio-cuttoon-editor/StudioLessonMissionBarSlot.tsx",
    body: "StudioLessonMissionBar.tsx",
    dynamicSpecifier: "../StudioLessonMissionBar",
    forbiddenInSlot: [
      "../StudioLessonMissionBar",
      "../studio-lesson-mission",
      "@/domains/learn/public/learning-practice",
    ],
    ownedByBody: ["@/domains/learn/public/learning-practice"],
    host: {
      file: "studio-cuttoon-editor/StudioCuttoonEditorCanvasColumn.tsx",
      slotSpecifier: "./StudioLessonMissionBarSlot",
      bodySpecifier: "../StudioLessonMissionBar",
    },
  },
];

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function parse(relativePath: string): ts.SourceFile {
  return ts.createSourceFile(
    relativePath,
    read(relativePath),
    ts.ScriptTarget.Latest,
    true,
    relativePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

/**
 * `import type`·`export type`이 아닌 정적 import/export-from 모듈 지정자.
 * verbatimModuleSyntax에서는 `import { type A }`도 부수효과 import로 남으므로
 * 인라인 type 지정자만 있는 선언도 값 import로 센다(보수적 판정).
 */
function staticValueSpecifiers(sourceFile: ts.SourceFile): readonly string[] {
  const specifiers: string[] = [];
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      if (statement.importClause?.isTypeOnly) continue;
      if (ts.isStringLiteral(statement.moduleSpecifier)) specifiers.push(statement.moduleSpecifier.text);
    } else if (
      ts.isExportDeclaration(statement)
      && !statement.isTypeOnly
      && statement.moduleSpecifier !== undefined
      && ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      specifiers.push(statement.moduleSpecifier.text);
    }
  }
  return specifiers;
}

function dynamicImportSpecifiers(sourceFile: ts.SourceFile): readonly string[] {
  const specifiers: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node)
      && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments.length > 0
    ) {
      const [first] = node.arguments;
      if (first !== undefined && ts.isStringLiteralLike(first)) specifiers.push(first.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return specifiers;
}

describe("Studio 시작 경로 지연 로딩 슬롯 경계", () => {
  describe.each(GATES)("$name", (gate) => {
    it("슬롯은 본체와 무거운 경계를 정적으로 import하지 않는다", () => {
      const specifiers = staticValueSpecifiers(parse(gate.slot));
      for (const forbidden of gate.forbiddenInSlot) {
        expect(specifiers).not.toContain(forbidden);
      }
    });

    it("본체는 슬롯의 동적 import 한 곳으로만 열린다", () => {
      expect(dynamicImportSpecifiers(parse(gate.slot))).toEqual([gate.dynamicSpecifier]);
    });

    it("무거운 경계는 지연 로딩되는 본체만 소유한다", () => {
      const specifiers = staticValueSpecifiers(parse(gate.body));
      for (const owned of gate.ownedByBody) {
        expect(specifiers).toContain(owned);
      }
    });

    it("호스트는 슬롯만 장착하고 본체를 직접 참조하지 않는다", () => {
      const host = parse(gate.host.file);
      expect(staticValueSpecifiers(host)).toContain(gate.host.slotSpecifier);
      expect(staticValueSpecifiers(host)).not.toContain(gate.host.bodySpecifier);
      expect(dynamicImportSpecifiers(host)).not.toContain(gate.host.bodySpecifier);
    });
  });
});

describe("슬롯이 시작 경로에서 쓰는 값싼 판정 모듈", () => {
  it("딥링크 주소 모양 판정은 어떤 모듈도 import하지 않는다", () => {
    expect(
      staticValueSpecifiers(parse("studio-cuttoon-editor/studio-lesson-mission-link-shape.ts")),
    ).toEqual([]);
  });

  it("미션 바 슬롯이 정적으로 import하는 로컬 모듈은 그 판정 모듈뿐이다", () => {
    const local = staticValueSpecifiers(parse("studio-cuttoon-editor/StudioLessonMissionBarSlot.tsx"))
      .filter((specifier) => specifier.startsWith("."));
    expect(local).toEqual(["./studio-lesson-mission-link-shape"]);
  });
});

describe("시작 경로 순수 코어는 퍼지 검색 엔진을 끌어오지 않는다", () => {
  const SEARCH_ENGINE = "@/shared/lib/fuzzy-search";

  it("대사 일괄 편집 순수 코어는 검색 엔진을 import하지 않는다", () => {
    expect(staticValueSpecifiers(parse("lettering/studio-dialogue-batch.ts"))).not.toContain(SEARCH_ENGINE);
  });

  it("검색 엔진은 대사 검색 모듈만 소유하고, 소비자는 지연 로딩 패널이다", () => {
    expect(staticValueSpecifiers(parse("lettering/studio-dialogue-batch-search.ts"))).toContain(SEARCH_ENGINE);
    expect(staticValueSpecifiers(parse("StudioDialogueBatchPanel.tsx"))).toContain(
      "./lettering/studio-dialogue-batch-search",
    );
  });

  it("대사 일괄 편집 패널은 시작 경로가 아니라 지연 로딩 레지스트리로만 열린다", () => {
    const registry = parse("studio-page-lazy-ui.ts");
    expect(dynamicImportSpecifiers(registry)).toContain("./StudioDialogueBatchPanel");
    expect(staticValueSpecifiers(registry)).not.toContain("./StudioDialogueBatchPanel");
  });
});
