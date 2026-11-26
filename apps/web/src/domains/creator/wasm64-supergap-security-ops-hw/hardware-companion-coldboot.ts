/**
 * #29/#30/#31/#32 통합 하드웨어 컴패니언 · 외부 DCC 핫싱크 · 제로-네트워크 콜드부트 스위트
 * (`HardwareCompanionAndColdBootSuite`).
 *
 * - #29 스마트폰 자이로/가상 다이얼 컨트롤러(`CompanionGyroDialController`)
 * - #30 WebHID/WebMIDI 무드라이버 하드웨어 매퍼(`HardwareHidMidiMapper`)
 * - #31 외부 DCC(`.psd`/`.glb`) 비파괴 핫싱크 매니페스트(`ExternalDccHotSyncManager`)
 * - #32 비행기 모드 제로-네트워크 콜드부트 감사기(`ZeroNetworkColdBootAuditor`)
 */

import {
  ZeroNetworkColdBootAuditor,
  type ColdBootEnvironmentSnapshot,
  type ColdBootReadinessReport,
} from "./coldboot-readiness-auditor";
import {
  CompanionGyroDialController,
  ExternalDccHotSyncManager,
  HardwareHidMidiMapper,
  type CompanionGyroDialConfig,
  type CompanionGyroDialSample,
  type CompanionStudioGestureAction,
  type ExternalDccAssetLinkInput,
  type ExternalDccHotSyncPlan,
  type ExternalDccManifestEntry,
  type HardwareControlBinding,
  type MappedHardwareCommand,
} from "./hardware-companion-dcc";

export interface HardwareCompanionSuiteOptions {
  readonly companionConfig?: CompanionGyroDialConfig;
  readonly hardwareBindings?: readonly HardwareControlBinding[];
}

/**
 * 하드웨어 컨트롤러(#29/#30), 외부 DCC 핫싱크(#31), 오프라인 콜드부트 감사(#32)를
 * 하나의 지연 로드 파사드로 통합한 스위트.
 */
export class HardwareCompanionAndColdBootSuite {
  readonly companionController: CompanionGyroDialController;
  readonly hardwareMapper: HardwareHidMidiMapper;
  readonly dccHotSync: ExternalDccHotSyncManager;
  readonly coldBootAuditor: ZeroNetworkColdBootAuditor;

  constructor(options: HardwareCompanionSuiteOptions = {}) {
    this.companionController = new CompanionGyroDialController(options.companionConfig);
    this.hardwareMapper = new HardwareHidMidiMapper(options.hardwareBindings);
    this.dccHotSync = new ExternalDccHotSyncManager();
    this.coldBootAuditor = new ZeroNetworkColdBootAuditor();
  }

  /** #29 스마트폰 자이로·다이얼 샘플 처리. */
  processCompanionGyroDial(sample: CompanionGyroDialSample): CompanionStudioGestureAction {
    return this.companionController.processSample(sample);
  }

  /** #30 WebHID 원시 리포트 디코딩 및 스튜디오 명령 매핑. */
  mapWebHidReport(report: Uint8Array): readonly MappedHardwareCommand[] {
    return this.hardwareMapper.decodeHidReport(report);
  }

  /** #30 WebMIDI 3바이트 패킷 디코딩 및 스튜디오 명령 매핑. */
  mapWebMidiMessage(message: Uint8Array, fnHeld = false): MappedHardwareCommand | null {
    return this.hardwareMapper.decodeMidiMessage(message, fnHeld);
  }

  /** #31 외부 `.psd` / `.glb` 자산 링크 등록. */
  registerExternalDccAsset(input: ExternalDccAssetLinkInput): ExternalDccManifestEntry {
    return this.dccHotSync.registerLink(input);
  }

  /** #31 외부 `.psd` / `.glb` 파일 변경 감지 및 비파괴 핫싱크 계획 생성. */
  syncExternalDccAsset(
    linkId: string,
    latestBytes: Uint8Array,
    nowMs?: number,
  ): ExternalDccHotSyncPlan {
    return this.dccHotSync.detectAndApplyHotSync(linkId, latestBytes, nowMs);
  }

  /** #32 제로-네트워크(비행기 모드) 콜드부트 준비 감사 수행. */
  auditColdBootReadiness(snapshot: ColdBootEnvironmentSnapshot): ColdBootReadinessReport {
    return this.coldBootAuditor.audit(snapshot);
  }
}

export {
  ZeroNetworkColdBootAuditor,
  type CachedAssetVerificationRecord,
  type ColdBootCheckId,
  type ColdBootCheckResult,
  type ColdBootCheckSeverity,
  type ColdBootEnvironmentSnapshot,
  type ColdBootReadinessReport,
} from "./coldboot-readiness-auditor";

export {
  CompanionGyroDialController,
  ExternalDccHotSyncManager,
  HardwareHidMidiMapper,
  validateExternalDccHeader,
  type CompanionDialMode,
  type CompanionGyroDialConfig,
  type CompanionGyroDialSample,
  type CompanionStudioGestureAction,
  type ExternalDccAssetLinkInput,
  type ExternalDccFormat,
  type ExternalDccHotSyncPlan,
  type ExternalDccManifestEntry,
  type ExternalDccSyncStatus,
  type HardwareControlBinding,
  type HardwareResponseCurve,
  type HardwareStudioCommandId,
  type MappedHardwareCommand,
} from "./hardware-companion-dcc";
