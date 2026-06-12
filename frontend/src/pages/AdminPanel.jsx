import React, { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Polygon, useMapEvents, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import api from '../services/api';

// Fix Leaflet icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
});

const ZONE_TYPES = [
  { value: 'critical', label: '🔴 Kritik Alan', color: '#dc2626' },
  { value: 'restricted', label: '🟠 Yasak Bölge', color: '#ea580c' },
  { value: 'lab', label: '🟡 Laboratuvar', color: '#d97706' },
  { value: 'safe', label: '🟢 Güvenli Alan', color: '#16a34a' },
  { value: 'emergency', label: '🟣 Acil Toplanma', color: '#9333ea' }
];

const typeColor = (type) => ZONE_TYPES.find(t => t.value === type)?.color || '#ef4444';
const typeLabel = (type) => ZONE_TYPES.find(t => t.value === type)?.label || type;

// Haritaya tıklayınca nokta ekler
function ClickHandler({ onAdd }) {
  useMapEvents({ click: (e) => onAdd({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

function pointIcon(i) {
  return L.divIcon({
    html: `<div style="width:20px;height:20px;border-radius:50%;background:#3b82f6;border:2px solid white;display:flex;align-items:center;justify-content:center;font-size:9px;color:white;font-weight:bold">${i + 1}</div>`,
    className: '',
    iconAnchor: [10, 10]
  });
}

function ZoneDrawMap({ points, onAddPoint, existingZones }) {
  return (
    <MapContainer center={[40.18761378070147, 29.12915854897244]} zoom={16} style={{ height: '320px', width: '100%' }} className="z-0 rounded-lg">
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <ClickHandler onAdd={onAddPoint} />

      {/* Mevcut zone'lar */}
      {existingZones.map((z, i) => (
        <Polygon
          key={i}
          positions={z.polygon.map(p => [p.lat, p.lng])}
          pathOptions={{ color: typeColor(z.type), fillColor: typeColor(z.type), fillOpacity: 0.2, weight: 2 }}
        >
          <Popup><span className="font-bold text-slate-900">{z.name}</span><br /><span className="text-xs">{typeLabel(z.type)}</span></Popup>
        </Polygon>
      ))}

      {/* Çizilen noktalar */}
      {points.map((p, i) => (
        <Marker key={i} position={[p.lat, p.lng]} icon={pointIcon(i)} />
      ))}

      {/* Çizilen polygon preview */}
      {points.length >= 3 && (
        <Polygon
          positions={points.map(p => [p.lat, p.lng])}
          pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.25, weight: 2, dashArray: '5 5' }}
        />
      )}
    </MapContainer>
  );
}

// ── İnvite Code Yönetimi ────────────────────────────────────────────────────
function InviteCodesTab() {
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [newCode, setNewCode] = useState(null);
  const [error, setError] = useState('');

  const fetchCodes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/invite-codes');
      setCodes(res.data.data);
    } catch (e) {
      setError(e.response?.data?.error || 'Kodlar yüklenemedi');
    }
    setLoading(false);
  }, []);

  const generateCode = async () => {
    setGenerating(true);
    setNewCode(null);
    setError('');
    try {
      const res = await api.post('/admin/invite-codes');
      setNewCode(res.data.data.code);
      fetchCodes();
    } catch (e) {
      setError(e.response?.data?.error || 'Kod oluşturulamadı');
    }
    setGenerating(false);
  };

  const deleteCode = async (code) => {
    if (!confirm(`"${code}" kodunu iptal et?`)) return;
    try {
      await api.delete(`/admin/invite-codes/${code}`);
      fetchCodes();
    } catch (e) {
      setError(e.response?.data?.error || 'Kod silinemedi');
    }
  };

  useEffect(() => { fetchCodes(); }, [fetchCodes]);

  return (
    <div className="space-y-5">
      {error && <div className="bg-red-900/40 border border-red-700 rounded-lg px-4 py-3 text-red-300 text-sm">{error}</div>}

      <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
        <h3 className="font-semibold text-white mb-3">🔑 Yeni Davet Kodu</h3>
        <p className="text-slate-400 text-xs mb-4">Operatör hesabı açmak isteyen kişiye bu kodu verin. Her kod yalnızca bir kez kullanılabilir.</p>
        <button onClick={generateCode} disabled={generating} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold px-5 py-2 rounded-lg transition-colors text-sm">
          {generating ? '⏳ Oluşturuluyor...' : '+ Yeni Kod Oluştur'}
        </button>
        {newCode && (
          <div className="mt-4 flex items-center gap-3 bg-green-900/30 border border-green-700 rounded-lg px-5 py-3">
            <span className="text-green-400 font-mono text-xl font-bold tracking-widest">{newCode}</span>
            <button onClick={() => navigator.clipboard.writeText(newCode)} className="text-xs text-green-300 border border-green-700 rounded px-2 py-1">Kopyala</button>
          </div>
        )}
      </div>

      <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-white">📋 Kod Listesi</h3>
          <button onClick={fetchCodes} className="text-xs text-slate-400 hover:text-white">{loading ? '⏳' : '🔄'}</button>
        </div>
        {codes.length === 0 ? (
          <p className="text-slate-500 text-center py-6 text-sm">Henüz kod yok.</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-slate-400 border-b border-slate-700 text-xs">
              <th className="pb-2 pr-4">Kod</th><th className="pb-2 pr-4">Durum</th><th className="pb-2 pr-4">Kullanan</th><th className="pb-2">İşlem</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-700">
              {codes.map((c) => (
                <tr key={c.code} className="text-slate-300">
                  <td className="py-2.5 pr-4 font-mono font-bold text-white">{c.code}</td>
                  <td className="py-2.5 pr-4">
                    {c.isUsed
                      ? <span className="bg-green-900/40 text-green-400 text-xs px-2 py-0.5 rounded-full">Kullanıldı</span>
                      : <span className="bg-yellow-900/40 text-yellow-400 text-xs px-2 py-0.5 rounded-full">Bekliyor</span>}
                  </td>
                  <td className="py-2.5 pr-4 text-slate-400 text-xs">{c.usedBy ? `${c.usedBy.username}` : '—'}</td>
                  <td className="py-2.5">
                    {!c.isUsed && (
                      <button onClick={() => deleteCode(c.code)} className="text-xs text-red-400 hover:text-red-300 border border-red-800 rounded px-2 py-0.5">İptal</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Zone Yönetimi ─────────────────────────────────────────────────────────
function ZonesTab() {
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [drawing, setDrawing] = useState(false);
  const [points, setPoints] = useState([]);
  const [form, setForm] = useState({ name: '', type: 'restricted', description: '' });
  const [saving, setSaving] = useState(false);

  const fetchZones = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/zones');
      setZones(res.data.data);
    } catch (e) {
      setError(e.response?.data?.error || 'Bölgeler yüklenemedi');
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchZones(); }, [fetchZones]);

  const startDrawing = () => {
    setDrawing(true);
    setPoints([]);
    setForm({ name: '', type: 'restricted', description: '' });
    setError('');
  };

  const cancelDrawing = () => {
    setDrawing(false);
    setPoints([]);
  };

  const undoPoint = () => setPoints(prev => prev.slice(0, -1));

  const saveZone = async () => {
    if (!form.name.trim()) { setError('Bölge adı gerekli'); return; }
    if (points.length < 3) { setError('En az 3 nokta ekleyin'); return; }
    setSaving(true);
    setError('');
    try {
      await api.post('/admin/zones', { ...form, polygon: points });
      setDrawing(false);
      setPoints([]);
      fetchZones();
    } catch (e) {
      setError(e.response?.data?.error || 'Kaydedilemedi');
    }
    setSaving(false);
  };

  const deleteZone = async (id) => {
    if (!confirm('Bu bölgeyi silmek istiyor musunuz?')) return;
    try {
      await api.delete(`/admin/zones/${id}`);
      fetchZones();
    } catch (e) {
      setError(e.response?.data?.error || 'Silinemedi');
    }
  };

  return (
    <div className="space-y-5">
      {error && <div className="bg-red-900/40 border border-red-700 rounded-lg px-4 py-3 text-red-300 text-sm">{error}</div>}

      {/* Harita */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-white">🗺️ Bölge Haritası</h3>
          {!drawing ? (
            <button onClick={startDrawing} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-1.5 rounded-lg transition-colors">
              + Yeni Bölge Çiz
            </button>
          ) : (
            <div className="flex gap-2">
              <button onClick={undoPoint} disabled={points.length === 0} className="text-xs text-slate-400 hover:text-white border border-slate-600 rounded px-2 py-1 disabled:opacity-40">↩ Geri Al</button>
              <button onClick={cancelDrawing} className="text-xs text-red-400 border border-red-800 rounded px-2 py-1">İptal</button>
            </div>
          )}
        </div>

        {drawing && (
          <div className="mb-3 bg-blue-900/30 border border-blue-700 rounded-lg px-4 py-2 text-blue-300 text-xs">
            📍 Haritaya tıklayarak polygon noktaları ekle ({points.length} nokta eklendi — en az 3 gerekli)
          </div>
        )}

        <ZoneDrawMap
          points={points}
          onAddPoint={drawing ? (p) => setPoints(prev => [...prev, p]) : () => {}}
          existingZones={zones}
        />
      </div>

      {/* Yeni zone formu — sadece çizim modunda göster */}
      {drawing && (
        <div className="bg-slate-800 rounded-xl border border-blue-800 p-5 space-y-4">
          <h3 className="font-semibold text-white">Bölge Bilgileri</h3>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Bölge Adı *</label>
            <input
              type="text"
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              placeholder="örn: Sunucu Odası, Mühendislik Binası..."
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Bölge Türü</label>
            <select
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              value={form.type}
              onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
            >
              {ZONE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Açıklama (opsiyonel)</label>
            <input
              type="text"
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              placeholder="Bu bölge hakkında kısa açıklama..."
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded" style={{ background: typeColor(form.type) }} />
            <span className="text-xs text-slate-400">Haritada bu renkte gösterilecek</span>
          </div>
          <button
            onClick={saveZone}
            disabled={saving || points.length < 3 || !form.name.trim()}
            className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
          >
            {saving ? '⏳ Kaydediliyor...' : points.length < 3 ? `Haritaya ${3 - points.length} nokta daha ekle` : '✅ Bölgeyi Kaydet'}
          </button>
        </div>
      )}

      {/* Zone listesi */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-white">📋 Kayıtlı Bölgeler</h3>
          <button onClick={fetchZones} className="text-xs text-slate-400 hover:text-white">{loading ? '⏳' : '🔄'}</button>
        </div>
        {zones.length === 0 ? (
          <p className="text-slate-500 text-center py-6 text-sm">
            Henüz bölge eklenmedi. Yukarıdaki haritadan çiz ve kaydet.
          </p>
        ) : (
          <div className="space-y-2">
            {zones.map((z) => (
              <div key={z._id || z.name} className="flex items-center gap-3 p-3 bg-slate-700/50 rounded-lg">
                <div className="w-4 h-4 rounded-sm shrink-0" style={{ background: typeColor(z.type) }} />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium">{z.name}</p>
                  <p className="text-slate-400 text-xs">{typeLabel(z.type)} · {z.polygon?.length || 0} nokta</p>
                  {z.description && <p className="text-slate-500 text-xs italic">{z.description}</p>}
                </div>
                {z._id && (
                  <button onClick={() => deleteZone(z._id)} className="text-xs text-red-400 hover:text-red-300 border border-red-800 rounded px-2 py-1 shrink-0">Sil</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Kullanıcı Listesi ────────────────────────────────────────────────────────
const ROLE_META = {
  admin:    { label: '👑 Admin',    badge: 'bg-purple-900 text-purple-300', border: 'border-purple-700' },
  operator: { label: '🔧 Operatör', badge: 'bg-blue-900 text-blue-300',    border: 'border-blue-700' },
  viewer:   { label: '👁️ İzleyici', badge: 'bg-slate-700 text-slate-300',  border: 'border-slate-600' }
};

function UsersTab() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/admin/users')
      .then(r => setUsers(r.data.data))
      .catch(e => setError(e.response?.data?.error || 'Kullanıcılar yüklenemedi'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center text-slate-400 py-10 animate-pulse">Yükleniyor...</div>;
  if (error) return <div className="bg-red-900/40 border border-red-700 rounded-lg px-4 py-3 text-red-300 text-sm">{error}</div>;

  return (
    <div className="space-y-4">
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-700 flex items-center justify-between">
          <h3 className="font-semibold text-white">Kayıtlı Kullanıcılar</h3>
          <span className="text-xs text-slate-500">{users.length} kullanıcı</span>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-700/40">
            <tr>
              {['Kullanıcı Adı', 'E-posta', 'Rol', 'Kayıt Tarihi'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {users.map(u => {
              const meta = ROLE_META[u.role] || ROLE_META.viewer;
              return (
                <tr key={u._id} className="hover:bg-slate-700/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-white">{u.username}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${meta.badge} ${meta.border}`}>
                      {meta.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {u.createdAt ? new Date(u.createdAt).toLocaleDateString('tr-TR') : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Rol açıklamaları */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-purple-900/20 border border-purple-800 rounded-xl p-4">
          <p className="text-purple-300 font-bold mb-2">👑 Admin</p>
          <ul className="text-slate-400 text-xs space-y-1">
            <li>• Davet kodu oluşturur</li>
            <li>• Bölge ekler / siler</li>
            <li>• Seed ile oluşturulur</li>
          </ul>
        </div>
        <div className="bg-blue-900/20 border border-blue-800 rounded-xl p-4">
          <p className="text-blue-300 font-bold mb-2">🔧 Operatör</p>
          <ul className="text-slate-400 text-xs space-y-1">
            <li>• Davet kodu gerekli</li>
            <li>• Alarm onaylar</li>
            <li>• Cihaz yönetimi</li>
          </ul>
        </div>
        <div className="bg-slate-700/50 border border-slate-600 rounded-xl p-4">
          <p className="text-slate-300 font-bold mb-2">👁️ İzleyici</p>
          <ul className="text-slate-400 text-xs space-y-1">
            <li>• Kod gerekmez</li>
            <li>• Sadece görüntüler</li>
            <li>• Değişiklik yapamaz</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// ── Ana Bileşen ──────────────────────────────────────────────────────────────
export default function AdminPanel() {
  const [tab, setTab] = useState('codes');

  const user = (() => {
    try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; }
  })();

  if (user.role !== 'admin') {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-4xl mb-4">🚫</p>
          <p className="text-slate-400">Bu sayfaya erişim yetkiniz yok.</p>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'codes', label: '🔑 Davet Kodları' },
    { id: 'zones', label: '🗺️ Bölge Yönetimi' },
    { id: 'users', label: '👥 Kullanıcılar' }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">⚙️ Admin Paneli</h1>
        <p className="text-slate-400 text-sm mt-1">Kullanıcı ve bölge yönetimi</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-slate-800 rounded-xl p-1 w-fit border border-slate-700">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.id
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'codes' && <InviteCodesTab />}
      {tab === 'zones' && <ZonesTab />}
      {tab === 'users' && <UsersTab />}
    </div>
  );
}
