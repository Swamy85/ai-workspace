import { downloadBlob } from './utils';

// Use NEXT_PUBLIC_API_URL when set; otherwise talk to the same host on :4000.
// That keeps the app working when opened from another device on your LAN.
const fallbackApi =
  typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:4000/api`
    : 'http://localhost:4000/api';

export const API = process.env.NEXT_PUBLIC_API_URL || fallbackApi;

async function errorFrom(res) {
  try {
    return (await res.json()).error || `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

async function req(path, { method = 'GET', body, formData } = {}) {
  let res;
  try {
    res = await fetch(API + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: formData || (body ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new Error('Cannot reach the API server. Is it running on ' + API + '?');
  }
  if (!res.ok) throw new Error(await errorFrom(res));
  return res.json();
}

export const api = {
  models: () => req('/models'),

  listChats: (q) => req('/chats' + (q ? `?q=${encodeURIComponent(q)}` : '')),
  createChat: (body) => req('/chats', { method: 'POST', body }),
  getChat: (id) => req(`/chats/${id}`),
  patchChat: (id, body) => req(`/chats/${id}`, { method: 'PATCH', body }),
  deleteChat: (id) => req(`/chats/${id}`, { method: 'DELETE' }),
  clearChats: () => req('/chats', { method: 'DELETE' }),

  uploadFile: (chatId, file) => {
    const fd = new FormData();
    fd.append('file', file);
    return req(`/files?chatId=${encodeURIComponent(chatId)}`, { method: 'POST', formData: fd });
  },
  deleteFile: (chatId, fileId) => req(`/chats/${chatId}/files/${fileId}`, { method: 'DELETE' }),

  listPrompts: () => req('/prompts'),
  createPrompt: (body) => req('/prompts', { method: 'POST', body }),
  updatePrompt: (id, body) => req(`/prompts/${id}`, { method: 'PATCH', body }),
  deletePrompt: (id) => req(`/prompts/${id}`, { method: 'DELETE' }),

  listMemory: () => req('/memory'),
  addMemory: (text) => req('/memory', { method: 'POST', body: { text } }),
  updateMemory: (id, body) => req(`/memory/${id}`, { method: 'PATCH', body }),
  deleteMemory: (id) => req(`/memory/${id}`, { method: 'DELETE' }),
};

/** Fetch an export endpoint and trigger a browser download. */
export async function downloadExport(path, fallbackName) {
  const res = await fetch(API + path);
  if (!res.ok) throw new Error(await errorFrom(res));
  const disposition = res.headers.get('Content-Disposition') || '';
  const name = /filename="?([^";]+)"?/.exec(disposition)?.[1] || fallbackName;
  downloadBlob(await res.blob(), name);
}
