import { ItemView, WorkspaceLeaf } from 'obsidian';
import type LocalDictionaryPlugin from '../main';

export const DICTIONARY_VIEW_TYPE = 'local-dictionary-view';

export class DictionaryView extends ItemView {
	plugin: LocalDictionaryPlugin;
	private currentKeyword: string = '';
	private currentResults: string[] = [];

	constructor(leaf: WorkspaceLeaf, plugin: LocalDictionaryPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return DICTIONARY_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Local Dictionary';
	}

	getIcon(): string {
		return 'book-open';
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1];
		if (container instanceof HTMLElement) {
			container.empty();
			container.addClass('local-dictionary-view');

			// Show welcome message initially
			this.renderWelcome(container);
		}
	}

	async onClose(): Promise<void> {
		// Cleanup if needed
	}

	/** Re-render the welcome/status screen (e.g. after indexes finish loading). */
	refresh(): void {
		const container = this.containerEl.children[1];
		if (container instanceof HTMLElement) {
			container.addClass('local-dictionary-view');
			this.renderWelcome(container);
		}
	}

	/**
	 * Render welcome/empty state
	 */
	private renderWelcome(container: HTMLElement): void {
		container.empty();

		const welcomeDiv = container.createDiv({ cls: 'dictionary-welcome' });
		welcomeDiv.createEl('h3', { text: 'Local Dictionary' });
		welcomeDiv.createEl('p', {
			text: 'Select text and right-click to search in the dictionary.',
			cls: 'dictionary-help-text'
		});

		const stats = this.plugin.indexer.getStats();
		if (stats.entries > 0) {
			const statsDiv = welcomeDiv.createDiv({ cls: 'dictionary-stats' });
			statsDiv.createEl('p', {
				text: `📚 ${stats.entries.toLocaleString()} entries indexed`
			});
			statsDiv.createEl('p', {
				text: `🔑 ${stats.keywords.toLocaleString()} unique keywords`
			});
		} else {
			welcomeDiv.createEl('p', {
				text: '⚠️ No index found. Please configure dictionary path and rebuild index in settings.',
				cls: 'dictionary-warning'
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
		container.addClass('local-dictionary-view');

		// Show loading state
		const loadingDiv = container.createDiv({ cls: 'dictionary-loading' });
		loadingDiv.createEl('p', { text: `Searching for: ${keyword}...` });

		try {
			// Perform search
			const results = await this.plugin.indexer.search(keyword);
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
		const resultsDiv = container.createDiv({ cls: 'dictionary-results' });

		// Header with keyword
		const headerDiv = resultsDiv.createDiv({ cls: 'dictionary-header' });
		headerDiv.createEl('h3', { text: `🔍 ${this.currentKeyword}` });

		if (this.currentResults.length === 0) {
			const noResultsDiv = resultsDiv.createDiv({ cls: 'dictionary-no-results' });
			noResultsDiv.createEl('p', {
				text: `No entries found for "${this.currentKeyword}"`
			});
			noResultsDiv.createEl('p', {
				text: 'Try checking the spelling or using a different form of the word.',
				cls: 'dictionary-help-text'
			});
			return;
		}

		// Results count
		const countDiv = resultsDiv.createDiv({ cls: 'dictionary-count' });
		countDiv.createEl('p', {
			text: `${this.currentResults.length} ${this.currentResults.length === 1 ? 'entry' : 'entries'} found`
		});

		// Display each result
		this.currentResults.forEach((result, index) => {
			const entryDiv = resultsDiv.createDiv({ cls: 'dictionary-entry' });

			// Parse the entry: ■Keyword : Definition
			const match = result.match(/^■(.+?)\s*[:：]\s*(.+)/);

			if (match && match[1] && match[2]) {
				const keyword = match[1].trim();
				const definition = match[2].trim();

				// Keyword
				const keywordEl = entryDiv.createDiv({ cls: 'dictionary-keyword' });
				keywordEl.createEl('strong', { text: keyword });

				// Definition
				const definitionEl = entryDiv.createDiv({ cls: 'dictionary-definition' });
				definitionEl.setText(definition);
			} else {
				// Fallback: display raw entry if format doesn't match
				entryDiv.setText(result);
			}

			// Add separator between entries (except last one)
			if (index < this.currentResults.length - 1) {
				resultsDiv.createEl('hr', { cls: 'dictionary-separator' });
			}
		});

		// Add a "back to welcome" button
		const footerDiv = resultsDiv.createDiv({ cls: 'dictionary-footer' });
		const backButton = footerDiv.createEl('button', {
			text: '← Back',
			cls: 'dictionary-back-button'
		});
		backButton.addEventListener('click', () => {
			this.renderWelcome(container);
		});
	}

	/**
	 * Render error state
	 */
	private renderError(container: HTMLElement, errorMessage: string): void {
		const errorDiv = container.createDiv({ cls: 'dictionary-error' });
		errorDiv.createEl('h3', { text: '⚠️ Error' });
		errorDiv.createEl('p', { text: errorMessage });

		const helpText = errorDiv.createEl('p', {
			cls: 'dictionary-help-text'
		});
		helpText.setText('Please check your dictionary settings and ensure the index is built.');
	}
}
