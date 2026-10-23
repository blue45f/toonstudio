// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { STUDIO_POSE_LIBRARY_ENTRIES } from "./studio-pose-library-search";
import { StudioPoseLibraryCard } from "./StudioPoseLibraryCard";

afterEach(cleanup);

function renderCard(entry: (typeof STUDIO_POSE_LIBRARY_ENTRIES)[number]) {
  return render(
    <StudioPoseLibraryCard entry={entry} pinned={false} onApply={vi.fn()} onTogglePin={vi.fn()} />,
  );
}

describe("2인 포즈 카드 썸네일(B-14)", () => {
  it("2인 카드는 두 인물과 2인 배지를 그리고, 화면 읽기에는 실루엣 하나만 남긴다", () => {
    const duoEntries = STUDIO_POSE_LIBRARY_ENTRIES.filter((entry) => entry.figures === 2);
    // 데생 인형 라이브러리와 웹툰 프리셋 양쪽에 2인 카드가 있다.
    expect(new Set(duoEntries.map((entry) => entry.kind))).toEqual(new Set(["mannequin", "webtoon"]));
    for (const entry of duoEntries) {
      const { container, unmount } = renderCard(entry);
      const thumbnail = container.querySelector('[data-studio-pose-duo-thumbnail="true"]');
      expect(thumbnail, entry.key).not.toBeNull();
      expect(thumbnail?.querySelectorAll("svg").length, entry.key).toBeGreaterThanOrEqual(2);
      expect(thumbnail?.textContent).toContain("2인");
      expect(screen.getAllByRole("img")).toHaveLength(1);
      unmount();
    }
  });

  it("데생 인형 실루엣은 머리가 골반 위에 있다(몸통을 아래로 그려 머리가 발치에 놓이던 회귀)", () => {
    for (const id of ["mannequin:stand", "mannequin:couple-hug-front"]) {
      const entry = STUDIO_POSE_LIBRARY_ENTRIES.find((candidate) => candidate.key === id);
      if (!entry) throw new Error(`${id} 카드가 없다`);
      const { container, unmount } = renderCard(entry);
      const svg = container.querySelector("svg[role='img']");
      const head = svg?.querySelector("circle");
      const torso = svg?.querySelectorAll("g")[1]?.querySelector("polyline");
      const hipsY = Number(torso?.getAttribute("points")?.split(" ")[0]?.split(",")[1]);
      expect(Number(head?.getAttribute("cy")), id).toBeLessThan(hipsY - 10);
      unmount();
    }
  });

  it("1인 카드는 예전처럼 실루엣 하나만 그린다", () => {
    const solo = STUDIO_POSE_LIBRARY_ENTRIES.find((entry) => entry.figures !== 2 && entry.kind === "mannequin");
    if (!solo) throw new Error("1인 데생 인형 카드가 없다");
    const { container } = renderCard(solo);
    expect(container.querySelector('[data-studio-pose-duo-thumbnail="true"]')).toBeNull();
    expect(container.querySelectorAll("svg[role='img']")).toHaveLength(1);
  });
});
