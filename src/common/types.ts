/**
 * Supported server types.
 */
export enum ServerType {
  VANILLA = 'VANILLA',
  FORGE = 'FORGE',
}

/**
 * Represents a specific Minecraft version structure.
 */
export interface MinecraftVersion {
  id: string; // e.g., "1.20.1"
  type: 'release' | 'snapshot';
  url: string; // URL to the server jar or installer
}

/**
 * Configuration needed to start the installation process.
 */
export interface InstallConfig {
  serverType: ServerType;
  minecraftVersion: string;
  hamachiIp: string;
  installPath: string; // Target directory for installation
  serverName?: string; // e.g. "MySurvival"
}

/**
 * Represents the current status of the installation process.
 */
export interface InstallStatus {
  step: 'IDLE' | 'DOWNLOADING' | 'PREPARING_FILES' | 'BOOTSTRAPPING' | 'CONFIGURING' | 'READY';
  progress: number; // 0-100 percentage
  message: string; // User-friendly status message
}

/**
 * Interface that all main services must adhere to for lifecycle management.
 * (Optional for this MVP, but good practice).
 */
export interface IService {
  initialize(): void;
}
