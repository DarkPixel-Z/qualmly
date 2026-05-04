// Qualmly Chrome Extension — service worker
// Handles: keyboard shortcut (Ctrl+Shift+Q) + right-click context menu

'use strict';

const QUALMLY_BASE = 'https://qualmly.dev';

// ── Keyboard shortcut handler ──────────────────────────────────────────────
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'audit-current-tab') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) return;
  if (/^chrome:|^chrome-extension:|^edge:|^about:|^file:|^data:|^javascript:|^vbscript:|^view-source:|^https?:\/\/(www\.)?qualmly\.dev/i.test(tab.url)) {
    return;
  }
  const target = QUALMLY_BASE + '/?url=' + encodeURIComponent(tab.url) + '&utm_source=chrome_kbd';
  chrome.tabs.create({ url: target });
});

// ── Context menu (right-click on page) ─────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'qualmly-audit',
    title: 'Audit this page with Qualmly',
    contexts: ['page', 'link']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'qualmly-audit') return;
  // Use the link URL if it's a link context, else the page URL
  const url = info.linkUrl || info.pageUrl || (tab && tab.url);
  if (!url) return;
  if (/^chrome:|^chrome-extension:|^edge:|^about:|^file:|^data:|^javascript:|^vbscript:|^view-source:|^https?:\/\/(www\.)?qualmly\.dev/i.test(url)) {
    return;
  }
  const target = QUALMLY_BASE + '/?url=' + encodeURIComponent(url) + '&utm_source=chrome_ctxmenu';
  chrome.tabs.create({ url: target });
});
