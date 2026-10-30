// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useMemo } from "react";
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from "three";
import { afterEach, describe, expect, it } from "vitest";

import { createCharacterDocumentV2 } from "../document/character-document-v2";
import { migrateCharacterDocumentV2ToV3 } from "../document/character-document-v3";
import { CharacterDocumentV3Repository } from "../document/character-document-v3-repository";
import { useCharacterRenderExtras } from "../runtime/use-character-render-extras";
import { useCharacterAuthoringAuthority } from "./use-character-authoring-authority";
import { CharacterOutlineControls } from "./CharacterOutlineControls";

afterEach(cleanup);

function fixture() {
  const root = new Group();
  const material = Object.assign(new MeshStandardMaterial(), { outlineWidthFactor: 0.002, outlineWidthMode: "worldCoordinates" });
  material.name = "skin";
  root.add(new Mesh(new BoxGeometry(), material));
  const h = { vrm: { scene: root }, status: "ready", texturePaintInvalidateRef: { current: () => undefined } };
  const document = migrateCharacterDocumentV2ToV3(createCharacterDocumentV2({
    documentId: "character:outline", model: { assetId: "outline", assetVersion: "1", contentSha256: null, mode: "canonical" },
    compatibility: { grade: "canonical", supported: [], partial: [], unsupported: [], sourceRevision: "test" },
    recipe: { version: 2, slots: {}, accessories: [], handPose: {} },
    colors: { skin: null, hairBase: null, hairTip: null, iris: null, top: null, bottom: null, shoes: null },
  }));
  function Harness() {
    const repository = useMemo(() => new CharacterDocumentV3Repository({ storeFactory: async () => ({ get: async () => null, set: async () => undefined, delete: async () => undefined }) }), []);
    const authoring = useCharacterAuthoringAuthority(document, "outline", { repository, autosave: false });
    const current = authoring.snapshot.previewDocument ?? authoring.snapshot.document;
    const runtime = useCharacterRenderExtras({ h, document: current, enabled: authoring.hydrated });
    return <><CharacterOutlineControls h={h} authoring={authoring} />
      <output data-testid="outline-runtime">{runtime.status}</output>
      <output data-testid="outline-history">{authoring.snapshot.historyLength}</output>
      <button onClick={authoring.undo}>테스트 Undo</button><button onClick={authoring.redo}>테스트 Redo</button>
    </>;
  }
  return { h, material, Harness };
}

describe("문서 기반 실제 외곽선 제어", () => {
  it("슬라이더가 실제 재질을 미리 바꾸고 취소·적용·undo·redo가 같은 값을 복원한다", async () => {
    const f = fixture(); render(<f.Harness />);
    const slider = screen.getByLabelText("실제 외곽선 두께") as HTMLInputElement;
    await waitFor(() => expect(slider.disabled).toBe(false));
    fireEvent.change(slider, { target: { value: "0.006" } });
    await waitFor(() => expect(f.material.outlineWidthFactor).toBe(0.006));
    expect(screen.getByTestId("outline-history").textContent).toBe("0");
    fireEvent.click(screen.getByRole("button", { name: "외곽선 취소" }));
    await waitFor(() => expect(f.material.outlineWidthFactor).toBe(0.002));
    fireEvent.change(slider, { target: { value: "0.004" } });
    await waitFor(() => expect(f.material.outlineWidthFactor).toBe(0.004));
    fireEvent.click(screen.getByRole("button", { name: "외곽선 적용" }));
    expect(screen.getByTestId("outline-history").textContent).toBe("1");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "테스트 Undo" })); });
    await waitFor(() => expect(f.material.outlineWidthFactor).toBe(0.002));
    fireEvent.click(screen.getByRole("button", { name: "테스트 Redo" }));
    await waitFor(() => expect(f.material.outlineWidthFactor).toBe(0.004));
  });

  it("화면 단위 외곽선은 미지원으로 표시하고 재질을 변경하지 않는다", async () => {
    const f = fixture();
    f.material.outlineWidthMode = "screenCoordinates";
    render(<f.Harness />);
    await waitFor(() => expect(screen.getByTestId("outline-runtime").textContent).toBe("ready"));
    expect((screen.getByLabelText("실제 외곽선 두께") as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(/월드 단위 외곽선을 안전하게 조절할 재질을 찾지 못했습니다/u)).toBeTruthy();
    expect(f.material.outlineWidthFactor).toBe(0.002);
  });
});
