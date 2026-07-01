# Japanese Thesaurus for Obsidian

Select Japanese text in your notes and instantly see **synonyms** and
**definitions** in a side panel — fully offline, backed by local data.

- 🟢 **Synonyms (類語)** from the **Sudachi synonym dictionary** (auto-managed) and,
  optionally, **Japanese WordNet**.
- 📖 **Definitions (語義)** from an **Eijiro-style** local dictionary file.
- ✂️ **Tokenization** with **kuromoji** so that selecting a phrase still finds the
  dictionary form of each content word.
- ⚡ Fast indexed lookups; indexes are cached per-vault.

> Desktop only (uses the local filesystem).

## How it works

| Data | Source | Bundled? |
| --- | --- | --- |
| Sudachi synonym dictionary | downloaded automatically on first enable (Apache-2.0, ~3 MB) | auto |
| kuromoji dictionary | downloaded lazily the first time tokenization is needed (Apache-2.0) | auto |
| Japanese WordNet | **you provide** the `wnjpn-ok.tab` / `wnjpn-def.tab` files (BSD-like) | no |
| Eijiro-style dictionary | **you provide** a `■word : meaning` text file | no |

The community store only distributes `main.js`, `manifest.json` and `styles.css`,
so large data is downloaded at runtime or supplied by you rather than committed
to this repo. See **[docs/DATA_SETUP.md](docs/DATA_SETUP.md)** for details.

## Usage

1. Enable the plugin.
2. In settings, turn on **Sudachi 同義語辞書** (it downloads on first enable).
   Optionally configure **Japanese WordNet** and/or an **Eijiro dictionary** file.
3. Select text in a note, right-click, and choose **「類語を検索」** (synonyms) or
   **「辞書で検索」** (definitions). Results open in the right sidebar.
4. Click any word in the results to look it up in turn.

Commands (also available via the command palette):

- *Open thesaurus view* / *Open dictionary view*
- *Search synonyms for selection* / *Search selection in dictionary*

## Development

```bash
npm install
npm run dev     # watch build
npm run build   # type-check + production build
npm run lint
```

To test locally, symlink or copy `main.js`, `manifest.json` and `styles.css`
into `<vault>/.obsidian/plugins/japanese-thesaurus/`.

## Licenses

- Plugin code: see [LICENSE](LICENSE).
- Bundled / downloaded third-party data and code: see [NOTICE](NOTICE)
  (kuromoji and SudachiDict are Apache-2.0; Japanese WordNet is BSD-like).
- Eijiro data is a commercial product and is **not** included; supply your own.
