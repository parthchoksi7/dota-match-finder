export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { password } = req.body || {};
  const expected = process.env.ANALYTICS_PASSWORD;

  if (!expected) return res.status(503).json({ error: 'ANALYTICS_PASSWORD not configured' });
  if (password === expected) return res.status(200).json({ ok: true });

  return res.status(401).json({ error: 'Unauthorized' });
}
