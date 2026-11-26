import { studioRoutePath } from "@/domains/creator/studio-route-registry";

import { StudioEntryRedirect } from "./LegacyCanvasRedirect";

export const creatorCharacterAliasRoutes = [
  { id: "creator-character-shaper", path: "/shaper", element: <StudioEntryRedirect pathname={studioRoutePath("asset-character-new")} /> },
  { id: "creator-character-shaper-alias", path: "/character-shaper", element: <StudioEntryRedirect pathname={studioRoutePath("asset-character-new")} /> },
  { id: "creator-character-lab", path: "/character-lab", element: <StudioEntryRedirect pathname="/studio/character" /> },
  { id: "creator-studio-character-lab", path: "/studio/character-lab", element: <StudioEntryRedirect pathname="/studio/character" /> },
  { id: "creator-research-character-3d", path: "/research/character-3d", element: <StudioEntryRedirect pathname="/studio/character" /> },
] as const;
