// @vitest-environment jsdom
import { useContext } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDefaultStudioBg3dSceneDocument } from "../bg3d/studio-bg3d-scene-document";
import type { StudioVrmPoserProps } from "../vrm/StudioVrmPoserTypes";
import { createStudioVrmSceneDocument } from "../vrm/studio-vrm-scene-document";
import { createStudioScene3dDocument } from "./studio-scene3d-document";
import { createStudioScene3dVersionedCut } from "./studio-scene3d-shot-versions";
import type { StudioScene3dCutBg3dEditorHost } from "./studio-scene3d-cut-bg3d-host";
import { TeamVrmCutAccessError } from "./studio-team-vrm-cut-client";
import { TeamVrmCutPaintAction } from "./studio-team-vrm-cut-revision";
import { StudioTeamVrmCutRevisionEditor } from "./StudioTeamVrmCutRevisionEditor";

const {read, meta} = vi.hoisted(() => ({read:vi.fn(), meta:vi.fn()}));
vi.mock("./studio-team-vrm-cut-client", () => ({readTeamVrmCutReceipt:read, TeamVrmCutAccessError:class extends Error {}}));
vi.mock("../studio-shared-document-client", async importOriginal => ({...await importOriginal<typeof import("../studio-shared-document-client")>(), getStudioSharedDocumentMeta:meta}));
vi.mock("../vrm/StudioVrmPoser", () => ({StudioVrmPoser: ({onApplyCutPaint}: StudioVrmPoserProps) => <section role="dialog" aria-label="팀 컷 표면 채색">
  <button onClick={() => onApplyCutPaint?.({version:1,textures:[]},()=>true)}>새 컷 버전에 적용</button>
  </section>}));
const bg = createDefaultStudioBg3dSceneDocument(), documentScope = `sha256:${"c".repeat(64)}`;
const actor = createStudioVrmSceneDocument({source:"bundled", id:"sample-vrm", name:"루미"});
const pinned = createStudioScene3dVersionedCut({id:"saved-cut", name:"저장된 컷", characters:{}, legacyBg3d:bg,
  scene:createStudioScene3dDocument("team-test","2026-11-19T00:00:00Z"),linkedVrm:{version:1, documentScope,
    characters:[{elementId:"actor", label:"루미", stageTransform:{position:[0,0,0],rotationY:0}, vrmScene:actor}]}});
const scene = {...bg,pinnedVersionedCut:pinned};
const loaded = {scene, sceneSha256:"original", compositeSha256:"composite",resources:{bundled:new Map([["sample-vrm",new Blob(["model"])]]),paints:new Map(),blobs:new Map()}};
function Editor() {
  const open = useContext(TeamVrmCutPaintAction)!;
  const host = {open:true, cutWorkId:"work", cutDocumentKey:documentScope, readCurrentCanonicalSceneForShot:()=>scene} as StudioScene3dCutBg3dEditorHost;
  return <button onClick={()=>open(host,"actor")}>루미 새 버전으로 편집</button>;
}
function begin(onLostAccess=vi.fn()) {
  render(<StudioTeamVrmCutRevisionEditor scope={{workId:"work",pageId:"page",anchorId:"anchor"}} loaded={loaded} editor={<Editor/>} onLostAccess={onLostAccess}/>);
  fireEvent.click(screen.getByRole("button"));
  return onLostAccess;
}
beforeEach(()=>{read.mockResolvedValue({sceneSha256:"original"});meta.mockResolvedValue({workId:"work",access:"edit",capabilities:{edit:true}});});
afterEach(()=>{cleanup();vi.resetAllMocks();});
describe("팀 포저의 수정판 편집 진입",()=>{
  it("같은 작품의 최신 편집 권한과 불변 영수증을 확인한 뒤에만 포저를 연다",async()=>{
    begin();
    await screen.findByRole("dialog",{name:"팀 컷 표면 채색"});
    expect(meta).toHaveBeenCalledOnce();
    expect(read.mock.calls[0][0]).toEqual({workId:"work",pageId:"page",anchorId:"anchor"});
  });
  it("읽기만 가능한 팀원에게는 포저를 열지 않는다",async()=>{
    meta.mockResolvedValue({workId:"work",access:"view",capabilities:{edit:false}});
    begin();
    expect((await screen.findByRole("alert")).textContent).toContain("편집할 권한");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("채색하는 중 편집 권한이 철회되면 새 버전을 적용하기 전에 포저를 닫는다", async () => {
    begin();
    await screen.findByRole("dialog");
    meta.mockResolvedValueOnce({workId:"work",access:"view",capabilities:{edit:false}});
    fireEvent.click(screen.getByRole("button",{name:"새 컷 버전에 적용"}));
    expect((await screen.findByRole("alert")).textContent).toContain("편집할 권한");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(read).toHaveBeenCalledTimes(2);
  });
  it("원본 열람이 철회되면 상위 원고에서 파일을 해제한다",async()=>{
    read.mockRejectedValue(new TeamVrmCutAccessError("팀 권한 철회"));
    const lost = begin();
    await vi.waitFor(()=>expect(lost).toHaveBeenCalledWith("팀 권한 철회"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
