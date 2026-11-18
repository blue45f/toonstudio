import { hashStudioBg3dSixPassCanonicalJson, type StudioBg3dSixPassWorkVrmCut } from "@toonstudio/contracts/studio-bg3d-six-pass-bundle";
import type { StudioScopedWriteContext } from "@toonstudio/contracts/studio-scoped-write";
import { normalizeStudioBg3dSceneDocument, serializeStudioBg3dSceneDocument, type StudioBg3dSceneDocument } from "../../bg3d/studio-bg3d-scene-document";
import { assertStudioSixPassActorCoverage } from "../../bg3d/studio-bg3d-six-pass-cast";
import type { StudioBackground3DInsertResult } from "../../scene-3d/studio-3d-insert-contract";
import { createStudioShared3dSceneSession } from "../../studio-shared-3d-scene-bridge";
import { createStudioWorkAssetInitialImageDescriptor, readBoundedStudioWorkAssetLocalImage } from "../../studio-work-asset-admission";
import { createCanvasImageElement } from "../../studio-image-placement";
import { requestStudioVrmProjectArchiveUseContext } from "../../vrm/StudioVrmProjectArchiveAttestationHost";
import { readTeamVrmCutReceipt, writeTeamVrmCut } from "../studio-team-vrm-cut-client";
import { teamVrmCutAnchorId } from "../studio-team-vrm-cut-publish";

export function assertStudioFrozenSixPassResult(result: StudioBackground3DInsertResult) {
  const cut = result.bg3dScene.pinnedVersionedCut;
  const evidence = result.frozenVrmSixPassCapture;
  if (!cut?.source.linkedVrm || evidence?.sourceHash !== cut.sourceHash || !evidence || !result.bg3dScene.output.sixPassLt
    || result.linkedCharacterCapture || result.magicFilterMask || result.sharedStageMutation?.kind === "unlink"
    || result.materialization?.kind === "detached-editable-composite")
    throw new Error("고정 원본과 일치하는 6패스 캡처가 필요합니다. 컷 카메라에서 배우를 확인한 뒤 다시 렌더하세요.");
  const expected = createStudioShared3dSceneSession(cut.source.linkedVrm.characters.map(({ vrmScene, ...actor }) => ({ ...actor, scene: vrmScene })));
  assertStudioSixPassActorCoverage(expected.characters, evidence.actors, result.width * result.height);
}

export function studioSixPassCastMatches(left: StudioBg3dSceneDocument, right: StudioBg3dSceneDocument) {
  const a = left.pinnedVersionedCut?.source.linkedVrm, b = right.pinnedVersionedCut?.source.linkedVrm;
  return Boolean(a && b && hashStudioBg3dSixPassCanonicalJson(a) === hashStudioBg3dSixPassCanonicalJson(b));
}

/** 원고 레이어를 발행하기 전에 모델·채색의 권리와 실제 바이트를 기존 작품 컷 저장소에 봉인한다. */
export async function sealStudioSixPassVrmSource(input: {
  workId: string; pageId: string; result: StudioBackground3DInsertResult; current(): boolean;
  previous?: StudioBg3dSixPassWorkVrmCut | string; writeContext?: StudioScopedWriteContext;
}): Promise<StudioBg3dSixPassWorkVrmCut> {
  const { workId, pageId, result } = input;
  assertStudioFrozenSixPassResult(result);
  const signal = result.cutWorkSignal ?? new AbortController().signal;
  const check = () => {
    signal.throwIfAborted();
    if (!input.current()) throw new Error("원고나 편집 권한이 바뀌어 고정 컷 저장을 중단했습니다.");
  };
  check();
  const { getStudioBg3dSixPassRemoteCapabilities } = await import("./studio-bg3d-six-pass-bundle-api");
  const capability = await getStudioBg3dSixPassRemoteCapabilities(workId, 2);
  if (!capability.enabled || capability.readerCapability !== "bg3d-sixpass-bundle.v2") throw new Error("현재 작품 서버는 고정 VRM 6패스 원본 저장을 지원하지 않습니다.");
  check();
  if (input.previous) {
    const previous = input.previous;
    const anchorId = typeof previous === "string" ? previous : previous.anchorId;
    const receipt = await readTeamVrmCutReceipt({ workId, pageId, anchorId }, signal);
    check();
    if (typeof previous !== "string" && (receipt.sceneSha256 !== previous.sceneSha256 || receipt.manifest.sha256 !== previous.compositeSha256))
      throw new Error("이전 6패스 원본의 작품 영수증이 바뀌었습니다.");
    if (studioSixPassCastMatches(receipt.scene, result.bg3dScene))
      return { anchorId, sceneSha256: receipt.sceneSha256, compositeSha256: receipt.manifest.sha256 };
  }

  const { sixPassLt: _sixPass, ...output } = result.bg3dScene.output;
  const scene = normalizeStudioBg3dSceneDocument({ ...result.bg3dScene, output });
  const serialized = serializeStudioBg3dSceneDocument(scene);
  if (!serialized || !studioSixPassCastMatches(scene, result.bg3dScene)) throw new Error("고정한 배우의 원본 문서를 저장할 수 없습니다.");
  const composite = await readBoundedStudioWorkAssetLocalImage(result.compositePngDataUrl, signal);
  const placement = createCanvasImageElement({ id: "", src: result.compositePngDataUrl, canvasWidth: result.width, canvasHeight: result.height,
    sourceWidth: result.width, sourceHeight: result.height });
  const anchorId = await teamVrmCutAnchorId(workId, pageId, undefined, placement, serialized, composite);
  const descriptor = createStudioWorkAssetInitialImageDescriptor({ ...placement, id: anchorId, name: scene.pinnedVersionedCut?.name });
  const manifest = await writeTeamVrmCut({ workId, pageId, anchorId }, { scene, composite: result.compositePngDataUrl, descriptor,
    current: input.current, resources: result.cutWorkResources, writeContext: input.writeContext,
    consent: plan => requestStudioVrmProjectArchiveUseContext({ ...plan, destination: "team-cut" }) }, signal);
  check();
  const receipt = await readTeamVrmCutReceipt({ workId, pageId, anchorId }, signal);
  check();
  if (receipt.manifest.sha256 !== manifest.sha256 || !studioSixPassCastMatches(receipt.scene, scene))
    throw new Error("팀 컷의 봉인 영수증과 6패스에 렌더한 배우가 다릅니다.");
  return { anchorId, sceneSha256: receipt.sceneSha256, compositeSha256: receipt.manifest.sha256 };
}

/** 같은 작품·페이지·원본·픽셀로 재시도하면 탭이 바뀌어도 같은 원격 준비/봉인 예약을 다시 찾는다. */
export async function studioFrozenSixPassRevisionKey(result: StudioBackground3DInsertResult, scope: {
  workId: string; pageId: string; targetId?: string; parent?: string;
}) {
  const digest = async (value: string) => {
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join("");
  };
  const content = [];
  for (const layer of result.layers) {
    result.cutWorkSignal?.throwIfAborted();
    content.push([layer.role, await digest(layer.pngDataUrl)]);
  }
  const scene = serializeStudioBg3dSceneDocument(result.bg3dScene);
  if (!scene) throw new Error("6패스의 고정 장면을 직렬화할 수 없습니다.");
  return `cut6-${(await digest(JSON.stringify([scope.workId, scope.pageId, scope.targetId ?? null, scope.parent ?? null, result.width, result.height, await digest(scene), content]))).slice(0, 40)}`;
}
