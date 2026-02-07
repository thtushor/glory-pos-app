/**
 * WebView Message Handler
 * Parses and routes messages from the frontend WebView
 */

import type {
    BarcodeData,
    InvoiceData,
    KOTData
} from "../types/printer";
import PrinterService from "./printer/PrinterService";

// Message types from frontend
type MessageType =
    | "PRINT_KOT"
    | "PRINT_INVOICE"
    | "PRINT_BARCODE"
    | "PRINT_BARCODE_LABEL"
    | "GET_PRINTER_STATUS"
    | "CONNECT_PRINTER"
    | "DISCONNECT_PRINTER";

interface WebViewMessage {
    type: MessageType;
    payload?: any;
}

// Response to send back to WebView
interface WebViewResponse {
    type: string;
    success: boolean;
    data?: any;
    error?: string;
}

class WebViewMessageHandlerClass {
    private webViewRef: any = null;

    /**
     * Set the WebView reference for sending responses
     */
    setWebViewRef(ref: any): void {
        this.webViewRef = ref;
    }

    /**
     * Handle incoming message from WebView
     */
    async handleMessage(messageData: string): Promise<void> {
        console.log("[WebViewHandler] Received message:", messageData.substring(0, 100));

        try {
            const message: WebViewMessage = JSON.parse(messageData);

            if (!message.type) {
                console.warn("[WebViewHandler] Message missing type");
                return;
            }

            switch (message.type) {
                case "PRINT_KOT":
                    await this.handlePrintKOT(message.payload);
                    break;

                case "PRINT_INVOICE":
                    await this.handlePrintInvoice(message.payload);
                    break;

                case "PRINT_BARCODE":
                    await this.handlePrintBarcode(message.payload);
                    break;

                case "PRINT_BARCODE_LABEL":
                    await this.handlePrintBarcodeLabel(message.payload);
                    break;

                case "GET_PRINTER_STATUS":
                    await this.handleGetPrinterStatus();
                    break;

                case "CONNECT_PRINTER":
                    await this.handleConnectPrinter(message.payload);
                    break;

                case "DISCONNECT_PRINTER":
                    await this.handleDisconnectPrinter();
                    break;

                default:
                    console.warn("[WebViewHandler] Unknown message type:", message.type);
            }
        } catch (error: any) {
            console.error("[WebViewHandler] Failed to parse message:", error);
            this.sendResponse({
                type: "ERROR",
                success: false,
                error: error.message || "Failed to process message",
            });
        }
    }

    // ========== Print Handlers ==========

    private async handlePrintKOT(payload: KOTData): Promise<void> {
        console.log("[WebViewHandler] Processing KOT print request");

        if (!payload) {
            this.sendResponse({
                type: "PRINT_KOT_RESPONSE",
                success: false,
                error: "No payload provided",
            });
            return;
        }

        try {
            const jobId = await PrinterService.addPrintJob("KOT", payload);

            this.sendResponse({
                type: "PRINT_KOT_RESPONSE",
                success: true,
                data: { jobId, message: "KOT print job queued" },
            });
        } catch (error: any) {
            this.sendResponse({
                type: "PRINT_KOT_RESPONSE",
                success: false,
                error: error.message || "Failed to queue KOT print",
            });
        }
    }

    private async handlePrintInvoice(payload: InvoiceData): Promise<void> {
        console.log("[WebViewHandler] Processing Invoice print request");

        if (!payload) {
            this.sendResponse({
                type: "PRINT_INVOICE_RESPONSE",
                success: false,
                error: "No payload provided",
            });
            return;
        }

        try {
            const jobId = await PrinterService.addPrintJob("INVOICE", payload);

            this.sendResponse({
                type: "PRINT_INVOICE_RESPONSE",
                success: true,
                data: { jobId, message: "Invoice print job queued" },
            });
        } catch (error: any) {
            this.sendResponse({
                type: "PRINT_INVOICE_RESPONSE",
                success: false,
                error: error.message || "Failed to queue Invoice print",
            });
        }
    }

    private async handlePrintBarcode(payload: BarcodeData): Promise<void> {
        console.log("[WebViewHandler] Processing Barcode print request");

        if (!payload || !payload.sku) {
            this.sendResponse({
                type: "PRINT_BARCODE_RESPONSE",
                success: false,
                error: "No SKU provided",
            });
            return;
        }

        try {
            const jobId = await PrinterService.addPrintJob("BARCODE", payload);

            this.sendResponse({
                type: "PRINT_BARCODE_RESPONSE",
                success: true,
                data: { jobId, message: "Barcode print job queued" },
            });
        } catch (error: any) {
            this.sendResponse({
                type: "PRINT_BARCODE_RESPONSE",
                success: false,
                error: error.message || "Failed to queue barcode print",
            });
        }
    }

    private async handlePrintBarcodeLabel(payload: BarcodeData): Promise<void> {
        console.log("[WebViewHandler] Processing Barcode Label print request");

        if (!payload || !payload.sku) {
            this.sendResponse({
                type: "PRINT_BARCODE_LABEL_RESPONSE",
                success: false,
                error: "No SKU provided",
            });
            return;
        }

        try {
            const jobId = await PrinterService.addPrintJob("BARCODE_LABEL", payload);

            this.sendResponse({
                type: "PRINT_BARCODE_LABEL_RESPONSE",
                success: true,
                data: { jobId, message: "Barcode label print job queued" },
            });
        } catch (error: any) {
            this.sendResponse({
                type: "PRINT_BARCODE_LABEL_RESPONSE",
                success: false,
                error: error.message || "Failed to queue barcode label print",
            });
        }
    }

    // ========== Printer Status Handlers ==========

    private async handleGetPrinterStatus(): Promise<void> {
        const state = PrinterService.getState();

        this.sendResponse({
            type: "PRINTER_STATUS_RESPONSE",
            success: true,
            data: {
                status: state.status,
                connectedPrinter: state.connectedPrinter
                    ? {
                        name: state.connectedPrinter.name,
                        type: state.connectedPrinter.type,
                        paperWidth: state.connectedPrinter.paperWidth,
                    }
                    : null,
                queueLength: state.printQueue.length,
            },
        });
    }

    private async handleConnectPrinter(payload: any): Promise<void> {
        // This would trigger printer connection flow
        // Full implementation in Phase 3
        this.sendResponse({
            type: "CONNECT_PRINTER_RESPONSE",
            success: false,
            error: "Connect from Settings menu",
        });
    }

    private async handleDisconnectPrinter(): Promise<void> {
        try {
            await PrinterService.disconnect();
            this.sendResponse({
                type: "DISCONNECT_PRINTER_RESPONSE",
                success: true,
                data: { message: "Printer disconnected" },
            });
        } catch (error: any) {
            this.sendResponse({
                type: "DISCONNECT_PRINTER_RESPONSE",
                success: false,
                error: error.message || "Failed to disconnect",
            });
        }
    }

    // ========== Response Sender ==========

    /**
     * Send response back to WebView
     */
    private sendResponse(response: WebViewResponse): void {
        if (!this.webViewRef?.current) {
            console.warn("[WebViewHandler] No WebView ref to send response");
            return;
        }

        try {
            const script = `
        (function() {
          window.dispatchEvent(new CustomEvent('nativePrinterResponse', {
            detail: ${JSON.stringify(response)}
          }));
        })();
        true;
      `;

            this.webViewRef.current.injectJavaScript(script);
            console.log("[WebViewHandler] Response sent:", response.type);
        } catch (error) {
            console.error("[WebViewHandler] Failed to send response:", error);
        }
    }

    /**
     * Send printer status update to WebView
     */
    sendStatusUpdate(): void {
        const state = PrinterService.getState();

        this.sendResponse({
            type: "PRINTER_STATUS_UPDATE",
            success: true,
            data: {
                status: state.status,
                connectedPrinter: state.connectedPrinter?.name || null,
            },
        });
    }
}

export const WebViewMessageHandler = new WebViewMessageHandlerClass();
export default WebViewMessageHandler;
