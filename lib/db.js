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
  async upsertCredentials(batch) {
    const now = Date.now();
    const rows = batch.map(c => ({ id: c.id, institution: c.institution, category: c.category || 'acceso', iv: c.iv, ct: c.ct, updated_at: now }));
    // Supabase upsert in chunks of 200 to avoid payload limits
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await supabase.from('direct_credentials').upsert(rows.slice(i, i + 200));
      if (error) throw error;
    }
    return rows.length;
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
