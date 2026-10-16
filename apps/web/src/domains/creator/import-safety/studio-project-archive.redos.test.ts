import { describe, expect, it } from "vitest";

import { buildStudioProjectArchive } from "../studio-project-archive";

/**
 * 프로젝트 아카이브에 실린 OBJ 첨부의 재질 파일(mtllib) 참조 검사 시간 회귀 테스트(CodeQL js/polynomial-redos).
 *
 * 아카이브는 다른 사람이 만든 프로젝트 파일(공유·템플릿·마켓)이라 첨부 크기가 가져오는 쪽의 통제 밖이다.
 * 줄 첫머리 공백을 `^\s*` 로 읽으면 빈 줄이 길게 이어질 때 줄마다 남은 빈 줄 열을 끝까지 다시 읽어 입력 길이의 제곱 시간이 든다.
 * 아래 입력은 수정 전 구현에서 빈 줄 15만 개가 17초, 공백 줄 10만 개가 20초 걸렸다(시간이 입력 길이의 제곱이라 빈 줄 6만 개는 2.5~3.3초).
 * 선형 시간이면 아카이브를 만드는 전체 시간도 수백 ms 안에 끝난다. 상한은 ZIP 조립·해시까지 포함하므로 느린 CI 에서도 흔들리지
 * 않게 5초로 넉넉히 두되, 수정 전 구현은 그 몇 배가 걸려 이 상한을 확실히 넘도록 입력을 키웠다.
 */
const LINEAR_TIME_BUDGET_MS = 5_000;

const encoder = new TextEncoder();

function projectWithObj() {
  return {
    version: 2,
    title: "기억 시장",
    description: "obj attachment",
    tagsText: "판타지",
    pagesList: [{
      id: "page-1",
      elements: [{ id: "obj-link", type: "custom", obj: "pending" }],
      bg: "#ffffff",
      bgGrad: null,
      canvasH: 1_080,
    }],
    currentPageId: "page-1",
    webtoonTheme: "classic",
    panelGutter: 24,
  };
}

async function buildWithObj(objText: string) {
  const startedAt = performance.now();
  const result = await buildStudioProjectArchive(
    {
      project: projectWithObj(),
      attachments: [{
        kind: "obj",
        data: encoder.encode(objText),
        mimeType: "text/plain",
        documentReferences: [{ pointer: "/pagesList/0/elements/0/obj", usage: "obj" }],
      }],
    },
    { crc32ExecutionMode: "direct-headless" },
  );
  return { result, elapsedMs: performance.now() - startedAt };
}

function externalDependencyCount(result: Awaited<ReturnType<typeof buildWithObj>>["result"]): number {
  return result.diagnostics.filter(({ code }) => code === "EXTERNAL_ATTACHMENT_DEPENDENCY").length;
}

describe("OBJ 첨부의 mtllib 참조 검사", () => {
  it("빈 줄이 길게 이어져도 제곱 시간이 되지 않는다", async () => {
    const { result, elapsedMs } = await buildWithObj(`# 빈 줄이 긴 OBJ\n${"\n".repeat(150_000)}o Cube\nv 0 0 0\n`);
    expect(externalDependencyCount(result)).toBe(0);
    expect(elapsedMs, "아카이브 조립 소요(ms)").toBeLessThan(LINEAR_TIME_BUDGET_MS);
  });

  it("공백만 든 줄이 길게 이어져도 제곱 시간이 되지 않는다", async () => {
    const { result, elapsedMs } = await buildWithObj(`# 공백 줄이 긴 OBJ\n${"  \n".repeat(100_000)}o Cube\nv 0 0 0\n`);
    expect(externalDependencyCount(result)).toBe(0);
    expect(elapsedMs, "아카이브 조립 소요(ms)").toBeLessThan(LINEAR_TIME_BUDGET_MS);
  });

  it("긴 빈 줄 뒤의 mtllib 도 그대로 찾아 경고한다", async () => {
    const { result, elapsedMs } = await buildWithObj(`# c\n${"\n".repeat(100_000)}mtllib material.mtl\no Cube\nv 0 0 0\n`);
    expect(externalDependencyCount(result)).toBe(1);
    expect(elapsedMs, "아카이브 조립 소요(ms)").toBeLessThan(LINEAR_TIME_BUDGET_MS);
  });

  it.each([
    ["첫 줄의 mtllib", "mtllib material.mtl\no Cube\nv 0 0 0\n", 1],
    ["들여쓴 mtllib", "# c\n   \tmtllib material.mtl\nv 0 0 0\n", 1],
    ["빈 줄 뒤의 mtllib", "# c\n\n\n  mtllib m.mtl\nv 0 0 0\n", 1],
    ["CRLF 줄바꿈의 mtllib", "# c\r\nmtllib m.mtl\r\nv 0 0 0\r\n", 1],
    ["이름 앞에 공백이 여럿인 mtllib", "# c\nmtllib    m.mtl\nv 0 0 0\n", 1],
    ["파일 이름이 다음 줄에 있는 mtllib", "# c\nmtllib\nm.mtl\nv 0 0 0\n", 1],
    ["파일 이름이 없는 mtllib", "# c\nmtllib\nv 0 0 0\n", 1],
    ["줄 중간의 mtllib 글자는 지시어가 아니다", "# see mtllib m.mtl\nv 0 0 0\n", 0],
    ["파일 이름 없이 끝나는 mtllib", "# c\nv 0 0 0\nmtllib   ", 0],
    ["mtllib 이 없는 OBJ", "# c\no Cube\nv 0 0 0\nf 1 1 1\n", 0],
  ])("%s", async (_label, objText, expectedWarnings) => {
    const { result } = await buildWithObj(objText);
    expect(externalDependencyCount(result)).toBe(expectedWarnings);
  });
});
