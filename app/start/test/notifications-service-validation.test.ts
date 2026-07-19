import { describe, expect, test } from 'bun:test';
import { deleteNotification, markNotificationRead, NotificationServiceError, notificationStreamUser } from '../src/backend/services/notifications';

describe('notification service validation', () => {
  test('rejects invalid ids and missing stream tokens before database access', async () => {
    await expect(deleteNotification(1, 0)).rejects.toBeInstanceOf(NotificationServiceError);
    await expect(markNotificationRead(1, -1)).rejects.toBeInstanceOf(NotificationServiceError);
    await expect(notificationStreamUser('')).rejects.toBeInstanceOf(NotificationServiceError);
  });
});
