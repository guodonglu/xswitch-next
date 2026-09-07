interface NativeRequest { type: string; id: string; method: string; params?: unknown }
type Handler = (method: string, params: any) => Promise<unknown>;
let nativePort: chrome.runtime.Port | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let bridgeWanted = false;
let connecting = false;
let handler: Handler = async () => { throw new Error('Extension service is not ready'); };
let notify = () => {};
let status = { connected: false, nativeConnected: false, lastError: '' };
export function configureMcpBridge(nextHandler: Handler, onChange = () => {}): void { handler = nextHandler; notify = onChange; }
export function getMcpStatus() { return { ...status, enabled: bridgeWanted }; }
function scheduleReconnect() {
  if (!bridgeWanted || reconnectTimer) return;
  reconnectTimer = setTimeout(() => { reconnectTimer = undefined; void connectNativeHost(); }, 5_000);
}
async function connectNativeHost() {
  if (!bridgeWanted || nativePort || connecting) return;
  connecting = true;
  try {
    const granted = await chrome.permissions.contains({ permissions: ['nativeMessaging'] });
    if (!bridgeWanted || !granted) return;
    const port = chrome.runtime.connectNative('com.xswitch.mcp');
    nativePort = port; status = { connected: false, nativeConnected: true, lastError: '' }; notify();
    port.onMessage.addListener((message: NativeRequest) => {
      if (nativePort !== port) return;
      if (message?.type === 'bridge_status') { status.connected = Boolean((message as any).connected); notify(); return; }
      if (!message || message.type !== 'request' || typeof message.id !== 'string') return;
      status.connected = true;
      void handler(message.method, message.params ?? {})
        .then((result) => { if (nativePort === port) port.postMessage({ type: 'response', id: message.id, result }); })
        .catch((error) => { if (nativePort === port) port.postMessage({ type: 'response', id: message.id, error: error.message }); });
    });
    port.onDisconnect.addListener(() => {
      const error = chrome.runtime.lastError?.message ?? '';
      if (nativePort !== port) return;
      nativePort = null; status = { connected: false, nativeConnected: false, lastError: error }; notify(); scheduleReconnect();
    });
    port.postMessage({ type: 'hello', extension_version: chrome.runtime.getManifest().version });
  } catch (error) {
    nativePort = null; status = { connected: false, nativeConnected: false, lastError: String(error) }; notify(); scheduleReconnect();
  } finally { connecting = false; }
}
export function setMcpBridgeEnabled(enabled: boolean): void {
  if (bridgeWanted === enabled && (!enabled || nativePort)) return;
  bridgeWanted = enabled;
  if (!enabled) {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
    const port = nativePort; nativePort = null; port?.disconnect();
    status = { connected: false, nativeConnected: false, lastError: '' }; notify(); return;
  }
  void connectNativeHost();
}
export function reconnectMcpBridge(): void { setMcpBridgeEnabled(false); setMcpBridgeEnabled(true); }
