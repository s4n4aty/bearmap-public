/* 画面設計書 v1.1 準拠: 状態 S1-S5 を実装
 * 検証用モック: ?state=empty / ?state=error / ?state=loading で各状態を強制表示できる
 */

(function () {
  'use strict';

  var DATA_URL = 'data/output.geojson';
  var INITIAL_CENTER = [39.9, 140.4]; // 対象3県が収まる中心（画面設計 §3.1, P3）
  var INITIAL_ZOOM = 8;

  var params = new URLSearchParams(location.search);
  var forcedState = params.get('state'); // モック検証用

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
      link.textContent = '🔗 出典: 秋田県';
      source.appendChild(link);
      container.appendChild(source);
    }

    return container;
  }

  function renderFeatures(geojson) {
    var layer = L.geoJSON(geojson, {
      pointToLayer: function (feature, latlng) {
        // MVPは全件同一スタイル（Phase 3 で severity 色分け、画面設計 §5.1）
        return L.circleMarker(latlng, {
          radius: 8,
          fillColor: '#d33',
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
