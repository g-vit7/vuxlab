-- Store the optional presentation name where the existing profile and member views read it.
create function app_private.create_signup_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  signup_name text;
begin
  if jsonb_typeof(new.raw_user_meta_data -> 'display_name') = 'string' then
    signup_name := left(btrim(new.raw_user_meta_data ->> 'display_name'), 100);
    if signup_name <> '' then
      insert into public.profiles (id, display_name)
      values (new.id, signup_name)
      on conflict (id) do nothing;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function app_private.create_signup_profile() from public, anon, authenticated;

create trigger vuxlab_create_signup_profile
after insert on auth.users
for each row execute function app_private.create_signup_profile();
