import { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert, ScrollView, FlatList } from 'react-native';
import * as Location from 'expo-location';
import { Accelerometer } from 'expo-sensors';
import * as Battery from 'expo-battery';
import * as Network from 'expo-network';

// ── API ADRESİ ─────────────────────────────────────────
// Render (canlı demo) için: PROD_URL'i kullan
// Lokal test için: LOCAL_URL'i kendi bilgisayarının IP'siyle güncelle ve aşağıda onu seç
//   Bulmak için: Windows → "ipconfig" → Kablosuz Ağ Bağdaştırıcısı → IPv4 Adresi
//   Örnek: http://192.168.1.42:3001
const PROD_URL = 'https://kampus-guvenlik-backend.onrender.com';
const LOCAL_URL = 'http://172.20.10.4:3001';
const API_URL = PROD_URL;

const tokenRef = { current: null };
const deviceIdRef = { current: null };
const userRoleRef = { current: 'viewer' };

const ALARM_TYPE_TR = {
  NOISE_ANOMALY: 'Gürültü Anomalisi',
  UNUSUAL_MOVEMENT: 'Olağandışı Hareket',
  CROWD_DENSITY: 'Kalabalık Yoğunluğu',
  RESTRICTED_ZONE: 'Yasak Bölge',
  DEVICE_OFFLINE: 'Cihaz Çevrimdışı',
};

function SensorScreen({ isActive }) {
  const [sensorLog, setSensorLog] = useState([]);
  const [accel, setAccel] = useState({ x: 0, y: 0, z: 0 });
  const [coords, setCoords] = useState(null);
  const [batteryLevel, setBatteryLevel] = useState(null);
  const [noiseLevel, setNoiseLevel] = useState(45);
  const [noiseTestActive, setNoiseTestActive] = useState(false);
  const accelRef = useRef({ x: 0, y: 0, z: 0 });
  const noiseLevelRef = useRef(45);
  const intervalRef = useRef(null);
  const noiseIntervalRef = useRef(null);
  const startedRef = useRef(false);
  const noiseTestCountRef = useRef(0);

  const sendSensorData = async (location, battery, networkType) => {
    const jwt = tokenRef.current;
    const dId = deviceIdRef.current;
    if (!jwt || !dId) {
      setSensorLog(prev => [`⚠️ ${new Date().toLocaleTimeString()} - Token/Device yok`, ...prev.slice(0, 19)]);
      return;
    }
    try {
      const body = {
        deviceId: dId,
        timestamp: new Date().toISOString(),
        sensors: {
          gps: {
            lat: location?.coords?.latitude || 40.2167,
            lng: location?.coords?.longitude || 29.0833,
          },
          audioLevel: Math.min(130, Math.max(0, noiseLevelRef.current)),
          accelerometer: {
            x: parseFloat(accelRef.current.x.toFixed(3)),
            y: parseFloat(accelRef.current.y.toFixed(3)),
            z: parseFloat(accelRef.current.z.toFixed(3)),
          },
          networkStrength: networkType === 'wifi' ? 90 : 60,
        },
      };
      const response = await fetch(`${API_URL}/api/sensors/data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jwt}` },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (data.success) {
        const risk = data.data?.riskScore ?? '-';
        setSensorLog(prev => [
          `✅ ${new Date().toLocaleTimeString()} - Gönderildi | Risk: ${risk} | Ses: ${noiseLevelRef.current}dB`,
          ...prev.slice(0, 19)
        ]);
        if (data.data?.alarms?.length > 0) {
          const alarmNames = data.data.alarms.map(a => ALARM_TYPE_TR[a.type] || a.type).join(', ');
          Alert.alert('🚨 Alarm Tetiklendi!', alarmNames);
        }
      } else {
        setSensorLog(prev => [`❌ ${new Date().toLocaleTimeString()} - ${data.error || JSON.stringify(data)}`, ...prev.slice(0, 19)]);
      }
    } catch (e) {
      setSensorLog(prev => [`❌ ${new Date().toLocaleTimeString()} - ${e.message}`, ...prev.slice(0, 19)]);
    }
  };

  useEffect(() => {
    if (!isActive) {
      // Logout olunca her şeyi sıfırla
      startedRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (noiseIntervalRef.current) clearInterval(noiseIntervalRef.current);
      intervalRef.current = null;
      noiseIntervalRef.current = null;
      setSensorLog([]);
      setCoords(null);
      setBatteryLevel(null);
      noiseTestCountRef.current = 0;
      return;
    }
    if (startedRef.current) return;
    startedRef.current = true;

    Accelerometer.setUpdateInterval(500);
    Accelerometer.addListener(data => {
      setAccel(data);
      accelRef.current = data;
    });

    // Gürültü simülasyonu - test modunda 90dB, normal modda 40-65dB
    noiseIntervalRef.current = setInterval(() => {
      if (noiseTestCountRef.current > 0) {
        const db = Math.round(88 + Math.random() * 10);
        setNoiseLevel(db);
        noiseLevelRef.current = db;
        noiseTestCountRef.current--;
        if (noiseTestCountRef.current === 0) setNoiseTestActive(false);
      } else {
        const db = Math.round(40 + Math.random() * 25);
        setNoiseLevel(db);
        noiseLevelRef.current = db;
      }
    }, 1000);

    const startSending = async () => {
      const { granted } = await Location.requestForegroundPermissionsAsync();

      const doSend = async () => {
        const location = granted
          ? await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null)
          : null;
        const battery = await Battery.getBatteryLevelAsync().catch(() => 0.8);
        const network = await Network.getNetworkStateAsync().catch(() => null);
        if (location?.coords) setCoords(location.coords);
        if (battery != null) setBatteryLevel(Math.round(battery * 100));
        const networkType = network?.type === 'WIFI' ? 'wifi' : '4g';
        await sendSensorData(location, battery, networkType);
      };

      await doSend();
      intervalRef.current = setInterval(doSend, 5000);
    };

    startSending();
  }, [isActive]);

  const triggerNoiseTest = () => {
    noiseTestCountRef.current = 6;
    setNoiseTestActive(true);
    setSensorLog(prev => [`🔊 ${new Date().toLocaleTimeString()} - Gürültü testi başlatıldı (6 okuma × 90dB)`, ...prev.slice(0, 19)]);
  };

  const accelMag = Math.sqrt(accel.x ** 2 + accel.y ** 2 + accel.z ** 2).toFixed(2);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>📡 Sensör İzleme</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>📍 Konum</Text>
        <Text>Lat: {coords ? coords.latitude.toFixed(5) : 'Alınıyor...'}</Text>
        <Text>Lng: {coords ? coords.longitude.toFixed(5) : 'Alınıyor...'}</Text>
        <Text>Doğruluk: {coords ? `±${coords.accuracy?.toFixed(0)}m` : '-'}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>📱 Cihaz</Text>
        <Text>Batarya: {batteryLevel !== null ? `%${batteryLevel}` : 'Alınıyor...'}</Text>
        <Text style={noiseLevel > 85 ? styles.textDanger : null}>
          Gürültü: {noiseLevel} dB {noiseLevel > 85 ? '🔴 YÜKSEK' : '🟢'}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>🔄 İvmeölçer</Text>
        <Text>X: {accel.x.toFixed(3)} | Y: {accel.y.toFixed(3)} | Z: {accel.z.toFixed(3)}</Text>
        <Text>Büyüklük: {accelMag} m/s²</Text>
      </View>

      <TouchableOpacity
        style={[styles.testButton, noiseTestActive && styles.testButtonActive]}
        onPress={triggerNoiseTest}
        disabled={noiseTestActive}
      >
        <Text style={styles.testButtonText}>
          {noiseTestActive ? `🔊 Test devam ediyor... (${noiseTestCountRef.current} okuma kaldı)` : '🔊 Gürültü Alarm Testi'}
        </Text>
      </TouchableOpacity>

      <Text style={styles.cardTitle}>📋 Gönderim Logu (5s aralık)</Text>
      <View style={styles.log}>
        {sensorLog.map((log, i) => (
          <Text key={i} style={[styles.logText, log.startsWith('❌') && styles.logError]}>
            {log}
          </Text>
        ))}
        {sensorLog.length === 0 && <Text style={styles.logText}>Bağlanıyor...</Text>}
      </View>
    </ScrollView>
  );
}

function AlarmScreen({ canResolve = false }) {
  const [alarms, setAlarms] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchAlarms = async () => {
    const jwt = tokenRef.current;
    if (!jwt) return;
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/alarms?limit=30`, {
        headers: { 'Authorization': `Bearer ${jwt}` },
      });
      const data = await response.json();
      if (data.success) setAlarms(data.data);
    } catch (e) {}
    setLoading(false);
  };

  const acknowledgeAlarm = async (id) => {
    const jwt = tokenRef.current;
    try {
      await fetch(`${API_URL}/api/alarms/${id}/resolve`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${jwt}` },
      });
      fetchAlarms();
    } catch (e) {}
  };

  useEffect(() => { fetchAlarms(); }, []);

  const severityColor = (s) => ({ critical: '#e53935', high: '#fb8c00', medium: '#f59e0b', low: '#9ca3af' }[s] || '#9ca3af');
  const severityTR = (s) => ({ critical: 'KRİTİK', high: 'YÜKSEK', medium: 'ORTA', low: 'DÜŞÜK' }[s] || s);

  const renderAlarm = ({ item }) => (
    <View style={[styles.alarmCard, { borderLeftColor: severityColor(item.severity), borderLeftWidth: 4 }]}>
      <Text style={styles.alarmType}>{ALARM_TYPE_TR[item.type] || item.type}</Text>
      <Text style={[styles.alarmSeverity, { color: severityColor(item.severity) }]}>
        {severityTR(item.severity)} | {item.resolved ? '✅ Çözüldü' : '🔴 Aktif'}
      </Text>
      <Text style={styles.alarmDetail}>{new Date(item.timestamp).toLocaleString('tr-TR')}</Text>
      {item.message && <Text style={styles.alarmMessage}>{item.message}</Text>}
      {!item.resolved && canResolve && (
        <TouchableOpacity style={styles.ackButton} onPress={() => acknowledgeAlarm(item._id)}>
          <Text style={styles.ackButtonText}>✓ Onayla</Text>
        </TouchableOpacity>
      )}
      {!item.resolved && !canResolve && (
        <Text style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>
          Yalnızca operatör/admin onaylayabilir
        </Text>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#f8f9fa', padding: 16, paddingTop: 55 }}>
      <Text style={styles.title}>🔔 Alarmlar</Text>
      <TouchableOpacity style={[styles.button, { marginBottom: 12 }]} onPress={fetchAlarms}>
        <Text style={styles.buttonText}>{loading ? 'Yükleniyor...' : '🔄 Yenile'}</Text>
      </TouchableOpacity>
      {alarms.length === 0 ? (
        <Text style={{ color: '#aaa', textAlign: 'center', marginTop: 40 }}>Henüz alarm yok</Text>
      ) : (
        <FlatList
          data={alarms}
          keyExtractor={item => item._id}
          renderItem={renderAlarm}
        />
      )}
    </View>
  );
}

export default function App() {
  const [screen, setScreen] = useState('login');
  const [activeTab, setActiveTab] = useState('sensor');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'
  const [selectedRole, setSelectedRole] = useState('viewer');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [deviceName, setDeviceName] = useState('');

  const setupDevice = async (jwt, username) => {
    try {
      const listRes = await fetch(`${API_URL}/api/devices`, {
        headers: { 'Authorization': `Bearer ${jwt}` },
      });
      const listData = await listRes.json();
      // Yapay sensör kaynakları (BTU- ile başlayan "Yapay Kaynak" cihazları) hariç,
      // bu kullanıcının kendi mobil cihazını bul
      const ownDevice = listData.success
        ? listData.data?.find((d) => d.deviceId.startsWith('mobile-'))
        : null;
      if (ownDevice) {
        setDeviceName(ownDevice.name);
        return ownDevice.deviceId;
      }
      const response = await fetch(`${API_URL}/api/devices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jwt}` },
        body: JSON.stringify({ name: `Mobil Cihaz - ${username}`, deviceId: `mobile-${Date.now()}` }),
      });
      const data = await response.json();
      if (data.success) {
        setDeviceName(data.data.name);
        return data.data.deviceId;
      }
    } catch (e) {}
    return null;
  };

  const loginWithToken = async (jwt, user) => {
    const dId = await setupDevice(jwt, user?.username || 'Kullanıcı');
    if (!dId) {
      Alert.alert('Hata', 'Cihaz kaydedilemedi');
      return false;
    }
    tokenRef.current = jwt;
    deviceIdRef.current = dId;
    userRoleRef.current = user?.role || 'viewer';
    setScreen('main');
    return true;
  };

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Hata', 'Email ve şifre gerekli');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (data.success) {
        await loginWithToken(data.data.token, data.data.user);
      } else {
        Alert.alert('Giriş Hatası', data.error || 'Email veya şifre hatalı');
      }
    } catch (error) {
      Alert.alert('Bağlantı Hatası', 'Sunucuya ulaşılamıyor. IP adresi doğru mu?');
    }
    setLoading(false);
  };

  const handleRegister = async () => {
    if (!username || !email || !password || !confirmPassword) {
      Alert.alert('Hata', 'Tüm alanları doldurun');
      return;
    }
    if (username.length < 3) {
      Alert.alert('Hata', 'Kullanıcı adı en az 3 karakter olmalı');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Hata', 'Şifre en az 6 karakter olmalı');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Hata', 'Şifreler eşleşmiyor');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password, role: selectedRole, invite_code: inviteCode.trim().toUpperCase() || undefined }),
      });
      const data = await response.json();
      if (data.success) {
        Alert.alert('✅ Kayıt Başarılı', `Hoş geldin, ${username}!`, [{ text: 'Tamam' }]);
        await loginWithToken(data.data.token, data.data.user);
      } else {
        Alert.alert('Kayıt Hatası', data.error || 'Kayıt başarısız');
      }
    } catch (error) {
      Alert.alert('Bağlantı Hatası', 'Sunucuya ulaşılamıyor. IP adresi doğru mu?');
    }
    setLoading(false);
  };

  const handleLogout = async () => {
    const jwt = tokenRef.current;
    const dId = deviceIdRef.current;
    if (jwt && dId) {
      try {
        await fetch(`${API_URL}/api/devices/${dId}/deactivate`, {
          method: 'PATCH',
          headers: { 'Authorization': `Bearer ${jwt}` },
        });
      } catch (_) {}
    }
    tokenRef.current = null;
    deviceIdRef.current = null;
    userRoleRef.current = 'viewer';
    setDeviceName('');
    setScreen('login');
    setActiveTab('sensor');
    setAuthMode('login');
    setEmail('');
    setPassword('');
    setUsername('');
    setConfirmPassword('');
  };

  return (
    <View style={{ flex: 1 }}>
      {/* GİRİŞ / KAYIT EKRANI */}
      <View style={{ flex: 1, display: screen === 'login' ? 'flex' : 'none' }}>
        <ScrollView contentContainerStyle={styles.loginContainer}>
          <Text style={styles.appTitle}>🏛️ BTÜ Kampüs Güvenlik</Text>
          <Text style={styles.appSubtitle}>Güvenli Kampüs İzleme Platformu</Text>

          {/* Tab: Giriş / Kayıt Ol */}
          <View style={styles.authTabBar}>
            <TouchableOpacity
              style={[styles.authTab, authMode === 'login' && styles.authTabActive]}
              onPress={() => setAuthMode('login')}>
              <Text style={[styles.authTabText, authMode === 'login' && styles.authTabTextActive]}>Giriş Yap</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.authTab, authMode === 'register' && styles.authTabActive]}
              onPress={() => setAuthMode('register')}>
              <Text style={[styles.authTabText, authMode === 'register' && styles.authTabTextActive]}>Kayıt Ol</Text>
            </TouchableOpacity>
          </View>

          {/* KAYIT FORMU */}
          {authMode === 'register' && (
            <TextInput
              style={styles.input}
              placeholder="Kullanıcı Adı (min. 3 karakter)"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
            />
          )}

          <TextInput
            style={styles.input}
            placeholder="E-posta"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            style={styles.input}
            placeholder="Şifre (min. 6 karakter)"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          {authMode === 'register' && (
            <TextInput
              style={styles.input}
              placeholder="Şifre Tekrar"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
            />
          )}

          {authMode === 'register' && (
            <View style={styles.roleContainer}>
              <Text style={styles.roleLabel}>Hesap Türü</Text>
              <View style={styles.roleButtons}>
                <TouchableOpacity
                  style={[styles.roleBtn, selectedRole === 'viewer' && styles.roleBtnActive]}
                  onPress={() => { setSelectedRole('viewer'); setInviteCode(''); }}>
                  <Text style={[styles.roleBtnText, selectedRole === 'viewer' && styles.roleBtnTextActive]}>
                    👁️ İzleyici
                  </Text>
                  <Text style={styles.roleDesc}>Verileri görüntüler</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.roleBtn, selectedRole === 'operator' && styles.roleBtnActive]}
                  onPress={() => setSelectedRole('operator')}>
                  <Text style={[styles.roleBtnText, selectedRole === 'operator' && styles.roleBtnTextActive]}>
                    🔧 Operatör
                  </Text>
                  <Text style={styles.roleDesc}>Alarm çözebilir</Text>
                </TouchableOpacity>
              </View>
              {selectedRole === 'operator' && (
                <TextInput
                  style={[styles.input, { marginTop: 10, marginBottom: 0, borderColor: '#3949ab' }]}
                  placeholder="Davet Kodu (Admin'den alın — örn: A3F7B2C1)"
                  value={inviteCode}
                  onChangeText={setInviteCode}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
              )}
            </View>
          )}

          <TouchableOpacity
            style={styles.button}
            onPress={authMode === 'login' ? handleLogin : handleRegister}
            disabled={loading}>
            <Text style={styles.buttonText}>
              {loading
                ? '⏳ Lütfen bekleyin...'
                : authMode === 'login' ? 'Giriş Yap' : 'Kayıt Ol'}
            </Text>
          </TouchableOpacity>

        </ScrollView>
      </View>

      {/* ANA EKRAN */}
      <View style={{ flex: 1, display: screen === 'main' ? 'flex' : 'none' }}>
        {deviceName ? (
          <View style={styles.deviceBanner}>
            <Text style={styles.deviceBannerText}>📱 {deviceName} | {deviceIdRef.current}</Text>
          </View>
        ) : null}

        <View style={{ flex: 1, display: activeTab === 'sensor' ? 'flex' : 'none' }}>
          <SensorScreen isActive={screen === 'main' && activeTab === 'sensor'} />
        </View>
        <View style={{ flex: 1, display: activeTab === 'alarm' ? 'flex' : 'none' }}>
          <AlarmScreen canResolve={userRoleRef.current === 'admin' || userRoleRef.current === 'operator'} />
        </View>

        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'sensor' && styles.tabActive]}
            onPress={() => setActiveTab('sensor')}>
            <Text style={activeTab === 'sensor' ? styles.tabTextActive : styles.tabText}>📡 Sensörler</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'alarm' && styles.tabActive]}
            onPress={() => setActiveTab('alarm')}>
            <Text style={activeTab === 'alarm' ? styles.tabTextActive : styles.tabText}>🔔 Alarmlar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tabButton} onPress={handleLogout}>
            <Text style={styles.tabText}>🚪 Çıkış</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loginContainer: { flex: 1, backgroundColor: '#f0f4ff', alignItems: 'center', justifyContent: 'center', padding: 24 },
  appTitle: { fontSize: 26, fontWeight: 'bold', color: '#1a237e', marginBottom: 8, textAlign: 'center' },
  appSubtitle: { fontSize: 14, color: '#666', marginBottom: 32, textAlign: 'center' },
  container: { flexGrow: 1, backgroundColor: '#f8f9fa', padding: 16, paddingTop: 55 },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 16, color: '#1a237e' },
  input: { width: '100%', borderWidth: 1, borderColor: '#c5cae9', borderRadius: 10, padding: 14, marginBottom: 12, backgroundColor: '#fff', fontSize: 15 },
  button: { width: '100%', backgroundColor: '#3949ab', padding: 15, borderRadius: 10, alignItems: 'center', marginBottom: 8 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  hint: { color: '#9fa8da', fontSize: 12, marginTop: 12 },
  authTabBar: { flexDirection: 'row', backgroundColor: '#e8eaf6', borderRadius: 10, padding: 4, marginBottom: 20, width: '100%' },
  authTab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  authTabActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  authTabText: { color: '#9fa8da', fontWeight: '600', fontSize: 14 },
  authTabTextActive: { color: '#3949ab', fontWeight: 'bold' },
  roleContainer: { width: '100%', marginBottom: 16 },
  roleLabel: { fontSize: 13, color: '#666', marginBottom: 8, fontWeight: '600' },
  roleButtons: { flexDirection: 'row', gap: 10 },
  roleBtn: { flex: 1, borderWidth: 1.5, borderColor: '#c5cae9', borderRadius: 10, padding: 12, alignItems: 'center' },
  roleBtnActive: { borderColor: '#3949ab', backgroundColor: '#e8eaf6' },
  roleBtnText: { fontSize: 14, fontWeight: 'bold', color: '#9fa8da', marginBottom: 2 },
  roleBtnTextActive: { color: '#3949ab' },
  roleDesc: { fontSize: 10, color: '#aaa', textAlign: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  cardTitle: { fontSize: 15, fontWeight: 'bold', marginBottom: 8, color: '#333' },
  textDanger: { color: '#e53935', fontWeight: 'bold' },
  testButton: { backgroundColor: '#e53935', padding: 14, borderRadius: 10, alignItems: 'center', marginBottom: 12 },
  testButtonActive: { backgroundColor: '#ef9a9a' },
  testButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  log: { backgroundColor: '#fff', borderRadius: 10, padding: 10, marginBottom: 20, minHeight: 120, maxHeight: 200 },
  logText: { fontSize: 11, marginBottom: 3, color: '#444', fontFamily: 'monospace' },
  logError: { color: '#e53935' },
  alarmCard: { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 },
  alarmType: { fontSize: 15, fontWeight: 'bold', marginBottom: 4, color: '#1a1a1a' },
  alarmSeverity: { fontSize: 12, fontWeight: 'bold', marginBottom: 3 },
  alarmDetail: { fontSize: 11, color: '#888', marginBottom: 3 },
  alarmMessage: { fontSize: 11, color: '#555', fontStyle: 'italic', marginBottom: 4 },
  ackButton: { marginTop: 6, backgroundColor: '#43a047', padding: 8, borderRadius: 6, alignItems: 'center' },
  ackButtonText: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  deviceBanner: { backgroundColor: '#3949ab', paddingTop: 48, paddingBottom: 8, paddingHorizontal: 16 },
  deviceBannerText: { color: '#c5cae9', fontSize: 11, textAlign: 'center' },
  tabBar: { flexDirection: 'row', borderTopWidth: 1, borderColor: '#e8eaf6', backgroundColor: '#fff', paddingBottom: 4 },
  tabButton: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderTopWidth: 2, borderTopColor: '#3949ab' },
  tabText: { color: '#9fa8da', fontSize: 12 },
  tabTextActive: { color: '#3949ab', fontSize: 12, fontWeight: 'bold' },
});
