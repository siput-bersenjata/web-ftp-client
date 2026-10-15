class WebSocketClient {
  constructor() {
    this.ws = null;
    this.listeners = new Set();
    this.reconnectTimer = null;
  }

  connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('⚡ Connected to FTP Event Stream via WebSocket');
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.listeners.forEach((callback) => callback(data));
        } catch (err) {
          console.error('Error parsing WS message:', err);
        }
      };

      this.ws.onclose = () => {
        console.log('WS disconnected, reconnecting in 3s...');
        this.scheduleReconnect();
      };

      this.ws.onerror = (err) => {
        console.error('WS Error:', err);
        this.ws.close();
      };
    } catch (err) {
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 3000);
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }
}

export const wsClient = new WebSocketClient();
