import React, { useState, useEffect, useCallback } from 'react';
import { socket, connectSocket } from '../services/socket';
import { devicesAPI, alarmsAPI } from '../services/api';
import LiveChart from '../components/LiveChart';
import AlarmCard from '../components/AlarmCard';
import DeviceCard from '../components/DeviceCard';
import DeviceDetailPanel from '../components/DeviceDetailPanel';

const MAX_POINTS = 30;

function StatCard({ icon, label, value, color = 'text-blue-400' }) {
  return (
    <div className="card flex items-center gap-4">
      <div className={`text-3xl ${color}`}>{icon}</div>
      <div>
        <p className="text-2xl font-bold text-white">{value ?? '—'}</p>
        <p className="text-sm text-slate-400">{label}</p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [devices, setDevices] = useState([]);
  const [alarms, setAlarms] = useState([]);
  const [globalChartData, setGlobalChartData] = useState([]);
  const [deviceChartData, setDeviceChartData] = useState({});
  const [stats, setStats] = useState({ activeDevices: 0, alarmsToday: 0, highRisk: 0 });
  const [loading, setLoading] = useState(true);
  const [selectedDevice, setSelectedDevice] = useState(null);

  const loadData = useCallback(async () => {
    try {
      const [devRes, alarmRes, statsRes] = await Promise.all([
        devicesAPI.getAll(),
        alarmsAPI.getAll({ limit: 10, resolved: false }),
        alarmsAPI.getStats()
      ]);
      const devList = devRes.data.data;
      const alarmList = alarmRes.data.data;
      const alarmStats = statsRes.data.data;
      setDevices(devList);
      setAlarms(alarmList);
      setStats({
        activeDevices: devList.filter((d) => d.status === 'active').length,
        alarmsToday: alarmStats.todayCount || 0,
        highRisk: devList.filter((d) => d.riskScore >= 75).length
      });
    } catch (_) {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    connectSocket();
    loadData();

    const onSensorUpdate = (data) => {
      const time = new Date(data.timestamp).toLocaleTimeString('tr-TR', {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
      const accel = data.sensors?.accelerometer;
      const accelMag = accel
        ? parseFloat(Math.sqrt(accel.x ** 2 + accel.y ** 2 + accel.z ** 2).toFixed(3))
        : null;

      const point = {
        time,
        audioLevel: data.sensors?.audioLevel ?? 0,
        accelMag: accelMag ?? 1,
        riskScore: data.riskScore ?? 0,
        threshold: 2.5
      };

      // Global chart (tüm cihazlar)
      setGlobalChartData((prev) => [...prev.slice(-(MAX_POINTS * 2) + 1), point]);

      // Per-device chart
      setDeviceChartData((prev) => ({
        ...prev,
        [data.deviceId]: [...(prev[data.deviceId] || []).slice(-MAX_POINTS + 1), point]
      }));

      // Cihaz last seen güncelle
      setDevices((prev) =>
        prev.map((d) =>
          d._id === data.deviceId
            ? { ...d, status: 'active', lastSeen: data.timestamp, batteryLevel: data.sensors?.battery != null ? Math.round(data.sensors.battery * 100) : d.batteryLevel }
            : d
        )
      );
    };

    const onAlarmNew = (alarm) => {
      setAlarms((prev) => [alarm, ...prev.slice(0, 9)]);
      setStats((prev) => ({ ...prev, alarmsToday: prev.alarmsToday + 1 }));
    };

    const onDeviceStatus = ({ deviceId, status }) => {
      setDevices((prev) =>
        prev.map((d) => (d._id === deviceId ? { ...d, status } : d))
      );
    };

    socket.on('sensor:update', onSensorUpdate);
    socket.on('alarm:new', onAlarmNew);
    socket.on('device:status', onDeviceStatus);

    const refreshInterval = setInterval(loadData, 30000);
    return () => {
      socket.off('sensor:update', onSensorUpdate);
      socket.off('alarm:new', onAlarmNew);
      socket.off('device:status', onDeviceStatus);
      clearInterval(refreshInterval);
    };
  }, [loadData]);

  async function resolveAlarm(id) {
    try {
      await alarmsAPI.resolve(id);
      setAlarms((prev) => prev.filter((a) => a._id !== id));
    } catch (_) {}
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400 animate-pulse">Yükleniyor...</div>
      </div>
    );
  }

  const onlineDevices = devices.filter((d) => d.status === 'active');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Dashboard</h1>
        <span className="text-xs text-slate-500">
          Otomatik yenileme 30s · Gerçek zamanlı Socket.io
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon="📱" label="Aktif Cihaz" value={stats.activeDevices} color="text-green-400" />
        <StatCard icon="🔔" label="Bugünkü Alarm" value={stats.alarmsToday} color="text-yellow-400" />
        <StatCard icon="🚨" label="Aktif Alarm" value={alarms.length} color="text-red-400" />
        <StatCard icon="📊" label="Toplam Cihaz" value={devices.length} color="text-blue-400" />
      </div>

      {/* Global Chart + Alarms */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <LiveChart data={globalChartData} title="Canlı Sensör Akışı (tüm cihazlar)" />
        </div>
        <div className="card">
          <h3 className="font-semibold text-slate-200 mb-3">
            Aktif Alarmlar
            {alarms.length > 0 && (
              <span className="ml-2 bg-red-900 text-red-300 text-xs px-1.5 py-0.5 rounded">
                {alarms.length}
              </span>
            )}
          </h3>
          {alarms.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-500">
              <span className="text-3xl mb-2">✅</span>
              <p className="text-sm">Aktif alarm yok</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {alarms.map((alarm) => (
                <AlarmCard key={alarm._id} alarm={alarm} onResolve={resolveAlarm} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Device grid */}
      <div>
        <h3 className="font-semibold text-slate-200 mb-1">
          Cihaz Durumu
          <span className="ml-2 text-xs text-slate-500 font-normal">
            {onlineDevices.length} / {devices.length} online
          </span>
        </h3>
        <p className="text-xs text-slate-500 mb-3">Bir cihaza tıkla → canlı ses ve hareket grafiğini gör</p>
        {devices.length === 0 ? (
          <div className="card text-center text-slate-500 py-8">
            Kayıtlı cihaz yok.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {devices.map((device) => (
              <div
                key={device._id}
                onClick={() => setSelectedDevice(device._id === selectedDevice?._id ? null : device)}
                className={`transition-all ${selectedDevice?._id === device._id ? 'ring-2 ring-blue-500 rounded-xl' : ''}`}
              >
                <DeviceCard
                  device={device}
                  latestData={deviceChartData[device._id]?.at(-1)}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Device Detail Panel */}
      {selectedDevice && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-30 bg-black/40"
            onClick={() => setSelectedDevice(null)}
          />
          <DeviceDetailPanel
            device={devices.find(d => d._id === selectedDevice._id) || selectedDevice}
            chartData={deviceChartData[selectedDevice._id] || []}
            onClose={() => setSelectedDevice(null)}
          />
        </>
      )}
    </div>
  );
}
