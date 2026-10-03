(() => {
  const root = document.documentElement;
  const cycle = (list, cur) => list[(list.indexOf(cur) + 1) % list.length];
  const label = (btn, value) => {
    const map = JSON.parse(btn.dataset.labels || '{}');
    btn.textContent = map[value] || value;
  };
  const bind = (name, attr, values) => {
    const btn = document.querySelector(`[data-am="${name}"]`);
    if (!btn) return;
    label(btn, root.getAttribute(attr));
    btn.addEventListener('click', () => {
      const next = cycle(values, root.getAttribute(attr));
      root.setAttribute(attr, next);
      label(btn, next);
    });
  };
  bind('theme', 'data-theme', ['blueprint', 'shadcn']);
  bind('mode', 'data-mode', ['auto', 'light', 'dark']);

  const copyBtn = document.querySelector('[data-am="copy"]');
  copyBtn?.addEventListener('click', async () => {
    const text = document.getElementById('am-source').value;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = Object.assign(document.createElement('textarea'), { value: text });
      document.body.append(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    const original = copyBtn.textContent;
    copyBtn.textContent = copyBtn.dataset.done;
    setTimeout(() => { copyBtn.textContent = original; }, 1400);
  });

  // 阅读路径（research 模板）：5 / 30 / deep，按 data-depth 过滤；选择记在 localStorage。
  const pathBtns = [...document.querySelectorAll('[data-am-path]')];
  if (pathBtns.length) {
    const key = `am-path:${location.pathname}`;
    const setPath = (p) => {
      root.dataset.path = p;
      pathBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.amPath === p)));
      try { localStorage.setItem(key, p); } catch { /* 无痕模式下忽略 */ }
    };
    pathBtns.forEach((b) => b.addEventListener('click', () => setPath(b.dataset.amPath)));
    let saved = null;
    try { saved = localStorage.getItem(key); } catch { /* ignore */ }
    setPath(/[?&]shot\b/.test(location.search) ? 'deep' : saved || 'deep');
  }

  // 烘焙后的 Excalidraw 图：下载 .excalidraw 文件（元素数据已内嵌，离线可用）。
  for (const btn of document.querySelectorAll('[data-am="excal-dl"]')) {
    btn.addEventListener('click', () => {
      const fig = btn.closest('figure');
      const data = fig?.querySelector('script.am-excal-file')?.textContent;
      if (!data) return;
      const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
      Object.assign(document.createElement('a'), { href: url, download: `${fig.dataset.name || fig.id}.excalidraw` }).click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    });
  }
})();
