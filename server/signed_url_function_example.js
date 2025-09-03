// Example Google Cloud Function (Node.js) to generate a signed PUT URL for GCS
// Deploy using: gcloud functions deploy getSignedUrl --runtime=nodejs18 --trigger-http --allow-unauthenticated
// NOTE: For production, protect this endpoint (auth) and restrict who can call it; this example is minimal.
import { Storage } from "@google-cloud/storage";

const storage = new Storage();
const DEFAULT_BUCKET = process.env.GCS_BUCKET || "make-my-outfit-outputs";

export async function getSignedUrl(req, res) {
  try {
    const { fileName, contentType, bucketName } = req.body || {};
    const bucket = storage.bucket(bucketName || DEFAULT_BUCKET);
    const file = bucket.file(fileName);
    const expires = Date.now() + 15 * 60 * 1000; // 15 minutes
    const options = {
      version: "v4",
      action: "write",
      expires,
      contentType: contentType || "image/png"
    };
    const [signedUrl] = await file.getSignedUrl(options);
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
    res.json({ signedUrl, publicUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || String(err) });
  }
}
