let applicationReady = false;

export function isApplicationReady(): boolean {
  return applicationReady;
}

export function markApplicationReady(): void {
  applicationReady = true;
}