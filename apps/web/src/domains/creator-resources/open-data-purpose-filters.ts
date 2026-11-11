import type { OPEN_DATA_PROVIDERS } from "./resource-search-config";

export type OpenDataPurposeId =
  | "all"
  | "history"
  | "spatial"
  | "nature-costume"
  | "dialogue-audio"
  | "keyless";

type OpenDataProviderId = (typeof OPEN_DATA_PROVIDERS)[number];

export const OPEN_DATA_PURPOSE_FILTERS: readonly {
  readonly id: OpenDataPurposeId;
  readonly label: string;
  readonly enLabel: string;
}[] = [
  { id: "all", label: "전체 제공처", enLabel: "All Archives" },
  { id: "history", label: "시대·역사·고증", enLabel: "History & Period" },
  { id: "spatial", label: "배경·3D·장소", enLabel: "3D & Locations" },
  { id: "nature-costume", label: "복식·생물·과학", enLabel: "Costume & Science" },
  { id: "dialogue-audio", label: "어휘·음악·학교", enLabel: "Lexicon, Audio & School" },
  { id: "keyless", label: "가입·키 없음 즉시", enLabel: "Instant No-Key" },
] as const;

const PURPOSE_MAP: Readonly<Record<Exclude<OpenDataPurposeId, "all" | "keyless">, ReadonlySet<OpenDataProviderId>>> = {
  history: new Set<OpenDataProviderId>(["kheritage", "internetarchive", "europeana", "dpla", "smithsonian", "wikimedia"]),
  spatial: new Set<OpenDataProviderId>(["ambientcg", "tourapi", "kheritage"]),
  "nature-costume": new Set<OpenDataProviderId>(["vam", "gbif", "nasa", "smithsonian"]),
  "dialogue-audio": new Set<OpenDataProviderId>(["korean", "musicbrainz", "neis"]),
};

export function matchesOpenDataPurpose(
  provider: OpenDataProviderId,
  purpose: OpenDataPurposeId,
  isKeyless: boolean,
): boolean {
  if (purpose === "all") return true;
  if (purpose === "keyless") return isKeyless;
  return PURPOSE_MAP[purpose].has(provider);
}
