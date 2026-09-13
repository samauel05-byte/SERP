const supabase = require('./supabase');

async function authenticate(req) {
  const auth = req.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) return null;
  const jwt = auth.slice(7);
  const { data: { user }, error } = await supabase.auth.getUser(jwt);
  if (error || !user) return null;
  const { data: profile } = await supabase
    .from('direct_profiles')
    .select('role, access_direct, access_cami, access_nala, portals_direct')
    .eq('id', user.id)
    .maybeSingle();
  // A valid Supabase account without an application profile must not gain
  // access to the application APIs.
  if (!profile) return null;
  const { data: moduleProfile, error: moduleError } = await supabase
    .from('direct_profiles')
    .select('access_ir2, access_estimacion, access_clientes')
    .eq('id', user.id)
    .maybeSingle();
  const modules = moduleError ? {
    access_ir2: profile.access_cami === true,
    access_estimacion: profile.access_cami === true,
    access_clientes: true,
  } : moduleProfile;
  const suppliedSessionId = req.headers['x-direct-session'];
  const { data: activeSession, error: sessionError } = await supabase
    .from('direct_active_sessions')
    .select('session_id')
    .eq('user_id', user.id)
    .maybeSingle();
  // Before the migration this table does not exist. Preserve access to the
  // established application, but once it is available a missing or mismatched
  // browser session immediately invalidates the older browser.
  if (!sessionError && activeSession && activeSession.session_id !== suppliedSessionId) return null;
  const { data: tenantProfile, error: tenantError } = await supabase
    .from('direct_profiles')
    .select('tenant_id')
    .eq('id', user.id)
    .maybeSingle();
  // A missing column means an older database. New tenant-only routes fail
  // closed until the migration has been applied.
  const tenantId = tenantError ? null : tenantProfile?.tenant_id || null;
  return {
    userId: user.id,
    role: profile.role || 'user',
    access_direct: profile.access_direct !== false,
    access_cami: profile.access_cami === true,
    access_nala: profile.access_nala === true,
    access_ir2: modules.access_ir2 === true,
    access_estimacion: modules.access_estimacion === true,
    access_clientes: modules.access_clientes !== false,
    portals_direct: Array.isArray(profile.portals_direct) ? profile.portals_direct : [],
    tenantId,
  };
}

module.exports = { authenticate };
