/* Apply the saved colour theme before CSS loads. New and invalid preferences use Sky Blue. */
'use strict';
(() => {
  let theme = 'sky';
  try { const saved = localStorage.getItem('teachersinn-theme'); if (saved === 'classic' || saved === 'sky') theme = saved; } catch { /* local storage may be unavailable */ }
  document.documentElement.dataset.theme = theme;
  let mode = 'system';
  try { const savedMode = localStorage.getItem('teachersinn-color-mode'); if (savedMode === 'light' || savedMode === 'dark' || savedMode === 'system') mode = savedMode; } catch { /* local storage may be unavailable */ }
  document.documentElement.dataset.mode = mode;
  const colour = document.querySelector('meta[name="theme-color"]');
  if (colour) colour.content = theme === 'sky' ? '#2563eb' : '#fbd36b';
})();
