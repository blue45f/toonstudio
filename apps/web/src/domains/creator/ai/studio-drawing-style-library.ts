import { z } from "zod";

import { STUDIO_LOOKS, type StudioLook } from "../studio-looks";
import { acquireStudioLocalDatabase, resetFailedStudioLocalDatabaseOwnership } from "../studio-local-database-runtime";
import type { StudioAsyncKeyValueStore, StudioLocalDatabase } from "../studio-local-database";

export const STYLE_TRAITS = ["line", "figure", "color", "texture", "background"] as const;
export const drawingStyleLooks = [
  { id: "pen-drawing", en: "Pen and ink" }, { id: "sumi-e-webtoon", en: "Ink wash" },
  { id: "classic-manga", en: "Black-and-white manga" }, { id: "american-comic", en: "Color halftone" },
  { id: "noir", en: "Noir" }, { id: "golden-hour", en: "Golden hour" },
].flatMap(item => {
  const look = STUDIO_LOOKS.find(preset => preset.id === item.id);
  return look ? [{ look, en: item.en }] : [];
});
const trait = z.string().trim().max(90);
const recipeSchema = z.object({
  name: z.string().trim().min(1).max(48),
  line: trait, figure: trait, color: trait, texture: trait, background: trait,
  lookId: z.string().refine(id => drawingStyleLooks.some(({ look }) => look.id === id)).optional(),
  contrastOffset: z.number().int().min(-50).max(50).optional(),
}).refine(recipe => Boolean(recipe.lookId) || STYLE_TRAITS.some(key => recipe[key].length > 0));
export type DrawingStyleRecipe = z.infer<typeof recipeSchema>;
export const blankDrawingStyle: DrawingStyleRecipe = {
  name: "", line: "", figure: "", color: "", texture: "", background: "",
};
const entrySchema = z.object({ id: z.string().uuid(), recipe: recipeSchema });
const librarySchema = z.object({ version: z.literal(1), entries: z.array(entrySchema) });
export type SavedDrawingStyle = z.infer<typeof entrySchema>;

export function describeDrawingStyle(recipe: DrawingStyleRecipe, english = false): string {
  const labels = english
    ? ["Line", "Proportions", "Color and shade", "Texture", "Background"]
    : ["선", "인물 비례", "채색과 명암", "질감", "배경"];
  const selected = drawingStyleLooks.find(item => item.look.id === recipe.lookId);
  const treatment = selected ? [(english ? "Image treatment · " + selected.en : "이미지 보정 · " + selected.look.label)
    + (recipe.contrastOffset ? " (" + (english ? "contrast " : "대비 ") + signedOffset(recipe.contrastOffset) + ")" : "")] : [];
  return treatment.concat(STYLE_TRAITS.flatMap((key, index) =>
    recipe[key].trim() ? [labels[index] + " · " + recipe[key].trim()] : [],
  )).join("\n");
}

function signedOffset(offset: number) {
  return offset > 0 ? "+" + offset : String(offset);
}

export function imageLookForDrawingStyle(recipe: DrawingStyleRecipe): StudioLook | undefined {
  const base = drawingStyleLooks.find(item => item.look.id === recipe.lookId)?.look;
  if (!base) return undefined;
  const offset = recipe.contrastOffset ?? 0;
  if (!offset) return base;
  return { ...base, patch: { ...base.patch, contrast: Math.max(-100, Math.min(100, (base.patch.contrast ?? 0) + offset)) } };
}

const namespace = "studio-drawing-styles-v1";
const libraryKey = "library";

export function createDrawingStyleLibrary(store: StudioAsyncKeyValueStore) {
  let pending: Promise<unknown> = Promise.resolve();
  const read = async () => {
    const raw = await store.get(libraryKey);
    return raw === null ? [] : librarySchema.parse(JSON.parse(raw)).entries;
  };
  return {
    list: read,
    save(recipe: DrawingStyleRecipe, original?: SavedDrawingStyle) {
      const next = recipeSchema.parse(recipe);
      const update = async () => {
        const entries = await read();
        const id = original?.id ?? crypto.randomUUID();
        const prior = entries.find(entry => entry.id === id);
        if (original && (!prior || JSON.stringify(prior.recipe) !== JSON.stringify(original.recipe))) {
          throw new Error("style-conflict");
        }
        if (entries.some(entry => entry.id !== id && entry.recipe.name.normalize("NFKC").toLowerCase() === next.name.normalize("NFKC").toLowerCase())) {
          throw new Error("style-name-in-use");
        }
        const entry = { id, recipe: next };
        const updated = prior ? entries.map(item => item.id === id ? entry : item) : [...entries, entry];
        await store.set(libraryKey, JSON.stringify({ version: 1, entries: updated }));
        return { entry, entries: updated };
      };
      // OPFS는 한 탭이 소유한다. Web Locks가 있는 브라우저에서는 탭 전환 중에도 읽기·수정을 직렬화한다.
      const work = () => globalThis.navigator?.locks
        ? navigator.locks.request(namespace, update) : update();
      const result = pending.then(work, work);
      pending = result.catch(() => undefined);
      return result;
    },
  };
}

const libraries = new WeakMap<StudioLocalDatabase, ReturnType<typeof createDrawingStyleLibrary>>();
export async function getDrawingStyleLibrary(retry = false) {
  if (retry) await resetFailedStudioLocalDatabaseOwnership();
  const db = await acquireStudioLocalDatabase();
  const existing = libraries.get(db);
  if (existing) return existing;
  const library = createDrawingStyleLibrary(db.asAsyncKeyValueStore(namespace));
  libraries.set(db, library);
  return library;
}
