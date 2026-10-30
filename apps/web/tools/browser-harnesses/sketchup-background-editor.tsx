import { useState } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  parseStudioBg3dSceneDocument,
  serializeStudioBg3dSceneDocument,
  type StudioBg3dSceneDocument,
} from "../../src/domains/creator/bg3d/studio-bg3d-scene-document";
import {
  StudioBackground3D,
  type StudioBackground3DInsertResult,
} from "../../src/domains/creator/bg3d/StudioBackground3D";
import "../../src/app/styles/globals.css";

const STORAGE_KEY = "toonstudio-sketchup-background-editor-proof-v1";
const BUTTON = "min-h-11 rounded-lg border border-line bg-card px-4 text-sm font-semibold text-fg disabled:opacity-40";

/** 관측값은 저장 콜백이 받은 문서만 사용한다. 편집기 내부 상태나 렌더러를 따로 만들지 않는다. */
function readNodes(scene: StudioBg3dSceneDocument) {
  return scene.nodes.map((node) => ({
    id: node.id,
    name: node.name,
    kind: node.kind,
    position: [...node.transform.position],
    rotation: [...node.transform.rotation],
    scale: [...node.transform.scale],
  })).sort((left, right) => left.id.localeCompare(right.id));
}

interface SavedReceipt {
  readonly saveCount: number;
  readonly nodeCount: number;
  readonly nodes: ReturnType<typeof readNodes>;
  readonly capture: {
    readonly width: number;
    readonly height: number;
    readonly layerCount: number;
    readonly compositePngProduced: boolean;
  };
  readonly reopenedComparison: {
    readonly nodeCountPreserved: boolean;
    readonly idsPreserved: boolean;
    readonly namesPreserved: boolean;
    readonly transformsPreserved: boolean;
  } | null;
}

function compareReopenedNodes(before: StudioBg3dSceneDocument, after: StudioBg3dSceneDocument) {
  const previous = readNodes(before);
  const next = readNodes(after);
  const nodeCountPreserved = previous.length === next.length;
  const idsPreserved = nodeCountPreserved && previous.every((node, index) => node.id === next[index]?.id);
  return {
    nodeCountPreserved,
    idsPreserved,
    namesPreserved: idsPreserved && previous.every((node, index) => node.name === next[index]?.name),
    transformsPreserved: idsPreserved && previous.every((node, index) => {
      const other = next[index];
      return other !== undefined
        && JSON.stringify([node.position, node.rotation, node.scale])
          === JSON.stringify([other.position, other.rotation, other.scale]);
    }),
  };
}

function SketchUpBackgroundEditorHarness() {
  // 첫 진입은 항상 비어 있는 실제 제품 편집기로 시작한다.
  const [open, setOpen] = useState(true);
  const [generation, setGeneration] = useState(0);
  const [initialScene, setInitialScene] = useState<StudioBg3dSceneDocument | null>(null);
  const [serialized, setSerialized] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<SavedReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);

  const saveCapturedBackground = (result: StudioBackground3DInsertResult): boolean => {
    const value = serializeStudioBg3dSceneDocument(result.bg3dScene);
    if (!value) {
      setError("실제 편집기가 반환한 장면을 직렬화하지 못했습니다.");
      return false;
    }
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "브라우저에 배경을 저장하지 못했습니다.");
      return false;
    }
    setSerialized(value);
    setReceipt((current) => ({
      saveCount: (current?.saveCount ?? 0) + 1,
      nodeCount: result.bg3dScene.nodes.length,
      nodes: readNodes(result.bg3dScene),
      capture: {
        width: result.width,
        height: result.height,
        layerCount: result.layers.length,
        compositePngProduced: result.compositePngDataUrl.startsWith("data:image/png;base64,"),
      },
      reopenedComparison: initialScene ? compareReopenedNodes(initialScene, result.bg3dScene) : null,
    }));
    setError(null);
    // 저장에 성공한 실제 캡처 뒤에만 마운트를 해제한다. 다음 진입은 새 편집기 인스턴스다.
    setOpen(false);
    return true;
  };

  const reopenSavedBackground = () => {
    let saved: string | null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "브라우저에 저장한 배경을 읽지 못했습니다.");
      return;
    }
    const parsed = saved ? parseStudioBg3dSceneDocument(saved) : null;
    if (!parsed) {
      setError("브라우저에 저장된 장면이 없거나 제품 장면 형식으로 읽을 수 없습니다.");
      return;
    }
    setInitialScene(parsed);
    setGeneration((current) => current + 1);
    setError(null);
    setOpen(true);
  };

  return (
    <main className="mx-auto max-w-4xl space-y-4 p-6 text-fg">
      <h1 className="text-xl font-bold">배경 건축 편집기 저장·복원 검증</h1>
      <p className="text-sm text-fg-2">
        정밀 편집에서 건축 요소를 배치한 뒤 컬러 배경 추가로 저장하세요.
        저장한 배경을 다시 열어 레이어·치수를 확인하고 업데이트하면 두 저장 결과의 보존 여부가 표시됩니다.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={BUTTON} disabled={open || serialized === null}
          data-testid="sketchup-editor-reopen" onClick={reopenSavedBackground}>
          저장한 배경 다시 열기
        </button>
        <button type="button" className={BUTTON} disabled={open} onClick={() => {
          setInitialScene(null);
          setGeneration((current) => current + 1);
          setError(null);
          setOpen(true);
        }}>
          빈 배경 편집기 열기
        </button>
      </div>
      {error ? <p role="alert" data-testid="sketchup-editor-error">{error}</p> : null}
      <output className="block whitespace-pre-wrap rounded-lg border border-line p-3 text-xs"
        data-testid="sketchup-editor-saved-receipt" aria-label="저장한 배경 관측값">
        {JSON.stringify(receipt ?? { saveCount: 0, nodeCount: 0, nodes: [] }, null, 2)}
      </output>
      <pre hidden data-testid="sketchup-editor-saved-scene">{serialized ?? ""}</pre>
      {open ? (
        <StudioBackground3D
          key={generation}
          open
          {...(initialScene ? { initialScene } : {})}
          operation={initialScene ? "update" : "insert"}
          sharedStageSessionScopeKey="sketchup-background-editor-proof"
          recoveryScope={null}
          validateRecoveryAccess={async () => false}
          documentCanvasSize={{ width: 800, height: 600 }}
          onClose={() => setOpen(false)}
          onInsert={saveCapturedBackground}
        />
      ) : null}
    </main>
  );
}

const root = document.getElementById("test-root");
if (!root) throw new Error("배경 건축 검증 페이지의 마운트 지점을 찾지 못했습니다.");
declare global {
  interface Window { __toonstudioSketchupEditorProofRoot?: Root; }
}
// 개발 서버의 의존성 갱신이 엔트리를 재평가해도 동일 컨테이너의 root와 portal을 중복 생성하지 않는다.
const appRoot = window.__toonstudioSketchupEditorProofRoot ?? createRoot(root);
window.__toonstudioSketchupEditorProofRoot = appRoot;
appRoot.render(<SketchUpBackgroundEditorHarness />);
if (import.meta.hot) import.meta.hot.dispose(() => {
  appRoot.unmount();
  delete window.__toonstudioSketchupEditorProofRoot;
});
