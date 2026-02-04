/*
 * Copyright (c) 2026 Santi
 * Licensed under AGPL-3.0
 */

import { InstallConfig, InstallStatus, ServerType } from '../../common/types';
import { DownloadService } from './DownloadService';
import { FileSystemService } from './FileSystemService';
import { ProcessService } from './ProcessService';
import { BackupService } from './BackupService';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Orchestrator
 * 
 * The "Brain" of the operation.
 * Coordinates the workflow between Download, FileSystem, and Process services.
 * It is the main entry point for the "Install" command from the UI.
 */
export class Orchestrator {
    private downloadService: DownloadService;
    private fileService: FileSystemService;
    private processService: ProcessService;
    private backupService: BackupService;

    constructor(
        downloadService?: DownloadService,
        fileService?: FileSystemService,
        processService?: ProcessService
    ) {
        this.downloadService = downloadService || new DownloadService();
        this.fileService = fileService || new FileSystemService();
        this.processService = processService || new ProcessService();
        this.backupService = new BackupService();
    }

    /**
     * Starts the full installation workflow based on the user configuration.
     * 
     * @param config The installation configuration provided by the user
     * @param onStatusChange Callback to report high-level status updates (step, message)
     */
    public async startInstallation(
        config: InstallConfig,
        onStatusChange: (status: InstallStatus) => void,
        onLog?: (line: string) => void
    ): Promise<void> {

        // Safety Wrapper
        const report = (step: InstallStatus['step'], progress: number, message: string) => {
            onStatusChange({ step, progress, message });
        };

        try {
            console.log('[Orchestrator] Workflow started:', config);

            // --- STEP 0: CHECK JAVA ---
            report('PREPARING_FILES', 0, 'Sistem araçları kontrol ediliyor (Java)...');
            const isJavaInstalled = await this.processService.validateJavaInstalled();
            if (!isJavaInstalled) {
                throw new Error('Bilgisayarınızda Java yüklü değil! Suncuyu çalıştırmak için lütfen Java 17 veya üzerini yükleyin.');
            }

            // --- STEP 1: PREPARE DIRECTORY ---
            report('PREPARING_FILES', 5, 'Sunucu klasörü hazırlanıyor...');
            // Check if serverName is provided, else fallback
            const folderName = config.serverName ? config.serverName : `${config.serverType}-${config.minecraftVersion}`;

            // Clean up folder name (remove invalid chars)
            const safeFolderName = folderName.replace(/[^a-zA-Z0-9 _-]/g, '');
            const serverPath = await this.fileService.createServerDirectory(config.installPath, safeFolderName);


            // --- STEP 2: DOWNLOAD ---
            report('DOWNLOADING', 10, 'Sunucu dosyaları indiriliyor...');
            const artifactPath = await this.downloadService.downloadServerArtifact(
                config.minecraftVersion,
                config.serverType,
                serverPath,
                (percent) => {
                    const overallProgress = 10 + Math.round(percent * 0.4);
                    report('DOWNLOADING', overallProgress, `İndiriliyor: %${percent}`);
                }
            );

            // --- STEP 3: FORGE INSTALLATION (IF APPLICABLE) ---
            if (config.serverType === ServerType.FORGE) {
                report('BOOTSTRAPPING', 60, 'Forge kütüphaneleri kuruluyor (Sürebilir)...');
                await this.processService.runForgeInstaller(serverPath, artifactPath);
                // Clean up installer
                try { await fs.promises.unlink(artifactPath); } catch (e) { }
            }

            // --- STEP 4: FIRST BOOT (GENERATE FILES) ---
            report('BOOTSTRAPPING', 70, 'Gerekli dosyalar oluşturuluyor...');

            // Detect JAR (Forge vs Vanilla)
            let jarToRun = 'server.jar';
            if (config.serverType === ServerType.FORGE) {
                const files = await fs.promises.readdir(serverPath);
                const forgeJar = files.find((f: any) => f.startsWith('forge-') && f.endsWith('.jar'));
                if (forgeJar) jarToRun = forgeJar;
            }

            await new Promise<void>((resolve) => {
                this.processService.startServer(serverPath, {
                    onExit: () => resolve()
                }, jarToRun);
                // Timeout if it hangs
                setTimeout(resolve, 30000);
            });

            // --- STEP 5: CONFIGURATION ---
            report('CONFIGURING', 80, 'EULA kabul ediliyor...');
            await this.fileService.agreeToEula(serverPath);

            report('CONFIGURING', 85, 'IP ve Offline Mode ayarlanıyor...');
            await this.fileService.configureServerProperties(serverPath, config.hamachiIp);

            // --- STEP 6: FINAL START ---
            report('BOOTSTRAPPING', 95, 'Sunucu başlatılıyor...');
            await new Promise<void>((resolve, reject) => {
                this.processService.startServer(serverPath, {
                    onOutput: (line) => {
                        console.log(`[SERVER_LOG] ${line}`);
                        if (onLog) onLog(line);
                    },
                    onReady: () => resolve(),
                    onError: (err) => reject(err),
                    onExit: (code) => reject(new Error(`Sunucu kapandı (Kod: ${code})`))
                }, jarToRun);
            });

            report('READY', 100, 'Sunucu Hazır!');

        } catch (error) {
            console.error('[Orchestrator] Critical Failure:', error);
            report('IDLE', 0, `Hata Oluştu: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    public sendServerCommand(command: string): void {
        this.processService.sendCommand(command);
    }

    public stopServer(): void {
        this.processService.stopServer();
    }

    public async getServerUsage(): Promise<{ ram: string }> {
        return this.processService.getProcessUsage();
    }

    public async createBackup(serverPath: string, serverName: string) { return this.backupService.createBackup(serverPath, serverName); }
    public async listBackups(serverPath: string) { return this.backupService.listBackups(serverPath); }
    public async deleteBackup(serverPath: string, backupName: string) { return this.backupService.deleteBackup(serverPath, backupName); }
    public async restoreBackup(serverPath: string, backupName: string) { return this.backupService.restoreBackup(serverPath, backupName); }

    public async startExistingServer(
        serverPath: string,
        onLog?: (line: string) => void
    ): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.processService.startServer(serverPath, {
                onOutput: (line) => {
                    console.log(`[SERVER_LOG] ${line}`);
                    if (onLog) onLog(line);
                },
                onReady: () => {
                    console.log('[Orchestrator] Server is READY!');
                    resolve();
                },
                onError: (err) => reject(err),
                onExit: (code) => {
                    if (code === 0 || code === 1 || code === null) {
                        // User stopped it or JVM exited cleanly
                        resolve();
                    } else {
                        reject(new Error(`Sunucu beklenmedik bir hatayla kapandı (Kod: ${code})`));
                    }
                }
            });
        });
    }
}
