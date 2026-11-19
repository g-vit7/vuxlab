alter table public.private_notes
  add column title text not null default '' check (length(title) <= 120),
  add column category text not null default 'reminder' check (category in ('reminder','warning','critical')),
  add column noted_at timestamptz;
alter table public.private_notes alter column noted_at set default now();

create table public.shared_notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces on delete cascade,
  room_id uuid references public.rooms on delete cascade,
  object_id uuid references public.objects on delete cascade,
  author_id uuid default auth.uid() references auth.users on delete set null,
  author_name text,
  title text not null check (length(btrim(title)) between 1 and 120),
  body text not null,
  category text not null default 'reminder' check (category in ('reminder','warning','critical')),
  noted_at timestamptz default now(),
  legacy_visibility text not null default 'public' check (legacy_visibility in ('public','teacher','admin')),
  check (object_id is null or room_id is not null)
);
create index shared_notes_workspace_room on public.shared_notes(workspace_id, room_id, id);
create index shared_notes_object on public.shared_notes(object_id);
alter table public.shared_notes enable row level security;

create policy shared_notes_read on public.shared_notes for select to authenticated
using (
  app_private.note_access(workspace_id,room_id,object_id)
  and (
    legacy_visibility = 'public'
    or app_private.role(workspace_id) = 'admin'
    or (legacy_visibility = 'teacher' and app_private.role(workspace_id) = 'teacher')
  )
);
create policy shared_notes_create on public.shared_notes for insert to authenticated
with check (
  author_id = auth.uid()
  and app_private.note_access(workspace_id,room_id,object_id)
  and app_private.role(workspace_id) in ('teacher','admin')
);
create policy shared_notes_edit on public.shared_notes for update to authenticated
using (app_private.note_access(workspace_id,room_id,object_id) and (author_id = auth.uid() or app_private.role(workspace_id) = 'admin'))
with check (app_private.note_access(workspace_id,room_id,object_id) and (author_id = auth.uid() or app_private.role(workspace_id) = 'admin'));
create policy shared_notes_delete on public.shared_notes for delete to authenticated
using (app_private.note_access(workspace_id,room_id,object_id) and (author_id = auth.uid() or app_private.role(workspace_id) = 'admin'));

revoke all on public.shared_notes from public, anon, authenticated;
grant select, delete on public.shared_notes to authenticated;
grant insert (workspace_id,room_id,object_id,title,body,category,noted_at) on public.shared_notes to authenticated;
grant update (title,body,category,noted_at) on public.shared_notes to authenticated;

create function app_private.set_shared_note_author_name() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.author_id is not null then
    select nullif(display_name,'') into new.author_name from public.profiles where id = new.author_id;
  end if;
  return new;
end;
$$;
revoke all on function app_private.set_shared_note_author_name() from public, anon, authenticated;
create trigger shared_note_author_name before insert on public.shared_notes
for each row execute function app_private.set_shared_note_author_name();

-- The legacy attribute stays in old exports and history. Copy each entry while
-- retaining its visibility and leaving unknown authors and dates unset.
create function app_private.copy_legacy_shared_note(p_object uuid,p_values jsonb,p_visibility text) returns void
language sql security definer set search_path = '' as $$
  insert into public.shared_notes(workspace_id,room_id,object_id,author_id,title,body,noted_at,legacy_visibility)
  select r.workspace_id,r.id,o.id,null,
    coalesce(nullif(left(btrim(split_part(n.body,chr(10),1)),120),''),'Nota anterior'),
    n.body,null,p_visibility
  from public.objects o join public.rooms r on r.id=o.room_id
  cross join lateral jsonb_array_elements(p_values) entry(value)
  cross join lateral (select case when jsonb_typeof(entry.value)='string' then entry.value #>> '{}' else entry.value::text end as body) n
  where o.id=p_object and btrim(n.body)<>'';
$$;
revoke all on function app_private.copy_legacy_shared_note(uuid,jsonb,text) from public, anon, authenticated;

select app_private.copy_legacy_shared_note(object_id,value,visibility)
from public.attributes where name='Notas compartilhadas' and type='list';

-- Old room JSON imports may still carry the original attribute.
create function app_private.copy_imported_shared_notes() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.copy_legacy_shared_note(new.object_id,new.value,new.visibility);
  return new;
end;
$$;
revoke all on function app_private.copy_imported_shared_notes() from public, anon, authenticated;
create trigger copy_imported_shared_notes after insert on public.attributes
for each row
when (new.name='Notas compartilhadas' and new.type='list')
execute function app_private.copy_imported_shared_notes();
