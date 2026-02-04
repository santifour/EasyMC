/*
 * Copyright (c) 2026 Santi
 * Licensed under AGPL-3.0
 */

/**
 * EasyMC Control Panel - Renderer Logic
 */

// --- STATE MANAGEMENT ---
let activeServer = null;
let isServerRunning = false;
let uptimeTimer = null;
let uptimeSeconds = 0;
let serverVersions = { VANILLA: [], FORGE: [] };
let currentProperties = {};
let currentLang = localStorage.getItem('appLang') || 'tr';

// --- DOM ELEMENTS ---
const views = {
    create: document.getElementById('create-view'),
    control: document.getElementById('control-view')
};

const btnStart = document.getElementById('btn-start');
const btnStop = document.getElementById('btn-stop');
const btnRestart = document.getElementById('btn-restart');
const btnOpenFolder = document.getElementById('btn-open-folder');

const statPlayers = document.getElementById('stat-players');
const statUptime = document.getElementById('stat-uptime');
const statIp = document.getElementById('stat-ip');
const activeServerTitle = document.getElementById('active-server-display-name');
const statusBadge = document.getElementById('status-badge');
const statusText = document.getElementById('status-text');

const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

const mainConsole = document.getElementById('main-console');
const consoleInput = document.getElementById('console-input');

const propsContainer = document.getElementById('properties-form');
const btnSaveProps = document.getElementById('btn-save-props');

const modsList = document.getElementById('mods-list');
const modsNotice = document.getElementById('mods-notice');
const btnAddMod = document.getElementById('btn-add-mod');

const serverListNav = document.getElementById('server-list');
const btnNavCreate = document.getElementById('nav-create-btn');

const setupName = document.getElementById('setup-name');
const setupType = document.getElementById('setup-type');
const setupVersion = document.getElementById('setup-version');
const setupForgeGroup = document.getElementById('setup-forge-group');
const setupForgeBuild = document.getElementById('setup-forge-build');
const setupIp = document.getElementById('setup-ip');
const btnDoInstall = document.getElementById('do-install-btn');
const installProgressCard = document.getElementById('install-progress-card');

// --- 1. INITIALIZATION ---

async function init() {
    // Window Controls
    document.getElementById('win-min').onclick = () => window.electron.minWindow();
    document.getElementById('win-max').onclick = () => window.electron.maxWindow();
    document.getElementById('win-close').onclick = () => window.electron.closeWindow();

    // Settings Sidebar Controls
    document.querySelectorAll('.set-nav-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.set-nav-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderProperties(btn.getAttribute('data-set'));
        };
    });

    // IP Copy Logic
    document.getElementById('btn-copy-ip').onclick = () => {
        const ip = document.getElementById('stat-ip').innerText;
        if (ip && ip !== '--.--.--.--') {
            navigator.clipboard.writeText(ip);
            showToast('IP Adresi kopyalandı!', 'success');
        }
    };

    // Server Icon Logic
    const btnSelectLogo = document.getElementById('btn-select-logo');
    const btnRemoveLogo = document.getElementById('btn-remove-logo');
    const inputLogoFile = document.getElementById('input-logo-file');
    const imgPreview = document.getElementById('img-icon-preview');

    btnSelectLogo.onclick = () => inputLogoFile.click();

    inputLogoFile.onchange = async () => {
        if (!inputLogoFile.files || !inputLogoFile.files[0]) return;
        const file = inputLogoFile.files[0];

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = async () => {
                // Resize to 64x64 using Canvas
                const canvas = document.createElement('canvas');
                canvas.width = 64;
                canvas.height = 64;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, 64, 64);

                const base64 = canvas.toDataURL('image/png').split(',')[1];
                await window.electron.saveServerIcon(activeServer, base64);

                imgPreview.src = `data:image/png;base64,${base64}`;
                showToast('Logo kaydedildi! Görünmesi için restart gereklidir.', 'success');
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    };

    btnRemoveLogo.onclick = async () => {
        if (!activeServer) return;
        if (confirm('Sunucu logosu silinsin mi?')) {
            await window.electron.deleteServerIcon(activeServer);
            imgPreview.src = '';
            showToast('Logo silindi! Görünmesi için restart gereklidir.', 'info');
        }
    };


    // Language Toggle
    const btnLang = document.getElementById('lang-toggle');
    updateLanguage(currentLang);

    btnLang.onclick = () => {
        currentLang = currentLang === 'tr' ? 'en' : 'tr';
        localStorage.setItem('appLang', currentLang);
        updateLanguage(currentLang);
    };

    await refreshServerList();
    await loadVersionLists();

    // Auto-select first server if exists
    const servers = await window.electron.listServers();
    if (servers.length > 0) {
        selectServer(servers[0]);
    } else {
        switchView('create');
    }
}

async function refreshServerList() {
    const servers = await window.electron.listServers();
    serverListNav.innerHTML = '';

    if (servers.length === 0) {
        serverListNav.innerHTML = `<li class="server-item empty">${TEXTS[currentLang].serverListEmpty}</li>`;
        return;
    }

    servers.forEach(name => {
        const li = document.createElement('li');
        li.className = `server-item ${activeServer === name ? 'active' : ''}`;
        li.innerHTML = `<span>📂</span> ${name}`;
        li.onclick = () => selectServer(name);
        serverListNav.appendChild(li);
    });
}

async function loadVersionLists() {
    try {
        serverVersions.VANILLA = await window.electron.getVersions();
        populateVersionSelect('VANILLA');
    } catch (e) { console.error('Versions failed', e); }
}

function populateVersionSelect(type) {
    setupVersion.innerHTML = '';
    const list = type === 'VANILLA' ? serverVersions.VANILLA : serverVersions.FORGE;
    list.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v;
        opt.innerText = v;
        setupVersion.appendChild(opt);
    });
}

// --- 2. NAVIGATION & TABS ---

function switchView(target) {
    Object.keys(views).forEach(k => views[k].classList.add('hidden'));
    views[target].classList.remove('hidden');
}

tabBtns.forEach(btn => {
    btn.onclick = () => {
        const tab = btn.getAttribute('data-tab');
        tabBtns.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(tab).classList.add('active');

        if (tab === 'tab-settings') loadProperties();
        if (tab === 'tab-mods') loadMods();
        if (tab === 'tab-backups') loadBackups();
    };
});

btnNavCreate.onclick = () => {
    if (isServerRunning) {
        showToast('Sunucu çalışırken yeni kurulum yapamazsınız!', 'warn');
        return;
    }
    switchView('create');
    activeServer = null;
    refreshServerList();
};

// --- 3. SERVER SELECTION ---

async function selectServer(name) {
    if (isServerRunning && activeServer !== name) {
        showToast('Başka bir sunucuya geçmeden önce aktif olanı kapatmalısınız!', 'warn');
        return;
    }

    activeServer = name;
    activeServerTitle.innerText = name;
    switchView('control');
    refreshServerList();

    mainConsole.innerHTML = '';
    resetUptime();

    const props = await window.electron.readProperties(name);
    statIp.innerText = props['server-ip'] || '25.xx.xx.xx';
}

// --- 4. SERVER CONTROL ---

btnStart.onclick = async () => {
    if (!activeServer) return showToast('Önce bir sunucu seçin!', 'warn');
    setLoadingUI(true);
    await window.electron.startServer(activeServer);
};

btnStop.onclick = async () => {
    await window.electron.stopServer();
    setLoadingUI(false);
};

btnRestart.onclick = async () => {
    await window.electron.stopServer();
    setTimeout(() => btnStart.click(), 2000);
};

btnOpenFolder.onclick = () => {
    if (activeServer) window.electron.openFolder(activeServer);
};

function setLoadingUI(running) {
    isServerRunning = running;
    btnStart.classList.toggle('hidden', running);
    btnStop.classList.toggle('hidden', !running);
    btnRestart.classList.toggle('hidden', !running);
    statusBadge.classList.toggle('online', running);
    statusText.innerText = running ? 'ÇALIŞIYOR' : 'KAPALI';

    const dot = document.querySelector('.status-dot');
    if (dot) {
        dot.style.background = running ? 'var(--accent)' : '#555';
        dot.style.boxShadow = running ? '0 0 8px var(--accent)' : 'none';
    }

    if (running) startUptime();
    else stopUptime();
}

function startUptime() {
    uptimeSeconds = 0;
    uptimeTimer = setInterval(async () => {
        uptimeSeconds++;
        const h = Math.floor(uptimeSeconds / 3600).toString().padStart(2, '0');
        const m = Math.floor((uptimeSeconds % 3600) / 60).toString().padStart(2, '0');
        const s = (uptimeSeconds % 60).toString().padStart(2, '0');
        statUptime.innerText = `${h}:${m}:${s}`;

        // Periodic Health Check
        if (uptimeSeconds % 3 === 0) {
            const usage = await window.electron.getServerUsage();
            document.getElementById('stat-ram').innerText = usage.ram;

            const ping = await window.electron.pingServer(activeServer);
            document.getElementById('stat-ping').innerText = ping;
        }
    }, 1000);
}

function stopUptime() { clearInterval(uptimeTimer); }
function resetUptime() {
    stopUptime();
    statUptime.innerText = '00:00:00';
    statPlayers.innerText = '0 / --';
    document.getElementById('stat-ram').innerText = '0 MB';
    document.getElementById('stat-ping').innerText = '-- ms';
}

// --- 5. CONSOLE & LOGS ---

consoleInput.onkeydown = (e) => {
    if (e.key === 'Enter') {
        const cmd = consoleInput.value.trim();
        if (cmd) {
            window.electron.sendCommand(cmd);
            appendLog(`> ${cmd}`, 'user');
            consoleInput.value = '';
        }
    }
};

window.electron.onLog((line) => {
    appendLog(line);
    parseLogForStats(line);
});

function appendLog(line, type = 'sys') {
    const div = document.createElement('div');
    if (type === 'user') div.style.color = 'var(--accent)';

    // Simple color code parsing
    const colorMap = {
        '§0': '#000000', '§1': '#0000AA', '§2': '#00AA00', '§3': '#00AAAA',
        '§4': '#AA0000', '§5': '#AA00AA', '§6': '#FFAA00', '§7': '#AAAAAA',
        '§8': '#555555', '§9': '#5555FF', '§a': '#55FF55', '§b': '#55FFFF',
        '§c': '#FF5555', '§d': '#FF55FF', '§e': '#FFFF55', '§f': '#FFFFFF'
    };

    let coloredLine = line;
    Object.keys(colorMap).forEach(code => {
        coloredLine = coloredLine.split(code).join(`<span style="color:${colorMap[code]}">`);
    });
    const spanCount = (coloredLine.match(/<span/g) || []).length;
    div.innerHTML = coloredLine + '</span>'.repeat(spanCount);

    mainConsole.appendChild(div);
    mainConsole.scrollTop = mainConsole.scrollHeight;
}

function parseLogForStats(line) {
    if (line.includes('Done (')) {
        showToast('Sunucu hazır!', 'success');
    }
    if (line.includes('logged in with entity id') || line.includes('joined the game')) {
        incrementPlayers(1);
    } else if (line.includes('left the game')) {
        incrementPlayers(-1);
    }
}

let currentPlayerCount = 0;
function incrementPlayers(delta) {
    currentPlayerCount = Math.max(0, currentPlayerCount + delta);
    statPlayers.innerText = `${currentPlayerCount} / ${currentProperties['max-players'] || '??'}`;
}

window.electron.onError((msg) => {
    if (msg.includes('Kod: 0') || msg.includes('Kod: 1') || msg.includes('Kod: null')) {
        showToast('Sunucu durduruldu.', 'info');
        setLoadingUI(false);
    } else {
        showToast(`Hata: ${msg}`, 'warn');
        setLoadingUI(false);
    }
});

// --- 6. PROPERTIES ---

const SETTINGS_MAP = {
    'GENEL': ['motd', 'max-players', 'server-ip', 'server-port', 'online-mode', 'pvp', 'hardcore', 'allow-flight', 'view-distance', 'simulation-distance'],
    'OYUN': ['gamemode', 'difficulty', 'spawn-protection', 'force-gamemode', 'allow-nether', 'generate-structures'],
    'DUNYA': ['level-name', 'level-type', 'level-seed', 'max-world-size', 'spawn-animals', 'spawn-monsters', 'spawn-npcs'],
    'PERFORMANS': ['network-compression-threshold', 'max-tick-time', 'entity-broadcast-range-percentage'],
    'GUVENLIK': ['white-list', 'enforce-whitelist', 'enable-command-block', 'max-build-height', 'prevent-proxy-connections'],
    'GELISMIS': ['enable-status', 'sync-chunk-writes', 'rate-limit', 'function-permission-level', 'enable-jmx-monitoring']
};

async function loadProperties() {
    if (!activeServer) return;
    const props = await window.electron.readProperties(activeServer);
    currentProperties = props;
    const activeCat = document.querySelector('.set-nav-btn.active').getAttribute('data-set');
    renderProperties(activeCat);

    // Load Icon Preview
    const iconData = await window.electron.getServerIcon(activeServer);
    document.getElementById('img-icon-preview').src = iconData || '';
}

// Initial Turkish dictionaries (default)
let PROP_NAMES = {};
let PROP_HELPS = {};

// AUTOMATION STATE
let autoConfig = {
    backup: { enabled: false, interval: 60, last: 0 },
    restart: { enabled: false, interval: 360, last: 0 }
};

// Load auto config from localStorage if exists
const savedAuto = localStorage.getItem('autoConfig');
if (savedAuto) autoConfig = JSON.parse(savedAuto);

function renderProperties(category = 'GENEL') {
    propsContainer.innerHTML = '';

    // Automation Special Render
    if (category === 'OTOMASYON') {
        renderAutomationUI();
        return;
    }

    const keys = SETTINGS_MAP[category] || [];

    // Icon Selector Visibility (Only in GENEL)
    const iconContainer = document.getElementById('icon-selector-container');
    if (category === 'GENEL') iconContainer.classList.remove('hidden');
    else iconContainer.classList.add('hidden');

    keys.forEach(key => {
        const val = currentProperties[key] !== undefined ? currentProperties[key] : '';
        const row = document.createElement('div');
        row.className = 'prop-row';

        let controlHtml = `<input type="text" data-key="${key}" value="${val}">`;

        // Custom Controls
        if (key === 'gamemode') {
            controlHtml = `<select data-key="${key}">
                <option value="survival" ${val === 'survival' ? 'selected' : ''}>Survival (Hayatta Kalma)</option>
                <option value="creative" ${val === 'creative' ? 'selected' : ''}>Creative (Yaratıcı)</option>
                <option value="adventure" ${val === 'adventure' ? 'selected' : ''}>Adventure (Macera)</option>
                <option value="spectator" ${val === 'spectator' ? 'selected' : ''}>Spectator (İzleyici)</option>
            </select>`;
        } else if (key === 'difficulty') {
            controlHtml = `<select data-key="${key}">
                <option value="peaceful" ${val === 'peaceful' ? 'selected' : ''}>Barışçıl</option>
                <option value="easy" ${val === 'easy' ? 'selected' : ''}>Kolay</option>
                <option value="normal" ${val === 'normal' ? 'selected' : ''}>Normal</option>
                <option value="hard" ${val === 'hard' ? 'selected' : ''}>Zor</option>
            </select>`;
        } else if (key === 'level-type') {
            controlHtml = `<select data-key="${key}">
                <option value="default" ${val === 'default' ? 'selected' : ''}>Varsayılan</option>
                <option value="flat" ${val === 'flat' ? 'selected' : ''}>Dümdüz</option>
                <option value="amplified" ${val === 'amplified' ? 'selected' : ''}>Görkemli Dağlar</option>
                <option value="largebiomes" ${val === 'largebiomes' ? 'selected' : ''}>Geniş Biyomlar</option>
            </select>`;
        }

        const trName = PROP_NAMES[key] || key;
        const help = PROP_HELPS[key] ? `<small style="display:block; color:var(--text-muted); font-size:0.75rem; font-weight:400; margin-top:4px;">${PROP_HELPS[key]}</small>` : '';

        row.innerHTML = `
            <div class="prop-info">
               <label>${trName}</label>
               ${help}
            </div>
            <div class="prop-control">${controlHtml}</div>
        `;
        propsContainer.appendChild(row);
    });
}

btnSaveProps.onclick = async () => {
    const inputs = propsContainer.querySelectorAll('input, select');
    // Update our local cache with whatever is on screen currently
    inputs.forEach(i => {
        currentProperties[i.getAttribute('data-key')] = i.value;
    });

    await window.electron.saveProperties(activeServer, currentProperties);

    let msg = 'Ayarlar kaydedildi!';
    if (isServerRunning) msg += ' Değişiklikler için restart gereklidir.';
    showToast(msg, 'success');
};


// --- 7. MODS ---

async function loadMods() {
    if (!activeServer) return;
    const mods = await window.electron.listMods(activeServer);
    modsList.innerHTML = '';
    mods.forEach(m => {
        const div = document.createElement('div');
        div.className = 'mod-item';
        div.innerHTML = `<span>${m}</span><button class="btn-del-mod" onclick="deleteMod('${m}')">🗑️</button>`;
        modsList.appendChild(div);
    });
}

async function deleteMod(name) {
    if (confirm(`${name} silinsin mi?`)) {
        await window.electron.deleteMod(activeServer, name);
        loadMods();
    }
}

btnAddMod.onclick = async () => {
    await window.electron.addMod(activeServer);
    loadMods();
};

// --- 8. WIZARD ---

setupType.onchange = async () => {
    const type = setupType.value;
    if (type === 'FORGE') {
        setupForgeGroup.classList.remove('hidden');
        if (serverVersions.FORGE.length === 0) {
            serverVersions.FORGE = await window.electron.getForgeMcVersions();
        }
        populateVersionSelect('FORGE');
    } else {
        setupForgeGroup.classList.add('hidden');
        populateVersionSelect('VANILLA');
    }
};

setupVersion.onchange = async () => {
    if (setupType.value === 'FORGE') {
        const mc = setupVersion.value;
        const builds = await window.electron.getForgeBuilds(mc);
        setupForgeBuild.innerHTML = '';
        builds.forEach(b => {
            const opt = document.createElement('option');
            opt.value = b.version;
            opt.innerText = b.version;
            setupForgeBuild.appendChild(opt);
        });
    }
};

btnDoInstall.onclick = async () => {
    const name = setupName.value.trim();
    const type = setupType.value;
    const version = setupVersion.value;
    const ip = setupIp.value.trim();
    if (!name || !ip) return showToast('Lütfen isim ve IP alanlarını doldurun.', 'warn');

    let finalVersion = version;
    if (type === 'FORGE') finalVersion = `${version}-${setupForgeBuild.value}`;

    installProgressCard.classList.remove('hidden');
    btnDoInstall.disabled = true;

    await window.electron.startInstall({
        minecraftVersion: finalVersion, serverType: type, hamachiIp: ip, serverName: name, installPath: ''
    });
};

window.electron.onStatus((status) => {
    const fill = document.getElementById('install-bar-fill');
    const pText = document.getElementById('install-percent');
    const sText = document.getElementById('install-step-text');
    fill.style.width = `${status.progress}%`;
    pText.innerText = `${status.progress}%`;
    sText.innerText = status.message;
    if (status.step === 'READY') {
        showToast('Kurulum başarıyla tamamlandı!', 'success');
        refreshServerList();
        setTimeout(() => {
            installProgressCard.classList.add('hidden');
            btnDoInstall.disabled = false;

            // Critical Fix: Sync state because Orchestrator starts it
            activeServer = setupName.value.trim();
            activeServerTitle.innerText = activeServer;
            switchView('control');
            setLoadingUI(true); // Tell UI it is already running
            statIp.innerText = setupIp.value.trim(); // Sync IP immediately
            loadProperties(); // Load properties into cache
        }, 1500);
    }
});

function showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = 'toast';
    if (type === 'warn') t.style.borderLeftColor = 'var(--warn)';
    if (type === 'success') t.style.borderLeftColor = 'var(--success)';
    t.innerText = msg;
    container.appendChild(t);
    setTimeout(() => t.remove(), 4000);
}

// --- 11. I18N & TRANSLATIONS ---

const TEXTS = {
    tr: {
        newServer: '+ Yeni Sunucu Kur',
        dashboard: 'Dashboard',
        console: 'Konsol',
        commands: 'Komutlar',
        settings: 'Ayarlar',
        backups: 'Yedekler',
        mods: 'Modlar',
        players: 'OYUNCULAR',
        uptime: 'UPTIME',
        address: 'SUNUCU ADRESİ',
        ping: 'PİNG',
        ram: 'KAYNAK KULLANIMI',
        iconTitle: '🖼️ Sunucu Logosu (64x64 PNG)',
        selectLogo: 'Logo Seç',
        removeLogo: 'Logoyu Kaldır',
        saveChanges: 'Değişiklikleri Kaydet',
        general: '⚙️ Genel',
        game: '🎮 Oyun',
        world: '🌍 Dünya',
        perf: '⚡ Performans',
        sec: '🔐 Güvenlik',
        adv: '🧠 Gelişmiş',
        auto: '🤖 Otomasyon',
        installedMods: 'Yüklü Modlar',
        addMod: '+ Mod Yükle (.jar)',
        backupDesc: 'Sunucunuzun yedeğini alarak veri kaybını önleyebilirsiniz.',
        createBackup: '➕ Yedek Oluştur',
        createViewTitle: 'Yeni Sunucu Kur',
        createViewDesc: 'Birkaç basit adımda kendi Minecraft sunucunu oluştur.',
        serverName: 'Sunucu Adı (Klasör Adı)',
        serverType: 'Sunucu Türü',
        mcVersion: 'Minecraft Sürümü',
        ipAddr: 'Hamachi IP Adresi',
        startInstall: 'KURULUMU BAŞLAT',
        installing: 'Kuruluyor...',
        propSaved: 'Ayarlar kaydedildi!',
        restartReq: ' Değişiklikler için restart gereklidir.',
        cmdMgmt: '🛡️ Sunucu Yönetimi',
        cmdPlayers: '👥 Oyuncu Kontrolü',
        cmdWorld: '🌍 Dünya & Oyun Ayarları',
        cmdInfo: '📊 Bilgi & Durum',
        myServers: 'SUNUCULARIM',
        serverListEmpty: 'Sunucu yok',
        setupNamePH: 'Örn: My Epic Server',
        setupIpPH: 'Örn: 25.43.12.99',
        consolePH: 'Sunucu komutu gönder...',
        vanilla: 'Vanilla (Düz)',
        forge: 'Forge (Modlu)',
        loading: 'Yükleniyor...'
    },
    en: {
        newServer: '+ New Server Setup',
        dashboard: 'Dashboard',
        console: 'Console',
        commands: 'Commands',
        settings: 'Settings',
        backups: 'Backups',
        mods: 'Mods',
        players: 'PLAYERS',
        uptime: 'UPTIME',
        address: 'SERVER ADDRESS',
        ping: 'PING',
        ram: 'RESOURCE USAGE',
        iconTitle: '🖼️ Server Icon (64x64 PNG)',
        selectLogo: 'Select Logo',
        removeLogo: 'Remove Logo',
        saveChanges: 'Save Changes',
        general: '⚙️ General',
        game: '🎮 Game',
        world: '🌍 World',
        perf: '⚡ Performance',
        sec: '🔐 Security',
        adv: '🧠 Advanced',
        auto: '🤖 Automation',
        installedMods: 'Installed Mods',
        addMod: '+ Add Mod (.jar)',
        backupDesc: 'Prevent data loss by backing up your server.',
        createBackup: '➕ Create Backup',
        createViewTitle: 'Create New Server',
        createViewDesc: 'Create your own Minecraft server in a few simple steps.',
        serverName: 'Server Name (Folder Name)',
        serverType: 'Server Type',
        mcVersion: 'Minecraft Version',
        ipAddr: 'Hamachi IP Address',
        startInstall: 'START INSTALLATION',
        installing: 'Installing...',
        propSaved: 'Settings saved!',
        restartReq: ' Restart required for changes.',
        cmdMgmt: '🛡️ Server Management',
        cmdPlayers: '👥 Player Control',
        cmdWorld: '🌍 World & Game Settings',
        cmdInfo: '📊 Info & Status',
        myServers: 'MY SERVERS',
        serverListEmpty: 'No servers found',
        setupNamePH: 'Ex: My Epic Server',
        setupIpPH: 'Ex: 25.43.12.99',
        consolePH: 'Send server command...',
        vanilla: 'Vanilla (Plain)',
        forge: 'Forge (Modded)',
        loading: 'Loading...'
    }
};

const PROP_NAMES_TR = {
    'motd': 'Sunucu Başlığı (MOTD)',
    'max-players': 'Maksimum Oyuncu',
    'server-ip': 'Hamachi IP Adresi',
    'server-port': 'Sunucu Portu',
    'online-mode': 'Premium Kontrolü (True/False)',
    'pvp': 'Oyuncu Birbirine Vurma (PVP)',
    'hardcore': 'Hardcore Modu',
    'allow-flight': 'Uçuş İzni',
    'view-distance': 'Görüş Mesafesi (Chunk)',
    'simulation-distance': 'Simülasyon Mesafesi',
    'gamemode': 'Oyun Modu',
    'difficulty': 'Zorluk Seviyesi',
    'spawn-protection': 'Başlangıç Koruması',
    'force-gamemode': 'Oyun Modunu Zorla',
    'allow-nether': 'Nether Dünyası',
    'generate-structures': 'Yapıları Oluştur (Köy vb.)',
    'level-name': 'Dünya (Klasör) Adı',
    'level-type': 'Dünya Tipi',
    'level-seed': 'Dünya Seed Kodu',
    'max-world-size': 'Maks. Dünya Boyutu',
    'spawn-animals': 'Hayvanlar Doğsun mu?',
    'spawn-monsters': 'Canavarlar Doğsun mu?',
    'spawn-npcs': 'Köylüler Doğsun mu?',
    'network-compression-threshold': 'Ağ Sıkıştırma Eşiği',
    'max-tick-time': 'Maksimum Tick Süresi',
    'entity-broadcast-range-percentage': 'Varlık Görünme Oranı (%)',
    'white-list': 'Beyaz Liste (Whitelist)',
    'enforce-whitelist': 'Whitelist Zorunluluğu',
    'enable-command-block': 'Komut Blokları',
    'max-build-height': 'Maks. İnşa Yüksekliği',
    'prevent-proxy-connections': 'Proxy Girişlerini Engelle',
    'enable-status': 'Sunucu Durumunu Göster',
    'sync-chunk-writes': 'Chunk Yazımlarını Senkron Et',
    'rate-limit': 'Paket Sınırı (Rate Limit)',
    'function-permission-level': 'Fonksiyon Yetki Seviyesi',
    'enable-jmx-monitoring': 'JMX İzleme'
};

const PROP_HELPS_TR = {
    'motd': 'Sunucu listesinde oyuncuların gördüğü yazı.',
    'online-mode': 'False yapılırsa crackli oyuncular girebilir.',
    'server-ip': 'Hamachi IP adresinizi buraya yazmalısınız.',
    'gamemode': 'Sunucudaki varsayılan oyun modu.',
    'difficulty': 'Saldırgan mobların gücünü belirler.',
    'white-list': 'Sadece izinli oyuncuların girmesini sağlar.',
    'enable-command-block': 'Haritalardaki komut bloklarını aktifleştirir.'
};

const PROP_NAMES_EN = {
    'motd': 'Server MOTD',
    'max-players': 'Max Players',
    'server-ip': 'Hamachi IP Address',
    'server-port': 'Server Port',
    'online-mode': 'Online Mode (Premium)',
    'gamemode': 'Game Mode',
    'difficulty': 'Difficulty',
    'white-list': 'Whitelist',
    'enable-command-block': 'Command Blocks',
    'spawn-protection': 'Spawn Protection',
    'view-distance': 'View Distance',
    'level-seed': 'World Seed'
};

const PROP_HELPS_EN = {
    'motd': 'Message displayed in the server list.',
    'online-mode': 'Set false to allow cracked players.',
    'server-ip': 'Enter your Hamachi IP here.',
    'gamemode': 'Default game mode.',
    'difficulty': 'Difficulty of the world.',
    'white-list': 'Only allow listed players.',
    'enable-command-block': 'Enable command blocks in world.'
};

function updateLanguage(lang) {
    const t = TEXTS[lang];

    // Toggle Button Image
    const imgInfo = lang === 'tr'
        ? { src: 'assets/turkish.png', alt: 'TR' }
        : { src: 'assets/english.png', alt: 'EN' };

    const icon = document.getElementById('lang-icon');
    if (icon) {
        icon.src = imgInfo.src;
        icon.alt = imgInfo.alt;
    }

    // UI Updates
    document.getElementById('nav-create-btn').innerText = t.newServer;

    const tMyServers = document.getElementById('t-my-servers');
    if (tMyServers) tMyServers.innerText = t.myServers;

    // Tabs
    const tabs = document.querySelectorAll('.tab-btn');
    if (tabs[0]) tabs[0].innerText = t.dashboard;
    if (tabs[1]) tabs[1].innerText = t.console;
    if (tabs[2]) tabs[2].innerText = t.commands;
    if (tabs[3]) tabs[3].innerText = t.settings;
    if (tabs[4]) tabs[4].innerText = t.backups;
    if (tabs[5]) tabs[5].innerText = t.mods;

    // Stats
    document.querySelectorAll('.stat-label')[0].innerText = t.players;
    document.querySelectorAll('.stat-label')[1].innerText = t.uptime;
    document.querySelectorAll('.stat-label')[2].innerText = t.address;
    document.querySelectorAll('.stat-label')[3].innerText = t.ping;
    document.querySelectorAll('.stat-label')[4].innerText = t.ram;

    // Create View
    document.querySelector('#create-view h1').innerText = t.createViewTitle;
    document.querySelector('#create-view p').innerText = t.createViewDesc;
    document.querySelectorAll('#create-view label')[0].innerText = t.serverName;
    document.querySelectorAll('#create-view label')[1].innerText = t.serverType;
    document.querySelectorAll('#create-view label')[2].innerText = t.mcVersion;
    // Index 3 is Forge Build (hidden)
    document.querySelectorAll('#create-view label')[4].innerText = t.ipAddr;
    document.getElementById('do-install-btn').innerText = t.startInstall;

    // Placeholders
    document.getElementById('setup-name').placeholder = t.setupNamePH;
    document.getElementById('setup-ip').placeholder = t.setupIpPH;
    document.getElementById('console-input').placeholder = t.consolePH;

    // Select Options (Static)
    const optVanilla = document.querySelector('option[value="VANILLA"]');
    if (optVanilla) optVanilla.innerText = t.vanilla;
    const optForge = document.querySelector('option[value="FORGE"]');
    if (optForge) optForge.innerText = t.forge;

    // Settings Sidebar
    const setNav = document.querySelectorAll('.set-nav-btn');
    setNav[0].innerText = t.general;
    setNav[1].innerText = t.game;
    setNav[2].innerText = t.world;
    setNav[3].innerText = t.perf;
    setNav[4].innerText = t.sec;
    setNav[5].innerText = t.adv;
    setNav[6].innerText = t.auto;

    // Icon & Buttons
    document.querySelector('.prop-title').innerText = t.iconTitle;
    document.getElementById('btn-select-logo').innerText = t.selectLogo;
    document.getElementById('btn-remove-logo').innerText = t.removeLogo;
    document.getElementById('btn-save-props').innerText = t.saveChanges;

    // Backups & Mods
    document.querySelector('.section-desc').innerText = t.backupDesc;
    document.getElementById('btn-create-backup').innerText = t.createBackup;
    document.querySelector('.mod-header h3').innerText = t.installedMods;
    document.getElementById('btn-add-mod').innerText = t.addMod;

    // Commands Categories
    const cats = document.querySelectorAll('.cmd-cat-title');
    if (cats[0]) cats[0].innerText = t.cmdMgmt;
    if (cats[1]) cats[1].innerText = t.cmdPlayers;
    if (cats[2]) cats[2].innerText = t.cmdWorld;
    if (cats[3]) cats[3].innerText = t.cmdInfo;

    // Update Prop Maps
    PROP_NAMES = lang === 'tr' ? { ...PROP_NAMES_TR } : { ...PROP_NAMES_TR, ...PROP_NAMES_EN }; // Fallback to TR keys if EN missing
    PROP_HELPS = lang === 'tr' ? { ...PROP_HELPS_TR } : { ...PROP_HELPS_EN };

    // Update Commands Display
    renderQuickCommands();

    // Re-render settings if open
    const activeSet = document.querySelector('.set-nav-btn.active');
    if (activeSet) renderProperties(activeSet.getAttribute('data-set'));

    // Refresh Server List if empty to update text
    if (serverListNav.querySelector('.empty')) refreshServerList();
}

const QUICK_COMMANDS = [
    { cat: 'mgmt', icon: '💾', label: 'Dünyayı Kaydet', cmd: '/save-all', desc: 'Mevcut dünya verilerini diske yazar.', msg: 'Dünya kaydedildi!' },
    { cat: 'mgmt', icon: '♻️', label: 'Oto-Kayıt Aç', cmd: '/save-on', desc: 'Otomatik kayıt sistemini aktif eder.', msg: 'Oto-kayıt aktif edildi.' },
    { cat: 'mgmt', icon: '🔐', label: 'Oto-Kayıt Kapat', cmd: '/save-off', desc: 'Otomatik kayıt sistemini durdurur.', msg: 'Oto-kayıt kapatıldı.' },
    { cat: 'mgmt', icon: '🧱', label: 'Chunk Sorgula', cmd: '/forceload query', desc: 'Sürekli yüklü kalan alanları gösterir.', msg: 'Chunk bilgisi konsola yazıldı.' },
    { cat: 'mgmt', icon: '⏹️', label: 'Sunucuyu Durdur', cmd: '/stop', desc: 'Sunucuyu güvenli şekilde kapatır.', msg: 'Durdurma komutu gönderildi.' },

    { cat: 'players', icon: '👥', label: 'Oyuncuları Listele', cmd: '/list', desc: 'Aktif oyuncuları konsola döker.', msg: 'Oyuncu listesi istendi.' },
    { cat: 'players', icon: '📋', label: 'Whitelist Listele', cmd: '/whitelist list', desc: 'Whitelistteki oyuncuları gösterir.', msg: 'Whitelist listesi istendi.' },
    { cat: 'players', icon: '🔄', label: 'Whitelist Yenile', cmd: '/whitelist reload', desc: 'Whitelist dosyasını tekrar yükler.', msg: 'Whitelist güncellendi.' },
    { cat: 'players', icon: '🧹', label: 'Yerleri Temizle', cmd: '/kill @e[type=item]', desc: 'Yerdeki tüm eşyaları siler.', msg: 'Yerdeki eşyalar temizlendi.' },
    { cat: 'players', icon: '✨', label: 'Sohbeti Temizle', cmd: '/tellraw @a {"text":"\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n"}', desc: 'Tüm oyuncuların sohbetini kaydırır.', msg: 'Sohbet temizlendi.' },

    { cat: 'world', icon: '☀️', label: 'Gündüz Yap', cmd: '/time set day', desc: 'Zamanı sabah vaktine ayarlar.', msg: 'Zaman gündüz yapıldı.' },
    { cat: 'world', icon: '🌙', label: 'Gece Yap', cmd: '/time set night', desc: 'Zamanı gece vaktine ayarlar.', msg: 'Zaman gece yapıldı.' },
    { cat: 'world', icon: '🌤️', label: 'Havayı Temizle', cmd: '/weather clear', desc: 'Yağmur ve fırtınayı durdurur.', msg: 'Hava durumu temizlendi.' },
    { cat: 'world', icon: '🌧️', label: 'Yağmuru Başlat', cmd: '/weather rain', desc: 'Dünyada yağmur başlatır.', msg: 'Yağmur başlatıldı.' },
    { cat: 'world', icon: '🕊️', label: 'Barışçıl Mod', cmd: '/difficulty peaceful', desc: 'Canavarlar doğmaz, hasar almazsınız.', msg: 'Zorluk: Barışçıl.' },
    { cat: 'world', icon: '🔥', label: 'Zor Mod', cmd: '/difficulty hard', desc: 'Oyunu en zor seviyeye çeker.', msg: 'Zorluk: Zor.' },
    { cat: 'world', icon: '🎒', label: 'Envanter Koruması', cmd: '/gamerule keepInventory true', desc: 'Ölünce eşyalarınız gitmez.', msg: 'Envanter koruması aktif.' },
    { cat: 'world', icon: '🧨', label: 'Mob Zararını Kapat', cmd: '/gamerule mobGriefing false', desc: 'Moblar bloklara zarar veremez.', msg: 'Mob tahribatı kapatıldı.' },

    { cat: 'info', icon: '🌱', label: 'Dünya Tohumu', cmd: '/seed', desc: 'Dünyanın Seed kodunu gösterir.', msg: 'Seed kodu konsola yazıldı.' },
    { cat: 'info', icon: '🏷️', label: 'Sürüm Bilgisi', cmd: '/version', desc: 'Sunucu yazılım sürümünü gösterir.', msg: 'Sürüm bilgisi istendi.' }
];

function renderQuickCommands() {
    const containers = {
        mgmt: document.getElementById('cmd-list-mgmt'),
        players: document.getElementById('cmd-list-players'),
        world: document.getElementById('cmd-list-world'),
        info: document.getElementById('cmd-list-info')
    };

    // Clear
    Object.values(containers).forEach(c => c.innerHTML = '');

    QUICK_COMMANDS.forEach(q => {
        const btn = document.createElement('div');
        btn.className = 'cmd-btn';
        btn.innerHTML = `
            <div class="cmd-btn-header"><span>${q.icon}</span> ${q.label}</div>
            <div class="cmd-btn-desc">${q.desc}</div>
        `;
        btn.onclick = () => {
            if (!isServerRunning) return showToast('Önce sunucuyu başlatmalısınız!', 'warn');
            window.electron.sendCommand(q.cmd);
            appendLog(`> ${q.cmd}`, 'user');
            showToast(q.msg, 'success');
        };
        containers[q.cat].appendChild(btn);
    });
}

// --- 10. BACKUPS ---

const btnCreateBackup = document.getElementById('btn-create-backup');
const backupList = document.getElementById('backup-list');

async function loadBackups() {
    if (!activeServer) return;
    const backups = await window.electron.listBackups(activeServer);
    backupList.innerHTML = '';

    if (backups.length === 0) {
        backupList.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding:20px;">Henüz yedek oluşturulmamış.</div>';
        return;
    }

    backups.forEach(b => {
        const item = document.createElement('div');
        item.className = 'backup-item';
        item.innerHTML = `
            <div class="backup-info">
                <span class="backup-name">${b.name}</span>
                <span class="backup-meta">📅 ${b.date} • 📦 ${b.size}</span>
            </div>
            <div class="backup-actions">
                <button class="btn small primary-btn" onclick="restoreBackup('${b.name}')">Geri Yükle</button>
                <button class="btn small danger-btn" onclick="deleteBackup('${b.name}')">Sil</button>
            </div>
        `;
        backupList.appendChild(item);
    });
}

btnCreateBackup.onclick = async () => {
    if (!activeServer) return;
    // Show spinner or disable button?
    btnCreateBackup.innerText = 'Yedekleniyor...';
    btnCreateBackup.disabled = true;

    const res = await window.electron.createBackup(activeServer);

    btnCreateBackup.innerText = '➕ Yedek Oluştur';
    btnCreateBackup.disabled = false;

    if (res.success) {
        showToast('Yedek başarıyla oluşturuldu!', 'success');
        loadBackups();
    } else {
        showToast('Yedekleme hatası: ' + res.error, 'warn');
    }
};

window.restoreBackup = async (name) => {
    if (isServerRunning) return showToast('Yedek yüklemek için sunucuyu durdurun!', 'warn');
    if (confirm('Bu yedeği yüklemek istediğinize emin misiniz? Mevcut veriler silinecektir!')) {
        const res = await window.electron.restoreBackup(activeServer, name);
        if (res.success) {
            showToast('Yedek başarıyla yüklendi!', 'success');
            // Refresh logs
            mainConsole.innerHTML = '';
            appendLog('Yedek yüklendi. Sunucu hazır.', 'sys');
        } else {
            showToast('Yükleme hatası: ' + res.error, 'warn');
        }
    }
};

window.deleteBackup = async (name) => {
    if (confirm('Bu yedeği silmek istiyor musunuz?')) {
        await window.electron.deleteBackup(activeServer, name);
        showToast('Yedek silindi.', 'info');
        loadBackups();
    }
};

// Automation Loop
setInterval(checkAutomation, 60000); // Check every minute


function checkAutomation() {
    if (!isServerRunning) return;
    const now = Date.now();

    // Auto Backup
    if (autoConfig.backup.enabled) {
        const diffMins = (now - autoConfig.backup.last) / 60000;
        if (diffMins >= autoConfig.backup.interval) {
            window.electron.createBackup(activeServer);
            autoConfig.backup.last = now;
            appendLog('🤖 [OTO] Yedekleme başlatıldı.', 'sys');
            localStorage.setItem('autoConfig', JSON.stringify(autoConfig));
        }
    }

    // Auto Restart
    if (autoConfig.restart.enabled) {
        const diffMins = (now - autoConfig.restart.last) / 60000;
        if (diffMins >= autoConfig.restart.interval) {
            appendLog('🤖 [OTO] Sunucu yeniden başlatılıyor...', 'sys');
            window.electron.sendCommand('/say [OTO] Sunucu 10 saniye içinde yeniden başlatılacak!');

            setTimeout(async () => {
                await window.electron.stopServer();
                setTimeout(() => btnStart.click(), 5000);
            }, 10000);

            autoConfig.restart.last = now;
            localStorage.setItem('autoConfig', JSON.stringify(autoConfig));
        }
    }
}

function renderAutomationUI() {
    propsContainer.innerHTML = `
        <div class="prop-row">
            <div class="prop-info">
                <label>Otomatik Yedekleme</label>
                <small style="display:block; color:var(--text-muted); font-size:0.75rem;">Belirlenen aralıklarla sunucu yedeği alır.</small>
            </div>
            <div class="prop-control" style="display:flex; gap:10px; align-items:center;">
                <input type="checkbox" id="auto-backup-check" ${autoConfig.backup.enabled ? 'checked' : ''} style="width:20px; height:20px;">
                <input type="number" id="auto-backup-min" value="${autoConfig.backup.interval}" style="width:70px;"> 
                <span>dk</span>
            </div>
        </div>
        <div class="prop-row">
            <div class="prop-info">
                <label>Otomatik Restart</label>
                <small style="display:block; color:var(--text-muted); font-size:0.75rem;">Lag önlemek için periyodik restart.</small>
            </div>
            <div class="prop-control" style="display:flex; gap:10px; align-items:center;">
                <input type="checkbox" id="auto-restart-check" ${autoConfig.restart.enabled ? 'checked' : ''} style="width:20px; height:20px;">
                <input type="number" id="auto-restart-min" value="${autoConfig.restart.interval}" style="width:70px;">
                <span>dk</span>
            </div>
        </div>
        <div style="padding:10px; color:var(--accent); font-size:0.8rem;">
            * Değişiklikler anında kaydedilir.
        </div>
    `;

    document.getElementById('auto-backup-check').onchange = (e) => {
        autoConfig.backup.enabled = e.target.checked;
        if (e.target.checked) autoConfig.backup.last = Date.now();
        localStorage.setItem('autoConfig', JSON.stringify(autoConfig));
    };
    document.getElementById('auto-backup-min').onchange = (e) => {
        autoConfig.backup.interval = parseInt(e.target.value);
        localStorage.setItem('autoConfig', JSON.stringify(autoConfig));
    };

    document.getElementById('auto-restart-check').onchange = (e) => {
        autoConfig.restart.enabled = e.target.checked;
        if (e.target.checked) autoConfig.restart.last = Date.now();
        localStorage.setItem('autoConfig', JSON.stringify(autoConfig));
    };
    document.getElementById('auto-restart-min').onchange = (e) => {
        autoConfig.restart.interval = parseInt(e.target.value);
        localStorage.setItem('autoConfig', JSON.stringify(autoConfig));
    };
}

init();
renderQuickCommands();
