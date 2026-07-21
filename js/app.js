/* 画面設計書 v1.1 準拠: 状態 S1-S5 を実装
 * 検証用モック: ?state=empty / ?state=error / ?state=loading で各状態を強制表示できる
 */

(function () {
  'use strict';

  var DATA_URL = 'data/output.geojson';
  var PREFECTURES_URL = 'data/japan_prefectures.geojson';
  var MORIOKA_URL = 'data/morioka_city.geojson';
  var INITIAL_CENTER = [39.9, 140.4]; // 対象3県が収まる中心（画面設計 §3.1, P3）
  var INITIAL_ZOOM = 8;

  // データ取得対象の県。これ以外の県はグレーアウト表示する
  var COVERED_PREFECTURES = ['秋田県', '岩手県', '福島県'];

  var params = new URLSearchParams(location.search);
  var forcedState = params.get('state'); // モック検証用

  // 経過時間による色分け（危険度の直感化）:
  // 新しい出没ほど警告色、古いものはグレーに沈める（P1: 鮮度の明示）
  var RECENCY_COLORS = [
    { maxHours: 24, color: '#d7301f', label: '24時間以内' },
    { maxHours: 72, color: '#fc8d59', label: '3日以内' },
    { maxHours: 168, color: '#fec44f', label: '1週間以内' },
    { maxHours: Infinity, color: '#969696', label: 'それ以前' }
  ];

  function recencyColor(props) {
    // 出没日時不明のレコードを「最新」色にすると誤認を招くため、
    // 日時不明はグレーに倒す（P2: 鮮度をごまかさない）
    if (!props.event_datetime) return RECENCY_COLORS[RECENCY_COLORS.length - 1].color;
    var hours = (Date.now() - new Date(props.event_datetime).getTime()) / 36e5;
    for (var i = 0; i < RECENCY_COLORS.length; i++) {
      if (hours <= RECENCY_COLORS[i].maxHours) return RECENCY_COLORS[i].color;
    }
    return RECENCY_COLORS[RECENCY_COLORS.length - 1].color;
  }

  // 凡例（画面設計 §3.1 の予約領域: 左下）
  function addLegend() {
    var legend = L.control({ position: 'bottomleft' });
    legend.onAdd = function () {
      var div = L.DomUtil.create('div', 'legend');
      var title = document.createElement('div');
      title.className = 'legend-title';
      title.textContent = '出没からの経過時間';
      div.appendChild(title);
      RECENCY_COLORS.forEach(function (entry) {
        var row = document.createElement('div');
        row.className = 'legend-row';
        var swatch = document.createElement('span');
        swatch.className = 'legend-swatch';
        swatch.style.backgroundColor = entry.color;
        row.appendChild(swatch);
        row.appendChild(document.createTextNode(entry.label));
        div.appendChild(row);
      });
      return div;
    };
    legend.addTo(map);
  }

  // iframe埋め込み時はホイールズームを無効化（画面設計 §4, P6）
  var isEmbedded = window.self !== window.top;

  var map = L.map('map', {
    center: INITIAL_CENTER,
    zoom: INITIAL_ZOOM,
    scrollWheelZoom: !isEmbedded,
    preferCanvas: true, // 多数マーカーの描画を軽量化（クラスタリング導入は Phase 2）
    // モバイルの1本指パンとページ縦スクロールの競合対策は
    // 本実装で leaflet-gesture-handling 等の導入を検討（画面設計 §4）
    zoomControl: true
  });

  // ベースマップ: 国土地理院タイル（淡色地図）。出典表示必須（画面設計 §5.1）
  L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', {
    attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">国土地理院</a>',
    maxZoom: 18
  }).addTo(map);

  addLegend();

  var statusCard = document.getElementById('status-card');
  var statusMessage = document.getElementById('status-message');
  var statusReload = document.getElementById('status-reload');
  var statusOfficialLink = document.getElementById('status-official-link');

  function showStatus(type, message) {
    statusCard.hidden = false;
    statusCard.classList.toggle('is-error', type === 'error');
    statusMessage.innerHTML = ''; // 既存内容をクリア
    if (type === 'loading') {
      var spinner = document.createElement('span');
      spinner.className = 'spinner';
      statusMessage.appendChild(spinner);
    }
    statusMessage.appendChild(document.createTextNode(message));
    statusReload.hidden = type !== 'error';
    statusOfficialLink.hidden = type !== 'error';
  }

  function hideStatus() {
    statusCard.hidden = true;
  }

  statusReload.addEventListener('click', function () {
    location.reload();
  });

  // ISO 8601 → "M/D HH:mm"
  function formatDateTime(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' +
      String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  // ポップアップDOM構築（XSS防止のため textContent を使用）
  function buildPopupContent(props) {
    var container = document.createElement('div');

    var location = document.createElement('div');
    location.className = 'popup-location';
    location.textContent = props.location || '場所不明';
    container.appendChild(location);

    var datetime = document.createElement('div');
    datetime.className = 'popup-datetime';
    if (props.event_datetime) {
      datetime.textContent = '出没: ' + formatDateTime(props.event_datetime);
    } else {
      // 出没日時不明時は表記を変えて誤認を防止（画面設計 §3.2）
      datetime.textContent = '情報公開日: ' + formatDateTime(props.published_at) + '（出没日時不明）';
    }
    container.appendChild(datetime);

    if (props.summary) {
      var summary = document.createElement('div');
      summary.className = 'popup-summary';
      summary.textContent = props.summary;
      container.appendChild(summary);
    }

    if (props.source_url) {
      var source = document.createElement('div');
      source.className = 'popup-source';
      var link = document.createElement('a');
      link.href = props.source_url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = '🔗 出典: ' + (props.source || '情報元');
      source.appendChild(link);
      container.appendChild(source);
    }

    return container;
  }

  function renderFeatures(geojson) {
    var layer = L.geoJSON(geojson, {
      pointToLayer: function (feature, latlng) {
        // 経過時間で色分け（Phase 3 で severity 連動も検討、画面設計 §5.1）
        return L.circleMarker(latlng, {
          radius: 8,
          fillColor: recencyColor(feature.properties),
          color: '#fff',
          weight: 2,
          opacity: 1,
          fillOpacity: 0.85
        });
      },
      onEachFeature: function (feature, layer) {
        // autoPan でポップアップが画面外に出ないよう自動調整（画面設計 §3.2, P6）
        layer.bindPopup(buildPopupContent(feature.properties), {
          autoPan: true,
          autoPanPadding: L.point(16, 60) // ヘッダー/フッターと重ならない余白
        });
      }
    }).addTo(map);

    // データがあれば全マーカーが収まる範囲にフィット（P3）
    if (layer.getLayers().length > 0) {
      map.fitBounds(layer.getBounds().pad(0.2));
    }
    return layer.getLayers().length;
  }

  function updateHeader(generatedAt) {
    var el = document.getElementById('last-updated');
    if (generatedAt) {
      el.textContent = '更新: ' + formatDateTime(generatedAt);
      el.title = generatedAt; // フルタイムスタンプ（画面設計 §4）
    } else {
      el.textContent = '更新: 不明';
    }
  }

  // 未取得県のグレーアウト: 対象県以外を薄いグレーで被覆し、
  // データ提供範囲を視覚的に明示する（誤解防止: 白地図だと「情報がない=安全」に見える）
  // 岩手県は盛岡市のみ情報取得のため、盛岡市以外はグレーアウトする。
  function renderPrefectureMask() {
    Promise.all([
      fetch(PREFECTURES_URL).then(function (res) { return res.ok ? res.json() : null; }),
      fetch(MORIOKA_URL).then(function (res) { return res.ok ? res.json() : null; })
    ])
      .then(function (results) {
        var prefectures = results[0];
        var morioka = results[1];
        if (!prefectures) return;

        // 岩手県は盛岡市を除いた部分をグレーで表示するため、一旦県リストから外す
        var features = prefectures.features.filter(function (f) {
          return f.properties.nam_ja !== '岩手県';
        });

        L.geoJSON({ type: 'FeatureCollection', features: features }, {
          style: function (feature) {
            var covered = COVERED_PREFECTURES.indexOf(feature.properties.nam_ja) >= 0;
            return covered
              ? { fillOpacity: 0, weight: 1.5, color: '#888' }       // 対象県: 枠線のみ
              : { fillColor: '#999', fillOpacity: 0.35, weight: 1, color: '#aaa' }; // 未取得県: グレー
          },
          interactive: false // マーカー操作を妨げない
        }).addTo(map);

        // 岩手県全体をグレーで表示
        var iwate = prefectures.features.find(function (f) {
          return f.properties.nam_ja === '岩手県';
        });
        if (iwate) {
          L.geoJSON(iwate, {
            style: { fillColor: '#999', fillOpacity: 0.35, weight: 1, color: '#aaa' },
            interactive: false
          }).addTo(map);
        }

        // 盛岡市を白で上に重ね、グレーを隠す（ポリゴン演算は使わない）
        if (morioka) {
          L.geoJSON(morioka, {
            style: { fillColor: '#fff', fillOpacity: 0.9, weight: 1.5, color: '#888' },
            interactive: false
          }).addTo(map);
        }
      })
      .catch(function () { /* マスク表示失敗時は素の地図のまま */ });
  }

  renderPrefectureMask();

  function load() {
    // S1 読み込み中
    showStatus('loading', '情報を読み込んでいます…');

    var fetchPromise = forcedState === 'error'
      ? Promise.reject(new Error('forced error'))
      : fetch(DATA_URL).then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        });

    fetchPromise
      .then(function (geojson) {
        var features = forcedState === 'empty' ? [] : geojson.features;
        updateHeader(geojson.generated_at);

        if (forcedState === 'loading') return; // 検証用: 読み込み中のまま

        hideStatus();
        var count = renderFeatures({ type: 'FeatureCollection', features: features });
        if (count === 0) {
          // S3 データなし
          showStatus('empty', '現在、表示できる出没情報はありません');
        }
      })
      .catch(function () {
        if (forcedState === 'loading') return;
        // S4 取得失敗: 再読み込み導線と公式情報リンクを提示（P4）
        showStatus('error', '情報を取得できませんでした。');
      });
  }

  load();
})();
