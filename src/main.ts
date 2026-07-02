import { Editor, Menu, Notice, Plugin, WorkspaceLeaf } from 'obsidian';
import { DEFAULT_SETTINGS, DictionarySettings, DictionarySettingTab } from './settings';
import { AssetManager } from './assetManager';
import { Tokenizer } from './tokenizer';
import { DictionaryIndexer } from './dictionary/dictionaryIndexer';
import { DictionaryView, DICTIONARY_VIEW_TYPE } from './dictionary/dictionaryView';
import { WordNetIndexer } from './thesaurus/wordnetIndexer';
import { SudachiSynonymIndexer } from './thesaurus/sudachiSynonyms';
import { WlspIndexer } from './thesaurus/wlsp';
import { ThesaurusView, THESAURUS_VIEW_TYPE } from './thesaurus/thesaurusView';

export default class LocalDictionaryPlugin extends Plugin {
	settings: DictionarySettings;
	assets: AssetManager;
	tokenizer: Tokenizer;
	indexer: DictionaryIndexer;
	wordnetIndexer: WordNetIndexer;
	sudachiSynonyms: SudachiSynonymIndexer;
	wlsp: WlspIndexer;

	async onload() {
		await this.loadSettings();

		this.assets = new AssetManager(this);
		this.tokenizer = new Tokenizer(this);
		this.indexer = new DictionaryIndexer(this);
		this.wordnetIndexer = new WordNetIndexer(this);
		this.sudachiSynonyms = new SudachiSynonymIndexer(this);
		this.wlsp = new WlspIndexer(this);

		this.registerView(DICTIONARY_VIEW_TYPE, (leaf) => new DictionaryView(leaf, this));
		this.registerView(THESAURUS_VIEW_TYPE, (leaf) => new ThesaurusView(leaf, this));

		this.addCommand({
			id: 'open-dictionary-view',
			name: 'Open dictionary view',
			callback: () => {
				void this.activateView(DICTIONARY_VIEW_TYPE);
			},
		});
		this.addCommand({
			id: 'open-thesaurus-view',
			name: 'Open thesaurus view',
			callback: () => {
				void this.activateView(THESAURUS_VIEW_TYPE);
			},
		});
		this.addCommand({
			id: 'search-selected-text',
			name: 'Search selection in dictionary',
			editorCallback: (editor: Editor) => this.searchFromEditor(editor, 'dictionary'),
		});
		this.addCommand({
			id: 'search-synonyms',
			name: 'Search synonyms for selection',
			editorCallback: (editor: Editor) => this.searchFromEditor(editor, 'thesaurus'),
		});

		this.registerEvent(
			this.app.workspace.on('editor-menu', (menu: Menu, editor: Editor) => {
				const selection = editor.getSelection().trim();
				if (!selection) return;

				if (this.settings.dictionaryPath) {
					menu.addItem((item) =>
						item
							.setTitle('辞書で検索 (Local Dictionary)')
							.setIcon('book-open')
							.onClick(() => {
								void this.searchInDictionary(selection);
							})
					);
				}
				if (this.thesaurusAvailable()) {
					menu.addItem((item) =>
						item
							.setTitle('類語を検索 (Thesaurus)')
							.setIcon('network')
							.onClick(() => {
								void this.searchInThesaurus(selection);
							})
					);
				}
			})
		);

		this.addSettingTab(new DictionarySettingTab(this.app, this));

		// Build/load indexes after the workspace is ready so we never block start-up.
		this.app.workspace.onLayoutReady(() => {
			this.loadIndexes().catch((e) => console.error('Index load failed:', e));
		});
	}

	onunload() {
		// Registered views/events are cleaned up automatically by Obsidian.
	}

	async loadSettings() {
		const stored = (await this.loadData()) as Partial<DictionarySettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, stored);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	thesaurusAvailable(): boolean {
		return (
			this.sudachiSynonyms.isReady() ||
			this.wordnetIndexer.isReady() ||
			this.wlsp.isReady()
		);
	}

	/** Re-render any open sidebar views so their status reflects loaded indexes. */
	refreshViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(THESAURUS_VIEW_TYPE)) {
			if (leaf.view instanceof ThesaurusView) leaf.view.refresh();
		}
		for (const leaf of this.app.workspace.getLeavesOfType(DICTIONARY_VIEW_TYPE)) {
			if (leaf.view instanceof DictionaryView) leaf.view.refresh();
		}
	}

	/** Load whatever indexes are enabled in settings. Errors are non-fatal. */
	async loadIndexes(): Promise<void> {
		if (this.settings.dictionaryPath) {
			await this.indexer.loadIndex().catch((e) =>
				console.error('Dictionary index load failed:', e)
			);
		}
		if (this.settings.sudachiEnabled) {
			await this.initSudachiSynonyms().catch((e) =>
				console.error('Sudachi synonyms init failed:', e)
			);
			this.refreshViews();
		}
		if (
			this.settings.wordnetEnabled &&
			this.settings.wordnetWordsPath &&
			this.settings.wordnetDefsPath
		) {
			const loaded = await this.wordnetIndexer.loadIndex();
			if (!loaded) {
				// Cache missing or an old format — rebuild once from the tab files.
				const notice = new Notice('WordNetインデックスを構築中…', 0);
				try {
					await this.wordnetIndexer.buildIndex(
						this.settings.wordnetWordsPath,
						this.settings.wordnetDefsPath
					);
				} catch (e) {
					console.error('WordNet rebuild failed:', e);
				} finally {
					notice.hide();
				}
			}
			if (this.settings.wordnetExpanded) {
				await this.initWordnetRelations().catch((e) =>
					console.error('WordNet relations init failed:', e)
				);
			}
		}
		if (this.settings.wlspEnabled) {
			await this.initWlsp().catch((e) => console.error('WLSP init failed:', e));
		}
		// Refresh again once everything (incl. the large WordNet index) is ready.
		this.refreshViews();
	}

	/** Ensure the WordNet relation table is downloaded and loaded. */
	async initWordnetRelations(): Promise<void> {
		const synlinkPath = await this.assets.ensureWordnetSynlink();
		await this.wordnetIndexer.loadRelations(synlinkPath);
	}

	/** Ensure the 分類語彙表 is downloaded and indexed. */
	async initWlsp(forceRebuild = false): Promise<void> {
		const sourcePath = await this.assets.ensureWlsp();
		if (!forceRebuild && (await this.wlsp.loadIndex(sourcePath))) {
			return;
		}
		const notice = new Notice('分類語彙表をインデックス中…', 0);
		try {
			await this.wlsp.buildIndex(sourcePath);
		} finally {
			notice.hide();
		}
	}

	/** Ensure the Sudachi synonym dictionary is downloaded and indexed. */
	async initSudachiSynonyms(forceRebuild = false): Promise<void> {
		const sourcePath = await this.assets.ensureSudachiSynonyms();
		if (!forceRebuild && (await this.sudachiSynonyms.loadIndex(sourcePath))) {
			return;
		}
		const notice = new Notice('Sudachi同義語辞書をインデックス中…', 0);
		try {
			await this.sudachiSynonyms.buildIndex(sourcePath);
		} finally {
			notice.hide();
		}
	}

	private searchFromEditor(editor: Editor, kind: 'dictionary' | 'thesaurus'): void {
		const selection = editor.getSelection().trim();
		if (!selection) {
			new Notice('検索するテキストを選択してください');
			return;
		}
		if (kind === 'dictionary') void this.searchInDictionary(selection);
		else void this.searchInThesaurus(selection);
	}

	async searchInDictionary(keyword: string): Promise<void> {
		if (!this.settings.dictionaryPath) {
			new Notice('設定で辞書ファイルのパスを指定してください');
			return;
		}
		if (!this.indexer.isReady()) {
			new Notice('辞書インデックスが未構築です。設定で再構築してください。');
			return;
		}
		const view = await this.activateView(DICTIONARY_VIEW_TYPE);
		if (view instanceof DictionaryView) await view.searchAndDisplay(keyword);
	}

	async searchInThesaurus(keyword: string): Promise<void> {
		if (!this.thesaurusAvailable()) {
			new Notice('類語データが未読み込みです。設定で有効化してください。');
			return;
		}
		const view = await this.activateView(THESAURUS_VIEW_TYPE);
		if (view instanceof ThesaurusView) await view.searchAndDisplay(keyword);
	}

	/** Reveal (creating if needed) a view in the right sidebar and return it. */
	async activateView(type: string): Promise<unknown> {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(type)[0] ?? null;
		if (!leaf) {
			leaf = workspace.getRightLeaf(false);
			if (leaf) await leaf.setViewState({ type, active: true });
		}
		if (leaf) {
			void workspace.revealLeaf(leaf);
			return leaf.view;
		}
		return null;
	}
}
