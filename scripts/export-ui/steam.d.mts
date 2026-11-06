export interface SteamSettings { appId: string; buildWithSteam: boolean }
export interface SteamCheck { name: string; ok: boolean; blocking: boolean; detail: string }
export const STEAM_SETTINGS: string;
export const DESKTOP_PLATFORMS: string[];
export function defaultSteamSettings(): SteamSettings;
export function validateSteamSettings(value?: unknown): SteamSettings;
export function readSteamSettingsSync(root: string): SteamSettings;
export function readSteamSettings(root: string): Promise<SteamSettings>;
export function saveSteamSettings(root: string, value: unknown): Promise<SteamSettings>;
export function steamFeatureDeclared(cargoText: string): boolean;
export function steamUsesSteam(platform: string, settings: SteamSettings): boolean;
export function steamChecks(root: string, settings: SteamSettings): Promise<SteamCheck[]>;
export function steamAppIdFile(root: string): string;
export function steamAppIdStep(root: string, appId: string): { command: string; args: string[]; title: string };
export const SDK_FOLDER: string;
export const RUNTIME_LIBRARY: Record<string, string>;
export function installSteamSdk(root: string, sourcePath: string): Promise<{ destination: string; copied: string[]; foundIn: string }>;
export function steamRuntimeStep(root: string, platform: string): { command: string; args: string[]; title: string } | undefined;
export function findSteamSdkRoot(folder: string, depth?: number): Promise<string | undefined>;
export function chooseFolder(platform?: string): Promise<string | undefined>;
export const FRAMEWORK_ROOT: string;
export function addSteamToGame(root: string, frameworkRoot?: string, options?: { dryRun?: boolean }): Promise<{ changed: string[] }>;
