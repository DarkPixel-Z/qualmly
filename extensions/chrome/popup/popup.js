// Qualmly Chrome Extension — popup script
// Reads the active tab's URL and opens qualmly.dev with that URL pre-filled.

'use strict';

const QUALMLY_BASE = 'https://qualmly.dev';

(async () => {
  const urlDisplay = document.getElementById('url-display');
  const auditBtn = document.getElementById('audit-btn');
  const auditBtnCode = document.getElementById('audit-btn-code');
  const warn = document.getElementById('warn');

  let activeTab;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    activeTab = tab;
  } catch (e) {
    urlDisplay.textContent = 'Could not read current tab';
    auditBtn.disabled = true;
    return;
  }

  if (!activeTab || !activeTab.url) {
    urlDisplay.textContent = 'No active tab';
    auditBtn.disabled = true;
    return;
  }

  const url = activeTab.url;
  urlDisplay.textContent = url;

  // Block useless URLs
  if (/^chrome:|^chrome-extension:|^edge:|^about:|^file:|^data:/i.test(url)) {
    urlDisplay.style.color = 'var(--warn)';
    auditBtn.disabled = true;
    auditBtn.style.opacity = '0.5';
    auditBtn.style.cursor = 'not-allowed';
    warn.style.display = 'block';
    warn.textContent = 'Internal browser pages can\'t be audited.';
    return;
  }

  // Don't audit qualmly.dev itself
  if (/^https?:\/\/(www\.)?qualmly\.dev/i.test(url)) {
    urlDisplay.style.color = 'var(--warn)';
    auditBtn.disabled = true;
    auditBtn.style.opacity = '0.5';
    auditBtn.style.cursor = 'not-allowed';
    warn.style.display = 'block';
    warn.textContent = 'You\'re already on Qualmly. Try this on a Lovable or Bolt app.';
    return;
  }

  auditBtn.addEventListener('click', () => {
    const target = QUALMLY_BASE + '/?url=' + encodeURIComponent(url) + '&utm_source=chrome_extension';
    chrome.tabs.create({ url: target });
    window.close();
  });

  auditBtnCode.addEventListener('click', () => {
    const target = QUALMLY_BASE + '/?mode=code&utm_source=chrome_extension';
    chrome.tabs.create({ url: target });
    window.close();
  });
})();
