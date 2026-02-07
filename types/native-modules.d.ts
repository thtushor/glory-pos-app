/**
 * Type declarations for optional native dependencies
 * These modules are dynamically imported at runtime
 */

// USB Serial for Android - optional dependency
declare module "react-native-usb-serialport-for-android" {
    export interface USBDevice {
        deviceId: number;
        vendorId: number;
        productId: number;
        name: string;
        deviceClass?: number;
    }

    interface USBSerialPort {
        list(): Promise<USBDevice[]>;
        open(deviceId: number, options?: {
            baudRate?: number;
            dataBits?: number;
            stopBits?: number;
            parity?: number;
        }): Promise<void>;
        write(data: string): Promise<void>;
        writeBase64(data: string): Promise<void>;
        close(): Promise<void>;
        on(event: string, callback: (...args: any[]) => void): void;
    }

    const USBSerial: USBSerialPort;
    export default USBSerial;
}

// Bluetooth ESC/POS Printer - optional dependency
declare module "react-native-bluetooth-escpos-printer" {
    export interface BluetoothDeviceInfo {
        name: string;
        address: string;
    }

    export interface BluetoothManagerType {
        isBluetoothEnabled(): Promise<boolean>;
        enableBluetooth(): Promise<void>;
        disableBluetooth(): Promise<void>;
        scanDevices(): Promise<void>;
        connect(address: string): Promise<void>;
        disconnect(address: string): Promise<void>;
        EVENT_DEVICE_FOUND: string;
        EVENT_DEVICE_ALREADY_PAIRED: string;
        EVENT_CONNECTION_LOST: string;
        EVENT_BLUETOOTH_NOT_SUPPORT: string;
    }

    export interface BluetoothEscposPrinterType {
        printerInit(): Promise<void>;
        printText(text: string, options?: any): Promise<void>;
        printColumn(widths: number[], aligns: number[], texts: string[], options?: any): Promise<void>;
        printPic(base64: string, options?: any): Promise<void>;
        printerAlign(align: number): Promise<void>;
        setBlob(weight: number): Promise<void>;
        printAndFeed(feed: number): Promise<void>;
        printerUnderLine(line: number): Promise<void>;
        cutOnePoint(): Promise<void>;
    }

    export const BluetoothManager: BluetoothManagerType;
    export const BluetoothEscposPrinter: BluetoothEscposPrinterType;
}

// TCP Socket - optional dependency
declare module "react-native-tcp-socket" {
    interface TcpSocket {
        connect(options: { host: string; port: number }): TcpSocket;
        write(data: Buffer | Uint8Array | string): boolean;
        end(): void;
        destroy(): void;
        on(event: string, callback: (...args: any[]) => void): void;
        once(event: string, callback: (...args: any[]) => void): void;
    }

    interface TcpSocketModule {
        createConnection(options: { host: string; port: number }): TcpSocket;
    }

    const TcpSocket: TcpSocketModule;
    export default TcpSocket;
}
