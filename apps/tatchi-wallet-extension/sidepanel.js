const statusEl = document.getElementById('status');
const logEl = document.getElementById('log');
const btnPing = document.getElementById('btnPing');

function log(line) {
  const ts = new Date().toISOString();
  logEl.textContent = `${ts} ${line}\n` + (logEl.textContent || '');
}

function setStatus(s) {
  statusEl.textContent = s;
}

btnPing?.addEventListener('click', async () => {
  setStatus('pinging…');
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'PANEL_PING' });
    log(`PANEL_PING → ${JSON.stringify(resp)}`);
    setStatus('ok');
  } catch (err) {
    log(`PANEL_PING error: ${String(err?.message || err)}`);
    setStatus('error');
  }
});

log('Side Panel ready');
