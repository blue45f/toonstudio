/**
 * Studio 3D 데생 인형 — 포즈 프리셋 데이터(손으로 저작한 관절 각도 표).
 *
 * `studio-mannequin-poses.ts`의 순수 데이터 계층에서 프리셋 표만 분리했다.
 * 프리셋 각도는 전부 관절 한계 안에서 저작했고, 테스트가 클램프 불변을 검증한다.
 * 좌표 감각: 팔다리 rest 는 −Y로 늘어짐. X− = 앞으로 스윙(팔·다리), 팔꿈치 X− = 앞굽힘,
 * 무릎 X+ = 뒤굽힘, 왼쪽 Z+ = 바깥 벌림(오른쪽은 부호 반전), 몸통 X+ = 앞으로 숙임.
 */

import type { StudioMannequinPosePreset } from "./studio-mannequin-poses";

import { STUDIO_MANNEQUIN_POSE_PRESETS_A } from "./studio-mannequin-pose-presets-a";
import { STUDIO_MANNEQUIN_POSE_PRESETS_B } from "./studio-mannequin-pose-presets-b";

/**
 * 프리셋 각도는 전부 관절 한계 안에서 손으로 저작했다(테스트가 클램프 불변을 검증).
 * 좌표 감각: 팔다리 rest 는 −Y로 늘어짐. X− = 앞으로 스윙(팔·다리), 팔꿈치 X− = 앞굽힘,
 * 무릎 X+ = 뒤굽힘, 왼쪽 Z+ = 바깥 벌림(오른쪽은 부호 반전), 몸통 X+ = 앞으로 숙임.
 */
export const STUDIO_MANNEQUIN_POSE_PRESETS: readonly StudioMannequinPosePreset[] = Object.freeze([
  ...STUDIO_MANNEQUIN_POSE_PRESETS_A,
  ...STUDIO_MANNEQUIN_POSE_PRESETS_B,
]);
