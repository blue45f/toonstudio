/**
 * Wave 63B — AtelierStage 가상 스튜디오 실전 UI/UX · 캐릭터 자연 동작 · 일상 상호작용 공개 배럴.
 */

export {
  ARRIVAL_EPSILON_M, ATELIER_STAGE_BRAND_NAME, ATELIER_STAGE_SCHEMA_VERSION,
  ATELIER_STAGE_STUDIO_NAME, AVATAR_COLLISION_RADIUS_M, AVATAR_FOOT_GROUND_Y,
  CORE_DOCK_ACTION_BUDGET, CREATOR_STAGE_POSES, DECEL_START_DISTANCE_M,
  DEFAULT_WALL_STICKY_NOTES, LOOK_AT_MAX_YAW_DEG, MAX_DOCK_OCCLUSION_PERCENT,
  PROXIMITY_CLEAR_RADIUS_M, PROXIMITY_FADE_RADIUS_M, PROXIMITY_ROOM_FADE_RADIUS_M,
  PROXIMITY_WHISPER_RADIUS_M, RUN_MAX_SPEED_MPS, STAGE_AMBIENCE_PRESETS,
  STAGE_COLLABORATOR_DESKS, STAGE_CORE_DOCK_ACTIONS, STAGE_FURNITURE_OBSTACLES,
  STAGE_NORTH_WALL_CLEARANCE_M, STAGE_ROOM_DEPTH_M, STAGE_ROOM_WIDTH_M,
  STAGE_STICKY_NOTE_COLORS, STAGE_VOICE_CHAT_ZONES, STOP_SPEED_EPSILON_MPS,
  VIOLET_HUE_MAX, VIOLET_HUE_MIN, WALK_MAX_SPEED_MPS,
  addWallStickyNote, buildAtelierStageLivingSnapshot, computeClampedLookAt,
  cycleWallStickyNoteColor, evaluateAvatarLocomotionAndPose, evaluateProximityBubble,
  evaluateStageDockBudget, evaluateStageInteractions, exportAtelierStageLivingJson,
  formatOklch, getCreatorPoseSpec, getStageAmbiencePreset, getStageVoiceChatZoneSpec,
  getStickyNoteColorSpec, isForbiddenVioletHue, normalizeAngleDeg, normalizeHue,
  resolveAvatarObstacleSlide, shortestSignedAngleDeg, toggleWallStickyNoteDone,
  type AtelierStageLivingSnapshot, type AvatarGaitState, type AvatarLocomotionInput,
  type AvatarLocomotionState, type CreatorPoseId, type CreatorPoseSpec,
  type DeskCoEditInviteState, type DeskPeekPortalState, type LookAtEvaluation,
  type ObstacleSlideAxis, type ObstacleSlideResult, type OklchColor,
  type PeerProximityBubbleState, type PinboardSummary, type ProximityTier,
  type SpeechBubbleClarity, type StageAmbiencePalette, type StageAmbiencePreset,
  type StageAmbiencePresetId, type StageCollaboratorDesk, type StageDockActionId,
  type StageDockActionSpec, type StageDockBudgetInput, type StageDockBudgetState,
  type StageInteractionsInput, type StageInteractionsState, type StageObstacleAabb,
  type StageVoiceChatZoneId, type StageVoiceChatZoneSpec, type StickyNoteColorId,
  type StickyNoteColorSpec, type Vec2M, type Velocity2M, type WallStickyNote,
} from "./atelier-stage-living-engine";

export {
  StudioAtelierStageLivingPanel,
  type StudioAtelierStageLivingPanelProps,
} from "./StudioAtelierStageLivingPanel";
