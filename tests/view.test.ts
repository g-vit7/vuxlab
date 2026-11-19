import { describe, expect, it } from "vitest";
import {
  fromView,
  toView,
  viewFootprint,
  resizeFootprint,
} from "../src/features/editor/view";
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
  it("redimensiona pelo canto inferior direito da tela nas quatro rotações", () => {
    const source = { x: 3, y: 4, width: 2, height: 3 };
    for (const turn of [0, 1, 2, 3]) {
      const view = viewFootprint(source, 10, 8, turn);
      const result = resizeFootprint(source, 10, 8, turn, "corner", {
        x: view.x + view.width,
        y: view.y + view.height,
      });
      expect(viewFootprint(result, 10, 8, turn)).toEqual({
        ...view,
        width: view.width + 1,
        height: view.height + 1,
      });
    }
  });
  it("mantém a borda oposta ao redimensionar por cada lado e não inverte o objeto", () => {
    const source = { x: 3, y: 4, width: 2, height: 3 };
    expect(resizeFootprint(source, 10, 8, 0, "left", { x: 2, y: 8 })).toEqual({
      ...source,
      x: 2,
      width: 3,
    });
    expect(resizeFootprint(source, 10, 8, 0, "top", { x: 9, y: 2 })).toEqual({
      ...source,
      y: 2,
      height: 5,
    });
    expect(resizeFootprint(source, 10, 8, 0, "bottom", { x: 9, y: 7 })).toEqual(
      { ...source, height: 4 },
    );
    expect(resizeFootprint(source, 10, 8, 0, "right", { x: 1, y: 8 })).toEqual({
      ...source,
      width: 1,
    });
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
