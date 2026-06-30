import { ItemView, WorkspaceLeaf } from 'obsidian';
import type LocalDictionaryPlugin from './main';
import type { ThesaurusSearchResult } from './thesaurusIndexer';

export const THESAURUS_VIEW_TYPE = 'thesaurus-view';

export class ThesaurusView extends ItemView {
	plugin: LocalDictionaryPlugin;
	private currentKeyword: string = '';
	private currentResults: ThesaurusSearchResult[] = [];

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
		const container = this.containerEl.children[1];
		if (container instanceof HTMLElement) {
			container.empty();
			container.addClass('thesaurus-view');

			// Show welcome message initially
			this.renderWelcome(container);
		}
	}

	async onClose(): Promise<void> {
		// Cleanup if needed
	}

	/**
	 * Render welcome/empty state
	 */
	private renderWelcome(container: HTMLElement): void {
		container.empty();

		const welcomeDiv = container.createDiv({ cls: 'thesaurus-welcome' });
		welcomeDiv.createEl('h3', { text: '類語辞典 (Thesaurus)' });
		welcomeDiv.createEl('p', {
			text: 'テキストを選択して右クリックで類語を検索できます',
			cls: 'thesaurus-help-text'
		});

		const stats = this.plugin.thesaurusIndexer.getStats();
		if (stats.synsets > 0) {
			const statsDiv = welcomeDiv.createDiv({ cls: 'thesaurus-stats' });
			statsDiv.createEl('p', {
				text: `📚 ${stats.synsets.toLocaleString()} 意義素`
			});
			statsDiv.createEl('p', {
				text: `🔑 ${stats.words.toLocaleString()} 語彙`
			});
		} else {
			welcomeDiv.createEl('p', {
				text: '⚠️ インデックスが見つかりません。設定でインデックスを再構築してください。',
				cls: 'thesaurus-warning'
			});
		}
	}

	/**
	 * Search and display results
	 */
	async searchAndDisplay(keyword: string): Promise<void> {
		this.currentKeyword = keyword;

		const container = this.containerEl.children[1];
		if (!(container instanceof HTMLElement)) {
			return;
		}

		container.empty();
		container.addClass('thesaurus-view');

		// Show loading state
		const loadingDiv = container.createDiv({ cls: 'thesaurus-loading' });
		loadingDiv.createEl('p', { text: `検索中: ${keyword}...` });

		try {
			// Perform search
			const results = await this.plugin.thesaurusIndexer.search(keyword);
			this.currentResults = results;

			// Clear loading and render results
			container.empty();
			this.renderResults(container);

		} catch (e) {
			const errorMessage = e instanceof Error ? e.message : String(e);
			container.empty();
			this.renderError(container, errorMessage);
		}
	}

	/**
	 * Render search results
	 */
	private renderResults(container: HTMLElement): void {
		const resultsDiv = container.createDiv({ cls: 'thesaurus-results' });

		// Header with keyword
		const headerDiv = resultsDiv.createDiv({ cls: 'thesaurus-header' });
		headerDiv.createEl('h3', { text: `🔍 ${this.currentKeyword}` });

		if (this.currentResults.length === 0) {
			const noResultsDiv = resultsDiv.createDiv({ cls: 'thesaurus-no-results' });
			noResultsDiv.createEl('p', {
				text: `「${this.currentKeyword}」の類語が見つかりませんでした`
			});
			noResultsDiv.createEl('p', {
				text: '別の単語や表現で試してください。',
				cls: 'thesaurus-help-text'
			});
			return;
		}

		// Results count
		const countDiv = resultsDiv.createDiv({ cls: 'thesaurus-count' });
		countDiv.createEl('p', {
			text: `${this.currentResults.length} 件の意義素を発見`
		});

		// Display each synset
		this.currentResults.forEach((result, index) => {
			const synsetDiv = resultsDiv.createDiv({ cls: 'thesaurus-synset' });

			// Match type indicator
			if (result.matchType === 'definition') {
				const matchTypeDiv = synsetDiv.createDiv({ cls: 'thesaurus-match-type' });
				matchTypeDiv.createEl('span', {
					text: '定義文からの検索',
					cls: 'thesaurus-match-label'
				});
			}

			// Synset ID (small, grayed out)
			const synsetIdDiv = synsetDiv.createDiv({ cls: 'thesaurus-synset-id' });
			synsetIdDiv.createEl('small', { text: `ID: ${result.synset.synsetId}` });

			// Words (synonyms)
			if (result.synset.words.length > 0) {
				const wordsDiv = synsetDiv.createDiv({ cls: 'thesaurus-words' });
				wordsDiv.createEl('strong', { text: '類語: ' });

				const wordsListDiv = wordsDiv.createDiv({ cls: 'thesaurus-words-list' });
				result.synset.words.forEach((word, wordIndex) => {
					const wordSpan = wordsListDiv.createEl('span', {
						text: word,
						cls: 'thesaurus-word'
					});

					// Highlight if this is the searched word
					if (word.toLowerCase() === this.currentKeyword.toLowerCase()) {
						wordSpan.addClass('thesaurus-word-highlight');
					}

					// Add clickable behavior to search for this word
					wordSpan.addEventListener('click', () => {
						this.searchAndDisplay(word);
					});

					// Add separator
					if (wordIndex < result.synset.words.length - 1) {
						wordsListDiv.createEl('span', { text: ' • ', cls: 'thesaurus-separator' });
					}
				});
			}

			// Definitions
			if (result.synset.definitions.length > 0) {
				const defsDiv = synsetDiv.createDiv({ cls: 'thesaurus-definitions' });

				result.synset.definitions.forEach((def, defIndex) => {
					const defDiv = defsDiv.createDiv({ cls: 'thesaurus-definition' });

					// Japanese definition
					const jpDefDiv = defDiv.createDiv({ cls: 'thesaurus-def-ja' });
					jpDefDiv.createEl('span', {
						text: `📝 ${def.japanese}`,
						cls: 'thesaurus-def-text'
					});

					// English definition (collapsible details)
					if (def.english) {
						const enDefDiv = defDiv.createDiv({ cls: 'thesaurus-def-en' });
						enDefDiv.createEl('small', {
							text: def.english,
							cls: 'thesaurus-def-en-text'
						});
					}
				});
			}

			// Add separator between synsets (except last one)
			if (index < this.currentResults.length - 1) {
				resultsDiv.createEl('hr', { cls: 'thesaurus-separator-line' });
			}
		});

		// Add a "back to welcome" button
		const footerDiv = resultsDiv.createDiv({ cls: 'thesaurus-footer' });
		const backButton = footerDiv.createEl('button', {
			text: '← 戻る',
			cls: 'thesaurus-back-button'
		});
		backButton.addEventListener('click', () => {
			this.renderWelcome(container);
		});
	}

	/**
	 * Render error state
	 */
	private renderError(container: HTMLElement, errorMessage: string): void {
		const errorDiv = container.createDiv({ cls: 'thesaurus-error' });
		errorDiv.createEl('h3', { text: '⚠️ エラー' });
		errorDiv.createEl('p', { text: errorMessage });

		const helpText = errorDiv.createEl('p', {
			cls: 'thesaurus-help-text'
		});
		helpText.setText('設定を確認して、インデックスが構築されているか確認してください。');
	}
}
