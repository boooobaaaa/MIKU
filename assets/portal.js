/* =========================================================
   TEAM PORTAL — team principals / executives submit articles,
   a league admin approves them into News.
   Uses the same Firebase project as Grid Draft.
   ========================================================= */
(() => {
'use strict';
const LG = window.LG;
const { esc, byId, teamColor, toast } = LG;
const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
const ROLES = ['Team principal', 'Executive officer', 'Chief executive officer', 'Team manager', 'Press / Media', 'Photographer', 'Journalist'];
const isPress = m => m && !m.teamId;
const STATUS = { pending: ['Waiting for review', 'pt-pending'], changes: ['Changes requested', 'pt-changes'], approved: ['Approved', 'pt-approved'], rejected: ['Not accepted', 'pt-rejected'] };

/* ---------------- store ---------------- */
function fbStore(conf) {
  const s = { ready: false, user: null, member: null, error: '', listeners: [] };
  let A, F, auth, db;
  const emit = () => s.listeners.forEach(f => { try { f(); } catch (e) { } });
  const ts = v => v && v.toMillis ? v.toMillis() : (v || 0);
  const convL = x => Object.assign({}, x.data(), { uid: x.id, createdAt: ts(x.data().createdAt), createdAtRaw: x.data().createdAt || null, updatedAt: ts(x.data().updatedAt), reviewedAt: ts(x.data().reviewedAt) });
  const convF = x => { const v = x.data(); return Object.assign({}, v, { uid: x.id, updatedAt: ts(v.updatedAt), history: (v.history || []).map(h => ({ picks: h.picks, at: ts(h.at) })) }); };
  const conv = x => Object.assign({ id: x.id }, x.data(), { createdAt: ts(x.data().createdAt), updatedAt: ts(x.data().updatedAt), reviewedAt: ts(x.data().reviewedAt), signedAt: ts(x.data().signedAt) });
  (async () => {
    try {
      const [app, au, fs] = await Promise.all([import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-firestore.js')]);
      A = au; F = fs;
      const a = app.getApps().length ? app.getApp() : app.initializeApp(conf);
      auth = A.getAuth(a); db = F.getFirestore(a);
      A.onAuthStateChanged(auth, async u => {
        s.user = u ? { uid: u.uid, email: String(u.email || '').toLowerCase(), displayName: u.displayName } : null;
        s.member = null; s.siteAdmin = null;
        // portal access: a linked Discord account (by sign-in id) first, then the older Google-email list
        if (u) { try { const m = await F.getDoc(F.doc(db, 'portal_uids', u.uid)); s.member = m.exists() ? Object.assign({ via: 'discord' }, m.data()) : null; } catch (e) { s.member = null; } }
        if (u && u.email && !s.member) { try { const m = await F.getDoc(F.doc(db, 'portal_members', s.user.email)); s.member = m.exists() ? m.data() : null; } catch (e) { s.member = null; } }
        if (u && u.email) { try { const m = await F.getDoc(F.doc(db, 'site_admins', s.user.email)); s.siteAdmin = m.exists() ? m.data() : null; } catch (e) { s.siteAdmin = null; } }
        s.ready = true; emit();
      });
    } catch (e) { s.error = 'Could not load Firebase: ' + e.message; s.ready = true; emit(); }
  })();
  Object.assign(s, {
    on(f) { s.listeners.push(f); },
    async signIn() { const p = new A.GoogleAuthProvider(); try { await A.signInWithPopup(auth, p); } catch (e) { if (/popup-blocked|operation-not-supported/.test(e.code || '')) return A.signInWithRedirect(auth, p); throw e; } },
    async signOut() { await A.signOut(auth); },
    async mySubs() { const q = await F.getDocs(F.query(F.collection(db, 'portal_subs'), F.where('uid', '==', s.user.uid))); return q.docs.map(conv); },
    async submit(x) {
      await F.addDoc(F.collection(db, 'portal_subs'), { uid: s.user.uid, email: s.user.email, name: s.member.name, role: s.member.role, teamId: s.member.teamId,
        title: x.title, tag: x.tag || '', body: x.body || '', image: x.image || '', kind: x.kind || 'article', images: x.images || [], roundId: x.roundId || '',
        status: 'pending', note: '', newsId: '', createdAt: F.serverTimestamp(), updatedAt: F.serverTimestamp(), reviewedAt: null });
    },
    async edit(id, x) { await F.updateDoc(F.doc(db, 'portal_subs', id), { title: x.title, tag: x.tag || '', body: x.body || '', image: x.image || '', kind: x.kind || 'article', images: x.images || [], roundId: x.roundId || '', status: 'pending', updatedAt: F.serverTimestamp() }); },
    async withdraw(id) { await F.deleteDoc(F.doc(db, 'portal_subs', id)); },
    async allSubs() { const q = await F.getDocs(F.collection(db, 'portal_subs')); return q.docs.map(conv); },
    async review(id, status, note, newsId) { await F.updateDoc(F.doc(db, 'portal_subs', id), { status, note: note || '', newsId: newsId || '', reviewedAt: F.serverTimestamp() }); },
    async members() { const q = await F.getDocs(F.collection(db, 'portal_members')); return q.docs.map(x => Object.assign({ email: x.id }, x.data())); },
    async setMember(email, x) { await F.setDoc(F.doc(db, 'portal_members', email), { name: x.name, role: x.role, teamId: x.teamId }); },
    async removeMember(email) { await F.deleteDoc(F.doc(db, 'portal_members', email)); },
    async uidMembers() { const q = await F.getDocs(F.collection(db, 'portal_uids')); return q.docs.map(x => Object.assign({ uid: x.id }, x.data())); },
    async setUidMember(uid, x) { await F.setDoc(F.doc(db, 'portal_uids', uid), { name: x.name, role: x.role, teamId: x.teamId, discordId: x.discordId || '', discordName: x.discordName || '', discordAvatar: x.discordAvatar || '' }); },
    async removeUidMember(uid) { await F.deleteDoc(F.doc(db, 'portal_uids', uid)); },
    /* admin team */
    async siteAdmins() { const q = await F.getDocs(F.collection(db, 'site_admins')); return q.docs.map(x => Object.assign({ email: x.id }, x.data())); },
    async setSiteAdmin(email, x) { await F.setDoc(F.doc(db, 'site_admins', email), { name: x.name, sections: x.sections }); },
    async removeSiteAdmin(email) { await F.deleteDoc(F.doc(db, 'site_admins', email)); },
    async getKey() { const k = await F.getDoc(F.doc(db, 'site_secrets', 'github')); if (!k.exists()) return null; const v = k.data(); return Object.assign({}, v, { at: ts(v.at) }); },
    async setKey(x) { await F.setDoc(F.doc(db, 'site_secrets', 'github'), { token: x.token, owner: x.owner, repo: x.repo, branch: x.branch, path: x.path, by: x.by || '', at: F.serverTimestamp() }); },
    async clearKey() { await F.deleteDoc(F.doc(db, 'site_secrets', 'github')); },
    async log(action, detail, name) { await F.addDoc(F.collection(db, 'site_log'), { email: s.user.email, name: String(name || '').slice(0, 80), action: String(action).slice(0, 60), detail: String(detail || '').slice(0, 500), at: F.serverTimestamp() }); },
    async logs() { const q = await F.getDocs(F.query(F.collection(db, 'site_log'), F.orderBy('at', 'desc'), F.limit(40))); return q.docs.map(x => Object.assign({ id: x.id }, x.data(), { at: ts(x.data().at) })); },
    /* applications */
    async appHook() { const x = await F.getDoc(F.doc(db, 'app_config', 'discord')); return x.exists() ? x.data() : null; },
    async setAppHook(x) { await F.setDoc(F.doc(db, 'app_config', 'discord'), { url: x.url || '', decisions: x.decisions !== false, ping: x.ping || '' }); },
    async myApps() { const q = await F.getDocs(F.query(F.collection(db, 'applications'), F.where('uid', '==', s.user.uid))); return q.docs.map(conv); },
    async submitApp(id, x) { await F.setDoc(F.doc(db, 'applications', id), { uid: s.user.uid, email: s.user.email, formId: x.formId, formTitle: x.formTitle, applicant: x.applicant, answers: x.answers, status: 'pending', note: '', reviewer: '', createdAt: F.serverTimestamp(), updatedAt: F.serverTimestamp(), reviewedAt: null }); },
    async editApp(id, x) { await F.updateDoc(F.doc(db, 'applications', id), { applicant: x.applicant, answers: x.answers, updatedAt: F.serverTimestamp() }); },
    async withdrawApp(id) { await F.deleteDoc(F.doc(db, 'applications', id)); },
    async allApps() { const q = await F.getDocs(F.collection(db, 'applications')); return q.docs.map(conv); },
    async reviewApp(id, status, note, reviewer, clearSig) { await F.updateDoc(F.doc(db, 'applications', id), Object.assign({ status, note: note || '', reviewer: reviewer || '', reviewedAt: F.serverTimestamp() }, clearSig ? { signature: '', contract: '', signedAt: null } : {})); },
    async signApp(id, signature, contract) { await F.updateDoc(F.doc(db, 'applications', id), { status: 'signed', signature, contract, signedAt: F.serverTimestamp() }); },
    async deleteApp(id) { await F.deleteDoc(F.doc(db, 'applications', id)); },
    /* predictions */
    async predRounds() { const q = await F.getDocs(F.collection(db, 'pred_rounds')); const o = {}; q.docs.forEach(x => { const v = x.data(); o[x.id] = { open: !!v.open, lockAt: ts(v.lockAt), openAt: ts(v.openAt), manual: !!v.manual }; }); return o; },
    async setPredRound(rid, x) { await F.setDoc(F.doc(db, 'pred_rounds', rid), { open: !!x.open, lockAt: new Date(x.lockAt), openAt: new Date(x.openAt || 0), manual: !!x.manual }); },
    async allPreds() { const q = await F.getDocs(F.collection(db, 'predictions')); return q.docs.map(x => Object.assign({ id: x.id }, x.data(), { at: ts(x.data().at) })); },
    async savePred(rid, x) { await F.setDoc(F.doc(db, 'predictions', rid + '_' + s.user.uid), { uid: s.user.uid, name: x.name, roundId: rid, podium: x.podium, fl: x.fl, pole: x.pole, at: F.serverTimestamp() }); },
    async deletePred(id) { await F.deleteDoc(F.doc(db, 'predictions', id)); },
    /* accounts — Discord links (approved by an admin) */
    async myLink() { const x = await F.getDoc(F.doc(db, 'links', s.user.uid)); return x.exists() ? convL(x) : null; },
    async requestLink(x, prev) {
      await F.setDoc(F.doc(db, 'links', s.user.uid), { uid: s.user.uid, discordId: String(x.discordId), discordName: x.discordName || '', discordUser: x.discordUser || '', discordAvatar: x.discordAvatar || '', driverId: x.driverId || '',
        status: 'pending', note: '', createdAt: prev && prev.createdAtRaw ? prev.createdAtRaw : F.serverTimestamp(), updatedAt: F.serverTimestamp(), reviewedAt: null });
    },
    async unlink() { await F.deleteDoc(F.doc(db, 'links', s.user.uid)); },
    async approvedLinks() { const q = await F.getDocs(F.query(F.collection(db, 'links'), F.where('status', '==', 'approved'))); return q.docs.map(convL); },
    async allLinks() { const q = await F.getDocs(F.collection(db, 'links')); return q.docs.map(convL); },
    async reviewLink(uid, status, note, driverId) { await F.updateDoc(F.doc(db, 'links', uid), { status, note: note || '', driverId: driverId || '', reviewedAt: F.serverTimestamp() }); },
    async deleteLink(uid) { await F.deleteDoc(F.doc(db, 'links', uid)); },
    /* fantasy teams on accounts — every save is appended with the time it was made */
    async allFantasy() { const q = await F.getDocs(F.collection(db, 'fantasy')); return q.docs.map(convF); },
    async myFantasy() { const x = await F.getDoc(F.doc(db, 'fantasy', s.user.uid)); return x.exists() ? convF(x) : null; },
    async saveFantasy(x, picksChanged) {
      const ref = F.doc(db, 'fantasy', s.user.uid), cur = await F.getDoc(ref);
      const hist = cur.exists() ? (cur.data().history || []) : [];
      const next = picksChanged || !hist.length ? hist.concat([{ picks: x.picks, at: F.Timestamp.now() }]) : hist;
      const old = cur.exists() ? cur.data() : null, doc = { uid: s.user.uid, name: x.name, manager: x.manager, history: next, updatedAt: F.serverTimestamp() };
      if (old) {
        if (old.nameLocked) { doc.nameLocked = true; doc.name = old.name; doc.manager = old.manager; }
        if ('origManager' in old) doc.origManager = old.origManager; else if (doc.manager !== old.manager) doc.origManager = old.manager;
        if ('origName' in old) doc.origName = old.origName; else if (doc.name !== old.name) doc.origName = old.name;
      }
      await F.setDoc(ref, doc);
      return doc;
    },
    async adminSetFantasyNames(uid, x) { await F.updateDoc(F.doc(db, 'fantasy', uid), { manager: x.manager, name: x.name, nameLocked: !!x.locked }); },
    async deleteFantasy(uid) { await F.deleteDoc(F.doc(db, 'fantasy', uid)); }
  });
  return s;
}
let STORE = null, KEY = '';
function hook(s) { if (s && !s.__hooked) { s.__hooked = true; s.on(() => { P.subs = null; if (/^#\/(portal|admin|apply|join|predictions|account|fantasy)/.test(location.hash)) LG.render(false); }); } return s; }
function store(d) {
  if (window.PT_TEST_STORE) return hook(window.PT_TEST_STORE);
  const conf = d.gridDraft && d.gridDraft.firebase && d.gridDraft.firebase.apiKey ? d.gridDraft.firebase : null;
  if (!conf) return null;
  const k = JSON.stringify(conf);
  if (!STORE || KEY !== k) { STORE = fbStore(conf); KEY = k; }
  return hook(STORE);
}

/* ---------------- Firestore rules (appended to the Grid Draft rules) ---------------- */
const RULES = `
    // ---------------- Team portal (article submissions) ----------------
    function myEmail() { return request.auth.token.email.lower(); }
    // access by linked Discord account (stored under the person's sign-in id) or by Google email
    function isUidMember() { return signedIn() && exists(/databases/$(db)/documents/portal_uids/$(request.auth.uid)); }
    function isEmailMember() { return signedIn() && request.auth.token.email_verified == true && exists(/databases/$(db)/documents/portal_members/$(myEmail())); }
    function isMember() { return isUidMember() || isEmailMember(); }
    function member() { return isUidMember() ? get(/databases/$(db)/documents/portal_uids/$(request.auth.uid)).data : get(/databases/$(db)/documents/portal_members/$(myEmail())).data; }
    function validSub(s) {
      return s.title is string && s.title.size() > 0 && s.title.size() <= 140
        && s.tag is string && s.tag.size() <= 40
        && s.body is string && s.body.size() <= 60000
        && s.image is string && s.image.size() <= 750000
        && s.kind in ['article', 'photos'] && s.images is list && s.images.size() <= 4 && s.roundId is string
        && (s.kind == 'photos' ? s.images.size() > 0 : s.body.size() > 0);
    }
    match /portal_uids/{uid} {
      allow read: if canReview() || (signedIn() && request.auth.uid == uid);
      allow write: if canReview();
    }
    match /portal_members/{email} {
      allow read: if canReview() || (signedIn() && request.auth.token.email_verified == true && myEmail() == email);
      allow write: if canReview();
    }
    match /portal_subs/{id} {
      allow read: if canReview() || (signedIn() && resource.data.uid == request.auth.uid);
      allow create: if isMember()
        && request.resource.data.keys().hasOnly(['uid', 'email', 'name', 'role', 'teamId', 'title', 'tag', 'body', 'image', 'kind', 'images', 'roundId', 'status', 'note', 'newsId', 'createdAt', 'updatedAt', 'reviewedAt'])
        && request.resource.data.uid == request.auth.uid && request.resource.data.email == myEmail()
        && request.resource.data.name == member().name && request.resource.data.role == member().role && request.resource.data.teamId == member().teamId
        && request.resource.data.status == 'pending' && request.resource.data.note == '' && request.resource.data.newsId == '' && request.resource.data.reviewedAt == null
        && request.resource.data.createdAt == request.time && request.resource.data.updatedAt == request.time
        && validSub(request.resource.data);
      allow update: if (isMember() && resource.data.uid == request.auth.uid && resource.data.status in ['pending', 'changes']
          && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['title', 'tag', 'body', 'image', 'kind', 'images', 'roundId', 'status', 'updatedAt'])
          && request.resource.data.status == 'pending' && request.resource.data.updatedAt == request.time && validSub(request.resource.data))
        || (canReview() && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status', 'note', 'reviewedAt', 'newsId'])
          && request.resource.data.status in ['pending', 'approved', 'rejected', 'changes'] && request.resource.data.note is string && request.resource.data.note.size() <= 2000);
      allow delete: if canReview() || (signedIn() && resource.data.uid == request.auth.uid && resource.data.status in ['pending', 'changes', 'rejected']);
    }

    // ---------------- Admin team (people you let into the console to publish) ----------------
    function isCoAdmin() { return signedIn() && request.auth.token.email_verified == true && exists(/databases/$(db)/documents/site_admins/$(myEmail())); }
    function coSections() { return get(/databases/$(db)/documents/site_admins/$(myEmail())).data.sections; }
    function canReview() { return isAdmin() || (isCoAdmin() && ('*' in coSections() || 'portal' in coSections())); }
    match /site_admins/{email} {
      allow read: if isAdmin() || (signedIn() && request.auth.token.email_verified == true && myEmail() == email);
      allow write: if isAdmin();
    }
    match /site_secrets/{id} {
      allow read: if isAdmin() || isCoAdmin();
      allow write: if isAdmin();
    }
    match /site_log/{id} {
      allow read: if isAdmin() || isCoAdmin();
      allow create: if (isAdmin() || isCoAdmin())
        && request.resource.data.keys().hasOnly(['email', 'name', 'action', 'detail', 'at'])
        && request.resource.data.email == myEmail() && request.resource.data.at == request.time
        && request.resource.data.name is string && request.resource.data.name.size() <= 80
        && request.resource.data.action is string && request.resource.data.action.size() <= 60
        && request.resource.data.detail is string && request.resource.data.detail.size() <= 500;
      allow update: if false;
      allow delete: if isAdmin();
    }

    // ---------------- Applications (public forms) ----------------
    function canReviewApps() { return isAdmin() || (isCoAdmin() && ('*' in coSections() || 'applications' in coSections())); }
    function validApp(a) {
      return a.formId is string && a.formId.size() > 0 && a.formId.size() <= 40
        && a.formTitle is string && a.formTitle.size() <= 140
        && a.applicant is string && a.applicant.size() > 0 && a.applicant.size() <= 80
        && a.answers is map && a.answers.size() <= 40;
    }
    match /app_config/{id} {
      allow read: if signedIn() && request.auth.token.email_verified == true;
      allow write: if isAdmin();
    }
    match /applications/{id} {
      allow read: if canReviewApps() || (signedIn() && resource.data.uid == request.auth.uid);
      allow create: if signedIn() && request.auth.token.email_verified == true
        && id == request.resource.data.formId + '_' + request.auth.uid
        && request.resource.data.keys().hasOnly(['uid', 'email', 'formId', 'formTitle', 'applicant', 'answers', 'status', 'note', 'reviewer', 'createdAt', 'updatedAt', 'reviewedAt'])
        && request.resource.data.uid == request.auth.uid && request.resource.data.email == myEmail()
        && request.resource.data.status == 'pending' && request.resource.data.note == '' && request.resource.data.reviewer == ''
        && request.resource.data.createdAt == request.time && request.resource.data.updatedAt == request.time && request.resource.data.reviewedAt == null
        && validApp(request.resource.data);
      allow update: if (signedIn() && resource.data.uid == request.auth.uid && resource.data.status == 'pending'
          && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['applicant', 'answers', 'updatedAt'])
          && request.resource.data.updatedAt == request.time && validApp(request.resource.data))
        || (signedIn() && resource.data.uid == request.auth.uid && resource.data.status == 'offer'
          && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status', 'signature', 'contract', 'signedAt'])
          && request.resource.data.status == 'signed' && request.resource.data.signedAt == request.time
          && request.resource.data.signature is string && request.resource.data.signature.size() >= 2 && request.resource.data.signature.size() <= 80
          && request.resource.data.contract is string && request.resource.data.contract.size() <= 30000)
        || (canReviewApps() && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status', 'note', 'reviewer', 'reviewedAt', 'signature', 'contract', 'signedAt'])
          && request.resource.data.status in ['pending', 'offer', 'signed', 'accepted', 'waitlist', 'denied']
          && request.resource.data.note is string && request.resource.data.note.size() <= 2000
          && request.resource.data.reviewer is string && request.resource.data.reviewer.size() <= 80);
      allow delete: if canReviewApps() || (signedIn() && resource.data.uid == request.auth.uid && resource.data.status in ['pending', 'denied']);
    }

    // ---------------- Predictions ----------------
    function canRunPreds() { return isAdmin() || (isCoAdmin() && ('*' in coSections() || 'predictions' in coSections())); }
    function predOpen(rid) {
      return exists(/databases/$(db)/documents/pred_rounds/$(rid))
        && get(/databases/$(db)/documents/pred_rounds/$(rid)).data.open == true
        && request.time < get(/databases/$(db)/documents/pred_rounds/$(rid)).data.lockAt
        && request.time >= get(/databases/$(db)/documents/pred_rounds/$(rid)).data.get('openAt', timestamp.value(0));
    }
    match /pred_rounds/{rid} {
      allow read: if true;
      allow write: if canRunPreds();
    }
    match /predictions/{id} {
      allow read: if true;
      allow create, update: if signedIn() && request.auth.token.email_verified == true
        && id == request.resource.data.roundId + '_' + request.auth.uid
        && request.resource.data.keys().hasOnly(['uid', 'name', 'roundId', 'podium', 'fl', 'pole', 'at'])
        && request.resource.data.uid == request.auth.uid
        && request.resource.data.name is string && request.resource.data.name.size() > 0 && request.resource.data.name.size() <= 40
        && request.resource.data.podium is list && request.resource.data.podium.size() == 3
        && request.resource.data.fl is string && request.resource.data.fl.size() <= 60
        && request.resource.data.pole is string && request.resource.data.pole.size() <= 60
        && request.resource.data.at == request.time
        && predOpen(request.resource.data.roundId);
      allow delete: if canRunPreds();
    }

    // ---------------- Accounts: Discord links approved by an admin ----------------
    function canReviewLinks() { return isAdmin() || (isCoAdmin() && ('*' in coSections() || 'accounts' in coSections())); }
    function canRunFantasy() { return isAdmin() || (isCoAdmin() && ('*' in coSections() || 'fantasy' in coSections())); }
    function shortStr(v, n) { return v is string && v.size() <= n; }
    function validLinkReq(x, uid) {
      return x.keys().hasOnly(['uid', 'discordId', 'discordName', 'discordUser', 'discordAvatar', 'driverId', 'status', 'note', 'createdAt', 'updatedAt', 'reviewedAt'])
        && x.uid == uid && x.status == 'pending' && x.note == '' && x.reviewedAt == null && x.updatedAt == request.time
        && x.discordId is string && x.discordId.matches('[0-9]{5,25}')
        && shortStr(x.discordName, 80) && shortStr(x.discordUser, 40) && shortStr(x.discordAvatar, 80) && shortStr(x.driverId, 60);
    }
    match /links/{uid} {
      allow read: if (signedIn() && request.auth.uid == uid) || resource.data.status == 'approved' || canReviewLinks();
      allow create: if signedIn() && request.auth.uid == uid && validLinkReq(request.resource.data, uid) && request.resource.data.createdAt == request.time;
      allow update: if (signedIn() && request.auth.uid == uid && resource.data.status in ['pending', 'denied']
          && validLinkReq(request.resource.data, uid) && request.resource.data.createdAt == resource.data.createdAt)
        || (canReviewLinks() && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status', 'note', 'driverId', 'reviewedAt'])
          && request.resource.data.status in ['pending', 'approved', 'denied'] && shortStr(request.resource.data.note, 500) && shortStr(request.resource.data.driverId, 60));
      allow delete: if (signedIn() && request.auth.uid == uid) || canReviewLinks();
    }

    // ---------------- Fantasy teams saved to accounts ----------------
    function ftEntryOk(h) {
      return h.keys().hasOnly(['picks', 'at']) && h.picks is map && h.picks.size() <= 8
        && h.at is timestamp && h.at > request.time - duration.value(10, 'm') && h.at < request.time + duration.value(2, 'm');
    }
    function ftDocOk(x, uid) {
      return x.keys().hasOnly(['uid', 'name', 'manager', 'history', 'updatedAt', 'origName', 'origManager', 'nameLocked']) && x.uid == uid
        && x.name is string && x.name.size() >= 1 && x.name.size() <= 40
        && x.manager is string && x.manager.size() >= 1 && x.manager.size() <= 40
        && x.history is list && x.history.size() >= 1 && x.history.size() <= 150 && x.updatedAt == request.time;
    }
    match /fantasy/{uid} {
      allow read: if true;
      function ftNamesOk(nd, od) {
        return nd.get('nameLocked', false) == od.get('nameLocked', false)
          && (od.get('nameLocked', false) != true || (nd.name == od.name && nd.manager == od.manager))
          && (('origName' in od) ? nd.origName == od.origName : (!('origName' in nd) || nd.origName == od.name))
          && (('origManager' in od) ? nd.origManager == od.origManager : (!('origManager' in nd) || nd.origManager == od.manager));
      }
      allow create: if signedIn() && request.auth.uid == uid && ftDocOk(request.resource.data, uid)
        && !('origName' in request.resource.data) && !('origManager' in request.resource.data) && !('nameLocked' in request.resource.data)
        && request.resource.data.history.size() == 1 && ftEntryOk(request.resource.data.history[0]);
      allow update: if (signedIn() && request.auth.uid == uid && ftDocOk(request.resource.data, uid) && ftNamesOk(request.resource.data, resource.data)
        && (request.resource.data.history == resource.data.history
          || (request.resource.data.history.size() == resource.data.history.size() + 1
            && request.resource.data.history[0:resource.data.history.size()] == resource.data.history
            && ftEntryOk(request.resource.data.history[resource.data.history.size()]))))
        || ((canRunFantasy() || canReviewLinks()) && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['name', 'manager', 'nameLocked'])
          && request.resource.data.name is string && request.resource.data.name.size() >= 1 && request.resource.data.name.size() <= 40
          && request.resource.data.manager is string && request.resource.data.manager.size() >= 1 && request.resource.data.manager.size() <= 40
          && request.resource.data.nameLocked is bool);
      allow delete: if canRunFantasy();
    }
`;

/* ---------------- image: shrink to a small JPEG data URL (fits in Firestore) ---------------- */
async function toCover(file) {
  const bmp = await createImageBitmap(file);
  const W = 1600, H = 900, c = document.createElement('canvas'); c.width = W; c.height = H;
  const sc = Math.max(W / bmp.width, H / bmp.height), w = bmp.width * sc, h = bmp.height * sc;
  const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.drawImage(bmp, (W - w) / 2, (H - h) / 2, w, h);
  for (const [cw, q] of [[1600, .82], [1280, .78], [1024, .72], [800, .66]]) {
    let cv = c;
    if (cw !== W) { cv = document.createElement('canvas'); cv.width = cw; cv.height = Math.round(cw * 9 / 16); cv.getContext('2d').drawImage(c, 0, 0, cv.width, cv.height); }
    const url = cv.toDataURL('image/jpeg', q);
    if (url.length <= 700000) return url;
  }
  throw new Error('That image is too detailed to attach — try a smaller one.');
}

async function toPhoto(file) {
  const bmp = await createImageBitmap(file);
  for (const [max, q] of [[1600, .8], [1400, .76], [1200, .72], [1000, .68], [800, .62]]) {
    const sc = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const url = c.toDataURL('image/jpeg', q);
    if (url.length <= 230000) return url;
  }
  throw new Error('That photo is too large — try a smaller one.');
}

/* ---------------- public portal page ---------------- */
const P = { tab: 'new', editId: '', form: null, subs: null, preview: false };
const blankForm = () => ({ kind: 'article', title: '', tag: '', body: '', image: '', images: [], roundId: '' });
const head = (eyebrow, title, sub) => `<div class="page-head"><div class="eyebrow">${esc(eyebrow)}</div><h1>${title}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}</div>`;
const emptyBox = (t, sub) => `<div class="empty"><b>${esc(t)}</b>${sub || ''}</div>`;
const badge = st => { const x = STATUS[st] || STATUS.pending; return `<span class="pt-st ${x[1]}">${x[0]}</span>`; };

function page(d) {
  const s = store(d);
  const top = head('Team portal', 'Team staff portal', 'For team principals and executives. Write an article for the league news — an admin reviews it before it goes live.');
  if (!s) return `<div class="page pt">${top}${emptyBox('The portal isn’t switched on yet', '<p>A league admin needs to finish the Firebase setup first.</p>')}</div>`;
  if (s.error) return `<div class="page pt">${top}${emptyBox('Can’t connect right now', `<p>${esc(s.error)}</p>`)}</div>`;
  if (!s.ready) return `<div class="page pt">${top}<div class="loading">Checking your access…</div></div>`;
  if (!s.user) return `<div class="page pt">${top}<div class="card pt-lock"><div class="pt-lock-ic">🔒</div><h3>Staff only</h3><p class="muted">Sign in with the Google account a league admin registered for your team.</p><button class="btn primary" data-pt="signin">Sign in with Google</button></div></div>`;
  if (!s.member) return `<div class="page pt">${top}<div class="card pt-lock"><div class="pt-lock-ic">🔒</div><h3>This account isn’t registered as team staff</h3><p class="muted">${d.accounts && d.accounts.enabled ? `Link your Discord under <a href="#/account">👤 My account</a> and ask a league admin to give it portal access — then reload this page.` : `You’re signed in with Google. Ask a league admin to give this account portal access, then reload this page.`}</p><button class="btn" data-pt="signout">Use a different account</button></div></div>`;
  const m = s.member, t = byId(d.teams, m.teamId), press = isPress(m);
  if (P.subs === null) { P.subs = 'loading'; s.mySubs().then(x => { P.subs = x.sort((a, b) => b.updatedAt - a.updatedAt); LG.render(false); }).catch(e => { P.subs = []; toast('Couldn’t load your articles: ' + (e.code || e.message), 'err'); LG.render(false); }); }
  const subs = Array.isArray(P.subs) ? P.subs : [];
  const waiting = subs.filter(x => x.status === 'changes').length;
  if (!P.form) P.form = blankForm();
  P.form = Object.assign(blankForm(), P.form);
  const f = P.form, editing = P.editId ? subs.find(x => x.id === P.editId) : null;
  if (P.tab === 'new' && f.kind === 'photos') P.tab = 'photos';
  if (P.tab === 'photos' && f.kind !== 'photos') { if (!f.title && !f.body) P.form = Object.assign(blankForm(), { kind: 'photos' }); else P.tab = 'new'; }
  const tabs = `<div class="tabs"><button data-pt-tab="new" class="${P.tab === 'new' ? 'active' : ''}">${editing && f.kind !== 'photos' ? 'Edit article' : 'Write an article'}</button><button data-pt-tab="photos" class="${P.tab === 'photos' ? 'active' : ''}">${editing && f.kind === 'photos' ? 'Edit photos' : 'Send photos'}</button><button data-pt-tab="mine" class="${P.tab === 'mine' ? 'active' : ''}">My submissions${subs.length ? ` <span class="muted">${subs.length}</span>` : ''}${waiting ? ' <span class="dot"></span>' : ''}</button></div>`;
  const rs = LG.rounds(d).filter(r => !r.cancelled);
  const photosForm = `<div class="card pt-form">
      ${editing && editing.status === 'changes' && editing.note ? `<div class="warn"><b>Admin asked for changes:</b> ${esc(editing.note)}</div>` : ''}
      <label class="fld"><span>Caption / title</span><input id="pt-title" maxlength="140" value="${esc(f.title)}" placeholder="e.g. Lights out at Suzuka"></label>
      <label class="fld"><span>Round (optional)</span><select id="pt-round"><option value="">— Not about a specific round —</option>${rs.map(r => `<option value="${esc(r.id)}" ${f.roundId === r.id ? 'selected' : ''}>R${esc(r.round)} · ${esc(r.name)}</option>`).join('')}</select></label>
      <div class="fld"><span>Photos (up to 4 per submission)</span>
        <div class="pt-photos">${(f.images || []).map((u, k) => `<div class="pt-ph"><img src="${esc(u)}" alt=""><button class="iconbtn del" data-pt="rmphoto" data-k="${k}" title="Remove">✕</button></div>`).join('')}
          ${(f.images || []).length < 4 ? `<label class="pt-ph add">＋<span>Add photo</span><input type="file" accept="image/*" id="pt-photos" multiple hidden></label>` : ''}</div></div>
      <label class="fld"><span>Notes for the admins (optional)</span><textarea id="pt-body" rows="3" placeholder="Who's in the shot, where it was taken…">${esc(f.body)}</textarea></label>
      <div class="toolbar pt-actions"><button class="btn primary" data-pt="submit">${editing ? 'Resubmit for approval' : 'Send for approval'}</button>${editing ? '<button class="btn ghost" data-pt="cancel">Cancel editing</button>' : '<button class="btn ghost" data-pt="clear">Clear</button>'}</div>
      <p class="hint">Photos are shrunk to web size automatically. Approved photos appear in the site's <b>Gallery</b>, credited to you.</p>
    </div>`;
  const writer = `<div class="pt-grid">
    <div class="card pt-form">
      ${editing && editing.status === 'changes' && editing.note ? `<div class="warn"><b>Admin asked for changes:</b> ${esc(editing.note)}</div>` : ''}
      <label class="fld"><span>Headline</span><input id="pt-title" maxlength="140" value="${esc(f.title)}" placeholder="e.g. ${esc(t ? t.name : 'Our team')} confirm 2027 line-up"></label>
      <label class="fld"><span>Tag (optional)</span><input id="pt-tag" maxlength="40" value="${esc(f.tag)}" placeholder="Team news, Press release, Driver signing…"></label>
      <div class="fld"><span>Cover photo (optional · cropped to 16:9)</span>
        <div class="pt-cover">${f.image ? `<img src="${esc(f.image)}" alt=""><button class="iconbtn del" data-pt="rmimg" title="Remove">✕</button>` : `<label class="btn sm">⬆ Choose photo<input type="file" accept="image/*" id="pt-img" hidden></label>`}</div></div>
      <label class="fld"><span>Article — # heading, **bold**, *italic*, - lists, [link](https://…)</span><textarea id="pt-body" rows="14" placeholder="Write your article here…">${esc(f.body)}</textarea></label>
      <div class="toolbar pt-actions"><button class="btn primary" data-pt="submit">${editing ? 'Resubmit for approval' : 'Submit for approval'}</button>${editing ? '<button class="btn ghost" data-pt="cancel">Cancel editing</button>' : '<button class="btn ghost" data-pt="clear">Clear</button>'}</div>
      <p class="hint">Your draft is saved in this browser as you type. Submitted articles go to the league admins — nothing is public until they approve it.</p>
    </div>
    <div class="pt-prev"><div class="pt-prev-l">Preview</div><article class="article">
      ${f.tag ? `<div class="eyebrow">${esc(f.tag)}</div>` : ''}<h1>${esc(f.title || 'Your headline')}</h1>
      <div class="a-meta"><span>by ${esc(m.name)} · ${esc(m.role)}${t ? ', ' + esc(t.name) : ''}</span></div>
      ${f.image ? `<div class="a-cover"><img src="${esc(f.image)}" alt=""></div>` : ''}<div class="prose">${f.body ? LG.md(f.body) : '<p class="muted">Start writing to see a preview.</p>'}</div></article></div>
  </div>`;
  const mine = P.subs === 'loading' ? '<div class="loading">Loading…</div>' : !subs.length ? emptyBox('Nothing submitted yet') : `<div class="pt-list">${subs.map(x => `<div class="pt-item">
      <div class="pt-item-top">${badge(x.status)}<span class="muted mono">${x.updatedAt ? new Date(x.updatedAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : ''}</span></div>
      <h3>${x.kind === 'photos' ? '📷 ' : ''}${esc(x.title)}</h3>
      ${x.kind === 'photos' && (x.images || []).length ? `<div class="pt-thumbs">${x.images.map(u => `<img src="${esc(u)}" alt="">`).join('')}</div>` : ''}
      ${x.note && x.status !== 'pending' ? `<p class="pt-note"><b>Admin:</b> ${esc(x.note)}</p>` : ''}
      <div class="toolbar">${['pending', 'changes'].includes(x.status) ? `<button class="btn sm" data-pt="edit" data-id="${esc(x.id)}">Edit</button>` : ''}${x.status === 'approved' && x.newsId ? `<a class="btn sm" href="#/news/${esc(x.newsId)}">View in News</a>` : ''}${x.status === 'approved' && x.kind === 'photos' ? '<a class="btn sm" href="#/gallery">View in Gallery</a>' : ''}${['pending', 'changes', 'rejected'].includes(x.status) ? `<button class="btn sm danger" data-pt="withdraw" data-id="${esc(x.id)}">${x.status === 'rejected' ? 'Delete' : 'Withdraw'}</button>` : ''}</div>
    </div>`).join('')}</div>`;
  return `<div class="page pt">
    <div class="pt-banner" style="--tc:${press ? 'var(--miku)' : esc(teamColor(t))}">${t && t.logo ? `<img src="${esc(LG.asset(t.logo))}" alt="" onerror="this.remove()">` : press ? '<span class="pt-press-ic">📷</span>' : ''}<div><div class="eyebrow">${press ? 'Press & media' : 'Team portal'}</div><h1>${esc(t ? t.name : press ? 'Press & media desk' : 'Team portal')}</h1><p>Signed in as <b>${esc(m.name)}</b> · ${esc(m.role)} · <button class="linkish" data-pt="signout">sign out</button></p></div></div>
    ${tabs}${P.tab === 'mine' ? mine : P.tab === 'photos' ? photosForm : writer}
  </div>`;
}

/* draft autosave */
const DKEY = 'league.portal.draft';
try { const x = JSON.parse(localStorage.getItem(DKEY) || 'null'); if (x) { P.form = x.form; P.editId = x.editId || ''; } } catch (e) { }
const saveDraft = () => { try { localStorage.setItem(DKEY, JSON.stringify({ form: P.form, editId: P.editId })); } catch (e) { } };
const clearDraft = () => { P.form = blankForm(); P.editId = ''; try { localStorage.removeItem(DKEY); } catch (e) { } };
let tmr = 0;
document.addEventListener('input', e => {
  if (!e.target.closest || !e.target.closest('.page.pt')) return;
  const id = e.target.id; if (!['pt-title', 'pt-tag', 'pt-body'].includes(id)) return;
  if (P.tab === 'photos') P.form.kind = 'photos';
  P.form = P.form || blankForm(); P.form[id.slice(3)] = e.target.value; saveDraft();
  clearTimeout(tmr); tmr = setTimeout(() => {
    const prev = document.querySelector('.pt-prev .article'); if (!prev) return;
    const pos = e.target.selectionStart, el = e.target; LG.render(false);
    const back = document.getElementById(el.id); if (back) { back.focus(); try { back.setSelectionRange(pos, pos); } catch (x) { } }
  }, 450);
});
document.addEventListener('change', async e => {
  if (e.target.id === 'pt-round') { P.form.roundId = e.target.value; P.form.kind = 'photos'; saveDraft(); return; }
  if (e.target.id === 'pt-photos') {
    const files = [...e.target.files].slice(0, 4 - (P.form.images || []).length);
    for (const f of files) { try { P.form.images = [...(P.form.images || []), await toPhoto(f)]; } catch (err) { toast(err.message, 'err'); } }
    P.form.kind = 'photos'; saveDraft(); LG.render(false); return;
  }
  if (e.target.id !== 'pt-img') return;
  const f = e.target.files[0]; if (!f) return;
  try { P.form.image = await toCover(f); saveDraft(); LG.render(false); } catch (err) { toast(err.message, 'err'); }
});
document.addEventListener('click', async e => {
  const tb = e.target.closest && e.target.closest('[data-pt-tab]');
  if (tb) { const nt = tb.dataset.ptTab; if (P.editId && nt !== 'mine' && ((nt === 'photos') !== (P.form.kind === 'photos'))) clearDraft(); if (nt === 'new' && P.form.kind === 'photos' && !P.form.title && !(P.form.images || []).length) P.form = blankForm(); P.tab = nt; if (P.tab === 'mine') P.subs = null; return LG.render(false); }
  const b = e.target.closest && e.target.closest('[data-pt]'); if (!b) return;
  const d = LG.S.data, s = store(d); if (!s) return;
  const k = b.dataset.pt;
  try {
    if (k === 'signin') return await s.signIn();
    if (k === 'signout') { await s.signOut(); P.subs = null; return; }
    if (k === 'rmimg') { P.form.image = ''; saveDraft(); return LG.render(false); }
    if (k === 'rmphoto') { P.form.images.splice(Number(b.dataset.k), 1); saveDraft(); return LG.render(false); }
    if (k === 'clear') { if (await Pop.ask(b, 'Clear this article?')) { clearDraft(); LG.render(false); } return; }
    if (k === 'cancel') { clearDraft(); P.tab = 'mine'; return LG.render(false); }
    if (k === 'clear' && P.tab === 'photos') { clearDraft(); P.form.kind = 'photos'; return LG.render(false); }
    if (k === 'edit') { const x = P.subs.find(z => z.id === b.dataset.id); P.form = { kind: x.kind || 'article', title: x.title, tag: x.tag || '', body: x.body || '', image: x.image || '', images: x.images || [], roundId: x.roundId || '' }; P.editId = x.id; P.tab = P.form.kind === 'photos' ? 'photos' : 'new'; saveDraft(); return LG.render(false); }
    if (k === 'withdraw') { if (!await Pop.ask(b, 'Remove this article?')) return; await s.withdraw(b.dataset.id); P.subs = null; toast('Removed'); return LG.render(false); }
    if (k === 'submit') {
      const f = P.form, photos = P.tab === 'photos';
      if (photos ? (!f.title.trim() || !(f.images || []).length) : (!f.title.trim() || !f.body.trim())) return toast(photos ? 'Add a caption and at least one photo' : 'Add a headline and some article text first', 'err');
      b.disabled = true;
      const x = photos ? { kind: 'photos', title: f.title.trim().slice(0, 140), tag: 'Photos', body: (f.body || '').slice(0, 2000), image: '', images: f.images.slice(0, 4), roundId: f.roundId || '' }
        : { kind: 'article', title: f.title.trim().slice(0, 140), tag: f.tag.trim().slice(0, 40), body: f.body.slice(0, 60000), image: f.image || '', images: [], roundId: '' };
      if (P.editId) await s.edit(P.editId, x); else await s.submit(x);
      clearDraft(); P.tab = 'mine'; P.subs = null;
      toast('Sent to the league admins for approval ✓'); return LG.render(false);
    }
  } catch (err) { b.disabled = false; toast((/permission/i.test(err.code || err.message) ? 'The server refused that — your access may have been removed, or the article was already reviewed. ' : 'Something went wrong: ') + (err.code || err.message), 'err'); }
});

window.Portal = { page, store, RULES, ROLES, STATUS, badge, isPress };
})();
