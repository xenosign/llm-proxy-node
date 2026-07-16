const supabase = require('../supabase/client');

async function recordUsage(teamId, tokens) {
  if (!tokens) return;

  const { error } = await supabase.rpc('record_usage', {
    p_team_id: teamId,
    p_tokens: tokens,
  });

  if (error) {
    console.error(`Failed to record usage for team ${teamId}:`, error.message);
  }
}

module.exports = { recordUsage };
