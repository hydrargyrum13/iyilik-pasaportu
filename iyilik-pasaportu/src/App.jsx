import React, { useEffect, useMemo, useState } from "react";
import "./App.css";

const LS_KEY = "iyilik_pasaportu_demo_v2";

function nowMs() { return Date.now(); }
function clamp01(x) { return Math.max(0, Math.min(1, x)); }
function fmtTime(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}
function startOfWeekISO(date = new Date()) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}
function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

const CATEGORIES = [
  { id: "institution_visit", title: "Kurum Ziyareti", desc: "Barınak / darülaceze / yetimhane gibi kurumlarda doğrulanabilir ziyaret.", weeklyCap: 40, basePoints: 20, requiresInstitutionCode: true },
  { id: "street_animals", title: "Sokak Hayvanı Besleme", desc: "Foto ile doğrulama (AI güven skoru) + haftalık tavan.", weeklyCap: 30, basePoints: 15, requiresInstitutionCode: false },
  { id: "other_help", title: "Diğer İyilik", desc: "Toplumsal destek / yardım (demo).", weeklyCap: 20, basePoints: 10, requiresInstitutionCode: false },
];

const CONF_BRACKETS = [
  { min: 0.9, label: "Güçlü kanıt", multiplier: 1.0 },
  { min: 0.8, label: "İyi", multiplier: 0.75 },
  { min: 0.7, label: "Orta", multiplier: 0.5 },
  { min: 0.6, label: "Zayıf", multiplier: 0.25 },
  { min: 0.0, label: "Geçersiz", multiplier: 0.0 },
];

function confToBracket(conf) {
  const c = clamp01(conf);
  return CONF_BRACKETS.find(b => c >= b.min) || CONF_BRACKETS[CONF_BRACKETS.length - 1];
}

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}
function saveState(state) {
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}
function defaultState() {
  return {
    auth: { role: null, userId: null, displayName: null },
    users: {
      citizen_1: { id: "citizen_1", name: "Demo Vatandaş" },
      inst_1: { id: "inst_1", name: "Demo Kurum Görevlisi", institutionId: "kurum_istanbul_01" },
      admin_1: { id: "admin_1", name: "Demo Yönetici" },
    },
    institutions: [
      { id: "kurum_istanbul_01", name: "İstanbul Barınak A", city: "İstanbul", type: "Barınak" },
      { id: "kurum_ankara_01", name: "Ankara Darülaceze B", city: "Ankara", type: "Darülaceze" },
      { id: "kurum_izmir_01", name: "İzmir Yetimhane C", city: "İzmir", type: "Yetimhane" },
    ],
    codes: [],
    deeds: [],
    flags: [],
  };
}

function usePersistentStore() {
  const [store, setStore] = useState(() => loadState() || defaultState());

  useEffect(() => { saveState(store); }, [store]);

  const api = useMemo(() => ({
    store,
    reset() { setStore(defaultState()); },
    login(role) {
      const userId = role === "citizen" ? "citizen_1" : role === "institution" ? "inst_1" : "admin_1";
      const user = store.users[userId];
      setStore(prev => ({ ...prev, auth: { role, userId, displayName: user.name } }));
    },
    logout() { setStore(prev => ({ ...prev, auth: { role: null, userId: null, displayName: null } })); },
    generateCode({ institutionId, ttlSeconds = 90 }) {
      const code = Math.random().toString(10).slice(2, 8);
      const item = { id: uid("code"), code, institutionId, createdAt: nowMs(), expiresAt: nowMs() + ttlSeconds * 1000, usedAt: null, usedBy: null };
      setStore(prev => ({ ...prev, codes: [item, ...prev.codes].slice(0, 25) }));
      return item;
    },
    verifyAndConsumeCode({ code, userId }) {
      const idx = store.codes.findIndex(c => c.code === code);
      if (idx === -1) return { ok: false, reason: "Kod bulunamadı." };
      const c = store.codes[idx];
      if (c.usedAt) return { ok: false, reason: "Kod daha önce kullanılmış." };
      if (nowMs() > c.expiresAt) return { ok: false, reason: "Kodun süresi dolmuş." };

      const updated = { ...c, usedAt: nowMs(), usedBy: userId };
      const codes2 = [...store.codes]; codes2[idx] = updated;
      setStore(prev => ({ ...prev, codes: codes2 }));
      return { ok: true, institutionId: c.institutionId };
    },
    submitDeed(payload) {
      const week = startOfWeekISO(new Date());
      const deed = { id: uid("deed"), createdAt: nowMs(), week, status: "approved_demo", ...payload };

      const key = payload.proofMeta ? `${payload.proofMeta.name}__${payload.proofMeta.size}` : null;
      const dup = key ? store.deeds.find(d => d.proofMeta && `${d.proofMeta.name}__${d.proofMeta.size}` === key) : null;

      const flags = [...store.flags];
      if (dup) {
        flags.unshift({ id: uid("flag"), createdAt: nowMs(), type: "duplicate_proof_demo", detail: `Aynı kanıt tekrar denendi: ${payload.proofMeta.name}`, relatedDeedId: deed.id });
      }

      setStore(prev => ({ ...prev, deeds: [deed, ...prev.deeds].slice(0, 200), flags: flags.slice(0, 50) }));
      return deed;
    },
  }), [store]);

  return api;
}

function Shell({ title, subtitle, right, children }) {
  return (
    <div className="page">
      <div className="header">
        <div>
          <div className="hTitle">{title}</div>
          {subtitle ? <div className="hSub">{subtitle}</div> : null}
        </div>
        <div className="headerRight">{right}</div>
      </div>
      <div className="container">{children}</div>
    </div>
  );
}

function Pill({ text }) { return <span className="pill">{text}</span>; }

function Button({ children, onClick, variant = "primary", disabled }) {
  const cls = variant === "primary" ? "btn btnPrimary" : variant === "danger" ? "btn btnDanger" : "btn btnGhost";
  return <button className={cls} onClick={onClick} disabled={disabled}>{children}</button>;
}

function Card({ title, subtitle, children }) {
  return (
    <div className="card">
      <div>
        <div className="cardTitle">{title}</div>
        {subtitle ? <div className="cardSub">{subtitle}</div> : null}
      </div>
      <div style={{ marginTop: 12 }}>{children}</div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="stat">
      <div className="statLabel">{label}</div>
      <div className="statValue">{value}</div>
    </div>
  );
}

function Tabs({ value, onChange, items }) {
  return (
    <div className="tabs">
      {items.map(it => (
        <button key={it.value} className={value === it.value ? "tab tabActive" : "tab"} onClick={() => onChange(it.value)}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

function calcWeeklyPoints(store, userId, weekISO) {
  const byWeek = store.deeds.filter(d => d.userId === userId && d.week === weekISO);
  const perCat = {};
  let total = 0;

  for (const d of byWeek) {
    const cat = CATEGORIES.find(c => c.id === d.categoryId);
    if (!cat) continue;
    const bracket = confToBracket(d.confidence);
    const points = Math.round(cat.basePoints * bracket.multiplier);
    perCat[d.categoryId] = (perCat[d.categoryId] || 0) + points;
    total += points;
  }
  return { total, perCat, count: byWeek.length };
}

function cappedAward(cat, currentCatPoints, attemptedPoints) {
  const capRemaining = Math.max(0, cat.weeklyCap - currentCatPoints);
  return Math.max(0, Math.min(attemptedPoints, capRemaining));
}

/* ---------- Screens ---------- */

function LoginScreen({ api }) {
  return (
    <Shell title="İyilik Pasaportu — Demo" subtitle="Backend yok: mock + localStorage. Sunum için ürün hissi verir.">
      <div className="grid2">
        <Card title="Vatandaş" subtitle="İyilik kaydı, foto kanıt, güvene göre puan">
          <Button onClick={() => api.login("citizen")}>Demo Giriş</Button>
        </Card>
        <Card title="Kurum Portalı" subtitle="Tek kullanımlık kod üret, ziyaret doğrula (demo)">
          <Button onClick={() => api.login("institution")}>Kurum Girişi</Button>
        </Card>
        <Card title="Yönetici" subtitle="Raporlama, suistimal sinyalleri (demo)">
          <Button onClick={() => api.login("admin")}>Yönetici Girişi</Button>
        </Card>
        <Card title="Sıfırla" subtitle="LocalStorage demo verilerini temizler">
          <Button variant="danger" onClick={() => api.reset()}>Demo Verilerini Sıfırla</Button>
        </Card>
      </div>
    </Shell>
  );
}

function CitizenDashboard({ api }) {
  const { store } = api;
  const userId = store.auth.userId;

  const [tab, setTab] = useState("submit");
  const weekISO = startOfWeekISO(new Date());
  const weekly = calcWeeklyPoints(store, userId, weekISO);
  const deeds = store.deeds.filter(d => d.userId === userId).slice(0, 20);

  return (
    <Shell
      title="Vatandaş Paneli"
      subtitle={`Hafta başlangıcı: ${weekISO}`}
      right={<>
        <Pill text={store.auth.displayName} />
        <Button variant="ghost" onClick={() => api.logout()}>Çıkış</Button>
      </>}
    >
      <div className="row4">
        <Stat label="Bu hafta toplam puan (demo)" value={weekly.total} />
        <Stat label="Kayıt sayısı" value={weekly.count} />
        <Stat label="Model" value="Güvene göre puan" />
        <Stat label="Durum" value="Pilot Demo" />
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: "submit", label: "İyilik Kaydı" },
          { value: "history", label: "Geçmiş" },
          { value: "rules", label: "Kurallar" },
        ]}
      />

      {tab === "submit" ? <CitizenSubmit api={api} weekly={weekly} /> : null}

      {tab === "history" ? (
        <Card title="Son Kayıtlar" subtitle="Demo: kayıtlar localStorage içinde">
          {deeds.length === 0 ? <div className="muted">Henüz kayıt yok.</div> : null}
          <div style={{ display: "grid", gap: 10 }}>
            {deeds.map(d => {
              const cat = CATEGORIES.find(c => c.id === d.categoryId);
              const bracket = confToBracket(d.confidence);
              const base = cat ? cat.basePoints : 0;
              const raw = Math.round(base * bracket.multiplier);
              return (
                <div key={d.id} className="item">
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 800 }}>{cat?.title || d.categoryId}</div>
                      <div className="muted">
                        Güven: {(d.confidence * 100).toFixed(0)}% • {bracket.label} • Ham puan: {raw}
                        {d.institutionId ? ` • Kurum: ${d.institutionId}` : ""}
                      </div>
                    </div>
                    <Pill text={new Date(d.createdAt).toLocaleString()} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}

      {tab === "rules" ? (
        <Card title="Demo Kuralları" subtitle="Sunumda güven/suistimal mantığını net anlatmak için">
          <ul className="ul">
            <li>Foto kanıt → AI güven skoru (demo: slider ile simüle).</li>
            <li>Puan binary değil: güven arttıkça puan artar; sınırda olan düşük puan alır.</li>
            <li>Kategori bazlı haftalık tavan vardır; tavan dolarsa puan 0 olur.</li>
            <li>Tekrar kanıt denemeleri demo olarak “şüpheli” işaretlenir.</li>
            <li>Kurum ziyareti için tek kullanımlık kod gerekir.</li>
          </ul>
        </Card>
      ) : null}
    </Shell>
  );
}

function CitizenSubmit({ api, weekly }) {
  const { store } = api;
  const userId = store.auth.userId;

  const [categoryId, setCategoryId] = useState(CATEGORIES[0].id);
  const [confidence, setConfidence] = useState(0.9);
  const [file, setFile] = useState(null);
  const [instCode, setInstCode] = useState("");
  const [msg, setMsg] = useState(null);

  const cat = CATEGORIES.find(c => c.id === categoryId);
  const bracket = confToBracket(confidence);
  const rawPoints = Math.round((cat?.basePoints || 0) * bracket.multiplier);

  const currentCatPoints = weekly.perCat[categoryId] || 0;
  const awarded = cat ? cappedAward(cat, currentCatPoints, rawPoints) : 0;
  const capRemaining = cat ? Math.max(0, cat.weeklyCap - currentCatPoints) : 0;

  function onSubmit() {
    setMsg(null);
    if (!file) {
      setMsg({ type: "err", text: "Foto yükleyin (demo)." });
      return;
    }

    let institutionId = null;
    if (cat?.requiresInstitutionCode) {
      const v = api.verifyAndConsumeCode({ code: instCode.trim(), userId });
      if (!v.ok) {
        setMsg({ type: "err", text: `Kurum kodu geçersiz: ${v.reason}` });
        return;
      }
      institutionId = v.institutionId;
    }

    api.submitDeed({
      userId,
      categoryId,
      confidence,
      institutionId,
      proofMeta: file ? { name: file.name, size: file.size, type: file.type } : null,
      awardedPointsDemo: awarded,
    });

    setMsg({
      type: "ok",
      text: awarded > 0
        ? `Kayıt alındı. Ham: ${rawPoints} • Tavan sonrası: ${awarded} puan.`
        : `Kayıt alındı ama bu kategori haftalık tavanı dolu. Puan: 0.`,
    });

    setFile(null);
    setInstCode("");
  }

  return (
    <div className="grid2">
      <Card title="Yeni İyilik Kaydı" subtitle="Foto + güven skoru → puan (demo)">
        <div className="field">
          <label className="label">Kategori</label>
          <select className="select" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
            {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
          <div className="help">{cat?.desc}</div>
        </div>

        {cat?.requiresInstitutionCode ? (
          <div className="field">
            <label className="label">Kurum Tek Kullanımlık Kodu</label>
            <input className="input" value={instCode} onChange={e => setInstCode(e.target.value)} placeholder="Örn: 6 haneli kod" />
            <div className="help">Demo: kodu Kurum Portalı’ndan üretip burada kullan.</div>
          </div>
        ) : null}

        <div className="field">
          <label className="label">Foto Kanıt</label>
          <input className="input" type="file" accept="image/*" onChange={e => setFile(e.target.files?.[0] || null)} />
          <div className="help">Backend yok: içerik analizini demo güven skoru ile simüle ediyoruz.</div>
        </div>

        <div className="field">
          <label className="label">AI Güven Skoru (Demo)</label>
          <input style={{ width: "100%" }} type="range" min="0" max="1" step="0.01" value={confidence} onChange={e => setConfidence(parseFloat(e.target.value))} />
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 6 }}>
            <Pill text={`Güven: ${(confidence * 100).toFixed(0)}%`} />
            <Pill text={bracket.label} />
          </div>
        </div>

        <div className="hr" />

        <div className="row4" style={{ marginBottom: 0 }}>
          <Stat label="Ham puan" value={rawPoints} />
          <Stat label="Kategori tavanı" value={cat?.weeklyCap ?? "-"} />
          <Stat label="Kalan tavan" value={capRemaining} />
          <Stat label="Verilecek puan" value={awarded} />
        </div>

        <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
          <div className="muted">Tavan sonrası verilen puan: <b>{awarded}</b></div>
          <Button onClick={onSubmit}>Kaydet</Button>
        </div>

        {msg ? (
          <div className={`notice ${msg.type === "ok" ? "noticeOk" : "noticeErr"}`} style={{ marginTop: 10 }}>
            {msg.text}
          </div>
        ) : null}
      </Card>

      <Card title="Bu Haftaki Tavanlar" subtitle="Kategori bazlı sınırlarla puan farming’i kırarsın">
        <div style={{ display: "grid", gap: 10 }}>
          {CATEGORIES.map(c => {
            const used = weekly.perCat[c.id] || 0;
            const remain = Math.max(0, c.weeklyCap - used);
            return (
              <div key={c.id} className="item">
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 900 }}>{c.title}</div>
                    <div className="muted">Haftalık tavan: {c.weeklyCap} • Kullanılan: {used} • Kalan: {remain}</div>
                  </div>
                  <Pill text={remain === 0 ? "Tavan dolu" : "Aktif"} />
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function InstitutionPortal({ api }) {
  const { store } = api;
  const userId = store.auth.userId;
  const user = store.users[userId];
  const institutionId = user.institutionId;

  const inst = store.institutions.find(i => i.id === institutionId);

  const [ttl, setTtl] = useState(90);
  const [last, setLast] = useState(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 250);
    return () => clearInterval(t);
  }, []);

  const activeCodes = store.codes.filter(c => c.institutionId === institutionId).slice(0, 10);

  return (
    <Shell
      title="Kurum Portalı"
      subtitle={`${inst?.name || institutionId} • Demo`}
      right={<>
        <Pill text={store.auth.displayName} />
        <Button variant="ghost" onClick={() => api.logout()}>Çıkış</Button>
      </>}
    >
      <div className="grid2">
        <Card title="Tek Kullanımlık Kod Üret" subtitle="Ziyaret anında üretim (asılı QR yok)">
          <div className="field">
            <label className="label">Kod süresi (saniye)</label>
            <input className="input" type="number" min={30} max={300} value={ttl} onChange={e => setTtl(parseInt(e.target.value || "90", 10))} />
          </div>
          <Button onClick={() => setLast(api.generateCode({ institutionId, ttlSeconds: ttl }))}>Kod Üret</Button>

          {last ? (
            <div className="notice" style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 900, fontSize: 22, letterSpacing: 2 }}>{last.code}</div>
              <div className="muted">Kalan: {fmtTime(last.expiresAt - nowMs())} • Tek kullanımlık</div>
            </div>
          ) : <div className="muted">Henüz kod üretilmedi.</div>}
        </Card>

        <Card title="Son Kodlar" subtitle="Demo listesi">
          {activeCodes.length === 0 ? <div className="muted">Kod yok.</div> : null}
          <div style={{ display: "grid", gap: 10 }}>
            {activeCodes.map(c => {
              const expired = nowMs() > c.expiresAt;
              return (
                <div key={c.id} className="item">
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 900, letterSpacing: 1 }}>{c.code}</div>
                      <div className="muted">
                        {c.usedAt ? `Kullanıldı • ${new Date(c.usedAt).toLocaleString()}` : expired ? "Süresi doldu" : `Kalan: ${fmtTime(c.expiresAt - nowMs())}`}
                      </div>
                    </div>
                    <Pill text={c.usedAt ? "Kullanıldı" : expired ? "Bitti" : "Aktif"} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </Shell>
  );
}

function AdminPanel({ api }) {
  const { store } = api;
  const weekISO = startOfWeekISO(new Date());
  const deedsThisWeek = store.deeds.filter(d => d.week === weekISO);

  const byInst = {};
  for (const d of deedsThisWeek) {
    if (!d.institutionId) continue;
    byInst[d.institutionId] = (byInst[d.institutionId] || 0) + 1;
  }
  const instRows = Object.entries(byInst)
    .map(([id, n]) => ({ id, n, name: store.institutions.find(i => i.id === id)?.name || id }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 10);

  const totalFlags = store.flags.length;
  const dupFlags = store.flags.filter(f => f.type.includes("duplicate")).length;

  return (
    <Shell
      title="Yönetici Paneli"
      subtitle={`Pilot görünümü • Hafta: ${weekISO}`}
      right={<>
        <Pill text={store.auth.displayName} />
        <Button variant="ghost" onClick={() => api.logout()}>Çıkış</Button>
      </>}
    >
      <div className="row4">
        <Stat label="Bu hafta kayıt" value={deedsThisWeek.length} />
        <Stat label="Toplam kayıt" value={store.deeds.length} />
        <Stat label="Şüpheli olay" value={totalFlags} />
        <Stat label="Tekrar denemesi" value={dupFlags} />
      </div>

      <div className="grid2">
        <Card title="Kurum Bazlı Yoğunluk" subtitle="Pilot metrik">
          {instRows.length === 0 ? <div className="muted">Bu hafta kurum doğrulamalı kayıt yok.</div> : null}
          <div style={{ display: "grid", gap: 10 }}>
            {instRows.map(r => (
              <div key={r.id} className="item">
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 900 }}>{r.name}</div>
                    <div className="muted">Kayıt: {r.n}</div>
                  </div>
                  <Pill text="Pilot" />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Şüpheli Olaylar" subtitle="Demo: tekrar kanıt denemeleri">
          {store.flags.length === 0 ? <div className="muted">Şüpheli olay yok.</div> : null}
          <div style={{ display: "grid", gap: 10 }}>
            {store.flags.slice(0, 12).map(f => (
              <div key={f.id} className="item">
                <div style={{ fontWeight: 900 }}>{f.type}</div>
                <div className="muted">{f.detail}</div>
                <div className="muted">{new Date(f.createdAt).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card title="Sunum Notu" subtitle="Bu ekran ‘devlete satılabilirlik’ kısmı">
        <ul className="ul">
          <li>Kurum doğrulaması ayrı raporlanır.</li>
          <li>AI karar vermiyor: güvene göre puan ağırlığı veriyor.</li>
          <li>Haftalık tavanlar puan farming’i kırıyor.</li>
          <li>Tekrar denemeleri otomatik flag’lenip cezaya konu edilebilir.</li>
        </ul>
      </Card>
    </Shell>
  );
}

export default function App() {
  const api = usePersistentStore();
  const role = api.store.auth.role;

  if (!role) return <LoginScreen api={api} />;
  if (role === "citizen") return <CitizenDashboard api={api} />;
  if (role === "institution") return <InstitutionPortal api={api} />;
  if (role === "admin") return <AdminPanel api={api} />;

  return <LoginScreen api={api} />;
}