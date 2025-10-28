// src/backgroundLocationBridge.js
// JS helper to call the native Capacitor plugin from your web UI.
// Place this file in your web project's src/ (or public/scripts) and import it where needed.
//
// Usage example (after successful driver login):
//   import { configureNativeAndStart } from './backgroundLocationBridge';
//   await configureNativeAndStart(token, driverId, 'https://abcd1234.ngrok.io');
//   // service will start and begin posting locations to /api/jeepney-location
//
// NOTE:
// - This uses the Capacitor Plugins interface. If you are on Capacitor 4+ the import path is still '@capacitor/core'.
// - Make sure the plugin name ("BackgroundLocation") matches the Kotlin @CapacitorPlugin name.

import { Plugins } from '@capacitor/core';
const { BackgroundLocation } = Plugins;

/**
 * Save token and driverId into native (encrypted) prefs and optionally set API base.
 * Then start the native foreground service.
 *
 * @param {string} token - JWT token from your server
 * @param {string|number} driverId - driver id
 * @param {string} [apiBase] - optional API base (e.g. https://abcd.ngrok.io) to set for the native service
 */
export async function configureNativeAndStart(token, driverId, apiBase) {
  try {
    // store token + driverId natively
    await BackgroundLocation.setAuth({ token, driverId: String(driverId) });

    // optionally set API base (useful for ngrok testing)
    if (apiBase) {
      await BackgroundLocation.setApiBase({ apiBase });
    }

    // start native foreground service (device only)
    await BackgroundLocation.startService();
    console.log('Native background location service requested to start');
  } catch (err) {
    console.warn('configureNativeAndStart error', err);
    throw err;
  }
}

/** Convenience wrappers if you prefer calling operations separately */
export async function setNativeAuth(token, driverId) {
  try {
    await BackgroundLocation.setAuth({ token, driverId: String(driverId) });
  } catch (e) {
    console.warn('setNativeAuth failed', e);
    throw e;
  }
}

export async function setNativeApiBase(apiBase) {
  try {
    await BackgroundLocation.setApiBase({ apiBase });
  } catch (e) {
    console.warn('setNativeApiBase failed', e);
    throw e;
  }
}

export async function startNativeService() {
  try {
    await BackgroundLocation.startService();
  } catch (e) {
    console.warn('startNativeService failed', e);
    throw e;
  }
}

export async function stopNativeService() {
  try {
    await BackgroundLocation.stopService();
  } catch (e) {
    console.warn('stopNativeService failed', e);
    throw e;
  }
}

export async function clearNativeAuth() {
  try {
    await BackgroundLocation.clearAuth();
  } catch (e) {
    console.warn('clearNativeAuth failed', e);
    throw e;
  }
}