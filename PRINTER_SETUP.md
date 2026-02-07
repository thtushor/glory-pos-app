# Mobile Printer Support - Setup Guide

## Overview

This document explains how to set up mobile printing for the GloryPOS app. The system supports three types of printers:

- **Bluetooth**: ESC/POS compatible thermal printers
- **USB**: Thermal receipt printers (Android only, via OTG cable)
- **Network/WiFi**: IP-based printers (typically on port 9100)

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     FRONTEND (WebView)                              │
│                                                                      │
│  Invoice.tsx / KOT printing                                          │
│       │                                                              │
│       ▼                                                              │
│  useWebViewPrint() → window.ReactNativeWebView.postMessage()         │
└──────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ (Native Bridge)
┌──────────────────────────────────────────────────────────────────────┐
│                    MOBILE APP (React Native)                         │
│                                                                       │
│  WebView.onMessage → WebViewMessageHandler → PrinterService           │
│                                                                       │
│                    ┌──────────────────────────┐                       │
│                    │     PrinterService       │                       │
│                    │    (Orchestrator)        │                       │
│                    └──────────────────────────┘                       │
│                    ▼           ▼           ▼                          │
│             ┌──────────┐ ┌──────────┐ ┌──────────┐                    │
│             │Bluetooth │ │   USB    │ │ Network  │                    │
│             │ Printer  │ │ Printer  │ │ Printer  │                    │
│             └──────────┘ └──────────┘ └──────────┘                    │
│                                                                       │
│             All use ESCPOSEncoder for receipt formatting              │
└───────────────────────────────────────────────────────────────────────┘
```

## Files Created

```
glory-pos-app/
├── app/
│   ├── index.tsx              # WebView with onMessage handler
│   └── printer-settings.tsx   # Printer management UI
├── services/
│   ├── WebViewMessageHandler.ts
│   └── printer/
│       ├── index.ts           # Barrel exports
│       ├── PrinterService.ts  # Main orchestrator
│       ├── PrinterStorage.ts  # AsyncStorage persistence
│       ├── ESCPOSEncoder.ts   # Receipt byte generation
│       ├── BluetoothPrinter.ts # Bluetooth adapter
│       ├── USBPrinter.ts      # USB adapter (Android)
│       └── NetworkPrinter.ts  # WiFi/TCP adapter
├── hooks/
│   ├── usePrinter.ts
│   └── useBluetoothPermissions.ts
├── types/
│   └── printer.ts
└── app.json                   # Updated with permissions
```

## Setup Instructions

### Step 1: Install Dependencies

The basic dependencies are already installed. For full Bluetooth/USB support, you need additional native libraries:

```bash
cd glory-pos-app

# Already installed
pnpm add @react-native-async-storage/async-storage

# For Bluetooth printing (requires development build)
pnpm add react-native-bluetooth-escpos-printer

# For USB printing (optional, Android only)
pnpm add react-native-usb-serialport-for-android

# For Network printing (optional)
pnpm add react-native-tcp-socket
```

### Step 2: Create Development Build

⚠️ **Important**: Bluetooth and USB printing REQUIRES a development build. They will NOT work in Expo Go.

```bash
# Generate native Android/iOS projects
npx expo prebuild

# Build and run on Android
npx expo run:android

# Build and run on iOS (macOS only)
npx expo run:ios
```

### Step 3: Android Permissions

The following permissions are configured in `app.json`:

- `BLUETOOTH` - Basic Bluetooth access
- `BLUETOOTH_ADMIN` - Bluetooth management
- `BLUETOOTH_CONNECT` - Connect to devices (Android 12+)
- `BLUETOOTH_SCAN` - Scan for devices (Android 12+)
- `ACCESS_FINE_LOCATION` - Required for BT scanning
- `USB_PERMISSION` - USB device access

### Step 4: Test the Setup

1. Open the app on your Android device
2. Navigate to Printer Settings (accessible via the app menu or when a print fails)
3. Select your connection type (Bluetooth/USB/Network)
4. Scan for devices and connect
5. Test print to verify

## Usage

### From Frontend (WebView)

The frontend already uses the `useWebViewPrint` hook. When running in the native app, print signals are automatically routed to the native printer service:

```tsx
// Frontend: Invoice.tsx
import { useWebViewPrint } from "@/hooks/useWebViewPrint";

const { isWebView, sendPrintSignal } = useWebViewPrint();

const handlePrint = () => {
  if (isWebView) {
    // Running in native app - use native printing
    sendPrintSignal("INVOICE", invoiceData);
  } else {
    // Running in browser - use WebUSB or browser print
    handleBrowserPrint();
  }
};
```

### Printer Settings

Users can manage printers from the settings page:

- Scan for Bluetooth devices
- Connect to USB printers (Android)
- Add network printers by IP
- Set default printer
- Test print functionality

## Supported Printers

Any ESC/POS compatible thermal printer should work:

- **Bluetooth**: Most Bluetooth receipt printers
  - Xprinter XP-58, XP-80
  - GOOJPRT PT-210
  - Symcode MTP-II
  
- **USB**: Android devices with OTG support
  - Same models as above via USB

- **Network**: Any printer with network port
  - Star TSP100
  - Epson TM-T20
  - Any 9100 port printer

## Troubleshooting

### "Bluetooth library not available"
- You're running in Expo Go. Create a development build.

### "Permission denied"
- Grant Bluetooth and Location permissions in app settings

### "Connection failed"
- Ensure printer is powered on
- Check if printer is paired in Android Bluetooth settings first
- Try forgetting and re-pairing the device

### "Print job failed"
- Check printer has paper
- Verify correct paper width (58mm or 80mm)
- Try test print from settings

### USB not detecting printer
- Use a proper OTG cable
- Check if phone supports USB OTG
- Grant USB permission when prompted

## Paper Width

- **58mm**: Compact receipts, 32 characters per line
- **80mm**: Standard POS receipts, 48 characters per line

Select the correct paper width in Printer Settings before connecting.
