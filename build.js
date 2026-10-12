// 슬라이드 묶기: node build.js
// slides/ 폴더의 "두 자리 번호-이름.html" 파일을 번호 순으로 모아 index.html 하나로 만듭니다.
// 슬라이드 안의 {{title}}, {{subtitle}}, {{presenter}}, {{date}} 는 deck.config.json 값으로 바뀝니다.

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SLIDES_DIR = path.join(ROOT, 'slides');
const CONFIG_FILE = path.join(ROOT, 'deck.config.json');
const OUT_FILE = path.join(ROOT, 'index.html');

const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// {{key}} → 설정값 (HTML 이스케이프). 설정에 없는 키는 그대로 둡니다.
const fill = (text) =>
  text.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, key) => (key in config ? escapeHtml(config[key]) : m));

const files = fs
  .readdirSync(SLIDES_DIR)
  .filter((f) => /^\d{2}-.+\.html$/i.test(f))
  .sort();

if (files.length === 0) {
  console.error('slides 폴더에 "01-이름.html" 형식의 슬라이드가 없습니다.');
  process.exit(1);
}

const slides = files.map((file) => {
  const html = fill(fs.readFileSync(path.join(SLIDES_DIR, file), 'utf8'));
  const m = html.match(/<title>([\s\S]*?)<\/title>/i);
  const title = m ? m[1].trim() : file.replace(/^\d{2}-|\.html$/gi, '').replace(/-/g, ' ');
  return { file, title, html };
});

// <script> 안에 안전하게 넣기 위해 '<' 를 이스케이프
const deckJson = JSON.stringify({ slides }).replace(/</g, '\\u003c');

const page = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(config.title)} - ${escapeHtml(config.subtitle)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; }
  body {
    font-family: "Pretendard", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif;
    background: #2b2420; color: #fff; overflow: hidden;
    display: flex; flex-direction: column;
  }
  #viewport { flex: 1; position: relative; overflow: hidden; }
  #stage {
    position: absolute; left: 50%; top: 50%; width: 1280px; height: 720px;
    transform-origin: center center; box-shadow: 0 10px 40px rgba(0,0,0,.4); background: #fff;
  }
  #stage iframe {
    position: absolute; inset: 0; width: 1280px; height: 720px; border: 0;
    pointer-events: none; display: none;
  }
  #stage iframe.active { display: block; }

  #bar {
    height: 56px; flex: none; display: flex; align-items: center; gap: 8px; padding: 0 16px;
    background: #1d1815; font-size: 15px;
  }
  #bar .deck-title { flex: 1; opacity: .75; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #bar button {
    font: inherit; color: #fff; background: #3d332d; border: 0; border-radius: 8px;
    padding: 8px 14px; cursor: pointer;
  }
  #bar button:hover { background: #57483f; }
  #bar button:disabled { opacity: .35; cursor: default; }
  #counter { min-width: 64px; text-align: center; font-variant-numeric: tabular-nums; }

  .overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,.6); display: none;
    align-items: center; justify-content: center; z-index: 10;
  }
  .overlay.open { display: flex; }
  .panel { background: #fff; color: #3b2f2a; border-radius: 16px; padding: 28px 32px; max-width: 90vw; max-height: 85vh; overflow: auto; }
  .panel h2 { font-size: 22px; margin-bottom: 16px; }
  #toc-list { list-style: none; min-width: 320px; }
  #toc-list button {
    width: 100%; text-align: left; font: inherit; font-size: 18px; background: none; border: 0;
    padding: 10px 12px; border-radius: 8px; cursor: pointer; color: inherit;
  }
  #toc-list button:hover { background: #fff1de; }
  #toc-list button.current { background: #ffe2bf; font-weight: 700; }
  #toc-list .n { display: inline-block; width: 36px; color: #c0612b; font-weight: 700; }
  #qr-box { text-align: center; }
  #qr-box svg { width: min(60vh, 70vw); height: auto; display: block; margin: 0 auto; }
  #qr-url { margin-top: 12px; font-size: 14px; color: #6a564b; word-break: break-all; max-width: min(60vh, 70vw); }
</style>
</head>
<body>
  <div id="viewport"><div id="stage"></div></div>

  <div id="bar">
    <span class="deck-title">${escapeHtml(config.title)} · ${escapeHtml(config.presenter)} · ${escapeHtml(config.date)}</span>
    <button id="btn-toc">목차</button>
    <button id="btn-qr">QR</button>
    <button id="btn-fs">전체화면</button>
    <button id="btn-prev" aria-label="이전">◀</button>
    <span id="counter"></span>
    <button id="btn-next" aria-label="다음">▶</button>
  </div>

  <div class="overlay" id="toc"><div class="panel"><h2>목차</h2><ol id="toc-list"></ol></div></div>
  <div class="overlay" id="qr"><div class="panel" id="qr-box"><h2>휴대폰으로 보기</h2><div id="qr-code"></div><p id="qr-url"></p></div></div>

<script src="vendor/qrcode.js"></script>
<script>
const DECK = ${deckJson};
const stage = document.getElementById('stage');
const counter = document.getElementById('counter');
const prevBtn = document.getElementById('btn-prev');
const nextBtn = document.getElementById('btn-next');
const tocList = document.getElementById('toc-list');
const total = DECK.slides.length;
let current = 0;

const frames = DECK.slides.map((s, i) => {
  const f = document.createElement('iframe');
  f.title = s.title;
  f.tabIndex = -1;
  f.srcdoc = s.html;
  stage.appendChild(f);

  const li = document.createElement('li');
  const b = document.createElement('button');
  b.innerHTML = '<span class="n">' + (i + 1) + '</span>';
  b.appendChild(document.createTextNode(s.title));
  b.onclick = () => { go(i); closeOverlays(); };
  li.appendChild(b);
  tocList.appendChild(li);
  return f;
});

function go(i) {
  current = Math.max(0, Math.min(total - 1, i));
  frames.forEach((f, k) => f.classList.toggle('active', k === current));
  [...tocList.querySelectorAll('button')].forEach((b, k) => b.classList.toggle('current', k === current));
  counter.textContent = (current + 1) + ' / ' + total;
  prevBtn.disabled = current === 0;
  nextBtn.disabled = current === total - 1;
  history.replaceState(null, '', '#' + (current + 1));
}

function fit() {
  const vp = document.getElementById('viewport');
  const scale = Math.min(vp.clientWidth / 1280, vp.clientHeight / 720) * 0.96;
  stage.style.transform = 'translate(-50%, -50%) scale(' + scale + ')';
}

function closeOverlays() {
  document.querySelectorAll('.overlay.open').forEach((o) => o.classList.remove('open'));
}
function toggleOverlay(id) {
  const el = document.getElementById(id);
  const willOpen = !el.classList.contains('open');
  closeOverlays();
  if (willOpen) el.classList.add('open');
  return willOpen;
}

function showQr() {
  if (!toggleOverlay('qr')) return;
  const url = location.href.split('#')[0];
  const qr = qrcode(0, 'M');
  qr.addData(unescape(encodeURIComponent(url)), 'Byte'); // UTF-8 바이트로 넣기
  qr.make();
  document.getElementById('qr-code').innerHTML = qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
  document.getElementById('qr-url').textContent = url;
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() => {});
}

prevBtn.onclick = () => go(current - 1);
nextBtn.onclick = () => go(current + 1);
document.getElementById('btn-toc').onclick = () => toggleOverlay('toc');
document.getElementById('btn-qr').onclick = showQr;
document.getElementById('btn-fs').onclick = toggleFullscreen;
document.querySelectorAll('.overlay').forEach((o) => o.addEventListener('click', (e) => { if (e.target === o) closeOverlays(); }));
document.addEventListener('fullscreenchange', () => {
  document.getElementById('btn-fs').textContent = document.fullscreenElement ? '전체화면 끝' : '전체화면';
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); go(current + 1); }
  else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(current - 1); }
  else if (e.key === 'Home') go(0);
  else if (e.key === 'End') go(total - 1);
  else if (e.key === 'Escape') closeOverlays();
  else if (e.key === 'f' || e.key === 'F') toggleFullscreen();
});

// 휴대폰에서 좌우로 밀어 넘기기
let touchX = null;
document.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
document.addEventListener('touchend', (e) => {
  if (touchX === null) return;
  const dx = e.changedTouches[0].clientX - touchX;
  if (Math.abs(dx) > 50) go(current + (dx < 0 ? 1 : -1));
  touchX = null;
});

window.addEventListener('resize', fit);
fit();
go((parseInt(location.hash.slice(1), 10) || 1) - 1);
</script>
</body>
</html>
`;

fs.writeFileSync(OUT_FILE, page, 'utf8');
console.log('index.html 생성 완료 (' + slides.length + '장)');
slides.forEach((s) => console.log('  ' + s.file + '  →  ' + s.title));
