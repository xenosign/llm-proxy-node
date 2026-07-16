const supabase = require('../supabase/client');

function invalidApiKeyResponse(res, message) {
  return res.status(401).json({
    error: {
      message,
      type: 'invalid_request_error',
      param: null,
      code: 'invalid_api_key',
    },
  });
}

async function auth(req, res, next) {
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return invalidApiKeyResponse(
      res,
      "You didn't provide an API key. You need to provide your API key in an Authorization header using Bearer auth (i.e. Authorization: Bearer YOUR_KEY)."
    );
  }

  const { data: team, error } = await supabase
    .from('teams')
    .select('*')
    .eq('proxy_token', token)
    .single();

  if (error || !team) {
    return invalidApiKeyResponse(res, `Incorrect API key provided: ${token}.`);
  }

  req.team = team;
  next();
}

module.exports = auth;
