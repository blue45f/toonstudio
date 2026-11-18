export class StudioWorkAssetNotFoundError extends Error {
  constructor() {
    super("studio_work_asset_not_found");
    this.name = "StudioWorkAssetNotFoundError";
  }
}

export class StudioWorkAssetForbiddenError extends Error {
  constructor(readonly operation: "view" | "edit") {
    super(`studio_work_asset_${operation}_forbidden`);
    this.name = "StudioWorkAssetForbiddenError";
  }
}

export class StudioWorkAssetTypeConflictError extends Error {
  constructor() {
    super("studio_work_asset_type_conflict");
    this.name = "StudioWorkAssetTypeConflictError";
  }
}

export class StudioWorkAssetImmutableConflictError extends Error {
  constructor() {
    super("studio_work_asset_immutable_conflict");
    this.name = "StudioWorkAssetImmutableConflictError";
  }
}

export class StudioWorkAssetQuotaError extends Error {
  constructor(readonly quota: "count" | "bytes" | "tombstones") {
    super(`studio_work_asset_${quota}_quota`);
    this.name = "StudioWorkAssetQuotaError";
  }
}

export class StudioWorkAssetCleanupOwnershipError extends Error {
  constructor() {
    super("studio_work_asset_cleanup_ownership");
    this.name = "StudioWorkAssetCleanupOwnershipError";
  }
}

export class StudioWorkAssetReferencedError extends Error {
  constructor() {
    super("studio_work_asset_referenced");
    this.name = "StudioWorkAssetReferencedError";
  }
}

export class StudioWorkAssetStorageReferenceNotFoundError extends Error {
  constructor() {
    super("studio_work_asset_storage_reference_not_found");
    this.name = "StudioWorkAssetStorageReferenceNotFoundError";
  }
}

export class StudioWorkAssetStorageReferenceConflictError extends Error {
  constructor() {
    super("studio_work_asset_storage_reference_conflict");
    this.name = "StudioWorkAssetStorageReferenceConflictError";
  }
}
