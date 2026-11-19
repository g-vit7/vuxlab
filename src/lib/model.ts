import { z } from "zod";
export type Role = "public" | "teacher" | "admin";
export const roles: Record<Role, string> = {
  public: "Público",
  teacher: "Docente",
  admin: "Administrador",
};
export const attributeSchema = z
  .object({
    id: z.string(),
    name: z.string().trim().min(1).max(100),
    type: z.enum(["text", "number", "boolean", "list"]),
    value: z.json(),
    visibility: z.enum(["public", "teacher", "admin"]),
    edit_role: z.enum(["teacher", "admin"]),
  })
  .superRefine((a, ctx) => {
    if (
      (a.type === "text" && typeof a.value !== "string") ||
      (a.type === "number" && typeof a.value !== "number") ||
      (a.type === "boolean" && typeof a.value !== "boolean") ||
      (a.type === "list" && !Array.isArray(a.value))
    )
      ctx.addIssue({
        code: "custom",
        message: "Valor incompatível com o tipo",
      });
  });
export const objectColors = {
  gray: "Cinza",
  green: "Verde",
  yellow: "Amarelo",
  red: "Vermelho",
  blue: "Azul",
  purple: "Roxo",
} as const;
const objectColorsKeys = Object.keys(
  objectColors,
) as (keyof typeof objectColors)[];
export const objectSchema = z.object({
  id: z.string(),
  kind: z.enum(["master", "pc", "door", "other"]),
  icon: z.string().max(80),
  x: z.number().int().positive(),
  y: z.number().int().positive(),
  color: z.enum(objectColorsKeys),
  width: z.number().int().min(1).max(100).optional(),
  height: z.number().int().min(1).max(100).optional(),
  attributes: z.array(attributeSchema).max(100),
});
export const roomSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    width: z.number().int().min(1).max(100),
    height: z.number().int().min(1).max(100),
    objects: z.array(objectSchema).max(2000),
  })
  .superRefine((r, ctx) => {
    const cells = new Set<string>();
    for (const o of r.objects) {
      const footprint = objectCells(o);
      if (
        !fitsRoom(o, r.width, r.height) ||
        footprint.some((k) => cells.has(k))
      )
        ctx.addIssue({
          code: "custom",
          message: "Objeto fora da sala ou sobreposto",
        });
      footprint.forEach((k) => cells.add(k));
    }
    if (new Set(r.objects.map((o) => o.id)).size !== r.objects.length)
      ctx.addIssue({ code: "custom", message: "Identificadores duplicados" });
    const ids = r.objects.flatMap((o) => o.attributes.map((a) => a.id));
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: "custom", message: "Atributos duplicados" });
  });
export type Attribute = z.infer<typeof attributeSchema>;
export type LabObject = z.infer<typeof objectSchema>;
export type Room = z.infer<typeof roomSchema> & {
  id: string;
  workspace_id: string;
  owner_id: string;
  version: number;
};
export type Workspace = { id: string; name: string; role: Role };
export const noteCategories = {
  critical: "Grave",
  warning: "Aviso",
  reminder: "Lembrete",
} as const;
export type NoteCategory = keyof typeof noteCategories;
export type NoteVisibility = "personal" | "shared";
export type NoteScope = {
  workspace_id: string;
  room_id: string | null;
  object_id: string | null;
};
export type NoteDraft = NoteScope & {
  title: string;
  body: string;
  category: NoteCategory;
  noted_at: string | null;
};
export type Note = NoteDraft & {
  id: string;
  author_id: string | null;
  author_name?: string | null;
};

export const urgency: Record<NoteCategory, number> = {
  critical: 2,
  warning: 1,
  reminder: 0,
};
export function noteTitle(note: Pick<Note, "title" | "body">) {
  return (
    note.title ||
    note.body.split("\n")[0].trim().slice(0, 120) ||
    "Nota anterior"
  );
}
export function orderNotes(notes: Note[]) {
  return [...notes].sort(
    (a, b) =>
      urgency[b.category] - urgency[a.category] ||
      (b.noted_at ? Date.parse(b.noted_at) : 0) -
        (a.noted_at ? Date.parse(a.noted_at) : 0) ||
      a.id.localeCompare(b.id),
  );
}
export type History = {
  id: string;
  workspace_id: string;
  room_id: string;
  actor_id: string;
  created_at: string;
  label: string;
  before: Room | null;
  after: Room | null;
  result_version: number;
};
export type Member = {
  user_id: string;
  role: Role;
  email?: string;
  display_name?: string;
};
export function freshObject(
  kind: LabObject["kind"],
  x: number,
  y: number,
): LabObject {
  const attr = (
    name: string,
    type: Attribute["type"],
    value: Attribute["value"],
    visibility: Attribute["visibility"],
    edit_role: Attribute["edit_role"],
  ): Attribute => ({
    id: crypto.randomUUID(),
    name,
    type,
    value,
    visibility,
    edit_role,
  });
  return {
    id: crypto.randomUUID(),
    kind,
    icon:
      kind === "door" ? "DoorOpen" : kind === "other" ? "Settings" : "Monitor",
    x,
    y,
    color: "gray",
    attributes: [
      attr(
        "Identificador",
        "text",
        kind === "pc"
          ? "PC"
          : kind === "master"
            ? "PC mestre"
            : kind === "door"
              ? "Porta"
              : "Objeto",
        "public",
        "teacher",
      ),
      ...(kind === "pc" || kind === "master"
        ? [
            attr("IP", "text", "", "teacher", "admin"),
            attr("Utilizadores", "list", [], "teacher", "teacher"),
          ]
        : []),
    ],
  };
}
export function objectCells(o: LabObject) {
  const width = o.width ?? 1;
  return Array.from(
    { length: width * (o.height ?? 1) },
    (_, i) => `${o.x + (i % width)}:${o.y + Math.floor(i / width)}`,
  );
}
export function fitsRoom(o: LabObject, width: number, height: number) {
  return (
    o.x >= 1 &&
    o.y >= 1 &&
    o.x + (o.width ?? 1) - 1 <= width &&
    o.y + (o.height ?? 1) - 1 <= height
  );
}
export function resizeRoom(
  r: Room,
  width: number,
  height: number,
  anchor: string,
) {
  const dx = anchor.includes("right") ? width - r.width : 0,
    dy = anchor.includes("bottom") ? height - r.height : 0;
  const moved = r.objects.map((o) => ({ ...o, x: o.x + dx, y: o.y + dy }));
  return {
    room: {
      ...r,
      width,
      height,
      objects: moved.filter((o) => fitsRoom(o, width, height)),
    },
    removed: moved.filter((o) => !fitsRoom(o, width, height)),
  };
}
export function canManageRoom(role: Role, r: Room, user: string) {
  return role === "admin" || (role === "teacher" && r.owner_id === user);
}
export function canEditAttribute(
  role: Role,
  r: Room,
  user: string,
  a: Attribute,
) {
  return (
    canManageRoom(role, r, user) ||
    (role === "teacher" && a.edit_role === "teacher")
  );
}
export function importRoom(
  input: unknown,
  workspace_id: string,
  owner_id: string,
): Room {
  const r = roomSchema.parse(input);
  return {
    ...r,
    id: crypto.randomUUID(),
    workspace_id,
    owner_id,
    version: 0,
    objects: r.objects.map((o) => ({
      ...o,
      id: crypto.randomUUID(),
      attributes: o.attributes.map((a) => ({ ...a, id: crypto.randomUUID() })),
    })),
  };
}
export function identifier(o: LabObject) {
  return String(
    o.attributes.find((a) => a.name === "Identificador")?.value || o.kind,
  );
}
