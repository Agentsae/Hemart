// Internal Durable Object: clients can subscribe but cannot publish updates.
export class CatalogUpdates {
  constructor(state) {
    this.state = state;
  }
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === '/notify' && request.method === 'POST') {
      for (const socket of this.state.getWebSockets()) {
        try {
          socket.send('catalog-changed');
        } catch {
          socket.close(1011, 'Reconnect');
        }
      }
      return new Response(null, { status: 204 });
    }
    if (path !== '/subscribe' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket')
      return new Response('WebSocket required', { status: 426 });
    const [client, server] = Object.values(new WebSocketPair());
    this.state.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }
  webSocketMessage(socket) {
    socket.close(1008, 'Read-only channel');
  }
  webSocketClose(socket, code) {
    socket.close(code);
  }
  webSocketError(socket) {
    socket.close(1011, 'Reconnect');
  }
}
export async function notifyCatalogChange(env) {
  if (!env.CATALOG_UPDATES) return; // Plain Node development has no Durable Objects.
  try {
    const stub = env.CATALOG_UPDATES.get(env.CATALOG_UPDATES.idFromName('catalog'));
    const response = await stub.fetch('https://catalog.internal/notify', { method: 'POST' });
    if (!response.ok) throw new Error('Notification rejected');
  } catch {
    // A notification failure must not turn a committed save into an apparent failure.
    console.error('Catalog notification failed');
  }
}
