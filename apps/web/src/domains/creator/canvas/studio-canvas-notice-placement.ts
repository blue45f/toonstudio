/** 흐름 높이는 유지하면서 안내의 클릭 영역을 실제 협업 도구 아래로 배치한다. */
export function observeStudioCanvasNoticePlacement(
  rail: HTMLDivElement,
  mobileImmersive: boolean,
): (() => void) | undefined {
  const host = rail.parentElement;
  const controls = host?.querySelector("[data-studio-floating-controls]");
  if (!host || !controls) return undefined;

  const placeBelowControls = () => {
    const hostTop = host.getBoundingClientRect().top;
    const selectionLane = rail.querySelector("[data-studio-selection-command-lane]");
    const bottom = Math.max(
      mobileImmersive ? 64 : 0,
      selectionLane ? selectionLane.getBoundingClientRect().bottom - hostTop : 0,
      ...Array.from(controls.children, (child) => child.getBoundingClientRect().bottom - hostTop),
    );
    const top = `${Math.ceil(bottom + 8)}px`;
    // 데스크톱 레일은 display:contents이므로 개별 absolute 안내가 상속할 좌표만 쓴다.
    rail.style.setProperty("--studio-canvas-notice-top", top);
    if (mobileImmersive) rail.style.top = top;
  };
  const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(placeBelowControls);
  const observeChildren = () => {
    resize?.disconnect();
    resize?.observe(host);
    for (const child of controls.children) resize?.observe(child);
    placeBelowControls();
  };
  const mutations = new MutationObserver(observeChildren);
  mutations.observe(controls, { childList: true });
  observeChildren();
  return () => {
    resize?.disconnect();
    mutations.disconnect();
    rail.style.removeProperty("--studio-canvas-notice-top");
  };
}
