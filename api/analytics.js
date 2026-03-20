import { BigQuery } from '@google-cloud/bigquery';

const getCredentials = () => {
  const raw = process.env.GOOGLE_CREDENTIALS;
  if (!raw) throw new Error('GOOGLE_CREDENTIALS env var is not set');
  return JSON.parse(raw);
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { metric = 'pageviews', days = 30 } = req.query;

  try {
    const credentials = getCredentials();
    const bq = new BigQuery({
      credentials,
      projectId: credentials.project_id,
    });

    const dataset = process.env.GA4_BIGQUERY_DATASET; // e.g. analytics_123456789
    if (!dataset) throw new Error('GA4_BIGQUERY_DATASET env var is not set');

    const queries = {
      pageviews: `
        SELECT
          event_date,
          COUNT(*) as pageviews,
          COUNT(DISTINCT user_pseudo_id) as unique_users
        FROM \`${credentials.project_id}.${dataset}.events_*\`
        WHERE _TABLE_SUFFIX >= FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL ${parseInt(days)} DAY))
          AND event_name = 'page_view'
        GROUP BY event_date
        ORDER BY event_date DESC
      `,
      top_pages: `
        SELECT
          (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location') as page,
          COUNT(*) as views
        FROM \`${credentials.project_id}.${dataset}.events_*\`
        WHERE _TABLE_SUFFIX >= FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL ${parseInt(days)} DAY))
          AND event_name = 'page_view'
        GROUP BY page
        ORDER BY views DESC
        LIMIT 20
      `,
      top_events: `
        SELECT
          event_name,
          COUNT(*) as count
        FROM \`${credentials.project_id}.${dataset}.events_*\`
        WHERE _TABLE_SUFFIX >= FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL ${parseInt(days)} DAY))
        GROUP BY event_name
        ORDER BY count DESC
        LIMIT 20
      `,
      countries: `
        SELECT
          geo.country,
          COUNT(DISTINCT user_pseudo_id) as users
        FROM \`${credentials.project_id}.${dataset}.events_*\`
        WHERE _TABLE_SUFFIX >= FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL ${parseInt(days)} DAY))
          AND event_name = 'page_view'
        GROUP BY geo.country
        ORDER BY users DESC
        LIMIT 20
      `,
    };

    const sql = queries[metric];
    if (!sql) {
      return res.status(400).json({ error: `Unknown metric "${metric}". Valid: ${Object.keys(queries).join(', ')}` });
    }

    const [rows] = await bq.query(sql);
    res.status(200).json({ metric, days: parseInt(days), rows });
  } catch (err) {
    console.error('Analytics API error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
