import { BigQuery } from '@google-cloud/bigquery';

const TOOLS = [
  {
    name: 'query_analytics',
    description: 'Query Google Analytics data from BigQuery. Use this to answer questions about website traffic, user behavior, popular pages, events, and geographic data.',
    input_schema: {
      type: 'object',
      properties: {
        metric: {
          type: 'string',
          enum: ['pageviews', 'top_pages', 'top_events', 'countries', 'custom'],
          description: 'The type of metric to query. Use "custom" to write your own SQL.',
        },
        days: {
          type: 'number',
          description: 'Number of days to look back. Default 30.',
        },
        custom_sql: {
          type: 'string',
          description: 'Custom BigQuery SQL to run. Only used when metric is "custom". Use the table pattern `{PROJECT}.{DATASET}.events_*` with _TABLE_SUFFIX filter.',
        },
      },
      required: ['metric'],
    },
  },
];

const PRESET_QUERIES = {
  pageviews: (project, dataset, days) => `
    SELECT
      event_date,
      COUNT(*) as pageviews,
      COUNT(DISTINCT user_pseudo_id) as unique_users
    FROM \`${project}.${dataset}.events_*\`
    WHERE _TABLE_SUFFIX >= FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL ${days} DAY))
      AND event_name = 'page_view'
    GROUP BY event_date
    ORDER BY event_date DESC
  `,
  top_pages: (project, dataset, days) => `
    SELECT
      (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location') as page,
      COUNT(*) as views
    FROM \`${project}.${dataset}.events_*\`
    WHERE _TABLE_SUFFIX >= FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL ${days} DAY))
      AND event_name = 'page_view'
    GROUP BY page
    ORDER BY views DESC
    LIMIT 20
  `,
  top_events: (project, dataset, days) => `
    SELECT
      event_name,
      COUNT(*) as count
    FROM \`${project}.${dataset}.events_*\`
    WHERE _TABLE_SUFFIX >= FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL ${days} DAY))
    GROUP BY event_name
    ORDER BY count DESC
    LIMIT 20
  `,
  countries: (project, dataset, days) => `
    SELECT
      geo.country,
      COUNT(DISTINCT user_pseudo_id) as users
    FROM \`${project}.${dataset}.events_*\`
    WHERE _TABLE_SUFFIX >= FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL ${days} DAY))
      AND event_name = 'page_view'
    GROUP BY geo.country
    ORDER BY users DESC
    LIMIT 20
  `,
};

async function runQuery(sql) {
  const raw = process.env.GOOGLE_CREDENTIALS;
  if (!raw) throw new Error('GOOGLE_CREDENTIALS env var not set');
  const credentials = JSON.parse(raw);
  const bq = new BigQuery({ credentials, projectId: credentials.project_id });
  const [rows] = await bq.query(sql);
  return rows;
}

async function handleToolCall(toolInput) {
  const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
  const project = credentials.project_id;
  const dataset = process.env.GA4_BIGQUERY_DATASET;
  if (!dataset) throw new Error('GA4_BIGQUERY_DATASET env var not set');

  const days = Math.min(parseInt(toolInput.days) || 30, 90);
  let sql;

  if (toolInput.metric === 'custom') {
    if (!toolInput.custom_sql) throw new Error('custom_sql required when metric is "custom"');
    sql = toolInput.custom_sql
      .replace('{PROJECT}', project)
      .replace('{DATASET}', dataset);
  } else {
    const builder = PRESET_QUERIES[toolInput.metric];
    if (!builder) throw new Error(`Unknown metric: ${toolInput.metric}`);
    sql = builder(project, dataset, days);
  }

  const rows = await runQuery(sql);
  return { metric: toolInput.metric, days, rows };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { message, history = [], password } = req.body || {};

  const expectedPassword = process.env.ANALYTICS_PASSWORD;
  if (expectedPassword && password !== expectedPassword) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!message) return res.status(400).json({ error: 'Missing message' });

  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'ANTHROPIC_API_KEY not set' });
  if (!process.env.GOOGLE_CREDENTIALS) return res.status(503).json({ error: 'GOOGLE_CREDENTIALS not set' });
  if (!process.env.GA4_BIGQUERY_DATASET) return res.status(503).json({ error: 'GA4_BIGQUERY_DATASET not set' });

  const messages = [
    ...history,
    { role: 'user', content: message },
  ];

  const system = `You are an analytics assistant for Spectate Esports (spectate.gg), a Dota 2 match tracking website.
You have access to real Google Analytics data via BigQuery. When the user asks about traffic, users, page views, events, or any website analytics, use the query_analytics tool to fetch live data before answering.
Always query fresh data rather than guessing. Be specific with numbers. Format numbers with commas. When showing tables, use plain text formatting.
The website tracks Dota 2 matches, tournaments, and esports content.`;

  try {
    let claudeMessages = [...messages];

    // Agentic loop — Claude can call tools multiple times
    for (let i = 0; i < 5; i++) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          system,
          tools: TOOLS,
          messages: claudeMessages,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        return res.status(502).json({ error: data.error?.message || 'Claude API error' });
      }

      // Add assistant message to history
      claudeMessages.push({ role: 'assistant', content: data.content });

      // If Claude is done (no tool use), return the text response
      if (data.stop_reason === 'end_turn') {
        const text = data.content.find(b => b.type === 'text')?.text || '';
        return res.status(200).json({ reply: text, history: claudeMessages });
      }

      // Handle tool calls
      if (data.stop_reason === 'tool_use') {
        const toolResults = [];

        for (const block of data.content) {
          if (block.type !== 'tool_use') continue;

          let toolResult;
          try {
            const result = await handleToolCall(block.input);
            toolResult = { type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) };
          } catch (err) {
            toolResult = { type: 'tool_result', tool_use_id: block.id, content: `Error: ${err.message}`, is_error: true };
          }

          toolResults.push(toolResult);
        }

        claudeMessages.push({ role: 'user', content: toolResults });
      }
    }

    return res.status(500).json({ error: 'Max tool iterations reached' });
  } catch (err) {
    console.error('Analytics chat error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
