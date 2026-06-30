import { FileSystemAdapter } from 'obsidian';
import * as path from 'path';
import type LocalDictionaryPlugin from './main';

/**
 * Absolute path to this plugin's folder inside the vault
 * (e.g. <vault>/.obsidian/plugins/local-dictionary).
 */
export function getPluginDir(plugin: LocalDictionaryPlugin): string {
	const adapter = plugin.app.vault.adapter;
	if (!(adapter instanceof FileSystemAdapter)) {
		throw new Error('Local Dictionary requires a desktop vault on the local filesystem.');
	}
	// manifest.dir is the plugin folder relative to the vault root.
	const rel =
		plugin.manifest.dir ??
		path.join(plugin.app.vault.configDir, 'plugins', plugin.manifest.id);
	return path.join(adapter.getBasePath(), rel);
}

/**
 * Folder where downloaded/cached assets (Sudachi synonyms, kuromoji dict,
 * generated indexes) are stored. Created lazily by callers.
 */
export function getAssetsDir(plugin: LocalDictionaryPlugin): string {
	return path.join(getPluginDir(plugin), 'assets');
}
