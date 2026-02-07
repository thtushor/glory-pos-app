/**
 * Printer Type Definitions
 * Production-grade types for multi-protocol thermal printing
 */

// Printer connection types
export type PrinterConnectionType = "bluetooth" | "usb" | "network" | "wifi";

// Printer status
export type PrinterStatus =
    | "disconnected"
    | "connecting"
    | "connected"
    | "printing"
    | "error";

// Print job types matching frontend
export type PrintJobType = "KOT" | "INVOICE" | "BARCODE" | "BARCODE_LABEL";

// Bluetooth device info
export interface BluetoothDevice {
    id: string;
    name: string;
    address: string;
    rssi?: number;
    paired: boolean;
}

// USB device info
export interface USBDevice {
    deviceId: number;
    vendorId: number;
    productId: number;
    name: string;
}

// Network printer info
export interface NetworkPrinter {
    ip: string;
    port: number;
    name: string;
}

// Unified printer config
export interface PrinterConfig {
    id: string;
    name: string;
    type: PrinterConnectionType;
    address: string; // BT address, USB ID, or IP:port
    isDefault: boolean;
    paperWidth: 58 | 80; // mm
    lastConnected?: number;
}

// Print job from WebView
export interface PrintJob {
    id: string;
    type: PrintJobType;
    payload: InvoiceData | KOTData | BarcodeData;
    timestamp: number;
    status: "pending" | "printing" | "completed" | "failed";
    retryCount: number;
    error?: string;
}

// Invoice data structure (matches frontend InvoiceData)
export interface InvoiceData {
    invoiceNumber: string;
    guestNumber?: number;
    specialNotes?: number | string;
    tableNumber?: string;
    spec?: string;
    date: string;
    customer: {
        name: string;
        phone: string;
        email: string;
    };
    items: InvoiceItem[];
    summary: {
        subtotal: string;
        tax: string;
        taxRate: string;
        discount: string;
        discountRate: string;
        total: string;
    };
    payment: {
        method: "cash" | "card" | "mobile_banking" | "mixed";
        status: string;
        cashAmount?: number;
        cardAmount?: number;
        walletAmount?: number;
        paidAmount: number;
        totalAmount: number;
        remainingAmount: number;
        isPaid: boolean;
        isPartial: boolean;
    };
    orderStatus: string;
    businessInfo: {
        name: string;
        address: string;
        phone: string;
        email: string;
        website: string;
        taxId: string;
    };
    stats: {
        totalItems: number;
        totalUniqueItems: number;
        averageItemPrice: string;
    };
}

export interface InvoiceItem {
    productName: string;
    sku: string;
    details: string;
    quantity: number;
    unitPrice: number;
    originalUnitPrice?: number;
    subtotal: number;
    originalSubtotal?: number;
    discount?: {
        type: "percentage" | "amount";
        unitDiscount: number;
        totalDiscount: number;
        hasDiscount: boolean;
        discountAmount: number;
    };
}

// KOT data (simplified invoice for kitchen)
export type KOTData = InvoiceData;

// Barcode data for barcode label printing
export interface BarcodeData {
    sku: string;
    productName: string;
    price: number;
    quantity: number;
    brandName?: string;
    categoryName?: string;
    modelNo?: string;
    shopName?: string;
    labelSize?: {
        widthMm: number;
        heightMm: number;
    };
}

// WebView message format
export interface WebViewPrintMessage {
    type: "PRINT_KOT" | "PRINT_INVOICE" | "PRINT_BARCODE" | "PRINT_BARCODE_LABEL";
    payload: InvoiceData | KOTData | BarcodeData;
}

// Printer service events
export type PrinterEventType =
    | "device_found"
    | "device_connected"
    | "device_disconnected"
    | "print_started"
    | "print_completed"
    | "print_failed"
    | "error";

export interface PrinterEvent {
    type: PrinterEventType;
    data?: any;
    error?: string;
    timestamp: number;
}

// Printer service state
export interface PrinterState {
    status: PrinterStatus;
    connectedPrinter: PrinterConfig | null;
    availableDevices: BluetoothDevice[];
    printQueue: PrintJob[];
    lastError: string | null;
}
