import { selectStudioOpfsFileSystem, type StudioOpfsFileSystem } from "../../studio-opfs-filesystem";
import { MAX_LEGACY_RECIPE_BYTES } from "./legacy-character-appearance";

const PREFIX = "originals/";
const ENTRY_PATH = /^originals\/([0-9a-f]{64})\.((?:[0-9a-f]{2}){1,56})\.json$/u;

export interface LegacyOriginal {
  readonly path: string;
  readonly name: string;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function digest(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}

export function decodeLegacyOriginal(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { ignoreBOM: true, fatal: true }).decode(bytes);
}

function fileLabel(name: string): string {
  const encoder = new TextEncoder();
  let label = "";
  const basename = name.split(/[\\/]/u).pop()?.trim() || "character.json";
  for (const char of basename) {
    if (char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) continue;
    if (encoder.encode(label + char).length > 51) return label + ".json";
    label += char;
  }
  return label || "character.json";
}

export async function openLegacyOriginalShelf(owner: string) {
  const actorHash = await digest(new TextEncoder().encode(owner));
  const { fs, durability } = await selectStudioOpfsFileSystem(undefined, { rootName: `toonstudio-character-originals-${actorHash}` });
  if (durability !== "durable") throw new Error("durable-storage-unavailable");
  return legacyOriginalShelf(fs);
}

/** Each explicitly saved source is one atomic file. Filenames contain no account identifiers or raw input paths. */
export function legacyOriginalShelf(fs: StudioOpfsFileSystem) {
  return {
    async save(raw: string, sourceName: string): Promise<void> {
      if (raw.length > MAX_LEGACY_RECIPE_BYTES) throw new Error("source-too-large");
      const bytes = new TextEncoder().encode(raw);
      if (bytes.length > MAX_LEGACY_RECIPE_BYTES) throw new Error("source-too-large");
      const name = hex(new TextEncoder().encode(fileLabel(sourceName)));
      const path = `${PREFIX}${await digest(bytes)}.${name}.json`;
      await fs.write(path, bytes);
    },
    async list(): Promise<LegacyOriginal[]> {
      const entries: LegacyOriginal[] = [];
      for (const path of await fs.list(PREFIX)) {
        const match = ENTRY_PATH.exec(path);
        if (!match?.[2]) continue;
        const nameBytes = Uint8Array.from(match[2].match(/../gu) ?? [], (pair) => Number.parseInt(pair, 16));
        try { entries.push({ path, name: fileLabel(decodeLegacyOriginal(nameBytes)) }); }
        catch { /* Ignore malformed shelf names. */ }
      }
      return entries;
    },
    async read(path: string): Promise<string> {
      const hash = ENTRY_PATH.exec(path)?.[1];
      if (!hash) throw new Error("invalid-original-path");
      const size = await fs.size(path);
      if (size === null || size > MAX_LEGACY_RECIPE_BYTES) throw new Error("invalid-original-size");
      const raw = await fs.read(path);
      if (!raw || raw.length !== size || await digest(Uint8Array.from(raw)) !== hash) throw new Error("invalid-original-content");
      return decodeLegacyOriginal(raw);
    },
  };
}
