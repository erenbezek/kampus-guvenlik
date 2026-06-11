import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: '📊' },
  { to: '/map', label: 'Map View', icon: '🗺️' },
  { to: '/devices', label: 'Devices', icon: '📱' },
  { to: '/alarms', label: 'Alarms', icon: '🔔' },
  { to: '/analytics', label: 'Analytics', icon: '📈' }
];

const ADMIN_NAV = { to: '/admin', label: 'Admin', icon: '⚙️' };

export default function Navbar() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const user = (() => {
    try { return JSON.parse(localStorage.getItem('user') || '{}'); }
    catch { return {}; }
  })();

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  }

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-slate-800 border-b border-slate-700 h-16">
      <div className="max-w-screen-2xl mx-auto px-4 h-full flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <span className="text-2xl">🛡️</span>
          <div>
            <p className="text-sm font-bold text-white leading-tight">Campus Safety</p>
            <p className="text-xs text-slate-400 leading-tight">BTU Platform</p>
          </div>
        </div>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-1">
          {NAV_ITEMS.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                }`
              }
            >
              <span className="mr-1">{icon}</span>{label}
            </NavLink>
          ))}
          {user.role === 'admin' && (
            <NavLink
              to={ADMIN_NAV.to}
              className={({ isActive }) =>
                `px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-purple-600 text-white'
                    : 'text-purple-300 hover:bg-purple-900 hover:text-white'
                }`
              }
            >
              <span className="mr-1">{ADMIN_NAV.icon}</span>{ADMIN_NAV.label}
            </NavLink>
          )}
        </div>

        {/* User + logout */}
        <div className="flex items-center gap-3">
          <span className="hidden sm:block text-xs text-slate-400">
            {user.username || user.email}
            {user.role && (
              <span className={`ml-2 px-1.5 py-0.5 rounded text-xs ${
                user.role === 'admin' ? 'bg-purple-900 text-purple-300'
                : user.role === 'operator' ? 'bg-blue-900 text-blue-300'
                : 'bg-slate-700 text-slate-300'
              }`}>{user.role}</span>
            )}
          </span>
          <button onClick={logout} className="btn-ghost text-sm px-3 py-1.5">
            Logout
          </button>
          {/* Mobile menu toggle */}
          <button
            className="md:hidden text-slate-300 hover:text-white"
            onClick={() => setOpen(!open)}
          >
            ☰
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden absolute top-16 left-0 right-0 bg-slate-800 border-b border-slate-700 px-4 py-2 flex flex-col gap-1">
          {NAV_ITEMS.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-700'
                }`
              }
            >
              <span className="mr-2">{icon}</span>{label}
            </NavLink>
          ))}
          {user.role === 'admin' && (
            <NavLink
              to={ADMIN_NAV.to}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-purple-600 text-white' : 'text-purple-300 hover:bg-purple-900'
                }`
              }
            >
              <span className="mr-2">{ADMIN_NAV.icon}</span>{ADMIN_NAV.label}
            </NavLink>
          )}
        </div>
      )}
    </nav>
  );
}
