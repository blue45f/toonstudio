import { describe, expect, it } from 'vitest';
import { DEFAULT_VIRTUAL_THREE_THEME_ID, VIRTUAL_THREE_THEMES, findVirtualThreeTheme } from './virtual-three-theme-catalog';
import { VIRTUAL_THREE_THEME_MODEL_REFS, findVirtualThreeThemeModelRef } from './virtual-three-theme-models';
import {
  VIRTUAL_THREE_THEME_STORAGE_KEY,
  isVirtualThreeThemeScopeId,
  parseVirtualThreeThemeChoice,
  readVirtualThreeThemeChoice,
  virtualThreeThemeStorageKey,
  writeVirtualThreeThemeChoice,
} from './virtual-three-theme-store';
import type { VirtualThreeThemeStorage } from './virtual-three-theme-store';

class MemoryStorage implements VirtualThreeThemeStorage {
  readonly values = new Map<string, string>();
  readonly reads: string[] = [];
  readonly writes: string[] = [];
  getItem(key: string): string | null { this.reads.push(key); return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.writes.push(key); this.values.set(key, value); }
}
const choice = (spaceScopeId = 'space/alpha') => ({
  schema: VIRTUAL_THREE_THEME_STORAGE_KEY, spaceScopeId, themeId: 'parkbotanical', themeVersion: 1,
});

describe('독립 3D 테마 browser-local 선택 초안', () => {
  it('정확한 자체 scope 키만 읽고 쓰며 공간 사이의 선택을 섞지 않는다', () => {
    const storage = new MemoryStorage();
    storage.values.set('unrelated-control-storage', 'untouched');
    const alpha = writeVirtualThreeThemeChoice(storage, 'space/alpha', 'parkbotanical');
    const beta = writeVirtualThreeThemeChoice(storage, 'space/beta', 'gothicarchive');
    expect(alpha.accepted && alpha.persisted).toBe(true);
    expect(beta.accepted && beta.persisted).toBe(true);
    expect(readVirtualThreeThemeChoice(storage, 'space/alpha').selection?.themeId).toBe('parkbotanical');
    expect(readVirtualThreeThemeChoice(storage, 'space/beta').selection?.themeId).toBe('gothicarchive');
    expect(storage.writes).toEqual([
      'virtual-space-three-theme:v1:space%2Falpha', 'virtual-space-three-theme:v1:space%2Fbeta',
    ]);
    expect(storage.reads).toEqual(storage.writes);
    expect(storage.values.get('unrelated-control-storage')).toBe('untouched');
  });

  it('저장 이력이 없으면 임의 테마를 고르거나 저장하지 않는다', () => {
    const storage = new MemoryStorage();
    expect(readVirtualThreeThemeChoice(storage, 'space/new')).toEqual({
      spaceScopeId: 'space/new', selection: null, persistence: 'browser-local', notice: null,
    });
    expect(storage.writes).toEqual([]);
  });

  it('renderer baseline 기본값은 2D 저장값을 읽거나 빈 3D 선택을 자동 저장하지 않는다', () => {
    const storage = new MemoryStorage();
    const twoDKey = 'toonspectrum:virtual-space-theme:v1';
    storage.values.set(twoDKey, 'library');
    const state = readVirtualThreeThemeChoice(storage, 'space/new');
    expect(state.selection).toBeNull();
    expect(state.notice).toBeNull();
    expect(DEFAULT_VIRTUAL_THREE_THEME_ID).toBe('creator-campus');
    expect(findVirtualThreeTheme(DEFAULT_VIRTUAL_THREE_THEME_ID)?.kind).toBe('preserved-baseline');
    expect(storage.reads).toEqual([virtualThreeThemeStorageKey('space/new')]);
    expect(storage.writes).toEqual([]);
    expect(storage.values.get(twoDKey)).toBe('library');
  });

  it('baseline도 명시 선택으로만 자체 3D 저장 payload와 version을 왕복한다', () => {
    const storage = new MemoryStorage();
    const result = writeVirtualThreeThemeChoice(storage, 'space/alpha', DEFAULT_VIRTUAL_THREE_THEME_ID);
    expect(result.accepted && result.persisted).toBe(true);
    expect(readVirtualThreeThemeChoice(storage, 'space/alpha').selection).toEqual({
      schema: VIRTUAL_THREE_THEME_STORAGE_KEY, spaceScopeId: 'space/alpha', themeId: 'creator-campus', themeVersion: 1,
    });
    expect(storage.writes).toEqual([virtualThreeThemeStorageKey('space/alpha')]);
  });

  it('다른 scope·unknown ID·버전·초과 필드를 모두 거부한다', () => {
    const valid = choice();
    let getterCalls = 0;
    const accessor = { ...valid };
    Object.defineProperty(accessor, 'themeId', { enumerable: true, get: () => { getterCalls += 1; return 'parkbotanical'; } });
    expect(parseVirtualThreeThemeChoice(valid, 'space/alpha')).toEqual(valid);
    for (const invalid of [
      { ...valid, spaceScopeId: 'space/beta' }, { ...valid, themeId: 'unknown-theme' },
      { ...valid, themeVersion: 2 }, { ...valid, schema: 'other-schema' },
      { ...valid, extra: true }, { ...valid, [Symbol('extra')]: true }, accessor,
      { themeId: 'parkbotanical' }, null, [], 'parkbotanical',
    ]) expect(parseVirtualThreeThemeChoice(invalid, 'space/alpha')).toBeNull();
    expect(getterCalls).toBe(0);
  });

  it('깨진 저장 값을 알리고 자동 복구·덮어쓰기는 하지 않는다', () => {
    const storage = new MemoryStorage();
    const key = virtualThreeThemeStorageKey('space/alpha');
    for (const malformed of ['{broken', JSON.stringify({ ...choice(), themeId: 'unknown-theme' })]) {
      storage.values.set(key, malformed);
      const state = readVirtualThreeThemeChoice(storage, 'space/alpha');
      expect(state.selection).toBeNull();
      expect(state.notice?.code).toBe('invalid-saved-choice');
      expect(storage.values.get(key)).toBe(malformed);
      expect(storage.writes).toEqual([]);
    }
  });

  it('unknown 선택은 저장소 쓰기 전에 거부한다', () => {
    const storage = new MemoryStorage();
    for (const unknownId of ['UNKNOWN', '__proto__', 42, null, { id: 'parkbotanical' }]) {
      const result = writeVirtualThreeThemeChoice(storage, 'space/alpha', unknownId);
      expect(result.accepted).toBe(false);
      if (!result.accepted) expect(result.notice.code).toBe('unknown-theme');
    }
    expect(storage.writes).toEqual([]);
  });

  it('저장 실패는 현재 탭 적용과 영구 저장 실패를 구분해 UI에 알린다', () => {
    const denied: VirtualThreeThemeStorage = {
      getItem: () => { throw new Error('storage denied'); },
      setItem: () => { throw new Error('storage quota exceeded'); },
    };
    expect(readVirtualThreeThemeChoice(denied, 'space/alpha').notice?.code).toBe('storage-unavailable');
    const result = writeVirtualThreeThemeChoice(denied, 'space/alpha', 'sflab');
    expect(result.accepted).toBe(true);
    if (!result.accepted) throw new Error('유효한 선택은 현재 탭에 적용되어야 합니다.');
    expect(result.persisted).toBe(false);
    expect(result.state.persistence).toBe('memory-only');
    expect(result.state.selection?.themeId).toBe('sflab');
    expect(result.state.notice?.code).toBe('storage-write-failed');
    expect(result.state.notice?.ko.length).toBeGreaterThan(0);
    expect(result.state.notice?.en.length).toBeGreaterThan(0);
  });

  it('스토리지 포트가 없을 때도 성공 저장으로 오인하지 않는다', () => {
    expect(readVirtualThreeThemeChoice(null, 'space/alpha').persistence).toBe('memory-only');
    const result = writeVirtualThreeThemeChoice(null, 'space/alpha', 'cafefood');
    expect(result.accepted).toBe(true);
    if (!result.accepted) throw new Error('유효한 선택은 현재 탭에 적용되어야 합니다.');
    expect(result.persisted).toBe(false);
    expect(result.state.notice?.code).toBe('storage-write-failed');
  });

  it('빈 scope와 URI로 인코딩할 수 없는 문자열을 거부하고 정상 Unicode scope는 허용한다', () => {
    for (const scope of ['', ' ', ' alpha', 'alpha\n', '\ud800', '\udc00', 'space/\ud800end', 'a'.repeat(241)]) {
      expect(isVirtualThreeThemeScopeId(scope)).toBe(false);
      expect(() => virtualThreeThemeStorageKey(scope)).toThrow(TypeError);
    }
    expect(isVirtualThreeThemeScopeId('공간/🎨')).toBe(true);
    expect(virtualThreeThemeStorageKey('공간/🎨')).toBe(`${VIRTUAL_THREE_THEME_STORAGE_KEY}:${encodeURIComponent('공간/🎨')}`);
  });

  it('문자열 내부의 ASCII 제어 문자는 거부하고 정상 공백과 Unicode 쌍은 유지한다', () => {
    for (const point of [...Array.from({ length: 32 }, (_, index) => index), 0x7f]) {
      const scope = `space/${String.fromCodePoint(point)}tail`;
      expect(isVirtualThreeThemeScopeId(scope)).toBe(false);
      expect(() => virtualThreeThemeStorageKey(scope)).toThrow(TypeError);
    }
    for (const scope of ['space/ tail', 'space/\u0080tail', 'space/\ud7fftail', 'space/\ue000tail', '공간/🎨']) {
      expect(isVirtualThreeThemeScopeId(scope)).toBe(true);
      expect(virtualThreeThemeStorageKey(scope)).toBe(`${VIRTUAL_THREE_THEME_STORAGE_KEY}:${encodeURIComponent(scope)}`);
    }
  });
});

describe('선언형 테마와 모델 참조 초안', () => {
  it('baseline은 기존 world 분기를 보존하는 어댑터이며 빈 asset recipe가 아니다', () => {
    const baseline = findVirtualThreeTheme(DEFAULT_VIRTUAL_THREE_THEME_ID);
    if (!baseline || baseline.kind !== 'preserved-baseline') throw new Error('기존 3D 공간을 보존할 baseline이 없습니다.');
    expect(baseline.version).toBe(1);
    expect(baseline.copy.ko.name).toBe('기존 크리에이터 캠퍼스');
    expect(baseline.preservedAdapter).toEqual({
      id: 'existing-creator-world-3d-v1', manifestPolicy: 'preserve-current-manifest',
      campus: { architecture: 'existing-campus-architecture-v1', dioramas: 'existing-campus-10-v1',
        equipment: 'existing-campus-props-v1', generatedProps: 'preserve-existing', workstations: 'existing-campus-interactions-v1' },
      otherWorlds: 'existing-manifest-architecture-and-workstations-v1',
      coordinates: 'preserve-logical-world', runtimeState: 'preserve-camera-presence-actors',
    });
    expect(Object.hasOwn(baseline, 'layoutRoles')).toBe(false);
    expect(Object.hasOwn(baseline, 'modelAssetIds')).toBe(false);
    expect(Object.hasOwn(baseline, 'surfacePBR')).toBe(false);
  });

  it('여섯 테마의 모든 역할은 정확한 registry 모델을 참조한다', () => {
    expect(VIRTUAL_THREE_THEMES.map(theme => theme.id)).toEqual([
      'creator-campus', 'parkbotanical', 'fantasyguild', 'sflab', 'gothicarchive', 'vehiclegarage', 'cafefood',
    ]);
    expect(VIRTUAL_THREE_THEMES.filter(theme => theme.kind === 'asset-recipe')).toHaveLength(6);
    for (const theme of VIRTUAL_THREE_THEMES) {
      if (theme.kind !== 'asset-recipe') continue;
      expect(theme.modelAssetIds).toEqual([...new Set(theme.layoutRoles.map(role => role.modelAssetId))]);
      expect(new Set(theme.layoutRoles.map(role => role.id)).size).toBe(theme.layoutRoles.length);
      for (const role of theme.layoutRoles) {
        expect(findVirtualThreeThemeModelRef(role.modelAssetId)).toBeDefined();
        expect(Number.isSafeInteger(role.count) && role.count > 0).toBe(true);
      }
      for (const surface of Object.values(theme.surfacePBR)) {
        expect(surface.baseColor).toMatch(/^#[a-f0-9]{6}$/);
        expect(surface.roughness).toBeGreaterThanOrEqual(0);
        expect(surface.roughness).toBeLessThanOrEqual(1);
        expect(surface.metalness).toBeGreaterThanOrEqual(0);
        expect(surface.metalness).toBeLessThanOrEqual(1);
      }
    }
    expect(findVirtualThreeTheme('unknown-theme')).toBeUndefined();
  });

  it('실제 metadata 참조 형식을 보존하고 신규 batch 후보를 ready registry에 넣지 않는다', () => {
    const ids = VIRTUAL_THREE_THEME_MODEL_REFS.map(model => model.source === 'bundle' ? model.assetId : model.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(VIRTUAL_THREE_THEME_MODEL_REFS.filter(model => model.source === 'generated')).toHaveLength(6);
    for (const model of VIRTUAL_THREE_THEME_MODEL_REFS) {
      expect(Number.isSafeInteger(model.byteLength) && model.byteLength > 0).toBe(true);
      if (model.source === 'bundle') {
        expect(model.expectedSha256).toMatch(/^sha256:[a-f0-9]{64}$/);
        expect(model.catalogId).toMatch(/^cbv1-\d{3}-/);
      } else {
        expect(model.sha256).toMatch(/^[a-f0-9]{64}$/);
        expect(model.provenanceId).toBe(model.id);
        expect(model.url.startsWith('/models/')).toBe(true);
        expect(model.url.includes('/assets/3d/tripo/batch')).toBe(false);
      }
    }
    expect(findVirtualThreeThemeModelRef('/assets/3d/tripo/batch11/toonstudio_cafe_counter.glb')).toBeUndefined();
  });
});
