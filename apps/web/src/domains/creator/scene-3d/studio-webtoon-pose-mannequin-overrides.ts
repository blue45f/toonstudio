/**
 * 웹툰 포즈 프리셋 → 데생 인형 정본 포즈(마네킹 관절 규약) 데이터.
 *
 * 웹툰 포즈 라이브러리(`studio-3d-advanced-poses-library.ts`)의 관절값은 VRM 포저와 함께
 * 쓰는 "휴머노이드 오일러"라 데생 인형 규약과 어긋났다 — 팔꿈치 굽힘 부호가 반대(+X)라
 * 관절 한계에서 펴진 팔로 잘렸고(로맨스 포옹·경청·귓속말 등 11종), 손을 얼굴로 가져가는
 * 전완 Z 회전(턱 괴기·통화·머그잔)은 ±8° 한계에서 사라졌으며, 골반 높이가 없어 무릎·바닥
 * 포즈가 서 있는 높이에서 공중에 떴다.
 *
 * 그래서 VRM 이 쓰는 원본 데이터는 그대로 두고, 데생 인형 어댑터만 이 표의 정본 포즈를 쓴다.
 * 각 포즈는 같은 이름·설명을 데생 인형 규약(팔다리 X− = 앞으로 스윙, 팔꿈치 X− = 굽힘,
 * 무릎 X+ = 굽힘, 왼쪽 Z+ = 바깥 벌림)으로 직접 저작했고, 지지 방식(ground)으로 적용 시점에
 * 현재 체형 기준 접지를 다시 계산한다. 값은 전부 관절 한계 안의 정수 도(°)다.
 */

import type { StudioMannequinPoseGroundSpec } from "./studio-mannequin-pose-ground-contact";
import type { StudioMannequinJointId } from "./studio-mannequin-model";

export interface StudioWebtoonPoseMannequinOverride {
  readonly ground: StudioMannequinPoseGroundSpec;
  /** 좌우 대칭 포즈 — 미러해도 같아야 한다(품질 검사가 대칭 오차를 잰다). */
  readonly symmetric?: boolean;
  /** 데생 인형 관절 오일러(도, XYZ). 생략한 관절은 rest(0)다. */
  readonly joints: Readonly<Partial<Record<StudioMannequinJointId, readonly [number, number, number]>>>;
}

export const STUDIO_WEBTOON_POSE_MANNEQUIN_OVERRIDES: Readonly<
  Record<string, StudioWebtoonPoseMannequinOverride>
> = Object.freeze({
  "action-hero-landing": {
    ground: { support: "kneeling", contacts: ["leftKnee", "rightFoot", "leftHand", "leftFoot"], soleFeet: ["right"] },
    joints: {
      pelvis: [35, 0, 0], spine: [26, -10, -10], chest: [14, 6, -6], neck: [-28, 0, 0],
      head: [-38, 8, 0], leftShoulder: [0, 0, -20], leftUpperArm: [-47, -37, 39],
      leftLowerArm: [-63, 0, 0], leftHand: [32, -35, -15], rightUpperArm: [-166, -8, -132],
      rightLowerArm: [-35, 0, 0], leftUpperLeg: [-25, -4, 2], leftLowerLeg: [109, 0, 0],
      leftFoot: [-52, 1, -4], rightUpperLeg: [-128, 3, -12], rightLowerLeg: [100, 0, 0],
      rightFoot: [-7, 4, 2],
    },
  },
  "action-sword-slash": {
    ground: { support: "standing", contacts: ["leftFoot", "rightFoot"], soleFeet: ["left", "right"] },
    joints: {
      pelvis: [14, 24, 0], spine: [16, 10, 0], chest: [10, 8, 0], neck: [0, -10, 0],
      head: [-6, -18, 0], leftUpperArm: [36, -75, 56], leftLowerArm: [-43, 0, 0],
      rightUpperArm: [-90, 15, -34], rightLowerArm: [-39, 0, 0], leftUpperLeg: [-75, -4, -10],
      leftLowerLeg: [42, 0, 0], leftFoot: [19, 1, -5], rightUpperLeg: [24, -48, -9],
      rightLowerLeg: [27, 0, 0], rightFoot: [-33, 13, 20],
    },
  },
  "action-dynamic-jump-kick": {
    ground: { support: "airborne", clearanceHeads: 0.9 },
    joints: {
      pelvis: [-22, 30, 0], spine: [-6, 12, 0], chest: [2, 8, 0], neck: [6, -14, 0],
      head: [6, -22, 0], leftUpperArm: [-33, -8, 42], leftLowerArm: [-111, 0, 0],
      rightUpperArm: [-112, -54, -146], rightLowerArm: [-87, 0, 0], leftUpperLeg: [24, 0, 8],
      leftLowerLeg: [118, 0, 0], leftFoot: [30, 0, 0], rightUpperLeg: [-82, -4, -31],
      rightLowerLeg: [13, 0, 0], rightFoot: [24, 0, 0],
    },
  },
  "action-magic-burst": {
    ground: { support: "standing", contacts: ["leftFoot", "rightFoot"], soleFeet: ["left", "right"] },
    joints: {
      spine: [-6, 0, 0], chest: [-4, 0, 0], head: [-4, 0, 0], leftUpperArm: [-84, -8, 14],
      leftLowerArm: [-14, 0, 0], leftHand: [-46, 0, 0], rightUpperArm: [-84, 8, -14],
      rightLowerArm: [-14, 0, 0], rightHand: [-46, 0, 0], leftUpperLeg: [-8, 0, 7],
      leftLowerLeg: [10, 0, 0], leftFoot: [-2, 0, 0], rightUpperLeg: [8, 0, -7],
      rightLowerLeg: [6, 0, 0], rightFoot: [-6, 0, 0],
    },
  },
  "daily-standing-casual": {
    ground: { support: "standing", contacts: ["rightFoot", "leftFoot"], soleFeet: ["right", "left"] },
    joints: {
      pelvis: [0, 6, -6], spine: [0, -4, 5], chest: [0, -4, 4], neck: [0, 0, -4],
      head: [2, 6, -6], leftUpperArm: [6, -29, 1], leftLowerArm: [-25, 0, 0],
      rightUpperArm: [18, 30, -15], rightLowerArm: [-54, 0, 0], leftUpperLeg: [-21, 6, 9],
      leftLowerLeg: [19, 0, 0], leftFoot: [6, 8, 0], rightUpperLeg: [0, 0, 1],
    },
  },
  "daily-sitting-chair": {
    ground: { support: "seated", contacts: ["leftFoot", "rightFoot"], soleFeet: ["left", "right"] },
    joints: {
      pelvis: [8, 0, 0], spine: [16, -6, 0], chest: [8, -6, 0], neck: [4, 0, 0],
      head: [-6, 10, 8], leftUpperArm: [-42, -64, 0], rightUpperArm: [-93, 58, 38],
      rightLowerArm: [-132, 0, 0], rightHand: [-30, 0, -10], leftUpperLeg: [-86, 0, 8],
      leftLowerLeg: [86, 0, 0], leftFoot: [-2, 0, 0], rightUpperLeg: [-86, 0, -8],
      rightLowerLeg: [86, 0, 0], rightFoot: [-2, 0, 0],
    },
  },
  "daily-phone-call": {
    ground: { support: "standing" },
    joints: {
      pelvis: [0, 6, 0], spine: [2, -4, 0], chest: [0, -6, 0], neck: [0, 0, -6],
      head: [4, 12, -8], leftUpperArm: [20, 0, 8], leftLowerArm: [-24, 0, 0],
      rightUpperArm: [-122, 39, 7], rightLowerArm: [-132, 0, 0], rightHand: [-20, 0, 10],
      leftUpperLeg: [-22, 0, 2], leftLowerLeg: [8, 0, 0], leftFoot: [-14, 0, 0],
      rightUpperLeg: [18, 0, -2], rightLowerLeg: [22, 0, 0], rightFoot: [24, 0, 0],
    },
  },
  "daily-coffee-sip": {
    symmetric: true,
    ground: { support: "standing", contacts: ["leftFoot", "rightFoot"], soleFeet: ["left", "right"] },
    joints: {
      spine: [2, 0, 0], neck: [6, 0, 0], head: [6, 0, 0], leftUpperArm: [-68, -39, -15],
      leftLowerArm: [-131, 0, 0], leftHand: [-24, 0, -14], rightUpperArm: [-68, 39, 15],
      rightLowerArm: [-131, 0, 0], rightHand: [-24, 0, 14], leftUpperLeg: [0, 0, 3],
      rightUpperLeg: [0, 0, -3],
    },
  },
  "dramatic-shock-stepback": {
    ground: { support: "standing" },
    joints: {
      pelvis: [-6, 0, 0], spine: [-14, 0, 0], chest: [-8, 0, 0], neck: [-8, 0, 0],
      head: [-6, 0, 0], leftUpperArm: [-52, -20, 30], leftLowerArm: [-70, 0, 0],
      leftHand: [-30, 0, 0], rightUpperArm: [-52, 20, -30], rightLowerArm: [-70, 0, 0],
      rightHand: [-30, 0, 0], leftUpperLeg: [-14, 0, 5], leftLowerLeg: [12, 0, 0],
      leftFoot: [-6, 0, 0], rightUpperLeg: [24, 0, -5], rightLowerLeg: [26, 0, 0],
      rightFoot: [34, 0, 0],
    },
  },
  "dramatic-kneeling-despair": {
    symmetric: true,
    ground: { support: "kneeling", contacts: ["leftKnee", "rightKnee"] },
    joints: {
      pelvis: [12, 0, 0], spine: [24, 0, 0], chest: [18, 0, 0], neck: [26, 0, 0],
      head: [30, 0, 0], leftShoulder: [6, 0, -12], leftUpperArm: [-10, 0, 6],
      leftLowerArm: [-8, 0, 0], rightShoulder: [6, 0, 12], rightUpperArm: [-10, 0, -6],
      rightLowerArm: [-8, 0, 0], leftUpperLeg: [-72, 0, 6], leftLowerLeg: [153, 0, 0],
      leftFoot: [61, 0, 0], rightUpperLeg: [-72, 0, -6], rightLowerLeg: [153, 0, 0],
      rightFoot: [61, 0, 0],
    },
  },
  "dramatic-romantic-hug": {
    ground: { support: "standing", contacts: ["leftFoot", "rightFoot"], soleFeet: ["left", "right"] },
    joints: {
      spine: [8, 0, 0], chest: [4, 0, 0], neck: [6, 0, 0], head: [8, 14, -10],
      leftUpperArm: [-52, -26, 40], leftLowerArm: [-78, 0, 0], leftHand: [0, 0, 10],
      rightUpperArm: [-58, 26, -34], rightLowerArm: [-84, 0, 0], rightHand: [0, 0, -10],
      leftUpperLeg: [-6, 0, 3], leftLowerLeg: [8, 0, 0], rightUpperLeg: [2, 0, -3],
    },
  },
  "dramatic-wall-slam-kabe-don": {
    ground: { support: "standing" },
    joints: {
      spine: [6, 8, 0], chest: [6, 6, 0], neck: [8, 0, 0], head: [10, -8, -4],
      leftUpperArm: [5, -44, 12], leftLowerArm: [-43, 0, 0], rightUpperArm: [-74, 75, -39],
      rightLowerArm: [-44, 0, 0], rightHand: [59, -15, 20], leftUpperLeg: [-14, 0, 5],
      leftLowerLeg: [16, 0, 0], rightUpperLeg: [10, 0, -4], rightLowerLeg: [8, 0, 0],
      rightFoot: [6, 0, 0],
    },
  },
  "dialogue-explaining-gesture": {
    ground: { support: "standing", contacts: ["leftFoot", "rightFoot"], soleFeet: ["left", "right"] },
    joints: {
      spine: [4, -8, 0], chest: [0, -6, 0], head: [0, 10, -4], leftUpperArm: [-14, -10, 24],
      leftLowerArm: [-78, 0, 0], leftHand: [-14, 0, 24], rightUpperArm: [-30, 18, -22],
      rightLowerArm: [-62, 0, 0], rightHand: [-20, 0, -30], leftUpperLeg: [0, 0, 4],
      rightUpperLeg: [0, 0, -4],
    },
  },
  "dialogue-listening-nod": {
    ground: { support: "standing", contacts: ["leftFoot", "rightFoot"], soleFeet: ["left", "right"] },
    joints: {
      spine: [6, 0, 0], neck: [10, 0, 0], head: [14, -6, 6], leftUpperArm: [-48, -61, -35],
      rightUpperArm: [-50, 61, 35], leftUpperLeg: [0, 0, 3], rightUpperLeg: [0, 0, -3],
    },
  },
  "dialogue-whisper-secret": {
    ground: { support: "standing" },
    joints: {
      pelvis: [0, 0, 4], spine: [6, 10, -10], chest: [4, 8, -8], neck: [0, 14, -8],
      head: [4, 20, -6], leftUpperArm: [-6, 0, 10], leftLowerArm: [-18, 0, 0],
      rightUpperArm: [-78, 36, 38], rightLowerArm: [-123, 0, 0], leftUpperLeg: [0, 0, 3],
      rightUpperLeg: [-4, 0, -5], rightLowerLeg: [6, 0, 0],
    },
  },
  "couple-hand-hold": {
    ground: { support: "standing" },
    joints: {
      pelvis: [0, -6, 0], chest: [0, 6, 0], head: [0, -10, 0], leftUpperArm: [22, 0, 8],
      leftLowerArm: [-20, 0, 0], rightUpperArm: [-12, 0, -24], rightLowerArm: [-14, 0, 0],
      rightHand: [0, 0, 10], leftUpperLeg: [-24, 0, 2], leftLowerLeg: [10, 0, 0],
      leftFoot: [-10, 0, 0], rightUpperLeg: [18, 0, -2], rightLowerLeg: [26, 0, 0],
      rightFoot: [20, 0, 0],
    },
  },
  "couple-shoulder-lean": {
    ground: { support: "standing" },
    joints: {
      pelvis: [0, 0, 4], spine: [2, 0, -8], chest: [0, 0, -6], neck: [4, 0, -14],
      head: [6, 0, -16], leftUpperArm: [-12, 0, 8], leftLowerArm: [-30, 0, 0],
      rightUpperArm: [-8, 0, -10], rightLowerArm: [-24, 0, 0], leftUpperLeg: [0, 0, 2],
      rightUpperLeg: [0, 0, -5], rightLowerLeg: [8, 0, 0],
    },
  },
  "sitting-floor-cross-legged": {
    ground: { support: "floor", contacts: ["hips", "leftFoot", "rightFoot"] },
    joints: {
      pelvis: [-32, 0, 0], spine: [26, 0, 0], chest: [8, 0, 0], head: [4, 0, 0],
      leftUpperArm: [23, -36, 59], leftLowerArm: [-79, 0, 0], rightUpperArm: [23, 36, -59],
      rightLowerArm: [-79, 0, 0], leftUpperLeg: [-132, 46, 54], leftLowerLeg: [144, 7, 0],
      leftFoot: [18, 1, -31], rightUpperLeg: [-132, -45, -54], rightLowerLeg: [145, -6, 0],
      rightFoot: [18, -1, 32],
    },
  },
  "sitting-desk-slump": {
    ground: { support: "seated", contacts: ["leftFoot", "rightFoot"], soleFeet: ["left", "right"] },
    joints: {
      pelvis: [12, 0, 0], spine: [30, 0, 0], chest: [26, 0, 0], neck: [18, 0, 0],
      head: [20, 0, -18], leftUpperArm: [-70, -30, 34], leftLowerArm: [-104, 0, 0],
      leftHand: [0, 0, 20], rightUpperArm: [-70, 30, -34], rightLowerArm: [-104, 0, 0],
      rightHand: [0, 0, -20], leftUpperLeg: [-84, 0, 6], leftLowerLeg: [82, 0, 0],
      leftFoot: [-2, 0, 0], rightUpperLeg: [-84, 0, -6], rightLowerLeg: [82, 0, 0],
      rightFoot: [-2, 0, 0],
    },
  },
  "action-spell-cast": {
    ground: { support: "standing" },
    joints: {
      spine: [6, -16, 6], chest: [0, -6, 0], head: [0, 10, 0], leftUpperArm: [-30, 0, 70],
      leftLowerArm: [-30, 0, 0], leftHand: [-20, 0, 10], rightUpperArm: [-80, 0, -8],
      rightLowerArm: [-8, 0, 0], rightHand: [-50, 0, 0], leftUpperLeg: [-14, 0, 6],
      leftLowerLeg: [14, 0, 0], leftFoot: [-4, 0, 0], rightUpperLeg: [16, 0, -6],
      rightLowerLeg: [18, 0, 0], rightFoot: [12, 0, 0],
    },
  },
  "dramatic-knight-oath": {
    ground: { support: "kneeling", contacts: ["rightKnee", "leftFoot", "rightFoot"], soleFeet: ["left"] },
    joints: {
      spine: [8, 0, 0], chest: [6, 0, 0], neck: [14, 0, 0], head: [18, 0, 0],
      leftUpperArm: [-56, -70, -13], rightUpperArm: [-69, 69, 15], rightLowerArm: [-121, 0, 0],
      leftUpperLeg: [-93, 2, 8], leftLowerLeg: [90, 0, 0], leftFoot: [3, -1, 2],
      rightUpperLeg: [-3, 2, 0], rightLowerLeg: [95, 0, 0], rightFoot: [65, 2, 0],
    },
  },
  "sitting-mech-pilot": {
    symmetric: true,
    ground: { support: "seated", contacts: ["leftFoot", "rightFoot"] },
    joints: {
      pelvis: [-4, 0, 0], spine: [12, 0, 0], chest: [4, 0, 0], neck: [-4, 0, 0],
      head: [-6, 0, 0], leftUpperArm: [-19, -38, 18], leftLowerArm: [-36, 0, 0],
      leftHand: [-10, 0, -30], rightUpperArm: [-19, 38, -18], rightLowerArm: [-36, 0, 0],
      rightHand: [-10, 0, 30], leftUpperLeg: [-80, 0, 10], leftLowerLeg: [70, 0, 0],
      leftFoot: [-10, 0, 0], rightUpperLeg: [-80, 0, -10], rightLowerLeg: [70, 0, 0],
      rightFoot: [-10, 0, 0],
    },
  },
  "daily-astronaut-float": {
    ground: { support: "airborne", clearanceHeads: 1.6 },
    joints: {
      pelvis: [-10, 10, 8], spine: [-6, 4, 0], chest: [-4, 0, 4], neck: [-6, 0, 0],
      head: [-8, -10, 6], leftUpperArm: [-20, 0, 70], leftLowerArm: [-30, 0, 0],
      leftHand: [0, 0, 16], rightUpperArm: [-10, 0, -58], rightLowerArm: [-24, 0, 0],
      rightHand: [0, 0, -12], leftUpperLeg: [-30, 0, 10], leftLowerLeg: [44, 0, 0],
      leftFoot: [24, 0, 0], rightUpperLeg: [6, 0, -8], rightLowerLeg: [28, 0, 0],
      rightFoot: [28, 0, 0],
    },
  },
});
