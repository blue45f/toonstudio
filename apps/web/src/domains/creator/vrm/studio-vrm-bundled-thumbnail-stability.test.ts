import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { SAMPLE_VRM_ENTRIES } from "./vrm-library";

const runtime = readFileSync(new URL("./useStudioVrmPoserRuntimeD.ts", import.meta.url), "utf8");
const panel = readFileSync(new URL("./StudioVrmCharacterLibraryPanel.tsx", import.meta.url), "utf8");
const preview = readFileSync(new URL("./StudioVrmCharacterPreviewImage.tsx", import.meta.url), "utf8");

describe("bundled VRM thumbnail stability", () => {
  it("ships real same-origin thumbnails for every bundled picker entry", () => {
    expect(SAMPLE_VRM_ENTRIES.length).toBeGreaterThan(0);
    for (const entry of SAMPLE_VRM_ENTRIES) {
      expect(entry.thumbnail).toMatch(/^\/assets\/3d\/characters\/thumbnails\//u);
    }
  });

  it("never evicts bundled cards when the uploaded thumbnail window moves", () => {
    const start = runtime.indexOf("const handleVisibleVrmThumbnailWindow");
    const end = runtime.indexOf("useEffect(() => {", start);
    const handler = runtime.slice(start, end);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(handler).toContain('entry.source === "sample"');
    expect(handler).not.toContain('startsWith("/vrm/thumbnails/")');
    expect(handler).toContain('return { ...entry, thumbnail: null }');
  });

  it("keeps a stable preview box while decoding product card art", () => {
    expect(panel).toContain("<StudioVrmCharacterPreviewImage");
    expect(preview).toContain('decoding="async"');
    expect(preview).toContain('loading="eager"');
    expect(preview).toContain("setDisplayedSrc(candidate.src)");
  });

  it("자동 썸네일은 보정 대기 동안 수동 원고 캡처를 차단하지 않는다", () => {
    const start = runtime.indexOf("const scheduleCapture = () =>");
    const pending = runtime.indexOf("const pendingGrip = pendingStudioVrmGripSettlement(vrm, controller.signal)", start);
    expect(start).toBeGreaterThan(0);
    expect(pending).toBeGreaterThan(start);
    expect(runtime.slice(0, start)).not.toContain('acquireVrmCaptureOperation("thumbnail")');
    expect(runtime.slice(start, pending)).toContain('!acquireVrmCaptureOperation("thumbnail")');
    expect(runtime.slice(pending)).toContain("pendingGrip.then(scheduleCapture");
    expect(runtime.slice(pending)).toContain("controller.abort()");
  });
});
