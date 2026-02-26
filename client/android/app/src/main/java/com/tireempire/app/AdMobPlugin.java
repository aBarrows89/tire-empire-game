package com.tireempire.app;

import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.widget.FrameLayout;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.google.android.gms.ads.AdListener;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.AdSize;
import com.google.android.gms.ads.AdView;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.interstitial.InterstitialAd;
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback;

@CapacitorPlugin(name = "AdMob")
public class AdMobPlugin extends Plugin {
    private static final String TAG = "AdMobPlugin";

    // Test ad unit IDs (replace with real IDs before production)
    private static final String BANNER_AD_UNIT = "ca-app-pub-3940256099942544/6300978111";
    private static final String INTERSTITIAL_AD_UNIT = "ca-app-pub-3940256099942544/1033173712";

    private AdView bannerAdView;
    private InterstitialAd interstitialAd;

    private void setBannerClass(boolean show) {
        getBridge().getWebView().post(() -> {
            getBridge().getWebView().evaluateJavascript(
                "document.body.classList." + (show ? "add" : "remove") + "('native-banner-showing')",
                null
            );
        });
    }

    @PluginMethod()
    public void initialize(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            MobileAds.initialize(getContext(), initializationStatus -> {
                Log.d(TAG, "AdMob SDK initialized");
                call.resolve();
            });
        });
    }

    @PluginMethod()
    public void showBanner(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                if (bannerAdView != null) {
                    bannerAdView.setVisibility(View.VISIBLE);
                    setBannerClass(true);
                    call.resolve();
                    return;
                }

                bannerAdView = new AdView(getContext());
                bannerAdView.setAdSize(AdSize.BANNER);
                bannerAdView.setAdUnitId(BANNER_AD_UNIT);

                bannerAdView.setAdListener(new AdListener() {
                    @Override
                    public void onAdLoaded() {
                        setBannerClass(true);
                    }
                });

                FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.WRAP_CONTENT
                );
                params.gravity = Gravity.BOTTOM;

                ViewGroup rootView = (ViewGroup) getActivity().getWindow().getDecorView().getRootView();
                FrameLayout container = rootView.findViewById(android.R.id.content);
                container.addView(bannerAdView, params);

                AdRequest adRequest = new AdRequest.Builder().build();
                bannerAdView.loadAd(adRequest);

                call.resolve();
            } catch (Exception e) {
                Log.e(TAG, "Banner error: " + e.getMessage());
                call.reject("Banner error", e);
            }
        });
    }

    @PluginMethod()
    public void hideBanner(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (bannerAdView != null) {
                bannerAdView.setVisibility(View.GONE);
            }
            setBannerClass(false);
            call.resolve();
        });
    }

    @PluginMethod()
    public void showInterstitial(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            AdRequest adRequest = new AdRequest.Builder().build();
            InterstitialAd.load(getContext(), INTERSTITIAL_AD_UNIT, adRequest,
                new InterstitialAdLoadCallback() {
                    @Override
                    public void onAdLoaded(InterstitialAd ad) {
                        interstitialAd = ad;
                        interstitialAd.setFullScreenContentCallback(new FullScreenContentCallback() {
                            @Override
                            public void onAdDismissedFullScreenContent() {
                                interstitialAd = null;
                                JSObject result = new JSObject();
                                result.put("shown", true);
                                call.resolve(result);
                            }
                        });
                        interstitialAd.show(getActivity());
                    }

                    @Override
                    public void onAdFailedToLoad(LoadAdError error) {
                        Log.e(TAG, "Interstitial failed: " + error.getMessage());
                        interstitialAd = null;
                        JSObject result = new JSObject();
                        result.put("shown", false);
                        call.resolve(result);
                    }
                }
            );
        });
    }
}
