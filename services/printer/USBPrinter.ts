/**
 * USB Printer Adapter (Android Only)
 * Handles USB thermal printer connectivity via ESC/POS
 * 
 * Requires: react-native-usb-serialport or similar (dev build)
 */

import { Platform } from "react-native";
import type { USBDevice } from "../../types/printer";

// USB Printer class code (ESC/POS printers typically use class 7)
const USB_PRINTER_CLASS = 7;

// Type declarations for potential USB libraries
interface USBSerialPort {
    list: () => Promise<USBDevice[]>;
    open: (deviceId: number, options?: any) => Promise<void>;
    write: (data: string) => Promise<void>;
    writeBase64: (data: string) => Promise<void>;
    close: () => Promise<void>;
}

class USBPrinterClass {
    private isLibraryAvailable: boolean = false;
    private USBSerial: USBSerialPort | null = null;
    private connectedDevice: USBDevice | null = null;
    private isConnected: boolean = false;

    constructor() {
        this.initializeLibrary();
    }

    /**
     * Initialize USB library
     */
    private async initializeLibrary(): Promise<void> {
        if (Platform.OS !== "android") {
            console.log("[USBPrinter] USB printing only available on Android");
            return;
        }

        try {
            // Try to import USB serial library
            // Common options: react-native-usb-serialport, react-native-serialport
            const lib = await import("react-native-usb-serialport-for-android").catch(() => null);

            if (lib) {
                this.USBSerial = lib.default;
                this.isLibraryAvailable = true;
                console.log("[USBPrinter] Library loaded successfully");
            } else {
                console.warn("[USBPrinter] USB library not available");
            }
        } catch (error) {
            console.warn("[USBPrinter] Failed to load USB library:", error);
            this.isLibraryAvailable = false;
        }
    }

    /**
     * Check if USB printing is available
     */
    isAvailable(): boolean {
        return this.isLibraryAvailable && Platform.OS === "android";
    }

    /**
     * List available USB devices
     */
    async listDevices(): Promise<USBDevice[]> {
        if (!this.USBSerial) {
            console.warn("[USBPrinter] USB library not available");
            return [];
        }

        try {
            const devices = await this.USBSerial.list();

            console.log(`[USBPrinter] Found ${devices.length} USB devices`);

            // Filter for printer class devices
            const printers = devices.filter(
                (device: any) =>
                    device.deviceClass === USB_PRINTER_CLASS ||
                    device.name?.toLowerCase().includes("printer")
            );

            return printers.map((device: any) => ({
                deviceId: device.deviceId,
                vendorId: device.vendorId,
                productId: device.productId,
                name: device.name || `USB Printer (${device.vendorId}:${device.productId})`,
            }));
        } catch (error) {
            console.error("[USBPrinter] Failed to list devices:", error);
            return [];
        }
    }

    /**
     * Connect to a USB printer
     */
    async connect(deviceId: number): Promise<boolean> {
        if (!this.USBSerial) {
            throw new Error("USB library not available");
        }

        console.log(`[USBPrinter] Connecting to device: ${deviceId}`);

        try {
            await this.USBSerial.open(deviceId, {
                baudRate: 9600, // Common for ESC/POS printers
                dataBits: 8,
                stopBits: 1,
                parity: 0,
            });

            this.isConnected = true;
            this.connectedDevice = {
                deviceId,
                vendorId: 0,
                productId: 0,
                name: `USB Printer (${deviceId})`,
            };

            console.log("[USBPrinter] Connected successfully");
            return true;
        } catch (error) {
            console.error("[USBPrinter] Connection failed:", error);
            this.isConnected = false;
            this.connectedDevice = null;
            throw error;
        }
    }

    /**
     * Disconnect from USB printer
     */
    async disconnect(): Promise<void> {
        if (!this.USBSerial || !this.isConnected) {
            return;
        }

        try {
            await this.USBSerial.close();
            this.isConnected = false;
            this.connectedDevice = null;
            console.log("[USBPrinter] Disconnected");
        } catch (error) {
            console.error("[USBPrinter] Disconnect failed:", error);
            this.isConnected = false;
            this.connectedDevice = null;
        }
    }

    /**
     * Get connected device
     */
    getConnectedDevice(): USBDevice | null {
        return this.connectedDevice;
    }

    /**
     * Check if connected
     */
    getIsConnected(): boolean {
        return this.isConnected;
    }

    /**
     * Send raw ESC/POS data
     */
    async sendRawData(data: Uint8Array): Promise<void> {
        if (!this.USBSerial) {
            throw new Error("USB library not available");
        }

        if (!this.isConnected) {
            throw new Error("No USB printer connected");
        }

        try {
            // Convert Uint8Array to base64
            const base64 = this.uint8ArrayToBase64(data);
            await this.USBSerial.writeBase64(base64);

            console.log(`[USBPrinter] Sent ${data.length} bytes`);
        } catch (error) {
            console.error("[USBPrinter] Send failed:", error);
            throw error;
        }
    }

    /**
     * Send text data
     */
    async sendText(text: string): Promise<void> {
        if (!this.USBSerial) {
            throw new Error("USB library not available");
        }

        if (!this.isConnected) {
            throw new Error("No USB printer connected");
        }

        try {
            await this.USBSerial.write(text);
            console.log(`[USBPrinter] Sent text: ${text.length} chars`);
        } catch (error) {
            console.error("[USBPrinter] Send text failed:", error);
            throw error;
        }
    }

    /**
     * Helper: Convert Uint8Array to Base64
     */
    private uint8ArrayToBase64(data: Uint8Array): string {
        let binary = "";
        for (let i = 0; i < data.length; i++) {
            binary += String.fromCharCode(data[i]);
        }
        return btoa(binary);
    }

    /**
     * Test print
     */
    async testPrint(): Promise<void> {
        if (!this.isConnected) {
            throw new Error("No USB printer connected");
        }

        // ESC/POS Initialize
        const ESC = 0x1b;
        const GS = 0x1d;
        const LF = 0x0a;

        const commands = new Uint8Array([
            // Initialize
            ESC, 0x40,
            // Center align
            ESC, 0x61, 0x01,
            // Bold on
            ESC, 0x45, 0x01,
        ]);

        await this.sendRawData(commands);

        const text =
            "=== TEST PRINT ===\n\n" +
            "GloryPOS Printer Test\n" +
            `Date: ${new Date().toLocaleString()}\n` +
            "Connection: USB\n\n" +
            "--------------------------------\n" +
            "If you can read this,\n" +
            "your printer is working!\n" +
            "--------------------------------\n\n\n";

        await this.sendText(text);

        // Cut paper
        const cutCommand = new Uint8Array([GS, 0x56, 0x00]);
        await this.sendRawData(cutCommand);
    }
}

// Singleton export
export const USBPrinter = new USBPrinterClass();
export default USBPrinter;
