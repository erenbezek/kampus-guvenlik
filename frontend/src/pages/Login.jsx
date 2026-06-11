import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authAPI } from '../services/api';
import { connectSocket } from '../services/socket';

export default function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [regForm, setRegForm] = useState({
    username: '', email: '', password: '', confirmPassword: '', role: 'viewer', inviteCode: ''
  });

  function switchMode(m) {
    setMode(m);
    setError('');
    setSuccess('');
  }

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await authAPI.login(loginForm.email, loginForm.password);
      const { token, user } = res.data.data;
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      connectSocket();
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Giriş başarısız. Email veya şifre yanlış.');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (regForm.password !== regForm.confirmPassword) {
      setError('Şifreler eşleşmiyor.');
      return;
    }
    if (regForm.password.length < 6) {
      setError('Şifre en az 6 karakter olmalı.');
      return;
    }
    if (regForm.username.length < 3) {
      setError('Kullanıcı adı en az 3 karakter olmalı.');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        username: regForm.username,
        email: regForm.email,
        password: regForm.password,
        role: regForm.role
      };
      if (regForm.role === 'operator' && regForm.inviteCode.trim()) {
        payload.invite_code = regForm.inviteCode.trim().toUpperCase();
      }
      const res = await authAPI.register(payload);
      const { token, user } = res.data.data;
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      connectSocket();
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Kayıt başarısız. Bu email veya kullanıcı adı zaten kullanılıyor.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🛡️</div>
          <h1 className="text-2xl font-bold text-white">Campus Safety Platform</h1>
          <p className="text-slate-400 mt-1 text-sm">
            Bursa Technical University — Computer Engineering
          </p>
        </div>

        {/* Card */}
        <div className="card">
          {/* Tab switcher */}
          <div className="flex rounded-lg bg-slate-700 p-1 mb-6">
            <button
              onClick={() => switchMode('login')}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
                mode === 'login'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Giriş Yap
            </button>
            <button
              onClick={() => switchMode('register')}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
                mode === 'register'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Kayıt Ol
            </button>
          </div>

          {/* Alerts */}
          {error && (
            <div className="mb-4 px-3 py-2 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-4 px-3 py-2 bg-green-900/50 border border-green-700 rounded-lg text-green-300 text-sm">
              {success}
            </div>
          )}

          {/* ── LOGIN FORM ────────────────────────────────── */}
          {mode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1.5">Email</label>
                <input
                  type="email"
                  className="input"
                  placeholder="admin@btu.edu.tr"
                  value={loginForm.email}
                  onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1.5">Şifre</label>
                <input
                  type="password"
                  className="input"
                  placeholder="••••••••"
                  value={loginForm.password}
                  onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                  required
                />
              </div>
              <button type="submit" className="btn-primary w-full mt-2" disabled={loading}>
                {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
              </button>

              {/* Demo credentials */}
              <div className="mt-4 pt-4 border-t border-slate-700">
                <p className="text-xs text-slate-500 mb-2">Demo hesapları:</p>
                <div className="space-y-1.5">
                  {[
                    { role: 'Admin', email: 'admin@btu.edu.tr', pass: 'admin123', color: 'text-purple-400' },
                    { role: 'Operator', email: 'operator1@btu.edu.tr', pass: 'operator123', color: 'text-blue-400' },
                    { role: 'Viewer', email: 'viewer@btu.edu.tr', pass: 'viewer123', color: 'text-slate-400' }
                  ].map(({ role, email, pass, color }) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setLoginForm({ email, password: pass })}
                      className="w-full text-left px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors"
                    >
                      <span className={`text-xs font-semibold ${color}`}>{role}</span>
                      <span className="text-xs text-slate-400 ml-2 font-mono">{email}</span>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-600 mt-2 text-center">
                  Butona tıkla → otomatik doldurur
                </p>
              </div>
            </form>
          )}

          {/* ── REGISTER FORM ─────────────────────────────── */}
          {mode === 'register' && (
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1.5">Kullanıcı Adı</label>
                <input
                  type="text"
                  className="input"
                  placeholder="ahmetyilmaz"
                  value={regForm.username}
                  onChange={(e) => setRegForm({ ...regForm, username: e.target.value })}
                  required
                  autoFocus
                  minLength={3}
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1.5">Email</label>
                <input
                  type="email"
                  className="input"
                  placeholder="ahmet@btu.edu.tr"
                  value={regForm.email}
                  onChange={(e) => setRegForm({ ...regForm, email: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1.5">Rol</label>
                <select
                  className="input"
                  value={regForm.role}
                  onChange={(e) => setRegForm({ ...regForm, role: e.target.value, inviteCode: '' })}
                >
                  <option value="viewer">👁️ İzleyici — Sadece görüntüleme (ücretsiz)</option>
                  <option value="operator">🔧 Operatör — Alarm çözme (davet kodu gerekli)</option>
                </select>
              </div>
              {regForm.role === 'operator' && (
                <div>
                  <label className="block text-sm text-slate-400 mb-1.5">
                    Davet Kodu <span className="text-blue-400">(Admin'den alın)</span>
                  </label>
                  <input
                    type="text"
                    className="input font-mono tracking-widest uppercase"
                    placeholder="Örn: A3F7B2C1"
                    value={regForm.inviteCode}
                    onChange={(e) => setRegForm({ ...regForm, inviteCode: e.target.value.toUpperCase() })}
                    maxLength={8}
                    required
                  />
                </div>
              )}
              <div>
                <label className="block text-sm text-slate-400 mb-1.5">Şifre</label>
                <input
                  type="password"
                  className="input"
                  placeholder="En az 6 karakter"
                  value={regForm.password}
                  onChange={(e) => setRegForm({ ...regForm, password: e.target.value })}
                  required
                  minLength={6}
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1.5">Şifre Tekrar</label>
                <input
                  type="password"
                  className={`input ${
                    regForm.confirmPassword && regForm.password !== regForm.confirmPassword
                      ? 'border-red-500'
                      : ''
                  }`}
                  placeholder="Şifreyi tekrar girin"
                  value={regForm.confirmPassword}
                  onChange={(e) => setRegForm({ ...regForm, confirmPassword: e.target.value })}
                  required
                />
                {regForm.confirmPassword && regForm.password !== regForm.confirmPassword && (
                  <p className="text-xs text-red-400 mt-1">Şifreler eşleşmiyor</p>
                )}
              </div>
              <button
                type="submit"
                className="btn-primary w-full mt-2"
                disabled={loading || (regForm.confirmPassword && regForm.password !== regForm.confirmPassword)}
              >
                {loading ? 'Kayıt oluşturuluyor...' : 'Kayıt Ol'}
              </button>
              <p className="text-xs text-slate-500 text-center">
                Kayıt olunca otomatik giriş yapılır.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
