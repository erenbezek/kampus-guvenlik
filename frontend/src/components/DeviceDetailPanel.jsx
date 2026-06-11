import React from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-800 border border-slate-600 rounded-lg p-2 text-xs shadow-xl">
      <p className="text-slate-400 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: <span className="font-bold">{Number(p.value).toFixed(1)}</span>
        </p>
      ))}
    </div>
  );
};

function timeAgo(ts) {
  if (!ts) return 'never';
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'az önce';
  if (mins < 60) return `${mins} dk önce`;
  return `${Math.floor(mins / 60)} saat önce`;
}

export default function DeviceDetailPanel({ device, chartData, onClose }) {
  if (!device) return null;

  const isOnline = device.status === 'active';
  const latest = chartData?.[chartData.length - 1];

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full sm:w-[480px] bg-slate-900 border-l border-slate-700 shadow-2xl flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700 bg-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-green-400 animate-pulse' : 'bg-slate-500'}`} />
            <h2 className="font-bold text-white text-lg">{device.name}</h2>
            <span className={`text-xs px-1.5 py-0.5 rounded ${isOnline ? 'bg-green-900 text-green-400' : 'bg-slate-700 text-slate-400'}`}>
              {isOnline ? 'Online' : 'Offline'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5 font-mono">{device.deviceId}</p>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white text-2xl leading-none transition-colors"
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Anlık değerler */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-slate-800 rounded-lg p-3 text-center">
            <p className="text-yellow-400 text-xl font-bold">
              {latest?.audioLevel != null ? `${latest.audioLevel.toFixed(0)}` : '—'}
            </p>
            <p className="text-slate-500 text-xs mt-0.5">Ses (dB)</p>
          </div>
          <div className="bg-slate-800 rounded-lg p-3 text-center">
            <p className="text-blue-400 text-xl font-bold">
              {latest?.accelMag != null ? `${latest.accelMag.toFixed(2)}` : '—'}
            </p>
            <p className="text-slate-500 text-xs mt-0.5">İvme (G)</p>
          </div>
          <div className="bg-slate-800 rounded-lg p-3 text-center">
            <p className={`text-xl font-bold ${
              (latest?.riskScore ?? 0) >= 75 ? 'text-red-400'
              : (latest?.riskScore ?? 0) >= 50 ? 'text-orange-400'
              : (latest?.riskScore ?? 0) >= 25 ? 'text-yellow-400'
              : 'text-green-400'
            }`}>
              {latest?.riskScore ?? '—'}
            </p>
            <p className="text-slate-500 text-xs mt-0.5">Risk Skoru</p>
          </div>
        </div>

        {/* Ses Grafiği */}
        <div className="bg-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-200">🔊 Ses Seviyesi</h3>
            <span className="text-xs text-slate-500">Son 30 okuma</span>
          </div>
          {!chartData?.length ? (
            <div className="h-32 flex items-center justify-center text-slate-500 text-xs">
              Veri bekleniyor...
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={chartData} margin={{ top: 2, right: 4, left: -20, bottom: 2 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 9 }} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fill: '#64748b', fontSize: 9 }} tickLine={false} axisLine={false} domain={[0, 110]} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="audioLevel" name="Ses (dB)" stroke="#f59e0b" strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Hareket Grafiği */}
        <div className="bg-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-200">📳 İvmeölçer Büyüklüğü</h3>
            <span className="text-xs text-slate-500">Normal ≈ 1.0 G</span>
          </div>
          {!chartData?.length ? (
            <div className="h-32 flex items-center justify-center text-slate-500 text-xs">
              Veri bekleniyor...
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={chartData} margin={{ top: 2, right: 4, left: -20, bottom: 2 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 9 }} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fill: '#64748b', fontSize: 9 }} tickLine={false} axisLine={false} domain={[0, 5]} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="accelMag" name="İvme (G)" stroke="#60a5fa" strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
                {/* Eşik çizgisi */}
                <Line type="monotone" dataKey="threshold" name="Alarm Eşiği" stroke="#ef4444" strokeWidth={1} strokeDasharray="4 4" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Cihaz bilgisi */}
        <div className="bg-slate-800 rounded-xl p-4 space-y-2 text-xs">
          <h3 className="text-sm font-semibold text-slate-200 mb-2">📱 Cihaz Bilgisi</h3>
          <div className="flex justify-between"><span className="text-slate-400">Son görülme</span><span className="text-white">{timeAgo(device.lastSeen)}</span></div>
          {device.location?.lat && (
            <div className="flex justify-between">
              <span className="text-slate-400">GPS</span>
              <span className="text-white font-mono">{device.location.lat.toFixed(5)}, {device.location.lng.toFixed(5)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
