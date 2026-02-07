/**
 * ESC/POS Encoder for Thermal Printers
 * Generates raw byte commands for 58mm/80mm thermal printers
 */

import type { BarcodeData, InvoiceData, KOTData } from "../../types/printer";

// ESC/POS Command Constants
const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

// Command builders
const COMMANDS = {
    // Initialize printer
    INIT: new Uint8Array([ESC, 0x40]),

    // Text formatting
    BOLD_ON: new Uint8Array([ESC, 0x45, 0x01]),
    BOLD_OFF: new Uint8Array([ESC, 0x45, 0x00]),

    // Alignment
    ALIGN_LEFT: new Uint8Array([ESC, 0x61, 0x00]),
    ALIGN_CENTER: new Uint8Array([ESC, 0x61, 0x01]),
    ALIGN_RIGHT: new Uint8Array([ESC, 0x61, 0x02]),

    // Text size
    SIZE_NORMAL: new Uint8Array([GS, 0x21, 0x00]),
    SIZE_DOUBLE_HEIGHT: new Uint8Array([GS, 0x21, 0x01]),
    SIZE_DOUBLE_WIDTH: new Uint8Array([GS, 0x21, 0x10]),
    SIZE_DOUBLE: new Uint8Array([GS, 0x21, 0x11]),

    // Line feed
    LINE_FEED: new Uint8Array([LF]),

    // Cut paper
    CUT_PARTIAL: new Uint8Array([GS, 0x56, 0x01]),
    CUT_FULL: new Uint8Array([GS, 0x56, 0x00]),

    // Feed and cut
    FEED_AND_CUT: new Uint8Array([ESC, 0x64, 0x03, GS, 0x56, 0x00]),
};

// Paper width configurations
const PAPER_CONFIG = {
    58: { charsPerLine: 32 },
    80: { charsPerLine: 48 },
};

export class ESCPOSEncoder {
    private buffer: number[] = [];
    private paperWidth: 58 | 80;
    private charsPerLine: number;

    constructor(paperWidth: 58 | 80 = 80) {
        this.paperWidth = paperWidth;
        this.charsPerLine = PAPER_CONFIG[paperWidth].charsPerLine;
        this.initialize();
    }

    // Initialize printer
    private initialize(): this {
        this.buffer.push(...COMMANDS.INIT);
        return this;
    }

    // Add raw bytes
    raw(bytes: Uint8Array | number[]): this {
        this.buffer.push(...bytes);
        return this;
    }

    // Add text
    text(content: string): this {
        const encoder = new TextEncoder();
        const bytes = encoder.encode(content);
        this.buffer.push(...bytes);
        return this;
    }

    // Add line with newline
    line(content: string = ""): this {
        this.text(content);
        this.buffer.push(LF);
        return this;
    }

    // Bold text
    bold(enabled: boolean = true): this {
        this.raw(enabled ? COMMANDS.BOLD_ON : COMMANDS.BOLD_OFF);
        return this;
    }

    // Text alignment
    align(alignment: "left" | "center" | "right"): this {
        const cmd =
            alignment === "center"
                ? COMMANDS.ALIGN_CENTER
                : alignment === "right"
                    ? COMMANDS.ALIGN_RIGHT
                    : COMMANDS.ALIGN_LEFT;
        this.raw(cmd);
        return this;
    }

    // Text size
    size(size: "normal" | "double" | "double-height" | "double-width"): this {
        const cmd =
            size === "double"
                ? COMMANDS.SIZE_DOUBLE
                : size === "double-height"
                    ? COMMANDS.SIZE_DOUBLE_HEIGHT
                    : size === "double-width"
                        ? COMMANDS.SIZE_DOUBLE_WIDTH
                        : COMMANDS.SIZE_NORMAL;
        this.raw(cmd);
        return this;
    }

    // Empty lines
    feed(lines: number = 1): this {
        for (let i = 0; i < lines; i++) {
            this.buffer.push(LF);
        }
        return this;
    }

    // Cut paper
    cut(partial: boolean = false): this {
        this.feed(3);
        this.raw(partial ? COMMANDS.CUT_PARTIAL : COMMANDS.CUT_FULL);
        return this;
    }

    // Separator line
    separator(char: string = "-"): this {
        this.line(char.repeat(this.charsPerLine));
        return this;
    }

    // Two column layout (left-right)
    twoColumn(left: string, right: string): this {
        const space = Math.max(this.charsPerLine - left.length - right.length, 1);
        this.line(left + " ".repeat(space) + right);
        return this;
    }

    // Three column layout
    threeColumn(left: string, center: string, right: string): this {
        const totalLen = left.length + center.length + right.length;
        const remainingSpace = this.charsPerLine - totalLen;
        const leftSpace = Math.floor(remainingSpace / 2);
        const rightSpace = remainingSpace - leftSpace;
        this.line(left + " ".repeat(leftSpace) + center + " ".repeat(rightSpace) + right);
        return this;
    }

    // Center text
    centerText(content: string): this {
        const padding = Math.max(0, Math.floor((this.charsPerLine - content.length) / 2));
        this.line(" ".repeat(padding) + content);
        return this;
    }

    // Word wrap
    wrap(content: string): this {
        const words = content.split(" ");
        let currentLine = "";

        for (const word of words) {
            if ((currentLine + " " + word).trim().length <= this.charsPerLine) {
                currentLine = (currentLine + " " + word).trim();
            } else {
                if (currentLine) this.line(currentLine);
                currentLine = word;
            }
        }
        if (currentLine) this.line(currentLine);
        return this;
    }

    // Get encoded bytes
    encode(): Uint8Array {
        return new Uint8Array(this.buffer);
    }

    // Reset buffer
    reset(): this {
        this.buffer = [];
        this.initialize();
        return this;
    }

    // ========== Receipt Generators ==========

    // Generate KOT receipt
    static generateKOT(data: KOTData, paperWidth: 58 | 80 = 80): Uint8Array {
        const encoder = new ESCPOSEncoder(paperWidth);
        const WIDTH = paperWidth === 58 ? 32 : 48;
        const QTY_WIDTH = 5;
        const ITEM_WIDTH = WIDTH - QTY_WIDTH - 2;

        encoder
            .align("center")
            .bold(true)
            .line(data.businessInfo.name)
            .bold(false)
            .size("double")
            .line("KITCHEN ORDER TICKET")
            .size("normal")
            .line(new Date(data.date).toLocaleString())
            .separator()
            .align("left");

        // Table & Guest info
        if (data.tableNumber) {
            encoder.line(`Table : ${data.tableNumber}`);
        }
        if (data.guestNumber) {
            encoder.line(`Guests: ${data.guestNumber}`);
        }

        // Items header
        encoder
            .separator()
            .bold(true)
            .line("QTY ".padEnd(QTY_WIDTH) + "ITEM")
            .bold(false);

        // Items
        data.items.forEach((item) => {
            const qty = `${item.quantity}x`.padEnd(QTY_WIDTH);
            const name = item.productName.slice(0, ITEM_WIDTH);
            encoder.line(qty + name);

            if (item.details) {
                encoder.line(`     ${item.details.slice(0, WIDTH - 5)}`);
            }
        });

        encoder.separator();

        // Total items
        const totalQty = data.items.reduce((sum, item) => sum + item.quantity, 0);
        encoder.bold(true).line(`Total Items: ${totalQty}`);

        // Special notes
        if (data.specialNotes && String(data.specialNotes).trim()) {
            encoder
                .feed()
                .bold(true)
                .line("SPECIAL INSTRUCTIONS:")
                .bold(false)
                .wrap(String(data.specialNotes));
        }

        encoder.cut();

        return encoder.encode();
    }

    // Generate Invoice receipt
    static generateInvoice(data: InvoiceData, paperWidth: 58 | 80 = 80): Uint8Array {
        const encoder = new ESCPOSEncoder(paperWidth);
        const WIDTH = paperWidth === 58 ? 32 : 48;
        const QTY_WIDTH = 5;
        const TOTAL_WIDTH = 10;
        const ITEM_WIDTH = WIDTH - QTY_WIDTH - TOTAL_WIDTH;

        // Header
        encoder
            .align("center")
            .bold(true)
            .line(data.businessInfo.name)
            .bold(false)
            .line(data.businessInfo.address)
            .line(`Tel: ${data.businessInfo.phone}`)
            .separator()
            .bold(true)
            .line("INVOICE")
            .bold(false)
            .align("left");

        // Meta info
        encoder
            .line(`Invoice : #${data.invoiceNumber}`)
            .line(`Date    : ${new Date(data.date).toLocaleString()}`);

        if (data.tableNumber) {
            encoder.line(`Table   : ${data.tableNumber}`);
        }
        if (data.guestNumber) {
            encoder.line(`Guests  : ${data.guestNumber}`);
        }

        encoder
            .line(`Customer: ${data.customer.name}`)
            .line(`Phone   : ${data.customer.phone}`)
            .separator();

        // Items header
        encoder
            .bold(true)
            .line(
                "QTY ".padEnd(QTY_WIDTH) +
                "ITEM".padEnd(ITEM_WIDTH) +
                "TOTAL".padStart(TOTAL_WIDTH)
            )
            .bold(false);

        // Items
        data.items.forEach((item) => {
            const qty = `${item.quantity}x`.padEnd(QTY_WIDTH);
            const name = item.productName.slice(0, ITEM_WIDTH - 2);
            const total = String(Math.round(item.subtotal)).padStart(TOTAL_WIDTH - 2);
            encoder.line(qty + name.padEnd(ITEM_WIDTH - 1) + ".." + total);

            if (item.details) {
                encoder.line(`     ${item.details.slice(0, WIDTH - 5)}`);
            }
        });

        encoder.separator();

        // Totals
        encoder
            .bold(true)
            .twoColumn("TOTAL:", String(Number(data.summary.total)))
            .bold(false)
            .feed();

        // Payment info
        const paymentMethod =
            data.payment.method === "mobile_banking"
                ? "Mobile Banking"
                : data.payment.method.toUpperCase();

        encoder
            .twoColumn("Payment Method:", paymentMethod)
            .twoColumn("Payment Status:", data.payment.status)
            .bold(true)
            .twoColumn("Paid Amount:", String(Number(data.payment.paidAmount)));

        if (data.payment.remainingAmount > 0) {
            encoder.twoColumn("Remaining:", String(Number(data.payment.remainingAmount)));
        }

        // Footer
        encoder
            .separator()
            .align("center")
            .bold(true)
            .line("THANK YOU!")
            .cut();

        return encoder.encode();
    }

    /**
     * Generate Barcode Label for ESC/POS thermal printers
     * This creates a text-based barcode label with CODE128 barcode
     */
    static generateBarcodeLabel(data: BarcodeData, paperWidth: 58 | 80 = 80): Uint8Array {
        const encoder = new ESCPOSEncoder(paperWidth);

        const topText = [data.brandName, data.categoryName, data.modelNo]
            .filter(Boolean)
            .join(" / ");

        encoder
            .align("center")
            .line(topText.substring(0, paperWidth === 58 ? 28 : 44))
            .bold(true)
            .line(`SHOP: ${data.shopName || ""}`)
            .bold(false)
            .feed();

        // ESC/POS barcode command
        // GS k m n d1...dn (CODE128, type = 73)
        encoder.printBarcode(data.sku);

        encoder.feed(2).cut();

        return encoder.encode();
    }

    /**
     * Print CODE128 barcode using ESC/POS commands
     */
    printBarcode(data: string): this {
        // Set barcode height (GS h n)
        this.raw(new Uint8Array([GS, 0x68, 50])); // Height: 50 dots

        // Set barcode width (GS w n)
        this.raw(new Uint8Array([GS, 0x77, 2])); // Width: 2 (medium)

        // Set barcode text position (GS H n)
        this.raw(new Uint8Array([GS, 0x48, 2])); // Text below barcode

        // Print barcode (GS k m n d1...dn)
        // m = 73 for CODE128
        const barcodeData = new TextEncoder().encode(data);
        const cmd = new Uint8Array([GS, 0x6b, 73, barcodeData.length, ...barcodeData]);
        this.raw(cmd);

        return this;
    }

    /**
     * Generate TSPL commands for dedicated barcode label printers
     * Compatible with Xprinter, TSC, and similar label printers
     */
    static generateTSPLLabel(data: BarcodeData): string {
        const width = data.labelSize?.widthMm || 35;
        const height = data.labelSize?.heightMm || 18;

        const topText = [data.brandName, data.categoryName, data.modelNo]
            .filter(Boolean)
            .join(" / ")
            .substring(0, 25);

        let commands = `SIZE ${width} mm, ${height} mm\r\n`;
        commands += `GAP 2 mm, 0\r\n`;
        commands += `DIRECTION 1\r\n`;
        commands += `CLS\r\n`;

        // Text commands (centered roughly)
        const centerX = Math.round((width * 8) / 2); // 8 dots/mm
        commands += `TEXT ${centerX},15,"0",0,1,1,3,"${topText}"\r\n`;
        commands += `TEXT ${centerX},40,"0",0,1,1,3,"SHOP: ${data.shopName || ""}"\r\n`;

        // Barcode command (Code128, height 50, readable below)
        commands += `BARCODE 40,70,"128",50,1,0,2,2,"${data.sku}"\r\n`;

        // Print command
        commands += `PRINT ${data.quantity || 1}\r\n`;

        return commands;
    }
}

export default ESCPOSEncoder;
