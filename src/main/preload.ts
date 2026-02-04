/*
 * Copyright (c) 2026 Santi
 * Licensed under AGPL-3.0
 */

import { contextBridge, ipcRenderer } from 'electron';
import { InstallConfig, InstallStatus } from '../common/types';

contextBridge.exposeInMainWorld('electron', {
    // Action: Start Install
    startInstall: (config: InstallConfig) => ipcRenderer.invoke('install-start', config),
    getVersions: () => ipcRenderer.invoke('get-versions'),
    getForgeMcVersions: () => ipcRenderer.invoke('get-forge-mc-versions'),
    getForgeBuilds: (mc: string) => ipcRenderer.invoke('get-forge-builds', mc),
    listServers: () => ipcRenderer.invoke('list-servers'),
    startServer: (name: string) => ipcRenderer.invoke('server-start-manual', name),
    stopServer: () => ipcRenderer.invoke('server-stop'),
    openFolder: (name: string) => ipcRenderer.invoke('open-server-folder', name),

    // Properties
    readProperties: (name: string) => ipcRenderer.invoke('read-properties', name),
    saveProperties: (name: string, props: any) => ipcRenderer.invoke('save-properties', name, props),

    // Mods
    listMods: (name: string) => ipcRenderer.invoke('list-mods', name),
    addMod: (name: string) => ipcRenderer.invoke('add-mod', name),
    deleteMod: (name: string, modName: string) => ipcRenderer.invoke('delete-mod', name, modName),
    getServerUsage: () => ipcRenderer.invoke('get-server-usage'),
    pingServer: (folder: string) => ipcRenderer.invoke('ping-server', folder),
    saveServerIcon: (folder: string, base64: string) => ipcRenderer.invoke('save-server-icon', folder, base64),
    deleteServerIcon: (folder: string) => ipcRenderer.invoke('delete-server-icon', folder),
    getServerIcon: (folder: string) => ipcRenderer.invoke('get-server-icon', folder),

    // Backups
    createBackup: (folder: string) => ipcRenderer.invoke('create-backup', folder),
    listBackups: (folder: string) => ipcRenderer.invoke('list-backups', folder),
    deleteBackup: (folder: string, backupName: string) => ipcRenderer.invoke('delete-backup', folder, backupName),
    restoreBackup: (folder: string, backupName: string) => ipcRenderer.invoke('restore-backup', folder, backupName),

    // Window Controls
    minWindow: () => ipcRenderer.send('window-min'),
    maxWindow: () => ipcRenderer.send('window-max'),
    closeWindow: () => ipcRenderer.send('window-close'),

    // Action: Send Command
    sendCommand: (cmd: string) => ipcRenderer.invoke('server-command', cmd),

    // Events: Listen for updates
    onStatus: (callback: (status: InstallStatus) => void) => {
        const subscription = (_event: any, status: InstallStatus) => callback(status);
        ipcRenderer.on('install-status', subscription);
    },

    onLog: (callback: (line: string) => void) => {
        ipcRenderer.on('server-log', (_event, line) => callback(line));
    },

    onError: (callback: (error: string) => void) => {
        ipcRenderer.on('install-error', (_event, error) => callback(error));
    }
});
