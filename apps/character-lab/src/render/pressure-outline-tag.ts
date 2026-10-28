/** 런타임 전용 외곽선. 제작 지오메트리·GLB 내보내기와 구분한다. */
const pressureOutlines = new WeakSet<object>();
export function markPressureOutline(mesh: object): void { pressureOutlines.add(mesh); }
export function isPressureOutline(mesh: object): boolean { return pressureOutlines.has(mesh); }
