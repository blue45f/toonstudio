import { describe, expect, it } from "vitest";

import { sha256HexPortable } from "../studio-sha256";

import { ANCHOR_LIMITS } from "./anchor-capture-spec";
import { collectAnchorFrames, runAnchorCapture, summarizeAnchorSession } from "./anchor-capture-session";
import { createFileFrameSource, readAnchorImageFile } from "./anchor-frame-sources";
import { fakePngBytes, fakePngFile } from "./anchor-test-kit";

const live = (): AbortSignal => new AbortController().signal;

describe("앵커 파일 읽기", () => {
  it("PNG 헤더에서 가로세로와 형식을 읽고 원래 이름을 표시용으로 남긴다", async () => {
    const frame = await readAnchorImageFile(fakePngFile("hero front.png", 800, 1200), live());
    expect(frame).toMatchObject({ mimeType: "image/png", width: 800, height: 1200, sourceName: "hero front.png" });
    expect(frame.bytes.byteLength).toBe(64);
  });

  it("빈 파일, 한도를 넘는 파일, 이미지가 아닌 파일, 형식이 어긋난 파일을 각각 거절한다", async () => {
    const code = async (file: File): Promise<string> => {
      try {
        await readAnchorImageFile(file, live());
        return "ok";
      } catch (error) {
        return (error as { code?: string }).code ?? "unknown";
      }
    };
    expect(await code(new File([], "empty.png", { type: "image/png" }))).toBe("file-empty");
    expect(await code(new File([new Uint8Array(ANCHOR_LIMITS.maxImageBytes + 1)], "big.png", { type: "image/png" }))).toBe("file-too-large");
    expect(await code(new File(["이건 그림이 아니에요"], "note.png", { type: "image/png" }))).toBe("unsupported-format");
    expect(await code(new File([fakePngBytes(768, 1152)], "wrong.jpg", { type: "image/jpeg" }))).toBe("unsupported-format");
    expect(await code(new File([fakePngBytes(768, 1152)], "untyped.png", { type: "" }))).toBe("ok");
  });

  it("취소된 신호면 파일을 읽지 않는다", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(readAnchorImageFile(fakePngFile("a.png"), controller.signal)).rejects.toMatchObject({ code: "cancelled" });
  });
});

describe("파일 프레임 출처와 세션", () => {
  it("배정된 파일을 세션으로 읽어 해시와 함께 완료 프레임을 만든다", async () => {
    const front = fakePngFile("front.png", 768, 1152, 1);
    const back = fakePngFile("back.png", 768, 1152, 2);
    const source = createFileFrameSource([
      { angleId: "back", file: back },
      { angleId: "front", file: front },
    ]);
    const result = await runAnchorCapture({ angles: ["front", "back"], source });
    const frames = collectAnchorFrames(result);
    expect(frames.map((frame) => frame.angleId)).toEqual(["front", "back"]);
    expect(frames.every((frame) => frame.origin === "file")).toBe(true);
    expect(frames[0]?.imageSha256).toBe(sha256HexPortable(fakePngBytes(768, 1152, 1)));
    expect(frames[0]?.imageSha256).not.toBe(frames[1]?.imageSha256);
  });

  it("배정이 없는 각도는 source-unavailable 로 실패하고 다른 각도는 계속한다", async () => {
    const source = createFileFrameSource([{ angleId: "front", file: fakePngFile("front.png") }]);
    const result = await runAnchorCapture({ angles: ["front", "left"], source });
    expect(result.slots.front.status).toBe("done");
    expect(result.slots.left).toMatchObject({ status: "failed", errorCode: "source-unavailable" });
    expect(summarizeAnchorSession(result).failedAngles).toEqual(["left"]);
  });

  it("작은 이미지는 읽기는 성공해도 세션 검증에서 이유와 함께 실패한다", async () => {
    const source = createFileFrameSource([{ angleId: "front", file: fakePngFile("tiny.png", 120, 180) }]);
    const result = await runAnchorCapture({ angles: ["front"], source });
    expect(result.slots.front).toMatchObject({ status: "failed", errorCode: "image-too-small", errorParams: { width: 120, height: 180 } });
  });
});
