// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  StudioPhotoLtBackgroundPanel,
  type StudioPhotoLtBackgroundPlacement,
} from "./StudioPhotoLtBackgroundPanel";

// node/jsdom 환경에 ImageData가 없으면 최소 스텁을 제공한다.
if (typeof globalThis.ImageData === "undefined") {
  class TestImageData {
    readonly data: Uint8ClampedArray;
    readonly width: number;
    readonly height: number;
    constructor(data: Uint8ClampedArray, width: number, height: number) {
      this.data = data;
      this.width = width;
      this.height = height;
    }
  }
  globalThis.ImageData = TestImageData as unknown as typeof ImageData;
}

function makeDecodedImage(width = 8, height = 8): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    const value = (index / 4) % width < width / 2 ? 30 : 220;
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
    data[index + 3] = 255;
  }
  return new ImageData(data, width, height);
}

function renderPanel(
  overrides?: Partial<Parameters<typeof StudioPhotoLtBackgroundPanel>[0]>,
) {
  const onPlace = vi.fn();
  render(
    <StudioPhotoLtBackgroundPanel
      canvasW={720}
      canvasH={1080}
      onPlace={onPlace}
      decodeFile={async () => makeDecodedImage()}
      serializeImageData={() => "data:image/png;stub"}
      {...overrides}
    />,
  );
  return { onPlace };
}

async function pickPhoto() {
  const input = screen.getByLabelText("사진 고르기", { selector: "input" });
  const file = new File(["x"], "alley.jpg", { type: "image/jpeg" });
  fireEvent.change(input, { target: { files: [file] } });
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "선화 배경으로 배치" })).toBeTruthy();
  });
}

afterEach(cleanup);

describe("StudioPhotoLtBackgroundPanel", () => {
  it("빈 상태에서는 사진 고르기와 안내를 보여준다", () => {
    renderPanel();
    expect(screen.getByText("사진으로 선화 배경 만들기")).toBeTruthy();
    expect(screen.getByText("배경으로 쓸 사진 한 장을 골라 주세요")).toBeTruthy();
  });

  it("사진 1장을 고르면 프리셋과 배치 버튼이 나타난다", async () => {
    renderPanel();
    await pickPhoto();
    expect(screen.getByRole("button", { name: "기본 배경" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "선만" })).toBeTruthy();
    expect(screen.getByLabelText("명암(톤)도 함께 깔기")).toBeTruthy();
    expect(screen.getByText(/alley\.jpg/)).toBeTruthy();
  });

  it("배치를 누르면 톤(아래)→선화(위) 페이로드가 onPlace로 한 번 전달된다", async () => {
    const { onPlace } = renderPanel();
    await pickPhoto();
    fireEvent.click(screen.getByRole("button", { name: "선화 배경으로 배치" }));
    expect(onPlace).toHaveBeenCalledTimes(1);
    const placement = onPlace.mock.calls[0]?.[0] as StudioPhotoLtBackgroundPlacement;
    expect(placement.layers).toHaveLength(2);
    expect(placement.layers[0]?.kind).toBe("lt-convert-tone");
    expect(placement.layers[1]?.kind).toBe("lt-convert-line");
    expect(placement.layers[1]?.name).toBe("alley 배경 선화");
    expect(placement.layers[0]?.src).toBe("data:image/png;stub");
    expect(screen.getByText(/선화 배경을 캔버스에 배치했어요/)).toBeTruthy();
  });

  it("선만 프리셋을 고르면 톤 없이 선화 1장만 배치된다", async () => {
    const { onPlace } = renderPanel();
    await pickPhoto();
    fireEvent.click(screen.getByRole("button", { name: "선만" }));
    fireEvent.click(screen.getByRole("button", { name: "선화 배경으로 배치" }));
    const placement = onPlace.mock.calls[0]?.[0] as StudioPhotoLtBackgroundPlacement;
    expect(placement.layers).toHaveLength(1);
    expect(placement.plan.needsWhiteBacking).toBe(true);
  });

  it("사진을 읽지 못하면 오류와 다시 고르기를 보여준다", async () => {
    renderPanel({
      decodeFile: async () => {
        throw new Error("이미지 파일을 읽지 못했습니다.");
      },
    });
    const input = screen.getByLabelText("사진 고르기", { selector: "input" });
    fireEvent.change(input, {
      target: { files: [new File(["x"], "bad.png", { type: "image/png" })] },
    });
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("읽지 못했습니다");
    });
    expect(screen.getByRole("button", { name: "다른 사진 고르기" })).toBeTruthy();
  });
});
