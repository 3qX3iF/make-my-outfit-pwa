/* Make My Outfit - PWA logic (dual-mode upload) */

let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; });

const els = {
  installBtn: document.getElementById('installBtn'),
  fullName: document.getElementById('fullName'),
  email: document.getElementById('email'),
  heightCm: document.getElementById('heightCm'),
  chestCm: document.getElementById('chestCm'),
  waistCm: document.getElementById('waistCm'),
  hipsCm: document.getElementById('hipsCm'),
  userPhoto: document.getElementById('userPhoto'),
  estimateBtn: document.getElementById('estimateBtn'),
  promptInput: document.getElementById('promptInput'),
  generateBtn: document.getElementById('generateBtn'),
  reviseBtn: document.getElementById('reviseBtn'),
  revisionInput: document.getElementById('revisionInput'),
  tryOnToggle: document.getElementById('tryOnToggle'),
  imgW: document.getElementById('imgW'),
  imgH: document.getElementById('imgH'),
  loading: document.getElementById('loading'),
  imageOutput: document.getElementById('imageOutput'),
  generatedImage: document.getElementById('generatedImage'),
  downloadLink: document.getElementById('downloadLink'),
  error: document.getElementById('error'),
  errorMessage: document.getElementById('errorMessage'),
  outfitId: document.getElementById('outfitId'),
  apiKeyDialog: document.getElementById('apiKeyDialog'),
  apiKeyInput: document.getElementById('apiKeyInput'),
  saveApiKeyBtn: document.getElementById('saveApiKeyBtn'),
  cancelApiKeyBtn: document.getElementById('cancelApiKeyBtn'),
  apiKeyBtn: document.getElementById('apiKeyBtn'),
  directUploadToggle: document.getElementById('directUploadToggle'),
  clientBucketName: document.getElementById('clientBucketName'),
  signedUrlProvider: document.getElementById('signedUrlProvider'),
};

// Register service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js');
}

function getApiKey() { return localStorage.getItem('GEMINI_API_KEY') || ''; }
function setApiKey(k) { localStorage.setItem('GEMINI_API_KEY', k); }

function loadStorageSettings() {
  const v = JSON.parse(localStorage.getItem('outfit_storage_settings') || '{}');
  try {
    els.directUploadToggle.checked = !!v.directUpload;
    els.clientBucketName.value = v.bucketName || '';
    els.signedUrlProvider.value = v.signedUrlProvider || '';
  } catch (e) {}
}
function saveStorageSettings() {
  const v = { directUpload: els.directUploadToggle.checked, bucketName: els.clientBucketName.value.trim(), signedUrlProvider: els.signedUrlProvider.value.trim() };
  localStorage.setItem('outfit_storage_settings', JSON.stringify(v));
}
window.addEventListener('beforeunload', saveStorageSettings);
loadStorageSettings();

function buildFinalPrompt(userPrompt) {
  const masterInstruction = "create a unique " + userPrompt +
    ", can be any material or combination of materials, " +
    "can use any combination of accessories or jewelry, " +
    "can use any combination of cutouts, can use any combination of straps, " +
    "emphasis for accents or eye drawing details.";
  return masterInstruction;
}

function outfitNumber() {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 6);
  return `OUT-${t}-${r}`.toUpperCase();
}

async function fileToBase64(file) {
  if (!file) return null;
  const buf = await file.arrayBuffer();
  const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
  return { data: b64, mimeType: file.type || 'image/png' };
}

function base64ToUint8Array(b64) {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function saveHistory(entry) {
  const arr = JSON.parse(localStorage.getItem('outfit_history') || '[]');
  arr.unshift(entry);
  localStorage.setItem('outfit_history', JSON.stringify(arr.slice(0, 50)));
}

function setLoading(v) {
  els.loading.classList.toggle('hidden', !v);
  els.generateBtn.disabled = v;
  els.reviseBtn.disabled = v;
}

async function estimateMeasurements() {
  const height = Number(els.heightCm.value || 0);
  if (!height) { alert('Enter your height (cm) first.'); return; }
  const photo = els.userPhoto.files?.[0];
  if (!photo) { alert('Upload a full-body photo first.'); return; }
  try {
    setLoading(true);
    const body = { heightCm: height, userImage: await fileToBase64(photo) };
    const res = await fetch('/api/measurements/estimate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': getApiKey() },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || res.statusText);
    if (json.chestCm) els.chestCm.value = json.chestCm;
    if (json.waistCm) els.waistCm.value = json.waistCm;
    if (json.hipsCm) els.hipsCm.value = json.hipsCm;
  } catch (err) {
    els.errorMessage.textContent = err.message;
    els.error.classList.remove('hidden');
  } finally { setLoading(false); }
}

async function generateOrRevise({ isRevision = false } = {}) {
  if (!getApiKey()) { els.apiKeyDialog.showModal(); return; }
  const promptText = els.promptInput.value.trim();
  const revisionText = els.revisionInput.value.trim();
  if (!promptText) { alert('Please describe the outfit.'); return; }

  const outfitId = outfitNumber();
  const master = buildFinalPrompt(promptText);
  const tryOn = els.tryOnToggle.checked;
  const width = Number(els.imgW.value || 1024);
  const height = Number(els.imgH.value || 1024);
  const userPhotoFile = els.userPhoto.files?.[0];
  const userPhoto = tryOn && userPhotoFile ? await fileToBase64(userPhotoFile) : null;

  const body = {
    outfitId, masterPrompt: master, revisionText: isRevision ? revisionText : '',
    options: { width, height, tryOn },
    userInfo: {
      fullName: els.fullName.value.trim(),
      email: els.email.value.trim(),
      heightCm: Number(els.heightCm.value || 0),
      chestCm: Number(els.chestCm.value || 0),
      waistCm: Number(els.waistCm.value || 0),
      hipsCm: Number(els.hipsCm.value || 0),
    },
    userImage: userPhoto,
    directClientUpload: els.directUploadToggle.checked,
  };

  try {
    setLoading(true);
    const endpoint = isRevision ? '/api/images/revise' : '/api/images/generate';
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': getApiKey() },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || res.statusText);
    // Handle server-managed upload (imageUrl) or base64 returned for client upload
    const imageBase64 = json.imageBase64;
    const imageUrl = json.imageUrl || null;
    if (imageUrl) {
      // Server-managed upload returned a public URL
      els.generatedImage.src = imageUrl;
      els.downloadLink.href = imageUrl;
      els.imageOutput.classList.remove('hidden');
      els.outfitId.textContent = outfitId;
      els.reviseBtn.disabled = false;
      saveHistory({ outfitId, promptText, revisionText, ts: Date.now(), url: imageUrl });
    } else if (imageBase64) {
      // Server returned Base64 (client upload mode) — display inline and optionally upload to user's bucket
      const dataUrl = 'data:image/png;base64,' + imageBase64;
      els.generatedImage.src = dataUrl;
      els.downloadLink.href = dataUrl;
      els.imageOutput.classList.remove('hidden');
      els.outfitId.textContent = outfitId;
      els.reviseBtn.disabled = false;
      if (els.directUploadToggle.checked) {
        const provider = els.signedUrlProvider.value.trim();
        const filename = outfitId + '.png';
        try {
          if (!provider) throw new Error('Signed URL provider endpoint not configured.');
          const svRes = await fetch(provider, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileName: filename, contentType: 'image/png', bucketName: els.clientBucketName.value.trim() })
          });
          const svJson = await svRes.json();
          if (!svRes.ok) throw new Error(svJson.error || svRes.statusText);
          const signedUrl = svJson.signedUrl || svJson.url;
          const publicUrl = svJson.publicUrl || `https://storage.googleapis.com/${els.clientBucketName.value.trim()}/${filename}`;
          const bytes = base64ToUint8Array(imageBase64);
          const putRes = await fetch(signedUrl, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: bytes });
          if (!putRes.ok) throw new Error('Upload to signed URL failed: ' + putRes.statusText);
          els.generatedImage.src = publicUrl;
          els.downloadLink.href = publicUrl;
          saveHistory({ outfitId, promptText, revisionText, ts: Date.now(), url: publicUrl });
        } catch (err2) {
          console.error(err2);
          els.errorMessage.textContent = 'Direct upload failed: ' + (err2.message || err2);
          els.error.classList.remove('hidden');
          saveHistory({ outfitId, promptText, revisionText, ts: Date.now(), url: dataUrl });
        }
      } else {
        saveHistory({ outfitId, promptText, revisionText, ts: Date.now(), url: dataUrl });
      }
    } else {
      throw new Error('No image data returned from server.');
    }
  } catch (err) {
    els.errorMessage.textContent = err.message;
    els.error.classList.remove('hidden');
  } finally {
    setLoading(false);
  }
}

// Event listeners
els.generateBtn.addEventListener('click', () => generateOrRevise({ isRevision: false }));
els.reviseBtn.addEventListener('click', () => generateOrRevise({ isRevision: true }));
els.estimateBtn.addEventListener('click', estimateMeasurements);

// API key dialog handlers
els.apiKeyBtn.addEventListener('click', () => els.apiKeyDialog.showModal());
els.saveApiKeyBtn.addEventListener('click', (e) => {
  e.preventDefault();
  const v = els.apiKeyInput.value.trim();
  if (!v) return;
  setApiKey(v);
  els.apiKeyDialog.close();
});
els.cancelApiKeyBtn.addEventListener('click', (e) => { e.preventDefault(); els.apiKeyDialog.close(); });

// Install prompt
els.installBtn.addEventListener('click', async () => {
  if (deferredPrompt) { deferredPrompt.prompt(); deferredPrompt = null; }
});

// Ask for API key on first use
if (!getApiKey()) els.apiKeyDialog.showModal();
