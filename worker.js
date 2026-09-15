const SESSION_SECONDS = 60 * 60 * 24 * 7; // 7 days
const MAX_FILE_BYTES = 100 * 1024 * 1024;
const MEDIA_TAG = "rushclips";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/login" && request.method === "POST") {
      if (!env.ADMIN_PASSWORD) return json({ error: "Admin password is not configured yet." }, 500);
      const body = await request.json().catch(() => ({}));
      const password = String(body.password || "");
      if (!password || !(await safeEqual(password, env.ADMIN_PASSWORD))) {
        return json({ error: "Wrong password." }, 401);
      }
      const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
      const token = await sign(`${expires}`, env.ADMIN_PASSWORD);
      const cookie = `RUSH_ADMIN=${expires}.${token}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
      return json({ ok: true }, 200, { "set-cookie": cookie });
    }

    if (url.pathname === "/api/logout" && request.method === "POST") {
      return json({ ok: true }, 200, { "set-cookie": "RUSH_ADMIN=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict" });
    }

    if (url.pathname === "/api/session" && request.method === "GET") {
      return json({ loggedIn: await isAdmin(request, env) });
    }

    if (url.pathname === "/api/reviews" && request.method === "GET") {
      if (!env.REVIEWS_KV) return json({ error: "Reviews storage is not configured yet." }, 500);
      try {
        const reviews = await getReviews(env);
        return json(reviews.filter(r => r.status === "approved"));
      } catch (error) {
        return json({ error: errorMessage(error) }, 500);
      }
    }

    if (url.pathname === "/api/reviews" && request.method === "POST") {
      if (!env.REVIEWS_KV) return json({ error: "Reviews storage is not configured yet." }, 500);
      const body = await request.json().catch(() => ({}));
      const name = String(body.name || "").trim();
      const review = String(body.review || "").trim();
      const rating = Number(body.rating);
      if (name.length < 2 || name.length > 60) return json({ error: "Please enter a name between 2 and 60 characters." }, 400);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) return json({ error: "Please choose a rating from 1 to 5." }, 400);
      if (review.length < 5 || review.length > 500) return json({ error: "Review must be between 5 and 500 characters." }, 400);
      try {
        const reviews = await getReviews(env);
        const item = {
          id: crypto.randomUUID(),
          name,
          rating,
          review,
          status: "pending",
          createdAt: new Date().toISOString()
        };
        reviews.push(item);
        await saveReviews(env, reviews);
        return json({ ok: true }, 201);
      } catch (error) {
        return json({ error: errorMessage(error) }, 500);
      }
    }

    if (url.pathname === "/api/reviews/pending" && request.method === "GET") {
      if (!(await isAdmin(request, env))) return json({ error: "Please log in as admin first." }, 401);
      if (!env.REVIEWS_KV) return json({ error: "Reviews storage is not configured yet." }, 500);
      const reviews = await getReviews(env);
      return json(reviews.filter(r => r.status === "pending").sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))));
    }

    if (url.pathname === "/api/reviews/moderate" && request.method === "POST") {
      if (!(await isAdmin(request, env))) return json({ error: "Please log in as admin first." }, 401);
      if (!env.REVIEWS_KV) return json({ error: "Reviews storage is not configured yet." }, 500);
      const body = await request.json().catch(() => ({}));
      const id = String(body.id || "");
      const action = String(body.action || "");
      if (!id || !["approve", "reject"].includes(action)) return json({ error: "Invalid moderation request." }, 400);
      const reviews = await getReviews(env);
      const index = reviews.findIndex(r => r.id === id);
      if (index < 0) return json({ error: "Review not found." }, 404);
      if (action === "approve") reviews[index].status = "approved";
      else reviews.splice(index, 1);
      await saveReviews(env, reviews);
      return json({ ok: true });
    }

    if (url.pathname === "/api/media" && request.method === "GET") {
      if (!cloudinaryConfigured(env)) return json({ error: "Cloudinary API secrets are not configured yet." }, 500);
      try {
        const media = await listCloudinaryMedia(env);
        return json(media);
      } catch (error) {
        return json({ error: errorMessage(error) }, 502);
      }
    }

    if (url.pathname === "/api/upload" && request.method === "POST") {
      if (!(await isAdmin(request, env))) return json({ error: "Please log in as admin first." }, 401);
      if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_UPLOAD_PRESET) {
        return json({ error: "Cloudinary upload settings are not configured yet." }, 500);
      }

      const form = await request.formData();
      const files = form.getAll("files");
      if (!files.length) return json({ error: "No files selected." }, 400);

      const uploaded = [];
      const errors = [];

      for (const file of files) {
        if (!(file instanceof File)) continue;
        const type = file.type || "application/octet-stream";
        if (!type.startsWith("image/") && !type.startsWith("video/")) {
          errors.push(`${file.name}: only images and videos are allowed.`);
          continue;
        }
        if (file.size > MAX_FILE_BYTES) {
          errors.push(`${file.name}: maximum file size is 100 MB.`);
          continue;
        }

        try {
          const resourceType = type.startsWith("video/") ? "video" : "image";
          const cloudinaryForm = new FormData();
          cloudinaryForm.append("file", file, file.name);
          cloudinaryForm.append("upload_preset", env.CLOUDINARY_UPLOAD_PRESET);
          cloudinaryForm.append("asset_folder", "rushclips");
          cloudinaryForm.append("tags", MEDIA_TAG);

          const uploadUrl = `https://api.cloudinary.com/v1_1/${encodeURIComponent(env.CLOUDINARY_CLOUD_NAME)}/${resourceType}/upload`;
          const response = await fetch(uploadUrl, { method: "POST", body: cloudinaryForm });
          const result = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(result.error?.message || `Cloudinary upload failed (${response.status}).`);
          }

          uploaded.push({
            public_id: result.public_id,
            resource_type: result.resource_type,
            secure_url: result.secure_url,
            format: result.format,
            bytes: result.bytes,
            created_at: result.created_at,
            name: file.name
          });
        } catch (error) {
          errors.push(`${file.name}: ${errorMessage(error)}`);
        }
      }

      return json({ uploaded, errors }, uploaded.length ? 200 : 502);
    }

    return env.ASSETS.fetch(request);
  }
};

async function getReviews(env) {
  const raw = await env.REVIEWS_KV.get("reviews");
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

async function saveReviews(env, reviews) {
  // Keep only the newest 500 records to avoid unbounded KV growth.
  const trimmed = reviews.slice(-500);
  await env.REVIEWS_KV.put("reviews", JSON.stringify(trimmed));
}

function cloudinaryConfigured(env) {
  return Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);
}

async function listCloudinaryMedia(env) {
  const all = [];
  let nextCursor = "";
  do {
    const params = new URLSearchParams({
      expression: `tags=${MEDIA_TAG}`,
      max_results: "500"
    });
    if (nextCursor) params.set("next_cursor", nextCursor);

    const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(env.CLOUDINARY_CLOUD_NAME)}/resources/search?${params}`;
    const response = await fetch(endpoint, {
      headers: { Authorization: `Basic ${btoa(`${env.CLOUDINARY_API_KEY}:${env.CLOUDINARY_API_SECRET}`)}` }
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error?.message || `Cloudinary media listing failed (${response.status}).`);
    }

    for (const resource of result.resources || []) {
      all.push({
        public_id: resource.public_id,
        resource_type: resource.resource_type,
        format: resource.format,
        bytes: resource.bytes,
        created_at: resource.created_at,
        url: resource.secure_url || resource.url
      });
    }
    nextCursor = result.next_cursor || "";
  } while (nextCursor);

  all.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  return all;
}

async function isAdmin(request, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(/(?:^|;\s*)RUSH_ADMIN=([^;]+)/);
  if (!match) return false;
  const [expiresText, signature] = match[1].split(".");
  const expires = Number(expiresText);
  if (!expires || expires < Math.floor(Date.now() / 1000) || !signature) return false;
  const expected = await sign(expiresText, env.ADMIN_PASSWORD);
  return await safeEqual(signature, expected);
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(signature)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function safeEqual(a, b) {
  const aa = new TextEncoder().encode(String(a));
  const bb = new TextEncoder().encode(String(b));
  if (aa.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i];
  return diff === 0;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extraHeaders }
  });
}
