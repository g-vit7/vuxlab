alter table public.objects
 add column width integer not null default 1 check (width between 1 and 100),
 add column height integer not null default 1 check (height between 1 and 100),
 drop constraint objects_color_check,
 add constraint objects_color_check check (color in ('gray','green','yellow','red','blue','purple'));

alter table public.profiles
 add column editor_theme text check (editor_theme in ('default','vital','contrast','coffee')),
 add column editor_mode text check (editor_mode in ('system','light','dark'));

create table public.room_view_preferences (
 user_id uuid not null default auth.uid() references auth.users on delete cascade,
 room_id uuid not null references public.rooms on delete cascade,
 turn smallint not null check (turn between 0 and 3),
 primary key (user_id,room_id)
);
alter table public.room_view_preferences enable row level security;
revoke all on public.room_view_preferences from anon, authenticated;
grant select, insert, update on public.room_view_preferences to authenticated;
create policy own_room_view on public.room_view_preferences for all to authenticated
 using (user_id=auth.uid() and app_private.room_access(room_id) is not null)
 with check (user_id=auth.uid() and app_private.room_access(room_id) is not null);

-- Omit one-cell defaults so pre-migration history still matches the live room.
create or replace function app_private.snapshot(r uuid) returns jsonb language sql stable security definer set search_path='' as $$
select to_jsonb(rm)||jsonb_build_object('objects',coalesce((select jsonb_agg((to_jsonb(o)-'room_id'-'width'-'height') ||
  (case when o.width=1 then '{}'::jsonb else jsonb_build_object('width',o.width) end) ||
  (case when o.height=1 then '{}'::jsonb else jsonb_build_object('height',o.height) end) ||jsonb_build_object('attributes',coalesce((select jsonb_agg(to_jsonb(a)-'object_id' order by a.id) from public.attributes a where a.object_id=o.id),'[]'::jsonb)) order by o.id) from public.objects o where o.room_id=rm.id),'[]'::jsonb)) from public.rooms rm where rm.id=r$$;
create or replace function app_private.write_snapshot(s jsonb,v integer) returns void language plpgsql security definer set search_path='' as $$declare o jsonb;a jsonb;rid uuid:=(s->>'id')::uuid;begin
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
 if (o->>'x')::integer not between 1 and (s->>'width')::integer
  or (o->>'y')::integer not between 1 and (s->>'height')::integer
  or coalesce((o->>'width')::integer,1) not between 1 and ((s->>'width')::integer-(o->>'x')::integer+1)
  or coalesce((o->>'height')::integer,1) not between 1 and ((s->>'height')::integer-(o->>'y')::integer+1)
 then raise exception 'Objeto fora dos limites';end if;
 if exists (
  select 1 from public.objects existing
  where existing.room_id=rid and existing.id<>(o->>'id')::uuid
   and int4range(existing.x,existing.x+existing.width) &&
       int4range((o->>'x')::integer,(o->>'x')::integer+coalesce((o->>'width')::integer,1))
   and int4range(existing.y,existing.y+existing.height) &&
       int4range((o->>'y')::integer,(o->>'y')::integer+coalesce((o->>'height')::integer,1))
 ) then raise exception 'Objetos sobrepostos';end if;
 if exists(select 1 from public.objects where id=(o->>'id')::uuid and room_id<>rid) then raise exception 'Objeto pertence a outra sala';end if;
 insert into public.objects(id,room_id,kind,icon,x,y,color,width,height)
 values((o->>'id')::uuid,rid,o->>'kind',o->>'icon',(o->>'x')::integer,(o->>'y')::integer,o->>'color',
   coalesce((o->>'width')::integer,1),coalesce((o->>'height')::integer,1))
 on conflict(id) do update set kind=excluded.kind,icon=excluded.icon,x=excluded.x,y=excluded.y,
  color=excluded.color,width=excluded.width,height=excluded.height;
 if jsonb_typeof(o->'attributes') is distinct from 'array' then raise exception 'Lista de atributos inválida';end if;
 if (select count(*) from jsonb_array_elements(o->'attributes'))<>(select count(distinct e->>'id') from jsonb_array_elements(o->'attributes') e) then raise exception 'Atributos duplicados ou sem identificador';end if;
 if jsonb_array_length(o->'attributes')>100 then raise exception 'Limite de atributos excedido';end if;
 delete from public.attributes where object_id=(o->>'id')::uuid and id not in(select (e->>'id')::uuid from jsonb_array_elements(o->'attributes') e);
 for a in select * from jsonb_array_elements(o->'attributes') loop
  if exists(select 1 from public.attributes where id=(a->>'id')::uuid and object_id<>(o->>'id')::uuid) then raise exception 'Atributo pertence a outro objeto';end if;
  insert into public.attributes values((a->>'id')::uuid,(o->>'id')::uuid,a->>'name',a->>'type',a->'value',a->>'visibility',a->>'edit_role') on conflict(id) do update set name=excluded.name,type=excluded.type,value=excluded.value,visibility=excluded.visibility,edit_role=excluded.edit_role;
 end loop;
end loop;end$$;

