import { studioRoutePath } from "@/domains/creator/studio-route-registry";
import { defineAppRoutes } from "../app-route-definition";
import { CharacterEntryRedirect } from "./creator-character-redirect";

export const creatorCharacterAliasRoutes = defineAppRoutes([
  { id: "creator-character-shaper", path: "/shaper", element: <CharacterEntryRedirect pathname={studioRoutePath("asset-character-new")} /> },
  { id: "creator-character-shaper-alias", path: "/character-shaper", element: <CharacterEntryRedirect pathname={studioRoutePath("asset-character-new")} /> },
  { id: "creator-character-lab", path: "/character-lab", element: <CharacterEntryRedirect /> },
  { id: "creator-studio-character-lab", path: "/studio/character-lab", element: <CharacterEntryRedirect /> },
  { id: "creator-research-character-3d", path: "/research/character-3d", element: <CharacterEntryRedirect /> },
]);
