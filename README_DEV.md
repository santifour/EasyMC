# EasyMCServer - Geliştirme Rehberi

Bu proje, teknik bilgisi olmayan kullanıcılar için Minecraft sunucu kurulumunu otomatize eden bir Electron uygulamasıdır.

## Mimari Genel Bakış

Uygulama **Modüler Servis Mimarisi** kullanır. Ana mantık `src/main/services` altındaki 4 temel servis üzerine kuruludur.

### 1. Servisler (`src/main/services/`)

*   **`Orchestrator.ts`**: (Beyin)
    *   Tüm süreci yönetir.
    *   UI'dan gelen "Kur" isteğini alır.
    *   Bütün alt servisleri sırasıyla çağırır.
    *   **Giriş Noktası**: `startInstallation(config, callback)`

*   **`DownloadService.ts`**: (İndirme)
    *   Vanilla veya Forge için indirme linklerini bulur.
    *   Dosyaları indirir.
    *   **Kritik Metod**: `downloadServerArtifact()`

*   **`FileSystemService.ts`**: (Dosya)
    *   Klasörleri oluşturur.
    *   `eula.txt` dosyasını `true` yapar.
    *   `server.properties` dosyasına Hamachi IP'sini yazar.
    *   **Kritik Metodlar**: `agreeToEula()`, `configureServerProperties()`

*   **`ProcessService.ts`**: (İşlem)
    *   Java süreçlerini başlatır (`spawn`).
    *   Forge Installer'ı çalıştırır.
    *   Sunucuyu başlatır ve çıktıları dinler.
    *   **Kritik Metod**: `spawnJavaProcess()`

### 2. Veri Tipleri (`src/common/types.ts`)

Uygulama genelinde kullanılan veri modelleri burada tanımlıdır.
*   `InstallConfig`: Kurulum için gerekli kullanıcı girdileri (Version, Type, IP).
*   `ServerType`: `VANILLA` | `FORGE`.

## Nasıl Yeni Bir Özellik Eklenir?

1.  **Yeni bir indirme kaynağı mı?** -> `DownloadService` içine yeni bir private metod ekleyin.
2.  **Yeni bir konfigürasyon ayarı mı?** -> `FileSystemService` içindeki `configureServerProperties` metodunu güncelleyin.
3.  **Akış değişikliği mi?** -> `Orchestrator` içindeki adım sırasını değiştirin.

## Başlangıç

Bu aşamada kodlar sadece **iskelet (skeleton)** halindedir. Fonksiyonların içi boştur (`TODO`). Implementasyon yapılırken Node.js `fs`, `https` ve `child_process` modülleri kullanılacaktır.
