/** 진단 식별자나 JSON 경로 대신 사용자가 이해할 수 있는 보존·손실 내용을 표시한다. */
import type { StudioNativeImportIssue } from "./studio-hybrid-dcc-native-import-contracts";

const ISSUE_COPY: Readonly<Record<string, readonly [string, string]>> = {
  INVALID_TOON_MATERIAL: ["GLB의 툰 재질 설정과 실제 재질 데이터가 일치하지 않아 가져오지 않았습니다. 원본 작업파일을 확인하세요.", "Import stopped because the GLB toon settings do not match its material data. Check the source workfile."],
  UV_PRECISION_LOSS: ["원본 UV가 웹 좌표 정밀도로 변환될 때 새로 접히거나 방향을 잃어 가져오지 않았습니다.", "Import stopped because converting source UVs to web coordinate precision would introduce a collapse or orientation change."],
  "obj-uv-precision": ["OBJ의 원본 UV나 분리 경계를 웹 좌표 정밀도로 보존할 수 없어 가져오지 않았습니다.", "Import stopped because source OBJ UVs or seam boundaries cannot be preserved at web coordinate precision."],
  ACCESSOR_BUDGET: ["이 모델의 정점 속성 검사량이 한 번에 처리할 수 있는 범위를 넘었습니다.", "The model exceeds the vertex-attribute validation work allowed for one import."],
  PRIMITIVE_SCAN_BUDGET: ["반복된 오브젝트를 포함한 면 검사량이 한 번에 처리할 수 있는 범위를 넘었습니다.", "The model exceeds the face-validation work allowed for one import, including repeated objects."],
  NORMALS_REGENERATED: ["원본의 사용자 지정 법선은 가져오지 않았습니다. 화면의 법선은 편집 메시에서 다시 계산합니다.", "Custom source normals were not imported. Display normals are regenerated from the editable mesh."],
  ATTRIBUTE_DROPPED: ["일부 추가 정점 속성은 보존되지 않았습니다. 정점·면과 지원되는 첫 UV 좌표만 편집 데이터로 가져옵니다.", "Some additional vertex attributes were not preserved. Geometry and the supported first UV set become editable data."],
  MATERIALS_NOT_IMPORTED: ["재질 슬롯의 구분은 보존하지만 원본 재질과 셰이더는 가져오지 않았습니다.", "Material slot assignments are preserved, but source materials and shaders were not imported."],
  IMAGES_NOT_IMPORTED: ["원본 이미지 텍스처는 가져오지 않았습니다. UV 좌표 보존과 이미지 재질 보존은 별개입니다.", "Source image textures were not imported. Preserved UV coordinates do not include image materials."],
  RIG_NOT_IMPORTED: ["리그·본·스키닝 데이터는 편집 자산으로 가져오지 않았습니다.", "Rig, bone and skinning data were not imported as editable assets."],
  ANIMATION_NOT_IMPORTED: ["원본 애니메이션 클립과 키프레임은 가져오지 않았습니다.", "Source animation clips and keyframes were not imported."],
  MORPH_TARGETS_NOT_IMPORTED: ["원본 모프 타깃과 표정 변형은 가져오지 않았습니다.", "Source morph targets and expression deformations were not imported."],
  SHEAR_BAKED: ["기울임 변환을 정점 좌표에 확정했습니다. 원본의 변환 계층과 조절 값은 분리해 편집할 수 없습니다.", "Shear was baked into vertex coordinates. The original transform hierarchy and controls cannot be edited separately."],
  TRANSFORM_BAKED: ["일부 장면 변환을 정점 좌표에 확정해 배치를 보존했습니다.", "Some scene transforms were baked into vertex coordinates to preserve placement."],
  NODE_HIERARCHY_FLATTENED: ["부모·자식 노드 계층을 독립 편집 자산으로 펼쳤습니다. 각 자산의 월드 위치·회전·크기는 보존하지만 원본 계층은 편집 데이터에 포함하지 않습니다.", "Parent-child nodes were flattened into independent editable assets. Each asset keeps its world position, rotation and scale, but the source hierarchy is not editable data."],
  PRIMITIVES_SPLIT: ["한 노드의 여러 primitive를 각각 독립된 편집 자산으로 나눴습니다. 형상·UV·배치는 보존하지만 원본의 단일 오브젝트 구조는 유지하지 않습니다.", "Multiple primitives in one node were split into independent editable assets. Geometry, UVs and placement are preserved, but the original single-object structure is not retained."],
  INSTANCES_MADE_UNIQUE: ["같은 메시를 공유하던 인스턴스를 독립 편집 복사본으로 만들었습니다. 각 복사본의 배치는 보존하며 한 복사본을 편집해도 다른 복사본에 함께 반영되지 않습니다.", "Shared-mesh instances became independent editable copies. Their placement is preserved; editing one copy does not update the others."],
  OPTIONAL_EXTENSION_DROPPED: ["이 파일의 일부 선택 확장 기능은 지원하지 않아 가져오지 않았습니다.", "Some optional file extensions are unsupported and were not imported."],
  "obj-external-material": ["외부 MTL·이미지는 읽지 않았습니다. 재질 이름에 따른 면 슬롯 구분만 보존합니다.", "External MTL files and images were not loaded. Only face slots assigned by material name are preserved."],
  "obj-custom-normals": ["OBJ의 사용자 지정 법선은 보존하지 않고 메시에서 다시 계산합니다.", "OBJ custom normals are regenerated from the mesh rather than preserved."],
  "obj-smoothing-groups": ["여러 스무딩 그룹 사이의 구분은 보존되지 않습니다. 부드러운 면·단단한 면 설정만 가져옵니다.", "Boundaries between multiple smoothing groups are not preserved. Only smooth and flat face settings are imported."],
  "obj-groups-split": ["OBJ의 오브젝트·그룹을 독립된 편집 자산으로 분리했습니다.", "OBJ objects and groups were split into independent editable assets."],
  "obj-mixed-uv-parts": ["UV가 있는 면과 없는 면을 독립된 편집 자산으로 분리해 보존했습니다.", "Faces with and without UV coordinates were preserved as separate editable assets."],
  "obj-homogeneous-vertices": ["동차 좌표의 w를 적용한 정점 위치를 가져왔습니다. 원본 w는 별도 속성으로 보존하지 않습니다.", "Vertex positions include the homogeneous w coordinate. The original w is not preserved as a separate attribute."],
  "obj-triangulated-polygon": ["직접 표시할 수 없는 다각형을 원본 UV 코너를 유지하는 삼각형으로 나눴습니다.", "Polygons that cannot be displayed directly were triangulated while preserving their source UV corners."],
  "obj-nonpolygon-geometry": ["OBJ의 면 데이터만 가져왔습니다. 선·점 요소는 편집 자산에 포함하지 않았습니다.", "Only OBJ polygon faces were imported. Line and point elements were not included as editable assets."],
  "obj-texture-coordinate-w": ["OBJ UV의 세 번째 좌표 성분은 보존하지 않습니다. 첫 두 좌표만 가져옵니다.", "The third OBJ texture-coordinate component is not preserved. Only the first two coordinates are imported."],
  "metadata-only": ["파일의 분석 정보만 읽었습니다. 편집 가능한 메시를 등록하지 않았습니다.", "Only analysis metadata was read. No editable mesh was registered."],
  "report-only": ["이 형식은 편집 메시로 등록할 수 없습니다. 지원하는 모델 형식으로 변환해 가져오세요.", "This format cannot be registered as an editable mesh. Convert it to a supported model format before importing."],
};
export function studioNativeImportIssueText(bt: (ko: string, en: string) => string, issue: StudioNativeImportIssue): string {
  const pair = ISSUE_COPY[issue.code];
  return pair ? bt(pair[0], pair[1]) : bt(issue.detail, issue.detail);
}

/** 원본 진단은 그대로 두고 같은 심각도·표시 문장만 한 항목으로 모은다. */
export function groupStudioNativeImportIssues(bt: (ko: string, en: string) => string, issues: readonly StudioNativeImportIssue[]) {
  const groups = new Map<string, { readonly severity: StudioNativeImportIssue["severity"]; readonly text: string; count: number }>();
  for (const issue of issues) {
    const text = studioNativeImportIssueText(bt, issue); const key = JSON.stringify([issue.severity, text]);
    const group = groups.get(key);
    if (group) group.count += 1;
    else groups.set(key, { severity: issue.severity, text, count: 1 });
  }
  return [...groups.values()];
}
