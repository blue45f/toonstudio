/**
 * 생산자 구조화 에러 해석 모듈 — live room 구간: studio-crdt-room-binding 코드 59종
 * (liveRoom) + studio-live-collaboration-protocol 코드 3종 (liveProtocol) +
 * studio-live-p2p-overlay-transport 코드 5종·잠금 결과 코드 1종 (liveP2p) (A4 D4, R13).
 *
 * 코어 모듈(studio-producer-error-i18n.ts)의 형제 모듈이다(outbox·page-bridge·scene
 * 구간은 studio-producer-error-i18n-live-crdt.ts). 계약은 코어와 동일하다: 생산자는
 * {code, params}만 방출하고(message = 코드 문자열), 표시는 이 모듈의 리졸버로만
 * 해석한다. ko 값은 이관 전 생산자 원문과 글자 단위 동일하고, en은 신규 번역이다.
 * 단 room-binding의 상태 채널(emitStatus·recoveryState)은 결과 타입의 message가
 * 문자열로 고정된 경계라, 설계 §3.5의 집계자 예외로 binding 안에서만 이 모듈을
 * import해 생산 시점에 해석한다 — throw 채널은 코드를 그대로 통과시켜 표시 지점
 * (Provider messageFrom 등)이 FromCause 진입점으로 해석한다. 두 채널은 섞지 않는다.
 */

import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";

import type { StudioCrdtRoomBindingErrorCode } from "../live/studio-crdt-room-binding";
import type { StudioLiveProtocolErrorCode } from "../live/studio-live-collaboration-protocol";
import type { StudioLiveP2pErrorCode } from "../live/studio-live-p2p-overlay-transport";

function resolveProducerError(
  key: string,
  fallback: string,
  params?: Readonly<Record<string, string>>,
): string {
  const text = resolveTranslationForDisplay(getLang(), key, FALLBACK_CHAIN, fallback);
  const values = params ?? {};
  return text.replace(/\{([A-Za-z0-9_]+)\}/gu, (placeholder, token: string) =>
    Object.hasOwn(values, token) ? String(values[token]) : placeholder,
  );
}

registerI18nLocaleEntries("ko", {
  "studio.producerError.liveRoom.secureIdUnavailable": "안전한 CRDT 업데이트 식별자를 만들 수 없습니다.",
  "studio.producerError.liveRoom.bindingClosed": "이미 닫힌 CRDT 바인딩입니다.",
  "studio.producerError.liveRoom.roomNotReady": "실시간 작업실 연결이 준비되지 않았습니다.",
  "studio.producerError.liveRoom.syncBlockedByRecovery": "서버 권위 원고를 다시 불러오기 전에는 CRDT 동기화를 재개할 수 없습니다.",
  "studio.producerError.liveRoom.bindingNotStarted": "CRDT 바인딩이 아직 시작되지 않았습니다.",
  "studio.producerError.liveRoom.draftProtectionTimeout": "초안을 이 기기의 복구 저장소에 보호하는 시간이 초과됐습니다.",
  "studio.producerError.liveRoom.draftAckLocalRecordUnverified": "서버에 저장된 초안의 로컬 동기화 기록을 확인하지 못했습니다.",
  "studio.producerError.liveRoom.deliveryTimeout": "공동 편집 변경의 전송을 기다리는 시간이 초과됐습니다.",
  "studio.producerError.liveRoom.deliveryChannelDisconnected": "공동 편집 전송 채널의 연결이 끊겼습니다.",
  "studio.producerError.liveRoom.peerDraftProtectionTimeout": "공동 편집 변경을 기기·참여자에게 보호하는 시간이 초과됐습니다.",
  "studio.producerError.liveRoom.saveBeforeServerAckBlockedLocal": "로컬·P2P 협업 모드에서는 서버 승인 전 원고를 저장할 수 없습니다.",
  "studio.producerError.liveRoom.saveBlockedServerDisconnected": "팀 서버 연결이 끊겨 미승인 변경을 저장할 수 없습니다.",
  "studio.producerError.liveRoom.inProgressSyncWaitTimeout": "진행 중인 서버 원고 동기화를 기다리는 시간이 초과됐습니다.",
  "studio.producerError.liveRoom.finalSequenceCheckTimeout": "서버 원고의 최종 순번을 확인하는 시간이 초과됐습니다.",
  "studio.producerError.liveRoom.saveBoundaryTransportChanged": "서버 연결이 변경되어 원고 저장 경계를 다시 확인해야 합니다.",
  "studio.producerError.liveRoom.saveSequenceUnconfirmed": "서버가 저장 경계에 필요한 CRDT 순번을 확인해 주지 않았습니다.",
  "studio.producerError.liveRoom.authoritativeAckTimeout": "공동 편집 변경의 서버 승인을 기다리는 시간이 초과됐습니다.",
  "studio.producerError.liveRoom.syncChannelNotReady": "CRDT 동기화 채널이 준비되지 않았습니다.",
  "studio.producerError.liveRoom.authoritativeSyncResponseMissing": "서버가 권위 CRDT 동기화 응답을 반환하지 않았습니다.",
  "studio.producerError.liveRoom.outboxResponseTimeout": "오프라인 CRDT 보관함 응답 시간이 초과됐습니다.",
  "studio.producerError.liveRoom.transportChanged": "원고 연결이 변경되어 이전 응답을 사용하지 않습니다. 새 연결에서 다시 동기화합니다.",
  "studio.producerError.liveRoom.draftSavedCleaned": "초안이 서버에 저장되었고 로컬 동기화 기록도 정리되었습니다.",
  "studio.producerError.liveRoom.statusClosed": "실시간 원고 동기화를 종료했습니다.",
  "studio.producerError.liveRoom.syncingMissingStrokes": "팀 원고의 누락된 획을 맞추는 중입니다.",
  "studio.producerError.liveRoom.readySynced": "팀 원고가 실시간으로 동기화됩니다.",
  "studio.producerError.liveRoom.enqueueSavingToServer": "새 원고 변경을 팀 서버에 보존하는 중입니다.",
  "studio.producerError.liveRoom.enqueueKeepInRecovery": "서버가 다시 연결될 때까지 새 원고 변경을 복구 저장소에 보관합니다.",
  "studio.producerError.liveRoom.persistedLocalCopyChecked": "로컬 복구 사본을 확인하고 팀 서버 승인을 기다립니다.",
  "studio.producerError.liveRoom.persistedKeepUntilReconnect": "서버 재연결까지 새 변경을 이 기기의 복구 저장소에 보관합니다.",
  "studio.producerError.liveRoom.retryingDirectServerSave": "로컬 보관함을 복구하는 동안 서버에 획을 직접 보존합니다.",
  "studio.producerError.liveRoom.readyLocalSynced": "팀 원고와 로컬 복구 저장소가 동기화됩니다.",
  "studio.producerError.liveRoom.retryingNonAuthoritative": "참여자에게 전달됐지만 팀 서버 승인은 아직 없습니다. 서버 재연결까지 이 기기의 복구 저장소에 보관합니다.",
  "studio.producerError.liveRoom.repairGapDetected": "실시간 전달 순서에 누락이 감지되어 서버 원고와 즉시 다시 맞춥니다.",
  "studio.producerError.liveRoom.repairSequenceGap": "서버 승인 순번에서 누락된 팀 편집을 감지해 즉시 복구합니다.",
  "studio.producerError.liveRoom.readyButDurabilityDegraded": "실시간 서버 동기화는 유지되지만 로컬 복구 저장소가 저하되었습니다. {detail}",
  "studio.producerError.liveRoom.updateEncodeFailed": "실시간 획 묶음이 전송 한도를 초과했습니다.",
  "studio.producerError.liveRoom.outboxPutFailed": "오프라인 CRDT 보관함에 획을 저장하지 못했습니다.",
  "studio.producerError.liveRoom.outboxCleanupFailed": "전송 완료된 CRDT 보관 항목을 정리하지 못했습니다.",
  "studio.producerError.liveRoom.publishRetry": "실시간 획 전송을 다시 시도합니다.",
  "studio.producerError.liveRoom.retryMetadataFailed": "CRDT 재시도 메타데이터를 로컬 SQLite 보관함에 기록하지 못했습니다.",
  "studio.producerError.liveRoom.resyncAfterReconnectFailed": "재연결 후 원고를 다시 동기화하지 못했습니다.",
  "studio.producerError.liveRoom.backgroundResyncFailed": "백그라운드 원고 수렴을 다시 시도합니다.",
  "studio.producerError.liveRoom.remoteUpdateCorrupted": "팀원의 획 업데이트가 손상되어 적용하지 못했습니다.",
  "studio.producerError.liveRoom.repairMissingFailed": "서버 원고의 누락된 편집을 복구하지 못했습니다.",
  "studio.producerError.liveRoom.peerSyncRespondFailed": "이 기기 테스트 탭에 원고 상태를 전달하지 못했습니다.",
  "studio.producerError.liveRoom.storedUpdateCorrupted": "보관된 CRDT 업데이트가 손상되어 복원하지 못했습니다.",
  "studio.producerError.liveRoom.outboxLoadFailed": "오프라인 CRDT 보관함을 불러오지 못했습니다.",
  "studio.producerError.liveRoom.recoveryVaultUnavailable": "거부된 공동 편집 변경의 복구 저장소를 확인하지 못해 원고를 잠갔습니다. {detail}",
  "studio.producerError.liveRoom.recoveryVaultRecheck": "복구 저장소를 다시 확인해 주세요.",
  "studio.producerError.liveRoom.recoveryOrphanedMarker": "이 기기에 영구 거절된 공동 편집 표식과 재전송 원본이 남아 있어 원고를 잠갔습니다. 복구 frontier 저장이 완료되지 않았으므로 서버 원고를 덮어쓰거나 재전송하지 마세요.",
  "studio.producerError.liveRoom.recoveryPendingExport": "이 기기에 아직 내보내지 않은 공동 편집 복구 frontier가 있습니다. 복구 파일을 내보낸 뒤 서버 원고를 명시적으로 다시 열어 주세요.",
  "studio.producerError.liveRoom.recoveryOutboxUnreadable": "미승인 공동 편집 보관함을 신뢰할 수 없어 원고를 잠갔습니다. {detail}",
  "studio.producerError.liveRoom.recoveryPermanentDenied": "서버가 공동 편집 변경을 영구 거부했습니다. 원고를 서버 기준으로 다시 불러오기 전까지 공동 편집을 중지합니다. {detail}",
  "studio.producerError.liveRoom.recoveryNoScopeSuffix": "{message} 영구 복구 저장소 범위가 없어 이 탭을 닫기 전에 원고를 별도로 보존해야 합니다.",
  "studio.producerError.liveRoom.recoveryPreserveFailedPrefix": "{message} 거부된 변경을 영구 복구 저장소에 복사하지 못해 재전송 보관함을 그대로 유지합니다. ",
  "studio.producerError.liveRoom.recoveryMarkerPreservedNote": "영구 거절 표식은 보존되어 다음 세션에서도 재전송이 차단됩니다. ",
  "studio.producerError.liveRoom.recoveryMarkerNotPreservedNote": "이 페이지의 재전송은 차단했지만 영구 거절 표식도 저장하지 못했습니다. ",
  "studio.producerError.liveRoom.recoveryPreservedNote": "{message} 거부된 변경 {count}개를 별도 복구 저장소에 보존했습니다. 복구 파일을 내보낸 뒤 서버 원고를 다시 열어 주세요.",
  "studio.producerError.liveRoom.recoveryCleanupFailedNote": "{message} 별도 복구 저장소에는 안전하게 보존했지만 재전송 보관함 정리를 완료하지 못했습니다. 복구 파일을 내보낸 뒤 서버 원고를 다시 열어 주세요.",
  "studio.producerError.liveProtocol.cursorPayloadInvalid": "유효하지 않은 실시간 협업 메시지입니다.",
  "studio.producerError.liveProtocol.envelopeCreateFailed": "유효하지 않은 실시간 협업 메시지입니다.",
  "studio.producerError.liveProtocol.workIdRequired": "유효한 작품 ID가 필요합니다.",
  "studio.producerError.liveP2p.syncRequestInvalid": "CRDT 동기화 요청이 올바르지 않습니다.",
  "studio.producerError.liveP2p.syncRequestDuplicate": "같은 CRDT 동기화 요청이 이미 진행 중입니다.",
  "studio.producerError.liveP2p.updateInvalid": "CRDT 업데이트가 올바르지 않습니다.",
  "studio.producerError.liveP2p.publishChannelNotReady": "P2P 원고 전송 채널이 준비되지 않았습니다.",
  "studio.producerError.liveP2p.publishPartialFailed": "일부 P2P 참여자에게 원고를 전송하지 못해 다시 시도합니다.",
  "studio.producerError.liveP2p.lockNoAuthoritativePath": "권위 있는 편집 잠금 경로가 없습니다.",
});

registerI18nLocaleEntries("en", {
  "studio.producerError.liveRoom.secureIdUnavailable": "Could not create a secure CRDT update identifier.",
  "studio.producerError.liveRoom.bindingClosed": "This CRDT binding is already closed.",
  "studio.producerError.liveRoom.roomNotReady": "The realtime workspace connection is not ready yet.",
  "studio.producerError.liveRoom.syncBlockedByRecovery": "CRDT sync cannot resume until the server-authoritative document is loaded again.",
  "studio.producerError.liveRoom.bindingNotStarted": "The CRDT binding has not started yet.",
  "studio.producerError.liveRoom.draftProtectionTimeout": "Timed out while protecting the draft in this device's recovery store.",
  "studio.producerError.liveRoom.draftAckLocalRecordUnverified": "Could not verify the local sync record of the draft saved on the server.",
  "studio.producerError.liveRoom.deliveryTimeout": "Timed out while waiting for the collaborative edit to be delivered.",
  "studio.producerError.liveRoom.deliveryChannelDisconnected": "The collaborative editing delivery channel was disconnected.",
  "studio.producerError.liveRoom.peerDraftProtectionTimeout": "Timed out while protecting the collaborative edit on devices and with participants.",
  "studio.producerError.liveRoom.saveBeforeServerAckBlockedLocal": "In local/P2P collaboration mode, the document cannot be saved before server approval.",
  "studio.producerError.liveRoom.saveBlockedServerDisconnected": "The team server connection was lost, so unapproved changes cannot be saved.",
  "studio.producerError.liveRoom.inProgressSyncWaitTimeout": "Timed out while waiting for the server document sync in progress.",
  "studio.producerError.liveRoom.finalSequenceCheckTimeout": "Timed out while checking the final sequence of the server document.",
  "studio.producerError.liveRoom.saveBoundaryTransportChanged": "The server connection changed, so the document save boundary must be checked again.",
  "studio.producerError.liveRoom.saveSequenceUnconfirmed": "The server did not confirm the CRDT sequence required for the save boundary.",
  "studio.producerError.liveRoom.authoritativeAckTimeout": "Timed out while waiting for the server approval of the collaborative edit.",
  "studio.producerError.liveRoom.syncChannelNotReady": "The CRDT sync channel is not ready yet.",
  "studio.producerError.liveRoom.authoritativeSyncResponseMissing": "The server did not return an authoritative CRDT sync response.",
  "studio.producerError.liveRoom.outboxResponseTimeout": "The offline CRDT outbox response time was exceeded.",
  "studio.producerError.liveRoom.transportChanged": "The document connection changed, so the previous response will not be used. Syncing again on the new connection.",
  "studio.producerError.liveRoom.draftSavedCleaned": "The draft was saved on the server and the local sync records were cleaned up.",
  "studio.producerError.liveRoom.statusClosed": "Realtime document sync has ended.",
  "studio.producerError.liveRoom.syncingMissingStrokes": "Aligning the missing strokes of the team document.",
  "studio.producerError.liveRoom.readySynced": "The team document syncs in realtime.",
  "studio.producerError.liveRoom.enqueueSavingToServer": "Preserving the new document change on the team server.",
  "studio.producerError.liveRoom.enqueueKeepInRecovery": "Keeping the new document change in the recovery store until the server reconnects.",
  "studio.producerError.liveRoom.persistedLocalCopyChecked": "The local recovery copy was verified; waiting for team server approval.",
  "studio.producerError.liveRoom.persistedKeepUntilReconnect": "Keeping the new change in this device's recovery store until the server reconnects.",
  "studio.producerError.liveRoom.retryingDirectServerSave": "Saving the stroke directly to the server while the local outbox is recovered.",
  "studio.producerError.liveRoom.readyLocalSynced": "The team document and the local recovery store are in sync.",
  "studio.producerError.liveRoom.retryingNonAuthoritative": "Delivered to participants, but there is no team server approval yet. Keeping it in this device's recovery store until the server reconnects.",
  "studio.producerError.liveRoom.repairGapDetected": "A gap was detected in the realtime delivery order, so the document is being re-aligned with the server right away.",
  "studio.producerError.liveRoom.repairSequenceGap": "A missing team edit was detected in the server approval sequence, so it is being repaired right away.",
  "studio.producerError.liveRoom.readyButDurabilityDegraded": "Realtime server sync is maintained, but the local recovery store is degraded. {detail}",
  "studio.producerError.liveRoom.updateEncodeFailed": "The realtime stroke bundle exceeded the transfer limit.",
  "studio.producerError.liveRoom.outboxPutFailed": "Could not save the stroke to the offline CRDT outbox.",
  "studio.producerError.liveRoom.outboxCleanupFailed": "Could not clean up the delivered CRDT outbox entry.",
  "studio.producerError.liveRoom.publishRetry": "Retrying the realtime stroke transfer.",
  "studio.producerError.liveRoom.retryMetadataFailed": "Could not record the CRDT retry metadata in the local SQLite outbox.",
  "studio.producerError.liveRoom.resyncAfterReconnectFailed": "Could not sync the document again after reconnecting.",
  "studio.producerError.liveRoom.backgroundResyncFailed": "Retrying the background document convergence.",
  "studio.producerError.liveRoom.remoteUpdateCorrupted": "A teammate's stroke update was corrupted, so it was not applied.",
  "studio.producerError.liveRoom.repairMissingFailed": "Could not repair the missing edits of the server document.",
  "studio.producerError.liveRoom.peerSyncRespondFailed": "Could not deliver the document state to this device's test tab.",
  "studio.producerError.liveRoom.storedUpdateCorrupted": "The stored CRDT update was corrupted, so it could not be restored.",
  "studio.producerError.liveRoom.outboxLoadFailed": "Could not load the offline CRDT outbox.",
  "studio.producerError.liveRoom.recoveryVaultUnavailable": "The document was locked because the recovery store for rejected collaborative changes could not be verified. {detail}",
  "studio.producerError.liveRoom.recoveryVaultRecheck": "Please check the recovery store again.",
  "studio.producerError.liveRoom.recoveryOrphanedMarker": "This device still holds a permanently rejected collaborative edit marker and its resend original, so the document was locked. Because the recovery frontier was not fully stored, do not overwrite or resend the server document.",
  "studio.producerError.liveRoom.recoveryPendingExport": "This device has a collaborative recovery frontier that has not been exported yet. Export the recovery file, then explicitly reopen the server document.",
  "studio.producerError.liveRoom.recoveryOutboxUnreadable": "The document was locked because the unapproved collaborative edit outbox cannot be trusted. {detail}",
  "studio.producerError.liveRoom.recoveryPermanentDenied": "The server permanently rejected the collaborative change. Collaborative editing is stopped until the document is loaded again from the server. {detail}",
  "studio.producerError.liveRoom.recoveryNoScopeSuffix": "{message} There is no permanent recovery store scope, so preserve the document separately before closing this tab.",
  "studio.producerError.liveRoom.recoveryPreserveFailedPrefix": "{message} The rejected change could not be copied to the permanent recovery store, so the resend outbox is kept as is. ",
  "studio.producerError.liveRoom.recoveryMarkerPreservedNote": "The permanent rejection marker was preserved, so resending stays blocked in the next session too. ",
  "studio.producerError.liveRoom.recoveryMarkerNotPreservedNote": "Resending was blocked on this page, but the permanent rejection marker could not be saved either. ",
  "studio.producerError.liveRoom.recoveryPreservedNote": "{message} {count} rejected changes were preserved in a separate recovery store. Export the recovery file, then reopen the server document.",
  "studio.producerError.liveRoom.recoveryCleanupFailedNote": "{message} The changes were safely preserved in the separate recovery store, but the resend outbox cleanup could not be completed. Export the recovery file, then reopen the server document.",
  "studio.producerError.liveProtocol.cursorPayloadInvalid": "This is not a valid realtime collaboration message.",
  "studio.producerError.liveProtocol.envelopeCreateFailed": "This is not a valid realtime collaboration message.",
  "studio.producerError.liveProtocol.workIdRequired": "A valid work ID is required.",
  "studio.producerError.liveP2p.syncRequestInvalid": "The CRDT sync request is invalid.",
  "studio.producerError.liveP2p.syncRequestDuplicate": "The same CRDT sync request is already in progress.",
  "studio.producerError.liveP2p.updateInvalid": "The CRDT update is invalid.",
  "studio.producerError.liveP2p.publishChannelNotReady": "The P2P document transfer channel is not ready yet.",
  "studio.producerError.liveP2p.publishPartialFailed": "Could not send the document to some P2P participants, so it will be tried again.",
  "studio.producerError.liveP2p.lockNoAuthoritativePath": "There is no authoritative edit lock path.",
});

const LIVE_ROOM_ERROR_KEYS: Readonly<Record<StudioCrdtRoomBindingErrorCode, string>> = {
  "secure-id-unavailable": "studio.producerError.liveRoom.secureIdUnavailable",
  "binding-closed": "studio.producerError.liveRoom.bindingClosed",
  "room-not-ready": "studio.producerError.liveRoom.roomNotReady",
  "sync-blocked-by-recovery": "studio.producerError.liveRoom.syncBlockedByRecovery",
  "binding-not-started": "studio.producerError.liveRoom.bindingNotStarted",
  "draft-protection-timeout": "studio.producerError.liveRoom.draftProtectionTimeout",
  "draft-ack-local-record-unverified": "studio.producerError.liveRoom.draftAckLocalRecordUnverified",
  "delivery-timeout": "studio.producerError.liveRoom.deliveryTimeout",
  "delivery-channel-disconnected": "studio.producerError.liveRoom.deliveryChannelDisconnected",
  "peer-draft-protection-timeout": "studio.producerError.liveRoom.peerDraftProtectionTimeout",
  "save-before-server-ack-blocked-local": "studio.producerError.liveRoom.saveBeforeServerAckBlockedLocal",
  "save-blocked-server-disconnected": "studio.producerError.liveRoom.saveBlockedServerDisconnected",
  "in-progress-sync-wait-timeout": "studio.producerError.liveRoom.inProgressSyncWaitTimeout",
  "final-sequence-check-timeout": "studio.producerError.liveRoom.finalSequenceCheckTimeout",
  "save-boundary-transport-changed": "studio.producerError.liveRoom.saveBoundaryTransportChanged",
  "save-sequence-unconfirmed": "studio.producerError.liveRoom.saveSequenceUnconfirmed",
  "authoritative-ack-timeout": "studio.producerError.liveRoom.authoritativeAckTimeout",
  "sync-channel-not-ready": "studio.producerError.liveRoom.syncChannelNotReady",
  "authoritative-sync-response-missing": "studio.producerError.liveRoom.authoritativeSyncResponseMissing",
  "outbox-response-timeout": "studio.producerError.liveRoom.outboxResponseTimeout",
  "transport-changed": "studio.producerError.liveRoom.transportChanged",
  "draft-saved-cleaned": "studio.producerError.liveRoom.draftSavedCleaned",
  "status-closed": "studio.producerError.liveRoom.statusClosed",
  "syncing-missing-strokes": "studio.producerError.liveRoom.syncingMissingStrokes",
  "ready-synced": "studio.producerError.liveRoom.readySynced",
  "enqueue-saving-to-server": "studio.producerError.liveRoom.enqueueSavingToServer",
  "enqueue-keep-in-recovery": "studio.producerError.liveRoom.enqueueKeepInRecovery",
  "persisted-local-copy-checked": "studio.producerError.liveRoom.persistedLocalCopyChecked",
  "persisted-keep-until-reconnect": "studio.producerError.liveRoom.persistedKeepUntilReconnect",
  "retrying-direct-server-save": "studio.producerError.liveRoom.retryingDirectServerSave",
  "ready-local-synced": "studio.producerError.liveRoom.readyLocalSynced",
  "retrying-non-authoritative": "studio.producerError.liveRoom.retryingNonAuthoritative",
  "repair-gap-detected": "studio.producerError.liveRoom.repairGapDetected",
  "repair-sequence-gap": "studio.producerError.liveRoom.repairSequenceGap",
  "ready-but-durability-degraded": "studio.producerError.liveRoom.readyButDurabilityDegraded",
  "update-encode-failed": "studio.producerError.liveRoom.updateEncodeFailed",
  "outbox-put-failed": "studio.producerError.liveRoom.outboxPutFailed",
  "outbox-cleanup-failed": "studio.producerError.liveRoom.outboxCleanupFailed",
  "publish-retry": "studio.producerError.liveRoom.publishRetry",
  "retry-metadata-failed": "studio.producerError.liveRoom.retryMetadataFailed",
  "resync-after-reconnect-failed": "studio.producerError.liveRoom.resyncAfterReconnectFailed",
  "background-resync-failed": "studio.producerError.liveRoom.backgroundResyncFailed",
  "remote-update-corrupted": "studio.producerError.liveRoom.remoteUpdateCorrupted",
  "repair-missing-failed": "studio.producerError.liveRoom.repairMissingFailed",
  "peer-sync-respond-failed": "studio.producerError.liveRoom.peerSyncRespondFailed",
  "stored-update-corrupted": "studio.producerError.liveRoom.storedUpdateCorrupted",
  "outbox-load-failed": "studio.producerError.liveRoom.outboxLoadFailed",
  "recovery-vault-unavailable": "studio.producerError.liveRoom.recoveryVaultUnavailable",
  "recovery-vault-recheck": "studio.producerError.liveRoom.recoveryVaultRecheck",
  "recovery-orphaned-marker": "studio.producerError.liveRoom.recoveryOrphanedMarker",
  "recovery-pending-export": "studio.producerError.liveRoom.recoveryPendingExport",
  "recovery-outbox-unreadable": "studio.producerError.liveRoom.recoveryOutboxUnreadable",
  "recovery-permanent-denied": "studio.producerError.liveRoom.recoveryPermanentDenied",
  "recovery-no-scope-suffix": "studio.producerError.liveRoom.recoveryNoScopeSuffix",
  "recovery-preserve-failed-prefix": "studio.producerError.liveRoom.recoveryPreserveFailedPrefix",
  "recovery-marker-preserved-note": "studio.producerError.liveRoom.recoveryMarkerPreservedNote",
  "recovery-marker-not-preserved-note": "studio.producerError.liveRoom.recoveryMarkerNotPreservedNote",
  "recovery-preserved-note": "studio.producerError.liveRoom.recoveryPreservedNote",
  "recovery-cleanup-failed-note": "studio.producerError.liveRoom.recoveryCleanupFailedNote",
};

/** 코드별 ko 원문 템플릿 — 미등록 로케일·미해석 시 폴백이며 이관 전 원문과 동일하다. */
const LIVE_ROOM_ERROR_KO: Readonly<Record<StudioCrdtRoomBindingErrorCode, string>> = {
  "secure-id-unavailable": "안전한 CRDT 업데이트 식별자를 만들 수 없습니다.",
  "binding-closed": "이미 닫힌 CRDT 바인딩입니다.",
  "room-not-ready": "실시간 작업실 연결이 준비되지 않았습니다.",
  "sync-blocked-by-recovery": "서버 권위 원고를 다시 불러오기 전에는 CRDT 동기화를 재개할 수 없습니다.",
  "binding-not-started": "CRDT 바인딩이 아직 시작되지 않았습니다.",
  "draft-protection-timeout": "초안을 이 기기의 복구 저장소에 보호하는 시간이 초과됐습니다.",
  "draft-ack-local-record-unverified": "서버에 저장된 초안의 로컬 동기화 기록을 확인하지 못했습니다.",
  "delivery-timeout": "공동 편집 변경의 전송을 기다리는 시간이 초과됐습니다.",
  "delivery-channel-disconnected": "공동 편집 전송 채널의 연결이 끊겼습니다.",
  "peer-draft-protection-timeout": "공동 편집 변경을 기기·참여자에게 보호하는 시간이 초과됐습니다.",
  "save-before-server-ack-blocked-local": "로컬·P2P 협업 모드에서는 서버 승인 전 원고를 저장할 수 없습니다.",
  "save-blocked-server-disconnected": "팀 서버 연결이 끊겨 미승인 변경을 저장할 수 없습니다.",
  "in-progress-sync-wait-timeout": "진행 중인 서버 원고 동기화를 기다리는 시간이 초과됐습니다.",
  "final-sequence-check-timeout": "서버 원고의 최종 순번을 확인하는 시간이 초과됐습니다.",
  "save-boundary-transport-changed": "서버 연결이 변경되어 원고 저장 경계를 다시 확인해야 합니다.",
  "save-sequence-unconfirmed": "서버가 저장 경계에 필요한 CRDT 순번을 확인해 주지 않았습니다.",
  "authoritative-ack-timeout": "공동 편집 변경의 서버 승인을 기다리는 시간이 초과됐습니다.",
  "sync-channel-not-ready": "CRDT 동기화 채널이 준비되지 않았습니다.",
  "authoritative-sync-response-missing": "서버가 권위 CRDT 동기화 응답을 반환하지 않았습니다.",
  "outbox-response-timeout": "오프라인 CRDT 보관함 응답 시간이 초과됐습니다.",
  "transport-changed": "원고 연결이 변경되어 이전 응답을 사용하지 않습니다. 새 연결에서 다시 동기화합니다.",
  "draft-saved-cleaned": "초안이 서버에 저장되었고 로컬 동기화 기록도 정리되었습니다.",
  "status-closed": "실시간 원고 동기화를 종료했습니다.",
  "syncing-missing-strokes": "팀 원고의 누락된 획을 맞추는 중입니다.",
  "ready-synced": "팀 원고가 실시간으로 동기화됩니다.",
  "enqueue-saving-to-server": "새 원고 변경을 팀 서버에 보존하는 중입니다.",
  "enqueue-keep-in-recovery": "서버가 다시 연결될 때까지 새 원고 변경을 복구 저장소에 보관합니다.",
  "persisted-local-copy-checked": "로컬 복구 사본을 확인하고 팀 서버 승인을 기다립니다.",
  "persisted-keep-until-reconnect": "서버 재연결까지 새 변경을 이 기기의 복구 저장소에 보관합니다.",
  "retrying-direct-server-save": "로컬 보관함을 복구하는 동안 서버에 획을 직접 보존합니다.",
  "ready-local-synced": "팀 원고와 로컬 복구 저장소가 동기화됩니다.",
  "retrying-non-authoritative": "참여자에게 전달됐지만 팀 서버 승인은 아직 없습니다. 서버 재연결까지 이 기기의 복구 저장소에 보관합니다.",
  "repair-gap-detected": "실시간 전달 순서에 누락이 감지되어 서버 원고와 즉시 다시 맞춥니다.",
  "repair-sequence-gap": "서버 승인 순번에서 누락된 팀 편집을 감지해 즉시 복구합니다.",
  "ready-but-durability-degraded": "실시간 서버 동기화는 유지되지만 로컬 복구 저장소가 저하되었습니다. {detail}",
  "update-encode-failed": "실시간 획 묶음이 전송 한도를 초과했습니다.",
  "outbox-put-failed": "오프라인 CRDT 보관함에 획을 저장하지 못했습니다.",
  "outbox-cleanup-failed": "전송 완료된 CRDT 보관 항목을 정리하지 못했습니다.",
  "publish-retry": "실시간 획 전송을 다시 시도합니다.",
  "retry-metadata-failed": "CRDT 재시도 메타데이터를 로컬 SQLite 보관함에 기록하지 못했습니다.",
  "resync-after-reconnect-failed": "재연결 후 원고를 다시 동기화하지 못했습니다.",
  "background-resync-failed": "백그라운드 원고 수렴을 다시 시도합니다.",
  "remote-update-corrupted": "팀원의 획 업데이트가 손상되어 적용하지 못했습니다.",
  "repair-missing-failed": "서버 원고의 누락된 편집을 복구하지 못했습니다.",
  "peer-sync-respond-failed": "이 기기 테스트 탭에 원고 상태를 전달하지 못했습니다.",
  "stored-update-corrupted": "보관된 CRDT 업데이트가 손상되어 복원하지 못했습니다.",
  "outbox-load-failed": "오프라인 CRDT 보관함을 불러오지 못했습니다.",
  "recovery-vault-unavailable": "거부된 공동 편집 변경의 복구 저장소를 확인하지 못해 원고를 잠갔습니다. {detail}",
  "recovery-vault-recheck": "복구 저장소를 다시 확인해 주세요.",
  "recovery-orphaned-marker": "이 기기에 영구 거절된 공동 편집 표식과 재전송 원본이 남아 있어 원고를 잠갔습니다. 복구 frontier 저장이 완료되지 않았으므로 서버 원고를 덮어쓰거나 재전송하지 마세요.",
  "recovery-pending-export": "이 기기에 아직 내보내지 않은 공동 편집 복구 frontier가 있습니다. 복구 파일을 내보낸 뒤 서버 원고를 명시적으로 다시 열어 주세요.",
  "recovery-outbox-unreadable": "미승인 공동 편집 보관함을 신뢰할 수 없어 원고를 잠갔습니다. {detail}",
  "recovery-permanent-denied": "서버가 공동 편집 변경을 영구 거부했습니다. 원고를 서버 기준으로 다시 불러오기 전까지 공동 편집을 중지합니다. {detail}",
  "recovery-no-scope-suffix": "{message} 영구 복구 저장소 범위가 없어 이 탭을 닫기 전에 원고를 별도로 보존해야 합니다.",
  "recovery-preserve-failed-prefix": "{message} 거부된 변경을 영구 복구 저장소에 복사하지 못해 재전송 보관함을 그대로 유지합니다. ",
  "recovery-marker-preserved-note": "영구 거절 표식은 보존되어 다음 세션에서도 재전송이 차단됩니다. ",
  "recovery-marker-not-preserved-note": "이 페이지의 재전송은 차단했지만 영구 거절 표식도 저장하지 못했습니다. ",
  "recovery-preserved-note": "{message} 거부된 변경 {count}개를 별도 복구 저장소에 보존했습니다. 복구 파일을 내보낸 뒤 서버 원고를 다시 열어 주세요.",
  "recovery-cleanup-failed-note": "{message} 별도 복구 저장소에는 안전하게 보존했지만 재전송 보관함 정리를 완료하지 못했습니다. 복구 파일을 내보낸 뒤 서버 원고를 다시 열어 주세요.",
};

/**
 * liveRoom 해석: binding 상태 채널은 집계자 예외로 binding 안에서만 이 함수를
 * 부르고, throw 채널의 표시 지점은 FromCause 진입점을 쓴다.
 */
export function resolveStudioLiveRoomError(
  error: { readonly code: StudioCrdtRoomBindingErrorCode; readonly params?: Readonly<Record<string, string>> },
): string {
  return resolveProducerError(LIVE_ROOM_ERROR_KEYS[error.code], LIVE_ROOM_ERROR_KO[error.code], error.params);
}

/** 표시 지점 전용 해석 (liveRoom, 원인 객체 진입점): 이름+코드 덕 타이핑. 해당하지 않으면 null. */
export function resolveStudioLiveRoomErrorFromCause(cause: unknown): string | null {
  if (!cause || typeof cause !== "object") return null;
  const { name, code, params } = cause as { name?: unknown; code?: unknown; params?: unknown };
  if (name !== "StudioCrdtRoomBindingError" || typeof code !== "string") return null;
  if (!Object.hasOwn(LIVE_ROOM_ERROR_KEYS, code)) return null;
  return resolveStudioLiveRoomError({
    code: code as StudioCrdtRoomBindingErrorCode,
    params: params as Readonly<Record<string, string>> | undefined,
  });
}

const LIVE_PROTOCOL_ERROR_KEYS: Readonly<Record<StudioLiveProtocolErrorCode, string>> = {
  "cursor-payload-invalid": "studio.producerError.liveProtocol.cursorPayloadInvalid",
  "envelope-create-failed": "studio.producerError.liveProtocol.envelopeCreateFailed",
  "work-id-required": "studio.producerError.liveProtocol.workIdRequired",
};

const LIVE_PROTOCOL_ERROR_KO: Readonly<Record<StudioLiveProtocolErrorCode, string>> = {
  "cursor-payload-invalid": "유효하지 않은 실시간 협업 메시지입니다.",
  "envelope-create-failed": "유효하지 않은 실시간 협업 메시지입니다.",
  "work-id-required": "유효한 작품 ID가 필요합니다.",
};

/** 표시 지점 전용 해석 (liveProtocol). 커서 assert 코드는 표시 없음 부분집합이라 코드만 부착돼 있다. */
export function resolveStudioLiveProtocolError(
  error: { readonly code: StudioLiveProtocolErrorCode },
): string {
  return resolveProducerError(LIVE_PROTOCOL_ERROR_KEYS[error.code], LIVE_PROTOCOL_ERROR_KO[error.code]);
}

/** 표시 지점 전용 해석 (liveProtocol, 원인 객체 진입점). 해당하지 않으면 null. */
export function resolveStudioLiveProtocolErrorFromCause(cause: unknown): string | null {
  if (!cause || typeof cause !== "object") return null;
  const { name, code } = cause as { name?: unknown; code?: unknown };
  if (name !== "StudioLiveProtocolError" || typeof code !== "string") return null;
  if (!Object.hasOwn(LIVE_PROTOCOL_ERROR_KEYS, code)) return null;
  return resolveStudioLiveProtocolError({ code: code as StudioLiveProtocolErrorCode });
}

const LIVE_P2P_ERROR_KEYS: Readonly<Record<StudioLiveP2pErrorCode, string>> = {
  "sync-request-invalid": "studio.producerError.liveP2p.syncRequestInvalid",
  "sync-request-duplicate": "studio.producerError.liveP2p.syncRequestDuplicate",
  "update-invalid": "studio.producerError.liveP2p.updateInvalid",
  "publish-channel-not-ready": "studio.producerError.liveP2p.publishChannelNotReady",
  "publish-partial-failed": "studio.producerError.liveP2p.publishPartialFailed",
};

const LIVE_P2P_ERROR_KO: Readonly<Record<StudioLiveP2pErrorCode, string>> = {
  "sync-request-invalid": "CRDT 동기화 요청이 올바르지 않습니다.",
  "sync-request-duplicate": "같은 CRDT 동기화 요청이 이미 진행 중입니다.",
  "update-invalid": "CRDT 업데이트가 올바르지 않습니다.",
  "publish-channel-not-ready": "P2P 원고 전송 채널이 준비되지 않았습니다.",
  "publish-partial-failed": "일부 P2P 참여자에게 원고를 전송하지 못해 다시 시도합니다.",
};

/** 표시 지점 전용 해석 (liveP2p). */
export function resolveStudioLiveP2pError(
  error: { readonly code: StudioLiveP2pErrorCode },
): string {
  return resolveProducerError(LIVE_P2P_ERROR_KEYS[error.code], LIVE_P2P_ERROR_KO[error.code]);
}

/** 표시 지점 전용 해석 (liveP2p, 원인 객체 진입점). 해당하지 않으면 null. */
export function resolveStudioLiveP2pErrorFromCause(cause: unknown): string | null {
  if (!cause || typeof cause !== "object") return null;
  const { name, code } = cause as { name?: unknown; code?: unknown };
  if (name !== "StudioLiveP2pError" || typeof code !== "string") return null;
  if (!Object.hasOwn(LIVE_P2P_ERROR_KEYS, code)) return null;
  return resolveStudioLiveP2pError({ code: code as StudioLiveP2pErrorCode });
}

/**
 * 잠금 결과 코드 해석 (liveP2p 조건부 구간): 잠금 결과 객체는 최종 렌더가 미확인이라
 * 생산자가 코드만 부착했고(메시지 병기 유지), 표시 전환은 렌더 확인 후 이 진입점으로 한다.
 */
export function resolveStudioLiveP2pLockResultMessage(code: string): string | null {
  if (code !== "no-authoritative-lock-path") return null;
  return resolveProducerError(
    "studio.producerError.liveP2p.lockNoAuthoritativePath",
    "권위 있는 편집 잠금 경로가 없습니다.",
  );
}

/**
 * 표시 지점 공용 진입점: 이 구간의 세 생산자(room-binding·protocol·p2p) 원인만
 * 해석하고, 타 생산자 오류·미지 코드는 null — 호출자는 기존 메시지 경로를 유지한다.
 */
export function resolveStudioLiveProducerErrorFromCause(cause: unknown): string | null {
  return (
    resolveStudioLiveRoomErrorFromCause(cause) ??
    resolveStudioLiveProtocolErrorFromCause(cause) ??
    resolveStudioLiveP2pErrorFromCause(cause)
  );
}

/**
 * 문자열로 고정된 경계(room CRDT error 이벤트 message·실패 분류 message)에 코드
 * 문자열이 그대로 실린 경우만 해석한다. 코드 집합에 없는 문자열은 null.
 */
export function resolveStudioLiveCodeMessage(value: string): string | null {
  if (Object.hasOwn(LIVE_ROOM_ERROR_KEYS, value)) {
    return resolveStudioLiveRoomError({ code: value as StudioCrdtRoomBindingErrorCode });
  }
  if (Object.hasOwn(LIVE_PROTOCOL_ERROR_KEYS, value)) {
    return resolveStudioLiveProtocolError({ code: value as StudioLiveProtocolErrorCode });
  }
  if (Object.hasOwn(LIVE_P2P_ERROR_KEYS, value)) {
    return resolveStudioLiveP2pError({ code: value as StudioLiveP2pErrorCode });
  }
  return null;
}
