import { ItemView, WorkspaceLeaf } from 'obsidian';
import type LocalDictionaryPlugin from '../main';
import type { ThesaurusSearchResult } from './wordnetIndexer';
import type { SudachiSynonymResult } from './sudachiSynonyms';

export const THESAURUS_VIEW_TYPE = 'thesaurus-view';

interface TermResult {
	term: string;
	sudachi: SudachiSynonymResult[];
	wordnet: ThesaurusSearchResult[];
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
			stats.createEl('p', {
				text: `🟢 WordNet: ${wn.synsets.toLocaleString()} 意義素`,
			});
		} else {
			stats.createEl('p', {
				text: '⚪ 日本語WordNet: 未読み込み（任意・設定でファイルを指定）',
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
		return { term, sudachi, wordnet };
	}

	/**
	 * Look up the whole selection first. Only if that finds nothing do we pay
	 * to tokenize (which may download the kuromoji dictionary) and try the
	 * content words it contains.
	 */
	private async collectResults(keyword: string): Promise<TermResult[]> {
		const whole = await this.searchTerm(keyword);
		if (whole.sudachi.length || whole.wordnet.length) return [whole];

		const terms = await this.plugin.tokenizer.lookupTerms(keyword);
		const results: TermResult[] = [];
		for (const term of terms) {
			if (term === keyword) continue;
			const r = await this.searchTerm(term);
			if (r.sudachi.length || r.wordnet.length) results.push(r);
		}
		return results.length ? results : [whole];
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

		const hasAny = terms.some((t) => t.sudachi.length || t.wordnet.length);
		if (!hasAny) {
			const none = root.createDiv({ cls: 'thesaurus-no-results' });
			none.createEl('p', { text: `「${keyword}」の類語が見つかりませんでした。` });
			none.createEl('p', {
				text: '別の語や、活用していない形でお試しください。',
				cls: 'thesaurus-help-text',
			});
			return;
		}

		for (const term of terms) {
			if (!term.sudachi.length && !term.wordnet.length) continue;
			if (terms.length > 1) {
				root.createEl('h4', {
					text: `▸ ${term.term}`,
					cls: 'thesaurus-term-heading',
				});
			}
			if (term.sudachi.length) this.renderSudachi(root, term.sudachi, keyword);
			if (term.wordnet.length) this.renderWordNet(root, term.wordnet, keyword);
		}
	}

	private renderWord(
		parent: HTMLElement,
		word: string,
		keyword: string,
		isLast: boolean
	): void {
		const span = parent.createEl('span', { text: word, cls: 'thesaurus-word' });
		if (word.toLowerCase() === keyword.toLowerCase()) {
			span.addClass('thesaurus-word-highlight');
		}
		span.addEventListener('click', () => {
			void this.searchAndDisplay(word);
		});
		if (!isLast) {
			parent.createEl('span', { text: ' ・ ', cls: 'thesaurus-separator' });
		}
	}

	private renderSudachi(
		root: HTMLElement,
		results: SudachiSynonymResult[],
		keyword: string
	): void {
		const section = root.createDiv({ cls: 'thesaurus-section' });
		section.createEl('div', { text: 'Sudachi 同義語', cls: 'thesaurus-source-label' });

		results.forEach((group) => {
			const groupDiv = section.createDiv({ cls: 'thesaurus-synset' });
			if (group.pos) {
				groupDiv.createEl('small', { text: group.pos, cls: 'thesaurus-pos' });
			}
			const wordsDiv = groupDiv.createDiv({ cls: 'thesaurus-words-list' });
			const flat = group.lexemes.flat();
			flat.forEach((word, i) =>
				this.renderWord(wordsDiv, word, keyword, i === flat.length - 1)
			);
		});
	}

	private renderWordNet(
		root: HTMLElement,
		results: ThesaurusSearchResult[],
		keyword: string
	): void {
		const section = root.createDiv({ cls: 'thesaurus-section' });
		section.createEl('div', { text: '日本語 WordNet', cls: 'thesaurus-source-label' });

		results.forEach((result) => {
			const synsetDiv = section.createDiv({ cls: 'thesaurus-synset' });
			if (result.matchType === 'definition') {
				synsetDiv.createEl('small', {
					text: '定義文からの一致',
					cls: 'thesaurus-match-label',
				});
			}
			if (result.synset.words.length) {
				const wordsDiv = synsetDiv.createDiv({ cls: 'thesaurus-words-list' });
				result.synset.words.forEach((word, i) =>
					this.renderWord(wordsDiv, word, keyword, i === result.synset.words.length - 1)
				);
			}
			result.synset.definitions.forEach((def) => {
				const defDiv = synsetDiv.createDiv({ cls: 'thesaurus-definition' });
				defDiv.createEl('span', { text: `📝 ${def.japanese}`, cls: 'thesaurus-def-text' });
				if (def.english) {
					defDiv.createEl('small', { text: def.english, cls: 'thesaurus-def-en-text' });
				}
			});
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
