import {
  freshObject,
  type Room,
  type Workspace,
  type Note,
  type History,
  type Member,
  canManageRoom,
  canEditAttribute,
  roomSchema,
} from "./model";
export const DEMO_USER = "11111111-1111-4111-8111-111111111111";
type Store = {
  workspaces: Workspace[];
  rooms: Room[];
  notes: Note[];
  history: History[];
};
const key = "vuxlab-demo-v1";
function seed(): Store {
  const workspace_id = crypto.randomUUID(),
    id = crypto.randomUUID();
  const objects = [
    freshObject("master", 4, 1),
    freshObject("door", 1, 6),
    ...Array.from({ length: 20 }, (_, i) =>
      freshObject("pc", 2 + (i % 5), 3 + Math.floor(i / 5)),
    ),
  ];
  objects.forEach((o, i) => {
    o.attributes[0].value =
      o.kind === "pc"
        ? `PC-${String(i - 1).padStart(2, "0")}`
        : o.kind === "master"
          ? "Professor"
          : "Entrada";
    o.color = i % 7 === 0 ? "gray" : "green";
    const ip = o.attributes.find((a) => a.name === "IP");
    if (ip) ip.value = `192.168.10.${10 + i}`;
  });
  return {
    workspaces: [{ id: workspace_id, name: "Escola Horizonte", role: "admin" }],
    rooms: [
      {
        id,
        workspace_id,
        owner_id: DEMO_USER,
        name: "Laboratório de informática",
        width: 8,
        height: 8,
        version: 1,
        objects,
      },
    ],
    notes: [],
    history: [],
  };
}
function read(): Store {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch {
    throw new Error("Não foi possível ler os dados demonstrativos locais");
  }
  const s = seed();
  write(s);
  return s;
}
function write(s: Store) {
  localStorage.setItem(key, JSON.stringify(s));
}
export const demo = {
  async workspaces() {
    return read().workspaces;
  },
  async createWorkspace(name: string) {
    const s = read();
    const id = crypto.randomUUID();
    s.workspaces.push({ id, name, role: "admin" });
    write(s);
    return id;
  },
  async renameWorkspace(id: string, name: string) {
    const s = read();
    s.workspaces = s.workspaces.map((w) => (w.id === id ? { ...w, name } : w));
    write(s);
  },
  async rooms(w: string) {
    return read().rooms.filter((r) => r.workspace_id === w);
  },
  async saveRoom(r: Room, label: string, confirmDelete = false) {
    roomSchema.parse(r);
    const s = read(),
      before = s.rooms.find((x) => x.id === r.id) || null;
    const role = s.workspaces.find((w) => w.id === r.workspace_id)?.role;
    if (!role || !canManageRoom(role, r, DEMO_USER))
      throw Error("Sem permissão");
    if (before && before.version !== r.version)
      throw Error("Conflito: recarregue a sala");
    if (
      before &&
      !confirmDelete &&
      before.objects.some((o) => !r.objects.some((n) => n.id === o.id))
    )
      throw Error("Confirme a exclusão");
    const after = { ...r, version: (before?.version || 0) + 1 };
    s.rooms = s.rooms.filter((x) => x.id !== r.id).concat(after);
    const surviving = new Set(after.objects.map((o) => o.id));
    s.notes = s.notes.filter(
      (n) => n.room_id !== r.id || !n.object_id || surviving.has(n.object_id),
    );
    s.history.unshift({
      id: crypto.randomUUID(),
      workspace_id: r.workspace_id,
      room_id: r.id,
      actor_id: DEMO_USER,
      created_at: new Date().toISOString(),
      label,
      before,
      after,
      result_version: after.version,
    });
    write(s);
    return after.version;
  },
  async saveAttribute(id: string, value: unknown, expected: number) {
    const s = read();
    const r = s.rooms.find((r) =>
      r.objects.some((o) => o.attributes.some((a) => a.id === id)),
    );
    if (!r) throw Error("Sala não encontrada");
    if (r.version !== expected) throw Error("Conflito");
    const a = r.objects.flatMap((o) => o.attributes).find((a) => a.id === id)!;
    const role = s.workspaces.find((w) => w.id === r.workspace_id)!.role;
    if (!canEditAttribute(role, r, DEMO_USER, a)) throw Error("Sem permissão");
    return demo.saveRoom(
      {
        ...r,
        objects: r.objects.map((o) => ({
          ...o,
          attributes: o.attributes.map((a) =>
            a.id === id ? { ...a, value: value as typeof a.value } : a,
          ),
        })),
      },
      "Atributo atualizado",
    );
  },
  async deleteRoom(r: Room) {
    const s = read();
    if (s.rooms.find((x) => x.id === r.id)?.version !== r.version)
      throw Error("Conflito");
    s.rooms = s.rooms.filter((x) => x.id !== r.id);
    s.notes = s.notes.filter((n) => n.room_id !== r.id);
    s.history.unshift({
      id: crypto.randomUUID(),
      workspace_id: r.workspace_id,
      room_id: r.id,
      actor_id: DEMO_USER,
      created_at: new Date().toISOString(),
      label: "Sala excluída",
      before: r,
      after: null,
      result_version: r.version + 1,
    });
    write(s);
  },
  async history(w: string) {
    return read().history.filter((h) => h.workspace_id === w);
  },
  async undo(id: string) {
    const s = read(),
      h = s.history.find((h) => h.id === id)!;
    if (
      s.history.some(
        (x) => x.room_id === h.room_id && x.result_version > h.result_version,
      )
    )
      throw Error("Conflito: existem alterações posteriores");
    const current = s.rooms.find((r) => r.id === h.room_id) || null;
    if (JSON.stringify(current) !== JSON.stringify(h.after))
      throw Error("Conflito");
    const after = h.before
      ? { ...h.before, version: h.result_version + 1 }
      : null;
    s.rooms = s.rooms.filter((r) => r.id !== h.room_id);
    if (after) s.rooms.push(after);
    const ids = new Set(after?.objects.map((o) => o.id) || []);
    s.notes = s.notes.filter(
      (n) =>
        n.room_id !== h.room_id ||
        (!!after && (!n.object_id || ids.has(n.object_id))),
    );
    s.history.unshift({
      ...h,
      id: crypto.randomUUID(),
      label: "Desfeito: " + h.label,
      before: current,
      after,
      result_version: h.result_version + 1,
      created_at: new Date().toISOString(),
    });
    write(s);
  },
  async notes(w: string) {
    return read().notes.filter(
      (n) => n.workspace_id === w && n.author_id === DEMO_USER,
    );
  },
  async saveNote(n: Omit<Note, "id" | "author_id">, id?: string) {
    const s = read();
    const note = { ...n, id: id || crypto.randomUUID(), author_id: DEMO_USER };
    s.notes = s.notes.filter((x) => x.id !== note.id).concat(note);
    write(s);
  },
  async deleteNote(id: string) {
    const s = read();
    s.notes = s.notes.filter((n) => n.id !== id);
    write(s);
  },
  async members(): Promise<Member[]> {
    return [{ user_id: DEMO_USER, role: "admin" }];
  },
};
