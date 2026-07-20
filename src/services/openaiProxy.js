const env = require('../config/env');
const { recordUsage } = require('./usage');
const { costForUsage } = require('./pricing');

const OPENAI_BASE_URL = 'https://api.openai.com';

const REQUEST_HEADERS_TO_DROP = new Set(['host', 'connection', 'content-length', 'accept-encoding', 'authorization']);
const RESPONSE_HEADERS_TO_DROP = new Set(['content-length', 'content-encoding', 'transfer-encoding', 'connection']);

function resolveOpenaiApiKey(team) {
  return (team && env.teamOpenaiKeys[team.login_id]) || env.openaiApiKey;
}

function buildUpstreamHeaders(req) {
  const headers = {};

  for (const [key, value] of Object.entries(req.headers)) {
    if (REQUEST_HEADERS_TO_DROP.has(key.toLowerCase())) continue;
    headers[key] = value;
  }

  headers['content-type'] = req.get('content-type') || 'application/json';
  headers['authorization'] = `Bearer ${resolveOpenaiApiKey(req.team)}`;

  return headers;
}

function copyResponseHeaders(upstreamResponse, res) {
  upstreamResponse.headers.forEach((value, key) => {
    if (RESPONSE_HEADERS_TO_DROP.has(key.toLowerCase())) return;
    res.set(key, value);
  });
}

async function proxyToOpenAI(req, res) {
  const isStreaming = req.body && req.body.stream === true;
  const isResponsesApi = req.path.startsWith('/v1/responses');
  const targetUrl = `${OPENAI_BASE_URL}${req.originalUrl}`;
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';

  const outgoingBody = { ...req.body };
  if (isStreaming && !isResponsesApi) {
    // Responses API doesn't accept stream_options and includes usage in the
    // response.completed event by default.
    outgoingBody.stream_options = { ...(outgoingBody.stream_options || {}), include_usage: true };
  }

  let upstreamResponse;
  try {
    upstreamResponse = await fetch(targetUrl, {
      method: req.method,
      headers: buildUpstreamHeaders(req),
      body: hasBody ? JSON.stringify(outgoingBody) : undefined,
    });
  } catch (err) {
    return res.status(502).json({
      error: {
        message: `Failed to reach OpenAI: ${err.message}`,
        type: 'proxy_error',
        param: null,
        code: 'upstream_unreachable',
      },
    });
  }

  if (isStreaming) {
    return handleStreamingResponse(upstreamResponse, req.team.id, res);
  }

  return handleJsonResponse(upstreamResponse, req.team.id, res);
}

async function handleJsonResponse(upstreamResponse, teamId, res) {
  const text = await upstreamResponse.text();
  res.status(upstreamResponse.status);
  copyResponseHeaders(upstreamResponse, res);

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return res.send(text);
  }

  if (parsed && parsed.usage && typeof parsed.usage.total_tokens === 'number') {
    const cost = costForUsage(parsed.model, parsed.usage);
    await recordUsage(teamId, parsed.usage.total_tokens, cost);
  }

  res.send(text);
}

async function handleStreamingResponse(upstreamResponse, teamId, res) {
  if (!upstreamResponse.ok || !upstreamResponse.body) {
    const text = await upstreamResponse.text();
    res.status(upstreamResponse.status);
    copyResponseHeaders(upstreamResponse, res);
    return res.send(text);
  }

  res.status(upstreamResponse.status);
  copyResponseHeaders(upstreamResponse, res);

  let buffer = '';
  let capturedUsage = null;
  let capturedModel = null;

  const reader = upstreamResponse.body.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      res.write(chunk);

      buffer += chunk;
      const events = buffer.split('\n\n');
      buffer = events.pop();

      for (const event of events) {
        const line = event.split('\n').find((l) => l.startsWith('data: '));
        if (!line) continue;

        const data = line.slice('data: '.length).trim();
        if (data === '[DONE]') continue;

        try {
          const json = JSON.parse(data);

          // Chat Completions / legacy Completions stream chunks carry these at the top level.
          if (json.model) capturedModel = json.model;
          if (json.usage && typeof json.usage.total_tokens === 'number') {
            capturedUsage = json.usage;
          }

          // Responses API events wrap the response object under `response`.
          if (json.response) {
            if (json.response.model) capturedModel = json.response.model;
            if (json.response.usage && typeof json.response.usage.total_tokens === 'number') {
              capturedUsage = json.response.usage;
            }
          }
        } catch {
          // malformed/partial SSE chunk, ignore
        }
      }
    }
  } finally {
    res.end();
    if (capturedUsage !== null) {
      const cost = costForUsage(capturedModel, capturedUsage);
      await recordUsage(teamId, capturedUsage.total_tokens, cost);
    }
  }
}

module.exports = { proxyToOpenAI };
