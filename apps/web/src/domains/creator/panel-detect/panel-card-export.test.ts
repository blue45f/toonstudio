import { describe, expect, it } from "vitest";

import { readStudioZipArchive } from "../studio-zip-reader";

import {
  CARD_BUNDLE_MANIFEST_PATH,
  CARD_BUNDLE_README_PATH,
  CARD_BUNDLE_SCHEMA,
  CardBundleError,
  buildCardBundleManifest,
  buildCardBundleReadme,
  buildCardNewsBundle,
  cardBundleFileName,
  cardImageFileName,
  cardImagePath,
} from "./panel-card-export";
import { cardContentOffset, canRenderCards, renderCardNewsCards } from "./panel-card-render";
import { sliceCards } from "./panel-card-slice";
import { FixtureImage, WHITE } from "./panel-detect-fixtures";
import { fakeCanvasWorld, fakePngBlob, fixtureDrawable, noYield } from "./panel-detect-test-doubles";
import { createPanelImportRights } from "./panel-import-rights";

const RIGHTS = createPanelImportRights({
  confirmed: true,
  attestedAt: "2026-10-15T03:00:00.000Z",
  note: "직접 그린 원고",
  source: { fileName: "에피소드 3.png", mimeType: "image/png", sizeBytes: 9000, width: 720, height: 3000, sha256: "b".repeat(64) },
});

function longStrip(): FixtureImage {
  const image = new FixtureImage(720, 3000, WHITE);
  image.art(20, 40, 680, 700, { seed: 0 });
  image.art(20, 800, 680, 800, { seed: 1 });
  image.art(20, 1660, 680, 700, { seed: 2 });
  image.art(20, 2420, 680, 540, { seed: 3 });
  return image;
}

function planFor(image: FixtureImage) {
  return sliceCards(image.raster()).plan;
}

describe("카드 렌더", () => {
  it("카드마다 1080×1350 면에 바탕색을 깔고 조각을 카드 폭에 맞춰 가운데에 그린다", async () => {
    const image = longStrip();
    const plan = planFor(image);
    const world = fakeCanvasWorld();
    const progress: number[] = [];
    const cards = await renderCardNewsCards(plan, fixtureDrawable(image), world.deps, {
      alignment: "center",
      yieldNow: noYield,
      onProgress: (done) => progress.push(done),
    });
    expect(cards).toHaveLength(plan.cards.length);
    expect(progress).toEqual(plan.cards.map((_, index) => index + 1));
    plan.cards.forEach((card, index) => {
      const surface = world.surfaces[index];
      expect({ width: surface.width, height: surface.height }).toEqual({ width: 1080, height: 1350 });
      expect(surface.fills).toEqual([plan.background]);
      expect(surface.draws).toEqual([{
        from: { x: 0, y: card.y0, width: 720, height: card.y1 - card.y0 },
        to: { x: 0, y: Math.floor((1350 - card.outputHeight) / 2), width: 1080, height: card.outputHeight },
      }]);
      expect(surface.disposed).toBe(true);
      expect(cards[index].index).toBe(index);
      expect(cards[index].blob.type).toBe("image/png");
    });
  });

  it("위 정렬은 조각을 카드 맨 위에 붙인다", async () => {
    const image = longStrip();
    const plan = planFor(image);
    const world = fakeCanvasWorld();
    await renderCardNewsCards(plan, fixtureDrawable(image), world.deps, { alignment: "top", yieldNow: noYield });
    for (const surface of world.surfaces) expect(surface.draws[0].to.y).toBe(0);
    expect(cardContentOffset(plan, plan.cards[0], "top")).toBe(0);
    expect(cardContentOffset(plan, plan.cards[0], "center")).toBe(Math.floor((1350 - plan.cards[0].outputHeight) / 2));
  });

  it("카드 사이에 취소하면 cancelled 로 끝나고, 인코딩 실패는 카드 번호를 알린다", async () => {
    const image = longStrip();
    const plan = planFor(image);
    const controller = new AbortController();
    await expect(renderCardNewsCards(plan, fixtureDrawable(image), fakeCanvasWorld().deps, {
      alignment: "center",
      signal: controller.signal,
      yieldNow: () => { controller.abort(); return Promise.resolve(); },
    })).rejects.toMatchObject({ code: "cancelled" });
    const failing = fakeCanvasWorld({ failEncodeAt: 1 });
    await expect(renderCardNewsCards(plan, fixtureDrawable(image), failing.deps, { alignment: "center", yieldNow: noYield }))
      .rejects.toMatchObject({ code: "encode-failed", subject: 2 });
    expect(failing.surfaces.every((surface) => surface.disposed)).toBe(true);
  });

  it("브라우저가 만들 수 없는 카드 크기는 그리기 전에 알린다", async () => {
    const image = longStrip();
    const plan = sliceCards(image.raster(), { cardWidth: 4_096, cardHeight: 8_192 }).plan;
    expect(canRenderCards(plan)).toBe(false);
    const world = fakeCanvasWorld();
    await expect(renderCardNewsCards(plan, fixtureDrawable(image), world.deps, { alignment: "center", yieldNow: noYield }))
      .rejects.toMatchObject({ code: "surface-unavailable" });
    expect(world.surfaces).toHaveLength(0);
  });
});

describe("카드 파일 이름", () => {
  it("장수의 자릿수에 맞춰 0 으로 채워 이름순이 곧 카드 순서가 되게 한다", () => {
    expect(cardImageFileName(0, 5)).toBe("card-01.png");
    expect(cardImageFileName(8, 12)).toBe("card-09.png");
    expect(cardImageFileName(99, 120)).toBe("card-100.png");
    expect(cardImagePath(2, 12)).toBe("cards/card-03.png");
    const names = Array.from({ length: 120 }, (_, index) => cardImageFileName(index, 120));
    expect([...names].sort()).toEqual(names);
    expect(cardBundleFileName("에피소드 3 / 최종")).toBe("에피소드 3 - 최종-card-news.zip");
    expect(cardBundleFileName("   ")).toBe("toonstudio-cards-card-news.zip");
  });
});

describe("카드뉴스 ZIP 묶음", () => {
  async function bundle(onProgress?: (done: number, total: number) => void) {
    const image = longStrip();
    const plan = planFor(image);
    const rendered = plan.cards.map((card) => ({ index: card.index, width: 1080, height: 1350, blob: fakePngBlob(1080, 1350, card.index) }));
    const result = await buildCardNewsBundle({
      cards: rendered,
      plan,
      title: "에피소드 3",
      rights: RIGHTS,
      alignment: "center",
      generatedAt: new Date("2026-10-15T05:00:00.000Z"),
      crc32ExecutionMode: "direct-headless",
      onProgress,
    });
    return { plan, rendered, result };
  }

  it("README·매니페스트·순서 파일명의 카드 PNG 를 담은 ZIP 을 만들고 다시 읽어도 같다", async () => {
    const { plan, rendered, result } = await bundle();
    expect(result.fileName).toBe("에피소드 3-card-news.zip");
    const archive = await readStudioZipArchive(result.blob);
    expect(archive.entries.map((entry) => entry.path)).toEqual([
      CARD_BUNDLE_README_PATH,
      CARD_BUNDLE_MANIFEST_PATH,
      ...plan.cards.map((card) => cardImagePath(card.index, plan.cards.length)),
    ]);
    const first = await archive.readEntry(cardImagePath(0, plan.cards.length));
    expect(Array.from(first)).toEqual(Array.from(new Uint8Array(await rendered[0].blob.arrayBuffer())));
    const manifest = JSON.parse(new TextDecoder().decode(await archive.readEntry(CARD_BUNDLE_MANIFEST_PATH)));
    expect(manifest).toEqual(JSON.parse(JSON.stringify(result.manifest)));
    expect(manifest.schema).toBe(CARD_BUNDLE_SCHEMA);
  });

  it("매니페스트에 원본 영수증·권리 확인 기록·카드별 원본 행 범위와 절단 품질을 남긴다", async () => {
    const { plan, result } = await bundle();
    const { manifest } = result;
    expect(manifest.source.sha256).toBe("b".repeat(64));
    expect(manifest.rights.statement).toBe("owned-or-licensed");
    expect(manifest.rights.note).toBe("직접 그린 원고");
    expect(manifest.card).toEqual({ width: 1080, height: 1350, ratio: "4:5", alignment: "center", background: plan.background });
    expect(manifest.cards).toHaveLength(plan.cards.length);
    manifest.cards.forEach((entry, index) => {
      expect(entry.ordinal).toBe(index + 1);
      expect(entry.sourceRows).toEqual([plan.cards[index].y0, plan.cards[index].y1]);
      expect(entry.cutBelow?.y ?? null).toBe(plan.cuts[index]?.y ?? null);
    });
    expect(manifest.cards[manifest.cards.length - 1].cutBelow).toBeNull();
    expect(manifest.generatedAt).toBe("2026-10-15T05:00:00.000Z");
  });

  it("안내문에 순서, 원본, 권리 확인 문구와 면책, 로컬 처리 사실을 한글로 적는다", async () => {
    const { result } = await bundle();
    const readme = buildCardBundleReadme(result.manifest);
    expect(readme).toContain("에피소드 3 — 카드뉴스");
    expect(readme).toContain("cards/card-01.png");
    expect(readme).toContain("내가 권리를 가진 원고이거나 이용 허락을 받은 원고입니다");
    expect(readme).toContain("직접 그린 원고");
    expect(readme).toContain("법률 자문, 권리 인증");
    expect(readme).toContain("서버로 보내지 않았어요");
  });

  it("카드 PNG 만 진행률에 세고 마지막에 전체 장수가 된다", async () => {
    const seen: Array<readonly [number, number]> = [];
    const { plan } = await bundle((done, total) => seen.push([done, total]));
    expect(seen.map(([done]) => done)).toEqual(plan.cards.map((_, index) => index + 1));
    expect(seen.every(([, total]) => total === plan.cards.length)).toBe(true);
  });

  it("카드가 없거나 계획과 장수가 다르면 만들지 않고, 작성기 실패와 취소는 구분한다", async () => {
    const image = longStrip();
    const plan = planFor(image);
    const base = { plan, title: "t", rights: RIGHTS, alignment: "center", generatedAt: new Date("2026-10-15T05:00:00.000Z") } as const;
    expect(() => buildCardBundleManifest({ ...base, cards: [] })).toThrowError(expect.objectContaining({ code: "no-cards" }));
    expect(() => buildCardBundleManifest({ ...base, cards: [{ index: 0, width: 1080, height: 1350, blob: fakePngBlob(1, 1) }] }))
      .toThrowError(expect.objectContaining({ code: "mismatch" }));
    const cards = plan.cards.map((card) => ({ index: card.index, width: 1080, height: 1350, blob: fakePngBlob(1080, 1350, card.index) }));
    await expect(buildCardNewsBundle({ ...base, cards, buildArchive: () => Promise.reject(new Error("디스크 가득")) }))
      .rejects.toMatchObject({ code: "archive-failed" });
    const controller = new AbortController();
    controller.abort();
    await expect(buildCardNewsBundle({ ...base, cards, signal: controller.signal, buildArchive: () => Promise.reject(new Error("aborted")) }))
      .rejects.toBeInstanceOf(CardBundleError);
    await expect(buildCardNewsBundle({ ...base, cards, signal: controller.signal, buildArchive: () => Promise.reject(new Error("aborted")) }))
      .rejects.toMatchObject({ code: "cancelled" });
  });
});
