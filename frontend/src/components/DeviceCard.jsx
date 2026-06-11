import React from 'react';

function riskColor(score) {
  if (score >= 75) return 'text-red-400';
  if (score >= 50) return 'text-orange-400';
  if (score >= 25) return 'text-yellow-400';
  return 'text-green-400';
}

function timeAgo(ts) {
  if (!ts) return 'hiç';
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'az önce';
  if (mins < 60) return `${mins} dk önce`;
  return `${Math.floor(mins / 60)} sa önce`;
}

export default function DeviceCard({ device, latestData, onClick }) {
  const isOnline = device.status === 'active';

  return (
    <div
      onClick={onClick}
      className={`card cursor-pointer hover:border-slate-500 transition-colors ${
        isOnline ? '' : 'opacity-60'
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0">
          <p className="font-medium text-slate-200 truncate">{device.name}</p>
          <p className="text-xs text-slate-500">{device.deviceId}</p>
        </div>
        <span className={`flex items-center gap-1 text-xs font-medium shrink-0 ml-2 ${
          isOnline ? 'text-green-400' : 'text-slate-500'
        }`}>
          <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-400 animate-pulse' : 'bg-slate-600'}`} />
          {isOnline ? 'Online' : 'Offline'}
        </span>
      </div>

      <div className="space-y-2 text-xs">
        {latestData && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Ses</span>
              <span className="text-slate-300">{latestData.sensors?.audioLevel?.toFixed(1)} dB</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Risk</span>
              <span className={`font-bold ${riskColor(latestData.riskScore)}`}>
                {latestData.riskScore}
              </span>
            </div>
          </>
        )}

        <div className="flex items-center justify-between pt-1 border-t border-slate-700">
          <span className="text-slate-400">Son görülme</span>
          <span className="text-slate-400">{timeAgo(device.lastSeen)}</span>
        </div>
      </div>
    </div>
  );
}
