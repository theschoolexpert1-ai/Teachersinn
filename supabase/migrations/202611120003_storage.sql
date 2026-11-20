-- Storage buckets and ownership policies. No application UI is added in Stage A.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('profile-photos', 'profile-photos', true, 5242880, array['image/jpeg','image/png','image/webp']),
  ('professional-documents', 'professional-documents', false, 10485760, array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  ('course-resources', 'course-resources', false, 26214400, array['application/pdf','image/jpeg','image/png','video/mp4']),
  ('community-attachments', 'community-attachments', false, 10485760, array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy profile_photos_insert_own
on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~ ('^' || (select auth.uid())::text || '/[A-Za-z0-9][A-Za-z0-9._-]{0,119}$')
  and lower(storage.extension(name)) in ('jpg','jpeg','png','webp')
);
create policy profile_photos_update_own
on storage.objects for update to authenticated
using (bucket_id = 'profile-photos' and owner_id = (select auth.uid())::text)
with check (bucket_id = 'profile-photos' and owner_id = (select auth.uid())::text);
create policy profile_photos_delete_own
on storage.objects for delete to authenticated
using (bucket_id = 'profile-photos' and owner_id = (select auth.uid())::text);

create policy professional_documents_read_own
on storage.objects for select to authenticated
using (bucket_id = 'professional-documents' and owner_id = (select auth.uid())::text);
create policy professional_documents_insert_own
on storage.objects for insert to authenticated
with check (
  bucket_id = 'professional-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~ ('^' || (select auth.uid())::text || '/[A-Za-z0-9][A-Za-z0-9._-]{0,119}$')
  and lower(storage.extension(name)) in ('pdf','doc','docx')
);
create policy professional_documents_update_own
on storage.objects for update to authenticated
using (bucket_id = 'professional-documents' and owner_id = (select auth.uid())::text)
with check (bucket_id = 'professional-documents' and owner_id = (select auth.uid())::text);
create policy professional_documents_delete_own
on storage.objects for delete to authenticated
using (bucket_id = 'professional-documents' and owner_id = (select auth.uid())::text);

create policy course_resources_read_authenticated
on storage.objects for select to authenticated
using (bucket_id = 'course-resources');
create policy course_resources_admin_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'course-resources' and public.is_admin()
  and name ~ '^courses/[0-9]+/[A-Za-z0-9][A-Za-z0-9._-]{0,119}$'
);
create policy course_resources_admin_update
on storage.objects for update to authenticated
using (bucket_id = 'course-resources' and public.is_admin())
with check (bucket_id = 'course-resources' and public.is_admin());
create policy course_resources_admin_delete
on storage.objects for delete to authenticated
using (bucket_id = 'course-resources' and public.is_admin());

create policy community_attachments_read_authenticated
on storage.objects for select to authenticated
using (bucket_id = 'community-attachments');
create policy community_attachments_insert_own
on storage.objects for insert to authenticated
with check (
  bucket_id = 'community-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~ ('^' || (select auth.uid())::text || '/[A-Za-z0-9][A-Za-z0-9._-]{0,119}$')
  and lower(storage.extension(name)) in ('pdf','jpg','jpeg','png','webp')
);
create policy community_attachments_update_own
on storage.objects for update to authenticated
using (bucket_id = 'community-attachments' and owner_id = (select auth.uid())::text)
with check (bucket_id = 'community-attachments' and owner_id = (select auth.uid())::text);
create policy community_attachments_delete_own
on storage.objects for delete to authenticated
using (bucket_id = 'community-attachments' and owner_id = (select auth.uid())::text);

