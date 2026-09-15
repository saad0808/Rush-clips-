document.getElementById("year").textContent = new Date().getFullYear();

const loginForm = document.getElementById("adminLoginForm");
const adminLoginView = document.getElementById("adminLoginView");
const adminUploadView = document.getElementById("adminUploadView");
const adminPassword = document.getElementById("adminPassword");
const loginStatus = document.getElementById("loginStatus");
const logoutButton = document.getElementById("adminLogout");
const uploadForm = document.getElementById("mediaUploadForm");
const fileInput = document.getElementById("mediaFiles");
const uploadStatus = document.getElementById("uploadStatus");
const uploadPreview = document.getElementById("uploadPreview");
const dynamicGallery = document.getElementById("dynamicGallery");

function isVideo(item) {
  return item?.resource_type === "video" || /\.(mp4|webm|mov|m4v|avi|mkv)$/i.test(item?.public_id || "");
}

function setLoggedIn(value) {
  adminLoginView.hidden = value;
  adminUploadView.hidden = !value;
  if (!value) {
    adminPassword.value = "";
    uploadPreview.innerHTML = "";
  }
}

async function checkSession() {
  try {
    const res = await fetch("/api/session", { cache: "no-store" });
    const data = await res.json();
    setLoggedIn(!!data.loggedIn);
  } catch (_) { setLoggedIn(false); }
}

if (loginForm) loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginStatus.textContent = "Logging in…";
  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: adminPassword.value })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || "Login failed.");
    loginStatus.textContent = "Login successful.";
    setLoggedIn(true);
  } catch (err) { loginStatus.textContent = err.message || "Login failed."; }
});

if (logoutButton) logoutButton.addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  setLoggedIn(false);
  uploadStatus.textContent = "Logged out.";
});

function renderPreview() {
  uploadPreview.innerHTML = "";
  [...fileInput.files].forEach(file => {
    const box = document.createElement("div");
    box.className = "upload-preview-item";
    if (file.type.startsWith("video/")) {
      const video = document.createElement("video");
      video.src = URL.createObjectURL(file); video.muted = true; video.playsInline = true;
      box.appendChild(video);
    } else {
      const img = document.createElement("img");
      img.src = URL.createObjectURL(file); img.alt = file.name;
      box.appendChild(img);
    }
    const name = document.createElement("small");
    name.textContent = file.name;
    box.appendChild(name);
    uploadPreview.appendChild(box);
  });
}

async function loadUploadedMedia() {
  if (!dynamicGallery) return;
  try {
    const res = await fetch("/api/media", { cache: "no-store" });
    if (!res.ok) return;
    const items = await res.json();
    dynamicGallery.innerHTML = "";
    for (const item of items) {
      const figure = document.createElement("figure");
      figure.className = "gallery-item dynamic-media";
      if (isVideo(item)) {
        const video = document.createElement("video");
        video.src = item.url; video.controls = true; video.playsInline = true; video.preload = "metadata";
        figure.appendChild(video);
      } else {
        const img = document.createElement("img");
        img.src = item.url; img.alt = "RUSH CLIPS uploaded work"; img.loading = "lazy";
        figure.appendChild(img);
      }
      dynamicGallery.appendChild(figure);
    }
  } catch (_) {}
}

if (fileInput) fileInput.addEventListener("change", renderPreview);

if (uploadForm) uploadForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!fileInput.files.length) { uploadStatus.textContent = "Select at least one image or video."; return; }
  uploadStatus.textContent = "Uploading…";
  const data = new FormData();
  [...fileInput.files].forEach(file => data.append("files", file));
  try {
    const res = await fetch("/api/upload", { method: "POST", body: data });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || "Upload failed.");
    const successCount = result.uploaded?.length || 0;
    const errorCount = result.errors?.length || 0;
    uploadStatus.textContent = errorCount
      ? `${successCount} file(s) uploaded. ${errorCount} file(s) failed.`
      : `${successCount} file(s) uploaded successfully.`;
    uploadForm.reset(); uploadPreview.innerHTML = "";
    await loadUploadedMedia();
  } catch (err) {
    if (err.message.includes("log in")) setLoggedIn(false);
    uploadStatus.textContent = err.message || "Upload failed. Please try again.";
  }
});

checkSession();
loadUploadedMedia();


// Customer reviews
const reviewForm = document.getElementById("reviewForm");
const reviewName = document.getElementById("reviewName");
const reviewRating = document.getElementById("reviewRating");
const reviewText = document.getElementById("reviewText");
const reviewStatus = document.getElementById("reviewStatus");
const reviewsList = document.getElementById("reviewsList");
const reviewsEmpty = document.getElementById("reviewsEmpty");
const pendingReviews = document.getElementById("pendingReviews");
const pendingReviewsEmpty = document.getElementById("pendingReviewsEmpty");
const refreshReviews = document.getElementById("refreshReviews");

function stars(rating) {
  const n = Math.max(1, Math.min(5, Number(rating) || 0));
  return "★".repeat(n) + "☆".repeat(5 - n);
}

function renderPublicReviews(items) {
  if (!reviewsList) return;
  reviewsList.innerHTML = "";
  reviewsEmpty.hidden = items.length > 0;
  for (const item of items) {
    const card = document.createElement("article");
    card.className = "review-card";

    const top = document.createElement("div");
    top.className = "review-card-top";
    const name = document.createElement("strong");
    name.textContent = item.name;
    const rating = document.createElement("span");
    rating.className = "review-stars";
    rating.textContent = stars(item.rating);
    top.append(name, rating);

    const body = document.createElement("p");
    body.textContent = item.review;

    const date = document.createElement("small");
    date.textContent = item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "";

    card.append(top, body, date);
    reviewsList.appendChild(card);
  }
}

async function loadReviews() {
  if (!reviewsList) return;
  try {
    const res = await fetch("/api/reviews", { cache: "no-store" });
    if (!res.ok) return;
    const items = await res.json();
    renderPublicReviews(Array.isArray(items) ? items : []);
  } catch (_) {}
}

function renderPendingReviews(items) {
  if (!pendingReviews) return;
  pendingReviews.innerHTML = "";
  pendingReviewsEmpty.hidden = items.length > 0;
  for (const item of items) {
    const card = document.createElement("div");
    card.className = "pending-review";
    const content = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = `${item.name} — ${stars(item.rating)}`;
    const body = document.createElement("p");
    body.textContent = item.review;
    content.append(title, body);

    const actions = document.createElement("div");
    actions.className = "review-actions";
    const approve = document.createElement("button");
    approve.className = "btn btn-primary";
    approve.type = "button";
    approve.textContent = "Approve";
    approve.addEventListener("click", () => moderateReview(item.id, "approve"));
    const reject = document.createElement("button");
    reject.className = "btn btn-secondary";
    reject.type = "button";
    reject.textContent = "Reject";
    reject.addEventListener("click", () => moderateReview(item.id, "reject"));
    actions.append(approve, reject);
    card.append(content, actions);
    pendingReviews.appendChild(card);
  }
}

async function loadPendingReviews() {
  if (!pendingReviews || adminUploadView?.hidden) return;
  try {
    const res = await fetch("/api/reviews/pending", { cache: "no-store" });
    if (!res.ok) return;
    const items = await res.json();
    renderPendingReviews(Array.isArray(items) ? items : []);
  } catch (_) {}
}

async function moderateReview(id, action) {
  try {
    const res = await fetch("/api/reviews/moderate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, action })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || "Could not update review.");
    await loadPendingReviews();
    await loadReviews();
  } catch (err) {
    alert(err.message || "Could not update review.");
  }
}

if (reviewForm) reviewForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  reviewStatus.textContent = "Submitting…";
  try {
    const res = await fetch("/api/reviews", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: reviewName.value.trim(),
        rating: Number(reviewRating.value),
        review: reviewText.value.trim()
      })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || "Could not submit review.");
    reviewForm.reset();
    reviewStatus.textContent = "Thank you! Your review was submitted and is awaiting approval.";
  } catch (err) {
    reviewStatus.textContent = err.message || "Could not submit review. Please try again.";
  }
});

if (refreshReviews) refreshReviews.addEventListener("click", loadPendingReviews);

const originalSetLoggedIn = setLoggedIn;
setLoggedIn = function(value) {
  originalSetLoggedIn(value);
  if (value) loadPendingReviews();
};

loadReviews();
