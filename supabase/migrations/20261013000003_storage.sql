-- Bucket de fotos dos produtos. Público para leitura (as imagens carregam
-- rápido e com cache); upload/alteração apenas por usuários ativos.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('produtos', 'produtos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "fotos: upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'produtos' and public.papel_atual() is not null);
create policy "fotos: atualizar" on storage.objects for update to authenticated
  using (bucket_id = 'produtos' and public.papel_atual() is not null);
create policy "fotos: ler" on storage.objects for select to authenticated
  using (bucket_id = 'produtos');
