# BearMap Public

クマ出没情報マップ（公開フロントエンド）

秋田県・岩手県・福島県のクマ出没情報を地図上に表示するWebアプリケーションです。

## 公開URL

https://s4n4aty.github.io/bearmap-public/

## データソース

- 秋田県「ツキノワグマ等情報マップシステム『クマダス』」（秋田県オープンデータカタログ、CC-BY-4.0）
- 福島県クマ目撃マップ（ArcGIS FeatureServer）
- 盛岡市公式ホームページ（Google My Maps KML）
- 岩手日報（クマ情報ページ）
- Google News RSS（秋田・岩手・福島のクマ関連ニュース）

## 機能

- 地図上にクマ出没地点をマーカー表示
- 経過時間による色分け（24時間以内: 赤、3日以内: 橙、1週間以内: 黄、それ以前: グレー）
- 対象県以外のグレーアウト表示（岩手県は盛岡市以外をグレーアウト）
- スマホ対応（レスポンシブデザイン）

## ローカル開発

```bash
# ローカルサーバーを起動
./serve.sh
# または
serve.bat

# ブラウザで http://localhost:8080 を開く
```

## ファイル構成

- `index.html` - エントリーポイント
- `css/style.css` - スタイルシート
- `js/app.js` - メインアプリケーション
- `data/output.geojson` - クマ出没データ（パイプラインで生成）
- `data/japan_prefectures.geojson` - 日本の県境データ
- `data/morioka_city.geojson` - 盛岡市の市域データ
- `scripts/osm_relation_to_geojson.py` - OSM→GeoJSON変換スクリプト

## 免責事項

本情報は収集・変換の性質上、遅延・誤りを含む場合があります。緊急時は自治体等の公式情報をご確認ください。
