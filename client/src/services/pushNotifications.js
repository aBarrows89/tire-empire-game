/**
 * Push notification registration and handling.
 * Uses Capacitor PushNotifications plugin for FCM on Android.
 * Requires google-services.json in the Android project for FCM to work.
 */
import { Capacitor } from '@capacitor/core';
import { postAction } from '../api/client.js';

let _registered = false;

// Set to true once google-services.json is added to android/app/
const FCM_CONFIGURED = true;

/**
 * Register for push notifications.
 * Gracefully skips if FCM is not configured.
 */
export async function registerPush() {
  if (_registered) return;
  if (!Capacitor.isNativePlatform()) return;
  if (!FCM_CONFIGURED) {
    console.log('[push] FCM not configured (no google-services.json), skipping registration');
    return;
  }

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    const permResult = await PushNotifications.requestPermissions();
    if (permResult.receive !== 'granted') {
      console.log('[push] Permission denied');
      return;
    }

    // Set up listeners before registering
    PushNotifications.addListener('registration', async (token) => {
      console.log('[push] FCM token:', token.value?.substring(0, 20) + '...');
      try {
        await postAction('registerPushToken', { token: token.value });
      } catch (err) {
        console.error('[push] Failed to send token to server:', err);
      }
    });

    PushNotifications.addListener('registrationError', (err) => {
      console.error('[push] Registration error:', err);
    });

    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('[push] Foreground notification:', notification);
      window.dispatchEvent(new CustomEvent('pushNotification', {
        detail: {
          title: notification.title,
          body: notification.body,
          data: notification.data,
        }
      }));
    });

    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      console.log('[push] Notification tapped:', action);
      const data = action.notification?.data;
      if (data?.panel) {
        window.dispatchEvent(new CustomEvent('navigatePanel', {
          detail: data.panel,
        }));
      }
    });

    await PushNotifications.register();
    _registered = true;
    console.log('[push] Registered successfully');
  } catch (err) {
    console.error('[push] Setup error:', err);
  }
}
