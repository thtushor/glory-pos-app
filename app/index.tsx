import NetInfo from "@react-native-community/netinfo";
import { Stack, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  BackHandler,
  Image,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { WebViewMessageEvent } from "react-native-webview";
import { WebView } from "react-native-webview";

// Import printer services
import { usePrinter } from "../hooks/usePrinter";
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
  const [showTestBar, setShowTestBar] = useState(true);

  // Get printer state
  const { isConnected: isPrinterConnected, isPrinting } = usePrinter();

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

  // ========== Test Print Handlers ==========

  const handleTestInvoicePrint = async () => {
    if (!isPrinterConnected) {
      Alert.alert("No Printer", "Please connect a printer first in Settings", [
        { text: "Cancel", style: "cancel" },
        { text: "Go to Settings", onPress: () => router.push("/printer-settings" as any) },
      ]);
      return;
    }

    const dummyInvoice = {
      invoiceNumber: "TEST-" + Date.now().toString().slice(-6),
      date: new Date().toISOString(),
      tableNumber: "T5",
      guestNumber: 2,
      customer: {
        name: "Test Customer",
        phone: "0123456789",
        email: "test@example.com",
      },
      items: [
        { productName: "Burger Deluxe", sku: "BRG001", details: "Extra cheese", quantity: 2, unitPrice: 150, subtotal: 300 },
        { productName: "French Fries", sku: "FRY001", details: "", quantity: 1, unitPrice: 50, subtotal: 50 },
        { productName: "Coca Cola", sku: "DRK001", details: "Ice", quantity: 2, unitPrice: 35, subtotal: 70 },
      ],
      summary: { subtotal: "420", tax: "29.40", taxRate: "7", discount: "0", discountRate: "0", total: "449.40" },
      payment: { method: "cash" as const, status: "Paid", paidAmount: 500, totalAmount: 449.40, remainingAmount: 0, isPaid: true, isPartial: false },
      orderStatus: "Completed",
      businessInfo: { name: "Glory POS Restaurant", address: "123 Test Street, Bangkok", phone: "02-123-4567", email: "info@glorypos.com", website: "www.glorypos.com", taxId: "1234567890123" },
      stats: { totalItems: 5, totalUniqueItems: 3, averageItemPrice: "84.00" },
    };

    try {
      await PrinterService.addPrintJob("INVOICE", dummyInvoice);
      Alert.alert("Success", "Test invoice sent to printer!");
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to print test invoice");
    }
  };

  const handleTestKOTPrint = async () => {
    if (!isPrinterConnected) {
      Alert.alert("No Printer", "Please connect a printer first in Settings", [
        { text: "Cancel", style: "cancel" },
        { text: "Go to Settings", onPress: () => router.push("/printer-settings" as any) },
      ]);
      return;
    }

    const dummyKOT = {
      invoiceNumber: "KOT-" + Date.now().toString().slice(-6),
      date: new Date().toISOString(),
      tableNumber: "T5",
      guestNumber: 2,
      specialNotes: "Allergic to peanuts! Extra spicy!",
      customer: { name: "Kitchen Order", phone: "", email: "" },
      items: [
        { productName: "Pad Thai", sku: "THAI001", details: "No peanuts, extra spicy", quantity: 2, unitPrice: 120, subtotal: 240 },
        { productName: "Tom Yum Soup", sku: "SOUP001", details: "Very spicy", quantity: 1, unitPrice: 80, subtotal: 80 },
        { productName: "Green Curry", sku: "CURRY001", details: "", quantity: 1, unitPrice: 150, subtotal: 150 },
      ],
      summary: { subtotal: "470", tax: "0", taxRate: "0", discount: "0", discountRate: "0", total: "470" },
      payment: { method: "cash" as const, status: "Pending", paidAmount: 0, totalAmount: 470, remainingAmount: 470, isPaid: false, isPartial: false },
      orderStatus: "Preparing",
      businessInfo: { name: "Glory POS Restaurant", address: "123 Test Street, Bangkok", phone: "02-123-4567", email: "info@glorypos.com", website: "www.glorypos.com", taxId: "1234567890123" },
      stats: { totalItems: 4, totalUniqueItems: 3, averageItemPrice: "117.50" },
    };

    try {
      await PrinterService.addPrintJob("KOT", dummyKOT);
      Alert.alert("Success", "Test KOT sent to printer!");
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to print test KOT");
    }
  };

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
      {/* <View
        style={{
          height: Platform.OS === "android" ? StatusBar.currentHeight : 44,
          backgroundColor: "#32cd32",
        }}
      /> */}
      {/* <StatusBar
        backgroundColor="#32cd32"
        barStyle="light-content"
        translucent
      /> */}
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
            {/* Test Print Bar - For Development Testing */}
            {showTestBar && (
              <View style={styles.testBar}>
                <View style={styles.testBarLeft}>
                  <View style={[styles.statusDot, { backgroundColor: isPrinterConnected ? "#22c55e" : "#ef4444" }]} />
                  <Text style={styles.testBarTitle}>🧪 Test Print</Text>
                </View>
                <View style={styles.testBarButtons}>
                  <TouchableOpacity
                    style={[styles.testButton, styles.invoiceButton]}
                    onPress={handleTestInvoicePrint}
                    disabled={isPrinting}
                  >
                    <Text style={styles.testButtonText}>🧾 Invoice</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.testButton, styles.kotButton]}
                    onPress={handleTestKOTPrint}
                    disabled={isPrinting}
                  >
                    <Text style={styles.testButtonText}>📋 KOT</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.settingsButton}
                    onPress={() => router.push("/printer-settings" as any)}
                  >
                    <Text style={styles.settingsButtonText}>⚙️</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.closeButton}
                    onPress={() => setShowTestBar(false)}
                  >
                    <Text style={styles.closeButtonText}>✕</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

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
  // Test Print Bar Styles
  testBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1f2937",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#374151",
  },
  testBarLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  testBarTitle: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  testBarButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  testButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  invoiceButton: {
    backgroundColor: "#3b82f6",
  },
  kotButton: {
    backgroundColor: "#f59e0b",
  },
  testButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  settingsButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  settingsButtonText: {
    fontSize: 16,
  },
  closeButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  closeButtonText: {
    color: "#9ca3af",
    fontSize: 14,
    fontWeight: "bold",
  },
});

