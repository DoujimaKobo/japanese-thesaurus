import { promises as fs } from 'fs';
import * as path from 'path';
import type LocalDictionaryPlugin from '../main';

/**
 * Index over the Sudachi synonym dictionary (synonyms.txt).
 *
 * File format (CSV, one word per line):
 *   groupId, taigen/yougen, expandCtrl, lexemeNo, formType,
 *   acronym, spellingVariant, field, headword, ,
 *
 * Words sharing a groupId are synonyms. Words sharing the same lexemeNo
 * within a group are merely spelling variants (表記ゆれ) of one lexeme.
 */

export interface SynonymWord {
	word: string;
	lexemeNo: number;
	/** 0 = representative, 1 = abbreviation, 2 = alternative spelling */
	variant: number;
}

export interface SynonymGroup {
	groupId: string;
	/** '体言' (nouns), '用言' (verbs/adjectives) or '' */
	pos: string;
	words: SynonymWord[];
}

/** One group, with words clustered by lexeme for display. */
export interface SudachiSynonymResult {
	groupId: string;
	pos: string;
	/** Each entry is one lexeme's spelling variants (representative first). */
	lexemes: string[][];
}

const POS_LABEL: Record<string, string> = { '1': '体言', '2': '用言' };

export class SudachiSynonymIndexer {
	plugin: LocalDictionaryPlugin;
	private groups = new Map<string, SynonymGroup>();
	private wordIndex = new Map<string, Set<string>>();

	constructor(plugin: LocalDictionaryPlugin) {
		this.plugin = plugin;
	}

	private get indexPath(): string {
		return path.join(this.plugin.assets.assetsDir, '.sudachi-synonyms-index.json');
	}

	isReady(): boolean {
		return this.groups.size > 0;
	}

	getStats(): { groups: number; words: number } {
		return { groups: this.groups.size, words: this.wordIndex.size };
	}

	private indexWord(word: string, groupId: string): void {
		const key = word.toLowerCase();
		let set = this.wordIndex.get(key);
		if (!set) {
			set = new Set();
			this.wordIndex.set(key, set);
		}
		set.add(groupId);
	}

	/** Parse synonyms.txt and build (and persist) the index. */
	async buildIndex(sourcePath: string): Promise<void> {
		const content: string = await fs.readFile(sourcePath, 'utf-8');
		const groups = new Map<string, SynonymGroup>();

		for (const raw of content.split('\n')) {
			const line = raw.trim();
			if (!line) continue;
			const parts = line.split(',');
			if (parts.length < 9) continue;

			const groupId = parts[0] ?? '';
			const word = (parts[8] ?? '').trim();
			if (!groupId || !word) continue;

			const entry: SynonymWord = {
				word,
				lexemeNo: parseInt(parts[3] ?? '', 10) || 0,
				variant: parseInt(parts[6] ?? '', 10) || 0,
			};

			let group = groups.get(groupId);
			if (!group) {
				group = { groupId, pos: POS_LABEL[parts[1] ?? ''] ?? '', words: [] };
				groups.set(groupId, group);
			}
			group.words.push(entry);
		}

		this.groups = groups;
		this.wordIndex = new Map();
		for (const group of groups.values()) {
			for (const w of group.words) this.indexWord(w.word, group.groupId);
		}

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
				groups: SynonymGroup[];
			};
			// Validate by size only: mtime is unreliable on synced drives
			// (e.g. Google Drive) and the source is a pinned download.
			if (data.sourceSize !== stat.size) {
				return false;
			}
			this.groups = new Map(data.groups.map((g) => [g.groupId, g]));
			this.wordIndex = new Map();
			for (const group of this.groups.values()) {
				for (const w of group.words) this.indexWord(w.word, group.groupId);
			}
			return true;
		} catch {
			return false;
		}
	}

	search(keyword: string): SudachiSynonymResult[] {
		const key = keyword.toLowerCase().trim();
		const groupIds = this.wordIndex.get(key);
		if (!groupIds) return [];

		const results: SudachiSynonymResult[] = [];
		for (const groupId of groupIds) {
			const group = this.groups.get(groupId);
			if (!group) continue;

			// Cluster words by lexeme so spelling variants stay together.
			const byLexeme = new Map<number, SynonymWord[]>();
			for (const w of group.words) {
				let arr = byLexeme.get(w.lexemeNo);
				if (!arr) {
					arr = [];
					byLexeme.set(w.lexemeNo, arr);
				}
				arr.push(w);
			}
			const lexemes = Array.from(byLexeme.values()).map((words) =>
				words
					.slice()
					.sort((a, b) => a.variant - b.variant)
					.map((w) => w.word)
			);
			results.push({ groupId, pos: group.pos, lexemes });
		}
		return results;
	}
}
