import { useEffect, useState } from "react";

export interface ProductionUnavailableMatch {
  readonly id: string;
  readonly label: string;
  readonly location: string;
  readonly requiredMode: string;
}

function inferRequiredMode(entryId: string): string {
  if (
    entryId === "inspector.text-fill"
    || entryId === "inspector.typography"
    || entryId === "inspector.text-align"
    || entryId.startsWith("text.")
  ) {
    return "필요 모드: 원고 편집기(2D 캔버스) · 글자·말풍선 편집";
  }
  if (
    entryId === "inspector.drawing-properties"
    || entryId === "inspector.brush-engines"
    || entryId === "panel.brush-studio"
    || entryId === "property.pressure-tilt-curve"
    || entryId === "property.stroke-stabilization"
    || entryId.startsWith("brush.")
  ) {
    return "필요 모드: 원고 편집기(2D 캔버스) · 펜·브러시 그리기";
  }
  if (
    entryId === "panel.character-shaper"
    || entryId === "property.bg3d-placement"
    || entryId.startsWith("3d.")
  ) {
    return "필요 모드: 스튜디오 3D 캐릭터·배경 작업실";
  }
  return "필요 모드: 원고 편집기(2D 캔버스) 또는 회차 공동 작업실";
}

export function useProductionUnavailableStudioMatches(
  query: string,
): readonly ProductionUnavailableMatch[] {
  const [matches, setMatches] = useState<readonly ProductionUnavailableMatch[]>([]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setMatches([]);
      return;
    }
    let alive = true;
    void Promise.all([
      import("../studio-command-search"),
      import("../planning/studio-command-search-unavailability"),
    ])
      .then(([searchMod, unavailMod]) => {
        if (!alive) return;
        const outcome = searchMod.searchStudio(
          trimmed,
          { kinds: ["command", "property", "panel"], totalLimit: 3, sectionLimit: 3 },
          unavailMod.studioDiscoverableSearchIndex(),
        );
        setMatches(
          outcome.sections
            .flatMap((section) => section.results)
            .slice(0, 3)
            .map(({ entry }) => ({
              id: entry.id,
              label: entry.label,
              location: entry.location,
              requiredMode: inferRequiredMode(entry.id),
            })),
        );
      })
      .catch(() => {
        if (alive) setMatches([]);
      });
    return () => {
      alive = false;
    };
  }, [query]);

  return matches;
}
