import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { parseStudioBg3dBundleThemePacks } from '../../../bg3d/studio-bg3d-bundle-theme-packs';
import { findVirtualThreeTheme, VIRTUAL_THREE_THEMES } from './virtual-three-theme-catalog';
import { VIRTUAL_THREE_THEME_MODEL_REFS, findVirtualThreeThemeModelRef } from './virtual-three-theme-models';
import { findVirtualThreeNatureDisplaySize, NATURE_THEME_CATALOG_ID, NATURE_THEME_CATALOG_SNAPSHOT_SHA256, NATURE_THEME_MODEL_SOURCE_FACTS, VIRTUAL_THREE_NATURE_MODEL_IDS as N, VIRTUAL_THREE_NATURE_MODEL_REFS } from './virtual-three-nature-theme-models';
import { VIRTUAL_THREE_NATURE_THEMES } from './virtual-three-nature-themes';
import { virtualThreeThemeModelDisplaySize } from './virtual-three-theme-placement';
import { readVirtualThreeThemeChoice, writeVirtualThreeThemeChoice } from './virtual-three-theme-store';

describe('Nature 전수 인제스션과 3D 관찰 테마의 연결', () => {
  it('실제 불변 카탈로그에서 읽은 여덟 ID·경로·SHA·bytes·tris·현재 팩 권리를 대조한다', () => {
    const bytes = readFileSync(new URL('../../../../../../public/assets/3d/environments/bundle-v1/theme-packs.e855c272c15db1f75a7a398c93f01c9ce6ff27342f2b10b2707e4daf9abe3ce4.json', import.meta.url));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(NATURE_THEME_CATALOG_SNAPSHOT_SHA256);
    const catalog = parseStudioBg3dBundleThemePacks(JSON.parse(bytes.toString('utf8')));
    expect(catalog.totals.placeableAssets).toBe(5229);
    const nature = catalog.packs.find(pack => pack.catalogIds.includes(NATURE_THEME_CATALOG_ID));
    expect(nature?.placeable).toBe(3300);
    expect(nature?.rights?.commercialUse).toBe(true);
    expect(VIRTUAL_THREE_NATURE_MODEL_REFS).toHaveLength(8);
    for (const fact of NATURE_THEME_MODEL_SOURCE_FACTS) {
      const asset = catalog.assets.find(item => item.id === fact.assetId);
      expect(asset).toBeDefined();
      expect(asset?.path).toBe(fact.path);
      expect(asset?.sha256).toBe(`sha256:${fact.sha256}`);
      expect(asset?.bytes).toBe(fact.byteLength);
      expect(asset?.triangles).toBe(fact.triangles);
      if (!asset) throw new Error('확정 Nature 에셋이 카탈로그에 없습니다.');
      expect(catalog.packs[asset.packIndex]?.catalogIds).toContain(NATURE_THEME_CATALOG_ID);
      const ref = findVirtualThreeThemeModelRef(fact.assetId);
      expect(ref).toEqual({ source: 'bundle', assetId: fact.assetId, expectedSha256: `sha256:${fact.sha256}`, byteLength: fact.byteLength, catalogId: NATURE_THEME_CATALOG_ID });
    }
  });

  it('기존 여섯 테마를 보존하고 원본 모델 조합이 다른 두 관찰 테마만 추가한다', () => {
    const existingIds = ['parkbotanical', 'fantasyguild', 'sflab', 'gothicarchive', 'vehiclegarage', 'cafefood'];
    expect(VIRTUAL_THREE_THEMES.filter(theme => existingIds.includes(theme.id)).map(theme => theme.id)).toEqual(existingIds);
    expect(VIRTUAL_THREE_NATURE_THEMES.map(theme => theme.id)).toEqual(['forestretreat', 'gardenstudy']);
    expect(new Set(VIRTUAL_THREE_THEME_MODEL_REFS.map(ref => ref.source === 'bundle' ? ref.assetId : ref.id)).size).toBe(VIRTUAL_THREE_THEME_MODEL_REFS.length);
    expect(VIRTUAL_THREE_THEME_MODEL_REFS.filter(ref => ref.source === 'generated')).toHaveLength(6);
    for (const theme of VIRTUAL_THREE_NATURE_THEMES) {
      expect(findVirtualThreeTheme(theme.id)).toBe(theme);
      expect(theme.modelAssetIds).toHaveLength(5);
      expect(theme.modelAssetIds.filter(id => VIRTUAL_THREE_NATURE_MODEL_REFS.some(ref => ref.assetId === id))).toHaveLength(4);
      for (const role of theme.layoutRoles) {
        expect(findVirtualThreeThemeModelRef(role.modelAssetId)).toBeDefined();
        expect(Number.isInteger(role.count) && role.count > 0).toBe(true);
      }
    }
    expect(new Set(VIRTUAL_THREE_NATURE_THEMES[0]?.modelAssetIds)).not.toEqual(new Set(VIRTUAL_THREE_NATURE_THEMES[1]?.modelAssetIds));
  });

  it('납작한 식물을 기본 2.2m 높이로 확대하지 않고 정확한 ID·역할의 표시 부모만 정규화한다', () => {
    expect(virtualThreeThemeModelDisplaySize('botanical', N.natureLettuce)).toEqual({ axis: 'ground-extent', meters: 0.24 });
    expect(virtualThreeThemeModelDisplaySize('botanical', N.natureField)).toEqual({ axis: 'ground-extent', meters: 0.9 });
    expect(virtualThreeThemeModelDisplaySize('botanical', N.natureFlower)).toEqual({ axis: 'ground-extent', meters: 0.35 });
    expect(virtualThreeThemeModelDisplaySize('accent', N.natureRock)).toEqual({ axis: 'ground-extent', meters: 0.7 });
    expect(virtualThreeThemeModelDisplaySize('botanical', N.natureTree)).toEqual({ axis: 'height', meters: 2.4 });
    expect(findVirtualThreeNatureDisplaySize('workstation', N.natureLettuce)).toBeUndefined();
    expect(findVirtualThreeNatureDisplaySize('botanical', 'unknown')).toBeUndefined();
  });

  it('새 3D 선택은 기존 공간별 저장 규칙으로 저장·복원하고 baseline을 바꾸지 않는다', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    for (const theme of VIRTUAL_THREE_NATURE_THEMES) {
      expect(writeVirtualThreeThemeChoice(storage, theme.id, theme.id).accepted).toBe(true);
      expect(readVirtualThreeThemeChoice(storage, theme.id).selection?.themeId).toBe(theme.id);
    }
    expect(readVirtualThreeThemeChoice(storage, 'untouched-space').selection).toBeNull();
    expect(findVirtualThreeTheme('creator-campus')?.kind).toBe('preserved-baseline');
  });
});
