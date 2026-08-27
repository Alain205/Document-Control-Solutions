const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
let token = sessionStorage.getItem("proofline-token") || localStorage.getItem("proofline-token") || "";
let documents = [], sites = [], auditLog = [], user = null;

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body && !(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
  const response = await fetch(path, { ...options, headers });
  const type = response.headers.get("content-type") || "";
  const result = type.includes("application/json") ? await response.json() : await response.blob();
  if (response.status === 401 && path !== "/api/login") showLogin();
  if (!response.ok) throw new Error(result.error || "Une erreur est survenue.");
  return result;
}
function escapeHtml(value = "") { return String(value).replace(/[&<>"']/g, x => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[x]); }
function toast(message) { const el = $("#toast"); el.textContent = message; el.classList.add("show"); setTimeout(() => el.classList.remove("show"), 2800); }
function siteName(id) { return sites.find(site => site.id === id)?.region || id; }
function dateLabel(value) { if (!value) return "—"; const date = new Date(value); return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(date); }
function statusTag(status) { const style = status === "Approuvé" ? "approved" : status === "En attente" ? "pending-review" : status === "À corriger" ? "needs-correction" : "missing"; return `<span class="status ${style}">${escapeHtml(status)}</span>`; }
function docCell(doc) { return `<div class="doc-cell"><span class="doc-icon">${escapeHtml(doc.category.slice(0, 3).toUpperCase())}</span><div><strong>${escapeHtml(doc.title)}</strong><small>${escapeHtml(doc.fileName || "Aucun fichier joint")}</small></div></div>`; }
function salutation() { const hour = new Date().getHours(); return hour < 12 ? "Bonjour" : hour < 18 ? "Bon après-midi" : "Bonsoir"; }
function setBusy(button, busy, text) { if (!button) return; if (busy) { button.dataset.label = button.textContent; button.textContent = text || "Traitement…"; } else button.textContent = button.dataset.label || button.textContent; button.classList.toggle("button-busy", busy); }

function renderUser() {
  $("#userName").textContent = user.name; $("#userRole").textContent = user.role; $("#userInitials").textContent = user.initials;
  $("#pageTitle").textContent = `${salutation()}, ${user.name}`;
  $("#settingsForm").elements.name.value = user.name; $("#settingsForm").elements.email.value = user.email;
}
function applyPermissions() {
  const sitesNav = $('[data-view="sites"]'), auditNav = $('[data-view="audit"]');
  sitesNav.classList.toggle("hidden", !user.canSeeSites); auditNav.classList.toggle("hidden", !user.canSeeAudit);
  $("#exportBtn").classList.toggle("hidden", !user.canSeeAudit);
  $("#uploadSite").disabled = Boolean(user.site);
  const scope = user.site ? siteName(user.site) : "Toutes les provinces";
  $("#eyebrow").textContent = `${user.role.toUpperCase()} · ${scope.toUpperCase()}`;
}
function renderMetrics() {
  const pending = documents.filter(x => x.status === "En attente").length;
  const attention = documents.filter(x => ["À corriger", "Manquant"].includes(x.status)).length;
  const approved = documents.filter(x => x.status === "Approuvé").length;
  const compliance = documents.length ? Math.round(approved / documents.length * 100) : 0;
  $("#metrics").innerHTML = [["Tous les documents", documents.length, `Dans ${sites.length} provinces actives`, ""], ["Taux de conformité", `${compliance} %`, `${approved} document(s) approuvé(s)`, "good"], ["En attente de vérification", pending, "Action du siège requise", ""], ["Exceptions", attention, "Pièces manquantes ou à corriger", "warn"]].map(x => `<article class="metric"><div class="metric-label"><span>${x[0]}</span><span>•••</span></div><strong>${x[1]}</strong><small class="${x[3]}">${x[2]}</small></article>`).join("");
  $("#reviewBadge").textContent = pending;
}
function renderDashboard() {
  $("#sitePerformance").innerHTML = sites.slice(0, 4).map(site => `<div class="site-row"><div class="site-name"><strong>${escapeHtml(site.region)}</strong><small>${escapeHtml(site.name)} · ${escapeHtml(site.manager)}</small></div><div class="bar"><i style="width:${site.score}%"></i></div><strong>${site.score}%</strong></div>`).join("");
  const queue = documents.filter(x => x.status !== "Approuvé").slice(0, 4);
  $("#actionCount").textContent = `${queue.length} éléments`;
  $("#actionQueue").innerHTML = queue.map(doc => `<div class="queue-item" data-doc="${doc.id}"><span class="queue-icon">${doc.status === "Manquant" ? "!" : "↻"}</span><div><strong>${escapeHtml(doc.title)}</strong><p>${escapeHtml(siteName(doc.site))} · ${escapeHtml(doc.ref)}</p><small>${escapeHtml(doc.status)}</small></div></div>`).join("") || '<p class="muted">Aucune action en attente.</p>';
  $("#recentTable").innerHTML = documents.slice(0, 5).map(doc => `<tr><td>${docCell(doc)}</td><td>${escapeHtml(siteName(doc.site))}</td><td>${escapeHtml(doc.category)}</td><td>${dateLabel(doc.uploaded)}</td><td>${statusTag(doc.status)}</td><td><button class="more" data-doc="${doc.id}">•••</button></td></tr>`).join("");
}
function renderDocuments() {
  const query = $("#searchInput").value.toLowerCase(), status = $("#statusFilter").value, site = $("#siteFilter").value;
  const list = documents.filter(doc => (status === "all" || doc.status === status) && (site === "all" || doc.site === site) && `${doc.title} ${doc.ref} ${siteName(doc.site)} ${doc.category}`.toLowerCase().includes(query));
  $("#documentTable").innerHTML = list.map(doc => `<tr><td>${docCell(doc)}</td><td>${escapeHtml(doc.ref)}</td><td>${escapeHtml(siteName(doc.site))}</td><td>${escapeHtml(doc.category)}</td><td>${dateLabel(doc.date)}</td><td>${statusTag(doc.status)}</td><td><button class="more" data-doc="${doc.id}">•••</button></td></tr>`).join("");
  $("#emptyState").classList.toggle("hidden", list.length > 0);
}
function renderSites() {
  $("#siteCards").innerHTML = sites.map(site => { const docs = documents.filter(x => x.site === site.id), pending = docs.filter(x => x.status === "En attente").length, issues = docs.filter(x => ["Manquant", "À corriger"].includes(x.status)).length; return `<article class="panel site-card"><div class="site-card-top"><div><p class="eyebrow">${site.id} · RDC</p><h3>${escapeHtml(site.region)}</h3><p>${escapeHtml(site.name)} · Responsable : ${escapeHtml(site.manager)}</p></div><span class="ring">${site.score}%</span></div><div class="bar"><i style="width:${site.score}%"></i></div><div class="site-stats"><div><strong>${docs.length}</strong><small>DOCUMENTS</small></div><div><strong>${pending}</strong><small>À VÉRIFIER</small></div><div><strong>${issues}</strong><small>ANOMALIES</small></div></div></article>`; }).join("");
}
function renderAudit() { $("#auditList").innerHTML = auditLog.map(item => `<div class="audit-item"><span class="audit-dot">${escapeHtml(item.icon)}</span><div><p><strong>${escapeHtml(item.actor)}</strong> ${escapeHtml(item.action)}</p><small>${escapeHtml(item.detail)}</small></div><small>${dateLabel(item.time)}</small></div>`).join(""); }
function renderAll() { renderUser(); renderMetrics(); renderDashboard(); renderDocuments(); renderSites(); renderAudit(); }
function showView(view) { $$(".view").forEach(x => x.classList.remove("active")); $(`#${view}View`).classList.add("active"); $$(".nav-item").forEach(x => x.classList.toggle("active", x.dataset.view === view)); const titles = { dashboard: `${salutation()}, ${user?.name || "Christiane"}`, documents: "Registre des documents", sites: "Provinces et conformité", audit: "Journal d’audit" }; $("#pageTitle").textContent = titles[view]; $(".sidebar").classList.remove("open"); }
function openModal(id) { $(id).classList.add("open"); $(id).setAttribute("aria-hidden", "false"); }
function closeModals() { $$(".modal").forEach(x => { x.classList.remove("open"); x.setAttribute("aria-hidden", "true"); }); }
function openDetail(id) { const doc = documents.find(x => x.id === Number(id)); if (!doc) return; const reviewActions = user.canReview && doc.status !== "Approuvé" ? `<div class="review-actions"><button class="primary approve" data-review="Approuvé" data-id="${doc.id}">✓ Approuver</button><button class="primary reject" data-review="À corriger" data-id="${doc.id}">Demander une correction</button></div>` : ""; $("#detailContent").innerHTML = `<p class="eyebrow">${escapeHtml(doc.category.toUpperCase())}</p><h2>${escapeHtml(doc.title)}</h2><p class="muted">${escapeHtml(doc.ref)}</p><div class="detail-meta"><div><small>Province</small><strong>${escapeHtml(siteName(doc.site))}</strong></div><div><small>Statut</small>${statusTag(doc.status)}</div><div><small>Date du document</small><strong>${dateLabel(doc.date)}</strong></div><div><small>Fichier</small><strong>${escapeHtml(doc.fileName || "Non transmis")}</strong></div></div><p class="muted">${escapeHtml(doc.notes || "Aucune note.")}</p>${doc.fileName ? `<a class="download-link" href="#" data-download="${doc.id}">↓ Télécharger le fichier</a>` : ""}${reviewActions}`; openModal("#detailModal"); }
function showLogin() { token = ""; sessionStorage.removeItem("proofline-token"); localStorage.removeItem("proofline-token"); $("#loginScreen").classList.remove("hidden"); closeModals(); }
async function loadState() { const state = await request("/api/state"); ({ documents, sites, audit: auditLog, user } = state); const options = sites.map(site => `<option value="${site.id}">${escapeHtml(site.region)} — ${escapeHtml(site.name)}</option>`).join(""); $("#siteFilter").innerHTML = '<option value="all">Toutes les provinces</option>' + options; $("#uploadSite").innerHTML = options; renderAll(); applyPermissions(); $("#loginScreen").classList.add("hidden"); }

$("#loginForm").onsubmit = async event => { event.preventDefault(); const button = event.submitter; setBusy(button, true, "Connexion…"); try { const form = new FormData(event.target), result = await request("/api/login", { method: "POST", body: JSON.stringify({ email: form.get("email"), password: form.get("password") }) }); token = result.token; const remember = event.target.querySelector('input[type="checkbox"]').checked; (remember ? localStorage : sessionStorage).setItem("proofline-token", token); await loadState(); showView("dashboard"); toast("Connexion réussie."); } catch (error) { toast(error.message); } finally { setBusy(button, false); } };
$("#logoutBtn").onclick = async () => { try { await request("/api/logout", { method: "POST" }); } catch {} showLogin(); toast("Vous êtes maintenant déconnectée."); };
$("#settingsBtn").onclick = () => { renderUser(); openModal("#settingsModal"); };
$("#settingsForm").onsubmit = async event => { event.preventDefault(); const button = event.submitter, form = new FormData(event.target); setBusy(button, true, "Enregistrement…"); try { const result = await request("/api/profile", { method: "PATCH", body: JSON.stringify(Object.fromEntries(form)) }); user = result.user; renderUser(); event.target.elements.currentPassword.value = ""; event.target.elements.newPassword.value = ""; closeModals(); toast("Paramètres enregistrés."); } catch (error) { toast(error.message); } finally { setBusy(button, false); } };
$("#uploadForm").onsubmit = async event => { event.preventDefault(); const button = event.submitter, form = new FormData(event.target), file = form.get("file"); setBusy(button, true, "Envoi…"); try { let filePayload = null; if (file?.size) { if (file.size > 10_000_000) throw new Error("Le fichier dépasse 10 Mo."); filePayload = { name: file.name, data: (await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(",")[1]); reader.onerror = reject; reader.readAsDataURL(file); })) }; } await request("/api/documents", { method: "POST", body: JSON.stringify({ title: form.get("title"), reference: form.get("reference"), site: form.get("site"), category: form.get("category"), date: form.get("date"), notes: form.get("notes"), file: filePayload }) }); await loadState(); event.target.reset(); $("#uploadForm [name=date]").value = new Date().toISOString().slice(0, 10); $("#fileLabel").textContent = "Choisir ou déposer un fichier ici"; closeModals(); toast("Document enregistré et soumis."); } catch (error) { toast(error.message); } finally { setBusy(button, false); } };
document.addEventListener("click", async event => { const nav = event.target.closest("[data-view]"); if (nav) showView(nav.dataset.view); const go = event.target.closest("[data-goto]"); if (go) showView(go.dataset.goto); const detail = event.target.closest("[data-doc]"); if (detail) openDetail(detail.dataset.doc); if (event.target.matches("[data-close]")) closeModals(); const review = event.target.closest("[data-review]"); if (review) { setBusy(review, true); try { await request(`/api/documents/${review.dataset.id}/status`, { method: "PATCH", body: JSON.stringify({ status: review.dataset.review }) }); await loadState(); closeModals(); toast("Statut mis à jour."); } catch (error) { toast(error.message); } } const download = event.target.closest("[data-download]"); if (download) { event.preventDefault(); try { const blob = await request(`/api/documents/${download.dataset.download}/download`); const doc = documents.find(x => x.id === Number(download.dataset.download)), link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = doc.fileName; link.click(); URL.revokeObjectURL(link.href); } catch (error) { toast(error.message); } } });
$("#nav").addEventListener("click", event => { const button = event.target.closest("[data-view]"); if (button) showView(button.dataset.view); });
$("#uploadBtn").onclick = () => openModal("#uploadModal"); $("#menuBtn").onclick = () => $(".sidebar").classList.toggle("open"); $("#notificationBtn").onclick = () => { showView("documents"); $("#statusFilter").value = "En attente"; renderDocuments(); toast("Documents en attente affichés."); };
[$("#searchInput"), $("#statusFilter"), $("#siteFilter")].forEach(element => element.addEventListener(element.tagName === "INPUT" ? "input" : "change", renderDocuments));
$("#uploadForm [name=date]").value = new Date().toISOString().slice(0, 10); $("#uploadForm [name=file]").onchange = event => $("#fileLabel").textContent = event.target.files[0]?.name || "Choisir ou déposer un fichier ici";
$("#togglePassword").onclick = () => { const input = $("#loginForm [name=password]"); input.type = input.type === "password" ? "text" : "password"; $("#togglePassword").textContent = input.type === "password" ? "Afficher" : "Masquer"; };
$("#exportBtn").onclick = () => { const csv = ["Date,Utilisateur,Action,Détail", ...auditLog.map(item => [item.time, item.actor, item.action, item.detail].map(value => `"${String(value).replaceAll('"', '""')}"`).join(","))].join("\n"), link = document.createElement("a"); link.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" })); link.download = "journal-audit-proofline.csv"; link.click(); URL.revokeObjectURL(link.href); toast("Journal d’audit exporté."); };

if (token) loadState().catch(() => showLogin()); else showLogin();
