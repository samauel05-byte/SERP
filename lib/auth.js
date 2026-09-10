const supabase = require('./supabase');

async function authenticate(req) {
  const auth = req.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) return null;
  const jwt = auth.slice(7);
  const { data: { user }, error } = await supabase.auth.getUser(jwt);
  if (error || !user) return null;
  const { data: profile } = await supabase
    .from('direct_profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  return { userId: user.id, role: profile?.role || 'user' };
}

module.exports = { authenticate };
