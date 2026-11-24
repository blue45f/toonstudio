import { resolve } from "node:path";

import { loadConfigFromFile } from "vite";
import { expect, it } from "vitest";

it("첫 획의 필기음은 기본 import로 로드하고 다른 화면의 미리 읽기는 유지한다", async () => {
  const config = await loadConfigFromFile(
    { command: "build", mode: "production" }, resolve(import.meta.dirname, "../vite.config.ts"),
  );
  const preload = config?.config.build?.modulePreload;
  if (!preload || typeof preload !== "object" || !preload.resolveDependencies) {
    throw new Error("웹 빌드의 모듈 미리 읽기 정책을 찾지 못했습니다.");
  }
  const audio = "assets/studio-procedural-foley-audio-abc123.js";
  const shared = "assets/rolldown-runtime-abc123.js";
  const css = "assets/editor-abc123.css";
  const context = { hostId: "assets/studio-live-stroke-foley-bridge-abc123.js", hostType: "js" } as const;
  const resolveDeps = preload.resolveDependencies;
  expect(resolveDeps(audio, [audio, shared, css], context)).toEqual([css]);
  const panel = "assets/StudioPanel-abc123.js";
  expect(resolveDeps(panel, [panel, shared, css], context)).toEqual([panel, shared, css]);
});
