type Point = { x: number; y: number };

export function toView(
  { x, y }: Point,
  width: number,
  height: number,
  turn: number,
): Point {
  switch (turn) {
    case 1:
      return { x: height - y + 1, y: x };
    case 2:
      return { x: width - x + 1, y: height - y + 1 };
    case 3:
      return { x: y, y: width - x + 1 };
    default:
      return { x, y };
  }
}

export function fromView(
  point: Point,
  width: number,
  height: number,
  turn: number,
): Point {
  return toView(
    point,
    turn % 2 ? height : width,
    turn % 2 ? width : height,
    (4 - turn) % 4,
  );
}

export function clampZoom(zoom: number) {
  return Math.max(0.5, Math.min(1.6, zoom));
}

export function pinchGeometry(a: Point, b: Point) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
  };
}

export type Footprint = Point & { width: number; height: number };
export type ResizeSide = "top" | "right" | "bottom" | "left" | "corner";

function bounds(a: Point, b: Point): Footprint {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x) + 1,
    height: Math.abs(a.y - b.y) + 1,
  };
}

export function viewFootprint(
  object: Footprint,
  width: number,
  height: number,
  turn: number,
) {
  return bounds(
    toView(object, width, height, turn),
    toView(
      { x: object.x + object.width - 1, y: object.y + object.height - 1 },
      width,
      height,
      turn,
    ),
  );
}

export function resizeFootprint(
  object: Footprint,
  width: number,
  height: number,
  turn: number,
  side: ResizeSide,
  point: Point,
) {
  const view = viewFootprint(object, width, height, turn);
  const start = { x: view.x, y: view.y };
  const end = { x: view.x + view.width - 1, y: view.y + view.height - 1 };
  if (side === "left") start.x = Math.min(end.x, point.x);
  if (side === "top") start.y = Math.min(end.y, point.y);
  if (side === "right" || side === "corner") end.x = Math.max(start.x, point.x);
  if (side === "bottom" || side === "corner")
    end.y = Math.max(start.y, point.y);
  return bounds(
    fromView(start, width, height, turn),
    fromView(end, width, height, turn),
  );
}
