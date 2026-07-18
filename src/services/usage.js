const supabase = require('../supabase/client');

async function recordUsage(teamId, tokens, cost) {
  if (!tokens && !cost) return;

  const { error } = await supabase.rpc('record_usage', {
    p_team_id: teamId,
    p_tokens: tokens || 0,
    p_cost: cost || 0,
  });

  if (error) {
    console.error(`Failed to record usage for team ${teamId}:`, error.message);
  }
}

module.exports = { recordUsage };
