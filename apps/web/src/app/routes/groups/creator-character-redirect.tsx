import { Navigate, useLocation } from "react-router-dom";

export function CharacterEntryRedirect({ pathname = "/studio/character" }: { readonly pathname?: string }) {
  const { search, hash, state } = useLocation();
  return <Navigate to={{ pathname, search, hash }} state={state} replace />;
}
