import { describe, expect, it } from "vitest";
import { fromView, toView } from "../src/features/editor/view";
import { freshObject, roomSchema } from "../src/lib/model";

describe("Mapa da sala", () => {
  it("gira uma grade retangular e preserva as coordenadas usadas na edição", () => {
    const point = { x: 4, y: 3 };
    const views = [
      { x: 4, y: 3 },
      { x: 1, y: 4 },
      { x: 2, y: 1 },
      { x: 3, y: 2 },
    ];
    for (let turn = 0; turn < views.length; turn++) {
      expect(toView(point, 5, 3, turn)).toEqual(views[turn]);
      expect(fromView(views[turn], 5, 3, turn)).toEqual(point);
    }
  });
  it("aceita um mapa antigo e detecta sobreposição fora da célula de origem", () => {
    const first = freshObject("pc", 1, 1);
    const second = freshObject("door", 2, 2);
    const room = {
      name: "Teste",
      width: 3,
      height: 3,
      objects: [first, second],
    };
    expect(roomSchema.safeParse(room).success).toBe(true);
    expect(
      roomSchema.safeParse({
        ...room,
        objects: [{ ...first, width: 2, height: 2 }, second],
      }).success,
    ).toBe(false);
  });
});
