import type { InboxTab } from "./MessagesThreadList";

export const MESSAGES_INBOX_PANEL_ID = "messages-inbox-panel";
export const messagesInboxTabId = (tab: InboxTab) => `messages-inbox-tab-${tab}`;
