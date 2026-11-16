-- Vuxlab: all shared writes use transactional RPCs. No service_role in the client.
create schema if not exists app_private;
revoke all on schema app_private from public;
create table public.profiles(id uuid primary key references auth.users on delete cascade, display_name text not null default '' check(length(display_name)<=100));
create table public.workspaces(id uuid primary key default gen_random_uuid(),name text not null check(length(trim(name)) between 1 and 100),created_by uuid not null references auth.users,created_at timestamptz not null default now());
create table public.workspace_members(workspace_id uuid references public.workspaces on delete cascade,user_id uuid references auth.users on delete cascade,role text not null check(role in ('public','teacher','admin')),primary key(workspace_id,user_id));
create index members_user on public.workspace_members(user_id);
create table public.workspace_invites(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces on delete cascade,token_hash bytea not null unique,role text not null check(role in ('public','teacher','admin')),expires_at timestamptz not null,max_uses integer not null check(max_uses between 1 and 1000),uses integer not null default 0 check(uses>=0),created_by uuid not null references auth.users);
create table public.rooms(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces on delete cascade,owner_id uuid not null references auth.users,name text not null check(length(trim(name)) between 1 and 100),width integer not null check(width between 1 and 100),height integer not null check(height between 1 and 100),version integer not null default 1);
create index rooms_workspace on public.rooms(workspace_id);
create table public.objects(id uuid primary key,room_id uuid not null references public.rooms on delete cascade,kind text not null check(kind in ('master','pc','door','other')),icon text not null check(length(icon)<=80),x integer not null check(x>0),y integer not null check(y>0),color text not null check(color in ('gray','green')),unique(room_id,x,y));
create table public.attributes(id uuid primary key,object_id uuid not null references public.objects on delete cascade,name text not null check(length(trim(name)) between 1 and 100),type text not null check(type in ('text','number','boolean','list')),value jsonb not null,visibility text not null check(visibility in ('public','teacher','admin')),edit_role text not null check(edit_role in ('teacher','admin')),check((type='text' and jsonb_typeof(value)='string') or (type='number' and jsonb_typeof(value)='number') or (type='boolean' and jsonb_typeof(value)='boolean') or (type='list' and jsonb_typeof(value)='array')));
create index attributes_object on public.attributes(object_id);
create table public.private_notes(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces on delete cascade,room_id uuid references public.rooms on delete cascade,object_id uuid references public.objects on delete cascade,author_id uuid not null default auth.uid() references auth.users on delete cascade,body text not null check(length(body)<=20000),check(object_id is null or room_id is not null));
create index private_notes_author on public.private_notes(author_id);
create table public.change_history(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces on delete cascade,room_id uuid not null,actor_id uuid not null references auth.users,created_at timestamptz not null default now(),label text not null,before jsonb,after jsonb,result_version integer not null);
create index history_room on public.change_history(room_id,created_at desc);

create function app_private.role(w uuid) returns text language sql stable security definer set search_path='' as $$select role from public.workspace_members where workspace_id=w and user_id=auth.uid()$$;
create function app_private.room_access(r uuid) returns text language sql stable security definer set search_path='' as $$select app_private.role(workspace_id) from public.rooms where id=r$$;
create function app_private.manage(r uuid) returns boolean language sql stable security definer set search_path='' as $$select coalesce(app_private.role(workspace_id)='admin' or (app_private.role(workspace_id)='teacher' and owner_id=auth.uid()),false) from public.rooms where id=r$$;
create function app_private.note_access(w uuid,r uuid,o uuid) returns boolean language sql stable security definer set search_path='' as $$select app_private.role(w) is not null and (r is null or exists(select 1 from public.rooms where id=r and workspace_id=w)) and (o is null or exists(select 1 from public.objects where id=o and room_id=r))$$;
grant usage on schema app_private to authenticated;
grant execute on function app_private.role(uuid),app_private.room_access(uuid),app_private.manage(uuid),app_private.note_access(uuid,uuid,uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invites enable row level security;
alter table public.rooms enable row level security;
alter table public.objects enable row level security;
alter table public.attributes enable row level security;
alter table public.private_notes enable row level security;
alter table public.change_history enable row level security;
create policy profile_self on public.profiles for all to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy workspace_read on public.workspaces for select to authenticated using(app_private.role(id) is not null);
create policy members_read on public.workspace_members for select to authenticated using(app_private.role(workspace_id) is not null);
-- Invite hashes are never exposed, even to administrators. Use list_invites().
create policy rooms_read on public.rooms for select to authenticated using(app_private.role(workspace_id) is not null);
create policy objects_read on public.objects for select to authenticated using(app_private.room_access(room_id) is not null);
create policy attributes_read on public.attributes for select to authenticated using(exists(select 1 from public.objects o where o.id=object_id and (app_private.room_access(o.room_id) in ('teacher','admin') or (visibility='public' and app_private.room_access(o.room_id)='public'))));
create policy notes_own on public.private_notes for all to authenticated using(author_id=auth.uid() and app_private.note_access(workspace_id,room_id,object_id)) with check(author_id=auth.uid() and app_private.note_access(workspace_id,room_id,object_id));
create policy history_read on public.change_history for select to authenticated using(app_private.role(workspace_id) in ('teacher','admin'));
revoke all on public.profiles,public.workspaces,public.workspace_members,public.workspace_invites,public.rooms,public.objects,public.attributes,public.private_notes,public.change_history from anon,authenticated;
grant select on public.workspaces,public.workspace_members,public.rooms,public.objects,public.attributes,public.change_history to authenticated;
grant select,insert,update,delete on public.profiles,public.private_notes to authenticated;

create function public.create_workspace(p_name text) returns uuid language plpgsql security definer set search_path='' as $$declare w uuid;begin
if auth.uid() is null then raise exception 'Autenticação necessária';end if;
insert into public.workspaces(name,created_by) values(trim(p_name),auth.uid()) returning id into w;
insert into public.workspace_members values(w,auth.uid(),'admin');return w;end$$;
create function public.update_workspace(p_workspace uuid,p_name text) returns void language plpgsql security definer set search_path='' as $$begin
if app_private.role(p_workspace) is distinct from 'admin' then raise exception 'Sem permissão';end if;
update public.workspaces set name=trim(p_name) where id=p_workspace;end$$;
create function public.set_member(p_workspace uuid,p_user uuid,p_role text) returns void language plpgsql security definer set search_path='' as $$begin
perform 1 from public.workspaces where id=p_workspace for update;
if app_private.role(p_workspace) is distinct from 'admin' then raise exception 'Sem permissão';end if;
if exists(select 1 from public.workspace_members where workspace_id=p_workspace and user_id=p_user and role='admin') and p_role is distinct from 'admin' and (select count(*) from public.workspace_members where workspace_id=p_workspace and role='admin')<=1 then raise exception 'Mantenha pelo menos um administrador';end if;
if p_role is null then delete from public.workspace_members where workspace_id=p_workspace and user_id=p_user;else update public.workspace_members set role=p_role where workspace_id=p_workspace and user_id=p_user;end if;end$$;
create function public.create_invite(p_workspace uuid,p_role text,p_hours integer,p_max_uses integer) returns text language plpgsql security definer set search_path='' as $$declare token text;begin
if app_private.role(p_workspace) is distinct from 'admin' then raise exception 'Sem permissão';end if;
if p_hours not between 1 and 720 then raise exception 'Validade inválida';end if;
token:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
insert into public.workspace_invites(workspace_id,token_hash,role,expires_at,max_uses,created_by) values(p_workspace,sha256(convert_to(token,'UTF8')),p_role,now()+make_interval(hours=>p_hours),p_max_uses,auth.uid());return token;end$$;
create function public.list_invites(p_workspace uuid) returns table(id uuid,role text,expires_at timestamptz,max_uses integer,uses integer) language plpgsql security definer set search_path='' as $$begin
if app_private.role(p_workspace) is distinct from 'admin' then raise exception 'Sem permissão';end if;
return query select i.id,i.role,i.expires_at,i.max_uses,i.uses from public.workspace_invites i where i.workspace_id=p_workspace;end$$;
create function public.revoke_invite(p_id uuid) returns void language plpgsql security definer set search_path='' as $$begin
if not exists(select 1 from public.workspace_invites where id=p_id and app_private.role(workspace_id)='admin') then raise exception 'Sem permissão';end if;
delete from public.workspace_invites where id=p_id;end$$;
create function public.accept_invite(p_token text) returns uuid language plpgsql security definer set search_path='' as $$declare i public.workspace_invites;begin
if auth.uid() is null then raise exception 'Autenticação necessária';end if;
select * into i from public.workspace_invites where token_hash=sha256(convert_to(p_token,'UTF8')) for update;
if i.id is null or i.expires_at<=now() or i.uses>=i.max_uses then raise exception 'Convite inválido, expirado ou esgotado';end if;
-- Existing membership is preserved: a link can never overwrite a role.
if exists(select 1 from public.workspace_members where workspace_id=i.workspace_id and user_id=auth.uid()) then return i.workspace_id;end if;
insert into public.workspace_members values(i.workspace_id,auth.uid(),i.role);
update public.workspace_invites set uses=uses+1 where id=i.id;return i.workspace_id;end$$;

-- Internal snapshot includes shared data only. Never private notes.
create function app_private.snapshot(r uuid) returns jsonb language sql stable security definer set search_path='' as $$
select to_jsonb(rm)||jsonb_build_object('objects',coalesce((select jsonb_agg(to_jsonb(o)-'room_id'||jsonb_build_object('attributes',coalesce((select jsonb_agg(to_jsonb(a)-'object_id' order by a.id) from public.attributes a where a.object_id=o.id),'[]'::jsonb)) order by o.id) from public.objects o where o.room_id=rm.id),'[]'::jsonb)) from public.rooms rm where rm.id=r$$;
create function app_private.write_snapshot(s jsonb,v integer) returns void language plpgsql security definer set search_path='' as $$declare o jsonb;a jsonb;rid uuid:=(s->>'id')::uuid;begin
if jsonb_typeof(s->'objects') is distinct from 'array' then raise exception 'Lista de objetos inválida';end if;
if (select count(*) from jsonb_array_elements(s->'objects'))<>(select count(distinct e->>'id') from jsonb_array_elements(s->'objects') e) then raise exception 'Objetos duplicados ou sem identificador';end if;
if jsonb_array_length(s->'objects')>2000 then raise exception 'Limite de objetos excedido';end if;
insert into public.rooms(id,workspace_id,owner_id,name,width,height,version) values(rid,(s->>'workspace_id')::uuid,(s->>'owner_id')::uuid,s->>'name',(s->>'width')::integer,(s->>'height')::integer,v) on conflict(id) do update set name=excluded.name,width=excluded.width,height=excluded.height,version=v;
-- Preserve surviving IDs so private notes are not deleted on every save.
delete from public.objects where room_id=rid and id not in(select (e->>'id')::uuid from jsonb_array_elements(s->'objects') e);
-- Two-phase coordinate move avoids transient UNIQUE collisions during swaps/resize.
-- Temporarily move within positive coordinate space; bounds enforced on final state.
update public.objects set x=x+10000,y=y+10000 where room_id=rid;
for o in select * from jsonb_array_elements(s->'objects') loop
 if (o->>'x')::integer<1 or (o->>'y')::integer<1 or (o->>'x')::integer>(s->>'width')::integer or (o->>'y')::integer>(s->>'height')::integer then raise exception 'Objeto fora dos limites';end if;
 if exists(select 1 from public.objects where id=(o->>'id')::uuid and room_id<>rid) then raise exception 'Objeto pertence a outra sala';end if;
 insert into public.objects values((o->>'id')::uuid,rid,o->>'kind',o->>'icon',(o->>'x')::integer,(o->>'y')::integer,o->>'color') on conflict(id) do update set kind=excluded.kind,icon=excluded.icon,x=excluded.x,y=excluded.y,color=excluded.color;
 if jsonb_typeof(o->'attributes') is distinct from 'array' then raise exception 'Lista de atributos inválida';end if;
 if (select count(*) from jsonb_array_elements(o->'attributes'))<>(select count(distinct e->>'id') from jsonb_array_elements(o->'attributes') e) then raise exception 'Atributos duplicados ou sem identificador';end if;
 if jsonb_array_length(o->'attributes')>100 then raise exception 'Limite de atributos excedido';end if;
 delete from public.attributes where object_id=(o->>'id')::uuid and id not in(select (e->>'id')::uuid from jsonb_array_elements(o->'attributes') e);
 for a in select * from jsonb_array_elements(o->'attributes') loop
  if exists(select 1 from public.attributes where id=(a->>'id')::uuid and object_id<>(o->>'id')::uuid) then raise exception 'Atributo pertence a outro objeto';end if;
  insert into public.attributes values((a->>'id')::uuid,(o->>'id')::uuid,a->>'name',a->>'type',a->'value',a->>'visibility',a->>'edit_role') on conflict(id) do update set name=excluded.name,type=excluded.type,value=excluded.value,visibility=excluded.visibility,edit_role=excluded.edit_role;
 end loop;
end loop;end$$;

create function public.save_room(p_room jsonb,p_expected integer,p_label text default 'Sala atualizada',p_confirm_delete boolean default false) returns integer language plpgsql security definer set search_path='' as $$declare r public.rooms;b jsonb;v integer;rid uuid:=(p_room->>'id')::uuid;w uuid:=(p_room->>'workspace_id')::uuid;begin
if p_expected is null then raise exception 'Versão obrigatória';end if;
-- Lock workspace serializes creation/import and all room mutations, including undo.
perform 1 from public.workspaces where id=w for update;
if app_private.role(w) not in ('teacher','admin') or app_private.role(w) is null then raise exception 'Sem permissão';end if;
select * into r from public.rooms where id=rid for update;
if r.id is null then
 if p_expected<>0 or exists(select 1 from public.change_history where room_id=rid) or (p_room->>'owner_id')::uuid<>auth.uid() then raise exception 'Nova sala inválida';end if;
 v:=1;
else
 if r.workspace_id<>w or (p_room->>'owner_id')::uuid<>r.owner_id or not app_private.manage(rid) then raise exception 'Sem permissão';end if;
 if r.version<>p_expected then raise exception 'Conflito: a sala foi alterada. Recarregue antes de salvar.';end if;
 if not coalesce(p_confirm_delete,false) and exists(select 1 from public.objects where room_id=rid and id not in(select (e->>'id')::uuid from jsonb_array_elements(p_room->'objects') e)) then raise exception 'Confirme explicitamente a exclusão de objetos';end if;
 b:=app_private.snapshot(rid);v:=r.version+1;
end if;
perform app_private.write_snapshot(p_room,v);
insert into public.change_history(workspace_id,room_id,actor_id,label,before,after,result_version) values(w,rid,auth.uid(),left(p_label,200),b,app_private.snapshot(rid),v);return v;end$$;
create function public.save_attribute(p_id uuid,p_value jsonb,p_expected integer) returns integer language plpgsql security definer set search_path='' as $$declare a public.attributes;r public.rooms;b jsonb;begin
if p_expected is null then raise exception 'Versão obrigatória';end if;
select * into a from public.attributes where id=p_id;
select rm.* into r from public.rooms rm join public.objects o on o.room_id=rm.id where o.id=a.object_id;
perform 1 from public.workspaces where id=r.workspace_id for update;
select * into r from public.rooms where id=r.id for update;
-- Re-read after acquiring lock.
select * into a from public.attributes where id=p_id;
if a.id is null or not(coalesce(app_private.manage(r.id),false) or coalesce(app_private.role(r.workspace_id)='teacher' and a.edit_role='teacher',false)) then raise exception 'Sem permissão';end if;
if r.version<>p_expected then raise exception 'Conflito: recarregue a sala';end if;
b:=app_private.snapshot(r.id);
update public.attributes set value=p_value where id=p_id;
update public.rooms set version=version+1 where id=r.id;
insert into public.change_history(workspace_id,room_id,actor_id,label,before,after,result_version) values(r.workspace_id,r.id,auth.uid(),'Atributo atualizado',b,app_private.snapshot(r.id),r.version+1);return r.version+1;end$$;
create function public.delete_room(p_id uuid,p_expected integer) returns void language plpgsql security definer set search_path='' as $$declare r public.rooms;b jsonb;begin
if p_expected is null then raise exception 'Versão obrigatória';end if;
select * into r from public.rooms where id=p_id;
perform 1 from public.workspaces where id=r.workspace_id for update;
select * into r from public.rooms where id=p_id for update;
if not coalesce(app_private.manage(p_id),false) then raise exception 'Sem permissão';end if;
if r.version<>p_expected then raise exception 'Conflito: recarregue a sala';end if;
b:=app_private.snapshot(p_id);
delete from public.rooms where id=p_id;
insert into public.change_history(workspace_id,room_id,actor_id,label,before,after,result_version) values(r.workspace_id,p_id,auth.uid(),'Sala excluída',b,null,r.version+1);end$$;
create function public.undo_change(p_id uuid) returns void language plpgsql security definer set search_path='' as $$declare h public.change_history;r public.rooms;current_s jsonb;target jsonb;v integer;a jsonb;o jsonb;changed integer:=0;oi integer;ai integer;begin
select * into h from public.change_history where id=p_id;
perform 1 from public.workspaces where id=h.workspace_id for update;
if app_private.role(h.workspace_id) not in ('teacher','admin') or app_private.role(h.workspace_id) is null then raise exception 'Sem permissão';end if;
select * into r from public.rooms where id=h.room_id for update;
current_s:=app_private.snapshot(h.room_id);
-- Compare exact shared snapshot/version. Any subsequent mutation is a conflict.
if current_s is distinct from h.after or exists(select 1 from public.change_history where room_id=h.room_id and result_version>h.result_version) then raise exception 'Conflito: existem alterações posteriores';end if;
v:=h.result_version+1;target:=h.before;
if not (app_private.role(h.workspace_id)='admin' or (coalesce(r.owner_id,(h.before->>'owner_id')::uuid)=auth.uid() and app_private.role(h.workspace_id)='teacher')) then
 -- Non-owner teachers may undo only the single editable value, never structure/metadata.
 target:=current_s;
 if h.label<>'Atributo atualizado' then raise exception 'Sem permissão para desfazer esta operação';end if;
 for o in select * from jsonb_array_elements(h.before->'objects') loop
  for a in select * from jsonb_array_elements(o->'attributes') loop
   if exists(select 1 from public.attributes where id=(a->>'id')::uuid and value is distinct from a->'value') then
    if not exists(select 1 from public.attributes where id=(a->>'id')::uuid and edit_role='teacher') then raise exception 'Sem permissão';end if;changed:=changed+1;
   end if;
  end loop;
 end loop;
 for oi in 0..jsonb_array_length(target->'objects')-1 loop
  for ai in 0..jsonb_array_length(target->'objects'->oi->'attributes')-1 loop
   select old_a into a from jsonb_array_elements(h.before->'objects') old_o cross join lateral jsonb_array_elements(old_o->'attributes') old_a where old_a->>'id'=target->'objects'->oi->'attributes'->ai->>'id';
   if a is not null then target:=jsonb_set(target,array['objects',oi::text,'attributes',ai::text,'value'],a->'value');end if;
  end loop;
 end loop;
 if changed<>1 or (target-'version') is distinct from (h.before-'version') then raise exception 'Reversão inválida';end if;
end if;
if target is null then delete from public.rooms where id=h.room_id;else perform app_private.write_snapshot(target,v);end if;
insert into public.change_history(workspace_id,room_id,actor_id,label,before,after,result_version) values(h.workspace_id,h.room_id,auth.uid(),'Desfeito: '||h.label,current_s,app_private.snapshot(h.room_id),v);end$$;

-- Remove implicit PUBLIC execution, including private definer helpers.
revoke execute on all functions in schema app_private from public;
revoke execute on all functions in schema public from public;
grant execute on function public.create_workspace(text),public.update_workspace(uuid,text),public.set_member(uuid,uuid,text),public.create_invite(uuid,text,integer,integer),public.list_invites(uuid),public.revoke_invite(uuid),public.accept_invite(text),public.save_room(jsonb,integer,text,boolean),public.save_attribute(uuid,jsonb,integer),public.delete_room(uuid,integer),public.undo_change(uuid) to authenticated;

-- Administrators need recognizable member identities; do not expose auth.users directly.
create function public.list_members(p_workspace uuid) returns table(user_id uuid,role text,email text,display_name text) language plpgsql security definer set search_path='' as $$begin
if app_private.role(p_workspace) is distinct from 'admin' then raise exception 'Sem permissão';end if;
return query select m.user_id,m.role,u.email::text,coalesce(p.display_name,'') from public.workspace_members m join auth.users u on u.id=m.user_id left join public.profiles p on p.id=m.user_id where m.workspace_id=p_workspace;end$$;
revoke execute on function public.list_members(uuid) from public;
grant execute on function public.list_members(uuid) to authenticated;
