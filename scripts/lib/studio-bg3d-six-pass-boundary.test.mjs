import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { buildEagerGraph } from "./studio-eager-graph.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const bg3d = "apps/web/src/domains/creator/bg3d/";

describe("6패스 LT Worker의 순수 래스터 경계", () => {
  it.each([
    "studio-bg3d-lt-render.worker.ts",
    "studio-bg3d-shot-png.worker.ts",
    "studio-bg3d-shot-png-worker-client.ts",
  ])("%s가 장면 편집기·번역·React 런타임을 정적으로 가져오지 않는다", (entry) => {
    const graph = buildEagerGraph({ root, entries: [bg3d + entry] });
    expect(graph.unresolved).toEqual([]);
    const forbidden = [...graph.modules.keys()].filter((file) =>
      file.includes("/shared/lib/i18n")
      || file.includes("/shared/i18n/")
      || file.endsWith("/studio-bg3d-scene-document.ts")
      || file.endsWith("/studio-bg3d-sketchup-webtoon-staging-bridge.ts"));
    expect(forbidden.map((file) => graph.shortestPath(file))).toEqual([]);
    expect([...graph.externalPackages.keys()].filter((name) =>
      name === "react" || name === "react-dom")).toEqual([]);
  });
});
