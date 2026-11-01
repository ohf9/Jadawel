package com.jadawel.app;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(JadawelNativePlugin.class);
        super.onCreate(savedInstanceState);
        if (savedInstanceState == null) JadawelNativePlugin.collect(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        JadawelNativePlugin.collect(intent);
        if (getBridge() != null) getBridge().triggerWindowJSEvent("jadawelFiles");
    }
}
