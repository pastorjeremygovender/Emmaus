const MEMBER_APP_USER_AGENT = 'EmmausMemberApp';

export function isMemberAppUserAgent(userAgent: string): boolean {
  return userAgent.includes(MEMBER_APP_USER_AGENT);
}

export function isMemberAppRuntime(): boolean {
  return typeof navigator !== 'undefined' && isMemberAppUserAgent(navigator.userAgent);
}

export { MEMBER_APP_USER_AGENT };
