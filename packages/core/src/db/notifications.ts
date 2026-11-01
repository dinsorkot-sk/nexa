export interface Notification {
  id: string;
  tenantId: string;
  userId: string | null;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

export class NotificationCenter {
  private items: Notification[] = [];

  push(n: Omit<Notification, 'id' | 'read' | 'createdAt'>): Notification {
    const notif: Notification = {
      id: crypto.randomUUID(),
      ...n,
      read: false,
      createdAt: new Date().toISOString(),
    };
    this.items.unshift(notif);
    return notif;
  }

  list(tenantId: string, userId?: string | null): Notification[] {
    return this.items.filter((n) => n.tenantId === tenantId && (userId == null || n.userId === userId || n.userId === null));
  }

  markRead(id: string): void {
    const n = this.items.find((x) => x.id === id);
    if (n) n.read = true;
  }

  unreadCount(tenantId: string, userId?: string | null): number {
    return this.list(tenantId, userId).filter((n) => !n.read).length;
  }
}