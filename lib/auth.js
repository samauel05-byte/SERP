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
  return {
    userId: user.id,
    role: profile.role || 'user',
    access_direct: profile.access_direct !== false,
    access_cami: profile.access_cami === true,
    access_nala: profile.access_nala === true,
    portals_direct: Array.isArray(profile.portals_direct) ? profile.portals_direct : [],
  };
}

module.exports = { authenticate };
