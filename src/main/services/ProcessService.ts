/*
 * Copyright (c) 2026 Santi
 * Licensed under AGPL-3.0
 */

import * as child_process from 'child_process';
import * as path from 'path';

export interface ServerProcessCallbacks {
    onOutput?: (line: string) => void;
    onReady?: () => void;
    onError?: (error: Error) => void;
    onExit?: (code: number | null) => void;
}

/**
 * ProcessService
 * 
 * Responsible for spawning and managing the Java server process.
 */
export class ProcessService {

    private activeProcess: child_process.ChildProcess | null = null;

    /**
     * Checks if Java is accessible in the system PATH.
     */
    public async validateJavaInstalled(): Promise<boolean> {
        return new Promise((resolve) => {
            const check = child_process.spawn('java', ['-version']);
            let output = '';

            // Java writes version info to stderr usually
            check.stderr.on('data', (d) => output += d.toString());
            check.stdout.on('data', (d) => output += d.toString());

            check.on('close', () => {
                // Parse version
                // Output formats: 'java version "1.8.0_..."' or 'java 17.0.1 ...'
                console.log('[ProcessService] Java Version Output:', output);

                const match = output.match(/version "?(\d+)/) || output.match(/java (\d+)/);
                if (match && match[1]) {
                    const majorVersion = parseInt(match[1]);
                    // Java 1.8 returns '1' here usually? No, '1.8' -> match is '1'.
                    // Wait, regex 'version "?(\d+)' on '1.8.0' matches '1'. 
                    // Let's be more specific.

                    // Better logic:
                    // If output contains "1.8", it is Java 8.
                    // If output contains "version 1.8", it is Java 8.
                    // If output starts with "java 17", it is 17.

                    if (output.includes('1.8.') || output.includes('1.7.') || output.includes('1.6.')) {
                        console.log('[ProcessService] Detected old Java (8 or lower).');
                        resolve(false);
                        return;
                    }

                    // If we see a number like "17" or "21"
                    console.log(`[ProcessService] Detected Major Version: ${majorVersion} (Approx)`);
                    // If we caught "1" from "1.8", check context.
                    // But with the exclude above, we might be safe.
                    // Let's assume if we are here, and majorVersion >= 17, it is OK.
                    // But actually: 'openjdk version "17.0.1"' matches '17'.

                    if (majorVersion >= 17) {
                        resolve(true);
                        return;
                    }
                }

                // Fallback: If simple heuristic fails, defaults to false to be safe? 
                // Or true if command worked? 
                // Let's try to be strict. Minecraft 1.20 needs 17.
                // If the regex failed but command existed...
                // Let's try to check specifically for "version 17" or "version 18" etc.
                const modernMatch = output.match(/version "?(1[7-9]|[2-9][0-9])/); // Matches 17-99
                if (modernMatch) {
                    resolve(true);
                } else {
                    console.log('[ProcessService] Could not verify Java 17+. Output:', output);
                    resolve(false);
                }
            });

            check.on('error', () => resolve(false));
        });
    }

    /**
     * Starts the Vanilla Minecraft server.
     * Assumes 'server.jar' exists in the provided serverDirectory.
     * 
     * @param serverDirectory The folder containing server.jar
     * @param callbacks Listeners for process events
     */
    public startServer(serverDirectory: string, callbacks: ServerProcessCallbacks, jarName: string = 'server.jar'): void {
        // We assume the file exists because FileSystem/Download services did their job.

        console.log(`[ProcessService] Starting server in: ${serverDirectory}`);

        try {
            // Spawn the Java process
            // Command: java -jar server.jar nogui (Back to headless)
            this.activeProcess = child_process.spawn('java', ['-jar', jarName, 'nogui'], {
                cwd: serverDirectory,
                shell: false, // No separate window
                detached: false, // Attached to our app
                stdio: 'pipe' // Capture all IO
            });

            if (!this.activeProcess.pid) {
                throw new Error('Failed to spawn Java process (checked PID).');
            }

            console.log(`[ProcessService] Process started. PID: ${this.activeProcess.pid}`);

            // Handle Standard Output
            this.activeProcess.stdout?.on('data', (data: Buffer) => {
                const text = data.toString();

                // Pass to callback (for UI logs later)
                if (callbacks.onOutput) {
                    // Splitting lines in case multiple come at once
                    text.split('\n').forEach(line => {
                        if (line.trim()) callbacks.onOutput!(line.trim());
                    });
                }

                // Check for "Ready" signal
                // Classic Minecraft Output: "[16:51:20] [Server thread/INFO]: Done (4.291s)! For help, type "help""
                if (text.includes('Done (') || text.includes('For help, type "help"')) {
                    if (callbacks.onReady) {
                        callbacks.onReady();
                    }
                }
            });

            // Handle Standard Error
            this.activeProcess.stderr?.on('data', (data: Buffer) => {
                const text = data.toString();
                if (callbacks.onOutput) {
                    callbacks.onOutput!(`[STDERR] ${text.trim()}`);
                }
            });

            // Handle Error (Startup failure)
            this.activeProcess.on('error', (err) => {
                console.error('[ProcessService] Process error:', err);
                if (callbacks.onError) callbacks.onError(err);
            });

            // Handle Exit
            this.activeProcess.on('close', (code) => {
                console.log(`[ProcessService] Process exited with code ${code}`);
                this.activeProcess = null;
                if (callbacks.onExit) callbacks.onExit(code);
            });

        } catch (e: any) {
            console.error('[ProcessService] Exception spawning process:', e);
            if (callbacks.onError) callbacks.onError(e);
        }
    }

    /**
     * Sends a command to the running server.
     * @param command The command string (e.g., "stop", "op user")
     */
    public sendCommand(command: string): void {
        if (this.activeProcess && this.activeProcess.stdin) {
            console.log(`[ProcessService] Sending command: ${command}`);
            this.activeProcess.stdin.write(command + '\n');
        } else {
            console.warn('[ProcessService] Cannot send command: Server not running or stdin unavailable.');
        }
    }

    /**
     * Runs the Forge installer.
     */
    public async runForgeInstaller(serverDirectory: string, installerPath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            console.log(`[ProcessService] Running Forge installer in: ${serverDirectory}`);
            // installerPath is the full path to forge-installer.jar
            const proc = child_process.spawn('java', ['-jar', installerPath, '--installServer'], {
                cwd: serverDirectory,
                shell: false
            });

            proc.stdout?.on('data', (d) => console.log(`[FORGE_INSTALL] ${d}`));
            proc.stderr?.on('data', (d) => console.error(`[FORGE_INSTALL_ERR] ${d}`));

            proc.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`Forge kurulumu hata ile sonlandı (Kod: ${code})`));
            });
        });
    }

    public async getProcessUsage(): Promise<{ ram: string }> {
        if (!this.activeProcess || !this.activeProcess.pid) return { ram: '0 MB' };

        try {
            // Simple approach for Windows: tasklist
            const out = child_process.execSync(`tasklist /FI "PID eq ${this.activeProcess.pid}" /NH /FO CSV`).toString();
            const parts = out.split(','); // "Image Name","PID","Session Name","Session#","Mem Usage"
            if (parts.length >= 5) {
                let mem = parts[4].replace(/[" K]/g, '').replace('.', '').replace(',', '');
                const mb = (parseInt(mem) / 1024).toFixed(1);
                return { ram: mb + ' MB' };
            }
        } catch (e) {
            // ignore
        }
        return { ram: '0 MB' };
    }

    /**
     * Kills the active server process if exists.
     */
    public stopServer(): void {
        if (this.activeProcess && this.activeProcess.pid) {
            console.log(`[ProcessService] Stopping server process tree (PID: ${this.activeProcess.pid})...`);
            try {
                child_process.execSync(`taskkill /F /T /PID ${this.activeProcess.pid}`);
            } catch (e) {
                this.activeProcess.kill();
            }
        }

        // Final fallback: Ensure NO java is left if we intended to stop
        try {
            child_process.execSync('taskkill /F /IM java.exe /T');
        } catch (e) {
            // Likely no java running, ignore
        }

        this.activeProcess = null;
    }
}
