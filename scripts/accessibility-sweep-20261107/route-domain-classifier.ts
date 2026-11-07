/** 라우트 감사의 순수 도메인 분류. 구체 경로 우선순위와 기존 폴백을 유지한다. */
export type RouteDomainCategory =
  | "home"
  | "discover"
  | "catalog-work"
  | "community"
  | "market"
  | "learn"
  | "legal"
  | "account"
  | "experience"
  | "creator"
  | "production"
  | "studio-hub"
  | "studio-editor"
  | "studio-3d-brush-character"
  | "admin"
  | "status-ops"
  | "events-promo"
  | "reader-viewer"
  | "redirect-legacy";

export function classifyRouteDomain(routePath: string): RouteDomainCategory {
  if (routePath === "/") return "home";
  if (
    routePath === "/discover" ||
    routePath.startsWith("/discover/") ||
    routePath === "/rankings" ||
    routePath === "/schedule" ||
    routePath === "/genres" ||
    routePath.startsWith("/genres/") ||
    routePath === "/platforms" ||
    routePath === "/collections" ||
    routePath.startsWith("/collections/") ||
    routePath === "/lists" ||
    routePath.startsWith("/lists/") ||
    routePath === "/search" ||
    routePath === "/compare" ||
    routePath === "/finder" ||
    routePath === "/taste" ||
    routePath === "/mood" ||
    routePath === "/calendar" ||
    routePath === "/awards" ||
    routePath === "/tropes" ||
    routePath === "/quotes" ||
    routePath === "/characters" ||
    routePath === "/world" ||
    routePath === "/ost" ||
    routePath === "/clips" ||
    routePath === "/magazine" ||
    routePath === "/news" ||
    routePath === "/glossary" ||
    routePath === "/recommend" ||
    routePath === "/stats" ||
    routePath === "/insights" ||
    routePath === "/for-you"
  ) {
    return "discover";
  }
  if (
    routePath.startsWith("/title/") ||
    routePath.startsWith("/work/") ||
    routePath.startsWith("/author/") ||
    routePath.startsWith("/authors") ||
    routePath.startsWith("/publishers") ||
    routePath.startsWith("/tags") ||
    routePath.startsWith("/series/")
  ) {
    return "catalog-work";
  }
  if (
    routePath.startsWith("/viewer/") ||
    routePath.startsWith("/read/") ||
    routePath.startsWith("/preview/") ||
    routePath.startsWith("/watch/")
  ) {
    return "reader-viewer";
  }
  if (
    routePath === "/community" ||
    routePath.startsWith("/community/") ||
    routePath === "/forum" ||
    routePath === "/clubs" ||
    routePath.startsWith("/clubs/") ||
    routePath === "/polls" ||
    routePath === "/fanart" ||
    routePath === "/reviews" ||
    routePath === "/chat" ||
    routePath === "/feed" ||
    routePath === "/challenges" ||
    routePath === "/collab" ||
    routePath === "/mentoring" ||
    routePath === "/crew" ||
    routePath === "/stage" ||
    routePath === "/salon" ||
    routePath === "/plaza"
  ) {
    return "community";
  }
  if (
    routePath === "/market" ||
    routePath.startsWith("/market/") ||
    routePath === "/store" ||
    routePath.startsWith("/store/") ||
    routePath === "/shop" ||
    routePath === "/brushes" ||
    routePath === "/assets" ||
    routePath.startsWith("/assets/") ||
    routePath === "/pricing" ||
    routePath === "/checkout" ||
    routePath === "/cart" ||
    routePath === "/passes" ||
    routePath === "/membership" ||
    routePath === "/billing" ||
    routePath === "/coupons" ||
    routePath === "/gifts" ||
    routePath === "/points" ||
    routePath === "/wallet" ||
    routePath === "/funding" ||
    routePath === "/commission" ||
    routePath === "/auctions" ||
    routePath === "/bundles" ||
    routePath === "/deals" ||
    routePath === "/goods" ||
    routePath === "/license" ||
    routePath === "/enterprise"
  ) {
    return "market";
  }
  if (
    routePath === "/learn" ||
    routePath.startsWith("/learn/") ||
    routePath === "/academy" ||
    routePath.startsWith("/academy/") ||
    routePath === "/tutorials" ||
    routePath === "/courses" ||
    routePath === "/guides" ||
    routePath === "/manual" ||
    routePath === "/docs" ||
    routePath === "/wiki" ||
    routePath === "/onboarding" ||
    routePath === "/roadmap" ||
    routePath === "/shortcuts" ||
    routePath === "/faq" ||
    routePath === "/help" ||
    routePath.startsWith("/help/") ||
    routePath === "/support"
  ) {
    return "learn";
  }
  if (
    routePath === "/accessibility" ||
    routePath === "/terms" ||
    routePath === "/privacy" ||
    routePath === "/copyright" ||
    routePath === "/youth-policy" ||
    routePath === "/cookies" ||
    routePath === "/security" ||
    routePath === "/ethics" ||
    routePath === "/ai-policy" ||
    routePath === "/transparency" ||
    routePath === "/dmca" ||
    routePath === "/open-source" ||
    routePath === "/about" ||
    routePath === "/company" ||
    routePath === "/careers" ||
    routePath === "/press" ||
    routePath === "/brand" ||
    routePath === "/partners" ||
    routePath === "/investors" ||
    routePath === "/contact" ||
    routePath === "/sitemap" ||
    routePath === "/changelog" ||
    routePath === "/release-notes" ||
    routePath === "/notices" ||
    routePath.startsWith("/notices/") ||
    routePath.startsWith("/legal/") ||
    routePath.startsWith("/policy/")
  ) {
    return "legal";
  }
  if (
    routePath === "/settings" ||
    routePath.startsWith("/settings/") ||
    routePath === "/profile" ||
    routePath.startsWith("/profile/") ||
    routePath.startsWith("/u/") ||
    routePath === "/library" ||
    routePath.startsWith("/library/") ||
    routePath === "/bookmarks" ||
    routePath === "/history" ||
    routePath === "/notifications" ||
    routePath === "/messages" ||
    routePath === "/login" ||
    routePath === "/signup" ||
    routePath === "/reset-password" ||
    routePath === "/account" ||
    routePath.startsWith("/account/") ||
    routePath === "/my" ||
    routePath.startsWith("/my/") ||
    routePath === "/achievements" ||
    routePath === "/badges" ||
    routePath === "/quests" ||
    routePath === "/streak" ||
    routePath === "/wrapped" ||
    routePath === "/recap"
  ) {
    return "account";
  }
  if (
    routePath === "/fortune" ||
    routePath.startsWith("/fortune/") ||
    routePath === "/tarot" ||
    routePath === "/horoscope" ||
    routePath === "/play" ||
    routePath.startsWith("/play/") ||
    routePath === "/arcade" ||
    routePath === "/minigames" ||
    routePath === "/quiz" ||
    routePath === "/bingo" ||
    routePath === "/gacha" ||
    routePath === "/worldcup" ||
    routePath === "/mbti" ||
    routePath === "/test" ||
    routePath === "/radio" ||
    routePath === "/lounge" ||
    routePath === "/cafe" ||
    routePath === "/cinema" ||
    routePath === "/gallery" ||
    routePath === "/exhibition" ||
    routePath === "/museum" ||
    routePath === "/festival" ||
    routePath === "/concert"
  ) {
    return "experience";
  }
  if (
    routePath === "/events" ||
    routePath.startsWith("/events/") ||
    routePath === "/attendance" ||
    routePath === "/missions" ||
    routePath === "/rewards" ||
    routePath === "/invite" ||
    routePath === "/referral" ||
    routePath === "/campaigns" ||
    routePath === "/contests" ||
    routePath.startsWith("/contests/") ||
    routePath === "/open-call"
  ) {
    return "events-promo";
  }
  if (
    routePath === "/status" ||
    routePath.startsWith("/status/") ||
    routePath === "/health" ||
    routePath === "/diagnostics" ||
    routePath === "/system" ||
    routePath === "/offline" ||
    routePath === "/desktop-sync" ||
    routePath === "/mobile-app" ||
    routePath === "/download" ||
    routePath === "/pwa"
  ) {
    return "status-ops";
  }
  if (routePath === "/admin" || routePath.startsWith("/admin/")) {
    return "admin";
  }
  if (
    routePath === "/brush-lab" ||
    routePath.startsWith("/brush-lab/") ||
    routePath === "/shaper" ||
    routePath.startsWith("/shaper/") ||
    routePath === "/character-lab" ||
    routePath.startsWith("/character-lab/") ||
    routePath === "/pose-lab" ||
    routePath === "/bg3d" ||
    routePath === "/vrm" ||
    routePath === "/3d" ||
    routePath.startsWith("/studio/3d") ||
    routePath.startsWith("/studio/brush") ||
    routePath.startsWith("/studio/character") ||
    routePath.startsWith("/studio/pose") ||
    routePath.startsWith("/studio/vrm") ||
    routePath.startsWith("/studio/stage3d") ||
    routePath.startsWith("/studio/world") ||
    routePath.startsWith("/studio/lighting") ||
    routePath.startsWith("/studio/camera") ||
    routePath.startsWith("/studio/material") ||
    routePath.startsWith("/studio/rig") ||
    routePath.startsWith("/studio/cloth") ||
    routePath.startsWith("/studio/hair") ||
    routePath.startsWith("/studio/face") ||
    routePath.startsWith("/studio/hand") ||
    routePath.startsWith("/studio/prop") ||
    routePath.startsWith("/studio/environment")
  ) {
    return "studio-3d-brush-character";
  }
  if (
    routePath === "/studio/canvas" ||
    routePath === "/studio/draw" ||
    routePath === "/studio/editor" ||
    routePath === "/studio/ink" ||
    routePath === "/studio/color" ||
    routePath === "/studio/lettering" ||
    routePath === "/studio/balloon" ||
    routePath === "/studio/sfx" ||
    routePath === "/studio/panel" ||
    routePath === "/studio/cut" ||
    routePath === "/studio/cuts" ||
    routePath === "/studio/storyboard" ||
    routePath === "/studio/conti" ||
    routePath === "/studio/vector" ||
    routePath === "/studio/layers" ||
    routePath === "/studio/tone" ||
    routePath === "/studio/halftone" ||
    routePath === "/studio/perspective" ||
    routePath === "/studio/ruler" ||
    routePath === "/studio/retouch" ||
    routePath === "/studio/compositing" ||
    routePath === "/studio/filter" ||
    routePath === "/studio/effects" ||
    routePath === "/studio/timeline" ||
    routePath === "/studio/animation" ||
    routePath === "/studio/motion" ||
    routePath === "/studio/cuttoon"
  ) {
    return "studio-editor";
  }
  if (routePath === "/studio" || routePath.startsWith("/studio/")) {
    return "studio-hub";
  }
  if (
    routePath === "/production" ||
    routePath.startsWith("/production/") ||
    routePath === "/pipeline" ||
    routePath === "/workflow" ||
    routePath === "/schedule-board" ||
    routePath === "/tasks" ||
    routePath === "/review" ||
    routePath.startsWith("/review/") ||
    routePath === "/qa" ||
    routePath === "/publish" ||
    routePath === "/export" ||
    routePath === "/delivery" ||
    routePath === "/versions" ||
    routePath === "/snapshots" ||
    routePath === "/backups" ||
    routePath === "/localization" ||
    routePath === "/translation" ||
    routePath === "/typesetting" ||
    routePath === "/rights" ||
    routePath === "/contracts" ||
    routePath === "/royalties" ||
    routePath === "/settlement" ||
    routePath === "/team" ||
    routePath.startsWith("/team/") ||
    routePath === "/workspace" ||
    routePath.startsWith("/workspace/") ||
    routePath === "/projects" ||
    routePath.startsWith("/projects/")
  ) {
    return "production";
  }
  if (
    routePath === "/creator" ||
    routePath.startsWith("/creator/") ||
    routePath === "/creators" ||
    routePath.startsWith("/creators/") ||
    routePath === "/pitch" ||
    routePath === "/debut" ||
    routePath === "/incubator" ||
    routePath === "/analytics" ||
    routePath.startsWith("/analytics/") ||
    routePath === "/monetization" ||
    routePath === "/revenue" ||
    routePath === "/sponsors" ||
    routePath === "/fanbox" ||
    routePath === "/membership-tier" ||
    routePath === "/script" ||
    routePath === "/story" ||
    routePath === "/plot" ||
    routePath === "/worldbuilding" ||
    routePath === "/lore" ||
    routePath === "/character-sheet" ||
    routePath === "/dialogue" ||
    routePath === "/episode" ||
    routePath === "/episodes" ||
    routePath === "/manuscript" ||
    routePath === "/series-bible" ||
    routePath === "/style-guide" ||
    routePath === "/color-script" ||
    routePath === "/moodboard" ||
    routePath === "/reference" ||
    routePath === "/references" ||
    routePath === "/templates" ||
    routePath === "/presets" ||
    routePath === "/macros" ||
    routePath === "/actions" ||
    routePath === "/fonts" ||
    routePath === "/palettes" ||
    routePath === "/swatches" ||
    routePath === "/gradients" ||
    routePath === "/patterns" ||
    routePath === "/screentones" ||
    routePath === "/stamps" ||
    routePath === "/speech-bubbles" ||
    routePath === "/sound-effects" ||
    routePath === "/backgrounds" ||
    routePath === "/props" ||
    routePath === "/poses" ||
    routePath === "/expressions" ||
    routePath === "/outfits" ||
    routePath === "/materials" ||
    routePath === "/shaders" ||
    routePath === "/luts" ||
    routePath === "/cameras" ||
    routePath === "/lights" ||
    routePath === "/stages" ||
    routePath === "/avatars" ||
    routePath === "/rigs" ||
    routePath === "/animations" ||
    routePath === "/cutscenes" ||
    routePath === "/voice" ||
    routePath === "/bgm" ||
    routePath === "/sfx-library" ||
    routePath === "/ai-assist" ||
    routePath === "/continuity" ||
    routePath === "/anchor-lab" ||
    routePath === "/panel-import" ||
    routePath === "/branching-cuttoon" ||
    routePath === "/virtual-studio" ||
    routePath.startsWith("/virtual-studio/")
  ) {
    return "creator";
  }
  return "redirect-legacy";
}
