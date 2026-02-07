/**
 * Bluetooth Printer Adapter
 * Handles Bluetooth thermal printer connectivity with ESC/POS support
 * 
 * Requires: react-native-bluetooth-escpos-printer (dev build)
 */

import { Alert, PermissionsAndroid, Platform } from "react-native";
import type { BluetoothDevice } from "../../types/printer";

// Type declarations for the Bluetooth printer library
// The actual library will be dynamically imported to prevent crashes in Expo Go
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
}

// Event emitter for bluetooth events
type BluetoothEventCallback = (device: any) => void;

class BluetoothPrinterClass {
    private isLibraryAvailable: boolean = false;
    private BluetoothManager: BluetoothManager | null = null;
    private BluetoothEscposPrinter: BluetoothEscposPrinter | null = null;
    private connectedDevice: BluetoothDevice | null = null;
    private isScanning: boolean = false;
    private listeners: Map<string, BluetoothEventCallback[]> = new Map();
    private reconnectAttempts: number = 0;
    private maxReconnectAttempts: number = 3;
    private reconnectDelay: number = 2000;

    constructor() {
        this.initializeLibrary();
    }

    /**
     * Dynamically import Bluetooth library
     * This prevents crashes when running in Expo Go
     */
    private async initializeLibrary(): Promise<void> {
        try {
            // Dynamic import to avoid crashes in Expo Go
            const lib = await import("react-native-bluetooth-escpos-printer");
            this.BluetoothManager = lib.BluetoothManager;
            this.BluetoothEscposPrinter = lib.BluetoothEscposPrinter;
            this.isLibraryAvailable = true;
            console.log("[BluetoothPrinter] Library loaded successfully");

            // Setup native event listeners
            this.setupNativeEventListeners();
        } catch (error) {
            console.warn("[BluetoothPrinter] Library not available:", error);
            this.isLibraryAvailable = false;
        }
    }

    /**
     * Setup native Bluetooth event listeners
     */
    private setupNativeEventListeners(): void {
        if (!this.BluetoothManager) return;

        // Note: Event setup depends on the specific library implementation
        // This is a placeholder for event subscription
        console.log("[BluetoothPrinter] Native event listeners ready");
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
            const apiLevel = Platform.Version;

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
                    console.warn("[BluetoothPrinter] Some permissions denied");
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
        if (!this.BluetoothManager) {
            throw new Error("Bluetooth library not available");
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
    async enableBluetooth(): Promise<void> {
        if (!this.BluetoothManager) {
            throw new Error("Bluetooth library not available");
        }

        try {
            await this.BluetoothManager.enableBluetooth();
            console.log("[BluetoothPrinter] Bluetooth enabled");
        } catch (error) {
            console.error("[BluetoothPrinter] Failed to enable Bluetooth:", error);
            throw error;
        }
    }

    /**
     * Scan for Bluetooth devices
     */
    async scanDevices(onDeviceFound?: (device: BluetoothDevice) => void): Promise<BluetoothDevice[]> {
        if (!this.BluetoothManager) {
            throw new Error("Bluetooth library not available");
        }

        // Request permissions first
        const hasPermissions = await this.requestPermissions();
        if (!hasPermissions) {
            throw new Error("Bluetooth permissions not granted");
        }

        // Check if Bluetooth is enabled
        const isEnabled = await this.isBluetoothEnabled();
        if (!isEnabled) {
            Alert.alert(
                "Bluetooth Disabled",
                "Please enable Bluetooth to scan for printers",
                [
                    { text: "Cancel", style: "cancel" },
                    {
                        text: "Enable",
                        onPress: async () => {
                            try {
                                await this.enableBluetooth();
                            } catch (e) {
                                console.error("Failed to enable Bluetooth:", e);
                            }
                        },
                    },
                ]
            );
            throw new Error("Bluetooth is disabled");
        }

        const devices: BluetoothDevice[] = [];
        this.isScanning = true;

        console.log("[BluetoothPrinter] Starting device scan...");

        try {
            // The library emits events for found devices
            // We'll collect them during the scan
            await this.BluetoothManager.scanDevices();

            // Scan typically takes a few seconds
            // Return collected devices after scan completes
            console.log(`[BluetoothPrinter] Scan complete, found ${devices.length} devices`);

            return devices;
        } catch (error) {
            console.error("[BluetoothPrinter] Scan failed:", error);
            throw error;
        } finally {
            this.isScanning = false;
        }
    }

    /**
     * Get list of already paired devices
     */
    async getPairedDevices(): Promise<BluetoothDevice[]> {
        // This would be implemented based on the library's API
        // Some libraries provide a method to get paired devices directly
        console.log("[BluetoothPrinter] Getting paired devices...");
        return [];
    }

    /**
     * Connect to a Bluetooth printer
     */
    async connect(address: string): Promise<boolean> {
        if (!this.BluetoothManager) {
            throw new Error("Bluetooth library not available");
        }

        console.log(`[BluetoothPrinter] Connecting to: ${address}`);

        try {
            await this.BluetoothManager.connect(address);

            this.connectedDevice = {
                id: address,
                name: "Thermal Printer",
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
            // The exact method depends on the library's API
            const textData = new TextDecoder().decode(data);
            await this.BluetoothEscposPrinter.printText(textData, {});

            console.log(`[BluetoothPrinter] Sent ${data.length} bytes`);
        } catch (error) {
            console.error("[BluetoothPrinter] Send failed:", error);

            // Attempt auto-reconnect
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                await this.attemptReconnect();
                // Retry sending after reconnect
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
            await this.connect(this.connectedDevice.address);
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
