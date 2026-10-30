import type { StudioBg3dPrimitiveEditWorkspace } from "./studio-bg3d-primitive-edit-workspace";
import type { StudioBg3dAuthoredModelEditWorkspace } from "./studio-bg3d-authored-model-edit-workspace";

/** 각 source의 검증 권위를 유지한 채 같은 면 편집 화면을 사용한다. */
export type StudioBg3dFaceEditWorkspace = StudioBg3dPrimitiveEditWorkspace | StudioBg3dAuthoredModelEditWorkspace;
