package com.allofdaniel.rkpuviewer;

import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.core.view.WindowCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Enable hardware acceleration for the window
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,
            WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED
        );

        // Make the app fullscreen (edge-to-edge)
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        // Configure WebView after bridge is initialized
        getBridge().getWebView().post(() -> {
            WebView webView = getBridge().getWebView();
            if (webView != null) {
                // Enable hardware acceleration for WebView layer
                webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);

                WebSettings settings = webView.getSettings();
                settings.setJavaScriptEnabled(true);
                settings.setDomStorageEnabled(true);

                // Enable file access for WebGL
                settings.setAllowFileAccess(true);
                settings.setAllowContentAccess(true);
                settings.setMediaPlaybackRequiresUserGesture(false);

                // Fix viewport issues
                settings.setUseWideViewPort(true);
                settings.setLoadWithOverviewMode(true);
                settings.setBuiltInZoomControls(false);
                settings.setDisplayZoomControls(false);
            }
        });
    }
}
