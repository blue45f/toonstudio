// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import {
  applyProcessComparePreset,
  applySyncedScroll,
  buildExternalCompareItem,
  buildPageCompareItem,
  buildProcessCompareItems,
  buildReferenceCompareItem,
  canOpenProcessCompare,
  compareSourceKey,
  countProcessCompareItemsBySourceKind,
  externalCompareAssetIdForFile,
  externalCompareAssetIdForUrl,
  findProcessCompareItemBySource,
  mergeProcessCompareItems,
  validateExternalCompareUrl,
  clampProcessCompareBlinkMs,
  clampProcessCompareSlider,
  clampProcessCompareZoom,
  computeProcessCompareDiffRegions,
  defaultProcessCompareSources,
  findProcessCompareItem,
  groupProcessCompareItems,
  moveProcessCompareSlider,
  processComparePlaceholderArt,
  processCompareSliderClip,
  processCompareSliderStep,
  zoomProcessCompareIn,
  zoomProcessCompareOut,
  areProcessCompareOffsetsAligned,
  isProcessCompareStoryboardItem,
  matchProcessComparePresetPage,
  processCompareLabelNumberToken,
  PROCESS_COMPARE_PRESET_IDS,
  PROCESS_COMPARE_PRESET_LABELS,
  clampProcessCompareOverlayOpacity,
  clampProcessComparePan,
  invertProcessComparePoint,
  panProcessCompareViewport,
  processComparePaneKey,
  processComparePaneTransformCss,
  resolveProcessComparePaneTransform,
  setProcessComparePaneOffset,
  zoomProcessCompareViewportAt,
  PROCESS_COMPARE_MODES,
  PROCESS_COMPARE_OFFSET_LIMIT,
  PROCESS_COMPARE_VIEWPORT_IDENTITY,
  type ProcessCompareItem,
} from "./process-compare-model";

const PROCESSES = [
  {
    id: "p-storyboard",
    label: "콘티",
    kind: "image" as const,
    revisions: [
      { id: "r1", createdAt: "2026-09-20T00:00:00Z" },
      { id: "r2", createdAt: "2026-09-21T00:00:00Z" },
    ],
  },
  {
    id: "p-line",
    label: "선화",
    kind: "image" as const,
    revisions: [{ id: "r3", createdAt: "2026-09-22T00:00:00Z" }],
  },
  {
    id: "p-empty",
    label: "채색",
    kind: "image" as const,
    revisions: [],
  },
];

describe("buildProcessCompareItems", () => {
  it("리비전이 있는 공정만 항목으로 만든다", () => {
    const items = buildProcessCompareItems(PROCESSES);
    expect(items).toHaveLength(3);
    expect(items.map((i) => i.id)).toEqual(["p-storyboard::r1", "p-storyboard::r2", "p-line::r3"]);
  });

  it("리비전 라벨은 1부터 시작하는 v번호다", () => {
    const items = buildProcessCompareItems(PROCESSES);
    expect(items[0].revisionLabel).toBe("v1");
    expect(items[1].revisionLabel).toBe("v2");
    expect(items[2].revisionLabel).toBe("v1");
  });

  it("resolveImageUrl이 없으면 imageUrl은 null이다", () => {
    const items = buildProcessCompareItems(PROCESSES);
    expect(items.every((i) => i.imageUrl === null)).toBe(true);
  });

  it("resolveImageUrl 결과를 반영한다", () => {
    const items = buildProcessCompareItems(PROCESSES, (pid, rid) => `https://img.test/${pid}/${rid}.png`);
    expect(items[0].imageUrl).toBe("https://img.test/p-storyboard/r1.png");
  });
});

describe("defaultProcessCompareSources", () => {
  it("서로 다른 공정의 최신 리비전을 layout개 선택한다", () => {
    const items = buildProcessCompareItems(PROCESSES);
    const sources = defaultProcessCompareSources(items, 2);
    expect(sources).toHaveLength(2);
    // 뒤에서부터: p-line r3, p-storyboard r2
    expect(sources[0]).toEqual({ processId: "p-storyboard", revisionId: "r2" });
    expect(sources[1]).toEqual({ processId: "p-line", revisionId: "r3" });
  });

  it("항목이 부족하면 가능한 만큼만 반환한다", () => {
    const items = buildProcessCompareItems(PROCESSES);
    const sources = defaultProcessCompareSources(items, 4);
    expect(sources).toHaveLength(2);
  });
});

describe("findProcessCompareItem", () => {
  it("공정+리비전으로 항목을 찾는다", () => {
    const items = buildProcessCompareItems(PROCESSES);
    const found = findProcessCompareItem(items, { processId: "p-line", revisionId: "r3" });
    expect(found?.processLabel).toBe("선화");
  });

  it("없으면 null을 반환한다", () => {
    const items = buildProcessCompareItems(PROCESSES);
    expect(findProcessCompareItem(items, { processId: "nope", revisionId: "nope" })).toBeNull();
  });
});

describe("groupProcessCompareItems", () => {
  it("공정별로 그룹핑한다", () => {
    const items = buildProcessCompareItems(PROCESSES);
    const groups = groupProcessCompareItems(items);
    expect(groups).toHaveLength(2);
    expect(groups[0].items).toHaveLength(2);
    expect(groups[1].items).toHaveLength(1);
  });
});

describe("슬라이더 수학", () => {
  it("clampProcessCompareSlider는 0~100으로 고정한다", () => {
    expect(clampProcessCompareSlider(-5)).toBe(0);
    expect(clampProcessCompareSlider(150)).toBe(100);
    expect(clampProcessCompareSlider(42.5)).toBe(42.5);
    expect(clampProcessCompareSlider(Number.NaN)).toBe(50);
  });

  it("processCompareSliderClip은 왼쪽 레이어 clip-path를 만든다", () => {
    expect(processCompareSliderClip(30)).toBe("inset(0 70% 0 0)");
    expect(processCompareSliderClip(0)).toBe("inset(0 100% 0 0)");
    expect(processCompareSliderClip(100)).toBe("inset(0 0% 0 0)");
  });

  it("moveProcessCompareSlider는 범위를 벗어나지 않는다", () => {
    expect(moveProcessCompareSlider(99, 5)).toBe(100);
    expect(moveProcessCompareSlider(1, -5)).toBe(0);
    expect(moveProcessCompareSlider(50, 10)).toBe(60);
  });

  it("Shift 키와 함께 누르면 크게 이동한다", () => {
    expect(processCompareSliderStep(false)).toBe(2);
    expect(processCompareSliderStep(true)).toBe(10);
  });
});

describe("줌 수학", () => {
  it("0.5~4 범위로 고정한다", () => {
    expect(clampProcessCompareZoom(0.1)).toBe(0.5);
    expect(clampProcessCompareZoom(10)).toBe(4);
    expect(clampProcessCompareZoom(1.5)).toBe(1.5);
  });

  it("in/out은 0.25 단위로 증감한다", () => {
    expect(zoomProcessCompareIn(1)).toBe(1.25);
    expect(zoomProcessCompareOut(1)).toBe(0.75);
    expect(zoomProcessCompareIn(4)).toBe(4);
    expect(zoomProcessCompareOut(0.5)).toBe(0.5);
  });
});

describe("applySyncedScroll", () => {
  it("소스의 스크롤 위치를 타깃에 복사한다", () => {
    const a = { scrollLeft: 0, scrollTop: 0 };
    const b = { scrollLeft: 0, scrollTop: 0 };
    applySyncedScroll([a, b], { scrollLeft: 120, scrollTop: 45 });
    expect(a).toEqual({ scrollLeft: 120, scrollTop: 45 });
    expect(b).toEqual({ scrollLeft: 120, scrollTop: 45 });
  });
});

describe("clampProcessCompareBlinkMs", () => {
  it("250~2000ms 범위로 고정한다", () => {
    expect(clampProcessCompareBlinkMs(100)).toBe(250);
    expect(clampProcessCompareBlinkMs(5000)).toBe(2000);
    expect(clampProcessCompareBlinkMs(800)).toBe(800);
  });
});

describe("computeProcessCompareDiffRegions", () => {
  function solid(w: number, h: number, r: number, g: number, b: number): Uint8ClampedArray {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i += 1) {
      data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b; data[i * 4 + 3] = 255;
    }
    return data;
  }

  it("동일한 이미지는 빈 배열을 반환한다", () => {
    const a = solid(16, 16, 100, 100, 100);
    expect(computeProcessCompareDiffRegions(a, a, 16, 16)).toEqual([]);
  });

  it("다른 영역을 % 좌표 박스로 반환한다", () => {
    const a = solid(16, 16, 0, 0, 0);
    const b = solid(16, 16, 0, 0, 0);
    // 오른쪽 절반을 흰색으로
    for (let y = 0; y < 16; y += 1) {
      for (let x = 8; x < 16; x += 1) {
        const i = (y * 16 + x) * 4;
        b[i] = 255; b[i + 1] = 255; b[i + 2] = 255;
      }
    }
    const regions = computeProcessCompareDiffRegions(a, b, 16, 16, { cellSize: 8, threshold: 10 });
    expect(regions.length).toBeGreaterThan(0);
    // 오른쪽 셀들이 감지되어야 한다
    expect(regions.some((r) => r.x >= 50)).toBe(true);
    for (const r of regions) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x + r.width).toBeLessThanOrEqual(100);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.y + r.height).toBeLessThanOrEqual(100);
    }
  });

  it("잘못된 입력에는 빈 배열을 반환한다", () => {
    expect(computeProcessCompareDiffRegions(new Uint8ClampedArray(4), new Uint8ClampedArray(8), 2, 2)).toEqual([]);
    expect(computeProcessCompareDiffRegions(new Uint8ClampedArray(0), new Uint8ClampedArray(0), 0, 0)).toEqual([]);
  });
});

describe("processComparePlaceholderArt", () => {
  it("SVG data URI를 반환한다", () => {
    const uri = processComparePlaceholderArt("image", "콘티", 0);
    expect(uri.startsWith("data:image/svg+xml,")).toBe(true);
    expect(decodeURIComponent(uri)).toContain("콘티");
  });

  it("종류별로 다른 색상을 사용한다", () => {
    const a = processComparePlaceholderArt("image", "x", 0);
    const b = processComparePlaceholderArt("text", "x", 0);
    expect(a).not.toBe(b);
  });

  it("HTML 특수문자를 이스케이프한다", () => {
    const uri = processComparePlaceholderArt("image", "<script>", 0);
    expect(decodeURIComponent(uri)).not.toContain("<script>");
  });
});

describe("canOpenProcessCompare", () => {
  it("2개 이상일 때만 true다", () => {
    const items: ProcessCompareItem[] = buildProcessCompareItems(PROCESSES);
    expect(canOpenProcessCompare(items)).toBe(true);
    expect(canOpenProcessCompare(items.slice(0, 1))).toBe(false);
    expect(canOpenProcessCompare([])).toBe(false);
  });
});

describe("비교 소스 개방 (1단계)", () => {
  it("리비전 항목은 revision 소스를 가진다", () => {
    const items = buildProcessCompareItems(PROCESSES);
    expect(items[0].source).toEqual({ kind: "revision", processId: "p-storyboard", revisionId: "r1" });
    expect(items[0].sourceKind).toBe("revision");
    expect(items[0].originNote).toBeNull();
  });

  it("외부 항목은 합성 페인 id와 출처 메모를 가진다", () => {
    const item = buildExternalCompareItem({ assetId: "url-abc", label: "시안.png", imageUrl: "https://x.test/a.png", originNote: "클라이언트 시안" });
    expect(item.source).toEqual({ kind: "external", assetId: "url-abc" });
    expect(item.processId).toBe("external:url-abc");
    expect(item.revisionId).toBe("url-abc");
    expect(item.originNote).toBe("클라이언트 시안");
    expect(findProcessCompareItem([item], { processId: item.processId, revisionId: item.revisionId })).toBe(item);
  });

  it("지난 회차·레퍼런스 항목도 기존 페인 기계로 찾을 수 있다", () => {
    const page = buildPageCompareItem({ projectId: "pr", episodeId: "ep11", pageId: "pg34", episodeLabel: "11화", pageLabel: "34컷", imageUrl: null });
    const ref = buildReferenceCompareItem({ boardId: "b1", itemId: "i9", boardLabel: "레퍼런스 보드", itemLabel: "포즈 3", imageUrl: null });
    expect(page.processId).toBe("page:ep11");
    expect(ref.processId).toBe("reference:b1");
    expect(findProcessCompareItemBySource([page, ref], { kind: "page", projectId: "pr", episodeId: "ep11", pageId: "pg34" })).toBe(page);
    expect(compareSourceKey(ref.source)).toBe("reference:b1::i9");
  });

  it("풀 병합은 소스 키로 중복을 제거하고 종류별로 센다", () => {
    const versions = buildProcessCompareItems(PROCESSES);
    const ext = buildExternalCompareItem({ assetId: "url-abc", label: "시안.png", imageUrl: null });
    const merged = mergeProcessCompareItems(versions, [ext], [ext]);
    expect(merged).toHaveLength(versions.length + 1);
    expect(countProcessCompareItemsBySourceKind(merged)).toEqual({ revision: 3, external: 1, page: 0, reference: 0 });
    expect(canOpenProcessCompare(merged)).toBe(true);
    // 버전 1개 + 외부 1개만으로도 나란히 비교가 열린다
    expect(canOpenProcessCompare(mergeProcessCompareItems(versions.slice(0, 1), [ext]))).toBe(true);
  });

  it("URL 검증은 http/https만 허용한다", () => {
    expect(validateExternalCompareUrl(" https://x.test/a.png ")).toEqual({ ok: true, url: "https://x.test/a.png" });
    expect(validateExternalCompareUrl("")).toEqual({ ok: false, reason: "empty" });
    expect(validateExternalCompareUrl("not a url")).toEqual({ ok: false, reason: "invalid" });
    expect(validateExternalCompareUrl("ftp://x.test/a.png")).toEqual({ ok: false, reason: "protocol" });
    expect(validateExternalCompareUrl("javascript:alert(1)")).toEqual({ ok: false, reason: "protocol" });
  });

  it("URL·파일 에셋 id는 결정적이다", () => {
    expect(externalCompareAssetIdForUrl("https://x.test/a.png")).toBe(externalCompareAssetIdForUrl("https://x.test/a.png"));
    expect(externalCompareAssetIdForUrl("https://x.test/a.png")).not.toBe(externalCompareAssetIdForUrl("https://x.test/b.png"));
    expect(externalCompareAssetIdForFile({ name: "draft final.png", size: 10, lastModified: 5 })).toBe("file-draft-final.png-10-5");
  });

  it("기본 페인은 서로 다른 소스를 우선 고른다", () => {
    const versions = buildProcessCompareItems(PROCESSES);
    const ext = buildExternalCompareItem({ assetId: "url-abc", label: "시안.png", imageUrl: null });
    const sources = defaultProcessCompareSources(mergeProcessCompareItems(versions, [ext]), 2);
    expect(sources).toHaveLength(2);
    expect(new Set(sources.map((s) => s.processId)).size).toBe(2);
  });
});

describe("비교 동기화·오버레이·반전 (2단계)", () => {
  it("모드는 기존 3종 + 오버레이 4종이다", () => {
    expect(PROCESS_COMPARE_MODES).toEqual(["panes", "slider", "blink", "overlay"]);
  });

  it("pan은 ±1로 고정하고 배율은 기존 줌 범위를 따른다", () => {
    expect(clampProcessComparePan(2)).toBe(1);
    expect(clampProcessComparePan(-2)).toBe(-1);
    expect(clampProcessComparePan(Number.NaN)).toBe(0);
    const moved = panProcessCompareViewport(PROCESS_COMPARE_VIEWPORT_IDENTITY, { dx: 0.3, dy: -0.2 });
    expect(moved).toEqual({ scale: 1, tx: 0.3, ty: -0.2 });
    expect(panProcessCompareViewport(moved, { dx: 5, dy: 0 }).tx).toBe(1);
  });

  it("중심점 고정 확대는 중심을 유지하고 한계에서 배율이 고정된다", () => {
    const zoomed = zoomProcessCompareViewportAt(PROCESS_COMPARE_VIEWPORT_IDENTITY, 2, { x: 0.5, y: 0.5 });
    expect(zoomed).toEqual({ scale: 2, tx: 0, ty: 0 });
    // 변환 원점이 중심이라 모서리(0,0) 기준 확대는 반대 방향으로 0.5만큼 보정된다
    const corner = zoomProcessCompareViewportAt(PROCESS_COMPARE_VIEWPORT_IDENTITY, 2, { x: 0, y: 0 });
    expect(corner.scale).toBe(2);
    expect(corner.tx).toBe(0.5);
    expect(corner.ty).toBe(0.5);
    expect(zoomProcessCompareViewportAt(PROCESS_COMPARE_VIEWPORT_IDENTITY, 99, { x: 0.5, y: 0.5 }).scale).toBe(4);
    expect(zoomProcessCompareViewportAt(PROCESS_COMPARE_VIEWPORT_IDENTITY, 0.01, { x: 0.5, y: 0.5 }).scale).toBe(0.5);
  });

  it("잠금 변환은 공유 뷰포트+페인 오프셋을 합성하고, 잠금 해제 시 개별 뷰포트를 쓴다", () => {
    const shared = { scale: 2, tx: 0.1, ty: 0 };
    const t = resolveProcessComparePaneTransform({
      syncView: true, shared, local: { scale: 3, tx: 0, ty: 0 },
      offset: { dx: 0.05, dy: -0.05 }, flipHorizontal: true, flipVertical: false,
    });
    expect(t).toEqual({ scale: 2, tx: 0.15, ty: -0.05, flipX: -1, flipY: 1 });
    const unlocked = resolveProcessComparePaneTransform({
      syncView: false, shared, local: { scale: 3, tx: 0, ty: 0 },
      offset: null, flipHorizontal: false, flipVertical: true,
    });
    expect(unlocked).toEqual({ scale: 3, tx: 0, ty: 0, flipX: 1, flipY: -1 });
    // 전 페인이 같은 공유 뷰포트+같은 오프셋이면 변환이 완전히 동일하다(동기화 판정 핵심)
    const other = resolveProcessComparePaneTransform({
      syncView: true, shared, offset: { dx: 0.05, dy: -0.05 }, flipHorizontal: true, flipVertical: false,
    });
    expect(other).toEqual(t);
  });

  it("변환 CSS는 translate %·scale·반전을 한 문자열로 만든다", () => {
    expect(processComparePaneTransformCss({ scale: 2, tx: 0.15, ty: -0.05, flipX: -1, flipY: 1 }))
      .toBe("translate(15%, -5%) scale(2) scaleX(-1) scaleY(1)");
  });

  it("오프셋은 ±0.25로 고정되고 0이면 키가 제거되며 정렬 판정이 동작한다", () => {
    expect(PROCESS_COMPARE_OFFSET_LIMIT).toBe(0.25);
    const key = processComparePaneKey({ processId: "p-line", revisionId: "r3" });
    expect(key).toBe("p-line::r3");
    const withOffset = setProcessComparePaneOffset({}, key, { dx: 0.9, dy: 0.1 });
    expect(withOffset[key]).toEqual({ dx: 0.25, dy: 0.1 });
    expect(areProcessCompareOffsetsAligned(withOffset)).toBe(false);
    const cleared = setProcessComparePaneOffset(withOffset, key, { dx: 0, dy: 0 });
    expect(cleared).toEqual({});
    expect(areProcessCompareOffsetsAligned(cleared)).toBe(true);
  });

  it("오버레이 투명도는 0~1로 고정되고 NaN이면 기본 0.5다", () => {
    expect(clampProcessCompareOverlayOpacity(-1)).toBe(0);
    expect(clampProcessCompareOverlayOpacity(2)).toBe(1);
    expect(clampProcessCompareOverlayOpacity(0.35)).toBe(0.35);
    expect(clampProcessCompareOverlayOpacity(Number.NaN)).toBe(0.5);
  });

  it("반전 좌표 보정은 켜진 축만 뒤집고 0..1로 고정한다", () => {
    expect(invertProcessComparePoint({ x: 0.25, y: 0.75 }, true, false)).toEqual({ x: 0.75, y: 0.75 });
    expect(invertProcessComparePoint({ x: 0.25, y: 0.75 }, true, true)).toEqual({ x: 0.75, y: 0.25 });
    expect(invertProcessComparePoint({ x: 0.25, y: 0.75 }, false, false)).toEqual({ x: 0.25, y: 0.75 });
  });
});

describe("검수 프리셋 3종 (FLAGSHIP §5.7)", () => {
  function presetPool(): ProcessCompareItem[] {
    const versions = buildProcessCompareItems(PROCESSES);
    const page33 = buildPageCompareItem({ projectId: "pr", episodeId: "ep11", pageId: "pg33", episodeLabel: "11화", pageLabel: "33컷", imageUrl: null, createdAt: "2026-09-10T00:00:00Z" });
    const page34 = buildPageCompareItem({ projectId: "pr", episodeId: "ep11", pageId: "pg34", episodeLabel: "11화", pageLabel: "34컷", imageUrl: null, createdAt: "2026-09-11T00:00:00Z" });
    const extOld = buildExternalCompareItem({ assetId: "url-old", label: "시안1.png", imageUrl: null, createdAt: "2026-09-15T00:00:00Z" });
    const extNew = buildExternalCompareItem({ assetId: "url-new", label: "시안2.png", imageUrl: null, createdAt: "2026-09-23T00:00:00Z" });
    return mergeProcessCompareItems(versions, [page33, page34], [extOld, extNew]);
  }

  it("프리셋은 3종이고 라벨이 고정돼 있다", () => {
    expect(PROCESS_COMPARE_PRESET_IDS).toEqual(["previous-episode", "storyboard", "external-brief"]);
    expect(PROCESS_COMPARE_PRESET_LABELS["previous-episode"].ko).toBe("전 회차와 비교");
    expect(PROCESS_COMPARE_PRESET_LABELS["storyboard"].ko).toBe("콘티와 비교");
    expect(PROCESS_COMPARE_PRESET_LABELS["external-brief"].ko).toBe("시안과 비교");
  });

  it("콘티 판정은 공정 id·라벨로 하고 다른 소스는 콘티가 아니다", () => {
    const items = buildProcessCompareItems(PROCESSES);
    expect(isProcessCompareStoryboardItem(items[0])).toBe(true); // p-storyboard · 콘티
    expect(isProcessCompareStoryboardItem(items[2])).toBe(false); // 선화
    const ext = buildExternalCompareItem({ assetId: "a", label: "콘티 시안.png", imageUrl: null });
    expect(isProcessCompareStoryboardItem(ext)).toBe(false); // external은 라벨과 무관하게 제외
  });

  it("전 회차 프리셋: 현재 원고는 최신 비콘티 리비전, 상대는 첫 지난 회차 페이지", () => {
    const pool = presetPool();
    const result = applyProcessComparePreset(pool, "previous-episode");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.current.id).toBe("p-line::r3");
    expect(result.counterpart.sourceKind).toBe("page");
    expect(result.counterpart.revisionId).toBe("pg33");
    expect(result.sources).toEqual([
      { processId: "p-line", revisionId: "r3" },
      { processId: "page:ep11", revisionId: "pg33" },
    ]);
  });

  it("컷 번호 토큰이 원고 라벨에 있으면 같은 컷의 전 회차 페이지를 고른다", () => {
    expect(processCompareLabelNumberToken("34컷 선화")).toBe("34");
    expect(processCompareLabelNumberToken("선화")).toBeNull();
    const cutItems = buildProcessCompareItems([
      { id: "p-cut", label: "34컷 선화", kind: "image" as const, revisions: [{ id: "c1", createdAt: "2026-09-22T00:00:00Z" }] },
    ]);
    const pages = [
      buildPageCompareItem({ projectId: "pr", episodeId: "ep11", pageId: "pg33", episodeLabel: "11화", pageLabel: "33컷", imageUrl: null }),
      buildPageCompareItem({ projectId: "pr", episodeId: "ep11", pageId: "pg34", episodeLabel: "11화", pageLabel: "34컷", imageUrl: null }),
    ];
    expect(matchProcessComparePresetPage(pages, cutItems[0])?.revisionId).toBe("pg34");
    const result = applyProcessComparePreset(mergeProcessCompareItems(cutItems, pages), "previous-episode");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.counterpart.revisionId).toBe("pg34");
  });

  it("콘티 프리셋: 상대는 가장 최근 콘티 리비전이다", () => {
    const pool = presetPool();
    const result = applyProcessComparePreset(pool, "storyboard");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.current.id).toBe("p-line::r3");
    expect(result.counterpart.id).toBe("p-storyboard::r2");
    expect(result.sources[1]).toEqual({ processId: "p-storyboard", revisionId: "r2" });
  });

  it("첫 페인이 콘티면 콘티 프리셋의 기준은 원고 리비전으로 바뀐다", () => {
    const pool = presetPool();
    const result = applyProcessComparePreset(pool, "storyboard", [{ processId: "p-storyboard", revisionId: "r1" }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.current.id).toBe("p-line::r3");
    expect(result.counterpart.id).toBe("p-storyboard::r2");
  });

  it("시안 프리셋: 상대는 가장 최근에 들어온 external 소스다", () => {
    const pool = presetPool();
    const result = applyProcessComparePreset(pool, "external-brief");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.current.id).toBe("p-line::r3");
    expect(result.counterpart.id).toBe("external:url-new");
    expect(result.current.id).not.toBe(result.counterpart.id);
  });

  it("첫 페인에 배치된 원고는 프리셋에서도 기준으로 유지된다", () => {
    const pool = presetPool();
    const result = applyProcessComparePreset(pool, "external-brief", [{ processId: "p-storyboard", revisionId: "r1" }, { processId: "p-line", revisionId: "r3" }]);
    // 첫 페인이 콘티라 기준에서 제외되고, 다음 후보(최신 비콘티 리비전)가 기준이 된다
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.current.id).toBe("p-line::r3");
    const kept = applyProcessComparePreset(pool, "previous-episode", [{ processId: "p-line", revisionId: "r3" }]);
    expect(kept.ok).toBe(true);
    if (kept.ok) expect(kept.current.id).toBe("p-line::r3");
  });

  it("상대 소스가 없으면 no-counterpart, 원고가 없으면 no-current다", () => {
    const versionsOnly = buildProcessCompareItems(PROCESSES);
    expect(applyProcessComparePreset(versionsOnly, "previous-episode")).toEqual({ ok: false, preset: "previous-episode", reason: "no-counterpart" });
    expect(applyProcessComparePreset(versionsOnly, "external-brief")).toEqual({ ok: false, preset: "external-brief", reason: "no-counterpart" });
    expect(applyProcessComparePreset([], "storyboard")).toEqual({ ok: false, preset: "storyboard", reason: "no-current" });
    const extOnly = [buildExternalCompareItem({ assetId: "a", label: "시안.png", imageUrl: null })];
    expect(applyProcessComparePreset(extOnly, "previous-episode")).toEqual({ ok: false, preset: "previous-episode", reason: "no-current" });
  });

  it("콘티만 있는 풀에서는 콘티 프리셋이 기준 원고 없음으로 실패한다", () => {
    const storyboardOnly = buildProcessCompareItems([PROCESSES[0]]);
    expect(applyProcessComparePreset(storyboardOnly, "storyboard")).toEqual({ ok: false, preset: "storyboard", reason: "no-current" });
  });
});
