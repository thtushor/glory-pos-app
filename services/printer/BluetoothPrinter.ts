/**
 * Bluetooth Printer Adapter
 * Handles Bluetooth thermal printer connectivity with ESC/POS support
 * 
 * Requires: react-native-bluetooth-escpos-printer (dev build)
 */

import { Alert, DeviceEventEmitter, PermissionsAndroid, Platform } from "react-native";
import type { BluetoothDevice } from "../../types/printer";

// Type declarations for the Bluetooth printer library
interface BluetoothManager {
    isBluetoothEnabled: () => Promise<boolean>;
    enableBluetooth: () => Promise<void>;
    disableBluetooth: () => Promise<void>;
    scanDevices: () => Promise<void>;
    connect: (address: string) => Promise<void>;
    disconnect: (address: string) => Promise<void>;
    EVENT_DEVICE_FOUND: string;
    EVENT_DEVICE_ALREADY_PAIRED: string;
    EVENT_CONNECTION_LOST: string;
    EVENT_BLUETOOTH_NOT_SUPPORT: string;
}

interface BluetoothEscposPrinter {
    printerInit: () => Promise<void>;
    printText: (text: string, options?: any) => Promise<void>;
    printColumn: (widths: number[], aligns: number[], texts: string[], options?: any) => Promise<void>;
    printPic: (base64: string, options?: any) => Promise<void>;
    printerAlign: (align: number) => Promise<void>;
    setBlob: (weight: number) => Promise<void>;
    printAndFeed: (feed: number) => Promise<void>;
    printerUnderLine: (line: number) => Promise<void>;
    cutOnePoint: () => Promise<void>;
    setWidth: (width: number) => Promise<void>;
    printBarCode: (content: string, nType: number, nWidth: number, nHeight: number, nHriFontType: number, nHriFontPosition: number) => Promise<void>;
    printQRCode: (content: string, size: number, correctionLevel: number) => Promise<void>;
}

// Callback types
type DeviceCallback = (device: BluetoothDevice) => void;
type ScanCompleteCallback = (devices: BluetoothDevice[]) => void;

class BluetoothPrinterClass {
    private isLibraryAvailable: boolean = false;
    private isInitialized: boolean = false;
    private BluetoothManager: BluetoothManager | null = null;
    private BluetoothEscposPrinter: BluetoothEscposPrinter | null = null;
    private connectedDevice: BluetoothDevice | null = null;
    private isScanning: boolean = false;
    private discoveredDevices: BluetoothDevice[] = [];
    private pairedDevices: BluetoothDevice[] = [];
    private eventListeners: any[] = [];
    private reconnectAttempts: number = 0;
    private maxReconnectAttempts: number = 3;
    private reconnectDelay: number = 2000;
    private initPromise: Promise<boolean> | null = null;

    constructor() {
        // Don't auto-initialize - wait for explicit call
        // This prevents crashes in Expo Go
    }

    /**
     * Initialize the Bluetooth library
     * Call this before using any Bluetooth functionality
     * Returns true if Bluetooth is available
     */
    async initialize(): Promise<boolean> {
        // Skip on web
        if (Platform.OS === "web") {
            console.log("[BluetoothPrinter] Bluetooth not supported on web");
            return false;
        }

        // Return existing promise if already initializing
        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = this.doInitialize();
        return this.initPromise;
    }

    private async doInitialize(): Promise<boolean> {
        if (this.isInitialized) {
            return this.isLibraryAvailable;
        }

        try {
            // Check if we're in Expo Go (native modules not available)
            const { NativeModules } = await import("react-native");

            // The BluetoothManager native module check
            if (!NativeModules.BluetoothManager) {
                console.warn("[BluetoothPrinter] Native module not available. Are you running in Expo Go?");
                console.warn("[BluetoothPrinter] Please use: npx expo run:android");
                this.isLibraryAvailable = false;
                this.isInitialized = true;
                return false;
            }

            // Dynamic import to avoid crashes
            const lib = await import("react-native-bluetooth-escpos-printer");
            this.BluetoothManager = lib.BluetoothManager as any;
            this.BluetoothEscposPrinter = lib.BluetoothEscposPrinter as any;
            this.isLibraryAvailable = true;
            this.isInitialized = true;
            console.log("[BluetoothPrinter] Library loaded successfully");
            return true;
        } catch (error) {
            console.warn("[BluetoothPrinter] Library not available:", error);
            console.warn("[BluetoothPrinter] Please run: npx expo run:android");
            this.isLibraryAvailable = false;
            this.isInitialized = true;
            return false;
        }
    }

    /**
     * Wait for library initialization (legacy support)
     */
    async waitForInit(): Promise<void> {
        await this.initialize();
    }

    /**
     * Check if Bluetooth printing is available
     */
    isAvailable(): boolean {
        return this.isLibraryAvailable && Platform.OS !== "web";
    }

    /**
     * Request necessary Bluetooth permissions (Android)
     */
    async requestPermissions(): Promise<boolean> {
        if (Platform.OS !== "android") {
            return true; // iOS handles permissions differently
        }

        try {
            const apiLevel = Platform.Version as number;

            if (apiLevel >= 31) {
                // Android 12+ requires BLUETOOTH_SCAN and BLUETOOTH_CONNECT
                const permissions = [
                    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
                    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
                    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
                ];

                const results = await PermissionsAndroid.requestMultiple(permissions);

                const allGranted = Object.values(results).every(
                    (result) => result === PermissionsAndroid.RESULTS.GRANTED
                );

                if (!allGranted) {
                    console.warn("[BluetoothPrinter] Some permissions denied:", results);
                    Alert.alert(
                        "Permissions Required",
                        "Bluetooth scanning requires Bluetooth and Location permissions. Please enable them in Settings.",
                        [{ text: "OK" }]
                    );
                    return false;
                }

                return true;
            } else {
                // Android 11 and below
                const granted = await PermissionsAndroid.request(
                    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
                    {
                        title: "Location Permission",
                        message: "Bluetooth scanning requires location permission",
                        buttonPositive: "OK",
                    }
                );

                return granted === PermissionsAndroid.RESULTS.GRANTED;
            }
        } catch (error) {
            console.error("[BluetoothPrinter] Permission request failed:", error);
            return false;
        }
    }

    /**
     * Check if Bluetooth is enabled
     */
    async isBluetoothEnabled(): Promise<boolean> {
        await this.waitForInit();

        if (!this.BluetoothManager) {
            console.warn("[BluetoothPrinter] Library not available");
            return false;
        }

        try {
            return await this.BluetoothManager.isBluetoothEnabled();
        } catch (error) {
            console.error("[BluetoothPrinter] Failed to check Bluetooth status:", error);
            return false;
        }
    }

    /**
     * Enable Bluetooth (Android only)
     */
    async enableBluetooth(): Promise<boolean> {
        await this.waitForInit();

        if (!this.BluetoothManager) {
            throw new Error("Bluetooth library not available. Please use a development build.");
        }

        try {
            await this.BluetoothManager.enableBluetooth();
            console.log("[BluetoothPrinter] Bluetooth enabled");
            return true;
        } catch (error) {
            console.error("[BluetoothPrinter] Failed to enable Bluetooth:", error);
            return false;
        }
    }

    /**
     * Scan for Bluetooth devices
     * Returns both paired and discovered devices
     */
    async scanDevices(
        onDeviceFound?: DeviceCallback,
        onScanComplete?: ScanCompleteCallback
    ): Promise<BluetoothDevice[]> {
        await this.waitForInit();

        if (!this.BluetoothManager) {
            throw new Error("Bluetooth library not available. Please use a development build.");
        }

        // Request permissions first
        const hasPermissions = await this.requestPermissions();
        if (!hasPermissions) {
            throw new Error("Bluetooth permissions not granted");
        }

        // Check if Bluetooth is enabled
        const isEnabled = await this.isBluetoothEnabled();
        if (!isEnabled) {
            const shouldEnable = await new Promise<boolean>((resolve) => {
                Alert.alert(
                    "Bluetooth Disabled",
                    "Please enable Bluetooth to scan for printers",
                    [
                        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
                        { text: "Enable", onPress: () => resolve(true) },
                    ]
                );
            });

            if (shouldEnable) {
                const enabled = await this.enableBluetooth();
                if (!enabled) {
                    throw new Error("Failed to enable Bluetooth");
                }
            } else {
                throw new Error("Bluetooth is disabled");
            }
        }

        // Clear previous scan results
        this.discoveredDevices = [];
        this.pairedDevices = [];
        this.isScanning = true;

        // Remove previous event listeners
        this.removeEventListeners();

        console.log("[BluetoothPrinter] Starting device scan...");

        return new Promise((resolve, reject) => {
            // Set up event listeners for device discovery
            const pairedListener = DeviceEventEmitter.addListener(
                "EVENT_DEVICE_ALREADY_PAIRED",
                (data) => {
                    console.log("[BluetoothPrinter] Paired devices:", data);
                    try {
                        const devices = typeof data === "string" ? JSON.parse(data) : data;
                        if (Array.isArray(devices)) {
                            devices.forEach((device: any) => {
                                const btDevice: BluetoothDevice = {
                                    id: device.address,
                                    name: device.name || "Unknown Device",
                                    address: device.address,
                                    paired: true,
                                };
                                this.pairedDevices.push(btDevice);
                                onDeviceFound?.(btDevice);
                            });
                        }
                    } catch (e) {
                        console.error("[BluetoothPrinter] Parse paired devices error:", e);
                    }
                }
            );

            const foundListener = DeviceEventEmitter.addListener(
                "EVENT_DEVICE_FOUND",
                (data) => {
                    console.log("[BluetoothPrinter] Device found:", data);
                    try {
                        const device = typeof data === "string" ? JSON.parse(data) : data;
                        if (device && device.address) {
                            const btDevice: BluetoothDevice = {
                                id: device.address,
                                name: device.name || "Unknown Device",
                                address: device.address,
                                paired: false,
                            };
                            // Avoid duplicates
                            if (!this.discoveredDevices.find(d => d.address === btDevice.address)) {
                                this.discoveredDevices.push(btDevice);
                                onDeviceFound?.(btDevice);
                            }
                        }
                    } catch (e) {
                        console.error("[BluetoothPrinter] Parse found device error:", e);
                    }
                }
            );

            const lostListener = DeviceEventEmitter.addListener(
                "EVENT_CONNECTION_LOST",
                () => {
                    console.warn("[BluetoothPrinter] Connection lost");
                    this.connectedDevice = null;
                }
            );

            const notSupportListener = DeviceEventEmitter.addListener(
                "EVENT_BLUETOOTH_NOT_SUPPORT",
                () => {
                    console.error("[BluetoothPrinter] Bluetooth not supported");
                    this.isScanning = false;
                    this.removeEventListeners();
                    reject(new Error("Bluetooth is not supported on this device"));
                }
            );

            this.eventListeners = [pairedListener, foundListener, lostListener, notSupportListener];

            // Start scanning
            this.BluetoothManager!.scanDevices()
                .then(() => {
                    console.log("[BluetoothPrinter] Scan initiated");

                    // Wait for scan to complete (typically 10-12 seconds)
                    setTimeout(() => {
                        this.isScanning = false;
                        const allDevices = [...this.pairedDevices, ...this.discoveredDevices];
                        console.log(`[BluetoothPrinter] Scan complete. Found ${allDevices.length} devices`);
                        onScanComplete?.(allDevices);
                        resolve(allDevices);
                    }, 12000);
                })
                .catch((error) => {
                    console.error("[BluetoothPrinter] Scan failed:", error);
                    this.isScanning = false;
                    this.removeEventListeners();
                    reject(error);
                });
        });
    }

    /**
     * Remove all event listeners
     */
    private removeEventListeners(): void {
        this.eventListeners.forEach(listener => {
            try {
                listener.remove();
            } catch (e) {
                console.warn("[BluetoothPrinter] Failed to remove listener:", e);
            }
        });
        this.eventListeners = [];
    }

    /**
     * Get list of already paired devices (quick method without full scan)
     */
    async getPairedDevices(): Promise<BluetoothDevice[]> {
        await this.waitForInit();

        if (!this.BluetoothManager) {
            return [];
        }

        // Request permissions
        await this.requestPermissions();

        return new Promise((resolve) => {
            const pairedDevices: BluetoothDevice[] = [];

            const listener = DeviceEventEmitter.addListener(
                "EVENT_DEVICE_ALREADY_PAIRED",
                (data) => {
                    try {
                        const devices = typeof data === "string" ? JSON.parse(data) : data;
                        if (Array.isArray(devices)) {
                            devices.forEach((device: any) => {
                                pairedDevices.push({
                                    id: device.address,
                                    name: device.name || "Unknown Device",
                                    address: device.address,
                                    paired: true,
                                });
                            });
                        }
                    } catch (e) {
                        console.error("[BluetoothPrinter] Parse error:", e);
                    }
                }
            );

            this.BluetoothManager!.scanDevices()
                .then(() => {
                    // Return paired devices after a short delay
                    setTimeout(() => {
                        listener.remove();
                        resolve(pairedDevices);
                    }, 2000);
                })
                .catch((error) => {
                    console.error("[BluetoothPrinter] Failed to get paired devices:", error);
                    listener.remove();
                    resolve([]);
                });
        });
    }

    /**
     * Stop scanning
     */
    stopScan(): void {
        this.isScanning = false;
        this.removeEventListeners();
        console.log("[BluetoothPrinter] Scan stopped");
    }

    /**
     * Get scanning status
     */
    getIsScanning(): boolean {
        return this.isScanning;
    }

    /**
     * Connect to a Bluetooth printer
     */
    async connect(address: string, deviceName?: string): Promise<boolean> {
        await this.waitForInit();

        if (!this.BluetoothManager) {
            throw new Error("Bluetooth library not available. Please use a development build.");
        }

        console.log(`[BluetoothPrinter] Connecting to: ${address}`);

        try {
            await this.BluetoothManager.connect(address);

            this.connectedDevice = {
                id: address,
                name: deviceName || "Thermal Printer",
                address: address,
                paired: true,
            };

            this.reconnectAttempts = 0;

            console.log("[BluetoothPrinter] Connected successfully");

            // Initialize printer
            if (this.BluetoothEscposPrinter) {
                await this.BluetoothEscposPrinter.printerInit();
            }

            return true;
        } catch (error) {
            console.error("[BluetoothPrinter] Connection failed:", error);
            this.connectedDevice = null;
            throw error;
        }
    }

    /**
     * Disconnect from current printer
     */
    async disconnect(): Promise<void> {
        if (!this.BluetoothManager || !this.connectedDevice) {
            return;
        }

        console.log("[BluetoothPrinter] Disconnecting...");

        try {
            await this.BluetoothManager.disconnect(this.connectedDevice.address);
            this.connectedDevice = null;
            console.log("[BluetoothPrinter] Disconnected");
        } catch (error) {
            console.error("[BluetoothPrinter] Disconnect failed:", error);
            this.connectedDevice = null;
        }
    }

    /**
     * Get connected device
     */
    getConnectedDevice(): BluetoothDevice | null {
        return this.connectedDevice;
    }

    /**
     * Check if printer is connected
     */
    isConnected(): boolean {
        return this.connectedDevice !== null;
    }

    /**
     * Send raw ESC/POS bytes to printer
     */
    async sendRawData(data: Uint8Array): Promise<void> {
        if (!this.BluetoothEscposPrinter) {
            throw new Error("Bluetooth printer not available");
        }

        if (!this.connectedDevice) {
            throw new Error("No printer connected");
        }

        try {
            // Convert Uint8Array to base64 or use text printing
            const textData = new TextDecoder().decode(data);
            await this.BluetoothEscposPrinter.printText(textData, {});

            console.log(`[BluetoothPrinter] Sent ${data.length} bytes`);
        } catch (error) {
            console.error("[BluetoothPrinter] Send failed:", error);

            // Attempt auto-reconnect
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                await this.attemptReconnect();
                throw new Error("Connection lost, please try again");
            }

            throw error;
        }
    }

    /**
     * Print using high-level API
     */
    async print(lines: PrintLine[]): Promise<void> {
        if (!this.BluetoothEscposPrinter) {
            throw new Error("Bluetooth printer not available");
        }

        if (!this.connectedDevice) {
            throw new Error("No printer connected");
        }

        try {
            await this.BluetoothEscposPrinter.printerInit();

            for (const line of lines) {
                if (line.type === "text") {
                    if (line.bold) {
                        await this.BluetoothEscposPrinter.setBlob(1);
                    }

                    await this.BluetoothEscposPrinter.printerAlign(
                        line.align === "center" ? 1 : line.align === "right" ? 2 : 0
                    );

                    await this.BluetoothEscposPrinter.printText(line.content + "\n", {});

                    if (line.bold) {
                        await this.BluetoothEscposPrinter.setBlob(0);
                    }
                } else if (line.type === "columns") {
                    await this.BluetoothEscposPrinter.printColumn(
                        line.widths || [],
                        line.aligns || [],
                        line.columns || [],
                        {}
                    );
                } else if (line.type === "feed") {
                    await this.BluetoothEscposPrinter.printAndFeed(line.lines || 1);
                } else if (line.type === "cut") {
                    await this.BluetoothEscposPrinter.cutOnePoint();
                }
            }

            console.log("[BluetoothPrinter] Print completed");
        } catch (error) {
            console.error("[BluetoothPrinter] Print failed:", error);
            throw error;
        }
    }

    /**
     * Attempt to reconnect after connection loss
     */
    private async attemptReconnect(): Promise<void> {
        if (!this.connectedDevice) return;

        this.reconnectAttempts++;
        console.log(
            `[BluetoothPrinter] Reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`
        );

        await new Promise((resolve) => setTimeout(resolve, this.reconnectDelay));

        try {
            await this.connect(this.connectedDevice.address, this.connectedDevice.name);
            this.reconnectAttempts = 0;
            console.log("[BluetoothPrinter] Reconnected successfully");
        } catch (error) {
            console.error("[BluetoothPrinter] Reconnect failed:", error);

            if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                this.connectedDevice = null;
                throw new Error("Failed to reconnect after multiple attempts");
            }
        }
    }

    /**
     * Test print
     */
    async testPrint(): Promise<void> {
        const lines: PrintLine[] = [
            { type: "text", content: "=== TEST PRINT ===", align: "center", bold: true },
            { type: "feed", lines: 1 },
            { type: "text", content: "GloryPOS Printer Test", align: "center" },
            { type: "text", content: `Date: ${new Date().toLocaleString()}`, align: "center" },
            { type: "text", content: "Connection: Bluetooth", align: "center" },
            { type: "feed", lines: 1 },
            { type: "text", content: "--------------------------------", align: "center" },
            { type: "text", content: "If you can read this,", align: "center" },
            { type: "text", content: "your printer is working!", align: "center" },
            { type: "text", content: "--------------------------------", align: "center" },
            { type: "feed", lines: 3 },
            { type: "cut" },
        ];

        await this.print(lines);
    }

    /**
     * Print barcode
     */
    async printBarcode(content: string, type: number = 73, width: number = 2, height: number = 60): Promise<void> {
        if (!this.BluetoothEscposPrinter) {
            throw new Error("Bluetooth printer not available");
        }

        if (!this.connectedDevice) {
            throw new Error("No printer connected");
        }

        try {
            await this.BluetoothEscposPrinter.printerAlign(1); // Center
            await this.BluetoothEscposPrinter.printBarCode(content, type, width, height, 0, 2);
            await this.BluetoothEscposPrinter.printAndFeed(2);
            console.log("[BluetoothPrinter] Barcode printed");
        } catch (error) {
            console.error("[BluetoothPrinter] Barcode print failed:", error);
            throw error;
        }
    }

    /**
     * Print QR code
     */
    async printQRCode(content: string, size: number = 6): Promise<void> {
        if (!this.BluetoothEscposPrinter) {
            throw new Error("Bluetooth printer not available");
        }

        if (!this.connectedDevice) {
            throw new Error("No printer connected");
        }

        try {
            await this.BluetoothEscposPrinter.printerAlign(1); // Center
            await this.BluetoothEscposPrinter.printQRCode(content, size, 1);
            await this.BluetoothEscposPrinter.printAndFeed(2);
            console.log("[BluetoothPrinter] QR code printed");
        } catch (error) {
            console.error("[BluetoothPrinter] QR code print failed:", error);
            throw error;
        }
    }
}

// Print line types
interface PrintLine {
    type: "text" | "columns" | "feed" | "cut" | "separator";
    content?: string;
    align?: "left" | "center" | "right";
    bold?: boolean;
    columns?: string[];
    widths?: number[];
    aligns?: number[];
    lines?: number;
}

// Singleton export
export const BluetoothPrinter = new BluetoothPrinterClass();
export default BluetoothPrinter;
