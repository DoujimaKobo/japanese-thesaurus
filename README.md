# Local Dictionary Plugin for Obsidian

Search large local text dictionary files (Eijiro-style) and Japanese thesaurus data directly from Obsidian with lightning-fast indexed lookups.

## Features

### Dictionary Features
- **Right-Click Context Menu**: Search selected text instantly via context menu
- **Dedicated Sidebar View**: Clean, persistent dictionary view in the right sidebar
- **Lightning Fast**: Indexed byte-offset lookups for instant results (no loading entire file into memory)
- **Large File Support**: Handles dictionaries with 100k+ entries efficiently
- **Multiple Encoding Support**: UTF-8 and Shift-JIS encoding options
- **Multiple Entries**: Supports multiple definitions for the same keyword

### Thesaurus Features
- **Japanese WordNet Integration**: Browse Japanese synonyms and definitions
- **Synset Navigation**: Explore semantic relationships between words
- **Separate Thesaurus View**: Dedicated sidebar for thesaurus lookups
- **Fast Indexed Search**: Quick lookups across large WordNet databases

## Installation

### Manual Build

1. Clone this repository to your plugins folder:
   ```bash
   cd <vault>/.obsidian/plugins/
   git clone <repository-url> local-dictionary
   cd local-dictionary
   ```

2. Install dependencies and build:
   ```bash
   npm install
   npm run build
   ```

3. Reload Obsidian and enable the plugin

### For Development

1. Clone to your development folder
2. Run `npm install`
3. Run `npm run dev` for auto-compilation
4. Copy or symlink to `.obsidian/plugins/local-dictionary/`
5. Reload Obsidian

## Data Files

This plugin includes sample data files in the `data/` directory:

### Sample Dictionary
- **Location**: `data/sample-dictionary.txt`
- **Format**: Eijiro-style plain text
- **Usage**: For testing the dictionary feature

### Japanese WordNet Data
- **Location**: `data/japanese-wordnet/`
- **Files**:
  - `wnjpn-ok.tab` (4.1 MB) - Word entries and synset relationships
  - `wnjpn-def.tab` (16 MB) - Definitions and glosses
- **License**: BSD-like (see `data/japanese-wordnet/README.md`)
- **Source**: https://bond-lab.github.io/wnja/

## Setup

### Dictionary Setup

1. **Configure Dictionary Path**
   - Go to Settings → Local Dictionary
   - Enter the path to your dictionary file
   - For the included sample: `<project>/data/sample-dictionary.txt`
   - Or use an absolute path: `C:\dictionaries\eijiro.txt`
   - Use the "Test Path" button to verify the file is accessible

2. **Select Encoding**
   - Choose UTF-8 or Shift-JIS based on your dictionary file
   - The sample dictionary uses UTF-8

3. **Build Index**
   - Click "Rebuild" button in settings
   - Wait for indexing to complete (progress shown in console)
   - This only needs to be done once, or when dictionary file changes

### Thesaurus Setup

1. **Configure WordNet Paths**
   - Go to Settings → Local Dictionary
   - Set "Words Tab File" path: `<project>/data/japanese-wordnet/wnjpn-ok.tab`
   - Set "Definitions Tab File" path: `<project>/data/japanese-wordnet/wnjpn-def.tab`
   - Use "Test Path" buttons to verify files are accessible

2. **Build Index**
   - Click "Rebuild" button in thesaurus settings
   - Wait for indexing to complete
   - This is a one-time process unless data files change

**Note**: Replace `<project>` with the actual path to the plugin directory in your Obsidian vault.

## Usage

### Dictionary Usage

#### Search via Context Menu
1. Select any text in the editor
2. Right-click to open context menu
3. Click "Search in Local Dictionary"
4. Results appear in the right sidebar

#### Search via Command Palette
1. Select text in the editor
2. Open command palette (Ctrl/Cmd+P)
3. Type "Search selected text in dictionary"
4. Press Enter

#### Open Dictionary View
- Command: "Open dictionary view"
- Opens or reveals the dictionary sidebar

### Thesaurus Usage

#### Search via Context Menu
1. Select Japanese text in the editor
2. Right-click to open context menu
3. Click "Search in Thesaurus"
4. Results appear in the thesaurus sidebar

#### Search via Command Palette
1. Select text in the editor
2. Open command palette (Ctrl/Cmd+P)
3. Type "Search selected text in thesaurus"
4. Press Enter

#### Open Thesaurus View
- Command: "Open thesaurus view"
- Opens or reveals the thesaurus sidebar

## Dictionary Format

The dictionary feature expects plain text files in Eijiro format:

```
■keyword : definition
```

Example:
```
■hello : こんにちは、やあ、もしもし
■world : 世界、地球、世の中
■computer : コンピューター、計算機、電子計算機
```

## Performance

The plugin uses byte-offset indexing for O(1) lookup performance:

- **Index Building**: One-time process when files change
- **Lookups**: Near-instant, regardless of file size
- **Memory**: Only loads matching entries, not entire files

For a 100,000-entry dictionary:
- Index build: ~10-30 seconds (one time)
- Lookup time: <100ms
- Memory usage: Minimal

## Index Storage

Indexes are stored in the plugin directory:
```
<vault>/.obsidian/plugins/local-dictionary/.dictionary-index.json
<vault>/.obsidian/plugins/local-dictionary/.thesaurus-index.json
```

Indexes are automatically invalidated if:
- File paths change
- Encoding settings change (for dictionary)

## Troubleshooting

### "Index not ready" error
- Go to Settings → Local Dictionary
- Click "Rebuild" to build the appropriate index

### "Cannot access file" error
- Verify the file path is correct
- For relative paths, use `<project>/data/...` format
- Check file permissions
- Use "Test Path" button in settings

### No results found
- **Dictionary**: Check that search term matches exactly (case-insensitive)
- **Thesaurus**: Verify the word exists in the WordNet database
- Verify file formats are correct
- Rebuild index if files were modified

### Slow performance
- Ensure indexes are built (check console for "Index loaded" messages)
- Large files may take longer to index initially
- Once indexed, lookups should be instant

## Development

### Project Structure

```
obsidian-local-dictionary/
├── src/
│   ├── main.ts              # Plugin entry point, context menu, commands
│   ├── settings.ts          # Settings tab UI and configuration
│   ├── indexer.ts           # Dictionary indexing and search logic
│   ├── dictionaryView.ts    # Dictionary sidebar view component
│   ├── thesaurusIndexer.ts  # Thesaurus indexing and search logic
│   └── thesaurusView.ts     # Thesaurus sidebar view component
├── data/
│   ├── sample-dictionary.txt
│   └── japanese-wordnet/
│       ├── README.md
│       ├── wnjpn-ok.tab
│       └── wnjpn-def.tab
├── styles.css               # UI styling
├── manifest.json            # Plugin metadata
├── package.json             # Dependencies
└── README.md                # This file
```

### Building

```bash
npm run dev    # Development mode with auto-rebuild
npm run build  # Production build
```

### Architecture

1. **Indexing**: Reads files line-by-line, builds Map of keywords → byte offsets
2. **Storage**: Indexes saved as JSON for fast startup
3. **Lookup**: Uses file handles for random access at stored offsets
4. **Views**: ItemView components for sidebar integration

## Roadmap

### Dictionary Features
- [ ] Fuzzy search support
- [ ] Search history
- [ ] Favorites/bookmarks
- [ ] Export results
- [ ] Multiple dictionary files
- [ ] Regex search patterns
- [ ] Wildcard searches
- [ ] Pronunciation support
- [ ] PDIC binary format support

### Thesaurus Features
- [ ] English WordNet support
- [ ] Cross-reference links between dictionary and thesaurus
- [ ] Export synsets
- [ ] Visual graph of semantic relationships

## Converting Your Dictionary

If you have a PDIC (.dic) dictionary file, you'll need to convert it to plain text Eijiro format. The target format is:

```
■keyword : definition
```

Each entry should be on its own line.

## License

0-BSD (BSD Zero Clause License)

See `LICENSE` file for details.

The included Japanese WordNet data has its own license (BSD-like). See `data/japanese-wordnet/README.md` for details.

## Credits

- Built with [Obsidian API](https://github.com/obsidianmd/obsidian-api)
- Japanese WordNet data from [NICT and Francis Bond](https://bond-lab.github.io/wnja/)

## Support

For issues, feature requests, or questions:
- Open an issue on GitHub
- Check existing issues first

---

**Note**: This plugin requires desktop Obsidian (not mobile) due to file system access requirements.
