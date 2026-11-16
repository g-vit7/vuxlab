import { describe, it, expect } from "vitest";
import {
  freshObject,
  roomSchema,
  resizeRoom,
  importRoom,
  canEditAttribute,
  canManageRoom,
  type Room,
} from "../src/lib/model";
const room = (): Room => ({
  id: crypto.randomUUID(),
  workspace_id: crypto.randomUUID(),
  owner_id: "owner",
  version: 1,
  name: "Laboratório",
  width: 4,
  height: 23,
  objects: [freshObject("pc", 4, 23), freshObject("door", 1, 1)],
});
describe("Mapa e importação", () => {
  it("aceita uma sala 4 × 23", () =>
    expect(roomSchema.safeParse(room()).success).toBe(true));
  it("rejeita sobreposição e limites inválidos", () => {
    const r = room();
    r.objects.push(freshObject("pc", 4, 23));
    expect(roomSchema.safeParse(r).success).toBe(false);
    r.objects.pop();
    r.objects[0].x = 5;
    expect(roomSchema.safeParse(r).success).toBe(false);
  });
  it.each(["top-left", "top-right", "bottom-left", "bottom-right"])(
    "recalcula com âncora %s",
    (anchor) => {
      const r = room();
      const result = resizeRoom(r, 3, 22, anchor);
      const expected =
        anchor === "top-right" || anchor === "bottom-left" ? 2 : 1;
      expect(result.removed).toHaveLength(expected);
      expect(result.room.objects).toHaveLength(2 - expected);
      expect(roomSchema.safeParse(result.room).success).toBe(true);
      if (anchor === "bottom-right")
        expect(result.room.objects[0]).toMatchObject({ x: 3, y: 22 });
    },
  );
  it("importa com novos IDs, proprietário e workspace", () => {
    const r = room(),
      copy = importRoom(r, "novo", "eu");
    expect(copy.id).not.toBe(r.id);
    expect(copy.objects[0].id).not.toBe(r.objects[0].id);
    expect(copy.objects[0].attributes[0].id).not.toBe(
      r.objects[0].attributes[0].id,
    );
    expect(copy.owner_id).toBe("eu");
    expect(copy.version).toBe(0);
  });
  it("rejeita JSON inválido e tipos incompatíveis", () => {
    expect(() => importRoom({ name: "x" }, "w", "u")).toThrow();
    const r = room();
    r.objects[0].attributes[0].value = 42;
    expect(roomSchema.safeParse(r).success).toBe(false);
  });
  it("distingue permissões e exceção de propriedade", () => {
    const r = room(),
      ip = r.objects[0].attributes[1];
    expect(canEditAttribute("public", r, "owner", ip)).toBe(false);
    expect(canEditAttribute("teacher", r, "other", ip)).toBe(false);
    expect(canEditAttribute("teacher", r, "owner", ip)).toBe(true);
    expect(canManageRoom("teacher", r, "other")).toBe(false);
    expect(canEditAttribute("admin", r, "other", ip)).toBe(true);
  });
});
