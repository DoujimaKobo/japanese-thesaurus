import * as kuromoji from 'kuromoji';
import type LocalDictionaryPlugin from './main';

// Parts of speech we treat as meaningful "content words" worth looking up.
const CONTENT_POS = new Set(['名詞', '動詞', '形容詞', '副詞']);

/**
 * Lazy wrapper around kuromoji. The (multi-megabyte) dictionary is only
 * downloaded and the tokenizer only built the first time it is actually
 * needed, so single-word lookups never pay the cost.
 */
export class Tokenizer {
	plugin: LocalDictionaryPlugin;
	private tokenizer: kuromoji.Tokenizer<kuromoji.IpadicFeatures> | null = null;
	private building: Promise<void> | null = null;

	constructor(plugin: LocalDictionaryPlugin) {
		this.plugin = plugin;
	}

	/** Build the tokenizer once; concurrent callers share the same promise. */
	private async ensureReady(): Promise<void> {
		if (this.tokenizer) return;
		if (!this.building) {
			this.building = (async () => {
				const dicPath = await this.plugin.assets.ensureKuromojiDict();
				this.tokenizer = await new Promise((resolve, reject) => {
					kuromoji.builder({ dicPath }).build((err, t) => {
						if (err) reject(err);
						else resolve(t);
					});
				});
			})();
		}
		await this.building;
	}

	/**
	 * Split a selection into candidate lookup terms: the dictionary form of
	 * each content word, plus the trimmed whole selection (deduplicated, order
	 * preserved). Useful when the user selects a phrase rather than one word.
	 */
	async lookupTerms(text: string): Promise<string[]> {
		const whole = text.trim();
		const terms: string[] = [];
		const seen = new Set<string>();
		const add = (t: string) => {
			const v = t.trim();
			if (v && !seen.has(v)) {
				seen.add(v);
				terms.push(v);
			}
		};

		if (whole) add(whole);

		try {
			await this.ensureReady();
			const tokens = this.tokenizer!.tokenize(whole);
			for (const tok of tokens) {
				if (CONTENT_POS.has(tok.pos)) {
					const base =
						tok.basic_form && tok.basic_form !== '*'
							? tok.basic_form
							: tok.surface_form;
					add(base);
				}
			}
		} catch (e) {
			// If tokenization fails, fall back to whole-selection lookup only.
			console.error('kuromoji tokenize failed:', e);
		}

		return terms;
	}
}
