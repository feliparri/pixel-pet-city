// Realtime settings. Fill both values from the Supabase dashboard (Project settings > API): the project URL and the "anon" public key.
// The anon key is meant to be public; NEVER put a service_role key here (the app refuses one).
// Left as is, the town says it is not configured and only offers the local mode (tabs of the same browser).
export default {
  supabaseUrl: 'https://YOUR-PROJECT.supabase.co',
  supabaseAnonKey: 'YOUR-ANON-KEY',
};
