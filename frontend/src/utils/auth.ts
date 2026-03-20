export const ADMIN_TOKEN_KEY = 'nicefk-admin-token';
export const AGENT_TOKEN_KEY = 'nicefk-agent-token';
export const AGENT_CODE_KEY = 'nicefk-agent-code';
export const CHANNEL_CODE_KEY = 'nicefk-channel-code';

export function readAdminToken() {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function readAgentToken() {
  return localStorage.getItem(AGENT_TOKEN_KEY);
}

export function clearAdminSession() {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
}

export function clearAgentSession() {
  localStorage.removeItem(AGENT_TOKEN_KEY);
}
