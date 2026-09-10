const supabase = require('./supabase');

const db = {
  async getCredentials() {
    const { data, error } = await supabase.from('direct_credentials').select('*').order('updated_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },
  async upsertCredential(id, institution, category, iv, ct, updated_at) {
    const { error } = await supabase.from('direct_credentials').upsert({ id, institution, category, iv, ct, updated_at });
    if (error) throw error;
  },
  async deleteCredential(id) {
    const { error } = await supabase.from('direct_credentials').delete().eq('id', id);
    if (error) throw error;
  },
  async getCredentialsSince(since) {
    const { data, error } = await supabase.from('direct_credentials').select('*').gt('updated_at', since).order('updated_at');
    if (error) throw error;
    return data || [];
  },
  async getConfig() {
    const { data, error } = await supabase.from('direct_config').select('key, value');
    if (error) throw error;
    const config = {};
    for (const r of (data || [])) config[r.key] = r.value;
    return config;
  },
  async setConfig(key, value) {
    const { error } = await supabase.from('direct_config').upsert({ key, value });
    if (error) throw error;
  },
};

module.exports = db;
