import { StudioEntryRedirect } from "./LegacyCanvasRedirect";

export function CharacterEntryRedirect({ pathname = "/studio/character" }: { readonly pathname?: string }) {
  return <StudioEntryRedirect pathname={pathname} />;
}
