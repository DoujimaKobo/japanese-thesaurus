import { Notice, requestUrl } from 'obsidian';
import { promises as fs } from 'fs';
import * as path from 'path';
import type LocalDictionaryPlugin from './main';
import { getAssetsDir } from './paths';

/**
 * Downloads and caches the data files the plugin "bundles" but cannot ship
 * through the community store (which only distributes main.js / manifest.json /
 * styles.css). Everything is fetched once into <plugin>/assets and reused.
 *
 *  - Sudachi synonym dictionary (Apache-2.0, redistributable)
 *  - kuromoji tokenizer dictionary (Apache-2.0, redistributable)
 */

// Pinned upstream sources. Pinning to a tag/version keeps results reproducible.
const SUDACHI_SYNONYMS_URL =
	'https://raw.githubusercontent.com/WorksApplications/SudachiDict/v20240716/src/main/text/synonyms.txt';

const KUROMOJI_DICT_BASE =
	'https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict';

// The 12 files kuromoji's dictionary loader expects (gzipped).
const KUROMOJI_DICT_FILES = [
	'base.dat.gz',
	'cc.dat.gz',
	'check.dat.gz',
	'tid.dat.gz',
	'tid_map.dat.gz',
	'tid_pos.dat.gz',
	'unk.dat.gz',
	'unk_char.dat.gz',
	'unk_compat.dat.gz',
	'unk_invoke.dat.gz',
	'unk_map.dat.gz',
	'unk_pos.dat.gz',
];

export const SUDACHI_SYNONYMS_FILENAME = 'sudachi-synonyms.txt';
export const KUROMOJI_DICT_DIRNAME = 'kuromoji-dict';

export class AssetManager {
	plugin: LocalDictionaryPlugin;

	constructor(plugin: LocalDictionaryPlugin) {
		this.plugin = plugin;
	}

	get assetsDir(): string {
		return getAssetsDir(this.plugin);
	}

	get sudachiSynonymsPath(): string {
		return path.join(this.assetsDir, SUDACHI_SYNONYMS_FILENAME);
	}

	get kuromojiDictDir(): string {
		return path.join(this.assetsDir, KUROMOJI_DICT_DIRNAME);
	}

	private async exists(p: string): Promise<boolean> {
		try {
			await fs.access(p);
			return true;
		} catch {
			return false;
		}
	}

	async isSudachiSynonymsReady(): Promise<boolean> {
		return this.exists(this.sudachiSynonymsPath);
	}

	async isKuromojiDictReady(): Promise<boolean> {
		for (const f of KUROMOJI_DICT_FILES) {
			if (!(await this.exists(path.join(this.kuromojiDictDir, f)))) {
				return false;
			}
		}
		return true;
	}

	/** Download a single URL to a destination file (binary-safe). */
	private async download(url: string, dest: string): Promise<void> {
		const res = await requestUrl({ url, throw: true });
		await fs.mkdir(path.dirname(dest), { recursive: true });
		await fs.writeFile(dest, Buffer.from(res.arrayBuffer));
	}

	/**
	 * Ensure the Sudachi synonym dictionary is present, downloading it if
	 * needed. Returns the local path. Safe to call repeatedly.
	 */
	async ensureSudachiSynonyms(): Promise<string> {
		if (await this.isSudachiSynonymsReady()) {
			return this.sudachiSynonymsPath;
		}
		const notice = new Notice('Sudachi同義語辞書をダウンロード中…', 0);
		try {
			await this.download(SUDACHI_SYNONYMS_URL, this.sudachiSynonymsPath);
			return this.sudachiSynonymsPath;
		} catch (e) {
			throw new Error(
				'Sudachi同義語辞書のダウンロードに失敗しました: ' +
					(e instanceof Error ? e.message : String(e))
			);
		} finally {
			notice.hide();
		}
	}

	/**
	 * Ensure the kuromoji dictionary is present, downloading any missing files.
	 * Returns the directory kuromoji should be pointed at.
	 */
	async ensureKuromojiDict(): Promise<string> {
		if (await this.isKuromojiDictReady()) {
			return this.kuromojiDictDir;
		}
		const notice = new Notice('kuromoji辞書をダウンロード中… (0/' + KUROMOJI_DICT_FILES.length + ')', 0);
		try {
			let done = 0;
			for (const f of KUROMOJI_DICT_FILES) {
				const dest = path.join(this.kuromojiDictDir, f);
				if (!(await this.exists(dest))) {
					await this.download(`${KUROMOJI_DICT_BASE}/${f}`, dest);
				}
				done++;
				notice.setMessage(`kuromoji辞書をダウンロード中… (${done}/${KUROMOJI_DICT_FILES.length})`);
			}
			return this.kuromojiDictDir;
		} catch (e) {
			throw new Error(
				'kuromoji辞書のダウンロードに失敗しました: ' +
					(e instanceof Error ? e.message : String(e))
			);
		} finally {
			notice.hide();
		}
	}
}
