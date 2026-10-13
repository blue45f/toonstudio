import { describe, expect, it } from "vitest";

import { STATIC_TITLES } from "../route-titles";
import { legalRoutes } from "./legal.routes";

import { isPublicCreativeRoute } from "@/shared/components/site-public-routes";

const ABOUT_ROUTE_FAMILY = [
  { id: "legal-about", path: "/about" },
  { id: "legal-about-workflow", path: "/about/workflow" },
  { id: "legal-about-technology", path: "/about/technology" },
  { id: "legal-about-technology-architecture", path: "/about/technology/architecture" },
  { id: "legal-about-technology-libraries", path: "/about/technology/libraries" },
  { id: "legal-about-technology-story", path: "/about/technology/story" },
  { id: "legal-about-technology-guides", path: "/about/technology/guides" },
  { id: "legal-about-technology-references", path: "/about/technology/references" },
  { id: "legal-about-technology-field-notes", path: "/about/technology/field-notes" },
  { id: "legal-about-technology-deck", path: "/about/technology/deck" },
  { id: "legal-about-technology-videos", path: "/about/technology/videos" },
  { id: "legal-about-technology-licenses", path: "/about/technology/licenses" },
  { id: "legal-about-technology-glossary", path: "/about/technology/glossary" },
  { id: "legal-about-technology-atlas", path: "/about/technology/atlas" },
  { id: "legal-about-principles", path: "/about/principles" },
] as const;

describe("ToonStudio introduction route family", () => {
  it("registers the service, workflow, engineering-story and product-principles pages explicitly", () => {
    for (const expectedRoute of ABOUT_ROUTE_FAMILY) {
      expect(legalRoutes).toContainEqual(expect.objectContaining(expectedRoute));
    }
  });

  it("keeps every introduction page inside the public creative experience", () => {
    for (const { path } of ABOUT_ROUTE_FAMILY) {
      expect(isPublicCreativeRoute(path), path).toBe(true);
      expect(isPublicCreativeRoute(`${path}/`), `${path}/`).toBe(true);
    }
  });

  it("keeps generic route-title ownership while each page applies its specific document title", () => {
    // 소개 패밀리는 페이지별 전용 문서 제목을 갖는다(브라우저 제목 분리). 루트만 공용 키를 쓴다.
    const specificTitles: Record<string, string> = {
      "/about/workflow": "route.aboutWorkflow",
      "/about/technology": "route.technology",
      "/about/technology/architecture": "route.technologyArchitecture",
      "/about/technology/libraries": "route.technologyLibraries",
      "/about/technology/story": "route.technologyStory",
      "/about/technology/guides": "route.technologyGuides",
      "/about/technology/references": "route.technologyReferences",
      "/about/technology/field-notes": "route.technologyFieldNotes",
      "/about/technology/deck": "route.technologyDeck",
      "/about/technology/videos": "route.technologyVideos",
      "/about/technology/licenses": "route.technologyLicenses",
      "/about/technology/glossary": "route.technologyGlossary",
      "/about/technology/atlas": "route.technologyAtlas",
      "/about/principles": "route.aboutPrinciples",
    };
    for (const { path } of ABOUT_ROUTE_FAMILY) {
      expect(STATIC_TITLES[path], path).toBe(specificTitles[path] ?? "route.about");
    }
  });
});
