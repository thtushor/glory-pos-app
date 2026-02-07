import NetInfo from "@react-native-community/netinfo";
import { Stack, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  Image,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { WebViewMessageEvent } from "react-native-webview";
import { WebView } from "react-native-webview";

// Import printer services
import { WebViewMessageHandler } from "../services/WebViewMessageHandler";
import { PrinterService } from "../services/printer";

export default function Index() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const webViewRef = useRef<WebView>(null);
  const canGoBack = useRef(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const [isConnected, setIsConnected] = useState(true);
  const [isWebViewReady, setIsWebViewReady] = useState(false);
  const [minTimePassed, setMinTimePassed] = useState(false);
  const [isSplashHidden, setIsSplashHidden] = useState(false);

  // Initialize printer service
  useEffect(() => {
    PrinterService.initialize();

    // Set WebView ref for bidirectional communication
    WebViewMessageHandler.setWebViewRef(webViewRef);

    // Subscribe to printer navigation events
    const unsubscribe = PrinterService.subscribe((event) => {
      if (event.type === "navigate_settings") {
        // Navigate to printer settings page when needed
        router.push("/printer-settings" as any);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [router]);

  // Back handler for Android
  useEffect(() => {
    const onBackPress = () => {
      if (canGoBack.current && webViewRef.current) {
        webViewRef.current.goBack();
        return true;
      }
      return false;
    };
    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      onBackPress
    );
    return () => backHandler.remove();
  }, []);

  // Internet connection check
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsConnected(state.isConnected ?? true);
    });
    return () => unsubscribe();
  }, []);

  // Always wait at least 1 second before hiding splash
  useEffect(() => {
    const timer = setTimeout(() => {
      setMinTimePassed(true);
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  // Fade out splash only when both timer passed and webview loaded
  const hideSplash = () => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 600,
      useNativeDriver: true,
    }).start(() => setIsSplashHidden(true));
  };

  // Check both conditions
  useEffect(() => {
    if (minTimePassed && isWebViewReady) {
      hideSplash();
    }
  }, [minTimePassed, isWebViewReady]);

  // If timer passed but WebView not loaded, keep waiting
  useEffect(() => {
    if (minTimePassed && !isWebViewReady) {
      const interval = setInterval(() => {
        if (isWebViewReady) {
          hideSplash();
          clearInterval(interval);
        }
      }, 500);
      return () => clearInterval(interval);
    }
  }, [minTimePassed, isWebViewReady]);

  /**
   * Handle messages from WebView (frontend)
   * This is the bridge between web frontend and native printer services
   */
  const handleWebViewMessage = (event: WebViewMessageEvent) => {
    const { data } = event.nativeEvent;

    if (!data) {
      console.warn("[Index] Empty message received from WebView");
      return;
    }

    // Route message to handler
    WebViewMessageHandler.handleMessage(data);
  };

  /**
   * JavaScript to inject into WebView
   * Notifies frontend that it's running in a native app context
   */
  const injectedJavaScript = `
    (function() {
      // Mark as running in native app
      window.isNativeApp = true;
      window.nativePlatform = '${Platform.OS}';
      
      // Listen for printer responses from native
      window.addEventListener('nativePrinterResponse', function(event) {
        console.log('[WebView] Native printer response:', event.detail);
        // Dispatch to any listeners in the frontend
        if (window.onNativePrinterResponse) {
          window.onNativePrinterResponse(event.detail);
        }
      });
      
      console.log('[WebView] Native bridge initialized');
      true;
    })();
  `;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View
        style={{
          height: Platform.OS === "android" ? StatusBar.currentHeight : 44,
          backgroundColor: "#32cd32",
        }}
      />
      <StatusBar
        backgroundColor="#32cd32"
        barStyle="light-content"
        translucent
      />
      {/* Splash Screen */}
      {!isSplashHidden && (
        <Animated.View style={[styles.splashContainer, { opacity: fadeAnim }]}>
          <Image
            source={require("./assets/splash.jpg")}
            style={styles.splashImage}
            resizeMode="cover"
          />
        </Animated.View>
      )}

      <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
        {isConnected ? (
          <>
            <WebView
              ref={webViewRef}
              source={{ uri: "https://glorypos.com" }}
              javaScriptEnabled
              domStorageEnabled
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              startInLoadingState={false}
              onLoadEnd={() => setIsWebViewReady(true)}
              onNavigationStateChange={(navState) => {
                canGoBack.current = navState.canGoBack;
              }}
              onShouldStartLoadWithRequest={(request) => {
                // Always open all links inside the WebView itself
                if (
                  request.url.startsWith("https") ||
                  request.url.startsWith("http")
                ) {
                  return true;
                }
                return false;
              }}
              // === NEW: Message handler for print signals ===
              onMessage={handleWebViewMessage}
              injectedJavaScript={injectedJavaScript}
              // ============================================
              originWhitelist={["*"]}
              setSupportMultipleWindows={false}
              style={{ flex: 1, marginBottom: insets.bottom }}
              automaticallyAdjustContentInsets={true}
            />

            {Platform.OS === "android" && (
              <View
                style={{
                  height: insets.bottom || 10,
                  backgroundColor: "#fff",
                }}
              />
            )}
          </>
        ) : (
          <View style={styles.offlineContainer}>
            <Image
              source={require("./assets/connection.png")}
              style={styles.offlineImage}
            />
            <ActivityIndicator size="large" color="#45b471" />
          </View>
        )}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  splashContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 999,
  },
  splashImage: {
    width: "100%",
    height: "100%",
  },
  offlineContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  offlineImage: {
    width: 120,
    height: 120,
    marginBottom: 10,
  },
});
