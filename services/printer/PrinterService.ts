/**
 * PrinterService - Main Orchestrator
 * Handles print job routing, queue management, and multi-protocol printer coordination
 * Supports: Bluetooth, USB (Android), Network/WiFi printers
 */

import { Alert, Platform } from "react-native";
import type {
    BarcodeData,
    BluetoothDevice,
    InvoiceData,
    KOTData,
    PrinterConfig,
    PrinterConnectionType,
    PrinterState,
    PrinterStatus,
    PrintJob,
    PrintJobType,
} from "../../types/printer";
import { BluetoothPrinter } from "./BluetoothPrinter";
import { ESCPOSEncoder } from "./ESCPOSEncoder";
import { NetworkPrinter } from "./NetworkPrinter";
import printerStorage from "./PrinterStorage";
import { USBPrinter } from "./USBPrinter";

// Event callback types
type PrinterEventCallback = (event: {
    type: string;
    data?: any;
    error?: string;
}) => void;

class PrinterServiceClass {
    private state: PrinterState = {
        status: "disconnected",
        connectedPrinter: null,
        availableDevices: [],
        printQueue: [],
        lastError: null,
    };

    private eventListeners: Set<PrinterEventCallback> = new Set();
    private isInitialized: boolean = false;
    private isProcessingQueue: boolean = false;

    // ========== Initialization ==========

    async initialize(): Promise<void> {
        if (this.isInitialized) return;

        console.log("[PrinterService] Initializing...");

        try {
            // Load saved printer config and attempt auto-connect
            const defaultPrinter = await printerStorage.getDefaultPrinter();
            if (defaultPrinter) {
                console.log("[PrinterService] Found default printer:", defaultPrinter.name);

                // Attempt auto-connect to last used printer
                setTimeout(async () => {
                    try {
                        await this.connect(defaultPrinter);
                    } catch (error) {
                        console.log("[PrinterService] Auto-connect failed:", error);
                    }
                }, 1000);
            }

            this.isInitialized = true;
            console.log("[PrinterService] Initialized successfully");
        } catch (error) {
            console.error("[PrinterService] Initialization failed:", error);
        }
    }

    // ========== State Management ==========

    getState(): PrinterState {
        return { ...this.state };
    }

    private updateState(updates: Partial<PrinterState>): void {
        this.state = { ...this.state, ...updates };
        this.emit({ type: "state_changed", data: this.state });
    }

    private setStatus(status: PrinterStatus): void {
        this.updateState({ status });
    }

    private setError(error: string | null): void {
        this.updateState({ lastError: error });
    }

    // ========== Event System ==========

    subscribe(callback: PrinterEventCallback): () => void {
        this.eventListeners.add(callback);
        return () => this.eventListeners.delete(callback);
    }

    private emit(event: { type: string; data?: any; error?: string }): void {
        this.eventListeners.forEach((callback) => {
            try {
                callback(event);
            } catch (error) {
                console.error("[PrinterService] Event callback error:", error);
            }
        });
    }

    // ========== Device Scanning ==========

    /**
     * Get available printer connection methods
     */
    getAvailableMethods(): PrinterConnectionType[] {
        const methods: PrinterConnectionType[] = [];

        if (BluetoothPrinter.isAvailable()) {
            methods.push("bluetooth");
        }

        if (USBPrinter.isAvailable()) {
            methods.push("usb");
        }

        if (NetworkPrinter.isAvailable()) {
            methods.push("network");
        }

        // Fallback: always show connection types even if libraries not loaded
        if (methods.length === 0) {
            if (Platform.OS === "android") {
                methods.push("bluetooth", "usb", "network");
            } else if (Platform.OS === "ios") {
                methods.push("bluetooth", "network");
            }
        }

        return methods;
    }

    /**
     * Scan for Bluetooth printers
     */
    async scanBluetoothDevices(): Promise<BluetoothDevice[]> {
        console.log("[PrinterService] Scanning for Bluetooth devices...");

        this.updateState({ availableDevices: [] });

        try {
            const devices = await BluetoothPrinter.scanDevices((device) => {
                // Update available devices as they're found
                const current = this.state.availableDevices;
                if (!current.find((d) => d.address === device.address)) {
                    this.updateState({ availableDevices: [...current, device] });
                    this.emit({ type: "device_found", data: device });
                }
            });

            this.updateState({ availableDevices: devices });
            return devices;
        } catch (error: any) {
            console.error("[PrinterService] Bluetooth scan failed:", error);
            this.setError(error.message);
            throw error;
        }
    }

    /**
     * Get paired Bluetooth devices
     */
    async getPairedDevices(): Promise<BluetoothDevice[]> {
        try {
            return await BluetoothPrinter.getPairedDevices();
        } catch (error) {
            console.error("[PrinterService] Failed to get paired devices:", error);
            return [];
        }
    }

    /**
     * Scan for USB printers (Android only)
     */
    async scanUSBDevices(): Promise<any[]> {
        if (Platform.OS !== "android") {
            console.log("[PrinterService] USB scanning only available on Android");
            return [];
        }

        try {
            return await USBPrinter.listDevices();
        } catch (error) {
            console.error("[PrinterService] USB scan failed:", error);
            return [];
        }
    }

    /**
     * Discover network printers
     */
    async discoverNetworkPrinters(subnet?: string): Promise<any[]> {
        try {
            return await NetworkPrinter.discoverPrinters(subnet);
        } catch (error) {
            console.error("[PrinterService] Network discovery failed:", error);
            return [];
        }
    }

    // ========== Connection Management ==========

    /**
     * Connect to a printer
     */
    async connect(config: PrinterConfig): Promise<boolean> {
        console.log(`[PrinterService] Connecting to: ${config.name} (${config.type})`);

        this.setStatus("connecting");
        this.setError(null);

        try {
            let success = false;

            switch (config.type) {
                case "bluetooth":
                    success = await BluetoothPrinter.connect(config.address);
                    break;

                case "usb":
                    success = await USBPrinter.connect(parseInt(config.address));
                    break;

                case "network":
                case "wifi":
                    const [ip, port] = config.address.split(":");
                    success = await NetworkPrinter.connect(ip, parseInt(port) || 9100);
                    break;

                default:
                    throw new Error(`Unsupported printer type: ${config.type}`);
            }

            if (success) {
                this.updateState({
                    status: "connected",
                    connectedPrinter: config,
                    lastError: null,
                });

                await printerStorage.updateLastConnected(config.id);
                await printerStorage.savePrinter(config);

                this.emit({ type: "device_connected", data: config });
                console.log(`[PrinterService] Connected to: ${config.name}`);

                // Process any queued jobs
                this.processQueue();

                return true;
            }

            throw new Error("Connection failed");
        } catch (error: any) {
            console.error("[PrinterService] Connection failed:", error);

            this.updateState({
                status: "error",
                lastError: error.message || "Connection failed",
            });

            this.emit({ type: "error", error: error.message });
            return false;
        }
    }

    /**
     * Connect to Bluetooth device by address
     */
    async connectBluetooth(
        address: string,
        name: string,
        paperWidth: 58 | 80 = 80
    ): Promise<boolean> {
        const config: PrinterConfig = {
            id: `bt_${address.replace(/:/g, "")}`,
            name,
            type: "bluetooth",
            address,
            isDefault: false,
            paperWidth,
        };

        return this.connect(config);
    }

    /**
     * Connect to USB printer by device ID
     */
    async connectUSB(deviceId: number, name: string, paperWidth: 58 | 80 = 80): Promise<boolean> {
        const config: PrinterConfig = {
            id: `usb_${deviceId}`,
            name,
            type: "usb",
            address: String(deviceId),
            isDefault: false,
            paperWidth,
        };

        return this.connect(config);
    }

    /**
     * Connect to network printer by IP
     */
    async connectNetwork(
        ip: string,
        port: number = 9100,
        name?: string,
        paperWidth: 58 | 80 = 80
    ): Promise<boolean> {
        const config: PrinterConfig = {
            id: `net_${ip.replace(/\./g, "_")}_${port}`,
            name: name || `Network Printer (${ip})`,
            type: "network",
            address: `${ip}:${port}`,
            isDefault: false,
            paperWidth,
        };

        return this.connect(config);
    }

    /**
     * Disconnect from current printer
     */
    async disconnect(): Promise<void> {
        if (!this.state.connectedPrinter) return;

        const printerType = this.state.connectedPrinter.type;
        console.log(`[PrinterService] Disconnecting from: ${this.state.connectedPrinter.name}`);

        try {
            switch (printerType) {
                case "bluetooth":
                    await BluetoothPrinter.disconnect();
                    break;
                case "usb":
                    await USBPrinter.disconnect();
                    break;
                case "network":
                case "wifi":
                    await NetworkPrinter.disconnect();
                    break;
            }
        } catch (error) {
            console.error("[PrinterService] Error during disconnect:", error);
        }

        this.updateState({
            status: "disconnected",
            connectedPrinter: null,
        });

        this.emit({ type: "device_disconnected" });
    }

    // ========== Print Queue ==========

    /**
     * Add a print job to the queue
     */
    async addPrintJob(type: PrintJobType, payload: InvoiceData | KOTData | BarcodeData): Promise<string> {
        const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const job: PrintJob = {
            id: jobId,
            type,
            payload,
            timestamp: Date.now(),
            status: "pending",
            retryCount: 0,
        };

        this.state.printQueue.push(job);
        this.emit({ type: "job_added", data: job });

        console.log(`[PrinterService] Print job added: ${type} (${jobId})`);

        // Process queue
        this.processQueue();

        return jobId;
    }

    /**
     * Process the print queue
     */
    private async processQueue(): Promise<void> {
        if (this.isProcessingQueue) {
            console.log("[PrinterService] Queue already being processed");
            return;
        }

        const pendingJobs = this.state.printQueue.filter((j) => j.status === "pending");

        if (pendingJobs.length === 0) {
            console.log("[PrinterService] No pending jobs");
            return;
        }

        // Check if printer is connected
        if (this.state.status !== "connected" || !this.state.connectedPrinter) {
            console.log("[PrinterService] No printer connected, showing alert...");
            this.showNoPrinterAlert();
            return;
        }

        this.isProcessingQueue = true;

        // Process jobs sequentially
        for (const job of pendingJobs) {
            if (this.state.status !== "connected") {
                break; // Stop if disconnected mid-queue
            }
            await this.executePrintJob(job);
        }

        this.isProcessingQueue = false;
    }

    /**
     * Execute a single print job
     */
    private async executePrintJob(job: PrintJob): Promise<void> {
        console.log(`[PrinterService] Executing job: ${job.id}`);

        try {
            job.status = "printing";
            this.setStatus("printing");
            this.emit({ type: "print_started", data: job });

            // Generate ESC/POS data
            const paperWidth = this.state.connectedPrinter?.paperWidth || 80;
            let printData: Uint8Array;

            if (job.type === "KOT") {
                printData = ESCPOSEncoder.generateKOT(job.payload as KOTData, paperWidth);
            } else if (job.type === "INVOICE") {
                printData = ESCPOSEncoder.generateInvoice(job.payload as InvoiceData, paperWidth);
            } else if (job.type === "BARCODE" || job.type === "BARCODE_LABEL") {
                printData = ESCPOSEncoder.generateBarcodeLabel(job.payload as BarcodeData, paperWidth);
            } else {
                throw new Error(`Unsupported print job type: ${job.type}`);
            }

            // Send to appropriate printer
            await this.sendToPrinter(printData);

            // Mark as completed
            job.status = "completed";
            this.removeJobFromQueue(job.id);

            this.setStatus("connected");
            this.emit({ type: "print_completed", data: job });

            console.log(`[PrinterService] Job completed: ${job.id}`);
        } catch (error: any) {
            console.error(`[PrinterService] Job failed: ${job.id}`, error);

            job.retryCount++;
            job.error = error.message || "Print failed";

            if (job.retryCount < 3) {
                // Retry after delay
                job.status = "pending";
                console.log(`[PrinterService] Retrying job ${job.id} (attempt ${job.retryCount}/3)`);
                setTimeout(() => {
                    this.isProcessingQueue = false;
                    this.processQueue();
                }, 2000);
            } else {
                job.status = "failed";
                this.removeJobFromQueue(job.id);
                this.emit({ type: "print_failed", data: job, error: error.message });
                Alert.alert("Print Failed", `Failed to print ${job.type}: ${error.message}`);
            }

            this.setStatus("connected");
        }
    }

    private removeJobFromQueue(jobId: string): void {
        this.state.printQueue = this.state.printQueue.filter((j) => j.id !== jobId);
    }

    /**
     * Clear all pending jobs
     */
    clearQueue(): void {
        this.state.printQueue = this.state.printQueue.filter((j) => j.status === "printing");
        this.emit({ type: "queue_cleared" });
    }

    /**
     * Send data to connected printer
     */
    private async sendToPrinter(data: Uint8Array): Promise<void> {
        if (!this.state.connectedPrinter) {
            throw new Error("No printer connected");
        }

        const printerType = this.state.connectedPrinter.type;
        console.log(`[PrinterService] Sending ${data.length} bytes via ${printerType}`);

        switch (printerType) {
            case "bluetooth":
                await BluetoothPrinter.sendRawData(data);
                break;

            case "usb":
                await USBPrinter.sendRawData(data);
                break;

            case "network":
            case "wifi":
                await NetworkPrinter.sendRawData(data);
                break;

            default:
                throw new Error(`Unsupported printer type: ${printerType}`);
        }
    }

    // ========== Utility ==========

    private showNoPrinterAlert(): void {
        if (Platform.OS === "web") {
            console.warn("[PrinterService] No printer connected");
            return;
        }

        Alert.alert(
            "No Printer Connected",
            "Please connect a printer in Settings to print receipts.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Go to Settings",
                    onPress: () => {
                        this.emit({ type: "navigate_settings" });
                    },
                },
            ]
        );
    }

    /**
     * Test print - prints a test page
     */
    async testPrint(): Promise<void> {
        if (!this.state.connectedPrinter) {
            throw new Error("No printer connected");
        }

        console.log("[PrinterService] Sending test print...");

        const printerType = this.state.connectedPrinter.type;

        switch (printerType) {
            case "bluetooth":
                await BluetoothPrinter.testPrint();
                break;

            case "usb":
                await USBPrinter.testPrint();
                break;

            case "network":
            case "wifi":
                await NetworkPrinter.testPrint();
                break;

            default:
                // Fallback: use ESCPOSEncoder
                const encoder = new ESCPOSEncoder(this.state.connectedPrinter.paperWidth);

                encoder
                    .align("center")
                    .bold(true)
                    .line("=== TEST PRINT ===")
                    .bold(false)
                    .feed()
                    .line("GloryPOS Printer Test")
                    .line(`Date: ${new Date().toLocaleString()}`)
                    .line(`Printer: ${this.state.connectedPrinter.name}`)
                    .line(`Type: ${this.state.connectedPrinter.type}`)
                    .line(`Paper: ${this.state.connectedPrinter.paperWidth}mm`)
                    .feed()
                    .separator()
                    .line("If you can read this,")
                    .line("your printer is working!")
                    .separator()
                    .cut();

                await this.sendToPrinter(encoder.encode());
        }

        console.log("[PrinterService] Test print sent");
    }

    /**
     * Check Bluetooth availability
     */
    isBluetoothAvailable(): boolean {
        return BluetoothPrinter.isAvailable();
    }

    /**
     * Check USB availability
     */
    isUSBAvailable(): boolean {
        return USBPrinter.isAvailable();
    }

    /**
     * Check Network availability
     */
    isNetworkAvailable(): boolean {
        return NetworkPrinter.isAvailable();
    }
}

// Singleton instance
export const PrinterService = new PrinterServiceClass();
export default PrinterService;
