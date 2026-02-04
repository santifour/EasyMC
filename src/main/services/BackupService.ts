/*
 * Copyright (c) 2026 Santi
 * Licensed under AGPL-3.0
 */

import * as path from 'path';
import * as fs from 'fs';
import * as child_process from 'child_process';

export class BackupService {

    /**
     * Creates a zip backup of the server.
     * Excludes the 'backups' folder itself.
     */
    public async createBackup(serverPath: string, serverName: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const backupsDir = path.join(serverPath, 'backups');
            if (!fs.existsSync(backupsDir)) {
                fs.mkdirSync(backupsDir, { recursive: true });
            }

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const zipName = `${serverName}_${timestamp}.zip`;
            const zipPath = path.join(backupsDir, zipName);

            // PowerShell command to zip everything excluding 'backups'
            // We'll list items in serverPath, filter out 'backups', and pass to Compress-Archive
            const psCommand = `
                $source = "${serverPath}";
                $dest = "${zipPath}";
                $exclude = "backups";
                $items = Get-ChildItem -Path $source | Where-Object { $_.Name -ne $exclude };
                if ($items) {
                    Compress-Archive -Path $items.FullName -DestinationPath $dest -Force
                }
            `;

            const child = child_process.spawn('powershell.exe', ['-Command', psCommand]);

            child.on('close', (code) => {
                if (code === 0) resolve(zipName);
                else reject(new Error(`Backup failed with code ${code}`));
            });
        });
    }

    public async listBackups(serverPath: string): Promise<{ name: string, size: string, date: string }[]> {
        const backupsDir = path.join(serverPath, 'backups');
        if (!fs.existsSync(backupsDir)) return [];

        const files = fs.readdirSync(backupsDir).filter(f => f.endsWith('.zip'));
        const backups = files.map(f => {
            const stat = fs.statSync(path.join(backupsDir, f));
            return {
                name: f,
                size: (stat.size / 1024 / 1024).toFixed(2) + ' MB',
                date: stat.mtime.toLocaleString()
            };
        });

        // Sort new to old
        return backups.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }

    public async deleteBackup(serverPath: string, backupName: string): Promise<void> {
        const p = path.join(serverPath, 'backups', backupName);
        if (fs.existsSync(p)) {
            fs.unlinkSync(p);
        }
    }

    public async restoreBackup(serverPath: string, backupName: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const zipPath = path.join(serverPath, 'backups', backupName);
            if (!fs.existsSync(zipPath)) return reject(new Error('Yedek dosyası bulunamadı!'));

            // Restore using Expand-Archive -Force (Overwrites)
            const psCommand = `Expand-Archive -Path "${zipPath}" -DestinationPath "${serverPath}" -Force`;

            const child = child_process.spawn('powershell.exe', ['-Command', psCommand]);

            child.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`Restore failed with code ${code}`));
            });
        });
    }
}
