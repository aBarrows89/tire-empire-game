package com.tireempire.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Initialize Firebase before Capacitor plugins load, so PushNotifications
        // doesn't crash when google-services.json is missing.
        try {
            Class<?> firebaseApp = Class.forName("com.google.firebase.FirebaseApp");
            firebaseApp.getMethod("initializeApp", android.content.Context.class).invoke(null, this);
        } catch (Exception e) {
            // No Firebase / no google-services.json — push won't work, but app won't crash
        }
        super.onCreate(savedInstanceState);
    }
}
