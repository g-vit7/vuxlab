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
