import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import { listAssets } from "../../src/domains/creator/studio-asset-library";
import {
  createStudioBundleImageRecord,
  loadStudioBundleCatalog,
} from "../../src/domains/creator/studio-bundle-asset-delivery";
import { StudioBundleAssetLibraryPanel } from "../../src/domains/creator/StudioBundleAssetLibraryPanel";

import type { StudioAsset } from "../../src/domains/creator/studio-asset-library";

import "../../src/app/styles/globals.css";

interface IntegrityState {
  readonly phase: "idle" | "running" | "completed" | "cancelled" | "failed";
  readonly total: number;
  readonly checked: number;
  readonly successes: number;
  readonly failures: readonly { readonly id: string; readonly message: string }[];
}

interface DrawnAsset {
  readonly asset: StudioAsset;
  readonly visiblePixels: number;
  readonly transparentPixels: number;
}

const INITIAL_INTEGRITY: IntegrityState = { phase: "idle", total: 0, checked: 0, successes: 0, failures: [] };
const errorMessage = (error: unknown): string => error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";

function BundleRendersRuntimeHarness() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRequest = useRef(0);
  const integrityController = useRef<AbortController | null>(null);
  const [drawn, setDrawn] = useState<DrawnAsset | null>(null);
  const [drawingStatus, setDrawingStatus] = useState("소재 카드의 ‘캔버스에 삽입’을 누르면 검증된 이미지를 아래 실제 canvas에 그립니다.");
  const [drawingError, setDrawingError] = useState<string | null>(null);
  const [integrity, setIntegrity] = useState<IntegrityState>(INITIAL_INTEGRITY);
  const [persistence, setPersistence] = useState({ phase: "idle", message: "개인 라이브러리에 저장한 뒤 새로고침 후 영속성을 확인합니다." });

  function saved(asset: StudioAsset): void {
    localStorage.setItem("bundle-runtime-expected-asset", JSON.stringify({ id: asset.id, contentHash: asset.contentHash, bundleSourceCredit: asset.bundleSourceCredit }));
    setPersistence({ phase: "saved", message: `저장됨: ${asset.id}` });
  }
  async function verifyPersistence(): Promise<void> {
    setPersistence({ phase: "checking", message: "실제 SQLite·OPFS에서 개인 소재를 다시 읽는 중…" });
    try {
      const raw = localStorage.getItem("bundle-runtime-expected-asset");
      if (!raw) throw new Error("저장한 소재의 검증 기대값이 없습니다.");
      const expected: { id?: unknown; contentHash?: unknown; bundleSourceCredit?: unknown } = JSON.parse(raw);
      const assets = await listAssets();
      const asset = assets.find((entry) => entry.id === expected.id);
      if (!asset || !asset.bundleSourceCredit || asset.contentHash !== expected.contentHash
        || JSON.stringify(asset.bundleSourceCredit) !== JSON.stringify(expected.bundleSourceCredit)) throw new Error("저장한 소재의 해시·출처가 재조회 결과와 다릅니다.");
      const bytes = await (await fetch(asset.dataUrl)).arrayBuffer();
      const hash = `sha256:${Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
      if (hash !== asset.contentHash) throw new Error("OPFS에서 복원한 실제 이미지 바이트의 해시가 다릅니다.");
      setPersistence({ phase: "verified", message: JSON.stringify({ id: asset.id, contentHash: hash, bundleSourceCredit: asset.bundleSourceCredit }) });
    } catch (error: unknown) {
      setPersistence({ phase: "failed", message: errorMessage(error) });
    }
  }

  useEffect(() => () => {
    drawingRequest.current += 1;
    integrityController.current?.abort();
  }, []);

  const onUseAsset = useCallback((asset: StudioAsset): boolean => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !context) return false;
    const request = ++drawingRequest.current;
    context.clearRect(0, 0, canvas.width, canvas.height);
    setDrawn(null);
    setDrawingError(null);
    setDrawingStatus(`${asset.name}: 검증된 data URL을 디코딩하고 canvas에 그리는 중…`);
    const image = new Image();
    image.src = asset.dataUrl;
    void image.decode().then(() => {
      if (drawingRequest.current !== request) return;
      const canvas = canvasRef.current;
      if (!canvas) throw new Error("삽입 대상 canvas가 없습니다.");
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Canvas 2D 컨텍스트를 만들 수 없습니다.");
      if (image.naturalWidth !== asset.width || image.naturalHeight !== asset.height) throw new Error("삽입 이미지의 실제 크기가 StudioAsset과 다릅니다.");
      canvas.width = asset.width;
      canvas.height = asset.height;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let visiblePixels = 0;
      let transparentPixels = 0;
      for (let offset = 3; offset < pixels.length; offset += 4) {
        if (pixels[offset] === 0) transparentPixels += 1;
        else visiblePixels += 1;
      }
      if (visiblePixels === 0) throw new Error("Canvas에 보이는 픽셀이 없습니다.");
      setDrawn({ asset, visiblePixels, transparentPixels });
      setDrawingStatus(`${asset.name}: 실제 canvas drawImage 완료`);
    }).catch((error: unknown) => {
      if (drawingRequest.current !== request) return;
      setDrawingError(errorMessage(error));
      setDrawingStatus("Canvas 그리기에 실패했습니다. 다른 소재를 선택하거나 다시 삽입해 주세요.");
    });
    return true;
  }, []);

  async function verifyAllRenders(): Promise<void> {
    integrityController.current?.abort();
    const controller = new AbortController();
    integrityController.current = controller;
    setIntegrity({ ...INITIAL_INTEGRITY, phase: "running" });
    let result: IntegrityState = { ...INITIAL_INTEGRITY, phase: "running" };
    try {
      const catalog = await loadStudioBundleCatalog(controller.signal);
      if (catalog.length === 0) throw new Error("검증할 렌더 이미지가 없습니다. 매니페스트의 권리·완성 상태를 확인해 주세요.");
      result = { ...result, total: catalog.length };
      setIntegrity(result);
      for (const asset of catalog) {
        controller.signal.throwIfAborted();
        try {
          await createStudioBundleImageRecord(asset, controller.signal);
          result = { ...result, checked: result.checked + 1, successes: result.successes + 1 };
        } catch (error: unknown) {
          controller.signal.throwIfAborted();
          result = { ...result, checked: result.checked + 1, failures: [...result.failures, { id: asset.id, message: errorMessage(error) }] };
        }
        if (integrityController.current !== controller) return;
        setIntegrity(result);
      }
      setIntegrity({ ...result, phase: "completed" });
    } catch (error: unknown) {
      if (integrityController.current !== controller) return;
      setIntegrity(controller.signal.aborted ? { ...result, phase: "cancelled" }
        : { ...result, phase: "failed", failures: [...result.failures, { id: "catalog", message: errorMessage(error) }] });
    } finally {
      if (integrityController.current === controller) integrityController.current = null;
    }
  }

  const phaseLabel = { idle: "검사 전", running: "검사 중", completed: "검사 완료", cancelled: "검사 중단", failed: "목록 검사 실패" }[integrity.phase];

  return <main className="bundle-runtime-harness">
    <header>
      <h1>구매 번들 렌더 실물 검증</h1>
      <p>실제 소재 패널과 전달 검증기를 사용하는 로컬 검수 화면입니다. 아래 검사는 이미지 로딩·무결성·canvas 그리기만 확인합니다.</p>
    </header>
    <section className="bundle-runtime-section" aria-labelledby="integrity-heading">
      <h2 id="integrity-heading">전체 이미지 무결성</h2>
      <div className="bundle-runtime-controls">
        <button type="button" disabled={integrity.phase === "running"} onClick={() => { void verifyAllRenders(); }}>전체 렌더 무결성 검사</button>
        <button type="button" disabled={integrity.phase !== "running"} onClick={() => integrityController.current?.abort()}>검사 중단</button>
      </div>
      <p role="status" aria-live="polite" data-bundle-integrity-phase={integrity.phase} data-bundle-integrity-success={integrity.successes} data-bundle-integrity-failures={integrity.failures.length}>
        {phaseLabel} · {integrity.checked}/{integrity.total}개 확인 · 성공 {integrity.successes}개 · 실패 {integrity.failures.length}개
      </p>
      <progress aria-label="전체 렌더 검사 진행률" max={Math.max(1, integrity.total)} value={integrity.checked} />
      <p>loadStudioBundleCatalog → 각 슬롯의 createStudioBundleImageRecord를 순서대로 실행해 SHA256·바이트·실제 디코딩 크기를 확인합니다.</p>
      {integrity.failures.length > 0 && <ul role="alert">{integrity.failures.map((failure) => <li key={failure.id}>{failure.id}: {failure.message}</li>)}</ul>}
    </section>
    <div className="bundle-runtime-grid">
      <section className="bundle-runtime-section" aria-labelledby="library-heading">
        <h2 id="library-heading">실제 드로잉 소재 패널</h2>
        <StudioBundleAssetLibraryPanel onUseAsset={onUseAsset} onSavedAsset={saved} />
        <button type="button" disabled={persistence.phase === "checking"} onClick={() => { void verifyPersistence(); }}>저장 영속성 확인</button>
        <p role="status" data-bundle-persisted-phase={persistence.phase} style={{ overflowWrap: "anywhere" }}>{persistence.message}</p>
      </section>
      <section className="bundle-runtime-section" aria-labelledby="insertion-heading">
        <h2 id="insertion-heading">검증된 이미지의 실제 canvas 삽입</h2>
        <p role="status" aria-live="polite" data-bundle-canvas-status={drawn ? "drawn" : "empty"}>{drawingStatus}</p>
        {drawingError && <p role="alert">{drawingError}</p>}
        <canvas ref={canvasRef} width={1536} height={1536} aria-label="선택한 번들 렌더 이미지의 실제 삽입 결과" />
        {drawn && <dl data-bundle-inserted-id={drawn.asset.id}>
          <dt>소재</dt><dd>{drawn.asset.name}</dd>
          <dt>ID</dt><dd>{drawn.asset.id}</dd>
          <dt>실제 크기</dt><dd>{drawn.asset.width} × {drawn.asset.height}px</dd>
          <dt>보이는 픽셀</dt><dd>{drawn.visiblePixels.toLocaleString("ko-KR")}</dd>
          <dt>투명 픽셀</dt><dd>{drawn.transparentPixels.toLocaleString("ko-KR")}</dd>
          <dt>콘텐츠 해시</dt><dd>{drawn.asset.contentHash ?? "없음"}</dd>
          <dt>라이선스</dt><dd>{drawn.asset.rights?.licenseLabel ?? "권리 메타데이터 없음"}</dd>
          <dt>권리 확인</dt><dd>{drawn.asset.rights?.rightsConfirmed === true ? "확인됨" : "확인되지 않음"}</dd>
          <dt>출처</dt><dd>{drawn.asset.rights?.attributionText ?? "없음"}</dd>
        </dl>}
      </section>
    </div>
  </main>;
}

const root = document.getElementById("bundle-renders-runtime-root");
if (!root) throw new Error("번들 렌더 검수 화면의 마운트 지점이 없습니다.");
createRoot(root).render(<BundleRendersRuntimeHarness />);
