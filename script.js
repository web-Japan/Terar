/* =========================================================
   BAR 立て看板QR ミニサイト / script.js
   - NOボタンは「押そうとした瞬間」に逃げる
   - 逃げる瞬間に必ず「ヒュンッ」のSEを鳴らす(NO押下後ではない)
   - YESを押したときだけ answer.html へ遷移する
   ========================================================= */

(() => {
  "use strict";

  /* ---------------------------------------------------------
     店舗写真パス自動判定
     1) index.html と同じ階層の shop-photo.jpg
     2) assets/shop-photo.jpg
     の順に探してCSS変数へ設定する
  --------------------------------------------------------- */
  function setShopPhotoPath() {
    const rootPhoto = new Image();
    rootPhoto.onload = () => {
      document.documentElement.style.setProperty(
        "--shop-photo-url",
        'url("shop-photo.jpg")'
      );
    };
    rootPhoto.onerror = () => {
      const assetsPhoto = new Image();
      assetsPhoto.onload = () => {
        document.documentElement.style.setProperty(
          "--shop-photo-url",
          'url("assets/shop-photo.jpg")'
        );
      };
      assetsPhoto.src = "assets/shop-photo.jpg";
    };
    rootPhoto.src = "shop-photo.jpg";
  }

  setShopPhotoPath();


  const yesButton = document.getElementById("yesButton");
  const noButton = document.getElementById("noButton");
  const stage = document.getElementById("stage");
  const buttonRow = document.getElementById("buttonRow");
  const overlay = document.getElementById("transitionOverlay");
  const appleMapsButton = document.getElementById("appleMapsButton");
  const googleMapsButton = document.getElementById("googleMapsButton");

  /* ---------------------------------------------------------
     計測用フック(将来 Google Analytics 等に接続する場所)
     必要に応じて gtag('event', ...) などをここに実装してください
  --------------------------------------------------------- */
  const track = (eventName, detail) => {
    // 例: if (window.gtag) gtag('event', eventName, detail);
    // console.debug('[track]', eventName, detail);
  };

  // answer.html側: マップ導線のクリック計測のみ行う
  if (appleMapsButton) {
    appleMapsButton.addEventListener("click", () => {
      track("apple_maps_button_clicked");
    });
  }

  if (googleMapsButton) {
    googleMapsButton.addEventListener("click", () => {
      track("google_maps_button_clicked");
    });
  }

  // このページに YES/NO ボタンが無ければ(=answer.html側)、
  // 以降の「逃げるNOボタン」ロジックは不要なので終了
  if (!yesButton || !noButton) return;

  /* ---------------------------------------------------------
     NOが逃げる時のSEファイル(assets/whoosh.mp3)
     連打しても毎回先頭から「ヒュンッ」と鳴らせるよう、
     Audioインスタンスを複数用意してプールし、
     再生のたびに新しいインスタンスをcloneして使う。
     再生失敗(自動再生制限・ファイル不在など)は握りつぶし、
     ボタンの動作(逃走)自体は必ず継続させる。
  --------------------------------------------------------- */
  const SE_PATH = "assets/whoosh.mp3";
  let seUnlocked = false;
  const baseAudio = new Audio(SE_PATH);
  baseAudio.preload = "auto";
  baseAudio.volume = 0.85;

  function playWhoosh() {
    try {
      const node = baseAudio.cloneNode(true);
      node.volume = 0.85;
      const p = node.play();
      if (p && typeof p.catch === "function") {
        p.catch(() => {
          /* 自動再生ブロック等は無視して処理を継続 */
        });
      }
      // 再生し終わったノードは自動的にGCされるが、念のため後始末
      node.addEventListener("ended", () => node.remove(), { once: true });
    } catch (err) {
      /* SEが鳴らせなくてもサイトは壊さない */
    }
  }

  // iOSはユーザー操作なしに音を鳴らせないため、最初のタッチ/クリックで
  // 無音再生して再生権限を「解錠」しておく(体験上は自然に解決する)
  function unlockAudioOnce() {
    if (seUnlocked) return;
    seUnlocked = true;
    try {
      baseAudio.play()
        .then(() => {
          baseAudio.pause();
          baseAudio.currentTime = 0;
        })
        .catch(() => {});
    } catch (err) {
      /* noop */
    }
  }
  window.addEventListener("pointerdown", unlockAudioOnce, {
    once: true,
    passive: true,
  });

  /* ---------------------------------------------------------
     Safe Area(ノッチ/ホームバー)の実測px値を取得
  --------------------------------------------------------- */
  function getSafeAreaInsets() {
    const probe = document.createElement("div");
    probe.style.position = "fixed";
    probe.style.top = "0";
    probe.style.left = "0";
    probe.style.width = "0";
    probe.style.height = "0";
    probe.style.paddingTop = "env(safe-area-inset-top)";
    probe.style.paddingRight = "env(safe-area-inset-right)";
    probe.style.paddingBottom = "env(safe-area-inset-bottom)";
    probe.style.paddingLeft = "env(safe-area-inset-left)";
    probe.style.visibility = "hidden";
    document.body.appendChild(probe);
    const cs = getComputedStyle(probe);
    const insets = {
      top: parseFloat(cs.paddingTop) || 0,
      right: parseFloat(cs.paddingRight) || 0,
      bottom: parseFloat(cs.paddingBottom) || 0,
      left: parseFloat(cs.paddingLeft) || 0,
    };
    probe.remove();
    return insets;
  }

  const safeArea = getSafeAreaInsets();

  /* ---------------------------------------------------------
     NOボタンの逃走ロジック
  --------------------------------------------------------- */
  const MARGIN = 16; // 画面端からの最低距離
  const GAP_FROM_YES = 18; // YESボタンとの最低距離
  let fleeing = false;
  let lastRect = null;

  function rectsOverlap(a, b, gap) {
    return !(
      a.right + gap < b.left ||
      a.left - gap > b.right ||
      a.bottom + gap < b.top ||
      a.top - gap > b.bottom
    );
  }

  function pickPosition(noW, noH) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const minX = safeArea.left + MARGIN;
    const maxX = vw - safeArea.right - MARGIN - noW;
    const minY = safeArea.top + MARGIN;
    const maxY = vh - safeArea.bottom - MARGIN - noH;

    const yesRect = yesButton.getBoundingClientRect();
    const copyRect = stage.querySelector(".copy").getBoundingClientRect();

    // メインコピーを覆いすぎないよう、コピー領域は軽めに避ける対象にする
    const avoidCopy = {
      left: copyRect.left,
      right: copyRect.right,
      top: copyRect.top,
      bottom: copyRect.bottom,
    };

    let best = null;
    for (let i = 0; i < 24; i++) {
      const x = minX + Math.random() * Math.max(1, maxX - minX);
      const y = minY + Math.random() * Math.max(1, maxY - minY);
      const candidate = { left: x, right: x + noW, top: y, bottom: y + noH };

      const hitsYes = rectsOverlap(candidate, yesRect, GAP_FROM_YES);
      const hitsCopy = rectsOverlap(candidate, avoidCopy, 6);

      if (!hitsYes && !hitsCopy) {
        best = { x, y };
        break;
      }
      // 妥協案として、YESとさえ被っていなければ採用候補にしておく
      if (!hitsYes && !best) {
        best = { x, y };
      }
    }

    if (!best) {
      // どうしても見つからない場合の最終フォールバック(中央下寄り)
      best = {
        x: Math.min(Math.max(minX, (vw - noW) / 2), maxX),
        y: Math.min(Math.max(minY, vh * 0.72), maxY),
      };
    }
    return best;
  }

  function fleeNoButton() {
    const rect = noButton.getBoundingClientRect();

    if (!fleeing) {
      // 初回逃走: レイアウト上の現在位置で fixed に切り替え、
      // 見た目のジャンプを防ぐ
      noButton.style.width = rect.width + "px";
      noButton.style.height = rect.height + "px";
      noButton.style.transition = "none";
      noButton.classList.add("is-fleeing");
      noButton.style.left = rect.left + "px";
      noButton.style.top = rect.top + "px";
      // 強制リフロー後にtransitionを再度有効化
      // eslint-disable-next-line no-unused-expressions
      noButton.offsetHeight;
      noButton.style.transition = "";
      fleeing = true;
    }

    const w = rect.width;
    const h = rect.height;
    const next = pickPosition(w, h);

    // 「押そうとする瞬間」と同時にSEを鳴らす(移動と同時開始)
    playWhoosh();

    noButton.style.left = next.x + "px";
    noButton.style.top = next.y + "px";
    lastRect = { left: next.x, top: next.y, width: w, height: h };

    track("no_button_fled", { x: next.x, y: next.y });
  }

  // PC: マウスがNOボタンに近づいたら逃げる
  const PROXIMITY_PX = 85;
  let ticking = false;
  window.addEventListener(
    "pointermove",
    (e) => {
      if (e.pointerType !== "mouse") return; // マウスのみ対象(タッチは別処理)
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const rect = noButton.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = e.clientX - cx;
        const dy = e.clientY - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < PROXIMITY_PX) {
          fleeNoButton();
        }
      });
    },
    { passive: true }
  );

  // スマホ: タップが成立する前(pointerdown/touchstart)に逃げる
  function onTryTouchNo(e) {
    e.preventDefault();
    fleeNoButton();
  }
  noButton.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse") return; // マウスは上のproximityで処理済み
    onTryTouchNo(e);
  });
  noButton.addEventListener("touchstart", onTryTouchNo, { passive: false });

  // 万一クリックが成立してしまっても、NOではページ遷移させない
  noButton.addEventListener("click", (e) => {
    e.preventDefault();
    fleeNoButton();
  });

  /* ---------------------------------------------------------
     YESボタン: 押したときだけ次のページへ
  --------------------------------------------------------- */
  let navigating = false;
  yesButton.addEventListener("click", () => {
    if (navigating) return;
    navigating = true;

    track("yes_button_clicked");

    yesButton.disabled = true;
    noButton.style.pointerEvents = "none";

    overlay.classList.add("is-active");

    window.setTimeout(() => {
      window.location.href = "answer.html";
    }, 5350);
  });
})();
