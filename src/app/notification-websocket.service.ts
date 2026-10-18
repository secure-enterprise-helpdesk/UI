import { Injectable } from '@angular/core';
import { Client, IMessage, Stomp } from '@stomp/stompjs';

@Injectable({ providedIn: 'root' })
export class NotificationWebSocketService {
  private client: Client | null = null;

  async connect(
    token: string,
    onMessage: (payload: unknown) => void,
    onStatus: (status: 'connecting' | 'live' | 'offline') => void
  ): Promise<void> {
    this.disconnect();
    onStatus('connecting');

    (globalThis as any).global = globalThis;

    const { default: SockJS } = await import('sockjs-client');
    const client = Stomp.over(() => new SockJS('/ws/notifications') as any);
    client.debug = () => undefined;
    client.connectHeaders = { Authorization: `Bearer ${token}` };
    client.onConnect = () => {
      onStatus('live');
      client.subscribe('/user/queue/notifications', (message: IMessage) => {
        try {
          onMessage(JSON.parse(message.body));
        } catch {
          onMessage(message.body);
        }
      });
    };
    client.onStompError = frame => {
      onStatus('offline');
      console.error('Notification STOMP error:', frame.headers['message']);
    };
    client.onWebSocketError = event => {
      onStatus('offline');
      console.error('Notification WebSocket error:', event);
    };
    client.onWebSocketClose = event => {
      onStatus('offline');
      console.warn('Notification WebSocket closed:', event.code, event.reason);
    };

    this.client = client;
    try {
      await client.activate();
    } catch (error) {
      onStatus('offline');
      console.error('Notification WebSocket activation failed:', error);
    }
  }

  disconnect(): void {
    this.client?.deactivate();
    this.client = null;
  }
}
