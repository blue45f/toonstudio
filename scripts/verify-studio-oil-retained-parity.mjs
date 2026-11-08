/** 실제 Chromium Canvas에서 유화 혼색·별칭·반전·정착 재생의 소스 패리티를 검증한다. */
import { createServer } from "vite";
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const reportPath =
  process.env.TOONSTUDIO_OIL_PARITY_REPORT ??
  join(tmpdir(), "toonstudio-oil-retained-parity.json");
const server = await createServer({
  configFile: false,
  root: repositoryRoot,
  server: { host: "127.0.0.1", port: 0 },
  resolve: { alias: { "@": `${repositoryRoot}/apps/web/src` } },
});
await server.listen();
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.route("**/oil-qa", (r) =>
    r.fulfill({ contentType: "text/html", body: "<html><body></body></html>" })
  );
  await page.goto(`${server.resolvedUrls.local[0]}oil-qa`);
  const results = await page.evaluate(async () => {
    const root = "/apps/web/src/domains/creator";
    const { StudioLiveRetainedMediaOverlayRenderer: Renderer } = await import(
      `${root}/live/studio-live-retained-media-overlay.ts`
    );
    const { planOilBrushDabs, fxBrushSeedFromKey, FX_OIL_DAB_CAP } =
      await import(`${root}/studio-fx-brush.ts`);
    const {
      planStudioOilRibbonCarrier,
      studioOilRibbonProgramsForBrush,
      paintStudioOilRibbonCarrier,
    } = await import(`${root}/brush/studio-oil-ribbon-carrier.ts`);
    const { studioBrushAliasEffectiveDiameter } = await import(
      `${root}/brush/studio-brush-alias-profile.ts`
    );
    const { studioOilFamilyPlanFields } = await import(
      `${root}/brush/studio-fluid-paint-reference.ts`
    );
    const { resolveStudioFreehandRenderPath, strokeRenderDistance } =
      await import(`${root}/studio-brush.ts`);
    const {
      paintStudioOilRibbonCarrierIncremental,
      resetStudioOilRibbonIncrementalPaintForTests,
    } = await import(`${root}/brush/studio-oil-ribbon-incremental-paint.ts`);
    const make = () => {
      const c = document.createElement("canvas");
      c.width = 800;
      c.height = 240;
      return c;
    };
    const flat = (a) => {
      const c = make(),
        ctx = c.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 800, 240);
      ctx.drawImage(a, 0, 0);
      return ctx.getImageData(0, 0, 800, 240).data;
    };
    const diff = (a, b) => {
      const aa = flat(a),
        bb = flat(b);
      let changed = 0,
        max = 0;
      for (let i = 0; i < aa.length; i += 4) {
        let d = 0;
        for (let j = 0; j < 4; j++)
          d = Math.max(d, Math.abs(aa[i + j] - bb[i + j]));
        max = Math.max(d, max);
        if (d > 6) changed++;
      }
      return { changed, max };
    };
    const canonical = (
      canvas,
      e,
      scale = 1,
      flipX = false,
      painter = paintStudioOilRibbonCarrier
    ) => {
      const dabs = planOilBrushDabs({
        points: resolveStudioFreehandRenderPath(e.points, {
          sampleSpacing: e.sampleSpacing,
          legacyMinDistance: strokeRenderDistance(e.sampleSpacing),
          legacyTension: 0,
        }).points,
        pressures: e.pressures,
        baseWidth: studioBrushAliasEffectiveDiameter(e.brush, e.strokeWidth),
        seed: fxBrushSeedFromKey(e.id),
        maxDabs: FX_OIL_DAB_CAP,
        ...studioOilFamilyPlanFields(e.brush),
      });
      const context = canvas.getContext("2d");
      context.save();
      context.setTransform(
        flipX ? -scale : scale,
        0,
        0,
        scale,
        flipX ? 800 * scale : 0,
        0
      );
      painter(Object.assign(context, { _context: context }), {
        incrementalKey: e.id,
        carrier: planStudioOilRibbonCarrier(
          dabs,
          studioOilRibbonProgramsForBrush(e.brush, fxBrushSeedFromKey(e.id))
        ),
        stroke: e.stroke,
        opacity: e.opacity,
        points: dabs.map((d) => ({ x: d.x, y: d.y })),
        radiusPx: Math.max(
          1,
          dabs.reduce((sum, d) => sum + d.radiusY, 0) / Math.max(1, dabs.length)
        ),
      });
      context.restore();
    };
    const results = [];
    for (const brush of [
      "oil",
      "acrylic",
      "oil--flat-ribbon",
      "oil--filbert-ribbon",
      "acrylic--stiff-ribbon",
    ])
      for (const opacity of [1, 0.3])
        for (const underlay of ["clear", "blue", "translucent"])
          for (const scale of [1, 0.75])
            for (const flipX of [false, true])
              for (const sampleSpacing of [1, undefined]) {
                const base = make(),
                  active = make(),
                  settled = make(),
                  expected = make(),
                  composed = make();
                if (underlay !== "clear") {
                  const c = base.getContext("2d");
                  c.fillStyle =
                    underlay === "blue" ? "#123ebe" : "rgba(18,62,190,.4)";
                  c.fillRect(70, 30, 300, 170);
                }
                expected.getContext("2d").drawImage(base, 0, 0);
                const r = new Renderer({ now: () => 100000 });
                r.attach({ activeCanvas: active, settledCanvas: settled });
                r.setSurface({
                  left: 0,
                  top: 0,
                  width: 800,
                  height: 240,
                  documentScale: scale,
                  documentWidth: 800,
                  flipX,
                });
                r.oilUnderlay.setProvider(() => ({
                  canvas: base,
                  left: 0,
                  top: 0,
                  pixelRatio: 1,
                }));
                const e = {
                  id: `matrix-${brush}-${opacity}`,
                  type: "draw",
                  kind: "freehand",
                  mode: "pen",
                  brush,
                  stroke: "#e4c735",
                  strokeWidth: 24,
                  opacity,
                  sampleSpacing,
                  points: [
                    40, 120, 100, 105, 200, 90, 310, 100, 430, 145, 590, 130,
                  ],
                  pressures: [0.4, 0.7, 0.8, 0.6, 0.5, 0.4],
                };
                r.begin({
                  ...e,
                  points: e.points.slice(0, 2),
                  pressures: e.pressures.slice(0, 1),
                });
                for (let n = 2; n <= 6; n++)
                  r.appendFrom(
                    {
                      ...e,
                      points: e.points.slice(0, n * 2),
                      pressures: e.pressures.slice(0, n),
                    },
                    true
                  );
                r.end(e);
                canonical(expected, e, scale, flipX);
                composed.getContext("2d").drawImage(base, 0, 0);
                composed.getContext("2d").drawImage(settled, 0, 0);
                const first = diff(composed, expected);
                const incrementalCanvas = make();
                incrementalCanvas.getContext("2d").drawImage(base, 0, 0);
                resetStudioOilRibbonIncrementalPaintForTests();
                canonical(
                  incrementalCanvas,
                  e,
                  scale,
                  flipX,
                  paintStudioOilRibbonCarrierIncremental
                );
                const incremental = diff(incrementalCanvas, expected);
                const firstPigment = [
                  ...composed
                    .getContext("2d")
                    .getImageData(
                      Math.round((flipX ? 800 - 570 : 200) * scale),
                      Math.round((flipX ? 132 : 90) * scale),
                      1,
                      1
                    ).data,
                ];
                r.hideSettledPixels([e.id]);
                r.showSettledPixels([e.id]);
                r.showSettledPixels([e.id]);
                composed.getContext("2d").clearRect(0, 0, 800, 240);
                composed.getContext("2d").drawImage(base, 0, 0);
                composed.getContext("2d").drawImage(settled, 0, 0);
                const redo = diff(composed, expected);
                const second = {
                  ...e,
                  id: `${e.id}-2`,
                  stroke: "#dc3148",
                  points: [80, 100, 200, 110, 320, 105, 470, 115],
                  pressures: [0.6, 0.8, 0.7, 0.5],
                };
                r.begin(second);
                r.end(second);
                canonical(expected, second, scale, flipX);
                composed.getContext("2d").clearRect(0, 0, 800, 240);
                composed.getContext("2d").drawImage(base, 0, 0);
                composed.getContext("2d").drawImage(settled, 0, 0);
                results.push({
                  brush,
                  opacity,
                  underlay,
                  scale,
                  flipX,
                  sampleSpacing: sampleSpacing ?? null,
                  firstPigment,
                  incremental,
                  first,
                  redo,
                  second: diff(composed, expected),
                  mixedPixel: [
                    ...expected.getContext("2d").getImageData(200, 100, 1, 1)
                      .data,
                  ],
                });
              }
    const { captureStudioLiveOilUnderlay } = await import(
      `${root}/canvas/use-studio-live-oil-underlay.ts`
    );
    const { STUDIO_KONVA_DOCUMENT_SHADOW_NAME } = await import(
      `${root}/studio-single-object-drag-layer.ts`
    );
    const { Stage } = await import("/node_modules/konva/lib/Stage.js");
    const { Layer } = await import("/node_modules/konva/lib/Layer.js");
    const { Group } = await import("/node_modules/konva/lib/Group.js");
    const { Rect } = await import("/node_modules/konva/lib/shapes/Rect.js");
    for (const layerCase of ["ordered", "hidden-top", "masked-opacity"]) {
      for (const brush of ["oil", "acrylic"]) {
        const container = document.createElement("div");
        document.body.appendChild(container);
        const stage = new Stage({ container, width: 800, height: 240 });
        const layer = new Layer();
        stage.add(layer);
        layer.add(
          new Rect({ x: 10, y: 20, width: 70, height: 180, fill: "#aacccc" })
        );
        const documentGroup = new Group({
          name: STUDIO_KONVA_DOCUMENT_SHADOW_NAME,
        });
        layer.add(documentGroup);
        documentGroup.add(
          new Rect({
            x: 30,
            y: 30,
            width: 540,
            height: 160,
            fill: "#123ebe",
            locked: true,
          })
        );
        documentGroup.add(
          new Rect({
            x: 100,
            y: 50,
            width: 420,
            height: 140,
            fill: "#e77724",
            opacity: 0.4,
            globalCompositeOperation: "multiply",
            visible: layerCase !== "hidden-top",
          })
        );
        if (layerCase === "masked-opacity") {
          const masked = new Group({ opacity: 0.5 });
          masked.add(
            new Rect({ x: 40, y: 20, width: 500, height: 170, fill: "#3baa55" })
          );
          masked.add(
            new Rect({
              x: 180,
              y: 30,
              width: 170,
              height: 180,
              fill: "#fff",
              globalCompositeOperation: "destination-in",
            })
          );
          masked.cache({ x: 0, y: 0, width: 800, height: 240 });
          documentGroup.add(masked);
        }
        layer.draw();
        const base = make(),
          expected = make(),
          composed = make(),
          active = make(),
          settled = make();
        base.getContext("2d").drawImage(layer.getCanvas()._canvas, 0, 0);
        expected.getContext("2d").drawImage(base, 0, 0);
        // 정본 뒤 장식은 이미 화면에 있어도 안료로 캡처하면 안 된다.
        layer.add(
          new Rect({ x: 150, y: 70, width: 100, height: 50, fill: "#ff00ff" })
        );
        layer.draw();
        const surface = {
          left: 0,
          top: 0,
          width: 800,
          height: 240,
          documentScale: 1,
          documentWidth: 800,
          flipX: false,
        };
        const captured = captureStudioLiveOilUnderlay(
          layer,
          false,
          0,
          0,
          surface
        );
        if (!captured) throw new Error("정본 레이어 바닥 캡처 실패");
        const capture = diff(base, captured.canvas);
        const renderer = new Renderer({ now: () => 100000 });
        renderer.attach({ activeCanvas: active, settledCanvas: settled });
        renderer.setSurface(surface);
        renderer.oilUnderlay.setProvider((current) =>
          captureStudioLiveOilUnderlay(layer, false, 0, 0, current)
        );
        const element = {
          id: `layers-${brush}-${layerCase}`,
          type: "draw",
          kind: "freehand",
          mode: "pen",
          brush,
          points: [40, 120, 150, 105, 270, 100, 420, 135, 590, 120],
          pressures: [0.4, 0.8, 0.7, 0.6, 0.4],
          stroke: "#e4c735",
          strokeWidth: 30,
          opacity: 0.4,
          sampleSpacing: 1,
        };
        renderer.begin(element);
        renderer.end(element);
        canonical(expected, element);
        composed.getContext("2d").drawImage(base, 0, 0);
        composed.getContext("2d").drawImage(settled, 0, 0);
        const first = diff(composed, expected);
        renderer.hideSettledPixels([element.id]);
        renderer.showSettledPixels([element.id]);
        renderer.showSettledPixels([element.id]);
        composed.getContext("2d").clearRect(0, 0, 800, 240);
        composed.getContext("2d").drawImage(base, 0, 0);
        composed.getContext("2d").drawImage(settled, 0, 0);
        results.push({
          brush,
          underlay: layerCase,
          capture,
          first,
          redo: diff(composed, expected),
          second: first,
        });
        renderer.clear();
        stage.destroy();
        container.remove();
      }
    }
    return results;
  });
  writeFileSync(reportPath, JSON.stringify(results, null, 2));
  const failures = results.filter((result) =>
    [
      "first",
      "redo",
      "second",
      ...(result.capture ? ["capture"] : []),
      ...(result.incremental ? ["incremental"] : []),
    ].some((phase) => result[phase].changed > 0)
  );
  const pigmentFailures = results
    .filter((result) => result.underlay === "blue")
    .filter((result) => {
      const clear = results.find(
        (candidate) =>
          candidate.underlay === "clear" &&
          candidate.brush === result.brush &&
          candidate.opacity === result.opacity &&
          candidate.scale === result.scale &&
          candidate.flipX === result.flipX &&
          candidate.sampleSpacing === result.sampleSpacing
      );
      return (
        !clear ||
        result.firstPigment
          .slice(0, 3)
          .reduce(
            (sum, value, i) => sum + Math.abs(value - clear.firstPigment[i]),
            0
          ) < 20
      );
    });
  console.log(
    JSON.stringify({
      cases: results.length,
      failures: failures.length,
      pigmentFailures: pigmentFailures.length,
      reportPath,
    })
  );
  if (failures.length || pigmentFailures.length)
    throw new Error(
      "유화 retained/정본 픽셀 패리티 실패: " + failures.length + "조건"
    );
} finally {
  await browser.close();
  await server.close();
}
