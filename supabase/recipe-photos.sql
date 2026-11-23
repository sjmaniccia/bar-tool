-- ===== recipe-photos.sql =====
-- Pictures of recipes (cut out of scanned recipe pages, or taken on the recipe page).
-- Run once in the Supabase SQL Editor, after schema.sql.
--
-- The idea:
--     a Supabase Storage "bucket" called recipe-photos holds the pictures
--     each place has its own folder: recipe-photos/<place id>/<random name>.jpg
--     the pictures are PUBLIC to read (so they load fast anywhere, with no sign-in
--     link that expires), but the file names are random, so nobody can list or guess them
--     only owners and managers of a place can add, replace or delete its pictures
--     each picture is at most 2 MB, and only JPEG, PNG or WebP
-- Photos of drinks and dishes aren't secret; if a place ever needs them private, switch
-- the bucket to private and show them with signed links instead (FIXME if asked).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recipe-photos', 'recipe-photos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- The place a file belongs to: the first folder in its name, if it's a valid id
create or replace function public.photo_place(object_name text) returns uuid
language plpgsql immutable set search_path = ''
as $$
begin
    return split_part(object_name, '/', 1)::uuid;
exception when others then
    return null;
end;
$$;

create policy "managers add recipe photos" on storage.objects
    for insert to authenticated
    with check (bucket_id = 'recipe-photos' and public.my_role(public.photo_place(name)) in ('owner', 'manager'));

create policy "managers change recipe photos" on storage.objects
    for update to authenticated
    using (bucket_id = 'recipe-photos' and public.my_role(public.photo_place(name)) in ('owner', 'manager'));

create policy "managers delete recipe photos" on storage.objects
    for delete to authenticated
    using (bucket_id = 'recipe-photos' and public.my_role(public.photo_place(name)) in ('owner', 'manager'));
