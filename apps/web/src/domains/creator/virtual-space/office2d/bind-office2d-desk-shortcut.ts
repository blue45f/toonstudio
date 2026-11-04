/** 캔버스의 H는 월드가 먼저 소유하고, 처리 표시는 상위 HUD에도 전달한다. */
export function bindOffice2dDeskShortcut(canvas: HTMLCanvasElement, onDesk: () => void): () => void {
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.code !== "KeyH" || event.target !== canvas || canvas.ownerDocument.activeElement !== canvas) return;
    if (event.defaultPrevented || event.repeat || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    onDesk();
  };
  canvas.addEventListener("keydown", handleKeyDown);
  return () => canvas.removeEventListener("keydown", handleKeyDown);
}
