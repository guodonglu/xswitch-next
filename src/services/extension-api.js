export async function request(type, payload = {}) {
  const response = await chrome.runtime.sendMessage({ type, payload });
  if (!response?.success) throw new Error(response?.error ?? '扩展服务未响应，请重新打开侧栏');
  return response.data;
}
