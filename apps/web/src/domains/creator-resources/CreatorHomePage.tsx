import { Navigate, useLocation } from "react-router-dom";
import { CreatorHomeExperience } from "../marketing/public/creator-home-experience";
import { creatorSectionFromHash } from "../marketing/public/creator-home-navigation";

/** Public front door. Historical introduction anchors keep their documented destination. */
export function CreatorHomePage() {
  const { hash } = useLocation();
  if (creatorSectionFromHash(hash)) return <Navigate to={{ pathname: "/about/studio", hash }} replace />;
  return <CreatorHomeExperience />;
}
