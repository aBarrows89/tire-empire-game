/**
 * Push notification registration and handling.
 * Uses Capacitor PushNotifications plugin for FCM on Android.
 */
import { Capacitor } from '@capacitor/core';
import { postAction } from '../api/client.js';

let _registered = false;

/**
 * Register for push notifications.
 * - Requests permission
 * - Registers with FCM
 * - Sends token to server
 * - Handles foreground notification display
 */
export async function registerPush() {
  if (_registered) return;
  if (!Capacitor.isNativePlatform()) return; // Web doesn't use FCM

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    // Request permission
    const permResult = await PushNotifications.requestPermissions();
    if (permResult.receive !== 'granted') {
      console.log('[push] Permission denied');
      return;
    }

    // Register with FCM
    await PushNotifications.register();

    // Listen for registration success — send token to server
    PushNotifications.addListener('registration', async (token) => {
      console.log('[push] FCM token:', token.value?.substring(0, 20) + '...');
      try {
        await postAction('registerPushToken', { token: token.value });
      } catch (err) {
        console.error('[push] Failed to send token to server:', err);
      }
    });

    // Registration error
    PushNotifications.addListener('registrationError', (err) => {
      console.error('[push] Registration error:', err);
    });

    // Foreground notifications — show as in-app toast
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('[push] Foreground notification:', notification);
      // Dispatch custom event for in-app display
      window.dispatchEvent(new CustomEvent('pushNotification', {
        detail: {
          title: notification.title,
          body: notification.body,
          data: notification.data,
        }
      }));
    });

    // Tap on notification — navigate to relevant panel
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      console.log('[push] Notification tapped:', action);
      const data = action.notification?.data;
      if (data?.panel) {
        // Navigate to the specified panel
        window.dispatchEvent(new CustomEvent('navigatePanel', {
          detail: data.panel,
        }));
      }
    });

    _registered = true;
    console.log('[push] Registered successfully');
  } catch (err) {
    console.error('[push] Setup error:', err);
  }
}
