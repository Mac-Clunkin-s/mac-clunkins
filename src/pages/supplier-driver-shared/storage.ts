import { supabase } from '../../lib/supabase';

// ASSUMPTION: a private storage bucket named `documents` exists with RLS that
// only lets a user write under `<their uid>/...`. Confirm against the storage
// migration before merging.
export const DOCUMENTS_BUCKET = 'documents';

export async function uploadFile(
  file: Blob,
  userId: string,
  folder: string,
): Promise<{ path: string | null; error: string | null }> {
  const ext = (file.type.split('/')[1] || 'bin').replace(/[^a-z0-9]/gi, '');
  const path = `${userId}/${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, file, { contentType: file.type || undefined });
  return { path: error ? null : path, error: error?.message ?? null };
}
