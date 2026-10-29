import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import { STUDIO_BUNDLE_BG_SCENES } from "../../src/domains/creator/catalog/studio-bundle-backgrounds";
import { createStudio2dCanvasImage } from "../../src/domains/creator/studio-2d-source-size";
import { Studio2dSceneBrowser } from "../../src/domains/creator/Studio2dSceneBrowser";

import type { Studio2dScene } from "../../src/domains/creator/studio-2d-asset-quality";

import "../../src/app/styles/globals.css";

function Harness() {
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState("all");
  const [result, setResult] = useState("");
  const [drawnId, setDrawnId] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null);
  async function insert(scene: Studio2dScene): Promise<void> {
    try {
      if (!scene.imgSrc) throw new Error("완성 배경 경로가 없습니다.");
      const image = new Image();
      image.src = scene.imgSrc;
      await image.decode();
      const element = createStudio2dCanvasImage(scene, { id: "scene-insert", src: scene.imgSrc, canvasWidth: 720, canvasHeight: 1080 });
      const target = canvas.current;
      if (!target) throw new Error("결과 canvas가 없습니다.");
      target.width = image.naturalWidth;
      target.height = image.naturalHeight;
      const context = target.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Canvas 2D를 열 수 없습니다.");
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, target.width, target.height).data;
      for (let offset = 3; offset < pixels.length; offset += 4) {
        if (pixels[offset] !== 255) throw new Error("완성 배경에 투명 픽셀이 있습니다.");
      }
      setResult(JSON.stringify({ id: scene.id, sourceWidth: target.width, sourceHeight: target.height, element }, null, 2));
      setDrawnId(scene.id);
    } catch (error: unknown) {
      setDrawnId("error");
      setResult(error instanceof Error ? error.message : "배경 삽입 오류");
    }
  }
  return <main>
    <h1>번들 완성 배경 · 실제 2D 선택기와 배치 함수</h1>
    <p>로컬 검수 화면. 선택기의 원본 확인과 실제 배치 함수, 불투명 canvas 픽셀을 확인합니다.</p>
    <Studio2dSceneBrowser groups={[{ genre: "번들 완성 배경", scenes: STUDIO_BUNDLE_BG_SCENES }]}
      query={query} onQueryChange={setQuery} genre={genre} onGenreChange={setGenre}
      loading={false} error={null} disabled={false} onPick={(scene) => { void insert(scene); }} />
    <canvas ref={canvas} width={2048} height={1152} aria-label="완성 배경 삽입 결과" />
    <pre data-background-inserted={drawnId}>{result}</pre>
  </main>;
}

const root = document.getElementById("bundle-scenes-root");
if (!root) throw new Error("완성 배경 검수 마운트 지점이 없습니다.");
createRoot(root).render(<Harness />);
