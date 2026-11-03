export interface ViewportLayout { width: number; height: number; scale: number; x: number; y: number }
export function fitViewport(width: number, height: number, logicalWidth: number, logicalHeight: number): ViewportLayout {
  if (![width, height, logicalWidth, logicalHeight].every(value => Number.isFinite(value) && value > 0)) throw new Error('Viewport dimensions must be positive');
  const scale = Math.min(width / logicalWidth, height / logicalHeight);
  return { width: logicalWidth * scale, height: logicalHeight * scale, scale, x: (width - logicalWidth * scale) / 2, y: (height - logicalHeight * scale) / 2 };
}
export function clientToGame(clientX: number, clientY: number, rect: { left: number; top: number }, layout: ViewportLayout) {
  return { x: (clientX - rect.left - layout.x) / layout.scale, y: (clientY - rect.top - layout.y) / layout.scale };
}
