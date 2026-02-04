/*
 * Copyright (c) 2026 Santi
 * Licensed under AGPL-3.0
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const electron = require('electron');
const app = electron.app;
const BrowserWindow = electron.BrowserWindow;
const ipcMain = electron.ipcMain;
import * as path from 'path';
import { Orchestrator } from './services/Orchestrator';
import { InstallConfig, InstallStatus, ServerType } from '../common/types';

let mainWindow: any | null = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1100,
        height: 750,
        backgroundColor: '#0a0c10',
        frame: false, // Frameless
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    // Window Controls
    ipcMain.on('window-min', () => mainWindow?.minimize());
    ipcMain.on('window-max', () => {
        if (mainWindow?.isMaximized()) mainWindow.unmaximize();
        else mainWindow?.maximize();
    });
    ipcMain.on('window-close', () => mainWindow?.close());

    // Load from the DIST folder (relative to main.js in dist/main/)
    // path: dist/main/main.js -> ../renderer/index.html
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

    // Open DevTools in dev mode (optional, good for debugging)
    // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// --- IPC HANDLERS ---

// Global Orchestrator
const orchestrator = new Orchestrator();

ipcMain.handle('install-start', async (_event: any, config: InstallConfig) => {
    console.log('[Main] Received install-start:', config);

    // Callbacks
    const onStatusChange = (status: InstallStatus) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('install-status', status);
        }
    };

    const onLog = (line: string) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('server-log', line);
        }
    };

    try {
        const exeDir = path.dirname(process.execPath);
        // If in development (electron .), use a local folder, otherwise next to exe
        const isPackaged = app.isPackaged || process.env.NODE_ENV === 'production';
        // Fallback for dev mode
        const targetDir = isPackaged ? exeDir : app.getPath('userData');

        const baseInstallPath = path.join(targetDir, 'MinecraftSunucularim');

        const finalConfig = {
            ...config,
            installPath: baseInstallPath
        };

        console.log(`[Main] Installing to: ${finalConfig.installPath}`);

        // Start process (async)
        orchestrator.startInstallation(finalConfig, onStatusChange, onLog).then(() => {
            console.log('[Main] Installation finished.');
        }).catch(err => {
            console.error('[Main] Orchestrator error:', err);
            if (mainWindow) mainWindow.webContents.send('install-error', err.message);
        });

        return { success: true, installPath: finalConfig.installPath };

    } catch (error: any) {
        console.error('[Main] Failed to start:', error);
        throw error;
    }
});

// Command Handler
ipcMain.handle('server-command', async (_event: any, command: string) => {
    orchestrator.sendServerCommand(command);
});

// Version Handler
ipcMain.handle('get-versions', async () => {
    const { DownloadService } = require('./services/DownloadService');
    const svc = new DownloadService();
    return await svc.getVersions();
});

ipcMain.handle('get-forge-mc-versions', async () => {
    const { DownloadService } = require('./services/DownloadService');
    const svc = new DownloadService();
    return await svc.getForgeMcVersions();
});

ipcMain.handle('get-forge-builds', async (_event: any, mcVersion: string) => {
    const { DownloadService } = require('./services/DownloadService');
    const svc = new DownloadService();
    return await svc.getForgeVersionsForMc(mcVersion);
});

// List Servers Handler
ipcMain.handle('list-servers', async () => {
    const fs = require('fs');
    const path = require('path');
    const exeDir = path.dirname(process.execPath);
    const isPackaged = app.isPackaged || process.env.NODE_ENV === 'production';
    const targetDir = isPackaged ? exeDir : app.getPath('userData');
    const baseInstallPath = path.join(targetDir, 'MinecraftSunucularim');

    if (!fs.existsSync(baseInstallPath)) return [];

    const dirs = fs.readdirSync(baseInstallPath, { withFileTypes: true })
        .filter((dirent: any) => dirent.isDirectory())
        .map((dirent: any) => dirent.name);

    return dirs;
});

ipcMain.handle('server-stop', async () => {
    orchestrator.stopServer();
});

// --- NEW CONTROL PANEL HANDLERS ---

// Open Folder
ipcMain.handle('open-server-folder', async (_event: any, folderName: string) => {
    const { shell } = require('electron');
    const path = require('path');
    const exeDir = path.dirname(process.execPath);
    const isPackaged = app.isPackaged || process.env.NODE_ENV === 'production';
    const targetDir = isPackaged ? exeDir : app.getPath('userData');
    const serverPath = path.join(targetDir, 'MinecraftSunucularim', folderName);
    shell.openPath(serverPath);
});

// Read server.properties
ipcMain.handle('read-properties', async (_event: any, folderName: string) => {
    const fs = require('fs');
    const path = require('path');
    const exeDir = path.dirname(process.execPath);
    const isPackaged = app.isPackaged || process.env.NODE_ENV === 'production';
    const targetDir = isPackaged ? exeDir : app.getPath('userData');
    const propPath = path.join(targetDir, 'MinecraftSunucularim', folderName, 'server.properties');

    if (!fs.existsSync(propPath)) return {};

    const content = fs.readFileSync(propPath, 'utf8');
    const props: any = {};
    content.split('\n').forEach((line: string) => {
        if (line.trim() && !line.startsWith('#')) {
            const [key, ...val] = line.split('=');
            props[key.trim()] = val.join('=').trim();
        }
    });
    return props;
});

// Save server.properties
ipcMain.handle('save-properties', async (_event: any, folderName: string, props: any) => {
    const fs = require('fs');
    const path = require('path');
    const exeDir = path.dirname(process.execPath);
    const isPackaged = app.isPackaged || process.env.NODE_ENV === 'production';
    const targetDir = isPackaged ? exeDir : app.getPath('userData');
    const propPath = path.join(targetDir, 'MinecraftSunucularim', folderName, 'server.properties');

    let content = '# Minecraft server properties\n# Modified by EasyMCServer\n';
    for (const key in props) {
        content += `${key}=${props[key]}\n`;
    }
    fs.writeFileSync(propPath, content, 'utf8');
    return { success: true };
});

// List Mods (Forge)
ipcMain.handle('list-mods', async (_event: any, folderName: string) => {
    const fs = require('fs');
    const path = require('path');
    const exeDir = path.dirname(process.execPath);
    const isPackaged = app.isPackaged || process.env.NODE_ENV === 'production';
    const targetDir = isPackaged ? exeDir : app.getPath('userData');
    const modsPath = path.join(targetDir, 'MinecraftSunucularim', folderName, 'mods');

    if (!fs.existsSync(modsPath)) return [];
    return fs.readdirSync(modsPath).filter((f: string) => f.endsWith('.jar'));
});

// Delete Mod
ipcMain.handle('delete-mod', async (_event: any, folderName: string, modName: string) => {
    const fs = require('fs');
    const path = require('path');
    const exeDir = path.dirname(process.execPath);
    const isPackaged = app.isPackaged || process.env.NODE_ENV === 'production';
    const targetDir = isPackaged ? exeDir : app.getPath('userData');
    const modPath = path.join(targetDir, 'MinecraftSunucularim', folderName, 'mods', modName);
    if (fs.existsSync(modPath)) fs.unlinkSync(modPath);
    return { success: true };
});

// Add Mod (Open File Dialog)
ipcMain.handle('add-mod', async (_event: any, folderName: string) => {
    const { dialog } = require('electron');
    const fs = require('fs');
    const path = require('path');

    const result = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'Minecraft Mods', extensions: ['jar'] }]
    });

    if (result.canceled) return { success: false };

    const exeDir = path.dirname(process.execPath);
    const isPackaged = app.isPackaged || process.env.NODE_ENV === 'production';
    const targetDir = isPackaged ? exeDir : app.getPath('userData');
    const modsPath = path.join(targetDir, 'MinecraftSunucularim', folderName, 'mods');

    if (!fs.existsSync(modsPath)) fs.mkdirSync(modsPath, { recursive: true });

    result.filePaths.forEach((filePath: string) => {
        const dest = path.join(modsPath, path.basename(filePath));
        fs.copyFileSync(filePath, dest);
    });

    return { success: true };
});

// Global Cleanup on App Close
app.on('before-quit', () => {
    console.log('[Main] App quitting, killing active server processes...');
    orchestrator.stopServer();
});

ipcMain.handle('server-start-manual', async (_event: any, serverFolderName: string) => {
    const path = require('path');
    const exeDir = path.dirname(process.execPath);
    const isPackaged = app.isPackaged || process.env.NODE_ENV === 'production';
    const targetDir = isPackaged ? exeDir : app.getPath('userData');
    const serverPath = path.join(targetDir, 'MinecraftSunucularim', serverFolderName);

    // Callbacks
    const onLog = (line: string) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('server-log', line);
        }
    };

    orchestrator.startExistingServer(serverPath, onLog).catch(err => {
        if (mainWindow) mainWindow.webContents.send('install-error', err.message);
    });

    return { success: true };
});
ipcMain.handle('get-server-usage', async () => {
    return await orchestrator.getServerUsage();
});

ipcMain.handle('ping-server', async (_event: any, folderName: string) => {
    const net = require('net');
    const fs = require('fs');
    const path = require('path');

    // Read port from properties
    const exeDir = path.dirname(process.execPath);
    const isPackaged = app.isPackaged || process.env.NODE_ENV === 'production';
    const targetDir = isPackaged ? exeDir : app.getPath('userData');
    const propPath = path.join(targetDir, 'MinecraftSunucularim', folderName, 'server.properties');

    let port = 25565;
    if (fs.existsSync(propPath)) {
        const content = fs.readFileSync(propPath, 'utf8');
        const match = content.match(/server-port=(\d+)/);
        if (match) port = parseInt(match[1]);
    }

    const start = Date.now();
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(1000);
        socket.on('connect', () => {
            const time = Date.now() - start;
            socket.destroy();
            resolve(time + ' ms');
        });
        socket.on('error', () => {
            socket.destroy();
            resolve('Timout');
        });
        socket.on('timeout', () => {
            socket.destroy();
            resolve('Timeout');
        });
        socket.connect(port, '127.0.0.1');
    });
});
// --- SERVER ICON HANDLERS ---

ipcMain.handle('save-server-icon', async (_event: any, folderName: string, base64Data: string) => {
    const fs = require('fs');
    const path = require('path');
    const exeDir = path.dirname(process.execPath);
    const isPackaged = app.isPackaged || process.env.NODE_ENV === 'production';
    const targetDir = isPackaged ? exeDir : app.getPath('userData');
    const iconPath = path.join(targetDir, 'MinecraftSunucularim', folderName, 'server-icon.png');

    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(iconPath, buffer);
    return { success: true };
});

ipcMain.handle('delete-server-icon', async (_event: any, folderName: string) => {
    const fs = require('fs');
    const path = require('path');
    const exeDir = path.dirname(process.execPath);
    const isPackaged = app.isPackaged || process.env.NODE_ENV === 'production';
    const targetDir = isPackaged ? exeDir : app.getPath('userData');
    const iconPath = path.join(targetDir, 'MinecraftSunucularim', folderName, 'server-icon.png');

    if (fs.existsSync(iconPath)) fs.unlinkSync(iconPath);
    return { success: true };
});

ipcMain.handle('get-server-icon', async (_event: any, folderName: string) => {
    const fs = require('fs');
    const path = require('path');
    const exeDir = path.dirname(process.execPath);
    const isPackaged = app.isPackaged || process.env.NODE_ENV === 'production';
    const targetDir = isPackaged ? exeDir : app.getPath('userData');
    const iconPath = path.join(targetDir, 'MinecraftSunucularim', folderName, 'server-icon.png');

    if (fs.existsSync(iconPath)) {
        const data = fs.readFileSync(iconPath);
        return `data:image/png;base64,${data.toString('base64')}`;
    }
    return null;
});

// --- BACKUP HANDLERS ---

function getServerPath(folderName: string) {
    const path = require('path');
    const exeDir = path.dirname(process.execPath);
    const isPackaged = app.isPackaged || process.env.NODE_ENV === 'production';
    const targetDir = isPackaged ? exeDir : app.getPath('userData');
    return path.join(targetDir, 'MinecraftSunucularim', folderName);
}

ipcMain.handle('create-backup', async (_event: any, folderName: string) => {
    try {
        const p = getServerPath(folderName);
        await orchestrator.createBackup(p, folderName);
        return { success: true };
    } catch (e: any) { return { success: false, error: e.message }; }
});

ipcMain.handle('list-backups', async (_event: any, folderName: string) => {
    const p = getServerPath(folderName);
    return await orchestrator.listBackups(p);
});

ipcMain.handle('delete-backup', async (_event: any, folderName: string, backupName: string) => {
    const p = getServerPath(folderName);
    await orchestrator.deleteBackup(p, backupName);
    return { success: true };
});

ipcMain.handle('restore-backup', async (_event: any, folderName: string, backupName: string) => {
    try {
        const p = getServerPath(folderName);
        await orchestrator.restoreBackup(p, backupName);
        return { success: true };
    } catch (e: any) { return { success: false, error: e.message }; }
});
