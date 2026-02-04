/*
 * Copyright (c) 2026 Santi
 * Licensed under AGPL-3.0
 */

import { ServerType } from '../../common/types';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';

/**
 * DownloadService
 * 
 * Responsible for fetching the correct server artifacts (JARs, installers)
 * from remote sources. It handles the logic of URL resolution and file downloading.
 */
export class DownloadService {

    /**
     * Main public entry point to download server files.
     * 
     * @param version The Minecraft version (e.g., "1.20.1")
     * @param type The type of server (VANILLA or FORGE)
     * @param destinationPath The local folder path where the file should be saved
     * @param onProgress Optional callback to report download progress (0-100)
     * 
     * @returns Promise<string> The absolute path to the downloaded file
     */
    public async downloadServerArtifact(
        version: string,
        type: ServerType,
        destinationPath: string,
        onProgress?: (percentage: number) => void
    ): Promise<string> {

        // 1. Resolve the download URL based on type
        const url = await this.resolveUrl(version, type);
        const fileName = 'server.jar'; // Keeping it simple for Vanilla
        const filePath = path.join(destinationPath, fileName);

        console.log(`[DownloadService] Starting download for ${version} (${type})`);
        console.log(`[DownloadService] URL: ${url}`);
        console.log(`[DownloadService] Destination: ${filePath}`);

        // 2. Start the download stream
        return new Promise((resolve, reject) => {
            const file = fs.createWriteStream(filePath);

            https.get(url, (response) => {
                if (response.statusCode !== 200) {
                    reject(new Error(`Failed to download: HTTP Status Code ${response.statusCode}`));
                    return;
                }

                const totalSize = parseInt(response.headers['content-length'] || '0', 10);
                let downloadedSize = 0;

                // Log start
                if (onProgress) onProgress(0);

                response.on('data', (chunk) => {
                    downloadedSize += chunk.length;
                    file.write(chunk);

                    if (totalSize > 0 && onProgress) {
                        const percentage = Math.round((downloadedSize / totalSize) * 100);
                        onProgress(percentage);
                    }
                });

                response.on('end', () => {
                    file.end();
                    console.log(`[DownloadService] Download complete: ${filePath}`);
                    if (onProgress) onProgress(100);
                    resolve(filePath);
                });

            }).on('error', (err) => {
                console.error('[DownloadService] Network error:', err);
                // Try to delete the partial file
                fs.unlink(filePath, () => { });
                reject(err);
            });
        });
    }

    /**
     * Resolves the correct download URL.
     * Internal method to separate URL logic from download logic.
     */
    /**
     * Fetches the list of latest stable Minecraft versions from Mojang API.
     * Returns top 30 releases.
     */
    public async getVersions(): Promise<string[]> {
        return new Promise((resolve, reject) => {
            const manifestUrl = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';

            https.get(manifestUrl, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    try {
                        const manifest = JSON.parse(data);
                        // Filter releases only
                        const releases = manifest.versions
                            .filter((v: any) => v.type === 'release')
                            .slice(0, 30)
                            .map((v: any) => v.id);
                        resolve(releases);
                    } catch (e) {
                        reject(new Error('Sürüm listesi alınamadı: ' + e));
                    }
                });
            }).on('error', (err) => {
                reject(new Error('Sürüm listesi indirilemedi: ' + err.message));
            });
        });
    }

    /**
     * Fetches MC versions that have Forge available.
     */
    public async getForgeMcVersions(): Promise<string[]> {
        const data = await this.fetchJson('https://bmclapi2.bangbang93.com/forge/minecraft');
        return (data as string[]).reverse().slice(0, 40); // Latest 40 MC versions with Forge
    }

    /**
     * Fetches Forge versions for a specific MC version.
     */
    public async getForgeVersionsForMc(mcVersion: string): Promise<any[]> {
        const data = await this.fetchJson(`https://bmclapi2.bangbang93.com/forge/minecraft/${mcVersion}`);
        // Forge versions have a "version" field for the build number (e.g. 47.1.0)
        return (data as any[]).reverse().slice(0, 15);
    }

    private async resolveUrl(version: string, type: ServerType): Promise<string> {
        if (type === ServerType.VANILLA) {
            const manifestData = await this.fetchJson('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
            const versionEntry = manifestData.versions.find((v: any) => v.id === version);

            if (!versionEntry) throw new Error(`${version} sürümü bulunamadı!`);

            const details = await this.fetchJson(versionEntry.url);

            if (!details.downloads || !details.downloads.server) {
                throw new Error(`${version} için sunucu dosyası (server.jar) Mojang tarafından sunulmuyor.`);
            }

            return details.downloads.server.url;
        }
        else if (type === ServerType.FORGE) {
            // Version string for Forge is expected as "mcVersion-forgeVersion"
            // e.g. "1.20.1-47.2.0"
            const [mc, forge] = version.split('-');
            return `https://bmclapi2.bangbang93.com/forge/download?mcversion=${mc}&version=${forge}&category=installer&format=jar`;
        }

        throw new Error('Unsupported server type');
    }

    public async downloadToFile(url: string, filePath: string, onProgress?: (p: number) => void): Promise<void> {
        return new Promise((resolve, reject) => {
            const file = fs.createWriteStream(filePath);
            https.get(url, (res) => {
                if (res.statusCode === 302 || res.statusCode === 301) {
                    this.downloadToFile(res.headers.location!, filePath, onProgress).then(resolve).catch(reject);
                    return;
                }
                const total = parseInt(res.headers['content-length'] || '0');
                let cur = 0;
                res.on('data', (chunk) => {
                    cur += chunk.length;
                    file.write(chunk);
                    if (total > 0 && onProgress) onProgress(Math.round((cur / total) * 100));
                });
                res.on('end', () => {
                    file.end();
                    resolve();
                });
            }).on('error', reject);
        });
    }

    private fetchJson(url: string): Promise<any> {
        return new Promise((resolve, reject) => {
            https.get(url, (res) => {
                if (res.statusCode === 302 || res.statusCode === 301) {
                    this.fetchJson(res.headers.location!).then(resolve).catch(reject);
                    return;
                }
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(e);
                    }
                });
            }).on('error', reject);
        });
    }
}
