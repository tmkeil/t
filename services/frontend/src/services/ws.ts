// Improved version of RemotePlayerManager.ts
import { ServerState } from "src/interfaces";
import { Derived } from "@app/shared";

// Msg types that can be received from the server
type Msg = 
  | { type: "hello"; userId: number }
  | { type: 'chat'; userId: number; content: string; }
  | { type: 'state'; state: ServerState; }
  | { type: 'join'; roomId: string; side: string; gameConfig: Derived; state: ServerState; }
  | { type: 'start'; timestamp: Number; }
  | { type: 'leave'; roomId: string }
  | { type: 'reset' }

  // ws.on("reset", (m: { type: "reset" }) => {

class WSClient {
  private ws?: WebSocket;
  private queue: string[] = [];
  private listeners: Map<string, Set<(m: any) => void>> = new Map();
  private connected = false;
  public userId?: number;
  private reconnectTimeout?: ReturnType<typeof setTimeout>;
  private heartbeatInterval?: ReturnType<typeof setInterval>;

  private WS_URL = location.protocol === "https:"
    ? `wss://${location.host}/ws`
    : `ws://${location.host}/ws`;

  connect(userId: number) {
    // Avoid duplicate connections
    if (this.connected && this.ws?.readyState === WebSocket.OPEN) return;

    this.userId = userId;
    this.ws = new WebSocket(this.WS_URL);

    this.ws.onopen = () => {
      this.connected = true;
      console.log("[WS] Connected");
      this.flush();
      this.send({ type: "hello", userId });

      // Start heartbeat (ping every 25s)
      this.startHeartbeat();
    };

    this.ws.onmessage = (event) => {
      const msg: Msg = JSON.parse(event.data);
      const listeners = this.listeners.get(msg.type);
      if (listeners) {
        for (const cb of listeners) cb(msg);
      }
    };

    this.ws.onclose = () => {
      console.warn("[WS] Connection closed");
      this.connected = false;
      this.stopHeartbeat();
      this.scheduleReconnect();
    };

    this.ws.onerror = (err) => {
      console.error("[WS] Error:", err);
      this.ws?.close();
    };
  }

  on(type: string, handler: (m: any) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(handler);
  }

  off(type: string, handler: (m: any) => void) {
    this.listeners.get(type)?.delete(handler);
  }

  send(obj: any) {
    const s = JSON.stringify(obj);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(s);
    } else {
      this.queue.push(s);
    }
  }

  close() {
    this.stopHeartbeat();
    this.ws?.close();
    this.userId = undefined;
    this.connected = false;
    clearTimeout(this.reconnectTimeout);
  }

  private flush() {
    while (this.queue.length && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(this.queue.shift()!);
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimeout || !this.userId) return; // already scheduled or no user
    console.log("[WS] Reconnecting in 3s...");
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = undefined;
      this.connect(this.userId!);
    }, 3000);
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send({ type: "ping" });
      }
    }, 25000);
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = undefined;
  }
}

export const ws = new WSClient();
