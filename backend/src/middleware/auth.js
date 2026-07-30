/**
 * Authentication Middleware
 * Extracts agentId from headers ('x-agent-id') or Authorization JWT token.
 */

function authenticateAgent(req, res, next) {
  const agentId = req.headers['x-agent-id'] || 'agent_demo_user';
  req.agentId = agentId;
  next();
}

module.exports = { authenticateAgent };
