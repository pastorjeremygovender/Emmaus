package za.co.emmaus.app;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onResume() {
        super.onResume();
        DailyRhythmWidgetProvider.refresh(this);
    }
}
