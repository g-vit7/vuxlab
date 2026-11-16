// Requires three pre-created, email-confirmed users in a dedicated Supabase test project.
// Never use a production project. No service-role key is needed or accepted.
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const url = process.env.SUPABASE_URL,
  key = process.env.SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error(
    "Configure SUPABASE_URL e SUPABASE_ANON_KEY para executar testes reais.",
  );
  process.exit(2);
}
const clients = {};
let count = 0;
async function test(name, fn) {
  await fn();
  count++;
  console.log("✓ " + name);
}
async function ok(result) {
  if (result.error) throw result.error;
  return result.data;
}
async function denied(p) {
  const r = await p;
  assert.ok(r.error, "A operação deveria ser bloqueada");
}
for (const role of ["ADMIN", "TEACHER", "PUBLIC"]) {
  const email = process.env[`TEST_${role}_EMAIL`],
    password = process.env[`TEST_${role}_PASSWORD`];
  if (!email || !password) throw Error(`Configure TEST_${role}_EMAIL/PASSWORD`);
  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const data = await ok(await db.auth.signInWithPassword({ email, password }));
  clients[role] = { db, user: data.user };
}
const { ADMIN: a, TEACHER: t, PUBLIC: p } = clients;
let w, room, token;
try {
  await test("Login real dos três usuários", async () => {
    assert.notEqual(a.user.id, t.user.id);
    assert.notEqual(t.user.id, p.user.id);
  });
  await test("Criação de Workspace via PostgREST/RPC", async () => {
    w = await ok(
      await a.db.rpc("create_workspace", {
        p_name: `Teste Vuxlab ${Date.now()}`,
      }),
    );
    assert.ok(w);
  });
  await test("Isolamento entre Workspaces", async () => {
    const data = await ok(
      await p.db.from("workspaces").select("*").eq("id", w),
    );
    assert.equal(data.length, 0);
  });
  async function invite(client, role) {
    const tok = await ok(
      await a.db.rpc("create_invite", {
        p_workspace: w,
        p_role: role,
        p_hours: 1,
        p_max_uses: 1,
      }),
    );
    return ok(await client.rpc("accept_invite", { p_token: tok }));
  }
  await test("Convites por papel com limite de uso", async () => {
    await invite(t.db, "teacher");
    token = await ok(
      await a.db.rpc("create_invite", {
        p_workspace: w,
        p_role: "public",
        p_hours: 1,
        p_max_uses: 1,
      }),
    );
    await ok(await p.db.rpc("accept_invite", { p_token: token }));
    await denied(t.db.rpc("accept_invite", { p_token: token }));
  });
  const id = randomUUID(),
    attr = randomUUID(),
    ip = randomUUID();
  room = {
    id: randomUUID(),
    workspace_id: w,
    owner_id: t.user.id,
    name: "Sala temporária",
    width: 4,
    height: 23,
    objects: [
      {
        id,
        kind: "pc",
        icon: "Monitor",
        x: 4,
        y: 23,
        color: "gray",
        attributes: [
          {
            id: attr,
            name: "Identificador",
            type: "text",
            value: "PC teste",
            visibility: "public",
            edit_role: "teacher",
          },
          {
            id: ip,
            name: "IP",
            type: "text",
            value: "192.0.2.1",
            visibility: "admin",
            edit_role: "admin",
          },
        ],
      },
    ],
  };
  await test("Sala criada pelo docente e persistida", async () => {
    assert.equal(
      await ok(await t.db.rpc("save_room", { p_room: room, p_expected: 0 })),
      1,
    );
    const data = await ok(
      await t.db.from("rooms").select("*").eq("id", room.id),
    );
    assert.equal(data[0].width, 4);
  });
  await test("Atributo administrativo ausente da resposta ao público", async () => {
    const data = await ok(
      await p.db.from("attributes").select("*").eq("object_id", id),
    );
    assert.equal(data.length, 1);
    assert.equal(data[0].id, attr);
  });
  await test("Público não escreve, docente proprietário edita IP", async () => {
    await denied(
      p.db.rpc("save_attribute", {
        p_id: attr,
        p_value: "inválido",
        p_expected: 1,
      }),
    );
    assert.equal(
      await ok(
        await t.db.rpc("save_attribute", {
          p_id: ip,
          p_value: "192.0.2.2",
          p_expected: 1,
        }),
      ),
      2,
    );
  });
  await test("Privacidade de notas pela API real", async () => {
    await ok(
      await t.db
        .from("private_notes")
        .insert({ workspace_id: w, room_id: room.id, body: "Somente docente" }),
    );
    const data = await ok(
      await a.db.from("private_notes").select("*").eq("workspace_id", w),
    );
    assert.equal(data.length, 0);
  });
  await test("Histórico imutável pela API", async () => {
    await denied(a.db.from("change_history").delete().eq("workspace_id", w));
  });
  await test("Sessão recuperada após novo cliente", async () => {
    const { data } = await t.db.auth.getSession();
    const fresh = createClient(url, key, { auth: { persistSession: false } });
    await ok(
      await fresh.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      }),
    );
    assert.equal(
      (await ok(await fresh.from("rooms").select("id").eq("id", room.id)))
        .length,
      1,
    );
  });
  console.log(`${count} cenários Supabase reais aprovados.`);
} finally {
  // Workspace remains as explicit audit fixture. Remove via SQL in the test project.
  console.log("Fixture de teste (workspace):", w || "não criado");
  for (const { db } of Object.values(clients)) await db.auth.signOut();
}
