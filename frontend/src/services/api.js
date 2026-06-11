import axios from 'axios';

// Dev: proxy üzerinden /api → localhost:3001/api
// Production: VITE_API_URL env variable ile Railway URL'i
const BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10000
});

// Attach JWT on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 globally
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// ── Auth ──────────────────────────────────────────────────────────────────
export const authAPI = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  register: (data) => api.post('/auth/register', data),
  me: () => api.get('/auth/me')
};

// ── Devices ───────────────────────────────────────────────────────────────
export const devicesAPI = {
  getAll: () => api.get('/devices'),
  getOne: (id) => api.get(`/devices/${id}`),
  create: (data) => api.post('/devices', data),
  update: (id, data) => api.put(`/devices/${id}`, data),
  remove: (id) => api.delete(`/devices/${id}`),
  getStatus: (id) => api.get(`/devices/${id}/status`)
};

// ── Sensors ───────────────────────────────────────────────────────────────
export const sensorsAPI = {
  postData: (data) => api.post('/sensors/data', data),
  getData: (params) => api.get('/sensors/data', { params }),
  getLatest: (deviceId) => api.get(`/sensors/latest/${deviceId}`),
  getStats: (deviceId) => api.get(`/sensors/stats/${deviceId}`)
};

// ── Alarms ────────────────────────────────────────────────────────────────
export const alarmsAPI = {
  getAll: (params) => api.get('/alarms', { params }),
  resolve: (id) => api.post(`/alarms/${id}/resolve`),
  getStats: () => api.get('/alarms/stats')
};

// ── Admin ─────────────────────────────────────────────────────────────────
export const adminAPI = {
  generateInviteCode: () => api.post('/admin/invite-codes'),
  listInviteCodes: () => api.get('/admin/invite-codes'),
  deleteInviteCode: (code) => api.delete(`/admin/invite-codes/${code}`),
  listZones: () => api.get('/admin/zones'),
  createZone: (data) => api.post('/admin/zones', data),
  updateZone: (id, data) => api.put(`/admin/zones/${id}`, data),
  deleteZone: (id) => api.delete(`/admin/zones/${id}`)
};

// ── Misc ──────────────────────────────────────────────────────────────────
export const zonesAPI = {
  getAll: () => api.get('/zones')
};

export default api;
