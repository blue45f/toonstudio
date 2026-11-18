import { hashStudioBg3dSixPassBundleManifest, parseStudioBg3dSixPassBundleManifest } from "@toonstudio/contracts/studio-bg3d-six-pass-bundle";
import { expect, it, vi } from "vitest";
import { createBg3dBundleProjectFixture } from "../../bg3d/studio-bg3d-bundle-project.test-fixture";
import { creatorWorkSnapshotToStudioProject, readStudioCreatorWorkProject } from "../../studio-creator-work-project";
import { createStudioVrmSceneDocument } from "../../vrm/studio-vrm-scene-document";
import { createStudioScene3dDocument } from "../studio-scene3d-document";
import { createStudioScene3dVersionedCut } from "../studio-scene3d-shot-versions";
import { restoreStudioFrozenSixPassSnapshot } from "./studio-bg3d-six-pass-work-snapshot";

function jsonb(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(jsonb);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([left],[right]) =>
    left.length - right.length || left.localeCompare(right)).map(([key,entry]) => [key,jsonb(entry)]));
  return value;
}
async function fixture() {
  const actor = {elementId:"hero", label:"배우", stageTransform:{position:[0,0,0] as const,rotationY:0}, vrmScene:createStudioVrmSceneDocument()};
  const cut = createStudioScene3dVersionedCut({id:"cut",name:"검증",scene:createStudioScene3dDocument("work","2026-11-19T00:00:00Z"),characters:{},
    linkedVrm:{version:1,documentScope:`sha256:${"a".repeat(64)}`,characters:[actor]}});
  const f = await createBg3dBundleProjectFixture(false,cut);
  const manifest = parseStudioBg3dSixPassBundleManifest({...f.manifest,version:2,contract:"toonstudio.bg3d-sixpass-bundle.v2",minimumReaderCapability:"bg3d-sixpass-bundle.v2",
    workVrmCut:{anchorId:"vrmcut-11111111-1111-8111-a111-111111111111",sceneSha256:"a".repeat(64),compositeSha256:"b".repeat(64)}});
  const hash = hashStudioBg3dSixPassBundleManifest(manifest), page = f.project.pagesList[0];
  const work = {title:"원고",doc:{pagesList:[{...page,bg3dLtBundles:{...page.bg3dLtBundles,
    bundles:[{bundleId:manifest.bundleId,activeRevisionId:manifest.renderRevisionId,revisions:[manifest]}]},
    elements:page.elements.map(e=>({...e,...(e.bg3dLtBundleReference?{bg3dLtBundleReference:{...e.bg3dLtBundleReference as object,manifestHash:hash}}:{})}))}]}};
  return {f,work, raw:jsonb(work) as typeof work,read:vi.fn(()=>f.authority.get(manifest.scene.contentHash,{verify:true}))};
}
it("DB 키 순서가 바뀐 기존 VRM 컷은 양쪽 앵커와 값이 같은 불변 scene.json으로만 다시 연다", async()=>{
  const {raw,work,read} = await fixture(); expect(()=>creatorWorkSnapshotToStudioProject(raw)).toThrow(/공유 Stage/);
  const restored = await restoreStudioFrozenSixPassSnapshot(raw,"work",undefined,read);
  expect(creatorWorkSnapshotToStudioProject(restored)).toEqual(creatorWorkSnapshotToStudioProject(work));
  expect(read).toHaveBeenCalledOnce();
  const altered=structuredClone(raw), anchor=altered.doc.pagesList[0].elements.find(e=>e.bg3dScene);
  if (!anchor?.bg3dScene) throw new Error("검증용 앵커가 없습니다.");
  Object.assign(anchor.bg3dScene,{quality:"tampered"});
  await expect(restoreStudioFrozenSixPassSnapshot(altered,"work",undefined,read)).rejects.toThrow(/내용/);
  await expect(restoreStudioFrozenSixPassSnapshot(raw,"work",undefined,async()=>{throw new Error("권한 철회");})).rejects.toThrow(/권한 철회/);
  await expect(restoreStudioFrozenSixPassSnapshot(raw,"work",undefined,async()=>null)).rejects.toThrow(/다시 받을/);
  const controller = new AbortController();
  await expect(restoreStudioFrozenSixPassSnapshot(raw,"work",controller.signal,async ()=>{
    controller.abort(); return read();
  })).rejects.toMatchObject({name:"AbortError"});
});
it("일반 v1 문서와 올바른 활성 6패스는 추가 요청 없이 원래 파서를 사용한다",async()=>{
  const {f,work} = await fixture();
  await expect(readStudioCreatorWorkProject({title:"v1",doc:{pagesList:[]}},"work")).rejects.toThrow();
  await expect(readStudioCreatorWorkProject({title:"v1",doc:{pagesList:f.project.pagesList}},"work")).resolves.toBeTruthy();
  await expect(readStudioCreatorWorkProject(work,"work")).resolves.toEqual(creatorWorkSnapshotToStudioProject(work));
});
