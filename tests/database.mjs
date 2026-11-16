// Actual PostgreSQL engine in WASM. Auth schema is a minimal Supabase-compatible shim.
// Does not replace the external Supabase Auth/PostgREST integration suite.
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const db = new PGlite();
let count = 0;
await db.exec(
  `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
);
await db.exec(
  await readFile(
    new URL("../supabase/migrations/202611160001_core.sql", import.meta.url),
    "utf8",
  ),
);
const admin = randomUUID(),
  teacher = randomUUID(),
  pub = randomUUID(),
  outsider = randomUUID();
await db.query("insert into auth.users(id) values($1),($2),($3),($4)", [
  admin,
  teacher,
  pub,
  outsider,
]);
async function as(user) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await db.exec("set role authenticated");
}
async function rpc(name, args = []) {
  if (name === "save_attribute")
    args = [args[0], JSON.stringify(args[1]), args[2]];
  return (
    await db.query(
      `select public.${name}(${args.map((_, i) => "$" + (i + 1)).join(",")}) as value`,
      args,
    )
  ).rows[0]?.value;
}
async function test(name, fn) {
  await fn();
  count++;
  console.log("✓ " + name);
}
async function rejects(fn, pattern) {
  await assert.rejects(fn, pattern);
}
await as(admin);
const w = await rpc("create_workspace", ["Teste de autorização"]);
await db.exec("reset role");
await db.query(
  "insert into public.workspace_members values($1,$2,$3),($1,$4,$5)",
  [w, teacher, "teacher", pub, "public"],
);
const obj = (x, y) => ({
  id: randomUUID(),
  kind: "pc",
  icon: "Monitor",
  color: "green",
  x,
  y,
  attributes: [
    {
      id: randomUUID(),
      name: "Identificador",
      type: "text",
      value: "PC-01",
      visibility: "public",
      edit_role: "teacher",
    },
    {
      id: randomUUID(),
      name: "IP",
      type: "text",
      value: "192.0.2.10",
      visibility: "admin",
      edit_role: "admin",
    },
  ],
});
const room = {
  id: randomUUID(),
  workspace_id: w,
  owner_id: teacher,
  name: "Sala docente",
  width: 4,
  height: 23,
  version: 0,
  objects: [obj(1, 1), obj(4, 23)],
};
await test("Docente cria sala e assume propriedade", async () => {
  await as(teacher);
  assert.equal(await rpc("save_room", [room, 0, "Sala criada", false]), 1);
});
await test("Público recebe apenas atributos públicos e não acessa histórico", async () => {
  await as(pub);
  assert.equal(
    (await db.query("select * from public.attributes")).rows.length,
    2,
  );
  assert.equal(
    (await db.query("select * from public.change_history")).rows.length,
    0,
  );
  await rejects(
    () => rpc("save_room", [room, 1, "Inválido", false]),
    /Sem permissão/,
  );
});
await test("Workspace de terceiros é invisível, inclusive por RPC", async () => {
  await as(outsider);
  for (const t of [
    "workspaces",
    "rooms",
    "objects",
    "attributes",
    "workspace_members",
    "change_history",
  ])
    assert.equal((await db.query(`select * from public.${t}`)).rows.length, 0);
  await rejects(
    () =>
      rpc("save_attribute", [room.objects[0].attributes[0].id, "invasão", 1]),
    /Sem permissão/,
  );
});
await test("Proprietário docente edita atributo administrativo", async () => {
  await as(teacher);
  assert.equal(
    await rpc("save_attribute", [
      room.objects[0].attributes[1].id,
      "192.0.2.11",
      1,
    ]),
    2,
  );
  room.objects[0].attributes[1].value = "192.0.2.11";
});
await test("Docente não administra membros ou convites", async () => {
  await as(teacher);
  await rejects(() => rpc("set_member", [w, pub, "admin"]), /Sem permissão/);
  await rejects(
    () => rpc("create_invite", [w, "admin", 72, 1]),
    /Sem permissão/,
  );
});
let teacherNote, publicNote;
await test("Notas particulares ficam invisíveis até para administrador", async () => {
  await as(teacher);
  teacherNote = (
    await db.query(
      "insert into public.private_notes(workspace_id,room_id,object_id,body) values($1,$2,$3,$4) returning id",
      [w, room.id, room.objects[0].id, "Segredo docente"],
    )
  ).rows[0].id;
  await as(pub);
  publicNote = (
    await db.query(
      "insert into public.private_notes(workspace_id,body) values($1,$2) returning id",
      [w, "Segredo público"],
    )
  ).rows[0].id;
  assert.equal(
    (await db.query("select * from public.private_notes")).rows.length,
    1,
  );
  await as(admin);
  assert.equal(
    (await db.query("select * from public.private_notes")).rows.length,
    0,
  );
  assert.equal(
    (
      await db.query(
        "update public.private_notes set body=$1 where id=$2 returning id",
        ["invasão", teacherNote],
      )
    ).rows.length,
    0,
  );
});
await test("Notas rejeitam escopo inconsistente e autor falsificado", async () => {
  await as(pub);
  await rejects(() =>
    db.query(
      "insert into public.private_notes(workspace_id,room_id,object_id,body) values($1,null,$2,$3)",
      [w, room.objects[0].id, "inválida"],
    ),
  );
  await rejects(
    () =>
      db.query(
        "insert into public.private_notes(workspace_id,author_id,body) values($1,$2,$3)",
        [w, admin, "falsa"],
      ),
    /row-level security/,
  );
});
await test("Escritas diretas em estrutura e histórico são bloqueadas", async () => {
  await as(admin);
  for (const t of [
    "change_history",
    "workspace_members",
    "rooms",
    "objects",
    "attributes",
    "workspace_invites",
  ])
    await rejects(
      () => db.query(`delete from public.${t}`),
      /permission denied/,
    );
  await rejects(
    () => db.query("select app_private.write_snapshot($1,99)", [room]),
    /permission denied/,
  );
});
await test("Movimentação válida persiste sem apagar nota sobrevivente", async () => {
  await as(teacher);
  room.objects[0].x = 2;
  assert.equal(await rpc("save_room", [room, 2, "Movido", false]), 3);
  assert.equal(
    (
      await db.query("select * from public.private_notes where id=$1", [
        teacherNote,
      ])
    ).rows.length,
    1,
  );
});
await test("Conflitos de versão não sobrescrevem mudanças", async () => {
  await as(teacher);
  await rejects(() => rpc("save_room", [room, 2, "antigo", false]), /Conflito/);
});
await test("Coordenadas ocupadas e fora de limites falham atomicamente", async () => {
  await as(teacher);
  const invalid = structuredClone(room);
  invalid.objects[1].x = 2;
  invalid.objects[1].y = 1;
  await rejects(
    () => rpc("save_room", [invalid, 3, "sobreposto", false]),
    /unique constraint/,
  );
  invalid.objects[1].x = 5;
  await rejects(() => rpc("save_room", [invalid, 3, "fora", false]), /limites/);
  assert.equal(
    (await db.query("select version from public.rooms where id=$1", [room.id]))
      .rows[0].version,
    3,
  );
});
let historyId;
await test("Redução exige confirmação e executa como uma operação", async () => {
  await as(teacher);
  const shrunk = { ...room, width: 3, height: 22, objects: [room.objects[0]] };
  await rejects(
    () => rpc("save_room", [shrunk, 3, "Sala redimensionada", false]),
    /Confirme/,
  );
  assert.equal(
    await rpc("save_room", [shrunk, 3, "Sala redimensionada", true]),
    4,
  );
  historyId = (
    await db.query(
      "select id from public.change_history where room_id=$1 and result_version=4",
      [room.id],
    )
  ).rows[0].id;
});
await test("Desfazer restaura conjunto e registra nova operação", async () => {
  await as(teacher);
  await rpc("undo_change", [historyId]);
  assert.equal((await db.query("select * from public.objects")).rows.length, 2);
  assert.equal(
    (await db.query("select version from public.rooms where id=$1", [room.id]))
      .rows[0].version,
    5,
  );
  await rejects(() => rpc("undo_change", [historyId]), /Conflito/);
});
let token;
await test("Convite usa hash, papel fixo e limite de usos", async () => {
  await as(admin);
  token = await rpc("create_invite", [w, "teacher", 72, 1]);
  assert.equal(token.length, 64);
  await as(outsider);
  assert.equal(await rpc("accept_invite", [token]), w);
  assert.equal(
    (
      await db.query(
        "select role from public.workspace_members where user_id=$1",
        [outsider],
      )
    ).rows[0].role,
    "teacher",
  );
  await rejects(() => rpc("accept_invite", [token]), /esgotado/);
});
await test("Docente não proprietário edita só valores permitidos", async () => {
  await as(outsider);
  await rejects(
    () => rpc("save_attribute", [room.objects[0].attributes[1].id, "roubo", 5]),
    /Sem permissão/,
  );
  assert.equal(
    await rpc("save_attribute", [room.objects[0].attributes[0].id, "PC-02", 5]),
    6,
  );
  await rejects(
    () => rpc("save_room", [room, 6, "Tentativa", false]),
    /Sem permissão/,
  );
});
await test("Docente não proprietário desfaz apenas atributo permitido", async () => {
  await as(outsider);
  const h = (
    await db.query(
      "select id from public.change_history where room_id=$1 and result_version=6",
      [room.id],
    )
  ).rows[0].id;
  await rpc("undo_change", [h]);
  assert.equal(
    (
      await db.query("select value from public.attributes where id=$1", [
        room.objects[0].attributes[0].id,
      ])
    ).rows[0].value,
    "PC-01",
  );
});
await test("Convite expirado é rejeitado", async () => {
  await as(admin);
  const t = await rpc("create_invite", [w, "public", 1, 1]);
  await db.exec("reset role");
  await db.query(
    "update public.workspace_invites set expires_at=now()-interval '1 minute' where token_hash=sha256(convert_to($1,'UTF8'))",
    [t],
  );
  await as(outsider);
  await rejects(() => rpc("accept_invite", [t]), /expirado/);
});
await test("Convite não eleva papel de membro existente", async () => {
  await as(admin);
  const t = await rpc("create_invite", [w, "admin", 1, 1]);
  await as(pub);
  await rpc("accept_invite", [t]);
  assert.equal(
    (
      await db.query(
        "select role from public.workspace_members where user_id=$1",
        [pub],
      )
    ).rows[0].role,
    "public",
  );
});
await test("Remoção de membro corta acesso às próprias notas", async () => {
  await as(admin);
  await rpc("set_member", [w, pub, null]);
  await as(pub);
  assert.equal(
    (await db.query("select * from public.private_notes")).rows.length,
    0,
  );
  await rejects(
    () =>
      db.query(
        "insert into public.private_notes(workspace_id,body) values($1,$2)",
        [w, "sem acesso"],
      ),
    /row-level security/,
  );
});
await test("Administrador exclui sala docente e pode restaurar estrutura", async () => {
  await as(admin);
  await rpc("delete_room", [room.id, 7]);
  const h = (
    await db.query(
      "select id from public.change_history where room_id=$1 and result_version=8",
      [room.id],
    )
  ).rows[0].id;
  await rpc("undo_change", [h]);
  assert.equal((await db.query("select * from public.objects")).rows.length, 2);
  await as(teacher);
  assert.equal(
    (await db.query("select * from public.private_notes")).rows.length,
    0,
  );
});
await test("Último administrador não pode ser removido ou rebaixado", async () => {
  await as(admin);
  await rejects(() => rpc("set_member", [w, admin, "public"]), /pelo menos/);
});
await test("RPCs rejeitam versão nula e confirmação nula não autoriza exclusão", async () => {
  await as(admin);
  await rejects(
    () => rpc("save_room", [room, null, "inválido", false]),
    /Versão obrigatória/,
  );
  await rejects(
    () => rpc("save_attribute", [room.objects[0].attributes[0].id, "x", null]),
    /Versão obrigatória/,
  );
  await rejects(
    () => rpc("delete_room", [room.id, null]),
    /Versão obrigatória/,
  );
  const shrunk = { ...room, objects: [] };
  await rejects(
    () => rpc("save_room", [shrunk, 9, "redução", null]),
    /Confirme/,
  );
});
await test("SQL rejeita identificadores duplicados em objetos e atributos", async () => {
  await as(admin);
  const duplicate = structuredClone(room);
  duplicate.objects.push(duplicate.objects[0]);
  await rejects(
    () => rpc("save_room", [duplicate, 9, "duplicado", false]),
    /duplicados/,
  );
  const attrs = structuredClone(room);
  attrs.objects[0].attributes.push(attrs.objects[0].attributes[0]);
  await rejects(
    () => rpc("save_room", [attrs, 9, "duplicado", false]),
    /duplicados/,
  );
});
await test("Identidades de membros só são consultáveis por administradores", async () => {
  await as(outsider);
  await rejects(() => rpc("list_members", [w]), /Sem permissão/);
  await as(admin);
  assert.equal(
    (await db.query("select * from public.list_members($1)", [w])).rows.length,
    3,
  );
});
await test("Rótulo forjado não autoriza docente a desfazer estrutura de terceiros", async () => {
  await as(teacher);
  const forged = structuredClone(room);
  forged.name = "Mudança estrutural";
  forged.objects[0].attributes[0].value = "PC novo";
  assert.equal(
    await rpc("save_room", [forged, 9, "Atributo atualizado", false]),
    10,
  );
  const h = (
    await db.query(
      "select id from public.change_history where room_id=$1 and result_version=10",
      [room.id],
    )
  ).rows[0].id;
  await as(outsider);
  await rejects(() => rpc("undo_change", [h]), /Reversão inválida/);
  assert.equal(
    (await db.query("select name from public.rooms where id=$1", [room.id]))
      .rows[0].name,
    "Mudança estrutural",
  );
});
await test("Perfil permite alterar apenas o próprio nome e o administrador recebe o nome atualizado", async () => {
  await as(teacher);
  await db.query(
    "insert into public.profiles(id,display_name) values($1,$2) on conflict(id) do update set display_name=excluded.display_name",
    [teacher, "Docente de teste"],
  );
  await as(outsider);
  assert.equal(
    (await db.query("select * from public.profiles where id=$1", [teacher]))
      .rows.length,
    0,
  );
  assert.equal(
    (
      await db.query(
        "update public.profiles set display_name=$1 where id=$2 returning id",
        ["Invasão", teacher],
      )
    ).rows.length,
    0,
  );
  await rejects(
    () =>
      db.query("insert into public.profiles(id,display_name) values($1,$2)", [
        teacher,
        "Outro",
      ]),
    /row-level security/,
  );
  await as(admin);
  const member = (
    await db.query("select * from public.list_members($1)", [w])
  ).rows.find((m) => m.user_id === teacher);
  assert.equal(member.display_name, "Docente de teste");
});
console.log(`\n${count} cenários PostgreSQL/RLS aprovados.`);
await db.close();
