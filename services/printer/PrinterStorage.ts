/**
 * Printer Storage Service
 * Persist printer configurations using AsyncStorage
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { PrinterConfig } from "../../types/printer";

const STORAGE_KEYS = {
    PRINTERS: "@glorypos/printers",
    DEFAULT_PRINTER: "@glorypos/default_printer",
    PRINT_SETTINGS: "@glorypos/print_settings",
};

export interface PrintSettings {
    autoPrint: boolean;
    kotPapperWidth: 58 | 80;
    invoicePaperWidth: 58 | 80;
    showPrintDialog: boolean;
    soundEnabled: boolean;
}

const DEFAULT_SETTINGS: PrintSettings = {
    autoPrint: false,
    kotPapperWidth: 80,
    invoicePaperWidth: 80,
    showPrintDialog: true,
    soundEnabled: true,
};

class PrinterStorageService {
    // ========== Printer Configs ==========

    async savePrinter(printer: PrinterConfig): Promise<void> {
        try {
            const printers = await this.getAllPrinters();
            const existingIndex = printers.findIndex((p) => p.id === printer.id);

            if (existingIndex >= 0) {
                printers[existingIndex] = printer;
            } else {
                printers.push(printer);
            }

            await AsyncStorage.setItem(STORAGE_KEYS.PRINTERS, JSON.stringify(printers));

            // If this is the default printer, update the reference
            if (printer.isDefault) {
                await this.setDefaultPrinter(printer.id);
            }
        } catch (error) {
            console.error("[PrinterStorage] Failed to save printer:", error);
            throw error;
        }
    }

    async getAllPrinters(): Promise<PrinterConfig[]> {
        try {
            const data = await AsyncStorage.getItem(STORAGE_KEYS.PRINTERS);
            return data ? JSON.parse(data) : [];
        } catch (error) {
            console.error("[PrinterStorage] Failed to get printers:", error);
            return [];
        }
    }

    async getPrinterById(id: string): Promise<PrinterConfig | null> {
        const printers = await this.getAllPrinters();
        return printers.find((p) => p.id === id) || null;
    }

    async deletePrinter(id: string): Promise<void> {
        try {
            const printers = await this.getAllPrinters();
            const filtered = printers.filter((p) => p.id !== id);
            await AsyncStorage.setItem(STORAGE_KEYS.PRINTERS, JSON.stringify(filtered));

            // If deleted printer was default, clear default
            const defaultId = await this.getDefaultPrinterId();
            if (defaultId === id) {
                await AsyncStorage.removeItem(STORAGE_KEYS.DEFAULT_PRINTER);
            }
        } catch (error) {
            console.error("[PrinterStorage] Failed to delete printer:", error);
            throw error;
        }
    }

    // ========== Default Printer ==========

    async setDefaultPrinter(printerId: string): Promise<void> {
        try {
            // Clear previous default
            const printers = await this.getAllPrinters();
            const updated = printers.map((p) => ({
                ...p,
                isDefault: p.id === printerId,
            }));
            await AsyncStorage.setItem(STORAGE_KEYS.PRINTERS, JSON.stringify(updated));
            await AsyncStorage.setItem(STORAGE_KEYS.DEFAULT_PRINTER, printerId);
        } catch (error) {
            console.error("[PrinterStorage] Failed to set default printer:", error);
            throw error;
        }
    }

    async getDefaultPrinterId(): Promise<string | null> {
        try {
            return await AsyncStorage.getItem(STORAGE_KEYS.DEFAULT_PRINTER);
        } catch (error) {
            console.error("[PrinterStorage] Failed to get default printer:", error);
            return null;
        }
    }

    async getDefaultPrinter(): Promise<PrinterConfig | null> {
        const id = await this.getDefaultPrinterId();
        if (!id) return null;
        return this.getPrinterById(id);
    }

    // ========== Print Settings ==========

    async getSettings(): Promise<PrintSettings> {
        try {
            const data = await AsyncStorage.getItem(STORAGE_KEYS.PRINT_SETTINGS);
            return data ? { ...DEFAULT_SETTINGS, ...JSON.parse(data) } : DEFAULT_SETTINGS;
        } catch (error) {
            console.error("[PrinterStorage] Failed to get settings:", error);
            return DEFAULT_SETTINGS;
        }
    }

    async saveSettings(settings: Partial<PrintSettings>): Promise<void> {
        try {
            const current = await this.getSettings();
            const updated = { ...current, ...settings };
            await AsyncStorage.setItem(STORAGE_KEYS.PRINT_SETTINGS, JSON.stringify(updated));
        } catch (error) {
            console.error("[PrinterStorage] Failed to save settings:", error);
            throw error;
        }
    }

    // ========== Utility ==========

    async clearAll(): Promise<void> {
        try {
            await AsyncStorage.multiRemove([
                STORAGE_KEYS.PRINTERS,
                STORAGE_KEYS.DEFAULT_PRINTER,
                STORAGE_KEYS.PRINT_SETTINGS,
            ]);
        } catch (error) {
            console.error("[PrinterStorage] Failed to clear storage:", error);
            throw error;
        }
    }

    async updateLastConnected(printerId: string): Promise<void> {
        const printer = await this.getPrinterById(printerId);
        if (printer) {
            printer.lastConnected = Date.now();
            await this.savePrinter(printer);
        }
    }
}

export const printerStorage = new PrinterStorageService();
export default printerStorage;
