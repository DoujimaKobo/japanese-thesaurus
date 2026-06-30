import {App, Notice, PluginSettingTab, Setting} from "obsidian";
import type LocalDictionaryPlugin from "./main";

export interface DictionarySettings {
	dictionaryPath: string;
	encoding: 'utf-8' | 'shift-jis';
	thesaurusEnabled: boolean;
	thesaurusWordsPath: string;
	thesaurusDefsPath: string;
}

export const DEFAULT_SETTINGS: DictionarySettings = {
	dictionaryPath: '',
	encoding: 'utf-8',
	thesaurusEnabled: false,
	thesaurusWordsPath: '',
	thesaurusDefsPath: ''
}

export class DictionarySettingTab extends PluginSettingTab {
	plugin: LocalDictionaryPlugin;

	constructor(app: App, plugin: LocalDictionaryPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Local Dictionary Settings'});

		new Setting(containerEl)
			.setName('Dictionary file path')
			.setDesc('Absolute path to the dictionary .txt file (Eijiro format: ■Word : Meaning)')
			.addText(text => text
				.setPlaceholder('C:\\path\\to\\dictionary.txt')
				.setValue(this.plugin.settings.dictionaryPath)
				.onChange(async (value) => {
					this.plugin.settings.dictionaryPath = value;
					await this.plugin.saveSettings();
				}))
			.addButton(button => button
				.setButtonText('Test Path')
				.onClick(async () => {
					const path = this.plugin.settings.dictionaryPath;
					if (!path) {
						new Notice('Please enter a dictionary path first');
						return;
					}
					try {
						const fs = require('fs').promises;
						await fs.access(path);
						new Notice('✓ Dictionary file found!');
					} catch (e) {
						const errorMessage = e instanceof Error ? e.message : String(e);
						new Notice('✗ Cannot access file: ' + errorMessage);
					}
				}));

		new Setting(containerEl)
			.setName('File encoding')
			.setDesc('Character encoding of the dictionary file')
			.addDropdown(dropdown => dropdown
				.addOption('utf-8', 'UTF-8')
				.addOption('shift-jis', 'Shift-JIS')
				.setValue(this.plugin.settings.encoding)
				.onChange(async (value: 'utf-8' | 'shift-jis') => {
					this.plugin.settings.encoding = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Rebuild index')
			.setDesc('Rebuild the dictionary index. Use this after changing the dictionary file or if lookups are not working.')
			.addButton(button => button
				.setButtonText('Rebuild')
				.setCta()
				.onClick(async () => {
					if (!this.plugin.settings.dictionaryPath) {
						new Notice('Please set dictionary path first');
						return;
					}
					new Notice('Rebuilding index...');
					try {
						await this.plugin.indexer.buildIndex();
						new Notice('✓ Index rebuilt successfully!');
					} catch (e) {
						const errorMessage = e instanceof Error ? e.message : String(e);
						new Notice('✗ Error rebuilding index: ' + errorMessage);
						console.error('Index rebuild error:', e);
					}
				}));

		// Thesaurus section
		containerEl.createEl('h2', {text: '類語辞典設定 (Thesaurus Settings)'});

		new Setting(containerEl)
			.setName('Enable thesaurus')
			.setDesc('Enable Japanese WordNet thesaurus for synonym searches')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.thesaurusEnabled)
				.onChange(async (value) => {
					this.plugin.settings.thesaurusEnabled = value;
					await this.plugin.saveSettings();
					// Refresh display to show/hide thesaurus settings
					this.display();
				}));

		if (this.plugin.settings.thesaurusEnabled) {
			new Setting(containerEl)
				.setName('WordNet words file')
				.setDesc('Path to wnjpn-ok.tab file (Japanese WordNet words)')
				.addText(text => text
					.setPlaceholder('C:\\path\\to\\wnjpn-ok.tab')
					.setValue(this.plugin.settings.thesaurusWordsPath)
					.onChange(async (value) => {
						this.plugin.settings.thesaurusWordsPath = value;
						await this.plugin.saveSettings();
					}));

			new Setting(containerEl)
				.setName('WordNet definitions file')
				.setDesc('Path to wnjpn-def.tab file (Japanese WordNet definitions)')
				.addText(text => text
					.setPlaceholder('C:\\path\\to\\wnjpn-def.tab')
					.setValue(this.plugin.settings.thesaurusDefsPath)
					.onChange(async (value) => {
						this.plugin.settings.thesaurusDefsPath = value;
						await this.plugin.saveSettings();
					}));

			new Setting(containerEl)
				.setName('Rebuild thesaurus index')
				.setDesc('Rebuild the thesaurus index from WordNet files. This may take a few minutes.')
				.addButton(button => button
					.setButtonText('Rebuild Thesaurus')
					.setCta()
					.onClick(async () => {
						if (!this.plugin.settings.thesaurusWordsPath || !this.plugin.settings.thesaurusDefsPath) {
							new Notice('Please set both WordNet file paths first');
							return;
						}
						new Notice('Rebuilding thesaurus index...');
						try {
							await this.plugin.thesaurusIndexer.buildIndex(
								this.plugin.settings.thesaurusWordsPath,
								this.plugin.settings.thesaurusDefsPath
							);
							new Notice('✓ Thesaurus index rebuilt successfully!');
						} catch (e) {
							const errorMessage = e instanceof Error ? e.message : String(e);
							new Notice('✗ Error rebuilding thesaurus index: ' + errorMessage);
							console.error('Thesaurus index rebuild error:', e);
						}
					}));
		}
	}
}
