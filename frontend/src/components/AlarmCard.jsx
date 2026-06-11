import React from 'react';

const SEVERITY_CONFIG = {
  low:      { badge: 'badge-low',      icon: 'ℹ️',  border: 'border-blue-800' },
  medium:   { badge: 'badge-medium',   icon: '⚠️',  border: 'border-yellow-800' },
  high:     { badge: 'badge-high',     icon: '🔥',  border: 'border-orange-800' },
  critical: { badge: 'badge-critical', icon: '🚨',  border: 'border-red-700' }
};

const SEVERITY_TR = {
  low: 'düşük', medium: 'orta', high: 'yüksek', critical: 'kritik'
};

const TYPE_LABELS = {
  NOISE_ANOMALY:    'Gürültü',
  UNUSUAL_MOVEMENT: 'Hareket',
  CROWD_DENSITY:    'Kalabalık',
  RESTRICTED_ZONE:  'Yasak Bölge',
  DEVICE_OFFLINE:   'Çevrimdışı'
};

function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'az önce';
  if (mins < 60) return `${mins} dk önce`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} sa önce`;
  return `${Math.floor(hrs / 24)} gün önce`;
}

export default function AlarmCard({ alarm, onResolve }) {
  const cfg = SEVERITY_CONFIG[alarm.severity] || SEVERITY_CONFIG.low;

  return (
    <div className={`bg-slate-800 rounded-lg border ${cfg.border} p-3 hover:bg-slate-750 transition-colors`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <span className="text-base mt-0.5 shrink-0">{cfg.icon}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cfg.badge}>{SEVERITY_TR[alarm.severity] || alarm.severity}</span>
              <span className="text-xs text-slate-400">{TYPE_LABELS[alarm.type] || alarm.type}</span>
            </div>
            <p className="text-sm text-slate-200 mt-1 leading-snug line-clamp-2">{alarm.message}</p>
            <p className="text-xs text-slate-500 mt-1">
              {alarm.deviceId?.name || 'Bilinmeyen cihaz'} · {timeAgo(alarm.timestamp)}
            </p>
          </div>
        </div>

        {!alarm.resolved && onResolve && (
          <button
            onClick={() => onResolve(alarm._id)}
            className="shrink-0 text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
          >
            Onayla
          </button>
        )}

        {alarm.resolved && (
          <span className="shrink-0 text-xs text-green-500 flex items-center gap-1">
            ✓ Çözüldü
          </span>
        )}
      </div>
    </div>
  );
}
