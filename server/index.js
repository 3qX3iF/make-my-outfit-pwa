// Express backend to proxy Gemini API calls and optionally upload to server bucket
import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import { Storage } from "@google-cloud/storage";

const app = express();
app.use(cors());
app.use(express.json({ limit: "25mb" }));
app.use(express.static("public"));

const GEMINI_MODEL = "gemini-2.5-flash-image-preview"; // per docs
const storage = new Storage();
const bucketName = process.env.GCS_BUCKET || "make-my-outfit-outputs";

function requireApiKey(req, res) {
  const key = req.header("X-API-Key");
  if (!key) {
    res.status(401).json({ error: "Missing X-API-Key header" });
    return null;
  }
  return key;
}

async function callGeminiGenerate({ apiKey, contents }) {
  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({ contents: [{ parts: contents }] }),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Gemini error ${resp.status}: ${txt}`);
  }
  const data = await resp.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find(p => p.inlineData || p.inline_data);
  const b64 = imagePart?.inlineData?.data || imagePart?.inline_data?.data;
  if (!b64) {
    const text = parts.find(p => p.text)?.text || "No image content returned";
    throw new Error(text);
  }
  return b64;
}

function buildTextToImageContents({ masterPrompt, userImage, width, height }) {
  const parts = [{ text: masterPrompt }];
  parts[0].text += ` Generate a detailed full outfit render. Aspect: ${width}x${height}.`;
  if (userImage) {
    parts.push({
      inlineData: { mimeType: userImage.mimeType || "image/png", data: userImage.data }
    });
    parts.push({
      text: "Fit the newly designed outfit onto the person photo realistically (pose-aware), keep the face and body intact."
    });
  }
  return parts;
}

function buildRevisionContents({ lastImageBase64, revisionText, userImage }) {
  const parts = [
    { text: `Edit this outfit exactly as instructed: ${revisionText}. Preserve overall style and realism.` },
    { inlineData: { mimeType: "image/png", data: lastImageBase64 } },
  ];
  if (userImage) {
    parts.push({ inlineData: { mimeType: userImage.mimeType || "image/png", data: userImage.data } });
    parts.push({ text: "If appropriate, also reflect the change on the try-on preview while keeping likeness consistent." });
  }
  return parts;
}

// Upload Base64 image to GCS and return public URL
async function uploadToGCS(outfitId, imageBase64) {
  const buffer = Buffer.from(imageBase64, "base64");
  const fileName = outfitId + ".png";
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(fileName);
  await file.save(buffer, { contentType: "image/png" });
  await file.makePublic();
  return `https://storage.googleapis.com/${bucketName}/${fileName}`;
}

// Endpoint: generate new image from text + master instruction
app.post("/api/images/generate", async (req, res) => {
  try {
    const apiKey = requireApiKey(req); if (!apiKey) return;
    const { outfitId, masterPrompt, userImage, options } = req.body || {};
    const width = options?.width || 1024;
    const height = options?.height || 1024;
    const contents = buildTextToImageContents({ masterPrompt, userImage: req.body?.options?.tryOn ? userImage : null, width, height });
    const imageBase64 = await callGeminiGenerate({ apiKey, contents });
    lastImageBase64 = imageBase64;
    // If client requests to handle upload directly, return base64 to client
    if (req.body && req.body.directClientUpload) {
      res.json({ outfitId, imageBase64 });
      return;
    }
    const imageUrl = await uploadToGCS(outfitId, imageBase64);
    res.json({ outfitId, imageUrl });
  } catch (err) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

// In-memory last image store per simple dev session (for demo)
let lastImageBase64 = null;

app.post("/api/images/revise", async (req, res) => {
  try {
    const apiKey = requireApiKey(req); if (!apiKey) return;
    const { revisionText, userImage } = req.body || {};
    if (!lastImageBase64) {
      res.status(400).json({ error: "No prior image to revise in this session." });
      return;
    }
    const contents = buildRevisionContents({ lastImageBase64, revisionText, userImage });
    const imageBase64 = await callGeminiGenerate({ apiKey, contents });
    lastImageBase64 = imageBase64;
    if (req.body && req.body.directClientUpload) {
      res.json({ imageBase64 });
      return;
    }
    const imageUrl = await uploadToGCS("rev-" + Date.now().toString(36), imageBase64);
    res.json({ imageUrl });
  } catch (err) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

// Endpoint to estimate measurements from photo (placeholder heuristic)
app.post("/api/measurements/estimate", async (req, res) => {
  try {
    const { heightCm, userImage } = req.body || {};
    if (!heightCm || !userImage) {
      return res.status(400).json({ error: "Provide heightCm and userImage" });
    }
    const h = Number(heightCm);
    const chestCm = Math.round(h * 0.54);
    const waistCm = Math.round(h * 0.43);
    const hipsCm = Math.round(h * 0.56);
    res.json({ chestCm, waistCm, hipsCm });
  } catch (err) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

// Serve app
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Make My Outfit server running on http://localhost:${PORT}`));
