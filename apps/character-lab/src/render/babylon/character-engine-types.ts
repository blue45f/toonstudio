import type { EngineDiagnostics, LabFailure, PhysicsProviderFactory, Quat, Vec3 } from "../../contracts";
import type { ReadbackLane } from "../readback";
import type { BetaLoaders } from "./beta-controller";
import type { ProceduralIbl } from "./lighting/ibl";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";
import type { Scene } from "@babylonjs/core/scene.js";

/** `readBone` 결과 */
export interface BoneReading {
  readonly name: string;
  readonly humanoid: string | null;
  readonly position: Vec3;
  readonly rotation: Quat;
  readonly localRotation: Quat;
  readonly auxiliary: boolean;
}

export interface BabylonCharacterEngineDeps {
  /** 이미 초기화된 Babylon 엔진(WebGPUEngine·Engine·NullEngine) */
  readonly engine: AbstractEngine;
  readonly lane: ReadbackLane;
  readonly diagnostics: EngineDiagnostics;
  readonly physicsProviders: PhysicsProviderFactory;
  /** 제작 패키지 GLB 바이트 로더. 기본은 `fetch`(브라우저). 테스트는 node:fs로 주입한다. */
  readonly fetchBytes?: (url: string) => Promise<Uint8Array>;
  /** 패키지 SHA-256을 플랜과 대조한다(기본 true). */
  readonly verifyPackageSha?: boolean;
  /** 캡처 전에 패스 셰이더 컴파일을 기다릴지(기본: lane !== "null"). NullEngine은 컴파일하지 않으므로 하네스가 끈다. */
  readonly awaitShaderCompile?: boolean;
  /** `engine.runRenderLoop` 구동 여부(기본: lane !== "null") */
  readonly runRenderLoop?: boolean;
  /** 엔진 핸들 해제(기본 engine.dispose) */
  readonly disposeEngine?: () => void;
  readonly now?: () => number;
  /**
   * IBL 생성기(기본 `createProceduralIbl`). **엔진의 실제 장면**을 받는다 — IBL 큐브 텍스처는 만든 장면의 소유라 장면이 해제되면 같이 파괴된다.
   * (이전에는 임시 프로브 장면에 만들어 해제하는 바람에 환경 텍스처가 죽은 채 남아 모든 PBR 재질이 영원히 isReady=false가 됐다 — 브라우저 실측.)
   * 테스트가 장면 소유권을 검증하려고 주입한다.
   */
  readonly createIbl?: (scene: Scene) => Promise<ProceduralIbl>;
  /** 베타 무거운 모듈 로더(기본: 동적 import). 테스트가 가짜 IBL 파이프라인·실패 경로를 주입한다. */
  readonly betaLoaders?: BetaLoaders;
  /** 베타 재질 준비 대기 상한(ms) 덮어쓰기. 기본은 GPU 레인 90초·NullEngine 0(기다리지 않음). 테스트가 시간 초과 경로를 짧게 검증한다. */
  readonly betaMaterialReadyTimeoutMs?: number;
  /** 캡처 셰이더 컴파일 대기 상한(ms) 덮어쓰기. 기본 90초. 테스트가 `capture-shader-timeout` 경로를 짧게 검증한다. */
  readonly captureCompileTimeoutMs?: number;
  /**
   * 엔진을 계속 쓸 수 있는 비치명 실패를 앱에 알린다(프레임 중 물리 스텝 오류, 소스를 올린 뒤 물리 provider가 새 체인을 거부).
   * 앱 팩토리는 `EngineFactoryOptions.onFailure`를 넘긴다. 없으면 물리 브리지 상태(`unavailable`)에만 남는다.
   */
  readonly onFailure?: (failure: LabFailure) => void;
}
