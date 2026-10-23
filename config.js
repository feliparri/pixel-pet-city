// Realtime settings. Fill both values from the Supabase dashboard (Project settings > API): the project URL and the "anon" public key.
// The anon key is meant to be public; NEVER put a service_role key here (the app refuses one).
// Left as is, the town says it is not configured and only offers the local mode (tabs of the same browser).
export default {
  supabaseUrl: 'https://cyzsawujfcfrorntugrm.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN5enNhd3VqZmNmcm9ybnR1Z3JtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI3NTk1NjQsImV4cCI6MjEwODMzNTU2NH0.lwI32teT8ALW9EPkChTaQmclgdawlWziX1WAja5t1ho',
};
