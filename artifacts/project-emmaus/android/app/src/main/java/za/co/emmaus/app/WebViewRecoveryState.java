package za.co.emmaus.app;

/**
 * Tracks one WebView document recovery cycle independently from individual
 * navigation callbacks. A recovery-triggered load can emit onPageStarted
 * repeatedly, so those callbacks must not reset the attempt budget.
 */
final class WebViewRecoveryState {
    private final int maxAttempts;
    private int attempts;
    private boolean recoveryCycleActive;
    private boolean recoveryScheduled;
    private boolean pageCommitted;
    private boolean fallbackShown;

    WebViewRecoveryState(int maxAttempts) {
        if (maxAttempts < 1) {
            throw new IllegalArgumentException("maxAttempts must be positive");
        }
        this.maxAttempts = maxAttempts;
    }

    void onPageStarted() {
        pageCommitted = false;
        if (!recoveryCycleActive) {
            attempts = 0;
        }
    }

    boolean shouldHandleFailure(boolean isForMainFrame) {
        return isForMainFrame
            && !pageCommitted
            && !recoveryScheduled
            && !fallbackShown;
    }

    boolean scheduleRecovery(boolean isForMainFrame) {
        if (!isForMainFrame
                || pageCommitted
                || recoveryScheduled
                || fallbackShown
                || attempts >= maxAttempts) {
            return false;
        }
        recoveryScheduled = true;
        return true;
    }

    int beginRecoveryLoad() {
        if (!recoveryScheduled || pageCommitted || fallbackShown || attempts >= maxAttempts) {
            return -1;
        }
        recoveryScheduled = false;
        recoveryCycleActive = true;
        attempts++;
        return attempts;
    }

    boolean shouldShowFallback() {
        return !pageCommitted && !fallbackShown && attempts >= maxAttempts;
    }

    boolean isFallbackShown() {
        return fallbackShown;
    }

    void markFallbackShown() {
        fallbackShown = true;
        recoveryScheduled = false;
    }

    void onVisibleCommit() {
        pageCommitted = true;
        recoveryCycleActive = false;
        recoveryScheduled = false;
        fallbackShown = false;
        attempts = 0;
    }

    boolean isPageCommitted() {
        return pageCommitted;
    }

    boolean isRecoveryScheduled() {
        return recoveryScheduled;
    }
}