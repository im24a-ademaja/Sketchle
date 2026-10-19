const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);

export const API_URL = import.meta.env.VITE_API_URL ||
  (isLocalhost ? 'http://localhost:4000' : window.location.origin);

export async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = localStorage.getItem('token');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || `Die Anfrage ist fehlgeschlagen (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return data;
}
