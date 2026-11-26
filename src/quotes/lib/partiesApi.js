// Customers & Vendors register (Inventory 113): one place to create customers / shippers / vendors / agents with documents.
// Anyone creates (PENDING); Management and Accounts approve. Quotes and cost lines only accept names from here.
import { supabase } from "../supabaseClient.js";

const die = ({ data, error }) => { if (error) throw error; return data; };
export const ROLES = [["CUSTOMER", "Customer"], ["SHIPPER", "Shipper / consignee"], ["VENDOR", "Vendor"], ["AGENT", "Agent"]];
export const VENDOR_CATEGORIES = ["TRUCKER", "SHIPPING LINE", "DEPOT", "SURVEYOR", "AGENT", "CLEANING", "REPAIR", "FORWARDER", "OTHER"];
export const DOC_TYPES = [["TRADE_LICENCE", "Trade licence"], ["TRN_CERTIFICATE", "TRN / VAT certificate"], ["AGREEMENT", "Agreement / contract"], ["BANK_LETTER", "Bank letter"], ["ID", "ID / passport of signatory"], ["OTHER", "Other"]];
export const STATUS = { PENDING: ["Waiting for approval", "#B7791F"], APPROVED: ["Approved", "#2E7D5B"], REJECTED: ["Rejected", "#C53030"] };
const BUCKET = "party-documents";

export async function fetchParties() { return (await supabase.rpc("parties")).data || []; }
export async function partiesAttention() { try { return (await supabase.rpc("parties_attention")).data || { pending: 0, licences: 0, canApprove: false }; } catch { return { pending: 0, licences: 0, canApprove: false }; } }
export async function createParty(form) { return die(await supabase.rpc("party_create", { p: form })); }
export async function decideParty(kind, id, approve, reason) { die(await supabase.rpc("party_decide", { p_kind: kind, p_id: id, p_approve: approve, p_reason: reason || null })); }

// editing an existing party: the same fields on both rows when the company is customer and vendor
const COLS = { shortName: "short_name", category: "category", address: "address", city: "city", country: "country", contactName: "contact_name", phone: "phone", email: "email", trn: "trn",
  paymentTerms: "payment_terms", notes: "notes", licenceNo: "licence_no", licenceExpiry: "licence_expiry", website: "website", bankName: "bank_name", bankAccount: "bank_account", iban: "iban", swift: "swift" };
export async function updateParty(party, form) {
  const patch = {}; Object.entries(COLS).forEach(([k, col]) => { if (form[k] !== undefined) patch[col] = form[k] === "" ? null : form[k]; });
  patch.updated_at = new Date().toISOString();
  if (party.customerId) die(await supabase.from("customers").update(patch).eq("id", party.customerId));
  if (party.vendorId) { const vp = { ...patch }; if (party.roles.includes("AGENT")) vp.category = "AGENT"; die(await supabase.from("vendors").update(vp).eq("id", party.vendorId)); }
}
export async function renameParty(party, name) {
  const n = String(name || "").trim().toUpperCase();
  if (party.customerId) die(await supabase.from("customers").update({ name: n, updated_at: new Date().toISOString() }).eq("id", party.customerId));
  if (party.vendorId) die(await supabase.from("vendors").update({ name: n, updated_at: new Date().toISOString() }).eq("id", party.vendorId));
}

// documents: stored privately, served through short-lived signed links
export async function fetchDocuments(party) {
  const ids = [party.customerId, party.vendorId].filter(Boolean);
  if (!ids.length) return [];
  return die(await supabase.from("party_documents").select("*").in("party_id", ids).order("uploaded_at", { ascending: false }));
}
export async function uploadDocument(party, file, docType, title, expiryDate) {
  const kind = party.customerId ? "CUSTOMER" : "VENDOR"; const id = party.customerId || party.vendorId;
  const safe = file.name.replace(/[^A-Za-z0-9._-]+/g, "_");
  const path = `${kind.toLowerCase()}/${id}/${Date.now()}_${safe}`;
  die(await supabase.storage.from(BUCKET).upload(path, file, { upsert: false, contentType: file.type || undefined }));
  const { data: { user } } = await supabase.auth.getUser();
  return die(await supabase.from("party_documents").insert({ party_kind: kind, party_id: id, doc_type: docType, title: title || null, file_path: path, file_name: file.name, expiry_date: expiryDate || null, uploaded_by: user && user.email ? user.email : null }).select().single());
}
export async function documentUrl(doc) { const r = await supabase.storage.from(BUCKET).createSignedUrl(doc.file_path, 300); return die(r).signedUrl; }
export async function deleteDocument(doc) { await supabase.storage.from(BUCKET).remove([doc.file_path]); die(await supabase.from("party_documents").delete().eq("id", doc.id)); }

// duplicate check while typing: same key as the database (quotes.master_key), plus "looks alike"
const SUFFIX = /\b(L ?L ?C|FZ ?CO?|FZE|FZ|DMCC|LTD|LIMITED|PVT|PTE|CO|COMPANY|INC|B ?V|N ?V|S ?A ?R ?L|S ?A|GMBH|PLC|LLP|K ?S ?C ?C|JSC|AS|AG|SDN BHD|PTY)\b/g;
export const partyKey = (s) => String(s || "").toUpperCase().replace(/\s*[-/(]\s*(AR|SALES|ACCOUNTS?|OPS)\s*[)]?\s*$/, "").replace(/[^A-Z0-9]+/g, " ").replace(SUFFIX, "").replace(/\s+/g, "");
const bigrams = (s) => { const b = new Set(); for (let i = 0; i < s.length - 1; i++) b.add(s.slice(i, i + 2)); return b; };
export function similar(a, b) { const x = bigrams(partyKey(a)), y = bigrams(partyKey(b)); if (!x.size || !y.size) return 0; let n = 0; x.forEach((g) => { if (y.has(g)) n++; }); return (2 * n) / (x.size + y.size); }
export function lookAlikes(name, parties, exceptKey) {
  const k = partyKey(name); if (k.length < 3) return [];
  return parties.filter((p) => p.key !== exceptKey).map((p) => ({ p, exact: p.key === k, contains: k.length >= 5 && (p.key.includes(k) || k.includes(p.key)), score: similar(name, p.name) }))
    .filter((x) => x.exact || x.contains || x.score >= 0.6).sort((a, b) => (b.exact - a.exact) || (b.contains - a.contains) || b.score - a.score).slice(0, 5);
}
