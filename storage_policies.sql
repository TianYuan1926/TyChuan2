-- storage_policies.sql
drop policy if exists "receipt_read"   on storage.objects;
drop policy if exists "receipt_insert" on storage.objects;
drop policy if exists "receipt_update" on storage.objects;
drop policy if exists "receipt_delete" on storage.objects;
create policy "receipt_read"   on storage.objects for select using (bucket_id = 'receipts');
create policy "receipt_insert" on storage.objects for insert with check (bucket_id = 'receipts');
create policy "receipt_update" on storage.objects for update using (bucket_id = 'receipts');
create policy "receipt_delete" on storage.objects for delete using (bucket_id = 'receipts');
