import { promises as fs } from 'fs';
import * as path from 'path';
import * as iconv from 'iconv-lite';
import type LocalDictionaryPlugin from '../main';

/**
 * Index over 分類語彙表増補改訂版データベース (WLSP, NINJAL).
 *
 * CSV columns (Shift-JIS):
 *   0 レコードID  1 見出し番号  2 レコード種別  3 類  4 部門
 *   5 中項目  6 分類項目  7 分類番号  8 段落番号  9 小段落番号
 *   10 語番号  11 見出し  12 見出し本体  13 読み  14 逆読み
 *
 * Words sharing 分類番号+段落番号 form one semantic paragraph — closely
 * related words. That is the unit we present as a "related words" group.
 *
 * License: CC BY-NC-SA 3.0.
 * 出典: 国立国語研究所(2004)『分類語彙表増補改訂版データベース』(ver.1.0)
 */

export interface WlspGroup {
	/** e.g. "1.1000-01" (分類番号-段落番号) */
	key: string;
	/** 分類項目 label, e.g. "人物" */
	label: string;
	/** 類 (体/用/相/他) */
	category: string;
	words: string[];
}

export class WlspIndexer {
	plugin: LocalDictionaryPlugin;
	private groups = new Map<string, WlspGroup>();
	private wordIndex = new Map<string, Set<string>>();

	constructor(plugin: LocalDictionaryPlugin) {
		this.plugin = plugin;
	}

	private get indexPath(): string {
		return path.join(this.plugin.assets.assetsDir, '.wlsp-index.json');
	}

	isReady(): boolean {
		return this.groups.size > 0;
	}

	getStats(): { groups: number; words: number } {
		return { groups: this.groups.size, words: this.wordIndex.size };
	}

	private indexWord(word: string, key: string): void {
		let set = this.wordIndex.get(word);
		if (!set) {
			set = new Set();
			this.wordIndex.set(word, set);
		}
		set.add(key);
	}

	private rebuildWordIndex(): void {
		this.wordIndex = new Map();
		for (const group of this.groups.values()) {
			for (const w of group.words) this.indexWord(w, group.key);
		}
	}

	/** Parse bunruidb.txt (Shift-JIS CSV) and build (and persist) the index. */
	async buildIndex(sourcePath: string): Promise<void> {
		const buffer = await fs.readFile(sourcePath);
		const content = iconv.decode(buffer, 'shift_jis');
		const groups = new Map<string, WlspGroup>();

		for (const raw of content.split('\n')) {
			const line = raw.trim();
			if (!line) continue;
			const cols = line.split(',');
			if (cols.length < 13) continue;

			const bunrui = cols[7] ?? '';
			const paragraph = cols[8] ?? '';
			const word = (cols[12] ?? '').trim();
			if (!bunrui || !word) continue;

			const key = `${bunrui}-${paragraph}`;
			let group = groups.get(key);
			if (!group) {
				group = {
					key,
					label: cols[6] ?? '',
					category: cols[3] ?? '',
					words: [],
				};
				groups.set(key, group);
			}
			if (!group.words.includes(word)) {
				group.words.push(word);
			}
		}

		this.groups = groups;
		this.rebuildWordIndex();
		await this.saveIndex(sourcePath);
	}

	private async saveIndex(sourcePath: string): Promise<void> {
		const stat = await fs.stat(sourcePath);
		const data = {
			version: 1,
			sourceSize: stat.size,
			groups: Array.from(this.groups.values()),
		};
		await fs.mkdir(path.dirname(this.indexPath), { recursive: true });
		await fs.writeFile(this.indexPath, JSON.stringify(data));
	}

	/** Load a cached index, validating it against the current source file. */
	async loadIndex(sourcePath: string): Promise<boolean> {
		try {
			const [cacheRaw, stat] = await Promise.all([
				fs.readFile(this.indexPath, 'utf-8'),
				fs.stat(sourcePath),
			]);
			const data = JSON.parse(cacheRaw) as {
				sourceSize: number;
				groups: WlspGroup[];
			};
			if (data.sourceSize !== stat.size) {
				return false;
			}
			this.groups = new Map(data.groups.map((g) => [g.key, g]));
			this.rebuildWordIndex();
			return true;
		} catch {
			return false;
		}
	}

	search(keyword: string): WlspGroup[] {
		const keys = this.wordIndex.get(keyword.trim());
		if (!keys) return [];
		const results: WlspGroup[] = [];
		for (const key of keys) {
			const group = this.groups.get(key);
			if (group) results.push(group);
		}
		return results;
	}
}
