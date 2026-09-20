/**
 * Privileged demo shortcuts are development/testing conveniences only.
 * Legitimate admin sign-in and authorization are handled elsewhere and are
 * intentionally unaffected by this visibility rule.
 */
export function shouldShowPrivilegedDemoShortcuts(
  demoMode: boolean,
  production = import.meta.env.PROD,
): boolean {
  return demoMode && !production;
}