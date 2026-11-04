import type { DbOrTx } from "../db";

/** Number of unread notifications of a user (badge of the top bar). */
export function countUnreadNotifications(db: DbOrTx, userId: string): Promise<number> {
  return db.notification.count({ where: { userId, readAt: null } });
}
