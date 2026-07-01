# メンテナ向けガイド（日本語）

このプラグインの構造を、コードに詳しくなくても把握できるようにまとめたものです。
Issue が来たときは「どのファイルの話か」をここで当たりを付けてください。困ったら
そのまま AI（Claude 等）にこのファイルごと渡せば、原因の切り分けや修正ができます。

## 全体像

「テキストを選択 → 右サイドバーに**類語**と**語義**を表示する」プラグインです。
データの持ち方が肝で、3系統あります。

| データ | 入手 | 使う場所 |
| --- | --- | --- |
| Sudachi 同義語辞書（類語の主力） | 自動ダウンロード | `assetManager.ts` → `thesaurus/sudachiSynonyms.ts` |
| kuromoji 辞書（長文の分かち書き用） | 自動ダウンロード（遅延） | `assetManager.ts` → `tokenizer.ts` |
| 日本語 WordNet（類語の補助・任意） | ユーザが tab ファイルを配置 | `thesaurus/wordnetIndexer.ts` |
| 英辞郎テキスト（語義・任意） | ユーザが txt を配置 | `dictionary/dictionaryIndexer.ts` |

## ファイルの役割

- **`src/main.ts`** … 起動時の初期化、コマンド登録、右クリックメニュー、検索の入口。
  「メニューに項目が出ない」「コマンドが動かない」系はここ。
- **`src/settings.ts`** … 設定画面。「設定のボタン/トグルの挙動」系はここ。
- **`src/paths.ts`** … プラグインフォルダ／`assets` フォルダの場所を計算。
- **`src/assetManager.ts`** … Sudachi・kuromoji 辞書のダウンロードとキャッシュ。
  「ダウンロードに失敗する」「オフラインで動かない」系はここ。URL もここに定義。
- **`src/tokenizer.ts`** … kuromoji で文を単語に分割し見出し語を取り出す。
  「長い選択で類語が出ない／変な区切り」系はここ。
- **`src/thesaurus/sudachiSynonyms.ts`** … Sudachi 同義語辞書の解析と検索。
- **`src/thesaurus/wordnetIndexer.ts`** … 日本語 WordNet の解析と検索。
- **`src/thesaurus/thesaurusView.ts`** … 右サイドバーの類語表示（見た目）。
- **`src/dictionary/dictionaryIndexer.ts`** … 英辞郎テキストの索引と検索。
- **`src/dictionary/dictionaryView.ts`** … 右サイドバーの語義表示（見た目）。
- **`styles.css`** … 表示の見た目（CSS）。「レイアウト・色」系はここ。

## よくある問い合わせと当たり所

- 「類語が全然出ない」→ 設定で Sudachi が有効か／`assets` にダウンロードされたか
  （`assetManager.ts`）。単語では出るのに文で出ない → `tokenizer.ts`。
- 「WordNet が読み込めない」→ tab ファイルのパス・形式（`wordnetIndexer.ts`）。
- 「起動が重い」→ 索引の読み込みは `main.ts` の `loadIndexes()`。重い処理は
  `onLayoutReady` 後に回してあります。

## 開発コマンド

```bash
npm install
npm run dev     # 変更を監視して自動ビルド
npm run build   # 型チェック＋本番ビルド（main.js 生成）
npm run lint
```

ビルド成果物 `main.js` はリポジトリには含めず、リリース時に添付します
（`.github/workflows/release.yml` がタグ push で自動ビルド）。

## リリース手順

1. `manifest.json` / `package.json` の `version` を上げる（`npm version patch` 等）。
2. タグを打って push：`git tag 1.0.1 && git push origin 1.0.1`
3. GitHub Actions が `main.js` 等を添付した**下書きリリース**を作成 → 内容を確認して公開。
