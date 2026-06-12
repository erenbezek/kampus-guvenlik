import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polygon, useMap } from 'react-leaflet';
import L from 'leaflet';
import { devicesAPI, zonesAPI } from '../services/api';
import { socket, connectSocket } from '../services/socket';

// Fix Leaflet default icon issue with bundlers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
});

function riskIcon(riskScore, status) {
  if (status === 'inactive') {
    return L.divIcon({
      html: `<div style="width:14px;height:14px;border-radius:50%;background:#475569;border:2px solid #64748b"></div>`,
      className: '',
      iconAnchor: [7, 7]
    });
  }
  const color = riskScore >= 75 ? '#ef4444' : riskScore >= 50 ? '#f97316' : riskScore >= 25 ? '#eab308' : '#22c55e';
  return L.divIcon({
    html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 0 6px ${color}88"></div>`,
    className: '',
    iconAnchor: [7, 7]
  });
}

function MapUpdater({ center }) {
  const map = useMap();
  useEffect(() => { if (center) map.setView(center, map.getZoom()); }, [center]);
  return null;
}

export default function MapView() {
  const [devices, setDevices] = useState([]);
  const [zones, setZones] = useState([]);
  const [latestData, setLatestData] = useState({});
  const [loading, setLoading] = useState(true);

  // BTU Mimar Sinan Yerleşkesi merkezi
  const CENTER = [40.18761378070147, 29.12915854897244];

  useEffect(() => {
    connectSocket();

    async function load() {
      try {
        const [devRes, zoneRes] = await Promise.all([
          devicesAPI.getAll(),
          zonesAPI.getAll()
        ]);
        setDevices(devRes.data.data);
        setZones(zoneRes.data.data);
      } finally {
        setLoading(false);
      }
    }
    load();

    const onSensorUpdate = (data) => {
      // Update device location and latest reading
      if (data.sensors?.gps?.lat) {
        setDevices((prev) =>
          prev.map((d) =>
            d._id === data.deviceId
              ? { ...d, location: { lat: data.sensors.gps.lat, lng: data.sensors.gps.lng }, status: 'active', lastSeen: data.timestamp }
              : d
          )
        );
      }
      setLatestData((prev) => ({ ...prev, [data.deviceId]: data }));
    };

    const onDeviceStatus = ({ deviceId, status }) => {
      setDevices((prev) =>
        prev.map((d) => (d._id === deviceId ? { ...d, status } : d))
      );
    };

    socket.on('sensor:update', onSensorUpdate);
    socket.on('device:status', onDeviceStatus);

    return () => {
      socket.off('sensor:update', onSensorUpdate);
      socket.off('device:status', onDeviceStatus);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96 text-slate-400 animate-pulse">
        Loading map...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Campus Map</h1>
        <div className="flex items-center gap-4 text-xs text-slate-400">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-green-500 inline-block" /> Low Risk</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-yellow-500 inline-block" /> Medium</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-orange-500 inline-block" /> High</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> Critical</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-slate-500 inline-block" /> Offline</span>
        </div>
      </div>

      <div className="card p-0 overflow-hidden" style={{ height: 'calc(100vh - 200px)', minHeight: '500px' }}>
        <MapContainer
          center={CENTER}
          zoom={14}
          style={{ height: '100%', width: '100%' }}
          className="z-0"
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>'
          />

          {/* Zone polygon'ları */}
          {zones.map((zone, i) => {
            const isCampus = zone.type === 'safe';
            const icon = isCampus ? '🏫' : zone.type === 'critical' ? '🔴' : zone.type === 'lab' ? '🔬' : zone.type === 'emergency' ? '🚨' : '⛔';
            const label = isCampus ? 'Yerleşke Sınırı' : zone.type === 'critical' ? 'Kritik Alan' : zone.type === 'lab' ? 'Laboratuvar' : zone.type === 'emergency' ? 'Acil Toplanma' : 'Yasak Bölge';
            return (
              <Polygon
                key={i}
                positions={zone.polygon.map((p) => [p.lat, p.lng])}
                pathOptions={{
                  color: zone.color || '#ef4444',
                  fillColor: zone.color || '#ef4444',
                  fillOpacity: isCampus ? 0.08 : 0.2,
                  weight: isCampus ? 2 : 2,
                  dashArray: isCampus ? '6 4' : null
                }}
              >
                <Popup>
                  <div className="text-slate-900">
                    <p className="font-bold">{icon} {zone.name}</p>
                    <p className="text-xs mt-0.5" style={{ color: zone.color || '#ef4444' }}>{label}</p>
                  </div>
                </Popup>
              </Polygon>
            );
          })}

          {/* Device markers — sadece aktif (online) cihazlar */}
          {devices
            .filter((d) => d.status === 'active' && d.location?.lat != null)
            .map((device) => {
              const data = latestData[device._id];
              const risk = data?.riskScore ?? 0;
              return (
                <Marker
                  key={device._id}
                  position={[device.location.lat, device.location.lng]}
                  icon={riskIcon(risk, device.status)}
                >
                  <Popup>
                    <div className="text-slate-900 min-w-40">
                      <p className="font-bold text-sm">{device.name}</p>
                      <p className="text-xs text-slate-600 mb-2">{device.deviceId}</p>
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between">
                          <span>Status:</span>
                          <span className={device.status === 'active' ? 'text-green-600 font-medium' : 'text-red-600'}>
                            {device.status}
                          </span>
                        </div>
                        {data && (
                          <>
                            <div className="flex justify-between">
                              <span>Ses:</span>
                              <span>{data.sensors?.audioLevel?.toFixed(1)} dB</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Risk:</span>
                              <span className="font-bold">{data.riskScore}</span>
                            </div>
                          </>
                        )}
                        {device.location && (
                          <div className="flex justify-between">
                            <span>Konum:</span>
                            <span className="font-mono">{device.location.lat.toFixed(5)}, {device.location.lng.toFixed(5)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
        </MapContainer>
      </div>
    </div>
  );
}
