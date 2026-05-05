// This file is deprecated.
//
// /api/auth/* endpoints (register, login, me) used to live here when
// the backend issued its own JWTs. After the Supabase Auth migration
// (Phase 2.2), all auth happens client-side via @supabase/supabase-js
// and the frontend talks directly to Supabase.
//
// No longer mounted in backend/index.js. Safe to delete.
export default null;
