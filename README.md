# Make My Outfit — PWA Starter (Dual-mode uploads)

A Progressive Web App that generates outfit images with Gemini (gemini-2.5-flash-image-preview) and supports **two delivery modes**:
- **Server-managed** upload (server uploads to a bucket and returns a public URL)
- **Direct client upload** into an outfit-maker's Google Cloud Storage bucket via signed URL (the outfit maker controls the bucket and access)

## Quick start (local dev)

1. Install dependencies
```bash
npm install
```

2. Set up Google credentials for server-managed upload (optional)
- Create a service account with Storage permissions and set `GOOGLE_APPLICATION_CREDENTIALS` to the JSON key file.
- Optionally set `GCS_BUCKET` env var to your server bucket name.

3. Start server
```bash
npm start
# open http://localhost:3000
```

4. In the app, click **Set API Key** and paste your Gemini API key (the app forwards it to the server via X-API-Key).

## How to use the dual-mode upload:

### Server-managed upload (default)
- Leave **Direct upload to my bucket** OFF. The server will call Gemini using the API key you provided and upload results to the server's GCS bucket. The server returns a public GCS URL.

### Direct client upload (recommended for outfit-makers)
- The outfit maker deploys a small Signed URL provider (Cloud Function) into *their* Google project (example: `server/signed_url_function_example.js`).
- In the PWA Storage Settings enable **Direct upload to my bucket**, set the bucket name, and paste the Cloud Function URL as the Signed URL Provider.
- When generating images, the server returns Base64 and the client requests a signed URL from the provider and PUTs the PNG directly into the outfit maker's bucket. The public URL is then shown and can be shared with makers.

## Deploying the Signed URL provider (Cloud Function example)
See `server/signed_url_function_example.js` for the example cloud function. Deploy it in the outfit maker's project:
```bash
gcloud functions deploy getSignedUrl --runtime=nodejs18 --trigger-http --allow-unauthenticated --set-env-vars GCS_BUCKET=make-my-outfit-outputs --project=OUTFIT_PROJECT_ID
```

> IMPORTANT: Secure the function (IAM or token) before production use. The example is intentionally permissive to simplify testing.

## Notes
- This starter uses a simple measurement estimator placeholder. Replace `/api/measurements/estimate` with a real pose/landmark model for production.
- The app stores API keys only in browser localStorage and forwards them to the server via the `X-API-Key` header. Do not share keys publicly.

