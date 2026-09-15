package za.co.emmaus.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class WebViewRecoveryStateTest {
    @Test
    public void recoveryReloadsKeepTheAttemptBudgetBounded() {
        WebViewRecoveryState state = new WebViewRecoveryState(2);

        state.onPageStarted();
        assertTrue(state.shouldHandleFailure(true));
        assertTrue(state.scheduleRecovery(true));
        assertEquals(1, state.beginRecoveryLoad());

        state.onPageStarted();
        assertTrue(state.shouldHandleFailure(true));
        assertTrue(state.scheduleRecovery(true));
        assertEquals(2, state.beginRecoveryLoad());

        state.onPageStarted();
        assertTrue(state.shouldHandleFailure(true));
        assertFalse(state.scheduleRecovery(true));
        assertTrue(state.shouldShowFallback());
    }

    @Test
    public void subresourceFailuresDoNotTriggerDocumentRecovery() {
        WebViewRecoveryState state = new WebViewRecoveryState(2);
        state.onPageStarted();

        assertFalse(state.shouldHandleFailure(false));
        assertFalse(state.scheduleRecovery(false));
        assertEquals(-1, state.beginRecoveryLoad());
        assertFalse(state.shouldShowFallback());
    }

    @Test
    public void visibleCommitEndsTheRecoveryCycleAndCancelsPendingWork() {
        WebViewRecoveryState state = new WebViewRecoveryState(2);
        state.onPageStarted();
        assertTrue(state.scheduleRecovery(true));
        assertEquals(1, state.beginRecoveryLoad());
        assertTrue(state.isRecoveryScheduled() == false);

        state.onVisibleCommit();

        assertTrue(state.isPageCommitted());
        assertFalse(state.isRecoveryScheduled());
        assertFalse(state.shouldHandleFailure(true));
    }
}