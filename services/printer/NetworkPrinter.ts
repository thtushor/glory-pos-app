/**
 * Network Printer Adapter
 * Handles WiFi/IP-based thermal printer connectivity via TCP sockets
 * 
 * Uses: react-native-tcp-socket (optional, for direct TCP)
 */

import type { NetworkPrinter } from "../../types/printer";

// Default ESC/POS printer port
const DEFAULT_PRINTER_PORT = 9100;

// TCP Socket types
interface TcpSocket {
    connect: (options: { host: string; port: number }) => TcpSocket;
    write: (data: Buffer | Uint8Array | string) => boolean;
    end: () => void;
    destroy: () => void;
    on: (event: string, callback: (...args: any[]) => void) => void;
    once: (event: string, callback: (...args: any[]) => void) => void;
}

interface TcpSocketModule {
    createConnection: (options: { host: string; port: number }) => TcpSocket;
}

class NetworkPrinterClass {
    private isLibraryAvailable: boolean = false;
    private TcpSocket: TcpSocketModule | null = null;
    private socket: TcpSocket | null = null;
    private connectedPrinter: NetworkPrinter | null = null;
    private isConnected: boolean = false;
    private connectionTimeout: number = 5000;

    constructor() {
        this.initializeLibrary();
    }

    /**
     * Initialize TCP socket library
     */
    private async initializeLibrary(): Promise<void> {
        try {
            const lib = await import("react-native-tcp-socket").catch(() => null);

            if (lib) {
                this.TcpSocket = lib.default;
                this.isLibraryAvailable = true;
                console.log("[NetworkPrinter] TCP library loaded successfully");
            } else {
                console.warn("[NetworkPrinter] TCP library not available");
            }
        } catch (error) {
            console.warn("[NetworkPrinter] Failed to load TCP library:", error);
            this.isLibraryAvailable = false;
        }
    }

    /**
     * Check if network printing is available
     */
    isAvailable(): boolean {
        return this.isLibraryAvailable;
    }

    /**
     * Connect to a network printer
     */
    async connect(ip: string, port: number = DEFAULT_PRINTER_PORT): Promise<boolean> {
        if (!this.TcpSocket) {
            throw new Error("TCP library not available");
        }

        console.log(`[NetworkPrinter] Connecting to: ${ip}:${port}`);

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.disconnect();
                reject(new Error("Connection timeout"));
            }, this.connectionTimeout);

            try {
                this.socket = this.TcpSocket!.createConnection({ host: ip, port });

                this.socket.on("connect", () => {
                    clearTimeout(timeout);
                    this.isConnected = true;
                    this.connectedPrinter = { ip, port, name: `Network Printer (${ip})` };
                    console.log("[NetworkPrinter] Connected successfully");
                    resolve(true);
                });

                this.socket.on("error", (error: any) => {
                    clearTimeout(timeout);
                    console.error("[NetworkPrinter] Connection error:", error);
                    this.isConnected = false;
                    reject(error);
                });

                this.socket.on("close", () => {
                    console.log("[NetworkPrinter] Connection closed");
                    this.isConnected = false;
                    this.connectedPrinter = null;
                });
            } catch (error) {
                clearTimeout(timeout);
                console.error("[NetworkPrinter] Failed to create socket:", error);
                reject(error);
            }
        });
    }

    /**
     * Disconnect from network printer
     */
    async disconnect(): Promise<void> {
        if (this.socket) {
            try {
                this.socket.destroy();
            } catch (error) {
                console.warn("[NetworkPrinter] Error destroying socket:", error);
            }
            this.socket = null;
        }

        this.isConnected = false;
        this.connectedPrinter = null;
        console.log("[NetworkPrinter] Disconnected");
    }

    /**
     * Get connected printer info
     */
    getConnectedPrinter(): NetworkPrinter | null {
        return this.connectedPrinter;
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
        if (!this.socket || !this.isConnected) {
            throw new Error("No network printer connected");
        }

        return new Promise((resolve, reject) => {
            try {
                const success = this.socket!.write(data);

                if (success) {
                    console.log(`[NetworkPrinter] Sent ${data.length} bytes`);
                    resolve();
                } else {
                    reject(new Error("Failed to write data to socket"));
                }
            } catch (error) {
                console.error("[NetworkPrinter] Send failed:", error);
                reject(error);
            }
        });
    }

    /**
     * Send text data
     */
    async sendText(text: string): Promise<void> {
        if (!this.socket || !this.isConnected) {
            throw new Error("No network printer connected");
        }

        return new Promise((resolve, reject) => {
            try {
                const success = this.socket!.write(text);

                if (success) {
                    console.log(`[NetworkPrinter] Sent text: ${text.length} chars`);
                    resolve();
                } else {
                    reject(new Error("Failed to write text to socket"));
                }
            } catch (error) {
                console.error("[NetworkPrinter] Send text failed:", error);
                reject(error);
            }
        });
    }

    /**
     * Discover printers on local network
     * Uses common printer ports to probe for ESC/POS devices
     */
    async discoverPrinters(
        subnet: string = "192.168.1",
        startIp: number = 1,
        endIp: number = 254
    ): Promise<NetworkPrinter[]> {
        if (!this.TcpSocket) {
            console.warn("[NetworkPrinter] TCP library not available for discovery");
            return [];
        }

        const printers: NetworkPrinter[] = [];
        const probeTimeout = 500; // ms per probe

        console.log(`[NetworkPrinter] Scanning ${subnet}.${startIp}-${endIp}...`);

        // Probe common printer IPs (this is simplified - real discovery would use mDNS/SNMP)
        const promises = [];

        for (let i = startIp; i <= endIp; i++) {
            const ip = `${subnet}.${i}`;

            const probePromise = new Promise<NetworkPrinter | null>((resolve) => {
                const timer = setTimeout(() => resolve(null), probeTimeout);

                try {
                    const testSocket = this.TcpSocket!.createConnection({
                        host: ip,
                        port: DEFAULT_PRINTER_PORT,
                    });

                    testSocket.once("connect", () => {
                        clearTimeout(timer);
                        testSocket.destroy();
                        resolve({ ip, port: DEFAULT_PRINTER_PORT, name: `Printer at ${ip}` });
                    });

                    testSocket.once("error", () => {
                        clearTimeout(timer);
                        resolve(null);
                    });
                } catch {
                    clearTimeout(timer);
                    resolve(null);
                }
            });

            promises.push(probePromise);
        }

        const results = await Promise.all(promises);

        for (const result of results) {
            if (result) {
                printers.push(result);
            }
        }

        console.log(`[NetworkPrinter] Found ${printers.length} network printers`);
        return printers;
    }

    /**
     * Test print
     */
    async testPrint(): Promise<void> {
        if (!this.isConnected) {
            throw new Error("No network printer connected");
        }

        // ESC/POS Initialize
        const ESC = 0x1b;
        const GS = 0x1d;

        const commands = new Uint8Array([
            // Initialize
            ESC, 0x40,
            // Center align
            ESC, 0x61, 0x01,
        ]);

        await this.sendRawData(commands);

        const text =
            "=== TEST PRINT ===\n\n" +
            "GloryPOS Printer Test\n" +
            `Date: ${new Date().toLocaleString()}\n` +
            `Address: ${this.connectedPrinter?.ip}:${this.connectedPrinter?.port}\n` +
            "Connection: Network/WiFi\n\n" +
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
export const NetworkPrinter = new NetworkPrinterClass();
export default NetworkPrinter;
