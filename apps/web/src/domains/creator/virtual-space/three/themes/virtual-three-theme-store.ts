import { findVirtualThreeTheme } from './virtual-three-theme-catalog';
import type { VirtualThreeThemeId } from './virtual-three-theme-types';

export const VIRTUAL_THREE_THEME_STORAGE_KEY = 'virtual-space-three-theme:v1';
export interface VirtualThreeThemeStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export interface VirtualThreeThemeChoice {
  readonly schema: typeof VIRTUAL_THREE_THEME_STORAGE_KEY;
  readonly spaceScopeId: string;
  readonly themeId: VirtualThreeThemeId;
  readonly themeVersion: 1;
}
export interface VirtualThreeThemeNotice {
  readonly code: 'invalid-saved-choice' | 'storage-unavailable' | 'storage-write-failed' | 'unknown-theme' | 'not-hydrated';
  readonly level: 'error';
  readonly ko: string;
  readonly en: string;
}
export interface VirtualThreeThemeSelectionState {
  readonly spaceScopeId: string;
  readonly selection: VirtualThreeThemeChoice | null;
  /** 이 브라우저의 localStorage다. 계정·팀·서버·문서 동기화를 의미하지 않는다. */
  readonly persistence: 'browser-local' | 'memory-only';
  readonly notice: VirtualThreeThemeNotice | null;
}
export type VirtualThreeThemeWriteResult =
  | { readonly accepted: true; readonly persisted: boolean; readonly state: VirtualThreeThemeSelectionState }
  | { readonly accepted: false; readonly notice: VirtualThreeThemeNotice };

export const VIRTUAL_THREE_THEME_NOTICES = {
  invalidSaved: { code: 'invalid-saved-choice', level: 'error', ko: '저장된 3D 테마 선택을 읽지 못했습니다. 목록에서 다시 선택해 주세요.', en: 'The saved 3D theme choice is invalid. Choose a listed theme again.' },
  unavailable: { code: 'storage-unavailable', level: 'error', ko: '이 브라우저의 테마 저장소를 사용할 수 없습니다. 선택은 현재 탭에서만 유지됩니다.', en: 'Theme storage is unavailable in this browser. Choices remain in this tab only.' },
  writeFailed: { code: 'storage-write-failed', level: 'error', ko: '3D 테마를 이 브라우저에 저장하지 못했습니다. 현재 탭의 선택은 적용됐지만 다시 열면 유지되지 않을 수 있습니다.', en: 'The 3D theme could not be saved in this browser. This tab uses the choice, but reopening may lose it.' },
  unknown: { code: 'unknown-theme', level: 'error', ko: '알 수 없는 3D 테마는 적용하거나 저장할 수 없습니다.', en: 'Unknown 3D themes cannot be applied or saved.' },
  notHydrated: { code: 'not-hydrated', level: 'error', ko: '이 공간의 3D 테마 선택을 읽는 중입니다.', en: 'The 3D theme choice for this space is still loading.' },
} as const satisfies Record<string, VirtualThreeThemeNotice>;

export function isVirtualThreeThemeScopeId(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 240 || value.trim() !== value) return false;
  return !Array.from(value).some(character => {
    const point = character.codePointAt(0);
    return point !== undefined && (point <= 0x1f || point === 0x7f || (point >= 0xd800 && point <= 0xdfff));
  });
}
export function virtualThreeThemeStorageKey(spaceScopeId: string): string {
  if (!isVirtualThreeThemeScopeId(spaceScopeId)) throw new TypeError('3D 테마 저장에는 유효한 공간 scope ID가 필요합니다.');
  return `${VIRTUAL_THREE_THEME_STORAGE_KEY}:${encodeURIComponent(spaceScopeId)}`;
}
export function parseVirtualThreeThemeChoice(value: unknown, spaceScopeId: string): VirtualThreeThemeChoice | null {
  if (!isVirtualThreeThemeScopeId(spaceScopeId) || !value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record: Record<string, unknown> = {};
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const keys = Reflect.ownKeys(value);
    if (keys.length !== 4 || keys.some(key => typeof key !== 'string' || !['schema', 'spaceScopeId', 'themeId', 'themeVersion'].includes(key))) return null;
    for (const key of keys) {
      if (typeof key !== 'string') return null;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) return null;
      record[key] = descriptor.value;
    }
  } catch { return null; }
  if (record.schema !== VIRTUAL_THREE_THEME_STORAGE_KEY || record.spaceScopeId !== spaceScopeId) return null;
  const theme = findVirtualThreeTheme(record.themeId);
  if (!theme || record.themeVersion !== theme.version) return null;
  return { schema: VIRTUAL_THREE_THEME_STORAGE_KEY, spaceScopeId, themeId: theme.id, themeVersion: theme.version };
}
export function readVirtualThreeThemeChoice(storage: VirtualThreeThemeStorage | null, spaceScopeId: string): VirtualThreeThemeSelectionState {
  const key = virtualThreeThemeStorageKey(spaceScopeId);
  const empty: VirtualThreeThemeSelectionState = { spaceScopeId, selection: null, persistence: 'browser-local', notice: null };
  if (!storage) return { ...empty, persistence: 'memory-only', notice: VIRTUAL_THREE_THEME_NOTICES.unavailable };
  let serialized: string | null;
  try { serialized = storage.getItem(key); }
  catch { return { ...empty, persistence: 'memory-only', notice: VIRTUAL_THREE_THEME_NOTICES.unavailable }; }
  if (serialized === null) return empty;
  let candidate: unknown;
  try { candidate = JSON.parse(serialized); }
  catch { return { ...empty, notice: VIRTUAL_THREE_THEME_NOTICES.invalidSaved }; }
  const selection = parseVirtualThreeThemeChoice(candidate, spaceScopeId);
  return selection ? { ...empty, selection } : { ...empty, notice: VIRTUAL_THREE_THEME_NOTICES.invalidSaved };
}
export function writeVirtualThreeThemeChoice(storage: VirtualThreeThemeStorage | null, spaceScopeId: string, themeId: unknown): VirtualThreeThemeWriteResult {
  const key = virtualThreeThemeStorageKey(spaceScopeId);
  const theme = findVirtualThreeTheme(themeId);
  if (!theme) return { accepted: false, notice: VIRTUAL_THREE_THEME_NOTICES.unknown };
  const selection: VirtualThreeThemeChoice = { schema: VIRTUAL_THREE_THEME_STORAGE_KEY, spaceScopeId, themeId: theme.id, themeVersion: theme.version };
  const state: VirtualThreeThemeSelectionState = { spaceScopeId, selection, persistence: 'browser-local', notice: null };
  if (!storage) return { accepted: true, persisted: false, state: { ...state, persistence: 'memory-only', notice: VIRTUAL_THREE_THEME_NOTICES.writeFailed } };
  try { storage.setItem(key, JSON.stringify(selection)); }
  catch { return { accepted: true, persisted: false, state: { ...state, persistence: 'memory-only', notice: VIRTUAL_THREE_THEME_NOTICES.writeFailed } }; }
  return { accepted: true, persisted: true, state };
}
