module.exports = (req, res) => {
  if (req.method !== 'GET') return res.status(405).end();
  res.json({
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
  });
};
