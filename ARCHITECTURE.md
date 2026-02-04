# EasyMCServer - Mimari ve Tasarım Dokümanı

## 1. Teknoloji Yığını (Tech Stack)

Uygulamanın "Teknik Bilgisi Olmayan Kullanıcı" hedefine ulaşması için modern, akıcı ve güvenilir bir arayüz şarttır.

*   **Platform**: Electron (Windows Masaüstü Uygulaması)
    *   *Neden?* Web teknolojileri (HTML/CSS) ile modern arayüzler tasarlamak çok daha kolaydır. Ayrıca Node.js arka planı, dosya sistemi ve işlem yönetimi (Java çalıştırma) için mükemmeldir.
*   **Dil**: TypeScript
    *   *Neden?* Tip güvenliği, modüler yapı ve hatasız kodlama için.
*   **UI Framework**: React
    *   *Neden?* Bileşen bazlı (Component-based) yapı, durum yönetimi (State Management) için ideal.
*   **Styling**: Vanilla CSS (CSS Modules)
    *   *Neden?* Tam kontrol, hafif yapı ve modern CSS özellikleri.

---

## 2. Uygulama Mimarisi (Modular Architecture)

Uygulama, **Frontend (Renderer)** ve **Backend (Main Process)** olarak iki ana katmana ayrılacaktır. İletişim `IPC (Inter-Process Communication)` üzerinden sağlanacaktır.

### A. UI Katmanı (Renderer Process)
Kullanıcının gördüğü ve etkileşime girdiği katman.
*   **Components**:
    *   `ServerTypeSelector`: Vanilla / Forge seçimi.
    *   `VersionSelector`: Sürüm dropdown listesi.
    *   `StatusDashboard`: İlerleme çubuğu ve durum mesajları ("İndiriliyor", "Kuruluyor").
    *   `IpConfigurator`: Hamachi IP giriş alanı.

### B. Core Katmanı (Main Process)
Tüm mantıksal işlemlerin yürütüldüğü katman. 4 Ana Servis Modülü'nden oluşur:

#### 1. `DownloadService` (İndirme Yöneticisi)
*   Seçilen sunucu tipine göre doğru URL'yi bulur.
*   Dosyayı indirir ve ilerleme bilgisini (progress) UI'a gönderir.
*   **Alt Modüller**:
    *   `VanillaSource`: Mojang API veya mcversions net scraping.
    *   `ForgeSource`: Forge dosya sunucusu ayrıştırma.

#### 2. `FileSystemService` (Dosya Yöneticisi)
*   Sunucu için belirli bir klasör oluşturur (`/servers/vanilla-1.20.1` vb.).
*   İndirilen dosyaları buraya taşır.
*   `eula.txt` ve `server.properties` dosyalarını okur/yazar.

#### 3. `ProcessService` (Çalıştırma Yöneticisi)
*   Java işlemini (`java -jar ...`) başlatır.
*   Sunucu konsol çıktısını (stdout) dinler.
*   "Done" mesajını veya EULA uyarısını yakalar ve süreci yönetir.

#### 4. `Orchestrator` (Ana Kontrolcü)
*   Tüm servisleri yöneten beyin. UI'dan gelen "Kur" emrini alır, sırasıyla servisleri tetikler.

---

## 3. Çalışma Akışı (Workflow)

### Adım 1: Kullanıcı Seçimi
1.  Kullanıcı **Vanilla** veya **Forge** seçer.
2.  Kullanıcı Sürüm (örn: **1.20.1**) seçer.
3.  "Kurulumu Başlat" butonuna basar.

### Adım 2: Hazırlık ve İndirme
1.  `Orchestrator`, `FileSystemService`'e temiz bir klasör açtırır.
2.  `Orchestrator`, `DownloadService`'i tetikler.
3.  Dosya indirilir (örn: `server.jar` veya `forge-installer.jar`).

### Adım 3: İlk Çalıştırma (Bootstrapping)
1.  `ProcessService`, indirilen dosyayı çalıştırır.
2.  Sunucu dosyaları oluşturur ve kapanır (veya EULA hatası verip durur).
3.  `FileSystemService`, `eula.txt` dosyasının oluşup oluşmadığını kontrol eder.

### Adım 4: EULA ve Konfigürasyon
1.  `FileSystemService`, `eula.txt` dosyasını bulur, içeriğini `eula=true` yapar.
2.  Kullanıcıdan alınan **Hamachi IP** adresi, `server.properties` dosyasına `server-ip=25.x.x.x` olarak yazılır.

### Adım 5: Sonuç
1.  Tüm ayarlar tamamlanınca `Orchestrator` UI'a "HAZIR" sinyali gönderir.
2.  Kullanıcı "Sunucuyu Başlat" butonunu görür.

---

## 4. Dosya ve Klasör Yapısı (Önerilen)

```text
/src
  /main (Backend Logic)
    /services
      download.service.ts
      file.service.ts
      process.service.ts
    /utils
      eula-handler.ts
      properties-parser.ts
    main.ts (Entry Point)
    
  /renderer (Frontend UI)
    /components
      Wizard.tsx
      ProgressBar.tsx
    /styles
      global.css
      theme.css
    App.tsx
```
