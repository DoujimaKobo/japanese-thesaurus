import { promises as fs, createReadStream } from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import type LocalDictionaryPlugin from '../main';

export interface ThesaurusSynset {
	synsetId: string;
	words: string[];
	definitions: ThesaurusDefinition[];
}

export interface ThesaurusDefinition {
	japanese: string;
	english: string;
}

export interface ThesaurusSearchResult {
	synset: ThesaurusSynset;
	matchType: 'word' | 'definition';
	matchedText: string;
}

/** Related words of one synset, grouped by relation type. */
export interface RelatedWords {
	/** Japanese label, e.g. "近い意味" */
	label: string;
	words: string[];
}

const LINK_LABELS: Record<string, string> = {
	sim: '近い意味',
	also: '関連',
	hype: 'より広い語',
	hypo: 'より狭い語',
};

// Display order and per-type caps (hypo lists can be huge).
const LINK_ORDER: [string, number][] = [
	['sim', 20],
	['also', 20],
	['hype', 10],
	['hypo', 20],
];

export class WordNetIndexer {
	plugin: LocalDictionaryPlugin;
	indexPath: string;

	// Maps: word/definition text -> synset IDs
	wordIndex: Map<string, Set<string>>;
	// Maps: synset ID -> synset data
	synsetData: Map<string, ThesaurusSynset>;
	// Maps: synset ID -> [link type, target synset ID] (expanded mode)
	relations: Map<string, [string, string][]> = new Map();

	constructor(plugin: LocalDictionaryPlugin) {
		this.plugin = plugin;
		this.wordIndex = new Map();
		this.synsetData = new Map();

		// Store the generated index alongside the plugin's other cached assets.
		this.indexPath = path.join(plugin.assets.assetsDir, '.wordnet-index.json');
	}

	/**
	 * Build thesaurus index from WordNet TSV files
	 */
	async buildIndex(wordsPath: string, defsPath: string): Promise<void> {
		console.debug('Building thesaurus index...');

		const newWordIndex = new Map<string, Set<string>>();
		const newSynsetData = new Map<string, ThesaurusSynset>();

		// Step 1: Parse words file
		console.debug('Parsing words file...');
		const wordsStream = createReadStream(wordsPath, { encoding: 'utf-8' });
		const wordsReader = readline.createInterface({
			input: wordsStream,
			crlfDelay: Infinity
		});

		let wordCount = 0;
		for await (const line of wordsReader) {
			const parts = line.split('\t');
			if (parts.length >= 2) {
				const synsetId = parts[0] ?? '';
				const word = parts[1] ?? '';
				if (!synsetId || !word) continue;

				// Add to synset data
				if (!newSynsetData.has(synsetId)) {
					newSynsetData.set(synsetId, {
						synsetId,
						words: [],
						definitions: []
					});
				}
				const synset = newSynsetData.get(synsetId);
				if (synset && !synset.words.includes(word)) {
					synset.words.push(word);
				}

				// Add to word index
				const wordLower = word.toLowerCase();
				if (!newWordIndex.has(wordLower)) {
					newWordIndex.set(wordLower, new Set());
				}
				const wordSynsets = newWordIndex.get(wordLower);
				if (wordSynsets) {
					wordSynsets.add(synsetId);
				}

				wordCount++;
				if (wordCount % 10000 === 0) {
					console.debug(`Processed ${wordCount} words...`);
				}
			}
		}
		console.debug(`Total words processed: ${wordCount}`);

		// Step 2: Parse definitions file
		console.debug('Parsing definitions file...');
		const defsStream = createReadStream(defsPath, { encoding: 'utf-8' });
		const defsReader = readline.createInterface({
			input: defsStream,
			crlfDelay: Infinity
		});

		let defCount = 0;
		for await (const line of defsReader) {
			const parts = line.split('\t');
			if (parts.length >= 4) {
				const synsetId = parts[0] ?? '';
				const english = parts[2] ?? '';
				const japanese = parts[3] ?? '';
				if (!synsetId || !japanese) continue;

				// Add to synset data
				if (!newSynsetData.has(synsetId)) {
					newSynsetData.set(synsetId, {
						synsetId,
						words: [],
						definitions: []
					});
				}
				const synset = newSynsetData.get(synsetId);
				if (synset) {
					synset.definitions.push({ japanese, english });
				}

				defCount++;
				if (defCount % 10000 === 0) {
					console.debug(`Processed ${defCount} definitions...`);
				}
			}
		}
		console.debug(`Total definitions processed: ${defCount}`);

		// Save index to disk
		console.debug('Saving index...');
		const indexData = {
			version: 2,
			wordsPath,
			defsPath,
			synsetCount: newSynsetData.size,
			wordIndex: Array.from(newWordIndex.entries()).map(([word, synsets]) => [
				word,
				Array.from(synsets)
			]),
			synsetData: Array.from(newSynsetData.entries())
		};

		await fs.mkdir(path.dirname(this.indexPath), { recursive: true });
		await fs.writeFile(this.indexPath, JSON.stringify(indexData));

		this.wordIndex = newWordIndex;
		this.synsetData = newSynsetData;

		console.debug(`Index built: ${newSynsetData.size} synsets, ${wordCount} words, ${defCount} definitions`);
	}

	/**
	 * Load existing index from disk
	 */
	async loadIndex(): Promise<boolean> {
		try {
			const indexData = JSON.parse(
				await fs.readFile(this.indexPath, 'utf-8')
			) as {
				version?: number;
				wordIndex: [string, string[]][];
				synsetData: [string, ThesaurusSynset][];
				synsetCount: number;
			};

			// Old-format (definition-polluted) indexes must be rebuilt.
			if (indexData.version !== 2) {
				console.debug('WordNet index is an old format; needs rebuild.');
				return false;
			}

			// Reconstruct Maps
			this.wordIndex = new Map(
				indexData.wordIndex.map(([word, synsets]) => [word, new Set(synsets)])
			);
			this.synsetData = new Map(indexData.synsetData);

			console.debug(`Thesaurus index loaded: ${indexData.synsetCount} synsets`);
			return true;
		} catch (e) {
			const errorMessage = e instanceof Error ? e.message : String(e);
			console.debug('No existing thesaurus index found or load failed:', errorMessage);
			return false;
		}
	}

	/**
	 * Search for synonyms and related words
	 */
	async search(keyword: string): Promise<ThesaurusSearchResult[]> {
		if (this.wordIndex.size === 0) {
			throw new Error('Thesaurus index not loaded. Please rebuild index in settings.');
		}

		const keywordLower = keyword.toLowerCase().trim();
		const results: ThesaurusSearchResult[] = [];

		// Exact match on a synset member word (= a genuine synonym relation).
		const synsetIds = this.wordIndex.get(keywordLower);
		if (synsetIds) {
			for (const synsetId of synsetIds) {
				const synset = this.synsetData.get(synsetId);
				if (synset) {
					results.push({ synset, matchType: 'word', matchedText: keyword });
				}
			}
		}

		return results.slice(0, 20); // Limit to 20 results
	}

	/**
	 * Load the synset-relation table (TSV: synset1 \t link \t synset2) used
	 * by the expanded ("広め") thesaurus mode.
	 */
	async loadRelations(synlinkPath: string): Promise<void> {
		const content = await fs.readFile(synlinkPath, 'utf-8');
		const relations = new Map<string, [string, string][]>();
		for (const line of content.split('\n')) {
			const parts = line.split('\t');
			if (parts.length < 3) continue;
			const [s1, link, s2] = parts as [string, string, string];
			let arr = relations.get(s1);
			if (!arr) {
				arr = [];
				relations.set(s1, arr);
			}
			arr.push([link, s2.trim()]);
		}
		this.relations = relations;
		console.debug(`WordNet relations loaded: ${relations.size} synsets`);
	}

	relationsReady(): boolean {
		return this.relations.size > 0;
	}

	/**
	 * Japanese words related to a synset (similar / broader / narrower),
	 * grouped by relation type. Only returns words present in the loaded
	 * Japanese word data.
	 */
	related(synsetId: string): RelatedWords[] {
		const links = this.relations.get(synsetId);
		if (!links) return [];

		const byType = new Map<string, string[]>();
		for (const [link, target] of links) {
			const synset = this.synsetData.get(target);
			if (!synset || !synset.words.length) continue;
			let words = byType.get(link);
			if (!words) {
				words = [];
				byType.set(link, words);
			}
			for (const w of synset.words) {
				if (!words.includes(w)) words.push(w);
			}
		}

		const results: RelatedWords[] = [];
		for (const [link, cap] of LINK_ORDER) {
			const words = byType.get(link);
			if (words && words.length) {
				results.push({ label: LINK_LABELS[link] ?? link, words: words.slice(0, cap) });
			}
		}
		return results;
	}

	/**
	 * Check if index is ready
	 */
	isReady(): boolean {
		return this.synsetData.size > 0;
	}

	/**
	 * Get index statistics
	 */
	getStats(): { synsets: number; words: number } {
		let totalWords = 0;
		for (const synset of this.synsetData.values()) {
			totalWords += synset.words.length;
		}
		return {
			synsets: this.synsetData.size,
			words: totalWords
		};
	}
}
