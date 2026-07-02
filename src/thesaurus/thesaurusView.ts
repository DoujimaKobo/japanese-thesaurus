import { ItemView, WorkspaceLeaf } from 'obsidian';
import type LocalDictionaryPlugin from '../main';
import type { ThesaurusSearchResult } from './wordnetIndexer';
import type { SudachiSynonymResult } from './sudachiSynonyms';
import type { WlspGroup } from './wlsp';

export const THESAURUS_VIEW_TYPE = 'thesaurus-view';

// Selections longer than this (or containing punctuation/whitespace) are
// treated as phrases and tokenized instead of being looked up verbatim.
// NB: \s already matches the ideographic space U+3000 in JS regexes.
const PHRASE_RE = /[\s、。，．・！？!?「」『』（）()]/;
const PHRASE_LENGTH = 8;

interface TermResult {
	term: string;
	sudachi: SudachiSynonymResult[];
	wordnet: ThesaurusSearchResult[];
	wlsp: WlspGroup[];
}

export class ThesaurusView extends ItemView {
	plugin: LocalDictionaryPlugin;

	constructor(leaf: WorkspaceLeaf, plugin: LocalDictionaryPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return THESAURUS_VIEW_TYPE;
	}

	getDisplayText(): string {
		return '類語辞典 (Thesaurus)';
	}

	getIcon(): string {
		return 'network';
	}

	async onOpen(): Promise<void> {
		this.renderWelcome();
	}

	async onClose(): Promise<void> {
		// no-op
	}

	/** Re-render the welcome/status screen (e.g. after indexes finish loading). */
	refresh(): void {
		this.renderWelcome();
	}

	private get body(): HTMLElement | null {
		const el = this.containerEl.children[1];
		return el instanceof HTMLElement ? el : null;
	}

	private renderWelcome(): void {
		const container = this.body;
		if (!container) return;
		container.empty();
		container.addClass('thesaurus-view');

		const welcome = container.createDiv({ cls: 'thesaurus-welcome' });
		welcome.createEl('h3', { text: '類語辞典 (Thesaurus)' });
		welcome.createEl('p', {
			text: 'テキストを選択して右クリック →「類語を検索」で表示します。',
			cls: 'thesaurus-help-text',
		});

		const stats = welcome.createDiv({ cls: 'thesaurus-stats' });
		const sudachi = this.plugin.sudachiSynonyms.getStats();
		if (sudachi.groups > 0) {
			stats.createEl('p', {
				text: `🟢 Sudachi同義語: ${sudachi.groups.toLocaleString()} グループ / ${sudachi.words.toLocaleString()} 語`,
			});
		} else {
			stats.createEl('p', {
				text: '⚪ Sudachi同義語辞書: 未読み込み（設定で有効化してください）',
				cls: 'thesaurus-warning',
			});
		}
		const wn = this.plugin.wordnetIndexer.getStats();
		if (wn.synsets > 0) {
			const expanded = this.plugin.wordnetIndexer.relationsReady() ? '（広めモード）' : '';
			stats.createEl('p', {
				text: `🟢 WordNet: ${wn.synsets.toLocaleString()} 意義素${expanded}`,
			});
		} else {
			stats.createEl('p', {
				text: '⚪ 日本語WordNet: 未読み込み（任意・設定でファイルを指定）',
				cls: 'thesaurus-help-text',
			});
		}
		const wlsp = this.plugin.wlsp.getStats();
		if (wlsp.groups > 0) {
			stats.createEl('p', {
				text: `🟢 分類語彙表: ${wlsp.groups.toLocaleString()} グループ / ${wlsp.words.toLocaleString()} 語`,
			});
		} else {
			stats.createEl('p', {
				text: '⚪ 分類語彙表: 未読み込み（任意・設定で有効化）',
				cls: 'thesaurus-help-text',
			});
		}
	}

	async searchAndDisplay(rawText: string): Promise<void> {
		const keyword = rawText.trim();
		const container = this.body;
		if (!container || !keyword) return;

		container.empty();
		container.addClass('thesaurus-view');
		container.createDiv({ cls: 'thesaurus-loading' }).createEl('p', {
			text: `検索中: ${keyword}…`,
		});

		try {
			const terms = await this.collectResults(keyword);
			container.empty();
			this.renderResults(container, keyword, terms);
		} catch (e) {
			container.empty();
			this.renderError(container, e instanceof Error ? e.message : String(e));
		}
	}

	private async searchTerm(term: string): Promise<TermResult> {
		const sudachi = this.plugin.sudachiSynonyms.isReady()
			? this.plugin.sudachiSynonyms.search(term)
			: [];
		const wordnet = this.plugin.wordnetIndexer.isReady()
			? await this.plugin.wordnetIndexer.search(term)
			: [];
		const wlsp = this.plugin.wlsp.isReady() ? this.plugin.wlsp.search(term) : [];
		return { term, sudachi, wordnet, wlsp };
	}

	private hasHits(r: TermResult): boolean {
		return r.sudachi.length > 0 || r.wordnet.length > 0 || r.wlsp.length > 0;
	}

	/**
	 * Short selections are looked up verbatim first. Phrases (whitespace,
	 * punctuation, or simply long) go straight to tokenization: looking a
	 * whole sentence up verbatim only produces noisy partial matches, and
	 * per-word results are far easier to interpret.
	 */
	private async collectResults(keyword: string): Promise<TermResult[]> {
		const isPhrase = keyword.length > PHRASE_LENGTH || PHRASE_RE.test(keyword);

		if (!isPhrase) {
			const whole = await this.searchTerm(keyword);
			if (this.hasHits(whole)) return [whole];
		}

		const terms = await this.plugin.tokenizer.lookupTerms(keyword);
		const results: TermResult[] = [];
		for (const term of terms) {
			if (term === keyword && isPhrase) continue;
			const r = await this.searchTerm(term);
			if (this.hasHits(r)) results.push(r);
		}
		if (results.length) return results;
		return [await this.searchTerm(keyword)];
	}

	private renderResults(
		container: HTMLElement,
		keyword: string,
		terms: TermResult[]
	): void {
		const root = container.createDiv({ cls: 'thesaurus-results' });
		root.createDiv({ cls: 'thesaurus-header' }).createEl('h3', {
			text: `🔍 ${keyword}`,
		});

		const sudachiReady = this.plugin.sudachiSynonyms.isReady();
		const wordnetReady = this.plugin.wordnetIndexer.isReady();
		const wlspReady = this.plugin.wlsp.isReady();

		if (!sudachiReady && !wordnetReady && !wlspReady) {
			const none = root.createDiv({ cls: 'thesaurus-no-results' });
			none.createEl('p', { text: '類語データが読み込まれていません。' });
			none.createEl('p', {
				text: '設定でSudachi同義語辞書などを有効化してください。',
				cls: 'thesaurus-help-text',
			});
			return;
		}

		const single = terms.length === 1;
		if (single && !this.hasHits(terms[0]!)) {
			root.createDiv({ cls: 'thesaurus-no-results' }).createEl('p', {
				text: `「${keyword}」の類語が見つかりませんでした。`,
			});
		}
		for (const term of terms) {
			if (single) {
				// Single word: always show each enabled source (with 該当なし),
				// so it's clear every source was consulted.
				if (sudachiReady) this.renderSudachi(root, term.sudachi, term.term, true);
				if (wordnetReady) this.renderWordNet(root, term.wordnet, term.term, true);
				if (wlspReady) this.renderWlsp(root, term.wlsp, term.term, true);
			} else {
				// Long/multi-word selection: group under the matched word so it's
				// obvious what each result came from; skip sources with no hits.
				root.createEl('h4', {
					text: `▸ ${term.term}`,
					cls: 'thesaurus-term-heading',
				});
				if (term.sudachi.length) this.renderSudachi(root, term.sudachi, term.term, false);
				if (term.wordnet.length) this.renderWordNet(root, term.wordnet, term.term, false);
				if (term.wlsp.length) this.renderWlsp(root, term.wlsp, term.term, false);
			}
		}
	}

	// Words are rendered as chips; spacing between them is handled by CSS, so
	// no textual separator is needed.
	private renderWord(parent: HTMLElement, word: string, keyword: string): void {
		const span = parent.createEl('span', { text: word, cls: 'thesaurus-word' });
		if (word.toLowerCase() === keyword.toLowerCase()) {
			span.addClass('thesaurus-word-highlight');
		}
		span.addEventListener('click', () => {
			void this.searchAndDisplay(word);
		});
	}

	private renderSudachi(
		root: HTMLElement,
		results: SudachiSynonymResult[],
		highlight: string,
		showEmpty: boolean
	): void {
		const section = root.createDiv({ cls: 'thesaurus-section' });
		section.createEl('div', { text: 'Sudachi 同義語', cls: 'thesaurus-source-label' });

		if (!results.length) {
			if (showEmpty) section.createEl('p', { text: '該当なし', cls: 'thesaurus-empty' });
			return;
		}

		results.forEach((group) => {
			const groupDiv = section.createDiv({ cls: 'thesaurus-synset' });
			if (group.pos) {
				groupDiv.createEl('small', { text: group.pos, cls: 'thesaurus-pos' });
			}
			const wordsDiv = groupDiv.createDiv({ cls: 'thesaurus-words-list' });
			group.lexemes.flat().forEach((word) => this.renderWord(wordsDiv, word, highlight));
		});
	}

	private renderWordNet(
		root: HTMLElement,
		results: ThesaurusSearchResult[],
		highlight: string,
		showEmpty: boolean
	): void {
		const section = root.createDiv({ cls: 'thesaurus-section' });
		section.createEl('div', { text: '日本語 WordNet', cls: 'thesaurus-source-label' });

		if (!results.length) {
			if (showEmpty) section.createEl('p', { text: '該当なし', cls: 'thesaurus-empty' });
			return;
		}

		const showEnglish = this.plugin.settings.showEnglishDefinitions;
		const expanded =
			this.plugin.settings.wordnetExpanded &&
			this.plugin.wordnetIndexer.relationsReady();

		results.forEach((result) => {
			const synsetDiv = section.createDiv({ cls: 'thesaurus-synset' });
			// Say why this synset matched when it wasn't a direct word hit.
			if (result.matchType === 'definition') {
				synsetDiv.createEl('small', {
					text: `定義文に「${result.matchedText}」を含む`,
					cls: 'thesaurus-match-label',
				});
			}
			// Meaning (definition) first, synonyms below.
			result.synset.definitions.forEach((def) => {
				const defDiv = synsetDiv.createDiv({ cls: 'thesaurus-definition' });
				defDiv.createEl('span', { text: `📝 ${def.japanese}`, cls: 'thesaurus-def-text' });
				if (showEnglish && def.english) {
					defDiv.createEl('small', { text: def.english, cls: 'thesaurus-def-en-text' });
				}
			});
			if (result.synset.words.length) {
				const wordsDiv = synsetDiv.createDiv({ cls: 'thesaurus-words-list' });
				result.synset.words.forEach((word) => this.renderWord(wordsDiv, word, highlight));
			}
			// Expanded mode: similar / broader / narrower words of this synset.
			if (expanded) {
				for (const rel of this.plugin.wordnetIndexer.related(result.synset.synsetId)) {
					const relDiv = synsetDiv.createDiv({ cls: 'thesaurus-related' });
					relDiv.createEl('span', { text: `${rel.label}: `, cls: 'thesaurus-related-label' });
					rel.words.forEach((word) => this.renderWord(relDiv, word, highlight));
				}
			}
		});
	}

	private renderWlsp(
		root: HTMLElement,
		results: WlspGroup[],
		highlight: string,
		showEmpty: boolean
	): void {
		const section = root.createDiv({ cls: 'thesaurus-section' });
		section.createEl('div', { text: '分類語彙表', cls: 'thesaurus-source-label' });

		if (!results.length) {
			if (showEmpty) section.createEl('p', { text: '該当なし', cls: 'thesaurus-empty' });
			return;
		}

		const CAP = 40;
		results.forEach((group) => {
			const groupDiv = section.createDiv({ cls: 'thesaurus-synset' });
			if (group.label) {
				groupDiv.createEl('small', { text: group.label, cls: 'thesaurus-pos' });
			}
			const wordsDiv = groupDiv.createDiv({ cls: 'thesaurus-words-list' });
			group.words.slice(0, CAP).forEach((word) => this.renderWord(wordsDiv, word, highlight));
			if (group.words.length > CAP) {
				wordsDiv.createEl('span', {
					text: ` …ほか${group.words.length - CAP}語`,
					cls: 'thesaurus-empty',
				});
			}
		});
	}

	private renderError(container: HTMLElement, message: string): void {
		const err = container.createDiv({ cls: 'thesaurus-error' });
		err.createEl('h3', { text: '⚠️ エラー' });
		err.createEl('p', { text: message });
		err.createEl('p', {
			text: '設定でデータが読み込まれているか確認してください。',
			cls: 'thesaurus-help-text',
		});
	}
}
