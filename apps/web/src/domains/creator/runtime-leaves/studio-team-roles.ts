/** 팀 협업 역할 상수 및 타입 (순수 리프 모듈). */
export const STUDIO_TEAM_ROLES = ["owner", "admin", "editor", "commenter", "viewer"] as const;
export const STUDIO_TEAM_ASSIGNABLE_ROLES = ["admin", "editor", "commenter", "viewer"] as const;

export type StudioTeamRole = (typeof STUDIO_TEAM_ROLES)[number];
export type StudioTeamAssignableRole = (typeof STUDIO_TEAM_ASSIGNABLE_ROLES)[number];
