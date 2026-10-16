/**
 * 키보드 순회 감사: Tab 을 N번 눌러 포커스가 어디로 가는지, 각 정류장에 보이는 포커스 표시가 있는지 확인한다.
 *
 * 포커스 표시 판정은 화소 비교다. 정류장마다 요소 주변을 (1) 포커스된 상태 (2) blur 한 상태로 캡처해 다르면 표시가 있다.
 * 영구적인 그림자·테두리가 있는 요소를 "표시 있음"으로 오판하지 않게, 순회 전에 애니메이션·전환·캐럿을 고정한다.
 * 같은 요소를 다시 만나면 앞선 판정을 재사용한다.
 */
import {
  blurFocused,
  describeFocused,
  isModalOpen,
  prepareFocusProbe,
  refocus,
} from "./page-probes.mjs";
import { analyzeFocusStops, analyzeKeyboardTrap } from "./structure-analysis.mjs";

function clampClip(rect, viewport, margin) {
  const x = Math.max(0, Math.floor(rect.x - margin));
  const y = Math.max(0, Math.floor(rect.y - margin));
  const right = Math.min(viewport.width, Math.ceil(rect.x + rect.width + margin));
  const bottom = Math.min(viewport.height, Math.ceil(rect.y + rect.height + margin));
  return { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) };
}

/**
 * @param {import("playwright").Page} page
 * @param {{ presses?: number, viewport?: { width: number, height: number } }} [options] viewport: 측정 프로필의 뷰포트 크기
 */
export async function auditFocus(page, { presses = 20, viewport } = {}) {
  const size = viewport ? { width: viewport.width, height: viewport.height } : undefined;
  const prepared = await page.evaluate(prepareFocusProbe);
  const stops = [];
  const verdicts = new Map();
  for (let index = 0; index < presses; index += 1) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(describeFocused, size);
    if (info.id === null) {
      stops.push({ id: null, label: "", hasIndicator: null, offscreen: false });
      continue;
    }
    if (!verdicts.has(info.id)) {
      let hasIndicator = null;
      const visible = info.rect.width > 0 && info.rect.height > 0 && !info.offscreen && !info.isFrame;
      if (visible) {
        try {
          const clip = clampClip(info.rect, info.viewport, 8);
          const focusedShot = await page.screenshot({ clip, type: "png" });
          await page.evaluate(blurFocused);
          const blurredShot = await page.screenshot({ clip, type: "png" });
          await page.evaluate(refocus, info.id);
          hasIndicator = !focusedShot.equals(blurredShot);
        } catch {
          hasIndicator = null;
        }
      }
      verdicts.set(info.id, hasIndicator);
    }
    stops.push({ id: info.id, label: info.label, hasIndicator: verdicts.get(info.id), offscreen: info.offscreen });
  }
  const focus = analyzeFocusStops(stops, presses);
  const modalOpen = prepared.modalOpen || (await page.evaluate(isModalOpen));
  const trap = analyzeKeyboardTrap(focus, { modalOpen, focusableCount: prepared.focusableCount });
  return { focus: { ...focus, focusableCount: prepared.focusableCount }, trap };
}
