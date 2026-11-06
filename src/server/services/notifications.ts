import type { DbOrTx } from "../db";

/** Number of unread notifications of a user (badge of the top bar). */
export function countUnreadNotifications(db: DbOrTx, userId: string): Promise<number> {
  return db.notification.count({ where: { userId, readAt: null } });
}

export interface NotificationView {
  id: string;
  title: string;
  body: string | null;
  href: string | null;
  createdAt: Date;
  read: boolean;
}

/** The user's own notifications, unread first, newest first (the bell, /rappels). */
export async function listNotifications(
  db: DbOrTx,
  userId: string,
  limit = 100,
): Promise<NotificationView[]> {
  const rows = await db.notification.findMany({
    where: { userId },
    orderBy: [{ readAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
    take: limit,
    select: { id: true, title: true, body: true, href: true, createdAt: true, readAt: true },
  });
  return rows.map(({ readAt, ...r }) => ({ ...r, read: readAt !== null }));
}

/** Marks every unread notification of the user as read. Only her own. */
export async function markAllNotificationsRead(db: DbOrTx, userId: string): Promise<number> {
  const { count } = await db.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date(), updatedById: userId },
  });
  return count;
}

/** Marks one of the user's notifications as read (someone else's: nothing happens). */
export async function markNotificationRead(
  db: DbOrTx,
  userId: string,
  notificationId: string,
): Promise<void> {
  await db.notification.updateMany({
    where: { id: notificationId, userId, readAt: null },
    data: { readAt: new Date(), updatedById: userId },
  });
}
