alter table public.private_notes add column resolved boolean not null default false;
alter table public.shared_notes add column resolved boolean not null default false;

-- The existing update policies still limit this action to the author or
-- (for shared notes only) an administrator of the workspace.
grant update (resolved) on public.shared_notes to authenticated;
