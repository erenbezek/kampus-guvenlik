import React, { useState, useEffect } from 'react';
import { devicesAPI, sensorsAPI, alarmsAPI } from '../services/api';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from 'recharts';

function HeatmapCell({ count, max }) {
  const intensity = max > 0 ? count / max : 0;
  const alpha = 0.1 + intensity * 0.9;
  return (
    <div
      title={`${count} alarms`}
      className="aspect-square rounded-sm flex items-center justify-center text-xs font-mono cursor-default"
      style={{ background: `rgba(239,68,68,${alpha})`, color: intensity > 0.5 ? 'white' : '#94a3b8', fontSize: 9 }}
    >
      {count > 0 ? count : ''}
    </div>
  );
}

export default function Analytics() {
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [timeSeriesData, setTimeSeriesData] = useState([]);
  const [hourlyData, setHourlyData] = useState(Array(24).fill(0));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadDevices() {
      const res = await devicesAPI.getAll();
      setDevices(res.data.data);
      if (res.data.data.length > 0) setSelectedDevice(res.data.data[0].deviceId);
    }
    loadDevices();

    // Load hourly heatmap from alarm stats
    alarmsAPI.getStats().then((res) => {
      const hourly = Array(24).fill(0);
      res.data.data.hourlyData?.forEach(({ _id, count }) => { hourly[_id] = count; });
      setHourlyData(hourly);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedDevice) return;
    setLoading(true);
    sensorsAPI.getData({ deviceId: selectedDevice, limit: 200 }).then((res) => {
      const data = res.data.data
        .reverse()
        .map((d) => ({
          time: new Date(d.timestamp).toLocaleString('en-GB', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
          }),
          audio: parseFloat((d.sensors?.audioLevel || 0).toFixed(1)),
          risk: d.riskScore,
          network: d.sensors?.networkStrength || 0
        }));
      setTimeSeriesData(data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [selectedDevice]);

  const maxHourly = Math.max(...hourlyData);
  const hourlyBarData = hourlyData.map((count, h) => ({
    hour: `${String(h).padStart(2, '0')}:00`,
    alarms: count
  }));

  function downloadCSV() {
    if (!timeSeriesData.length) return;
    const header = 'Time,Audio (dB),Risk Score,Network Strength';
    const rows = timeSeriesData.map((d) => `${d.time},${d.audio},${d.risk},${d.network}`);
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedDevice}_analytics.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const tooltipStyle = {
    background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-white">📊 Analitik</h1>
        <div className="flex items-center gap-3">
          <select
            className="input w-auto text-sm"
            value={selectedDevice}
            onChange={(e) => setSelectedDevice(e.target.value)}
          >
            {devices.map((d) => (
              <option key={d._id} value={d.deviceId}>{d.name}</option>
            ))}
          </select>
          <button onClick={downloadCSV} className="btn-ghost text-sm" disabled={!timeSeriesData.length}>
            ⬇ CSV İndir
          </button>
        </div>
      </div>

      {/* Time Series Chart */}
      <div className="card">
        <h3 className="font-semibold text-slate-200 mb-4">
          Sensör Zaman Serisi — {devices.find((d) => d.deviceId === selectedDevice)?.name || selectedDevice}
        </h3>
        {loading ? (
          <div className="h-52 flex items-center justify-center text-slate-400 animate-pulse text-sm">
            Yükleniyor...
          </div>
        ) : timeSeriesData.length === 0 ? (
          <div className="h-52 flex items-center justify-center text-slate-500 text-sm">
            Bu cihaz için veri yok
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={timeSeriesData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="time" tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} interval={Math.floor(timeSeriesData.length / 10)} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
              <Line type="monotone" dataKey="audio" name="Ses (dB)" stroke="#f59e0b" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="risk" name="Risk Skoru" stroke="#ef4444" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="network" name="Ağ Gücü %" stroke="#3b82f6" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Alarm heatmap by hour */}
        <div className="card">
          <h3 className="font-semibold text-slate-200 mb-4">Saatlik Alarm Sıklığı (son 7 gün)</h3>
          <div className="grid grid-cols-12 gap-1 mb-2">
            {hourlyData.map((count, h) => (
              <HeatmapCell key={h} count={count} max={maxHourly} />
            ))}
          </div>
          <div className="flex justify-between text-xs text-slate-500 mt-1">
            <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span>
          </div>
          <ResponsiveContainer width="100%" height={160} className="mt-4">
            <BarChart data={hourlyBarData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="hour" tick={{ fill: '#94a3b8', fontSize: 9 }} tickLine={false} interval={3} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="alarms" fill="#ef4444" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Risk score distribution */}
        <div className="card">
          <h3 className="font-semibold text-slate-200 mb-4">Risk Skoru Dağılımı</h3>
          {timeSeriesData.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-12">Dağılımı görmek için cihaz seçin</p>
          ) : (() => {
            const buckets = [
              { label: '0–25 (Güvenli)', range: [0, 25], color: '#22c55e' },
              { label: '26–50 (Düşük)', range: [26, 50], color: '#eab308' },
              { label: '51–75 (Orta)', range: [51, 75], color: '#f97316' },
              { label: '76–100 (Yüksek)', range: [76, 100], color: '#ef4444' }
            ];
            const data = buckets.map((b) => ({
              ...b,
              count: timeSeriesData.filter((d) => d.risk >= b.range[0] && d.risk <= b.range[1]).length
            }));
            return (
              <div className="space-y-3">
                {data.map((b) => {
                  const pct = timeSeriesData.length ? ((b.count / timeSeriesData.length) * 100).toFixed(1) : 0;
                  return (
                    <div key={b.label}>
                      <div className="flex justify-between text-xs text-slate-400 mb-1">
                        <span>{b.label}</span>
                        <span>{b.count} okuma ({pct}%)</span>
                      </div>
                      <div className="w-full h-3 bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, background: b.color }}
                        />
                      </div>
                    </div>
                  );
                })}
                <p className="text-xs text-slate-500 pt-2">
                  Seçili cihaz için {timeSeriesData.length} okuma baz alındı
                </p>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
