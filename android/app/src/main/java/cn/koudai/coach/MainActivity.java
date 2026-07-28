package cn.koudai.coach;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onResume() {
    super.onResume();
    KoudaiWidgetProvider.Companion.refresh(this);
  }

  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(HealthConnectPlugin.class);
    super.onCreate(savedInstanceState);
  }
}
