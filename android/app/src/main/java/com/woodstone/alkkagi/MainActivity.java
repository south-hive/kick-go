package com.woodstone.alkkagi;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.view.View;
import android.graphics.Color;
import java.io.IOException;

public class MainActivity extends Activity {
    private WebView game;
    private static final String HOST = "game.local";

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        game = new WebView(this);
        game.setBackgroundColor(Color.rgb(24, 39, 34));
        game.setOverScrollMode(View.OVER_SCROLL_NEVER);
        game.setOnApplyWindowInsetsListener((view, insets) -> {
            view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets.consumeSystemWindowInsets();
        });
        WebSettings settings = game.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        game.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !HOST.equals(request.getUrl().getHost());
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                String path = request.getUrl().getPath();
                if (!HOST.equals(request.getUrl().getHost()) || path == null) return null;
                String file = path.equals("/") ? "index.html" : path.substring(1);
                if (!(file.equals("index.html") || file.equals("style.css") || file.equals("physics.js") || file.equals("game.js"))) {
                    return new WebResourceResponse("text/plain", "UTF-8", new java.io.ByteArrayInputStream(new byte[0]));
                }
                String type = file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "text/html";
                try { return new WebResourceResponse(type, "UTF-8", getAssets().open(file)); }
                catch (IOException error) { return new WebResourceResponse("text/plain", "UTF-8", new java.io.ByteArrayInputStream("Asset missing".getBytes())); }
            }
        });
        setContentView(game);
        game.loadUrl("https://" + HOST + "/index.html");
    }
    @Override protected void onPause() { super.onPause(); game.onPause(); game.pauseTimers(); }
    @Override protected void onResume() { super.onResume(); if (game != null) { game.onResume(); game.resumeTimers(); } }
    @Override protected void onDestroy() { game.destroy(); super.onDestroy(); }
}
