import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import { promises as fsp } from 'fs';
import type LocalDictionaryPlugin from './main';

export interface DictionarySettings {
	/** Eijiro-style text dictionary (■word : meaning). Optional. */
	dictionaryPath: string;
	encoding: 'utf-8' | 'shift-jis';
	/** Sudachi synonym dictionary (downloaded & bundled by the plugin). */
	sudachiEnabled: boolean;
	/** Japanese WordNet thesaurus (user-provided tab files). Optional. */
	wordnetEnabled: boolean;
	wordnetWordsPath: string;
	wordnetDefsPath: string;
}

export const DEFAULT_SETTINGS: DictionarySettings = {
	dictionaryPath: '',
	encoding: 'utf-8',
	sudachiEnabled: false,
	wordnetEnabled: false,
	wordnetWordsPath: '',
	wordnetDefsPath: '',
};

export class DictionarySettingTab extends PluginSettingTab {
	plugin: LocalDictionaryPlugin;

	constructor(app: App, plugin: LocalDictionaryPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		this.renderDictionarySection(containerEl);
		this.renderSudachiSection(containerEl);
		this.renderWordNetSection(containerEl);
	}

	private async pathExists(p: string): Promise<boolean> {
		try {
			await fsp.access(p);
			return true;
		} catch {
			return false;
		}
	}

	private renderDictionarySection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName('語義辞書 (英辞郎テキスト)').setHeading();

		new Setting(containerEl)
			.setName('辞書ファイルのパス')
			.setDesc('英辞郎形式（■見出し語 : 語義）のテキストファイルへの絶対パス。任意。')
			.addText((text) =>
				text
					.setPlaceholder('C:\\path\\to\\eijiro.txt')
					.setValue(this.plugin.settings.dictionaryPath)
					.onChange(async (value) => {
						this.plugin.settings.dictionaryPath = value.trim();
						await this.plugin.saveSettings();
					})
			)
			.addButton((button) =>
				button.setButtonText('確認').onClick(async () => {
					const p = this.plugin.settings.dictionaryPath;
					if (!p) {
						new Notice('先にパスを入力してください');
						return;
					}
					new Notice((await this.pathExists(p)) ? '✓ ファイルを確認しました' : '✗ ファイルが見つかりません');
				})
			);

		new Setting(containerEl)
			.setName('文字コード')
			.setDesc('辞書ファイルのエンコーディング')
			.addDropdown((dd) =>
				dd
					.addOption('utf-8', 'UTF-8')
					.addOption('shift-jis', 'Shift-JIS')
					.setValue(this.plugin.settings.encoding)
					.onChange(async (value: 'utf-8' | 'shift-jis') => {
						this.plugin.settings.encoding = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('辞書インデックスを再構築')
			.setDesc('辞書ファイルやエンコーディングを変更したあとに実行してください。')
			.addButton((button) =>
				button
					.setButtonText('再構築')
					.setCta()
					.onClick(async () => {
						if (!this.plugin.settings.dictionaryPath) {
							new Notice('先に辞書ファイルのパスを指定してください');
							return;
						}
						new Notice('辞書インデックスを構築中…');
						try {
							await this.plugin.indexer.buildIndex();
							this.plugin.refreshViews();
							new Notice('✓ 辞書インデックスを再構築しました');
						} catch (e) {
							new Notice('✗ 失敗: ' + (e instanceof Error ? e.message : String(e)));
						}
					})
			);
	}

	private renderSudachiSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName('Sudachi 同義語辞書 (類語)').setHeading();

		new Setting(containerEl)
			.setName('Sudachi同義語辞書を有効化')
			.setDesc(
				'有効にすると Sudachi 同義語辞書（Apache-2.0, 約3MB）を初回に自動ダウンロードし、類語検索に使用します。'
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.sudachiEnabled).onChange(async (value) => {
					this.plugin.settings.sudachiEnabled = value;
					await this.plugin.saveSettings();
					if (value) {
						try {
							await this.plugin.initSudachiSynonyms();
							this.plugin.refreshViews();
							new Notice('✓ Sudachi同義語辞書を読み込みました');
						} catch (e) {
							new Notice('✗ ' + (e instanceof Error ? e.message : String(e)));
						}
					}
					this.display();
				})
			);

		if (this.plugin.settings.sudachiEnabled) {
			const stats = this.plugin.sudachiSynonyms.getStats();
			new Setting(containerEl)
				.setName('状態')
				.setDesc(
					stats.groups > 0
						? `読み込み済み: ${stats.groups.toLocaleString()} グループ / ${stats.words.toLocaleString()} 語`
						: '未読み込み（再構築を実行してください）'
				)
				.addButton((button) =>
					button.setButtonText('再ダウンロード／再構築').onClick(async () => {
						new Notice('Sudachi同義語辞書を再構築中…');
						try {
							await this.plugin.initSudachiSynonyms(true);
							this.plugin.refreshViews();
							new Notice('✓ 再構築しました');
						} catch (e) {
							new Notice('✗ ' + (e instanceof Error ? e.message : String(e)));
						}
						this.display();
					})
				);
		}
	}

	private renderWordNetSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName('日本語 WordNet (任意・ユーザ提供)').setHeading();

		new Setting(containerEl)
			.setName('WordNetを有効化')
			.setDesc('日本語WordNetのタブ区切りファイルを追加の類語ソースとして使用します。')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.wordnetEnabled).onChange(async (value) => {
					this.plugin.settings.wordnetEnabled = value;
					await this.plugin.saveSettings();
					this.display();
				})
			);

		if (!this.plugin.settings.wordnetEnabled) return;

		new Setting(containerEl)
			.setName('語ファイル (wnjpn-ok.tab)')
			.setDesc('日本語WordNetの語エントリファイルへの絶対パス')
			.addText((text) =>
				text
					.setPlaceholder('C:\\path\\to\\wnjpn-ok.tab')
					.setValue(this.plugin.settings.wordnetWordsPath)
					.onChange(async (value) => {
						this.plugin.settings.wordnetWordsPath = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('定義ファイル (wnjpn-def.tab)')
			.setDesc('日本語WordNetの定義ファイルへの絶対パス')
			.addText((text) =>
				text
					.setPlaceholder('C:\\path\\to\\wnjpn-def.tab')
					.setValue(this.plugin.settings.wordnetDefsPath)
					.onChange(async (value) => {
						this.plugin.settings.wordnetDefsPath = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('WordNetインデックスを再構築')
			.setDesc('両方のファイルを指定したあとに実行してください。数十秒かかる場合があります。')
			.addButton((button) =>
				button
					.setButtonText('再構築')
					.setCta()
					.onClick(async () => {
						const { wordnetWordsPath, wordnetDefsPath } = this.plugin.settings;
						if (!wordnetWordsPath || !wordnetDefsPath) {
							new Notice('両方のファイルパスを指定してください');
							return;
						}
						new Notice('WordNetインデックスを構築中…');
						try {
							await this.plugin.wordnetIndexer.buildIndex(wordnetWordsPath, wordnetDefsPath);
							this.plugin.refreshViews();
							new Notice('✓ WordNetインデックスを再構築しました');
							this.display();
						} catch (e) {
							new Notice('✗ 失敗: ' + (e instanceof Error ? e.message : String(e)));
						}
					})
			);
	}
}
