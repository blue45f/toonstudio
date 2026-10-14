import { createElement, type ComponentType } from "react";

import { defineAppRoutes, type AppRouteDefinition } from "../app-route-definition";

import { lazyRetry } from "@/shared/lib/lazy-retry";

type LazyPageModule = Record<string, ComponentType>;

function lazyPage(load: () => Promise<unknown>, name: string) {
  return lazyRetry(
    () => load().then((module) => ({
      default: (module as LazyPageModule)[name]!,
    })),
    name,
  );
}

function route(id: string, path: string, Page: ComponentType): AppRouteDefinition {
  return { id, path, element: createElement(Page) };
}

const MySpaceHubPage = lazyPage(
  () => import("@/domains/account/MySpaceHubPage"),
  "MySpaceHubPage",
);
const AccountPage = lazyPage(() => import("@/domains/account/AccountPage"), "AccountPage");
const UserProfilePage = lazyPage(
  () => import("@/domains/account/UserProfilePage"),
  "UserProfilePage",
);
const CreatorDirectoryPage = lazyPage(
  () => import("@/domains/account/CreatorDirectoryPage"),
  "CreatorDirectoryPage",
);
const SettingsPage = lazyPage(() => import("@/domains/account/SettingsPage"), "SettingsPage");
const RoleWorkspaceSettingsPage = lazyPage(
  () => import("@/domains/account/RoleWorkspaceSettingsPage"),
  "RoleWorkspaceSettingsPage",
);
const NotificationSettingsPage = lazyPage(
  () => import("@/domains/engagement/NotificationSettingsPage"),
  "NotificationSettingsPage",
);
const AuthActionPage = lazyPage(
  () => import("@/domains/account/AuthActionPage"),
  "AuthActionPage",
);
const AiSettingsPage = lazyPage(
  () => import("@/domains/account/AiSettingsPage"),
  "AiSettingsPage",
);
const MembershipUsagePage = lazyPage(
  () => import("@/domains/account/MembershipUsagePage"),
  "MembershipUsagePage",
);
const AssetPointsWalletPage = lazyPage(
  () => import("@/domains/account/asset-points"),
  "AssetPointsWalletPage",
);
const MessagesPage = lazyPage(() => import("@/domains/messages/MessagesPage"), "MessagesPage");
const MessageRequestPage = lazyPage(
  () => import("@/domains/messages/MessageRequestPage"),
  "MessageRequestPage",
);

export const accountRoutes = defineAppRoutes([
  route("account-ai-settings", "/settings/ai", AiSettingsPage),
  route("account-role-settings", "/settings/role", RoleWorkspaceSettingsPage),
  route("account-membership-usage", "/membership/usage", MembershipUsagePage),
  route("account-points", "/account/points", AssetPointsWalletPage),
  // 개인 정본 선언 (BLUEPRINT §1.2): /my가 유일한 개인 허브다. /me는 공개 프로필·계정 모듈,
  // /library·/market/library는 허브에서 진입하는 모듈 표면이며, "내 것" 링크는 전부 /my로 수렴한다.
  // /home은 개인 공간이 아니라 작업 홈(이어하기·오늘 할 일)이다.
  route("account-my-space", "/my", MySpaceHubPage),
  route("account-me", "/me", AccountPage),
  route("account-creators", "/creators", CreatorDirectoryPage),
  route("account-profile", "/u/:userId", UserProfilePage),
  route("account-messages-new", "/messages/new", MessageRequestPage),
  route("account-messages-thread", "/messages/:threadId", MessagesPage),
  route("account-messages", "/messages", MessagesPage),
  route("account-notification-settings", "/settings/notifications", NotificationSettingsPage),
  route("account-settings", "/settings", SettingsPage),
  route("account-auth-action", "/auth/:action", AuthActionPage),
]);
