import { expect, type Locator } from "@playwright/test";

/** 단색·선형 그라데이션과 투명 조상의 합성 배경까지 실제 브라우저 색 변환으로 검사한다. */
export async function expectReadableControl(locator: Locator): Promise<void> {
  await expect(locator).toBeVisible();
  const result = await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("버튼 대비 검사용 Canvas를 만들 수 없습니다.");
    function rgba(color: string): number[] {
      if (!CSS.supports("color", color)) throw new Error(`검사할 수 없는 색: ${color}`);
      if (!context) throw new Error("색 변환 컨텍스트가 없습니다.");
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data);
    }
    function luminance(rgb: number[]): number {
      return rgb.slice(0, 3).reduce((sum, value, index) => {
        const normalized = value / 255;
        const linear = normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
        return sum + linear * [0.2126, 0.7152, 0.0722][index];
      }, 0);
    }
    const foreground = rgba(style.color);
    const image = style.backgroundImage;
    let backgrounds: number[][];
    if (image === "none") {
      backgrounds = [rgba(style.backgroundColor)];
    } else {
      // 임의 이미지·다층 배경을 가독성 통과로 간주하지 않는다.
      if (!image.startsWith("linear-gradient(") || image.split("gradient(").length !== 2) {
        throw new Error(`별도 픽셀 검증이 필요한 배경: ${image}`);
      }
      const stops = image.match(/(?:rgba?|color|oklch|oklab|lch|lab|hsla?)\([^)]*\)/gu) ?? [];
      if (stops.length < 2) throw new Error(`그라데이션 색을 읽을 수 없습니다: ${image}`);
      const colors = stops.map(rgba);
      backgrounds = colors.flatMap((color, index) => {
        const next = colors[index + 1];
        if (!next) return [color];
        return Array.from({ length: 17 }, (_, step) => color.map((value, channel) => value + (next[channel] - value) * step / 16));
      });
    }
    if (backgrounds.some((color) => color[3] !== 255)) {
      // 투명 링크의 실제 배경은 가장 가까운 불투명 조상까지의 색을 합성한 결과다.
      let backdrop = [0, 0, 0, 0];
      for (let parent = element.parentElement; parent && backdrop[3] < 255; parent = parent.parentElement) {
        const parentStyle = getComputedStyle(parent);
        if (parentStyle.backgroundImage !== "none") {
          throw new Error("투명 배경 뒤의 이미지는 별도 픽셀 검증이 필요합니다.");
        }
        const color = rgba(parentStyle.backgroundColor);
        const foregroundAlpha = backdrop[3] / 255;
        const backgroundAlpha = color[3] / 255;
        const alpha = foregroundAlpha + backgroundAlpha * (1 - foregroundAlpha);
        backdrop = alpha === 0 ? [0, 0, 0, 0] : [
          ...backdrop.slice(0, 3).map((value, index) => (value * foregroundAlpha + color[index] * backgroundAlpha * (1 - foregroundAlpha)) / alpha),
          alpha * 255,
        ];
      }
      if (backdrop[3] < 255) throw new Error("투명 배경의 불투명 기준색을 찾지 못했습니다.");
      backgrounds = backgrounds.map((color) => [
        ...color.slice(0, 3).map((value, index) => value * color[3] / 255 + backdrop[index] * (1 - color[3] / 255)),
        255,
      ]);
    }
    const ratios = backgrounds.map((background) => {
      const alpha = foreground[3] / 255;
      const text = foreground.map((value, channel) => value * alpha + background[channel] * (1 - alpha));
      const light = luminance(text);
      const dark = luminance(background);
      return (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05);
    });
    return { minimumContrast: Math.min(...ratios), foreground: style.color, background: style.background, samples: ratios.length };
  });
  expect(result.minimumContrast, JSON.stringify(result)).toBeGreaterThanOrEqual(4.5);
}
