import { supabase } from "./supabase";
import { demo } from "./demo";
import type { Room, Workspace, Note, Member, History, Role } from "./model";
export function api(isDemo: boolean) {
  const db = supabase;
  async function rpc(name: string, args: Record<string, unknown> = {}) {
    if (!db) throw Error("Configure o Supabase");
    const { data, error } = await db.rpc(name, args);
    if (error) throw Error(error.message);
    return data;
  }
  async function rows(table: string, w: string) {
    if (!db) throw Error("Configure o Supabase");
    const { data, error } = await db
      .from(table)
      .select("*")
      .eq("workspace_id", w);
    if (error) throw Error(error.message);
    return data || [];
  }
  return {
    async profile(): Promise<string> {
      if (isDemo)
        return (
          localStorage.getItem("vuxlab-demo-name") || "Conta demonstrativa"
        );
      const {
        data: { user },
        error: authError,
      } = await db!.auth.getUser();
      if (authError) throw authError;
      if (!user) throw Error("Entre novamente na sua conta.");
      const { data, error } = await db!
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data?.display_name || "";
    },
    async saveProfile(name: string) {
      const clean = name.trim();
      if (!clean || clean.length > 100)
        throw Error("O nome deve ter entre 1 e 100 caracteres.");
      if (isDemo) {
        localStorage.setItem("vuxlab-demo-name", clean);
        return;
      }
      const {
        data: { user },
        error: authError,
      } = await db!.auth.getUser();
      if (authError) throw authError;
      if (!user) throw Error("Entre novamente na sua conta.");
      const { error } = await db!
        .from("profiles")
        .upsert({ id: user.id, display_name: clean });
      if (error) throw error;
    },
    async allNotes(): Promise<Note[]> {
      if (isDemo) {
        const ws = await demo.workspaces();
        return (await Promise.all(ws.map((w) => demo.notes(w.id)))).flat();
      }
      const notes: Note[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await db!
          .from("private_notes")
          .select("*")
          .order("id")
          .range(offset, offset + 999);
        if (error) throw error;
        notes.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
      return notes;
    },
    async workspaces(): Promise<Workspace[]> {
      if (isDemo) return demo.workspaces();
      const {
        data: { user },
      } = await db!.auth.getUser();
      const { data, error } = await db!
        .from("workspace_members")
        .select("workspace_id,role,workspaces(id,name)")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data || []).map((m: any) => ({ ...m.workspaces, role: m.role }));
    },
    createWorkspace: (name: string) =>
      isDemo
        ? demo.createWorkspace(name)
        : rpc("create_workspace", { p_name: name }),
    renameWorkspace: (id: string, name: string) =>
      isDemo
        ? demo.renameWorkspace(id, name)
        : rpc("update_workspace", { p_workspace: id, p_name: name }),
    async rooms(w: string): Promise<Room[]> {
      if (isDemo) return demo.rooms(w);
      const { data, error } = await db!
        .from("rooms")
        .select("*,objects(*,attributes(*))")
        .eq("workspace_id", w)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    saveRoom: (
      r: Room,
      label: string,
      confirmDelete = false,
    ): Promise<number> =>
      isDemo
        ? demo.saveRoom(r, label, confirmDelete)
        : rpc("save_room", {
            p_room: r,
            p_expected: r.version,
            p_label: label,
            p_confirm_delete: confirmDelete,
          }),
    saveAttribute: (
      id: string,
      value: unknown,
      expected: number,
    ): Promise<number> =>
      isDemo
        ? demo.saveAttribute(id, value, expected)
        : rpc("save_attribute", {
            p_id: id,
            p_value: value,
            p_expected: expected,
          }),
    deleteRoom: (r: Room) =>
      isDemo
        ? demo.deleteRoom(r)
        : rpc("delete_room", { p_id: r.id, p_expected: r.version }),
    history: (w: string): Promise<History[]> =>
      isDemo
        ? demo.history(w)
        : rows("change_history", w).then((r) =>
            r.sort((a, b) => b.created_at.localeCompare(a.created_at)),
          ),
    undo: (id: string) =>
      isDemo ? demo.undo(id) : rpc("undo_change", { p_id: id }),
    notes: (w: string): Promise<Note[]> =>
      isDemo ? demo.notes(w) : rows("private_notes", w),
    async saveNote(n: Omit<Note, "id" | "author_id">, id?: string) {
      if (isDemo) return demo.saveNote(n, id);
      const { error } = await db!
        .from("private_notes")
        .upsert({ ...n, ...(id ? { id } : {}) });
      if (error) throw error;
    },
    async deleteNote(id: string) {
      if (isDemo) return demo.deleteNote(id);
      const { error } = await db!.from("private_notes").delete().eq("id", id);
      if (error) throw error;
    },
    members: (w: string): Promise<Member[]> =>
      isDemo ? demo.members() : rpc("list_members", { p_workspace: w }),
    async setMember(w: string, u: string, role: Role | null) {
      if (isDemo)
        throw Error("Gerenciamento de acesso requer Supabase conectado");
      return rpc("set_member", { p_workspace: w, p_user: u, p_role: role });
    },
    async invite(w: string, role: Role, hours: number, uses: number) {
      if (isDemo) throw Error("Convites reais requerem Supabase conectado");
      return rpc("create_invite", {
        p_workspace: w,
        p_role: role,
        p_hours: hours,
        p_max_uses: uses,
      });
    },
    async invites(w: string): Promise<
      {
        id: string;
        role: Role;
        expires_at: string;
        max_uses: number;
        uses: number;
      }[]
    > {
      return isDemo ? [] : rpc("list_invites", { p_workspace: w });
    },
    revokeInvite: (id: string) => rpc("revoke_invite", { p_id: id }),
    acceptInvite: (token: string) => rpc("accept_invite", { p_token: token }),
  };
}
export type Api = ReturnType<typeof api>;
