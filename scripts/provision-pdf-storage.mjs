import { createClient } from '@supabase/supabase-js';
import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (url !== 'https://urgzsaftoiebsjkgyhsg.supabase.co' || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Expected authorized project and server credential. No changes made.');
}
const client = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const apply = process.argv.includes('--apply');
const specs = [
  { id: 'teorema-uploads', public: false, fileSizeLimit: 20971520, allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] },
  { id: 'teorema-pdfs', public: false, fileSizeLimit: 20971520, allowedMimeTypes: ['application/pdf'] },
  { id: 'teorema-covers', public: true, fileSizeLimit: 5242880, allowedMimeTypes: ['image/webp'] },
];
for (const spec of specs) {
  let { data, error } = await client.storage.getBucket(spec.id);
  if (error && !['404', '400'].includes(String(error.status))) throw new Error(`Bucket inspection failed: ${spec.id}`);
  if (!data && apply) {
    const created = await client.storage.createBucket(spec.id, { public: spec.public, fileSizeLimit: spec.fileSizeLimit, allowedMimeTypes: spec.allowedMimeTypes });
    if (created.error) throw new Error(`Bucket creation failed: ${spec.id}`);
    ({ data, error } = await client.storage.getBucket(spec.id));
  }
  if (error || !data || data.public !== spec.public || Number(data.file_size_limit) !== spec.fileSizeLimit ||
    [...(data.allowed_mime_types || [])].sort().join() !== [...spec.allowedMimeTypes].sort().join()) {
    throw new Error(`Bucket missing or configuration mismatch: ${spec.id}. Existing buckets are never automatically altered.`);
  }
  console.log(`${spec.id}: verified ${spec.public ? 'public validated covers' : 'private'}, limit ${spec.fileSizeLimit} bytes`);
}
console.log('Storage verified. No upgrade, test accounts, orders or uploads created.');
