import { Notification as ElectronNotification } from 'electron';
import type { Notification, NotificationTransport } from './queue';

/** Native desktop notifications — reach the user without opening the app. */
export class DesktopTransport implements NotificationTransport {
  async deliver(notification: Notification): Promise<void> {
    if (!ElectronNotification.isSupported()) {
      throw new Error('Desktop notifications unavailable');
    }
    new ElectronNotification({
      title: notification.title,
      body: notification.body,
    }).show();
  }
}
