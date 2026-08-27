import http from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, extname, join, normalize } from "node:path";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";

const base = fileURLToPath(new URL(".", import.meta.url));
const publicRoot = join(base, "public");
const dataRoot = join(base, "data");
const uploadRoot = join(dataRoot, "uploads");
const dbPath = join(dataRoot, "db.json");
const port = Number(process.env.PORT || 4173);
const sessions = new Map();
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".pdf": "application/pdf", ".doc": "application/msword", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };

const sites = [
  { id: "KIN", region: "Kinshasa", name: "Direction générale", manager: "Patrick Ilunga", score: 94 },
  { id: "NKV", region: "Nord-Kivu", name: "Agence de Goma", manager: "David Bahati", score: 78 },
  { id: "SKV", region: "Sud-Kivu", name: "Agence de Bukavu", manager: "Aline Ciza", score: 86 },
  { id: "KAT", region: "Haut-Katanga", name: "Agence de Lubumbashi", manager: "Jean Mukendi", score: 91 },
  { id: "KCG", region: "Kongo-Central", name: "Agence de Matadi", manager: "Grâce Mavungu", score: 83 },
  { id: "KAS", region: "Kasaï", name: "Agence de Kananga", manager: "Moïse Tshibangu", score: 88 }
];
const initialDocs = [
  { id: 1, title: "Inspection des extincteurs", ref: "INS-KIN-0826", site: "KIN", category: "Inspection", date: "2026-08-25", uploaded: "2026-08-26T09:42:00.000Z", status: "Approuvé", fileName: null, storedName: null, notes: "Contrôle mensuel terminé." },
  { id: 2, title: "Bordereau des EPI", ref: "BOR-SKV-1044", site: "SKV", category: "Bordereau", date: "2026-08-23", uploaded: "2026-08-25T12:03:00.000Z", status: "À corriger", fileName: null, storedName: null, notes: "Copie plus nette requise." },
  { id: 3, title: "Reçus de carburant", ref: "REC-NKV-0819", site: "NKV", category: "Reçu", date: "2026-08-19", uploaded: "2026-08-24T16:18:00.000Z", status: "En attente", fileName: null, storedName: null, notes: "Lot du mois d’août." },
  { id: 4, title: "Certificat de sécurité", ref: "CER-KAT-2026", site: "KAT", category: "Certificat", date: "2026-08-18", uploaded: "2026-08-22T10:00:00.000Z", status: "Approuvé", fileName: null, storedName: null, notes: "" },
  { id: 5, title: "Rapport d’inspection mensuel", ref: "RAP-KCG-0826", site: "KCG", category: "Inspection", date: "2026-08-20", uploaded: "2026-08-21T10:00:00.000Z", status: "Manquant", fileName: null, storedName: null, notes: "Document attendu." }
];

function passwordRecord(password) { const salt = randomBytes(16).toString("hex"); return { salt, hash: scryptSync(password, salt, 64).toString("hex") }; }
function verifyPassword(password, user) { const candidate = scryptSync(password, user.salt, 64); return timingSafeEqual(candidate, Buffer.from(user.hash, "hex")); }
function publicUser(user) { return { id: user.id, name: user.name, email: user.email, role: user.role, site: user.site || null, initials: user.name.split(/\s+/).map(x => x[0]).slice(0, 2).join("").toUpperCase(), canReview: ["administrator", "manager"].includes(user.roleKey), canSeeAudit: user.roleKey === "administrator", canSeeSites: ["administrator", "manager"].includes(user.roleKey) }; }
function canAccessDocument(user, doc) { if (user.roleKey === "administrator") return true; if (user.roleKey === "sender") return doc.createdBy === user.id; return doc.site === user.site; }

async function ensureDb() {
  await mkdir(uploadRoot, { recursive: true });
  const db = existsSync(dbPath) ? JSON.parse(await readFile(dbPath, "utf8")) : { users: [], sites, documents: initialDocs, audit: [{ id: 1, time: new Date().toISOString(), actor: "Système", action: "a initialisé le registre", detail: "Proofline · SONAS", icon: "✓" }] };
  const demos = [{ id: 1, name: "Christiane Matabaro", email: "christiane.matabaro@sonas.cd", role: "Administratrice nationale", roleKey: "administrator", site: null }, { id: 2, name: "David Bahati", email: "manager@sonas.cd", role: "Manager provincial", roleKey: "manager", site: "NKV" }, { id: 3, name: "Aline Ciza", email: "employee@sonas.cd", role: "Employée", roleKey: "employee", site: "SKV" }, { id: 4, name: "Jean Kabeya", email: "sender@sonas.cd", role: "Expéditeur de documents", roleKey: "sender", site: "KIN" }];
  for (const demo of demos) { const existing = db.users.find(x => x.id === demo.id || x.email === demo.email); if (existing) Object.assign(existing, demo); else db.users.push({ ...demo, ...passwordRecord("demo2026") }); }
  db.documents.forEach(doc => { if (doc.createdBy === undefined) doc.createdBy = 1; });
  await writeFile(dbPath, JSON.stringify(db, null, 2), "utf8");
}
async function loadDb() { return JSON.parse(await readFile(dbPath, "utf8")); }
async function saveDb(db) { await writeFile(dbPath, JSON.stringify(db, null, 2), "utf8"); }
function send(res, status, body, contentType = "application/json; charset=utf-8") { res.writeHead(status, { "Content-Type": contentType, "Cache-Control": "no-store" }); res.end(contentType.startsWith("application/json") ? JSON.stringify(body) : body); }
async function jsonBody(req, limit = 15_000_000) { const chunks = []; let size = 0; for await (const chunk of req) { size += chunk.length; if (size > limit) throw new Error("PAYLOAD_TOO_LARGE"); chunks.push(chunk); } return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); }
function tokenFrom(req) { return (req.headers.authorization || "").replace(/^Bearer\s+/i, ""); }
function auth(req) { const token = tokenFrom(req); const session = sessions.get(token); if (!session || session.expires < Date.now()) { sessions.delete(token); return null; } session.expires = Date.now() + 8 * 60 * 60 * 1000; return { token, ...session }; }
function audit(db, user, action, detail, icon = "↻") { db.audit.unshift({ id: Date.now(), time: new Date().toISOString(), actor: user.name, action, detail, icon }); }
function cleanFileName(name) { return basename(name || "document").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120); }

async function api(req, res, path) {
  if (path === "/api/login" && req.method === "POST") {
    const body = await jsonBody(req); const db = await loadDb(); const user = db.users.find(x => x.email.toLowerCase() === String(body.email || "").toLowerCase());
    if (!user || !verifyPassword(String(body.password || ""), user)) return send(res, 401, { error: "Adresse e-mail ou mot de passe incorrect." });
    const token = randomBytes(32).toString("hex"); sessions.set(token, { userId: user.id, expires: Date.now() + 8 * 60 * 60 * 1000 });
    audit(db, user, "s’est connectée", "Portail de contrôle documentaire", "✓"); await saveDb(db);
    return send(res, 200, { token, user: publicUser(user) });
  }
  const session = auth(req); if (!session) return send(res, 401, { error: "Session expirée. Veuillez vous reconnecter." });
  const db = await loadDb(); const user = db.users.find(x => x.id === session.userId);
  if (path === "/api/logout" && req.method === "POST") { sessions.delete(session.token); return send(res, 200, { ok: true }); }
  if (path === "/api/state" && req.method === "GET") { const visibleDocs = db.documents.filter(doc => canAccessDocument(user, doc)); const visibleSites = user.roleKey === "administrator" ? db.sites : db.sites.filter(site => site.id === user.site); const visibleAudit = user.roleKey === "administrator" ? db.audit : db.audit.filter(item => visibleDocs.some(doc => item.detail.includes(doc.ref))); return send(res, 200, { user: publicUser(user), sites: visibleSites, documents: visibleDocs, audit: visibleAudit }); }
  if (path === "/api/documents" && req.method === "POST") {
    const body = await jsonBody(req); if (!body.title || !body.reference || !body.site || !body.date) return send(res, 400, { error: "Veuillez remplir tous les champs obligatoires." });
    let storedName = null; let fileName = null;
    if (body.file?.data) { const raw = Buffer.from(body.file.data, "base64"); if (raw.length > 10_000_000) return send(res, 413, { error: "Le fichier dépasse 10 Mo." }); fileName = cleanFileName(body.file.name); storedName = `${Date.now()}-${randomBytes(5).toString("hex")}-${fileName}`; await writeFile(join(uploadRoot, storedName), raw); }
    const requestedSite = String(body.site); if (user.roleKey !== "administrator" && requestedSite !== user.site) return send(res, 403, { error: "Vous ne pouvez envoyer que des documents pour votre province." });
    const doc = { id: Date.now(), title: String(body.title), ref: String(body.reference), site: requestedSite, category: String(body.category || "Autre"), date: String(body.date), uploaded: new Date().toISOString(), status: "En attente", fileName, storedName, notes: String(body.notes || ""), createdBy: user.id };
    db.documents.unshift(doc); audit(db, user, `a ajouté ${doc.title}`, `${doc.ref} · ${doc.site}`, "↑"); await saveDb(db); return send(res, 201, doc);
  }
  const review = path.match(/^\/api\/documents\/(\d+)\/status$/);
  if (review && req.method === "PATCH") { if (!["administrator", "manager"].includes(user.roleKey)) return send(res, 403, { error: "Votre rôle ne permet pas de valider des documents." }); const body = await jsonBody(req); const doc = db.documents.find(x => x.id === Number(review[1])); if (!doc || !canAccessDocument(user, doc)) return send(res, 404, { error: "Document introuvable." }); if (!["Approuvé", "À corriger", "En attente", "Manquant"].includes(body.status)) return send(res, 400, { error: "Statut invalide." }); doc.status = body.status; audit(db, user, body.status === "Approuvé" ? `a approuvé ${doc.title}` : `a demandé une correction pour ${doc.title}`, `${doc.ref} · ${doc.site}`, body.status === "Approuvé" ? "✓" : "↻"); await saveDb(db); return send(res, 200, doc); }
  const download = path.match(/^\/api\/documents\/(\d+)\/download$/);
  if (download && req.method === "GET") { const doc = db.documents.find(x => x.id === Number(download[1])); if (!doc || !canAccessDocument(user, doc)) return send(res, 404, { error: "Document introuvable." }); if (!doc.storedName) return send(res, 404, { error: "Aucun fichier joint." }); const filePath = join(uploadRoot, basename(doc.storedName)); const info = await stat(filePath); res.writeHead(200, { "Content-Type": types[extname(doc.fileName).toLowerCase()] || "application/octet-stream", "Content-Length": info.size, "Content-Disposition": `attachment; filename="${cleanFileName(doc.fileName)}"` }); return createReadStream(filePath).pipe(res); }
  if (path === "/api/profile" && req.method === "PATCH") { const body = await jsonBody(req); if (body.name) user.name = String(body.name).trim(); if (body.email) user.email = String(body.email).trim().toLowerCase(); if (body.currentPassword || body.newPassword) { if (!body.currentPassword || !verifyPassword(String(body.currentPassword), user)) return send(res, 400, { error: "Mot de passe actuel incorrect." }); if (String(body.newPassword).length < 8) return send(res, 400, { error: "Le nouveau mot de passe doit contenir au moins 8 caractères." }); Object.assign(user, passwordRecord(String(body.newPassword))); } audit(db, user, "a mis à jour ses paramètres", "Profil administrateur", "⚙"); await saveDb(db); return send(res, 200, { user: publicUser(user) }); }
  return send(res, 404, { error: "Route introuvable." });
}

async function staticFile(res, urlPath) {
  const relative = normalize(urlPath === "/" ? "index.html" : urlPath.replace(/^[/\\]+/, ""));
  if (relative.startsWith("..")) return send(res, 403, "Forbidden", "text/plain");
  let path = join(publicRoot, relative); try { if (!(await stat(path)).isFile()) path = join(publicRoot, "index.html"); } catch { path = join(publicRoot, "index.html"); }
  res.writeHead(200, { "Content-Type": types[extname(path)] || "application/octet-stream", "Cache-Control": "no-store" }); createReadStream(path).pipe(res);
}

await ensureDb();
http.createServer(async (req, res) => { try { const path = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname); if (path.startsWith("/api/")) await api(req, res, path); else await staticFile(res, path); } catch (error) { console.error(error); send(res, error.message === "PAYLOAD_TOO_LARGE" ? 413 : 500, { error: error.message === "PAYLOAD_TOO_LARGE" ? "Fichier trop volumineux." : "Erreur interne du serveur." }); } }).listen(port, () => console.log(`Proofline is running at http://localhost:${port}`));
