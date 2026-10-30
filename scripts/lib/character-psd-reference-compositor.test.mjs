import { initializeCanvas, readPsd } from 'ag-psd';
import { describe, expect, it } from 'vitest';

import { buildCharacterSemanticPsd } from '../../apps/web/src/domains/creator/character-shaper/character-shaper-psd-assembly.ts';
import { deriveCharacterShadingLayers } from '../../apps/web/src/domains/creator/character-shaper/character-shaper-image-math.ts';

import { compositeCharacterPsdLayers } from './character-psd-reference-compositor.mjs';

initializeCanvas(() => { throw new Error('No DOM canvas'); }, (width, height) => ({
  width, height, data: new Uint8ClampedArray(width * height * 4), colorSpace: 'srgb',
}));
const pass = (id, pixels) => ({ id, width: pixels.length / 4, height: 1, rgba: new Uint8ClampedArray(pixels) });
async function roundTrip(passes, options = {}) {
  const { blob } = buildCharacterSemanticPsd(passes, [], { title: 'Actual layer reconstruction', ...options });
  return readPsd(await blob.arrayBuffer(), { useImageData: true, skipCompositeImageData: true });
}
function expectPixels(actual, expected) {
  expect(actual).toHaveLength(expected.length);
  for (let i = 0; i < expected.length; i++) {
    // Ignore undefined RGB under zero alpha, preserve every alpha byte exactly.
    if (i % 4 !== 3 && expected[i - i % 4 + 3] === 0) continue;
    expect(Math.abs(actual[i] - expected[i]), `channel ${i}: ${actual[i]} != ${expected[i]}`)
      .toBeLessThanOrEqual(i % 4 === 3 ? 0 : 1);
  }
}

describe('independent Character PSD layer recomposition', () => {
  it('클리핑 Multiply는 밑 알파128을 한 번 유지하며 밑 알파0인 픽셀 밖으로 번지지 않는다', () => {
    const image = (pixels) => ({ width: 2, height: 1, data: new Uint8ClampedArray(pixels) });
    const psd = { width: 2, height: 1, children: [
      { clipping: true, blendMode: 'multiply', imageData: image([128, 255, 0, 255, 255, 0, 0, 255]) },
      { imageData: image([200, 100, 50, 128, 0, 0, 0, 0]) },
    ] };
    expect([...compositeCharacterPsdLayers(psd)]).toEqual([100, 100, 0, 128, 0, 0, 0, 0]);
  });

  it('클리핑 체인을 먼저 합성한 뒤 별도 배경에 얹고 hidden 밑·클립을 각각 지킨다', () => {
    const image = (rgba) => ({ width: 1, height: 1, data: new Uint8ClampedArray(rgba) });
    const top = { clipping: true, imageData: image([255, 0, 0, 128]) };
    const middle = { clipping: true, blendMode: 'multiply', imageData: image([128, 255, 0, 128]) };
    const base = { imageData: image([200, 100, 50, 128]) };
    const background = { imageData: image([0, 0, 255, 255]) };
    const psd = { width: 1, height: 1, children: [top, middle, base, background] };
    expect([...compositeCharacterPsdLayers(psd)]).toEqual([102, 25, 133, 255]);
    base.hidden = true;
    expect([...compositeCharacterPsdLayers(psd)]).toEqual([0, 0, 255, 255]);
    base.hidden = false; top.hidden = true; middle.hidden = true;
    expect([...compositeCharacterPsdLayers(psd)]).toEqual([100, 50, 152, 255]);
  });

  it('클리핑 그룹의 mask128·opacity0.5는 원래 밑 알파128에 한 번 적용돼32가 된다', () => {
    const image = (rgba) => ({ width: 1, height: 1, data: new Uint8ClampedArray(rgba) });
    const psd = { width: 1, height: 1, children: [{ opacity: 0.5, mask: { imageData: image([128, 128, 128, 255]) }, children: [
      { clipping: true, blendMode: 'multiply', imageData: image([128, 255, 0, 255]) },
      { imageData: image([200, 100, 50, 128]) },
    ] }] };
    expect([...compositeCharacterPsdLayers(psd)]).toEqual([100, 100, 0, 32]);
  });

  it('지원하지 않는 blend·고아 클리핑 체인은 계속 거절한다', () => {
    const imageData = { width: 1, height: 1, data: new Uint8ClampedArray([100, 100, 100, 255]) };
    for (const children of [[{ blendMode: 'overlay', imageData }],
      [{ clipping: true, blendMode: 'overlay', imageData }, { imageData }], [{ clipping: true, imageData }]]) {
      expect(() => compositeCharacterPsdLayers({ width: 1, height: 1, children })).toThrow();
    }
  });

  it.each([['normal', 128], ['multiply', 107], ['screen', 149]])(
    'matches hand-calculated W3C source-over %s for two half-covered gray layers', (blendMode, gray) => {
      const imageData = { width: 1, height: 1, data: new Uint8ClampedArray([128, 128, 128, 128]) };
      expect([...compositeCharacterPsdLayers({ width: 1, height: 1,
        children: [{ blendMode, imageData }, { imageData }] })]).toEqual([gray, gray, gray, 192]);
    });

  it('uses visible layers rather than the stored merged image and applies isolated group masks once', () => {
    const red = { width: 1, height: 1, data: new Uint8ClampedArray([255, 0, 0, 255]) };
    const blue = { width: 1, height: 1, data: new Uint8ClampedArray([0, 0, 255, 255]) };
    const mask = { width: 1, height: 1, data: new Uint8ClampedArray([128, 128, 128, 255]) };
    const actual = compositeCharacterPsdLayers({ width: 1, height: 1, imageData: blue,
      children: [{ blendMode: 'normal', mask: { imageData: mask }, children: [{ imageData: red }, { imageData: blue }] }] });
    expect([...actual]).toEqual([255, 0, 0, 128]);
  });

  it('reconstructs darkening, brightening, mixed-channel shading and unequal translucent coverage', async () => {
    const flat = pass('flat', [160, 160, 160, 128, 100, 100, 100, 64, 200, 80, 100, 255, 0, 0, 0, 0]);
    const beauty = pass('beauty', [80, 160, 160, 128, 180, 100, 100, 96, 100, 160, 100, 32, 30, 90, 150, 20]);
    const { shadow, highlight } = deriveCharacterShadingLayers(flat.rgba, beauty.rgba);
    const psd = await roundTrip([flat, beauty, { ...flat, id: 'shadow', rgba: shadow }, { ...flat, id: 'highlight', rgba: highlight }]);
    expect(psd.imageData).toBeUndefined();
    expectPixels(compositeCharacterPsdLayers(psd), beauty.rgba);
    // Real edits must affect the result: the visible stack cannot be a hidden Beauty shortcut.
    const character = psd.children.find((layer) => layer.name === '캐릭터');
    character.children.find((layer) => layer.name === '음영').hidden = true;
    expect([...compositeCharacterPsdLayers(psd).subarray(0, 4)]).toEqual([160, 160, 160, 128]);
  });

  it('retains partial-mask edges, overlapping ownership, unclassified pixels and color boundaries', async () => {
    const flat = pass('flat', [210, 40, 30, 128, 10, 200, 40, 255, 20, 40, 220, 64, 80, 90, 100, 255]);
    const mask = (id, alpha) => pass(id, alpha.flatMap((a) => [255, 255, 255, a]));
    const psd = await roundTrip([flat, { ...flat, id: 'beauty' },
      mask('mask-face', [128, 80, 0, 0]), mask('mask-skin', [128, 100, 0, 0])]);
    expectPixels(compositeCharacterPsdLayers(psd), flat.rgba);
    const parts = psd.children.find((layer) => layer.name === '캐릭터').children[0].children;
    expect(parts.map((layer) => layer.name)).toEqual(['얼굴', '피부', '미분류 영역']);
    parts[0].imageData.data[0] = 50;
    expect(compositeCharacterPsdLayers(psd)[0]).toBe(50);
    expect(compositeCharacterPsdLayers(psd)[8]).toBe(flat.rgba[8]);
  });

  it('round-trips all 256 alpha levels with mixed shading and eight overlapping semantic masks', async () => {
    let seed = 0x19af031;
    const byte = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed >>> 24; };
    const flat = pass('flat', Array.from({ length: 256 }, () => [byte(), byte(), byte(), byte()]).flat());
    const beauty = pass('beauty', Array.from({ length: 256 }, (_, alpha) => [byte(), byte(), byte(), alpha]).flat());
    const masks = ['face', 'eyes', 'hair', 'accessory', 'top', 'bottom', 'shoes', 'skin'].map((name) =>
      pass(`mask-${name}`, Array.from({ length: 256 }, () => [255, 255, 255, byte()]).flat()));
    const originals = [flat, beauty, ...masks].map((item) => item.rgba.slice());
    const { shadow, highlight } = deriveCharacterShadingLayers(flat.rgba, beauty.rgba);
    const psd = await roundTrip([flat, beauty, { ...flat, id: 'shadow', rgba: shadow }, { ...flat, id: 'highlight', rgba: highlight }, ...masks]);
    expectPixels(compositeCharacterPsdLayers(psd), beauty.rgba);
    [flat, beauty, ...masks].forEach((item, index) => expect(item.rgba).toEqual(originals[index]));
  });

  it('preserves extracted line and paint for editing without applying their already-baked contribution twice', async () => {
    const beauty = pass('beauty', [80, 100, 120, 128, 140, 80, 30, 255, 0, 0, 0, 0]);
    const line = pass('line', [20, 20, 20, 255, 20, 20, 20, 255, 20, 20, 20, 255]);
    const paint = pass('surface-paint', [240, 10, 20, 255, 240, 10, 20, 255, 240, 10, 20, 255]);
    const psd = await roundTrip([beauty, { ...beauty, id: 'flat' }, line, paint]);
    expectPixels(compositeCharacterPsdLayers(psd), beauty.rgba);
    const hidden = psd.children.filter((layer) => layer.hidden && layer.children);
    expect(hidden).toHaveLength(2);
    expect(hidden.every((layer) => layer.name.includes('추출 참고'))).toBe(true);
    expect(hidden.map((layer) => [...layer.children[0].imageData.data])).toEqual([[...line.rgba], [...paint.rgba]]);
  });

  it('실제 헤어 ON PSD roundtrip도 비흰색·반투명 알파를 merged image 없이 복원한다', async () => {
    const flat = pass('flat', [60, 80, 130, 255, 40, 70, 100, 96, 180, 120, 90, 180]);
    const beauty = pass('beauty', [30, 50, 100, 255, 60, 90, 120, 96, 180, 100, 70, 180]);
    const { shadow, highlight } = deriveCharacterShadingLayers(flat.rgba, beauty.rgba);
    const psd = await roundTrip([flat, beauty, { ...flat, id: 'shadow', rgba: shadow }, { ...flat, id: 'highlight', rgba: highlight },
      pass('mask-hair', [255, 255, 255, 255, 255, 255, 255, 96, 0, 0, 0, 0]),
      pass('mask-skin', [0, 0, 0, 0, 0, 0, 0, 0, 255, 255, 255, 180]),
      pass('line', [0, 0, 0, 80, 0, 0, 0, 60, 0, 0, 0, 80]),
    ], { createHairLayer: true, extractLuminanceOutline: true });
    expect(psd.imageData).toBeUndefined();
    expectPixels(compositeCharacterPsdLayers(psd), beauty.rgba);
    const hair = psd.children.find((layer) => layer.name === '캐릭터').children.find((layer) => layer.name === '헤어 (SHAPER 3-Layer)');
    expect(hair.children.find((layer) => layer.name === 'Hair Shadow').clipping).toBe(true);
    hair.hidden = true;
    expect([...compositeCharacterPsdLayers(psd).subarray(0, 8)]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expectPixels(compositeCharacterPsdLayers(psd).subarray(8), beauty.rgba.subarray(8));
  });
});
