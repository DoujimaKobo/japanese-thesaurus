import { Notice } from 'obsidian';
import type LocalDictionaryPlugin from './main';
import * as iconv from 'iconv-lite';

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

export interface IndexEntry {
	keyword: string;
	offset: number;
	length: number;
}

export class DictionaryIndexer {
	plugin: LocalDictionaryPlugin;
	indexPath: string;
	index: Map<string, IndexEntry[]>;

	constructor(plugin: LocalDictionaryPlugin) {
		this.plugin = plugin;
		this.index = new Map();

		// Store index in plugin's data directory
		const configDir = (this.plugin.app.vault.adapter as any).getBasePath();
		const pluginDir = path.join(configDir, '.obsidian', 'plugins', 'local-dictionary');
		this.indexPath = path.join(pluginDir, '.dictionary-index.json');
	}

	/**
	 * Build an index of the dictionary file
	 * Creates a map of keywords to their byte offsets for O(1) lookups
	 */
	async buildIndex(): Promise<void> {
		const dictPath = this.plugin.settings.dictionaryPath;

		if (!dictPath) {
			throw new Error('Dictionary path not configured');
		}

		try {
			await fs.access(dictPath);
		} catch (e) {
			throw new Error('Cannot access dictionary file: ' + dictPath);
		}

		const newIndex = new Map<string, IndexEntry[]>();
		let processedLines = 0;
		let currentOffset = 0;

		// Read file line by line to build index
		const fileBuffer = await fs.readFile(dictPath);
		const fileContent = this.plugin.settings.encoding === 'shift-jis'
			? iconv.decode(fileBuffer, 'shift_jis')
			: fileBuffer.toString('utf-8');
		const lines = fileContent.split('\n');

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const lineBytes = this.plugin.settings.encoding === 'shift-jis'
				? iconv.encode(line + '\n', 'shift_jis')
				: Buffer.from(line + '\n', 'utf-8');
			const lineLength = lineBytes.length;

			// Match Eijiro format: ■Keyword : Definition
			const match = line.match(/^■(.+?)\s*[:：]\s*(.+)/);

			if (match) {
				const keyword = match[1].trim();
				const keywordLower = keyword.toLowerCase();

				const entry: IndexEntry = {
					keyword: keyword,
					offset: currentOffset,
					length: lineLength
				};

				// Store entries (support multiple entries for same keyword)
				if (!newIndex.has(keywordLower)) {
					newIndex.set(keywordLower, []);
				}
				const keywordEntries = newIndex.get(keywordLower);
				if (keywordEntries) {
					keywordEntries.push(entry);
				}

				processedLines++;
			}

			currentOffset += lineLength;

			// Progress feedback for large files
			if (processedLines % 10000 === 0) {
				console.log(`Indexed ${processedLines} entries...`);
			}
		}

		// Save index to disk
		const indexData = {
			version: 1,
			dictionaryPath: dictPath,
			encoding: this.plugin.settings.encoding,
			entryCount: processedLines,
			index: Array.from(newIndex.entries())
		};

		await fs.mkdir(path.dirname(this.indexPath), { recursive: true });
		await fs.writeFile(this.indexPath, JSON.stringify(indexData, null, 2));

		this.index = newIndex;
		console.log(`Index built: ${processedLines} entries indexed`);
	}

	/**
	 * Load existing index from disk
	 */
	async loadIndex(): Promise<boolean> {
		try {
			const indexData = JSON.parse(await fs.readFile(this.indexPath, 'utf-8'));

			// Verify index is for current dictionary
			if (indexData.dictionaryPath !== this.plugin.settings.dictionaryPath ||
				indexData.encoding !== this.plugin.settings.encoding) {
				console.log('Index is for different dictionary/encoding, needs rebuild');
				return false;
			}

			// Reconstruct Map from array
			this.index = new Map(indexData.index);
			console.log(`Index loaded: ${indexData.entryCount} entries`);
			return true;
		} catch (e) {
			const errorMessage = e instanceof Error ? e.message : String(e);
			console.log('No existing index found or load failed:', errorMessage);
			return false;
		}
	}

	/**
	 * Search for a keyword in the dictionary
	 */
	async search(keyword: string): Promise<string[]> {
		if (this.index.size === 0) {
			throw new Error('Index not loaded. Please rebuild index in settings.');
		}

		const keywordLower = keyword.toLowerCase().trim();
		const entries = this.index.get(keywordLower);

		if (!entries || entries.length === 0) {
			return [];
		}

		const dictPath = this.plugin.settings.dictionaryPath;
		const results: string[] = [];

		// Use file handle for efficient random access
		const fileHandle = await fs.open(dictPath, 'r');

		try {
			for (const entry of entries) {
				const buffer = Buffer.alloc(entry.length);
				await fileHandle.read(buffer, 0, entry.length, entry.offset);
				const line = this.plugin.settings.encoding === 'shift-jis'
					? iconv.decode(buffer, 'shift_jis').trim()
					: buffer.toString('utf-8').trim();
				results.push(line);
			}
		} finally {
			await fileHandle.close();
		}

		return results;
	}

	/**
	 * Check if index is ready
	 */
	isReady(): boolean {
		return this.index.size > 0;
	}

	/**
	 * Get index statistics
	 */
	getStats(): { entries: number; keywords: number } {
		let totalEntries = 0;
		for (const entries of this.index.values()) {
			totalEntries += entries.length;
		}
		return {
			entries: totalEntries,
			keywords: this.index.size
		};
	}
}
