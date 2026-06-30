# Japanese WordNet Data

This directory contains data files from the Japanese WordNet project.

## Data Files

- **wnjpn-ok.tab** (4.1 MB) - Word entries and synset relationships
- **wnjpn-def.tab** (16 MB) - Definitions and glosses for synsets

## Source

The data is from the Japanese WordNet project:
- Website: https://bond-lab.github.io/wnja/
- Project: https://github.com/bond-lab/wnja

## License

Japanese WordNet is released under the BSD-like license. The original license terms are:

```
Japanese WordNet
Copyright 2009-2011 NICT, 2012-2016 Francis Bond and 2016-2024 Francis Bond, Takayuki Kuribayashi, goki ohshima

This work may be freely reproduced, modified, and distributed for any purpose
provided that this copyright notice is preserved.
```

For the most up-to-date license information, please visit:
https://github.com/bond-lab/wnja/blob/master/LICENSE

## Usage

These files are used by the Obsidian Local Dictionary plugin to provide Japanese thesaurus functionality. The plugin indexes these files at startup to enable fast synonym lookups.

To use these files:
1. In the plugin settings, set the "Words Tab File" path to: `<project>/data/japanese-wordnet/wnjpn-ok.tab`
2. Set the "Definitions Tab File" path to: `<project>/data/japanese-wordnet/wnjpn-def.tab`

## File Format

Both files use tab-separated values (TSV) format. See the Japanese WordNet documentation for detailed schema information.

## Updating the Data

To update to the latest version:
1. Visit https://github.com/bond-lab/wnja/releases
2. Download the latest `wnjpn.db.gz` or tab files
3. Extract and replace the files in this directory
