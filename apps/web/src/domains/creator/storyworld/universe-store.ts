/** 스토리월드 보조 문서(공유 세계관 레지스트리·검사 처리 상태)용 SQLite/OPFS 저장소.
 *
 * 작품 문서 저장소(draft-store)와 같은 네임스페이스·봉투·키별 쓰기 직렬화를 쓰되,
 * 페이로드는 호출자가 직렬화한 문자열 그대로 보관한다. 브라우저 KV 폴백은 두지 않는다.
 */
import type { StudioLocalDatabase } from "../studio-local-database";
import { STORYWORLD_DRAFT_NAMESPACE } from "./draft-store";
import {
  EMPTY_STORYWORLD_UNIVERSE_REGISTRY,
  parseStoryworldUniverseRegistry,
  type StoryworldUniverseRegistry,
} from "./studio-storyworld-universe";

export const STORYWORLD_UNIVERSE_REGISTRY_KEY = "toonspectrum:storyworld-universes:v1";
const MAX_BYTES = 1_100_000;
type Database = Pick<StudioLocalDatabase, "kvGet" | "kvSet">;

function bounded(value: string): void {
  if (new TextEncoder().encode(value).byteLength > MAX_BYTES) {
    throw new Error("스토리월드 보조 데이터가 허용 크기를 초과했습니다.");
  }
}

export function createStoryworldAuxStore(acquireDatabase: () => Promise<Database>) {
  const tails = new Map<string, Promise<void>>();
  return {
    async load(key: string): Promise<string | null> {
      await tails.get(key);
      const database = await acquireDatabase();
      const raw = await database.kvGet(STORYWORLD_DRAFT_NAMESPACE, key);
      if (raw === null) return null;
      bounded(raw);
      const envelope: unknown = JSON.parse(raw);
      if (typeof envelope !== "object" || envelope === null
        || !("version" in envelope) || envelope.version !== 1
        || !("documentKey" in envelope) || envelope.documentKey !== key
        || !("payload" in envelope) || typeof envelope.payload !== "string") {
        throw new Error("스토리월드 보조 문서의 버전 또는 범위가 일치하지 않습니다.");
      }
      return envelope.payload;
    },
    save(key: string, payload: string): Promise<void> {
      let serialized: string;
      try {
        serialized = JSON.stringify({ version: 1, documentKey: key, savedAtIso: new Date().toISOString(), payload });
        bounded(serialized);
      } catch (error) {
        return Promise.reject(error);
      }
      const current = (tails.get(key) ?? Promise.resolve()).catch(() => undefined).then(async () => {
        const database = await acquireDatabase();
        await database.kvSet(STORYWORLD_DRAFT_NAMESPACE, key, serialized);
      });
      tails.set(key, current);
      const retire = () => { if (tails.get(key) === current) tails.delete(key); };
      void current.then(retire, retire);
      return current;
    },
  };
}

async function acquireAuxDatabase(): Promise<Database> {
  const { acquireStudioLocalDatabase } = await import("../studio-local-database-runtime");
  return acquireStudioLocalDatabase();
}

export const storyworldAuxStore = createStoryworldAuxStore(acquireAuxDatabase);

export async function loadStoryworldUniverseRegistry(): Promise<StoryworldUniverseRegistry> {
  const raw = await storyworldAuxStore.load(STORYWORLD_UNIVERSE_REGISTRY_KEY);
  if (raw === null) return EMPTY_STORYWORLD_UNIVERSE_REGISTRY;
  return parseStoryworldUniverseRegistry(raw);
}

export function saveStoryworldUniverseRegistry(registry: StoryworldUniverseRegistry): Promise<void> {
  return storyworldAuxStore.save(STORYWORLD_UNIVERSE_REGISTRY_KEY, JSON.stringify(registry));
}
