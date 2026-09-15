RUSH CLIPS — CLOUDFLARE + CLOUDINARY ADMIN MEDIA

This version keeps the original Rush Clips design and admin login, but moves uploaded photos/videos from Cloudflare R2 to Cloudinary.

WHAT YOU GET
- Existing Rush Clips static website served by the Cloudflare Worker.
- One password-protected admin upload area.
- Upload images and videos from your phone.
- Media is uploaded to Cloudinary and displayed from Cloudinary CDN URLs.
- No R2 bucket is required by this version.
- No customer accounts and no database.
- Admin session lasts 7 days.
- Existing public gallery automatically loads media tagged "rushclips" from Cloudinary.

CLOUDFLARE WORKER SECRETS
In the Rush Clips Worker, add these as encrypted secrets/variables:

ADMIN_PASSWORD = your private admin password
CLOUDINARY_CLOUD_NAME = bogfjwb6
CLOUDINARY_UPLOAD_PRESET = rushclips_upload
CLOUDINARY_API_KEY = your Cloudinary API key
CLOUDINARY_API_SECRET = your Cloudinary API secret

Never put CLOUDINARY_API_SECRET in index.html, script.js, or any public file.

WHY THE API KEY/SECRET ARE NEEDED
The Worker uses Cloudinary's authenticated Admin API to list the uploaded media for the public gallery. Cloudinary documents that the Admin API uses API Key + API Secret authentication. The browser never receives the secret.

UPLOADS
The Worker accepts only image/* and video/* files up to 100 MB each. It forwards each file to Cloudinary using the existing unsigned upload preset "rushclips_upload", adds the "rushclips" tag, and stores it under the Cloudinary asset folder "rushclips".

IMPORTANT
- Your existing R2 bucket is no longer used by this code.
- Existing files in R2 are not automatically copied to Cloudinary.
- Existing sample/static assets in public/assets remain part of the website.
- The Cloudinary upload preset name can be changed later; if changed, update CLOUDINARY_UPLOAD_PRESET in the Worker secret/variable.
- Cloudinary's unsigned preset is appropriate for this controlled admin-upload flow, but the preset name is not a password. The Worker still requires the private admin session before it forwards uploads.

DEPLOY
Deploy the folder containing wrangler.toml and worker.js. Then test:
1. Open the Rush Clips website.
2. Scroll to OUR WORK → RUSH CLIPS ADMIN.
3. Log in with ADMIN_PASSWORD.
4. Choose photos/videos and tap Upload.
5. The files should appear in Cloudinary and then in the public gallery.

Cloudinary API documentation:
https://cloudinary.com/documentation/image_upload_api_reference
https://cloudinary.com/documentation/admin_api
