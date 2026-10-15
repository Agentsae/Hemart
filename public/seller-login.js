const form = document.querySelector('#seller-login-form'),
  error = document.querySelector('#login-error');
const installButton = document.querySelector('#seller-install');
let installPrompt;
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  installButton.hidden = false;
});
installButton.addEventListener('click', async () => {
  if (!installPrompt) return;
  await installPrompt.prompt();
  installPrompt = null;
  installButton.hidden = true;
});
window.addEventListener('appinstalled', () => {
  installPrompt = null;
  installButton.hidden = true;
});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = form.querySelector('button');
  button.disabled = true;
  error.hidden = true;
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(new FormData(form))),
      cache: 'no-store',
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Tidak bisa masuk. Silakan coba lagi.');
    form.reset();
    location.replace('/seller');
  } catch (e) {
    error.textContent =
      e instanceof TypeError ? 'Tidak dapat terhubung. Periksa koneksi internet.' : e.message;
    error.hidden = false;
  } finally {
    button.disabled = false;
  }
});
