import React, { useState, useEffect } from 'react';
import { devicesAPI, sensorsAPI } from '../services/api';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

const ROLE_BADGE = {
  admin:    'bg-purple-900 text-purple-300 border border-purple-700',
  operator: 'bg-blue-900 text-blue-300 border border-blue-700',
  viewer:   'bg-slate-700 text-slate-300 border border-slate-600'
};
const ROLE_TR = { admin: 'Admin', operator: 'Operatör', viewer: 'İzleyici' };

function RegisterModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ deviceId: '', name: '', lat: '', lng: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const payload = {
        deviceId: form.deviceId,
        name: form.name,
        ...(form.lat && form.lng && { location: { lat: parseFloat(form.lat), lng: parseFloat(form.lng) } })
      };
      const res = await devicesAPI.create(payload);
      onCreated(res.data.data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Kayıt başarısız');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Yeni Cihaz Ekle</h2>
        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Cihaz ID *</label>
            <input className="input" placeholder="BTU-009" value={form.deviceId}
              onChange={(e) => setForm({ ...form, deviceId: e.target.value })} required />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">İsim *</label>
            <input className="input" placeholder="Ana Kapı Sensörü" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Enlem</label>
              <input className="input" type="number" step="any" placeholder="40.2378"
                value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Boylam</label>
              <input className="input" type="number" step="any" placeholder="29.0076"
                value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-ghost flex-1">İptal</button>
            <button type="submit" className="btn-primary flex-1" disabled={loading}>
              {loading ? 'Ekleniyor...' : 'Ekle'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeviceDetail({ device, onBack }) {
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const [histRes, statsRes] = await Promise.all([
          sensorsAPI.getData({ deviceId: device.deviceId, limit: 100 }),
          sensorsAPI.getStats(device.deviceId)
        ]);
        const data = histRes.data.data
          .reverse()
          .map((d) => ({
            time: new Date(d.timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
            audio: d.sensors?.audioLevel?.toFixed(1),
            risk: d.riskScore
          }));
        setHistory(data);
        setStats(statsRes.data.data);
      } catch (_) {}
    }
    load();
  }, [device.deviceId]);

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="btn-ghost text-sm">← Listeye Dön</button>
      <h2 className="text-xl font-bold text-white">{device.name}</h2>
      <p className="text-slate-400 text-sm">{device.deviceId}</p>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Toplam Okuma', value: stats.totalReadings },
            { label: 'Son 24 Saat', value: stats.last24h },
            { label: 'Ort. Ses (dB)', value: stats.avgAudioLevel },
            { label: 'Max Risk', value: stats.maxRiskScore }
          ].map(({ label, value }) => (
            <div key={label} className="card text-center">
              <p className="text-xl font-bold text-white">{value ?? '—'}</p>
              <p className="text-xs text-slate-400 mt-1">{label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h3 className="font-medium text-slate-200 mb-4">Sensör Geçmişi (son 100 okuma)</h3>
        {history.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-8">Sensör verisi yok</p>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={history}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="time" tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="audio" name="Ses (dB)" stroke="#f59e0b" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="risk" name="Risk Skoru" stroke="#ef4444" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

export default function DeviceManagement() {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selected, setSelected] = useState(null);

  const user = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } })();
  const isAdmin = user.role === 'admin';

  useEffect(() => { loadDevices(); }, []);

  async function loadDevices() {
    try {
      const res = await devicesAPI.getAll();
      setDevices(res.data.data);
    } finally {
      setLoading(false);
    }
  }

  async function deleteDevice(id) {
    if (!window.confirm('Bu cihazı silmek istiyor musunuz? Bu işlem geri alınamaz.')) return;
    try {
      await devicesAPI.remove(id);
      setDevices((prev) => prev.filter((d) => d._id !== id));
    } catch (err) {
      alert(err.response?.data?.error || 'Silme başarısız');
    }
  }

  if (selected) return <DeviceDetail device={selected} onBack={() => setSelected(null)} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">📡 Cihaz Yönetimi</h1>
        {(isAdmin || user.role === 'operator') && (
          <button className="btn-primary text-sm" onClick={() => setShowModal(true)}>
            + Cihaz Ekle
          </button>
        )}
      </div>

      {loading ? (
        <div className="card text-center text-slate-400 py-8 animate-pulse">Yükleniyor...</div>
      ) : devices.length === 0 ? (
        <div className="card text-center text-slate-500 py-12">
          Kayıtlı cihaz yok. "Cihaz Ekle" butonuna tıklayın.
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-700/50">
              <tr>
                {['Cihaz ID', 'İsim', 'Sahip', 'Durum', 'Son Görülme', 'İşlemler'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {devices.map((d) => (
                <tr key={d._id} className="hover:bg-slate-700/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-slate-300">{d.deviceId}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setSelected(d)}
                      className="text-blue-400 hover:text-blue-300 font-medium"
                    >
                      {d.name}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-300 text-xs">{d.owner?.username || '—'}</span>
                      {d.owner?.role && (
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${ROLE_BADGE[d.owner.role] || ROLE_BADGE.viewer}`}>
                          {ROLE_TR[d.owner.role] || d.owner.role}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 text-xs font-medium ${
                      d.status === 'active' ? 'text-green-400' : 'text-slate-500'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${d.status === 'active' ? 'bg-green-400 animate-pulse' : 'bg-slate-600'}`} />
                      {d.status === 'active' ? 'Aktif' : 'Pasif'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {d.lastSeen ? new Date(d.lastSeen).toLocaleString('tr-TR') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSelected(d)}
                        className="text-xs text-blue-400 hover:text-blue-300"
                      >
                        Detay
                      </button>
                      {isAdmin && (
                        <button
                          onClick={() => deleteDevice(d._id)}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          Sil
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <RegisterModal
          onClose={() => setShowModal(false)}
          onCreated={(d) => setDevices((prev) => [d, ...prev])}
        />
      )}
    </div>
  );
}
