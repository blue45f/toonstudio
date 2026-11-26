// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { createDefaultStudioVrmSceneDocument } from "../contracts/studio-vrm-scene-document";
import { CharacterAssetLibraryControls, type CharacterAssetLibraryActions } from "./CharacterAssetLibraryControls";
import { StudioCharacterShaper } from "./StudioCharacterShaper";
import type { StudioVrmPoserProps } from "../vrm/StudioVrmPoserTypes";

const fixture = vi.hoisted(() => {
  const modelId = "test-model";
  const assets = ["A", "B"].map((name, index) => ({
    name, modelId, documentId: `character:00000000-0000-4000-8000-00000000000${index + 1}`,
  }));
  const saveNow = vi.fn<() => Promise<boolean>>(() => Promise.resolve(true));
  const authorities = new Map(assets.map((asset) => [asset.documentId, {
    hydrated: true, saveNow, authority: {
      getSnapshot: () => ({ document: { documentId: asset.documentId, model: { assetId: modelId } }, previewDocument: null }),
    },
  }] as const));
  const host = { activeModelId: modelId, libraryEntries: [{ id: modelId, name: "기본 모델", source: "sample" }] };
  return { modelId, assets, saveNow, authorities, host, capture: vi.fn<(props: StudioVrmPoserProps) => void>() };
});

vi.mock("../vrm/useStudioVrmPoserController", () => ({
  useStudioVrmPoserController: (props: StudioVrmPoserProps) => { fixture.capture(props); return fixture.host; },
}));
vi.mock("./useCharacterShaperBinding", () => ({ useCharacterShaperBinding: () => ({}) }));
vi.mock("../character-platform/ui/use-character-platform-workbench", () => ({
  useCharacterPlatformWorkbench: (_host: unknown, _binding: unknown, options: { documentId: string }) =>
    ({ authoring: fixture.authorities.get(options.documentId), binding: {} }),
}));
vi.mock("../character-platform/ui/use-character-authoring-inputs", () => ({ useCharacterAuthoringInputs: (h: unknown) => h }));
vi.mock("../character-platform/ui/CharacterPlatformWorkbench", () => ({ CharacterPlatformWorkbench: () => null }));
vi.mock("../character-platform/thumbnail/character-runtime-thumbnail-store", () => ({ CharacterRuntimeThumbnailRecorder: () => null }));
vi.mock("../character-platform/document/character-document-v3-repository", () => ({
  getCharacterDocumentV3Repository: () => ({
    load: async (id: string) => fixture.authorities.get(id)?.authority.getSnapshot().document ?? null,
  }),
}));
vi.mock("../studio-local-database-runtime", () => ({
  acquireStudioLocalDatabase: async () => ({ asAsyncKeyValueStore: () => ({
    get: async (key: string) => key === "characters" ? JSON.stringify(fixture.assets) : null,
  }) }),
}));
vi.mock("./StudioCharacterShaperDialog", () => ({
  StudioCharacterShaperDialog: ({ assets }: { assets: CharacterAssetLibraryActions }) =>
    <CharacterAssetLibraryControls assets={assets} disabled={false} query="" />,
}));

afterEach(cleanup);

it("같은 모델의 A 저장·B 선택 중에 도착하는 캡처를 거절하고 B의 새 캡처만 배치한다", async () => {
  const [first, second] = fixture.assets;
  if (!first || !second) throw new Error("캐릭터 두 개가 필요합니다.");
  const scene = {
    ...createDefaultStudioVrmSceneDocument(),
    model: { source: "bundled" as const, id: fixture.modelId, name: "기본 모델" },
    characterDocumentId: first.documentId,
  };
  const pending = Promise.withResolvers<boolean>();
  const place = vi.fn<StudioVrmPoserProps["onInsert"]>(() => true);
  const cut = (pngDataUrl: string) => ({
    pngDataUrl, scene, width: 32, height: 32, displayWidth: 32, displayHeight: 32,
  });
  render(<StudioCharacterShaper open initialScene={scene} onInsert={place} onClose={() => undefined} />);
  const selectB = await screen.findByRole("button", { name: second.name });
  const captureA = fixture.capture.mock.lastCall?.[0].onInsert;
  if (!captureA) throw new Error("A 캡처 콜백 누락");
  fixture.saveNow.mockReturnValueOnce(pending.promise);
  fireEvent.click(selectB);
  expect(await captureA(cut("data:image/png;base64,QQ=="))).toBe(false);
  await act(async () => { pending.resolve(true); });
  await waitFor(() => expect(selectB.getAttribute("aria-pressed")).toBe("true"));
  expect(await captureA(cut("data:image/png;base64,QQ=="))).toBe(false);
  expect(place).not.toHaveBeenCalled();

  const captureB = fixture.capture.mock.lastCall?.[0].onInsert;
  if (!captureB) throw new Error("B 캡처 콜백 누락");
  const result = cut("data:image/png;base64,Qg==");
  expect(await captureB(result)).toBe(true);
  expect(place).toHaveBeenCalledTimes(1);
  expect(place).toHaveBeenCalledWith({ ...result, scene: { ...scene, characterDocumentId: second.documentId } });
});
