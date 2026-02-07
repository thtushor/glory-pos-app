/**
 * Printer Settings Page
 * Full printer management UI with Bluetooth, USB, and Network support
 */

import { Stack, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePrinter } from "../hooks/usePrinter";
import { BluetoothPrinter, PrinterService } from "../services/printer";
import type { BluetoothDevice, PrinterConfig, PrinterConnectionType } from "../types/printer";

type TabType = "bluetooth" | "usb" | "network";

export default function PrinterSettings() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const {
        state,
        isConnected,
        isConnecting,
        isPrinting,
        connectedPrinter,
        savedPrinters,
        disconnect,
        testPrint,
        deletePrinter,
        setDefaultPrinter,
        refreshSavedPrinters,
    } = usePrinter();

    // UI State
    const [activeTab, setActiveTab] = useState<TabType>("bluetooth");
    const [isScanning, setIsScanning] = useState(false);
    const [discoveredDevices, setDiscoveredDevices] = useState<BluetoothDevice[]>([]);
    const [usbDevices, setUsbDevices] = useState<any[]>([]);
    const [networkPrinters, setNetworkPrinters] = useState<any[]>([]);
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Network modal state
    const [showNetworkModal, setShowNetworkModal] = useState(false);
    const [networkIp, setNetworkIp] = useState("");
    const [networkPort, setNetworkPort] = useState("9100");
    const [networkName, setNetworkName] = useState("");

    // Paper width selection
    const [selectedPaperWidth, setSelectedPaperWidth] = useState<58 | 80>(80);

    // Refresh saved printers on mount
    useEffect(() => {
        refreshSavedPrinters();
    }, []);

    // ========== Bluetooth Scanning ==========

    const handleScanBluetooth = async () => {
        setIsScanning(true);
        setDiscoveredDevices([]);

        try {
            // Check if library is available
            if (!BluetoothPrinter.isAvailable()) {
                Alert.alert(
                    "Bluetooth Not Available",
                    "Bluetooth printing requires a development build. Please run 'expo prebuild' and 'expo run:android' to enable native Bluetooth support.",
                    [{ text: "OK" }]
                );
                setIsScanning(false);
                return;
            }

            // Request permissions and scan
            const devices = await PrinterService.scanBluetoothDevices();
            setDiscoveredDevices(devices);

            if (devices.length === 0) {
                Alert.alert(
                    "No Devices Found",
                    "No Bluetooth printers were found. Make sure your printer is turned on and in pairing mode.",
                    [{ text: "OK" }]
                );
            }
        } catch (error: any) {
            Alert.alert("Scan Failed", error.message || "Failed to scan for Bluetooth devices");
        } finally {
            setIsScanning(false);
        }
    };

    const handleConnectBluetooth = async (device: BluetoothDevice) => {
        try {
            const success = await PrinterService.connectBluetooth(
                device.address,
                device.name || "Bluetooth Printer",
                selectedPaperWidth
            );

            if (success) {
                Alert.alert("Connected", `Successfully connected to ${device.name}`);
                await refreshSavedPrinters();
            }
        } catch (error: any) {
            Alert.alert("Connection Failed", error.message || "Failed to connect to printer");
        }
    };

    // ========== USB Scanning ==========

    const handleScanUSB = async () => {
        if (Platform.OS !== "android") {
            Alert.alert("Not Supported", "USB printing is only available on Android");
            return;
        }

        setIsScanning(true);
        setUsbDevices([]);

        try {
            const devices = await PrinterService.scanUSBDevices();
            setUsbDevices(devices);

            if (devices.length === 0) {
                Alert.alert(
                    "No USB Printers",
                    "No USB printers found. Make sure your printer is connected via USB OTG cable.",
                    [{ text: "OK" }]
                );
            }
        } catch (error: any) {
            Alert.alert("Scan Failed", error.message || "Failed to scan for USB devices");
        } finally {
            setIsScanning(false);
        }
    };

    const handleConnectUSB = async (device: any) => {
        try {
            const success = await PrinterService.connectUSB(
                device.deviceId,
                device.name || "USB Printer",
                selectedPaperWidth
            );

            if (success) {
                Alert.alert("Connected", `Successfully connected to ${device.name}`);
                await refreshSavedPrinters();
            }
        } catch (error: any) {
            Alert.alert("Connection Failed", error.message || "Failed to connect to printer");
        }
    };

    // ========== Network Connection ==========

    const handleAddNetworkPrinter = () => {
        setNetworkIp("");
        setNetworkPort("9100");
        setNetworkName("");
        setShowNetworkModal(true);
    };

    const handleConnectNetwork = async () => {
        if (!networkIp.trim()) {
            Alert.alert("Error", "Please enter the printer IP address");
            return;
        }

        setShowNetworkModal(false);

        try {
            const success = await PrinterService.connectNetwork(
                networkIp.trim(),
                parseInt(networkPort) || 9100,
                networkName.trim() || undefined,
                selectedPaperWidth
            );

            if (success) {
                Alert.alert("Connected", `Successfully connected to ${networkIp}`);
                await refreshSavedPrinters();
            }
        } catch (error: any) {
            Alert.alert("Connection Failed", error.message || "Failed to connect to printer");
        }
    };

    const handleDiscoverNetwork = async () => {
        setIsScanning(true);
        setNetworkPrinters([]);

        try {
            const printers = await PrinterService.discoverNetworkPrinters();
            setNetworkPrinters(printers);

            if (printers.length === 0) {
                Alert.alert(
                    "No Printers Found",
                    "No network printers were discovered. Try adding manually by IP address.",
                    [{ text: "OK" }]
                );
            }
        } catch (error: any) {
            Alert.alert("Discovery Failed", error.message || "Failed to discover network printers");
        } finally {
            setIsScanning(false);
        }
    };

    // ========== Common Actions ==========

    const handleTestPrint = async () => {
        try {
            await testPrint();
            Alert.alert("Success", "Test page sent to printer");
        } catch (error: any) {
            Alert.alert("Error", error.message || "Failed to print test page");
        }
    };

    const handleDisconnect = async () => {
        Alert.alert("Disconnect Printer", "Are you sure you want to disconnect?", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Disconnect",
                style: "destructive",
                onPress: async () => {
                    await disconnect();
                },
            },
        ]);
    };

    const handleDeletePrinter = async (id: string, name: string) => {
        Alert.alert("Delete Printer", `Remove "${name}" from saved printers?`, [
            { text: "Cancel", style: "cancel" },
            {
                text: "Delete",
                style: "destructive",
                onPress: async () => {
                    await deletePrinter(id);
                },
            },
        ]);
    };

    const handleConnectSaved = async (printer: PrinterConfig) => {
        try {
            const success = await PrinterService.connect(printer);
            if (success) {
                Alert.alert("Connected", `Successfully connected to ${printer.name}`);
            }
        } catch (error: any) {
            Alert.alert("Connection Failed", error.message || "Failed to connect to printer");
        }
    };

    const onRefresh = async () => {
        setIsRefreshing(true);
        await refreshSavedPrinters();
        setIsRefreshing(false);
    };

    // ========== UI Helpers ==========

    const getStatusColor = () => {
        switch (state.status) {
            case "connected":
                return "#22c55e";
            case "connecting":
                return "#f59e0b";
            case "printing":
                return "#3b82f6";
            case "error":
                return "#ef4444";
            default:
                return "#6b7280";
        }
    };

    const getStatusText = () => {
        switch (state.status) {
            case "connected":
                return `Connected to ${connectedPrinter?.name}`;
            case "connecting":
                return "Connecting...";
            case "printing":
                return "Printing...";
            case "error":
                return state.lastError || "Error";
            default:
                return "No printer connected";
        }
    };

    const getConnectionIcon = (type: PrinterConnectionType) => {
        switch (type) {
            case "bluetooth":
                return "📶";
            case "usb":
                return "🔌";
            case "network":
            case "wifi":
                return "🌐";
            default:
                return "🖨️";
        }
    };

    // ========== Render ==========

    const renderBluetoothTab = () => (
        <View>
            <TouchableOpacity
                style={[styles.scanButton, isScanning && styles.scanButtonDisabled]}
                onPress={handleScanBluetooth}
                disabled={isScanning || isConnecting}
            >
                {isScanning ? (
                    <ActivityIndicator color="#fff" size="small" />
                ) : (
                    <Text style={styles.scanButtonText}>🔍 Scan for Bluetooth Printers</Text>
                )}
            </TouchableOpacity>

            {discoveredDevices.length > 0 && (
                <View style={styles.deviceList}>
                    <Text style={styles.listTitle}>Discovered Devices</Text>
                    {discoveredDevices.map((device) => (
                        <TouchableOpacity
                            key={device.address}
                            style={styles.deviceItem}
                            onPress={() => handleConnectBluetooth(device)}
                            disabled={isConnecting}
                        >
                            <View style={styles.deviceInfo}>
                                <Text style={styles.deviceName}>{device.name || "Unknown Device"}</Text>
                                <Text style={styles.deviceAddress}>{device.address}</Text>
                            </View>
                            <Text style={styles.connectText}>Connect</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            )}

            <Text style={styles.hint}>
                Make sure your printer is powered on and in pairing mode. You may need to pair the device
                in your phone's Bluetooth settings first.
            </Text>
        </View>
    );

    const renderUSBTab = () => (
        <View>
            {Platform.OS === "android" ? (
                <>
                    <TouchableOpacity
                        style={[styles.scanButton, isScanning && styles.scanButtonDisabled]}
                        onPress={handleScanUSB}
                        disabled={isScanning || isConnecting}
                    >
                        {isScanning ? (
                            <ActivityIndicator color="#fff" size="small" />
                        ) : (
                            <Text style={styles.scanButtonText}>🔌 Scan for USB Printers</Text>
                        )}
                    </TouchableOpacity>

                    {usbDevices.length > 0 && (
                        <View style={styles.deviceList}>
                            <Text style={styles.listTitle}>USB Devices</Text>
                            {usbDevices.map((device) => (
                                <TouchableOpacity
                                    key={device.deviceId}
                                    style={styles.deviceItem}
                                    onPress={() => handleConnectUSB(device)}
                                    disabled={isConnecting}
                                >
                                    <View style={styles.deviceInfo}>
                                        <Text style={styles.deviceName}>{device.name}</Text>
                                        <Text style={styles.deviceAddress}>
                                            VID: {device.vendorId} | PID: {device.productId}
                                        </Text>
                                    </View>
                                    <Text style={styles.connectText}>Connect</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}

                    <Text style={styles.hint}>
                        Connect your thermal printer via USB OTG cable. Make sure it's powered on.
                    </Text>
                </>
            ) : (
                <View style={styles.notSupportedContainer}>
                    <Text style={styles.notSupportedText}>USB printing is only available on Android devices.</Text>
                </View>
            )}
        </View>
    );

    const renderNetworkTab = () => (
        <View>
            <TouchableOpacity style={styles.scanButton} onPress={handleAddNetworkPrinter}>
                <Text style={styles.scanButtonText}>➕ Add Network Printer (IP)</Text>
            </TouchableOpacity>

            <TouchableOpacity
                style={[styles.scanButton, styles.secondaryButton, isScanning && styles.scanButtonDisabled]}
                onPress={handleDiscoverNetwork}
                disabled={isScanning}
            >
                {isScanning ? (
                    <ActivityIndicator color="#10b981" size="small" />
                ) : (
                    <Text style={[styles.scanButtonText, styles.secondaryButtonText]}>
                        🔍 Auto-Discover Printers
                    </Text>
                )}
            </TouchableOpacity>

            {networkPrinters.length > 0 && (
                <View style={styles.deviceList}>
                    <Text style={styles.listTitle}>Discovered Network Printers</Text>
                    {networkPrinters.map((printer, index) => (
                        <TouchableOpacity
                            key={`${printer.ip}:${printer.port}`}
                            style={styles.deviceItem}
                            onPress={() =>
                                PrinterService.connectNetwork(printer.ip, printer.port, printer.name, selectedPaperWidth)
                            }
                            disabled={isConnecting}
                        >
                            <View style={styles.deviceInfo}>
                                <Text style={styles.deviceName}>{printer.name}</Text>
                                <Text style={styles.deviceAddress}>{printer.ip}:{printer.port}</Text>
                            </View>
                            <Text style={styles.connectText}>Connect</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            )}

            <Text style={styles.hint}>
                Enter the printer's IP address and port (default 9100). Make sure the printer is on the same
                network as your device.
            </Text>
        </View>
    );

    return (
        <>
            <Stack.Screen
                options={{
                    headerShown: true,
                    title: "Printer Settings",
                    headerStyle: { backgroundColor: "#fff" },
                    headerTintColor: "#000",
                }}
            />

            <ScrollView
                style={styles.container}
                contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
                refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
            >
                {/* Status Card */}
                <View style={styles.card}>
                    <View style={styles.statusHeader}>
                        <View style={[styles.statusDot, { backgroundColor: getStatusColor() }]} />
                        <Text style={styles.statusText}>{getStatusText()}</Text>
                    </View>

                    {connectedPrinter && (
                        <View style={styles.printerInfo}>
                            <Text style={styles.infoLabel}>
                                {getConnectionIcon(connectedPrinter.type)} {connectedPrinter.type.toUpperCase()}
                            </Text>
                            <Text style={styles.infoLabel}>Paper: {connectedPrinter.paperWidth}mm</Text>
                            {connectedPrinter.address && (
                                <Text style={styles.infoLabel}>Address: {connectedPrinter.address}</Text>
                            )}
                        </View>
                    )}

                    {isConnected && (
                        <View style={styles.buttonRow}>
                            <TouchableOpacity
                                style={[styles.button, styles.primaryButton]}
                                onPress={handleTestPrint}
                                disabled={isPrinting}
                            >
                                <Text style={styles.buttonText}>{isPrinting ? "Printing..." : "🖨️ Test Print"}</Text>
                            </TouchableOpacity>

                            <TouchableOpacity style={[styles.button, styles.dangerButton]} onPress={handleDisconnect}>
                                <Text style={styles.buttonText}>Disconnect</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>

                {/* Paper Width Selection */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Paper Width</Text>
                    <View style={styles.paperWidthRow}>
                        <TouchableOpacity
                            style={[
                                styles.paperWidthButton,
                                selectedPaperWidth === 58 && styles.paperWidthButtonActive,
                            ]}
                            onPress={() => setSelectedPaperWidth(58)}
                        >
                            <Text
                                style={[
                                    styles.paperWidthText,
                                    selectedPaperWidth === 58 && styles.paperWidthTextActive,
                                ]}
                            >
                                58mm
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[
                                styles.paperWidthButton,
                                selectedPaperWidth === 80 && styles.paperWidthButtonActive,
                            ]}
                            onPress={() => setSelectedPaperWidth(80)}
                        >
                            <Text
                                style={[
                                    styles.paperWidthText,
                                    selectedPaperWidth === 80 && styles.paperWidthTextActive,
                                ]}
                            >
                                80mm
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Connection Tabs */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Connect New Printer</Text>

                    <View style={styles.tabRow}>
                        <TouchableOpacity
                            style={[styles.tab, activeTab === "bluetooth" && styles.tabActive]}
                            onPress={() => setActiveTab("bluetooth")}
                        >
                            <Text style={[styles.tabText, activeTab === "bluetooth" && styles.tabTextActive]}>
                                📶 Bluetooth
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.tab, activeTab === "usb" && styles.tabActive]}
                            onPress={() => setActiveTab("usb")}
                        >
                            <Text style={[styles.tabText, activeTab === "usb" && styles.tabTextActive]}>
                                🔌 USB
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.tab, activeTab === "network" && styles.tabActive]}
                            onPress={() => setActiveTab("network")}
                        >
                            <Text style={[styles.tabText, activeTab === "network" && styles.tabTextActive]}>
                                🌐 Network
                            </Text>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.tabContent}>
                        {activeTab === "bluetooth" && renderBluetoothTab()}
                        {activeTab === "usb" && renderUSBTab()}
                        {activeTab === "network" && renderNetworkTab()}
                    </View>
                </View>

                {/* Saved Printers */}
                {savedPrinters.length > 0 && (
                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>Saved Printers</Text>

                        {savedPrinters.map((printer) => (
                            <View key={printer.id} style={styles.savedPrinterItem}>
                                <TouchableOpacity
                                    style={styles.savedPrinterInfo}
                                    onPress={() => handleConnectSaved(printer)}
                                    disabled={isConnecting || connectedPrinter?.id === printer.id}
                                >
                                    <View style={styles.savedPrinterHeader}>
                                        <Text style={styles.savedPrinterIcon}>{getConnectionIcon(printer.type)}</Text>
                                        <Text style={styles.savedPrinterName}>
                                            {printer.name}
                                            {printer.isDefault && <Text style={styles.defaultBadge}> ★</Text>}
                                        </Text>
                                        {connectedPrinter?.id === printer.id && (
                                            <View style={styles.connectedBadge}>
                                                <Text style={styles.connectedBadgeText}>Connected</Text>
                                            </View>
                                        )}
                                    </View>
                                    <Text style={styles.savedPrinterDetails}>
                                        {printer.type.toUpperCase()} • {printer.paperWidth}mm
                                        {printer.address ? ` • ${printer.address}` : ""}
                                    </Text>
                                </TouchableOpacity>

                                <View style={styles.savedPrinterActions}>
                                    {!printer.isDefault && (
                                        <TouchableOpacity
                                            style={styles.iconButton}
                                            onPress={() => setDefaultPrinter(printer.id)}
                                        >
                                            <Text style={styles.iconButtonText}>⭐</Text>
                                        </TouchableOpacity>
                                    )}
                                    <TouchableOpacity
                                        style={styles.iconButton}
                                        onPress={() => handleDeletePrinter(printer.id, printer.name)}
                                    >
                                        <Text style={styles.iconButtonText}>🗑️</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ))}
                    </View>
                )}

                {/* Print Queue */}
                {state.printQueue.length > 0 && (
                    <View style={styles.card}>
                        <View style={styles.queueHeader}>
                            <Text style={styles.cardTitle}>Print Queue ({state.printQueue.length})</Text>
                            <TouchableOpacity onPress={() => PrinterService.clearQueue()}>
                                <Text style={styles.clearQueueText}>Clear</Text>
                            </TouchableOpacity>
                        </View>

                        {state.printQueue.map((job) => (
                            <View key={job.id} style={styles.queueItem}>
                                <View style={styles.queueJobInfo}>
                                    <Text style={styles.queueJobType}>{job.type}</Text>
                                    <Text style={styles.queueJobTime}>
                                        {new Date(job.timestamp).toLocaleTimeString()}
                                    </Text>
                                </View>
                                <View
                                    style={[
                                        styles.queueJobStatus,
                                        job.status === "printing" && styles.queueJobStatusPrinting,
                                        job.status === "failed" && styles.queueJobStatusFailed,
                                    ]}
                                >
                                    <Text style={styles.queueJobStatusText}>{job.status}</Text>
                                </View>
                            </View>
                        ))}
                    </View>
                )}

                {/* Info */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>ℹ️ Information</Text>
                    <Text style={styles.infoText}>
                        <Text style={styles.bold}>Bluetooth:</Text> ESC/POS compatible thermal printers
                        {"\n"}
                        <Text style={styles.bold}>USB:</Text> Most thermal receipt printers (Android only)
                        {"\n"}
                        <Text style={styles.bold}>Network:</Text> WiFi printers with IP address (port 9100)
                    </Text>
                    <Text style={[styles.hint, { marginTop: 10 }]}>
                        Bluetooth and USB require a development build (expo prebuild + expo run:android).
                    </Text>
                </View>
            </ScrollView>

            {/* Network Printer Modal */}
            <Modal visible={showNetworkModal} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Add Network Printer</Text>

                        <Text style={styles.inputLabel}>IP Address *</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="192.168.1.100"
                            value={networkIp}
                            onChangeText={setNetworkIp}
                            keyboardType="numeric"
                            autoCapitalize="none"
                        />

                        <Text style={styles.inputLabel}>Port</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="9100"
                            value={networkPort}
                            onChangeText={setNetworkPort}
                            keyboardType="numeric"
                        />

                        <Text style={styles.inputLabel}>Printer Name (optional)</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="My Printer"
                            value={networkName}
                            onChangeText={setNetworkName}
                        />

                        <View style={styles.modalButtons}>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.modalButtonCancel]}
                                onPress={() => setShowNetworkModal(false)}
                            >
                                <Text style={styles.modalButtonCancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.modalButtonConnect]}
                                onPress={handleConnectNetwork}
                            >
                                <Text style={styles.modalButtonConnectText}>Connect</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#f5f5f5",
    },
    card: {
        backgroundColor: "#fff",
        marginHorizontal: 16,
        marginTop: 16,
        borderRadius: 12,
        padding: 16,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: "600",
        color: "#1f2937",
        marginBottom: 12,
    },
    statusHeader: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 8,
    },
    statusDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        marginRight: 10,
    },
    statusText: {
        fontSize: 15,
        fontWeight: "500",
        color: "#374151",
        flex: 1,
    },
    printerInfo: {
        marginTop: 8,
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: "#e5e7eb",
    },
    infoLabel: {
        fontSize: 14,
        color: "#6b7280",
        marginBottom: 4,
    },
    buttonRow: {
        flexDirection: "row",
        marginTop: 16,
        gap: 12,
    },
    button: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: "center",
        justifyContent: "center",
    },
    primaryButton: {
        backgroundColor: "#3b82f6",
    },
    dangerButton: {
        backgroundColor: "#ef4444",
    },
    buttonText: {
        color: "#fff",
        fontWeight: "600",
        fontSize: 14,
    },
    paperWidthRow: {
        flexDirection: "row",
        gap: 12,
    },
    paperWidthButton: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 8,
        borderWidth: 2,
        borderColor: "#e5e7eb",
        alignItems: "center",
    },
    paperWidthButtonActive: {
        borderColor: "#3b82f6",
        backgroundColor: "#eff6ff",
    },
    paperWidthText: {
        fontSize: 16,
        fontWeight: "600",
        color: "#6b7280",
    },
    paperWidthTextActive: {
        color: "#3b82f6",
    },
    tabRow: {
        flexDirection: "row",
        marginBottom: 16,
        borderRadius: 8,
        backgroundColor: "#f3f4f6",
        padding: 4,
    },
    tab: {
        flex: 1,
        paddingVertical: 10,
        alignItems: "center",
        borderRadius: 6,
    },
    tabActive: {
        backgroundColor: "#fff",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    tabText: {
        fontSize: 12,
        fontWeight: "500",
        color: "#6b7280",
    },
    tabTextActive: {
        color: "#1f2937",
    },
    tabContent: {
        minHeight: 150,
    },
    scanButton: {
        backgroundColor: "#10b981",
        paddingVertical: 14,
        borderRadius: 8,
        alignItems: "center",
        marginBottom: 12,
    },
    scanButtonDisabled: {
        opacity: 0.6,
    },
    scanButtonText: {
        color: "#fff",
        fontWeight: "600",
        fontSize: 15,
    },
    secondaryButton: {
        backgroundColor: "#fff",
        borderWidth: 2,
        borderColor: "#10b981",
    },
    secondaryButtonText: {
        color: "#10b981",
    },
    hint: {
        fontSize: 12,
        color: "#9ca3af",
        marginTop: 8,
        textAlign: "center",
        lineHeight: 18,
    },
    deviceList: {
        marginTop: 8,
    },
    listTitle: {
        fontSize: 14,
        fontWeight: "600",
        color: "#374151",
        marginBottom: 8,
    },
    deviceItem: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 12,
        paddingHorizontal: 12,
        backgroundColor: "#f9fafb",
        borderRadius: 8,
        marginBottom: 8,
    },
    deviceInfo: {
        flex: 1,
    },
    deviceName: {
        fontSize: 15,
        fontWeight: "500",
        color: "#1f2937",
    },
    deviceAddress: {
        fontSize: 12,
        color: "#6b7280",
        marginTop: 2,
    },
    connectText: {
        color: "#3b82f6",
        fontWeight: "600",
        fontSize: 14,
    },
    savedPrinterItem: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: "#f3f4f6",
    },
    savedPrinterInfo: {
        flex: 1,
    },
    savedPrinterHeader: {
        flexDirection: "row",
        alignItems: "center",
    },
    savedPrinterIcon: {
        fontSize: 16,
        marginRight: 8,
    },
    savedPrinterName: {
        fontSize: 15,
        fontWeight: "500",
        color: "#1f2937",
    },
    defaultBadge: {
        color: "#f59e0b",
        fontWeight: "700",
    },
    connectedBadge: {
        backgroundColor: "#dcfce7",
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 12,
        marginLeft: 8,
    },
    connectedBadgeText: {
        fontSize: 10,
        fontWeight: "600",
        color: "#16a34a",
    },
    savedPrinterDetails: {
        fontSize: 12,
        color: "#6b7280",
        marginTop: 4,
        marginLeft: 24,
    },
    savedPrinterActions: {
        flexDirection: "row",
        gap: 4,
    },
    iconButton: {
        padding: 8,
    },
    iconButtonText: {
        fontSize: 18,
    },
    queueHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 8,
    },
    clearQueueText: {
        color: "#ef4444",
        fontSize: 14,
        fontWeight: "500",
    },
    queueItem: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: "#f3f4f6",
    },
    queueJobInfo: {
        flex: 1,
    },
    queueJobType: {
        fontSize: 14,
        fontWeight: "500",
        color: "#374151",
    },
    queueJobTime: {
        fontSize: 11,
        color: "#9ca3af",
        marginTop: 2,
    },
    queueJobStatus: {
        backgroundColor: "#fef3c7",
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
    },
    queueJobStatusPrinting: {
        backgroundColor: "#dbeafe",
    },
    queueJobStatusFailed: {
        backgroundColor: "#fee2e2",
    },
    queueJobStatusText: {
        fontSize: 11,
        fontWeight: "600",
        color: "#92400e",
        textTransform: "capitalize",
    },
    infoText: {
        fontSize: 14,
        color: "#4b5563",
        lineHeight: 22,
    },
    bold: {
        fontWeight: "600",
    },
    notSupportedContainer: {
        padding: 20,
        alignItems: "center",
    },
    notSupportedText: {
        fontSize: 14,
        color: "#6b7280",
        textAlign: "center",
    },
    // Modal styles
    modalOverlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.5)",
        justifyContent: "center",
        alignItems: "center",
        padding: 20,
    },
    modalContent: {
        backgroundColor: "#fff",
        borderRadius: 16,
        padding: 20,
        width: "100%",
        maxWidth: 400,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: "600",
        color: "#1f2937",
        marginBottom: 16,
        textAlign: "center",
    },
    inputLabel: {
        fontSize: 14,
        fontWeight: "500",
        color: "#374151",
        marginBottom: 6,
        marginTop: 12,
    },
    input: {
        borderWidth: 1,
        borderColor: "#d1d5db",
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 16,
        color: "#1f2937",
    },
    modalButtons: {
        flexDirection: "row",
        gap: 12,
        marginTop: 24,
    },
    modalButton: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: "center",
    },
    modalButtonCancel: {
        backgroundColor: "#f3f4f6",
    },
    modalButtonCancelText: {
        color: "#6b7280",
        fontWeight: "600",
    },
    modalButtonConnect: {
        backgroundColor: "#3b82f6",
    },
    modalButtonConnectText: {
        color: "#fff",
        fontWeight: "600",
    },
});
