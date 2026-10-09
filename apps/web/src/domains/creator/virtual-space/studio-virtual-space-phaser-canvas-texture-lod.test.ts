import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { STUDIO_TEXTURE_LOD_FLAG_KEY } from "./studio-virtual-space-texture-lod";

const canvas = readFileSync(new URL("./StudioVirtualSpacePhaserCanvas.tsx", import.meta.url), "utf8");

describe("월드 캔버스의 화면 밀도 텍스처 사본 연결", () => {
  it("픽셀 아트 화풍 여부를 넘겨 사본 사용 여부를 정하고, 끄기 스위치의 저장소 키는 문서·PR에 적힌 값과 같다", () => {
    expect(canvas).toContain("textureLod = createStudioTextureLod(this, { pixelated: artProfile.pixelated });");
    expect(STUDIO_TEXTURE_LOD_FLAG_KEY).toBe("toonspectrum:virtual-space-texture-lod");
  });

  it("장면이 사라질 때 사본 GPU 텍스처가 함께 해제된다", () => {
    expect(canvas).toMatch(/cleanup\.push\(\(\) => textureLod\?\.dispose\(\)\);/u);
  });

  it("매 프레임 갱신은 글자 해상도 동기화 뒤에서, 장면이 준비되기 전 반환 아래에서 부른다", () => {
    const sync = canvas.indexOf("textResolution?.sync(");
    const update = canvas.indexOf("textureLod?.update(time);");
    const ready = canvas.indexOf("if (!sceneReady || cancelled) return;");
    expect(sync, "글자 해상도 동기화 호출이 있어야 한다").toBeGreaterThan(-1);
    expect(update, "텍스처 사본 갱신 호출이 있어야 한다").toBeGreaterThan(-1);
    expect(ready, "준비 전 반환이 있어야 한다").toBeGreaterThan(-1);
    expect(ready).toBeLessThan(update);
    expect(sync).toBeLessThan(update);
  });

  it("화면 크기나 화면 배율이 바뀌면 사본을 다시 판정한다", () => {
    expect(canvas).toMatch(/game\.scale\.resize\(next\.width, next\.height\);\s*textureLod\?\.invalidate\(\);/u);
  });

  it("상태 요약과 실패 목록은 호스트 data-* 값으로 노출하고, 런타임이 없으면 꺼짐으로 읽힌다", () => {
    expect(canvas).toContain('Object.assign(parent.dataset, textureLod?.diagnostics() ?? { textureLod: "off", textureLodFailures: "[]" });');
  });
});
