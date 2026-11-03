import type { Page } from "@playwright/test";

/** 실제 렌더된 브러시 카드의 단색 배경과 글자색을 합성해 WCAG 대비를 계산한다. */
export async function readBrushTextContrast(page: Page) {
  return page.locator(
    "[data-studio-brush-kind-badge], [data-studio-brush-stroke-details] > span:first-child",
  ).evaluateAll((elements) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("대비 측정용 2D 컨텍스트를 만들 수 없습니다.");
    const color = (value: string) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data]
        .map((channel, index) => index === 3 ? channel / 255 : channel);
    };
    const composite = (front: number[], back: number[]) => {
      const alpha = front[3] + back[3] * (1 - front[3]);
      return alpha === 0 ? [0, 0, 0, 0] : [0, 1, 2]
        .map((index) => (front[index] * front[3] + back[index] * back[3] * (1 - front[3])) / alpha)
        .concat(alpha);
    };
    const luminance = (channels: number[]) => channels.slice(0, 3)
      .map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      }).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
    return elements.filter((element) => {
      const box = element.getBoundingClientRect();
      return element.checkVisibility() && box.width > 0 && box.height > 0
        && box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth;
    }).map((element) => {
      const layers: number[][] = [];
      for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        if (style.backgroundImage !== "none" || Number(style.opacity) !== 1) {
          throw new Error("그라데이션·전체 투명도가 있는 요소는 단색 대비로 판정하지 않습니다.");
        }
        const layer = color(style.backgroundColor);
        layers.push(layer);
        if (layer[3] > 0.999) break;
      }
      if (layers.at(-1)?.[3] !== 1) throw new Error("불투명 배경을 확인하지 못했습니다.");
      const background = layers.reverse().reduce((back, front) => composite(front, back), [0, 0, 0, 0]);
      const foreground = composite(color(getComputedStyle(element).color), background);
      const foregroundLight = luminance(foreground);
      const backgroundLight = luminance(background);
      return {
        text: element.textContent?.trim() ?? "",
        kind: element.hasAttribute("data-studio-brush-kind-badge") ? "badge" : "details",
        ratio: (Math.max(foregroundLight, backgroundLight) + 0.05)
          / (Math.min(foregroundLight, backgroundLight) + 0.05),
        foreground,
        background,
      };
    });
  });
}
