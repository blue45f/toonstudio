import { verifyStudioBg3dSixPassBundleSceneBytes, type StudioBg3dSixPassContentHash } from "@toonstudio/contracts/studio-bg3d-six-pass-bundle";
import { parseStudioBg3dSceneDocument } from "../../bg3d/studio-bg3d-scene-document";
import { parseStudioProjectFile, type StudioProjectFile } from "../../studio-project-file";
import { collectStudioBg3dSixPassProjectBundles } from "./studio-bg3d-six-pass-project-contract";

/** ZIP 안의 scene.json은 별도 CAS 항목이다. 보존한 모든 모델·채색을 project.json의 검증 가능한 포인터로 노출한다. */
export async function projectWithStudioSixPassVrmArchiveHistory(project: StudioProjectFile,
  read: (hash: StudioBg3dSixPassContentHash) => Promise<Uint8Array | null>) {
  const states = await collectStudioBg3dSixPassProjectBundles(project);
  const pagesList = [...project.pagesList];
  for (let index = 0; index < pagesList.length; index++) {
    const page = pagesList[index], { bg3dArchiveVrmHistory: previous, ...plainPage } = page;
    if (previous !== undefined) pagesList[index] = plainPage;
  }
  for (const { pageIndex, state } of states) {
    const history = [];
    const seen = new Set<string>();
    for (const bundle of state.bundles) for (const manifest of bundle.revisions) {
      const hash = manifest.scene.contentHash;
      if (seen.has(hash)) continue;
      seen.add(hash);
      const bytes = await read(hash);
      if (!bytes) throw new Error("보존한 6패스 장면을 찾을 수 없어 VRM 원본을 확인하지 못했습니다.");
      verifyStudioBg3dSixPassBundleSceneBytes(manifest, bytes);
      const scene = parseStudioBg3dSceneDocument(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      if (!scene) throw new Error("보존한 6패스의 장면 본문을 읽을 수 없습니다.");
      const cast = scene.pinnedVersionedCut?.source.linkedVrm;
      // 동봉 모델만 쓰고 채색 파일이 없는 컷은 외부 바이트를 참조하지 않는다.
      const characters = cast?.characters.filter(({ vrmScene }) => vrmScene.model.source === "attachment" || vrmScene.surfacePaint.textures.length)
        .map(({ elementId, vrmScene }) => ({ elementId, vrmScene }));
      if (characters?.length) history.push({ sceneHash: hash, characters });
    }
    if (history.length) pagesList[pageIndex] = { ...pagesList[pageIndex], bg3dArchiveVrmHistory: history };
  }
  return { ...project, pagesList };
}

/** 동의 대화상자 뒤 이력·장면 해시가 바뀌면 이전 모델 목록을 재사용하지 않는다. */
export function projectWithCurrentStudioSixPassVrmArchiveHistory(current: StudioProjectFile, prepared: StudioProjectFile) {
  return { ...current, pagesList: current.pagesList.map(page => {
    const snapshot = prepared.pagesList.find(candidate => candidate.id === page.id);
    if (JSON.stringify(page.bg3dLtBundles) !== JSON.stringify(snapshot?.bg3dLtBundles))
      throw new Error("6패스 이력이 바뀌었습니다. 최신 원고에서 아카이브를 다시 만들어 주세요.");
    return snapshot?.bg3dArchiveVrmHistory ? { ...page, bg3dArchiveVrmHistory: snapshot.bg3dArchiveVrmHistory } : page;
  }) };
}

export async function prepareStudioSixPassVrmArchiveSnapshot(snapshot: () => unknown) {
  const sourceProject = await projectWithStudioSixPassVrmArchiveHistory(parseStudioProjectFile(snapshot()), async hash => {
    const { acquireStudioBg3dSixPassBundleProductAuthority } = await import("./studio-bg3d-six-pass-bundle-product-authority");
    return (await acquireStudioBg3dSixPassBundleProductAuthority()).get(hash, { verify: true });
  });
  return { sourceProject, currentVrmProject: () => projectWithCurrentStudioSixPassVrmArchiveHistory(parseStudioProjectFile(snapshot()), sourceProject) };
}
