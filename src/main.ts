import { Editor, MarkdownView, Menu, Notice, Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, DictionarySettings, DictionarySettingTab } from './settings';
import { DictionaryIndexer } from './indexer';
import { DictionaryView, DICTIONARY_VIEW_TYPE } from './dictionaryView';
import { ThesaurusIndexer } from './thesaurusIndexer';
import { ThesaurusView, THESAURUS_VIEW_TYPE } from './thesaurusView';

export default class LocalDictionaryPlugin extends Plugin {
	settings: DictionarySettings;
	indexer: DictionaryIndexer;
	thesaurusIndexer: ThesaurusIndexer;

	async onload() {
		await this.loadSettings();

		// Initialize indexers
		this.indexer = new DictionaryIndexer(this);
		this.thesaurusIndexer = new ThesaurusIndexer(this);

		// Register the dictionary view
		this.registerView(
			DICTIONARY_VIEW_TYPE,
			(leaf) => new DictionaryView(leaf, this)
		);

		// Register the thesaurus view
		this.registerView(
			THESAURUS_VIEW_TYPE,
			(leaf) => new ThesaurusView(leaf, this)
		);

		// Load existing indexes if available
		if (this.settings.dictionaryPath) {
			const loaded = await this.indexer.loadIndex();
			if (!loaded) {
				console.log('No valid dictionary index found. Please rebuild index in settings.');
			}
		}

		if (this.settings.thesaurusEnabled) {
			const loaded = await this.thesaurusIndexer.loadIndex();
			if (!loaded) {
				console.log('No valid thesaurus index found. Please rebuild index in settings.');
			}
		}

		// Add command to open dictionary view
		this.addCommand({
			id: 'open-dictionary-view',
			name: 'Open dictionary view',
			callback: () => {
				this.activateDictionaryView();
			}
		});

		// Add command to search selected text
		this.addCommand({
			id: 'search-selected-text',
			name: 'Search selected text in dictionary',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				const selectedText = editor.getSelection().trim();
				if (selectedText) {
					this.searchInDictionary(selectedText);
				} else {
					new Notice('Please select text to search');
				}
			}
		});

		// Add command to open thesaurus view
		this.addCommand({
			id: 'open-thesaurus-view',
			name: 'Open thesaurus view',
			callback: () => {
				this.activateThesaurusView();
			}
		});

		// Add command to search synonyms
		this.addCommand({
			id: 'search-synonyms',
			name: 'Search synonyms in thesaurus',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				const selectedText = editor.getSelection().trim();
				if (selectedText) {
					this.searchInThesaurus(selectedText);
				} else {
					new Notice('Please select text to search');
				}
			}
		});

		// Register context menu for editor
		this.registerEvent(
			this.app.workspace.on('editor-menu', (menu: Menu, editor: Editor, view: MarkdownView) => {
				const selectedText = editor.getSelection().trim();

				if (selectedText) {
					// Dictionary search
					if (this.settings.dictionaryPath) {
						menu.addItem((item) => {
							item
								.setTitle('Search in Local Dictionary')
								.setIcon('book-open')
								.onClick(() => {
									this.searchInDictionary(selectedText);
								});
						});
					}

					// Thesaurus search
					if (this.settings.thesaurusEnabled) {
						menu.addItem((item) => {
							item
								.setTitle('Search Synonyms (類語検索)')
								.setIcon('network')
								.onClick(() => {
									this.searchInThesaurus(selectedText);
								});
						});
					}
				}
			})
		);

		// Add settings tab
		this.addSettingTab(new DictionarySettingTab(this.app, this));

		console.log('Local Dictionary Plugin loaded');
	}

	onunload() {
		console.log('Local Dictionary Plugin unloaded');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/**
	 * Activate or reveal the dictionary view
	 */
	async activateDictionaryView() {
		const { workspace } = this.app;

		let leaf = workspace.getLeavesOfType(DICTIONARY_VIEW_TYPE)[0];

		if (!leaf) {
			// Create new leaf in right sidebar
			const rightLeaf = workspace.getRightLeaf(false);
			if (rightLeaf) {
				await rightLeaf.setViewState({
					type: DICTIONARY_VIEW_TYPE,
					active: true,
				});
				leaf = rightLeaf;
			}
		}

		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}

	/**
	 * Search for a word in the dictionary and display results
	 */
	async searchInDictionary(keyword: string) {
		if (!this.settings.dictionaryPath) {
			new Notice('Please configure dictionary path in settings');
			return;
		}

		if (!this.indexer.isReady()) {
			new Notice('Index not ready. Please rebuild index in settings.');
			return;
		}

		// Activate dictionary view
		await this.activateDictionaryView();

		// Get the view and trigger search
		const leaves = this.app.workspace.getLeavesOfType(DICTIONARY_VIEW_TYPE);
		if (leaves.length > 0 && leaves[0]) {
			const leaf = leaves[0];
			if (leaf.view) {
				const view = leaf.view as DictionaryView;
				await view.searchAndDisplay(keyword);
			}
		}
	}

	/**
	 * Activate or reveal the thesaurus view
	 */
	async activateThesaurusView() {
		const { workspace } = this.app;

		let leaf = workspace.getLeavesOfType(THESAURUS_VIEW_TYPE)[0];

		if (!leaf) {
			// Create new leaf in right sidebar
			const rightLeaf = workspace.getRightLeaf(false);
			if (rightLeaf) {
				await rightLeaf.setViewState({
					type: THESAURUS_VIEW_TYPE,
					active: true,
				});
				leaf = rightLeaf;
			}
		}

		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}

	/**
	 * Search for synonyms in the thesaurus and display results
	 */
	async searchInThesaurus(keyword: string) {
		if (!this.settings.thesaurusEnabled) {
			new Notice('Please enable thesaurus in settings');
			return;
		}

		if (!this.thesaurusIndexer.isReady()) {
			new Notice('Thesaurus index not ready. Please rebuild index in settings.');
			return;
		}

		// Activate thesaurus view
		await this.activateThesaurusView();

		// Get the view and trigger search
		const leaves = this.app.workspace.getLeavesOfType(THESAURUS_VIEW_TYPE);
		if (leaves.length > 0 && leaves[0]) {
			const leaf = leaves[0];
			if (leaf.view) {
				const view = leaf.view as ThesaurusView;
				await view.searchAndDisplay(keyword);
			}
		}
	}
}
