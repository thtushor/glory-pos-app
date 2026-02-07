/**
 * useBluetoothPermissions Hook
 * Handles Bluetooth permission requests for Android
 */

import { useCallback, useEffect, useState } from "react";
import { Alert, Linking, PermissionsAndroid, Platform } from "react-native";

export interface BluetoothPermissionState {
    isGranted: boolean;
    isChecking: boolean;
    canRequest: boolean;
}

export function useBluetoothPermissions() {
    const [state, setState] = useState<BluetoothPermissionState>({
        isGranted: false,
        isChecking: true,
        canRequest: true,
    });

    // Check permissions on mount
    useEffect(() => {
        checkPermissions();
    }, []);

    const checkPermissions = useCallback(async (): Promise<boolean> => {
        if (Platform.OS !== "android") {
            // iOS handles permissions differently via Info.plist
            setState({ isGranted: true, isChecking: false, canRequest: false });
            return true;
        }

        setState((prev) => ({ ...prev, isChecking: true }));

        try {
            const apiLevel = Platform.Version;

            if (apiLevel >= 31) {
                // Android 12+ (API 31+)
                const bluetoothScan = await PermissionsAndroid.check(
                    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN
                );
                const bluetoothConnect = await PermissionsAndroid.check(
                    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT
                );
                const location = await PermissionsAndroid.check(
                    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
                );

                const isGranted = bluetoothScan && bluetoothConnect && location;
                setState({ isGranted, isChecking: false, canRequest: !isGranted });
                return isGranted;
            } else {
                // Android 11 and below
                const location = await PermissionsAndroid.check(
                    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
                );
                setState({ isGranted: location, isChecking: false, canRequest: !location });
                return location;
            }
        } catch (error) {
            console.error("[useBluetoothPermissions] Check failed:", error);
            setState({ isGranted: false, isChecking: false, canRequest: true });
            return false;
        }
    }, []);

    const requestPermissions = useCallback(async (): Promise<boolean> => {
        if (Platform.OS !== "android") {
            return true;
        }

        setState((prev) => ({ ...prev, isChecking: true }));

        try {
            const apiLevel = Platform.Version;

            if (apiLevel >= 31) {
                // Android 12+ requires BLUETOOTH_SCAN and BLUETOOTH_CONNECT
                const permissions = [
                    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
                    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
                    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
                ];

                const results = await PermissionsAndroid.requestMultiple(permissions);

                const allGranted = Object.values(results).every(
                    (result) => result === PermissionsAndroid.RESULTS.GRANTED
                );

                // Check if any were "never_ask_again"
                const anyNeverAskAgain = Object.values(results).some(
                    (result) => result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
                );

                if (anyNeverAskAgain) {
                    showSettingsAlert();
                    setState({ isGranted: false, isChecking: false, canRequest: false });
                    return false;
                }

                setState({ isGranted: allGranted, isChecking: false, canRequest: !allGranted });
                return allGranted;
            } else {
                // Android 11 and below
                const result = await PermissionsAndroid.request(
                    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
                    {
                        title: "Location Permission Required",
                        message:
                            "GloryPOS needs location permission to scan for Bluetooth printers. " +
                            "This is required by Android for Bluetooth scanning.",
                        buttonNeutral: "Ask Later",
                        buttonNegative: "Cancel",
                        buttonPositive: "OK",
                    }
                );

                const isGranted = result === PermissionsAndroid.RESULTS.GRANTED;

                if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
                    showSettingsAlert();
                    setState({ isGranted: false, isChecking: false, canRequest: false });
                    return false;
                }

                setState({ isGranted, isChecking: false, canRequest: !isGranted });
                return isGranted;
            }
        } catch (error) {
            console.error("[useBluetoothPermissions] Request failed:", error);
            setState({ isGranted: false, isChecking: false, canRequest: true });
            return false;
        }
    }, []);

    const showSettingsAlert = () => {
        Alert.alert(
            "Permission Required",
            "Bluetooth permissions are required to connect to printers. Please enable them in Settings.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Open Settings",
                    onPress: () => {
                        Linking.openSettings();
                    },
                },
            ]
        );
    };

    const openSettings = useCallback(() => {
        Linking.openSettings();
    }, []);

    return {
        ...state,
        checkPermissions,
        requestPermissions,
        openSettings,
    };
}

export default useBluetoothPermissions;
