/*
 * Copyright (c) 2026 Santi
 * Licensed under AGPL-3.0
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * FileSystemService
 * 
 * Responsible for all file I/O operations.
 * - Creating directories
 * - Reading/Writing config files (eula.txt, server.properties)
 * - Moving files
 */
export class FileSystemService {

    /**
     * Prepares the installation directory.
     * Ensures the folder exists. Does NOT clean it if it exists (safe mode).
     * 
     * @param basePath absolute path to the base directory
     * @param serverName name of the folder to create
     * @returns absolute path to the created server directory
     */
    public async createServerDirectory(basePath: string, serverName: string): Promise<string> {
        const fullPath = path.join(basePath, serverName);

        // Check if exists
        if (!fs.existsSync(fullPath)) {
            console.log(`[FileSystemService] Creating directory: ${fullPath}`);
            await fs.promises.mkdir(fullPath, { recursive: true });
        } else {
            console.log(`[FileSystemService] Directory already exists: ${fullPath}`);
        }

        return fullPath;
    }

    /**
     * Locates the eula.txt file and updates it to agree to the EULA.
     * If file doesn't exist, it does nothing (assuming server hasn't run yet).
     * 
     * @param serverDirectory The root directory of the server
     */
    public async agreeToEula(serverDirectory: string): Promise<void> {
        const eulaPath = path.join(serverDirectory, 'eula.txt');

        if (!fs.existsSync(eulaPath)) {
            console.warn(`[FileSystemService] eula.txt not found in ${serverDirectory}. Skipping.`);
            return;
        }

        try {
            const content = await fs.promises.readFile(eulaPath, 'utf-8');

            // Simple strict replace to avoid regex complexity issues
            if (content.includes('eula=false')) {
                const newContent = content.replace('eula=false', 'eula=true');
                await fs.promises.writeFile(eulaPath, newContent, 'utf-8');
                console.log(`[FileSystemService] Updated eula=false to true in ${eulaPath}`);
            } else if (content.includes('eula=true')) {
                console.log(`[FileSystemService] EULA is already accepted.`);
            } else {
                // Fallback: Just append if not found, or maybe standard file format changed?
                // For now, let's assume standard format.
                console.warn(`[FileSystemService] Could not find standard 'eula=false' line.`);
            }

        } catch (err) {
            console.error(`[FileSystemService] Error reading/writing eula.txt:`, err);
        }
    }

    /**
     * Updates the server.properties file with the user's Hamachi IP.
     * 
     * @param serverDirectory The root directory of the server
     * @param ipAddress The IPv4 address to write
     */
    public async configureServerProperties(serverDirectory: string, ipAddress?: string): Promise<void> {
        if (!ipAddress) {
            console.log('[FileSystemService] No IP address provided. Skipping property configuration.');
            return;
        }

        const propsPath = path.join(serverDirectory, 'server.properties');

        if (!fs.existsSync(propsPath)) {
            console.warn(`[FileSystemService] server.properties not found in ${serverDirectory}. Skipping.`);
            return;
        }

        try {
            let content = await fs.promises.readFile(propsPath, 'utf-8');
            const lines = content.split('\n');
            let found = false;

            // Iterate and modify lines
            const newLines = lines.map(line => {
                if (line.trim().startsWith('server-ip=')) {
                    found = true;
                    return `server-ip=${ipAddress}`;
                }
                return line;
            });

            // If key doesn't exist, append it
            if (!found) {
                newLines.push(`server-ip=${ipAddress}`);
            }

            // CRACKED SUPPORT (online-mode=false)
            let foundOnlineMode = false;
            // Map again or just reuse logic? Re-mapping is cleaner for clarity.
            // Actually, let's do it in one pass or separate pass. Separate pass is safer to read.
            const linesPass2 = newLines;
            const finalLines = linesPass2.map(line => {
                if (line.trim().startsWith('online-mode=')) {
                    foundOnlineMode = true;
                    return 'online-mode=false';
                }
                return line;
            });

            if (!foundOnlineMode) {
                finalLines.push('online-mode=false');
            }

            await fs.promises.writeFile(propsPath, finalLines.join('\n'), 'utf-8');
            console.log(`[FileSystemService] Updated server-ip to ${ipAddress} and online-mode=false`);

        } catch (err) {
            console.error(`[FileSystemService] Error configuring properties:`, err);
        }
    }

    /**
     * Helper to simple check if directory is ready
     */
    public async verifyFilesExist(serverDirectory: string, files: string[]): Promise<boolean> {
        for (const file of files) {
            if (!fs.existsSync(path.join(serverDirectory, file))) {
                return false;
            }
        }
        return true;
    }
}
