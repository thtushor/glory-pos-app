/**
 * usePrinter Hook
 * React hook for printer state and operations
 */

import { useCallback, useEffect, useState } from "react";
import PrinterService from "../services/printer/PrinterService";
import printerStorage from "../services/printer/PrinterStorage";
import type { PrinterConfig, PrinterState } from "../types/printer";

export interface UsePrinterReturn {
    // State
    state: PrinterState;
    isConnected: boolean;
    isConnecting: boolean;
    isPrinting: boolean;
    connectedPrinter: PrinterConfig | null;
    savedPrinters: PrinterConfig[];

    // Actions
    connect: (config: PrinterConfig) => Promise<boolean>;
    disconnect: () => Promise<void>;
    testPrint: () => Promise<void>;
    refreshSavedPrinters: () => Promise<void>;
    deletePrinter: (id: string) => Promise<void>;
    setDefaultPrinter: (id: string) => Promise<void>;
}

export function usePrinter(): UsePrinterReturn {
    const [state, setState] = useState<PrinterState>(PrinterService.getState());
    const [savedPrinters, setSavedPrinters] = useState<PrinterConfig[]>([]);

    // Subscribe to printer service events
    useEffect(() => {
        // Initialize printer service
        PrinterService.initialize();

        // Subscribe to state changes
        const unsubscribe = PrinterService.subscribe((event) => {
            if (event.type === "state_changed") {
                setState(event.data);
            }
        });

        // Load saved printers
        loadSavedPrinters();

        return () => {
            unsubscribe();
        };
    }, []);

    const loadSavedPrinters = async () => {
        try {
            const printers = await printerStorage.getAllPrinters();
            setSavedPrinters(printers);
        } catch (error) {
            console.error("[usePrinter] Failed to load saved printers:", error);
        }
    };

    const connect = useCallback(async (config: PrinterConfig): Promise<boolean> => {
        const success = await PrinterService.connect(config);
        if (success) {
            await printerStorage.savePrinter(config);
            await loadSavedPrinters();
        }
        return success;
    }, []);

    const disconnect = useCallback(async (): Promise<void> => {
        await PrinterService.disconnect();
    }, []);

    const testPrint = useCallback(async (): Promise<void> => {
        await PrinterService.testPrint();
    }, []);

    const refreshSavedPrinters = useCallback(async (): Promise<void> => {
        await loadSavedPrinters();
    }, []);

    const deletePrinter = useCallback(async (id: string): Promise<void> => {
        await printerStorage.deletePrinter(id);
        await loadSavedPrinters();
    }, []);

    const setDefaultPrinter = useCallback(async (id: string): Promise<void> => {
        await printerStorage.setDefaultPrinter(id);
        await loadSavedPrinters();
    }, []);

    return {
        state,
        isConnected: state.status === "connected",
        isConnecting: state.status === "connecting",
        isPrinting: state.status === "printing",
        connectedPrinter: state.connectedPrinter,
        savedPrinters,
        connect,
        disconnect,
        testPrint,
        refreshSavedPrinters,
        deletePrinter,
        setDefaultPrinter,
    };
}

export default usePrinter;
