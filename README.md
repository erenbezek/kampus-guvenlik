# Kampüs Güvenlik ve Çevresel İzleme Platformu

**Bursa Teknik Üniversitesi — Bilgisayar Mühendisliği**
**Node.js ile Web Programlama — Dönem Projesi**
**Senaryo 3: Kampüs Güvenliği ve Çevresel Gözlem**

---

## Canlı Demo

| Servis | Adres |
|--------|-------|
| Web Arayüzü | https://kampus-guvenlik-frontend.onrender.com |
| Backend API | https://kampus-guvenlik-backend.onrender.com |
| API Dokümantasyonu (Swagger) | https://kampus-guvenlik-backend.onrender.com/api/docs |
| Sağlık kontrolü | https://kampus-guvenlik-backend.onrender.com/api/health |

> Backend Render'ın ücretsiz planında çalıştığı için 15 dakika istek gelmezse uykuya geçer; ilk istek 50 saniyeye kadar gecikebilir.

### Demo Hesapları

| Rol | Email | Şifre |
|-----|-------|-------|
| Admin | admin@btu.edu.tr | admin123 |
| Operatör | operator1@btu.edu.tr | operator123 |
| İzleyici | viewer@btu.edu.tr | viewer123 |

Web arayüzünden "Kayıt Ol" ile yeni hesap da oluşturulabilir.

---

## Proje Açıklaması

Akıllı telefonlar, kampüs genelinde konum, hareket, ses seviyesi ve çevresel verileri toplayan IoT uç noktaları gibi davranır. Sistem; kalabalık yoğunluğu, gürültü anomalileri, yasaklı bölgelere yaklaşma ve şüpheli hareketleri gerçek zamanlı olarak tespit eder.

### Temel Özellikler
- **Gerçek zamanlı izleme** — Socket.io ile sayfa yenilemeden canlı dashboard güncellemesi
- **7 anomali tespit algoritması** (gürültü, hareket, kalabalık, yasaklı bölge, z-skoru, çevrimdışı tespiti, risk skoru)
- **Etkileşimli kampüs haritası** — renk kodlu cihaz işaretçileri ve yasaklı bölge katmanları
- **Rol bazlı yetkilendirme** (admin / operatör / izleyici)
- **Mobil simülatör** — demo amaçlı gerçekçi sensör verisi üretir
- **Analitik panel** — zaman serisi grafikleri ve alarm yoğunluk haritaları
- **Mobil uygulama** (Expo / React Native) — gerçek cihaz sensörlerinden veri toplar

---

## Mimari

```
┌─────────────────────────────────────────────────────────────────┐
│                          TARAYICI                                │
│  React 18 + Vite + Tailwind CSS + Recharts + Leaflet.js          │
│  Sayfalar: Dashboard | Harita | Cihazlar | Alarmlar | Analitik    │
└──────────────────────────┬──────────────────────────────────────┘
                            │ HTTP REST + Socket.io (ws)
┌──────────────────────────▼──────────────────────────────────────┐
│                     BACKEND (Node.js)                            │
│  Express.js REST API           Socket.io Sunucu                  │
│  ├─ /api/auth                  ├─ join:dashboard                 │
│  ├─ /api/devices                ├─ sensor:update                 │
│  ├─ /api/sensors                ├─ alarm:new                      │
│  └─ /api/alarms                 └─ device:status                 │
│                                                                    │
│  Anomali Tespit Servisi                                           │
│  ├─ Gürültü Analizi (>85dB × 10 ardışık)                          │
│  ├─ Hareket Analizi (ivme >20 × 3 ardışık)                        │
│  ├─ Kalabalık Yoğunluğu (50m içinde >15 cihaz)                    │
│  ├─ Yasaklı Bölge (GPS poligon kontrolü)                          │
│  ├─ Cihaz Çevrimdışı (son görülme >10 dk)                         │
│  ├─ Risk Skoru (0-100 bileşik)                                    │
│  └─ Z-Skoru Ses Anomalisi (kayan pencere, |z|>2.5)                │
└──────────────────────────┬──────────────────────────────────────┘
                            │ Mongoose ODM
┌──────────────────────────▼──────────────────────────────────────┐
│                      MongoDB (Atlas)                              │
│  Koleksiyonlar: users | devices | sensordatas | alarms            │
└─────────────────────────────────────────────────────────────────┘
         ▲
         │ POST /api/sensors/data
┌────────┴───────────────────┬──────────────────────────────────────┐
│  Mobil Simülatör (Node.js)  │  Mobil Uygulama (Expo / React Native) │
│  Senaryolar: normal |       │  Gerçek cihaz sensörleri: konum,      │
│  noise_event | movement |   │  ivmeölçer, mikrofon, pil vb.          │
│  crowd | restricted         │                                        │
└──────────────────────────────┴──────────────────────────────────────┘
```

---

## Kurulum ve Çalıştırma (Lokal Geliştirme)

### Gereksinimler
- Node.js 18+
- MongoDB (lokal veya Docker)
- npm

### Backend
```bash
cd backend
cp .env.example .env
# .env içinde MONGODB_URI ve JWT_SECRET'i ayarla
npm install
npm run seed          # demo verisini oluşturur
npm run dev           # http://localhost:3001
```

### Frontend
```bash
cd frontend
npm install
npm run dev           # http://localhost:5173
```

### Mobil Uygulama (Expo)
```bash
cd mobil
npm install
npm start
```
`App.js` içindeki `API_URL`, canlı backend'i (`PROD_URL`) kullanacak şekilde ayarlanmıştır. Lokal backend ile test için `LOCAL_URL`'i kendi bilgisayarının IP'siyle güncelleyip `API_URL = LOCAL_URL` yapabilirsin.

### Mobil Simülatör
```bash
cd mobile-simulator
npm install
node simulator.js --scenario noise_event
```

### Docker ile Çalıştırma
```bash
docker-compose up --build
docker exec campus_backend node src/scripts/seed.js
```

---

## Bulut Dağıtımı (Render)

Proje, [render.yaml](render.yaml) üzerinden Render Blueprint ile iki servis olarak dağıtılmıştır:

| Servis | Tür | Açıklama |
|--------|-----|----------|
| `kampus-guvenlik-backend` | Web Service (Node) | Express API + Socket.io, MongoDB Atlas'a bağlı |
| `kampus-guvenlik-frontend` | Static Site | React/Vite build çıktısı, SPA yönlendirmesi yapılandırılmış |

Backend ortam değişkenleri: `MONGODB_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `CLIENT_URL`, `NODE_ENV`, `ENABLE_FAKE_SENSORS`.

---

## Test

```bash
cd backend
npm test
```

77 test, 5 test paketinde (`auth`, `devices`, `sensors`, `alarms`, ve diğerleri) çalışır ve tamamı geçer.

---

## API Dokümantasyonu

Tüm endpoint'ler, parametreler ve örnek yanıtlar için canlı Swagger arayüzü:
**https://kampus-guvenlik-backend.onrender.com/api/docs**

### Kimlik Doğrulama
| Metod | Endpoint | Açıklama |
|-------|----------|----------|
| POST | `/api/auth/register` | Yeni kullanıcı kaydı |
| POST | `/api/auth/login` | Giriş, JWT döner |
| GET | `/api/auth/me` | Mevcut kullanıcı bilgisi (korumalı) |

### Cihazlar
| Metod | Endpoint | Açıklama |
|-------|----------|----------|
| GET | `/api/devices` | Cihazları listele (admin: tümü, kullanıcı: kendi cihazları) |
| POST | `/api/devices` | Yeni cihaz kaydet |
| GET | `/api/devices/:id` | Cihaz detayı |
| PUT | `/api/devices/:id` | Cihaz güncelle |
| DELETE | `/api/devices/:id` | Cihaz sil (sadece admin) |
| GET | `/api/devices/:id/status` | Cihaz durumu |

### Sensörler
| Metod | Endpoint | Açıklama |
|-------|----------|----------|
| POST | `/api/sensors/data` | Sensör verisi gönder (anomali tespitini tetikler) |
| GET | `/api/sensors/data` | Geçmiş veriyi sorgula (deviceId, from, to, limit) |
| GET | `/api/sensors/latest/:deviceId` | Cihazın son okuması |
| GET | `/api/sensors/stats/:deviceId` | 24 saatlik istatistik |

### Alarmlar
| Metod | Endpoint | Açıklama |
|-------|----------|----------|
| GET | `/api/alarms` | Alarmları listele (severity, type, resolved, from, to) |
| POST | `/api/alarms/:id/resolve` | Alarmı çözüldü olarak işaretle (admin/operatör) |
| GET | `/api/alarms/stats` | Alarm istatistikleri |

### Socket.io Olayları
| Olay | Yön | Açıklama |
|------|-----|----------|
| `join:dashboard` | Client → Server | Dashboard odasına katıl |
| `join:device` | Client → Server | Belirli bir cihaz odasına katıl |
| `sensor:update` | Server → Client | Yeni sensör okuması |
| `alarm:new` | Server → Client | Yeni alarm tetiklendi |
| `device:status` | Server → Client | Cihaz durumu değişti |

### Yanıt Formatı
```json
// Başarılı
{ "success": true, "data": { ... } }

// Hatalı
{ "success": false, "error": "Hata mesajı" }
```

---

## Mobil Uygulama ve Expo Go Kısıtlaması

Mobil uygulama EAS Update ile yayınlanmıştır, ancak Expo'nun **Mayıs 2026** güncellemesiyle Expo Go artık yalnızca **proje sahibinin kendi hesabıyla** yayınlanan projeleri açabilmektedir. Bu nedenle:

- Mobil uygulama canlıya alınmış olsa da, bu sürüme yalnızca geliştirici hesabı üzerinden erişilebilmektedir.
- Bu kısıtlama proje ayarlarıyla giderilemez; Expo Go istemcisinin genel davranışıdır.
- Bu yüzden kullanıcı erişimi için **web arayüzü** birincil dağıtım kanalı olarak kullanılmıştır.
- Mobil uygulama, geliştirici tarafından lokal Expo Go oturumu (`npx expo start`, aynı ağ üzerinden) ile test edilmiştir.

---

## Bilinen Sınırlamalar

1. **Kalabalık yoğunluğu analizi**, çok sayıda cihaz için CPU yoğun çalışır (birden fazla DB sorgusu). Üretimde MongoDB'nin `2dsphere` indeksi önerilir.
2. **Simülatör**, her process başına tek cihazdan veri gönderir. Kalabalık simülasyonu için birden fazla terminal gerekir.
3. **Harita katmanları** internet bağlantısı gerektirir (OpenStreetMap), çevrimdışı desteği yoktur.
4. **Z-skoru anomalisi**, aktif olması için cihaz başına en az 10 okuma gerektirir (soğuk başlangıç).
5. **Yasaklı bölgeler** sabit kod (constant) olarak tanımlıdır; üretimde DB'de saklanıp arayüzden yönetilebilmesi gerekir.
6. **Kalıcı socket odaları yoktur** — sunucu yeniden başladığında istemcilerin yeniden bağlanması gerekir.
7. Render ücretsiz planı nedeniyle backend inaktiflik sonrası uykuya geçer, ilk istek gecikebilir.

##  Katkıda Bulunanlar

Bu proje, Bursa Teknik Üniversitesi Bilgisayar Mühendisliği Bölümü "Node.js ile Web Programlama" dersi dönem projesi kapsamında aşağıdaki ekip tarafından geliştirilmiştir:

- **Furkan BULDUKLU**
- **Fuat ÜZÜLMEZ**
- **Eren BEZEK**
