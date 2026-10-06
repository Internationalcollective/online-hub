(function(){
"use strict";
const CFG = window.HUB_CONFIG || {};
const S = { sheets:new Map(), confirms:new Map(), sel:null, editing:null, q:"", admin:false, email:"", codes:[], brands:[], brandOf:new Map(), ready:false, delAsk:false, err:"" };
const $ = id => document.getElementById(id);
const store = { get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }, set(k,v){ try{ v==null?localStorage.removeItem(k):localStorage.setItem(k,v); }catch(e){} } };

function h(tag, attrs, ...kids){
  const el = document.createElement(tag);
  if (attrs) for (const [k,v] of Object.entries(attrs)){
    if (v==null || v===false) continue;
    if (k==="class") el.className=v; else if (k.startsWith("on")) el.addEventListener(k.slice(2),v);
    else if (k==="text") el.textContent=v; else el.setAttribute(k, v===true?"":v);
  }
  for (const c of kids.flat()){ if (c==null||c===false) continue; el.append(c.nodeType?c:document.createTextNode(String(c))); }
  return el;
}
const todayISO = () => { const d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
const dObj = iso => new Date((iso||"1970-01-01")+"T12:00:00");
const fmtLong = iso => iso ? dObj(iso).toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"}) : "Date TBC";
const fmtStamp = s => { try{ const d=new Date(s); return d.toLocaleDateString("en-GB",{day:"numeric",month:"short"})+" "+d.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}); }catch(e){ return ""; } };
function rel(iso){
  if(!iso) return "";
  const n = Math.round((dObj(iso)-dObj(todayISO()))/864e5);
  if(n===0) return "Today"; if(n===1) return "Tomorrow"; if(n>1) return "In "+n+" days";
  if(n===-1) return "Yesterday"; return Math.abs(n)+" days ago";
}
const mapsUrl = loc => { const q=[loc&&loc.name, loc&&loc.address].filter(Boolean).join(", "); return q ? "https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(q) : ""; };
// Descriptions: bullets only when the text is a list (one item per line).
function descNode(text, cls){
  const items=String(text).split(/\n+/).map(x=>x.trim()).filter(Boolean);
  return items.length>1 ? h("ul",{class:"list desc-list "+cls}, ...items.map(x=>h("li",null,x))) : h("span",{class:cls}, items[0]||"");
}
function factNode(k, v, loc){
  const url = loc && loc!=="list" ? mapsUrl(loc) : "";
  if(loc==="list" && !isTBC(v)){ const items=String(v).split(/\n+/).map(x=>x.trim()).filter(Boolean);
    if(items.length<2) return h("div",{class:"fact"}, h("span",{class:"k"},k), h("span",{class:"v"}, items[0]||""));
    return h("div",{class:"fact"}, h("span",{class:"k"},k), h("ul",{class:"list fact-list"}, ...items.map(x=>h("li",null,x)))); }
  if(!url) return h("div",{class:"fact"}, h("span",{class:"k"},k), h("span",{class:"v"}, isTBC(v)? tbcNode(v) : v));
  return h("a",{class:"fact fact-link",href:url,target:"_blank",rel:"noopener","aria-label":"Open "+(loc.name||"the location")+" in maps"},
    h("span",{class:"k"},k), h("span",{class:"v"}, v), h("span",{class:"maplink"},"open in maps ↗"));
}
// Countdown to the shoot (crew call on the shoot date) as a simple flip clock: days : hours : minutes : seconds.
function callTarget(date, time){
  if(!date) return null;
  const m = /^\s*(\d{1,2})[:.](\d{2})/.exec(time||"");
  const d = new Date(date+"T"+(m ? m[1].padStart(2,"0")+":"+m[2] : "00:00")+":00");
  return isNaN(d) ? null : d;
}
function countdownParts(target){
  let ms = target - Date.now();
  if(ms <= 0) return null;
  const secs = Math.floor(ms/1000), d = Math.floor(secs/86400), hh = Math.floor((secs%86400)/3600), mm = Math.floor((secs%3600)/60), ss = secs%60;
  return [[String(d).padStart(2,"0"),"days"],[String(hh).padStart(2,"0"),"hrs"],[String(mm).padStart(2,"0"),"mins"],[String(ss).padStart(2,"0"),"secs"]];
}
function countdownClock(date, time){
  const target = callTarget(date, time);
  const box = h("div",{class:"countdown","data-target": target ? target.toISOString() : ""});
  paintCountdown(box, true);
  return box;
}
// One split-flap tile: static top/bottom halves plus two flaps that fold over when the digit changes.
function flipTile(ch, i){
  const half = (cls, v) => h("span",{class:cls}, h("span",{class:"f-in"}, v));
  const tile = h("span",{class:"flip",style:"--i:"+i},
    half("f-top", ch), half("f-bot", ch), half("f-flap-top", ch), half("f-flap-bot", ch));
  tile.dataset.v = ch;
  return tile;
}
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
function setTile(tile, next, delay){
  const prev = tile.dataset.v;
  if(prev === next) return;
  tile.dataset.v = next;
  const q = sel => tile.querySelector(sel+" .f-in");
  if(reduceMotion()){ ["f-top","f-bot","f-flap-top","f-flap-bot"].forEach(c=>q("."+c).textContent=next); return; }
  q(".f-top").textContent = next;        // revealed behind the falling top flap
  q(".f-flap-top").textContent = prev;   // old top half folds down
  q(".f-flap-bot").textContent = next;   // new bottom half folds into place
  q(".f-bot").textContent = prev;        // old bottom half stays until the flap covers it
  tile.style.setProperty("--d", (delay||0)+"ms");
  tile.classList.remove("flipping"); void tile.offsetWidth; tile.classList.add("flipping");
  clearTimeout(tile._t);
  tile._t = setTimeout(()=>{ q(".f-bot").textContent = next; tile.classList.remove("flipping"); }, 640 + (delay||0));
}
function paintCountdown(box, first){
  const t = box.dataset.target ? new Date(box.dataset.target) : null;
  const parts = t ? countdownParts(t) : null;
  if(!parts){ box.replaceChildren(h("span",{class:"k"}, t ? "shoot day" : "date tbc")); box.setAttribute("aria-label", t ? "the shoot has started" : "date to be confirmed"); return; }
  box.setAttribute("role","timer");
  box.setAttribute("aria-label", parts.map(([v,l])=>Number(v)+" "+l).join(", ")+" until the shoot");
  const flat = parts.map(p=>p[0]).join("");
  let tiles = box.querySelectorAll(".flip");
  if(first || tiles.length !== flat.length){
    const clock = h("div",{class:"flipclock","aria-hidden":"true"});
    let i=0;
    parts.forEach(([v,l],g)=>{
      if(g) clock.append(h("span",{class:"flip-colon"},":"));
      const digits = h("span",{class:"flip-digits"});
      [...v].forEach(()=>digits.append(flipTile("0", i++)));
      clock.append(h("span",{class:"flip-group"}, digits, h("span",{class:"flip-label"},l)));
    });
    box.replaceChildren(h("span",{class:"k"},"countdown to shoot"), clock);
    tiles = box.querySelectorAll(".flip");
    // Opening flourish: every tile flips from 0 to its value, one after another.
    tiles.forEach((el,k)=> flat[k]==="0" ? null : setTile(el, flat[k], 120 + k*70));
    return;
  }
  tiles.forEach((el,k)=> setTile(el, flat[k], 0));
}
setInterval(()=>document.querySelectorAll(".countdown").forEach(b=>paintCountdown(b,false)), 1000);
const isDuration = s => !!s && /^\s*(≈\s*)?\d+(\s*[–-]\s*\d+)?\s*(min|mins|hr|hrs|hour|hours)\b[\s\d]*(min|mins)?\s*$/i.test(s);
const isTBC = s => !s || /\bTBC\b/i.test(s);
const val = (s, fb="TBC") => (s && String(s).trim()) ? s : fb;
const tbcNode = s => isTBC(s) ? h("span",{class:"chip tbc"}, s ? s : "TBC") : document.createTextNode(s);
const statusChip = st => h("span",{class:"chip "+(st||"draft")}, st||"draft");
const slug = s => String(s||"sheet").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,40) || "sheet";
const rid = () => Math.random().toString(36).slice(2,8);
const mobile = () => matchMedia("(max-width:900px)").matches;

/* ---------- Supabase ---------- */
const configured = CFG.supabaseUrl && !/YOUR-PROJECT/.test(CFG.supabaseUrl) && CFG.supabaseAnonKey && !/YOUR-ANON/.test(CFG.supabaseAnonKey);
const sb = configured && window.supabase ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey) : null;

async function loadAll(){
  const { data, error } = await sb.rpc("hub_read", { p_codes: S.codes });
  if (error) throw error;
  const per = data.codes || [];
  if (per.some(Boolean)) { S.codes = S.codes.filter((c,i)=>per[i]); saveCodes(); }
  S.brands = data.brands || [];
  S.brandOf = new Map((data.callsheets||[]).map(r=>[r.id, r.brand||""]));
  S.sheets = new Map((data.callsheets||[]).map(r=>[r.id, r.data]));
  const m = new Map();
  for (const c of (data.confirms||[])){ if(!m.has(c.sheet)) m.set(c.sheet,new Map()); m.get(c.sheet).set(c.person,c); }
  S.confirms = m; S.ready = true;
}
async function refresh(){
  try{ await loadAll(); S.err=""; }
  catch(e){
    if (isBadCode(e)){ S.codes=[]; saveCodes(); showGate("That passcode no longer works. Ask production for the current one."); return; }
    S.err = "Couldn't reach the call sheets. Check your connection and reload.";
  }
  if(!S.sel){
    const h0 = location.hash.slice(1);
    if(h0 && !h0.includes("=") && S.sheets.has(h0)) S.sel = h0;
    else if(!mobile()){
      const t=todayISO(); const up=[...S.sheets.entries()].filter(([,v])=>(v.date||"")>=t).sort((a,b)=>(a[1].date||"").localeCompare(b[1].date||""));
      S.sel = up.length ? up[0][0] : ([...S.sheets.keys()][0]||null);
    }
  }
  if(!S.editing) render(); else renderList();
}
function saveCodes(){ store.set("hub-codes", S.codes.length ? JSON.stringify(S.codes) : null); }
function loadCodes(){
  let c=[]; try{ c = JSON.parse(store.get("hub-codes")||"[]"); }catch(e){}
  const old = store.get("hub-code"); if(old){ c.push(old); store.set("hub-code",null); }
  return [...new Set(c.filter(Boolean))];
}
const brandName = id => (S.brands.find(b=>b.id===id)||{}).name || (id ? id : "No brand");
const isBadCode = e => e && (e.code==="28P01" || /bad_passcode/.test(e.message||""));

/* ---------- gate ---------- */
function showGate(msg, adding){
  $("app").hidden = true; $("gate").hidden = false;
  $("gateIntro").textContent = adding ? "Enter the passcode for another shoot. You'll keep access to the ones you already have." : "Call sheets for every shoot day. Enter the passcode production sent you with the link.";
  $("gateBack").hidden = !(adding && (S.codes.length || S.admin));
  $("codeMsg").textContent = msg || ""; $("codeMsg").className = "msg" + (msg ? " err" : "");
  if(!configured){ $("codeMsg").textContent = "This hub isn't connected to its database yet. Fill in config.js."; $("codeMsg").className="msg err"; }
}
function showApp(){ $("gate").hidden = true; $("app").hidden = false; }
$("codeForm").addEventListener("submit", async e=>{
  e.preventDefault(); if(!sb) return;
  const code = $("code").value.trim(); if(!code) return;
  $("codeMsg").textContent = "Checking…"; $("codeMsg").className="msg";
  const before = S.codes.slice();
  S.codes = [...new Set([...S.codes, code])];
  try{
    const { data, error } = await sb.rpc("hub_read", { p_codes: [code] });
    if (error) throw error;
    saveCodes(); $("code").value=""; showApp(); S.sel=null; await refresh();
  } catch(err){
    S.codes = before;
    $("codeMsg").textContent = isBadCode(err) ? "That passcode didn't work. Check it and try again." : "Couldn't reach the call sheets. Try again."; $("codeMsg").className="msg err";
  }
});
$("gateBack").addEventListener("click", ()=>{ showApp(); render(); });
$("showSignin").addEventListener("click", ()=>{ $("signinForm").hidden = !$("signinForm").hidden; if(!$("signinForm").hidden) $("email").focus(); });
$("signinForm").addEventListener("submit", async e=>{
  e.preventDefault(); if(!sb) return;
  const email = $("email").value.trim();
  const { error } = await sb.auth.signInWithOtp({ email, options:{ emailRedirectTo: location.origin + location.pathname, shouldCreateUser:true } });
  $("signinMsg").textContent = error ? "Couldn't send the link: " + error.message : "Check your inbox for a sign-in link from Supabase.";
  $("signinMsg").className = "msg" + (error ? " err" : "");
});

/* ---------- list ---------- */
function filtered(){
  const q = S.q.trim().toLowerCase();
  const all = [...S.sheets.entries()].map(([id,d])=>({id,...d}));
  if(!q) return all;
  return all.filter(s => JSON.stringify([s.project,s.client,s.title,s.location,s.crew,s.cast,s.date]).toLowerCase().includes(q));
}
function renderList(){
  const box = $("list"); box.replaceChildren();
  if(!S.ready){ box.append(h("div",{class:"empty"}, S.err || "Loading callsheets…")); return; }
  const t = todayISO(), all = filtered();
  if(!all.length){ box.append(h("div",{class:"empty"}, S.q ? "No callsheets match that search." : (S.admin ? "No callsheets yet. Press New to make the first one." : "No callsheets have been issued yet."))); return; }
  const grp = (label, arr, sub, bid) => {
    if(!arr.length) return;
    const g = h("div",{class:"grp"}, h("h2",null,label, sub ? h("span",{class:"grp-sub"}," · "+sub) : null));
    for(const s of arr){
      const d = dObj(s.date), people=[...(s.crew||[]),...(s.cast||[])], cm=S.confirms.get(s.id)||new Map();
      const n = people.filter(p=>cm.has(p.id)).length;
      g.append(h("button",{class:"item","aria-current":String(S.sel===s.id),onclick:()=>select(s.id)},
        h("div",{class:"d"}, h("b",null, s.date? d.getDate():"–"), h("span",null, s.date? d.toLocaleDateString("en-GB",{month:"short"}):"TBC")),
        h("div",{class:"t"},
          h("strong",null, (s.project||"Untitled")+(s.title?" · "+s.title:"")),
          h("small",null, [s.dayOf, s.location&&s.location.name].filter(Boolean).join(" · ") || "Location TBC"),
          h("div",{class:"meta"}, statusChip(s.status), people.length ? h("span",{class:"chip"}, n+"/"+people.length+" confirmed") : null, h("span",{class:"chip"}, rel(s.date))))));
    }
    box.append(g);
  };
  const ids = [...new Set([...S.brands.map(b=>b.id), ...all.map(s=>S.brandOf.get(s.id)||"")])];
  for(const b of ids){
    const mine = all.filter(s=>(S.brandOf.get(s.id)||"")===b);
    const up = mine.filter(s=>(s.date||"9999")>=t).sort((a,c)=>(a.date||"").localeCompare(c.date||""));
    const past = mine.filter(s=>(s.date||"9999")<t).sort((a,c)=>(c.date||"").localeCompare(a.date||""));
    const name = brandName(b);
    grp(name, up, "Upcoming", b); grp(name, past, "Past", b);
  }
  const who = $("who"); who.replaceChildren();
  if(S.admin) who.append(h("span",null,"Signed in as "+S.email), h("button",{class:"linkbtn",onclick:signOut},"Sign out"));
  who.append(h("button",{class:"linkbtn",onclick:()=>showGate("", true)},"Add another shoot's passcode"));
  if(!S.admin) who.append(h("button",{class:"linkbtn",onclick:()=>{ S.codes=[]; saveCodes(); showGate(); }},"Lock this device"));
}
async function signOut(){ await sb.auth.signOut(); S.admin=false; S.email=""; S.sel=null; if(S.codes.length) refresh(); else showGate(); }

/* ---------- sheet view ---------- */
function select(id){ S.sel=id; S.editing=null; S.delAsk=false; S.inline=false; try{ history.replaceState(null,"","#"+id); }catch(e){} render(); window.scrollTo({top:0}); }
let flashMsg="";
function flash(m){ flashMsg=m; render(); setTimeout(()=>{flashMsg=""; render();},4000); }

function confirmCell(sheet, p){
  const c = (S.confirms.get(sheet.id)||new Map()).get(p.id);
  const wrap = h("div",{class:"cf"});
  if(c){
    const stale = (c.version||1) < (sheet.version||1);
    wrap.append(h("div",null, h("span",{class:"ok"},"Confirmed"), h("small",null, stale ? h("span",{class:"old"},"on v"+(c.version||1)+" · ") : null, fmtStamp(c.at))));
    if(stale) wrap.append(h("button",{class:"btn sm",onclick:()=>doConfirm(sheet,p)},"Reconfirm"));
    const key = sheet.id+"|"+p.id;
    if(S.undoAsk===key) wrap.append(h("span",{class:"undo-ask"}, "Undo "+(firstName(p.name))+"'s confirmation?",
      h("button",{class:"btn sm",onclick:()=>{S.undoAsk=null; undoConfirm(sheet,p);}},"Undo"),
      h("button",{class:"btn sm ghost",onclick:()=>{S.undoAsk=null; render();}},"Keep")));
    else wrap.append(h("button",{class:"undo-link",title:"Undo confirmation","aria-label":"Undo confirmation for "+(p.name||"this person"),onclick:()=>{S.undoAsk=key; render();}},"undo"));
  } else wrap.append(h("button",{class:"btn sm",onclick:()=>doConfirm(sheet,p)},"Confirm"));
  return wrap;
}
async function doConfirm(sheet,p){
  const { error } = await sb.rpc("hub_confirm", { p_codes:S.codes, p_sheet:sheet.id, p_person:p.id });
  if(error){ flash(/no_person|no_sheet/.test(error.message||"") ? "This call sheet changed. Reload and try again." : "Couldn't save the confirmation. Try again."); return; }
  await refresh();
}
const firstName = n => (String(n||"").trim().split(/\s+/)[0]) || "this";
async function undoConfirm(sheet,p){
  const { error } = await sb.rpc("hub_unconfirm", { p_codes:S.codes, p_sheet:sheet.id, p_person:p.id });
  if(error) flash("Couldn't undo that confirmation."); else refresh();
}

function peopleTable(sheet, rows, key, cols, label){
  const cm = S.confirms.get(sheet.id) || new Map();
  const n = rows.filter(p=>cm.has(p.id)).length, pct = rows.length ? Math.round(n/rows.length*100) : 0;
  const sec = h("section",{class:"sec"}, h("div",{class:"sec-h"}, h("h3",null,label), rows.length ? h("span",{class:"count"}, n+" of "+rows.length+" confirmed", h("span",{class:"bar"}, h("i",{style:"width:"+pct+"%"}))) : null));
  if(!rows.length){ sec.append(h("div",{class:"empty"},"No names added yet.")); return sec; }
  const tb = h("tbody");
  rows.forEach((p,i)=> tb.append(h("tr",null,
    E("td",null,`${key}.${i}.name`, tbcNode(p.name),{ph:"name"}),
    ...cols.map(c=> c.k==="call" ? E("td",{class:"time"},`${key}.${i}.call`, val(p.call,"—"),{ph:"call"}) : E("td",null,`${key}.${i}.${c.k}`, p[c.k]||"",{ph:c.l.toLowerCase()})),
    h("td",{class:"cfc"}, confirmCell(sheet,p)))));
  sec.append(h("div",{class:"tbl"}, h("table",{class:"people"},
    h("thead",null,h("tr",null,h("th",null,"Name"),...cols.map(c=>h("th",null,c.l)),h("th",{style:"text-align:right"},"Read & confirmed"))), tb)));
  return sec;
}

/* ---------- edit on page (production only) ---------- */
const getPath = (o,p) => p.split(".").reduce((a,k)=>a==null?a:a[k], o);
function setPath(o,p,v){ const ks=p.split("."); let x=o; for(let i=0;i<ks.length-1;i++){ if(x[ks[i]]==null) x[ks[i]] = /^\d+$/.test(ks[i+1]) ? [] : {}; x=x[ks[i]]; } x[ks[ks.length-1]]=v; }
// E(): normal display, or, while editing on the page, the raw value as a typeable field tied to its place in the data.
function E(tag, attrs, path, display, opts={}){
  if(!S.inline) return h(tag, attrs, display);
  const raw = getPath(S.sheets.get(S.sel)||{}, path);
  const a = {...(attrs||{})}; a.class = ((a.class||"")+" ie").trim();
  a["data-path"]=path; a["data-ph"]=opts.ph||"add…"; if(opts.multi) a["data-multi"]="1";
  return h(tag, a, raw==null ? "" : String(raw));
}
function ieState(t, cls){ const el=$("ieState"); if(el){ el.textContent=t; el.className="ie-state "+(cls||""); } }
async function inlineSave(fn){
  const id=S.sel, cur=S.sheets.get(id); if(!cur) return false;
  const d=JSON.parse(JSON.stringify(cur)); fn(d); d.updated=new Date().toISOString();
  S.sheets.set(id,d); ieState("saving…");
  const { error } = await sb.from("callsheets").update({ data:d, updated_at:d.updated }).eq("id",id);
  if(error){ S.sheets.set(id,cur); ieState("couldn't save, try again","err"); return false; }
  ieState("saved","ok"); return true;
}
function enableInline(root){
  root.querySelectorAll("[data-path]").forEach(el=>{
    el.contentEditable="plaintext-only"; if(el.contentEditable!=="plaintext-only") el.contentEditable="true";
    el.spellcheck=true;
    el.addEventListener("click", e=>{ e.preventDefault(); e.stopPropagation(); });
    el.addEventListener("keydown", e=>{
      if(e.key==="Escape"){ el.textContent = String(getPath(S.sheets.get(S.sel)||{}, el.dataset.path) ?? ""); el.blur(); }
      else if(e.key==="Enter" && !el.dataset.multi){ e.preventDefault(); el.blur(); }
    });
    el.addEventListener("blur", ()=>{
      const path=el.dataset.path, old=String(getPath(S.sheets.get(S.sel)||{}, path) ?? "");
      let v=el.innerText.replace(/ /g," ").replace(/\r/g,"");
      v = el.dataset.multi ? v.split("\n").map(x=>x.trimEnd()).join("\n").replace(/^\n+|\n+$/g,"") : v.replace(/\s*\n\s*/g," ").trim();
      if(v===old) return;
      const m=/^notes\.(\d+)$/.exec(path);
      inlineSave(d=>{ if(m && !v){ (d.notes||[]).splice(+m[1],1); } else setPath(d,path,v); }).then(ok=>{ if(m && !v && ok) renderSheet(); });
    });
  });
}
function toggleInline(){ S.inline=!S.inline; S.reissueAsk=false; render(); if(!S.inline) refresh(); }

function renderSheet(){
  const main = $("main"); main.replaceChildren();
  if(S.editing){ main.append(renderEditor()); return; }
  if(!S.ready){ main.append(h("div",{class:"placeholder"}, S.err || "Loading…")); return; }
  const raw = S.sheets.get(S.sel);
  if(!raw){ main.append(h("div",{class:"placeholder"}, S.sheets.size ? "Pick a call sheet from the list." : "No call sheets yet.")); return; }
  const s = {id:S.sel, ...raw}, loc = s.location||{};
  const bid = S.brandOf.get(s.id)||"";
  const ozf = bid==="onezerofive";
  const sheet = h("article",{class:"sheet"+(bid?" b-"+bid:"")+(ozf?" ozf":"")});
  if(ozf){
    sheet.append(h("div",{class:"sheet-top ozf-top"},
      h("div",{class:"ozf-left"},
        h("div",{class:"kicker"}, h("span",{class:"cs"},"onezerofive"), statusChip(s.status)),
        E("h2",null,"title", (s.title||s.project||"call sheet").toLowerCase(),{ph:"title"}),
        h("p",{class:"sub"}, "call sheet"),
        h("div",{class:"crewcall"}, h("span",{class:"k"},"crew call"), E("b",null,"crewCall", val(s.crewCall,"tbc"),{ph:"08:00"}))),
      h("div",{class:"ozf-right"},
        countdownClock(s.date, s.crewCall),
        h("p",{class:"when"}, fmtLong(s.date).toLowerCase()),
        (s.dayOf||S.inline) ? E("p",{class:"dayof"},"dayOf", (s.dayOf||"").toLowerCase(),{ph:"day 1 of 2"}) : null)));
  } else {
    sheet.append(h("div",{class:"sheet-top"},
      h("div",null,
        h("div",{class:"kicker"}, h("span",{class:"cs"}, brandName(bid)), h("span",null,"Call sheet"), s.dayOf? h("span",null,s.dayOf):null, statusChip(s.status), h("span",{class:"chip"},"v"+(s.version||1))),
        E("h2",null,"project", s.project||"Untitled",{ph:"project"}),
        h("p",{class:"sub"}, [s.title, s.client && s.client!==s.project ? "for "+s.client : null].filter(Boolean).join(" · ")),
        h("p",{class:"when"}, fmtLong(s.date)+" · "+rel(s.date))),
      h("div",{class:"callbox"}, h("span",null,"General crew call"), E("b",null,"crewCall", val(s.crewCall,"TBC"),{ph:"08:00"}), h("small",null, s.hours ? "Venue "+s.hours : ""))));
  }
  const act = h("div",{class:"actions"}, h("button",{class:"btn back",onclick:()=>{S.sel=null;render();}},"← All call sheets"), h("span",{class:"sp"}));
  if(S.admin){
    if(S.delAsk) act.append(h("span",{class:"inline-confirm"},"Delete this call sheet and its confirmations?", h("button",{class:"btn sm danger",onclick:()=>delSheet(s.id)},"Delete"), h("button",{class:"btn sm",onclick:()=>{S.delAsk=false;render();}},"Cancel")));
    else if(S.inline){
      act.append(h("button",{class:"btn primary",onclick:toggleInline},"Done"), h("span",{id:"ieState",class:"ie-state"},""));
      if(S.reissueAsk) act.append(h("span",{class:"inline-confirm"},"Ask everyone who confirmed to reconfirm?",
        h("button",{class:"btn sm",onclick:async()=>{ S.reissueAsk=false; if(await inlineSave(d=>{d.version=(d.version||1)+1;})) render(); }},"Re-issue"),
        h("button",{class:"btn sm",onclick:()=>{S.reissueAsk=false;render();}},"Cancel")));
      else act.append(h("button",{class:"btn",onclick:()=>{S.reissueAsk=true;render();}},"Re-issue (v"+((s.version||1)+1)+")"));
    }
    else act.append(h("button",{class:"btn primary",onclick:toggleInline},"Edit on page"), h("button",{class:"btn",onclick:()=>startEdit(s.id,false)},"Full editor"), h("button",{class:"btn",onclick:()=>startEdit(s.id,true)},"Duplicate"), h("button",{class:"btn danger",onclick:()=>{S.delAsk=true;render();}},"Delete"));
  }
  if(S.admin || mobile()) sheet.append(act);
  if(flashMsg) sheet.append(h("div",{class:"banner"},flashMsg));
  if(S.inline) sheet.append(h("div",{class:"banner ie-help"},"Click any text to change it. It saves when you click away (Enter for a new line in lists and notes, Esc to cancel). Crew aren't asked to reconfirm unless you press Re-issue. Add or remove rows, dates and brand in the Full editor."));
  const locFact = [loc.label||"Location",[loc.name,loc.address].filter(Boolean).join("\n"),loc];
  const hospLoc = s.hospital && !isTBC(s.hospital) ? {name: s.hospitalMaps || String(s.hospital).split(/\n| · /)[0]} : null;
  const loc2 = s.location2||{}, has2 = !!(loc2.name||loc2.address);
  const loc2Fact = has2 ? [[loc2.label||"Studio location",[loc2.name,loc2.address].filter(Boolean).join("\n"),loc2]] : [];
  const facts = ozf
    ? [locFact,...loc2Fact,["Nearest underground",s.tube,"list"],["Nearest A&E",s.hospital,hospLoc],["Weather",s.weather,"list"],["Parking & access",s.parking,"list"]]
    : [locFact,...loc2Fact,["Venue hours",s.hours],["Sunset",s.sunset],["Weather",s.weather],["Nearest A&E",s.hospital,hospLoc],["Parking & access",s.parking]];
  const contactsSec = (s.contacts||[]).length ? h("section",{class:"sec"}, h("div",{class:"sec-h"},h("h3",null,"Key contacts")),
    h("div",{class:"contacts"}, ...s.contacts.map((c,i)=>h("div",{class:"contact"}, E("b",null,`contacts.${i}.name`,c.name||"TBC",{ph:"name"}), E("span",{class:"r"},`contacts.${i}.role`,c.role||"",{ph:"role"}), (c.phone||S.inline)?E("span",{class:"n"},`contacts.${i}.phone`,c.phone,{ph:"phone"}):null, (c.email||S.inline)?E("span",{class:"n"},`contacts.${i}.email`,c.email,{ph:"email"}):null)))) : null;
  let schedSec = null;
  if((s.schedule||[]).length){
    const tb=h("tbody");
    s.schedule.forEach((r,i)=>{ const P=`schedule.${i}.`; tb.append(h("tr",{class:r.kind||""},
      S.inline ? h("td",{class:"time"}, E("span",{class:"t0"},P+"start","",{ph:"start"}), h("span",{class:"t1"}," – "), E("span",{class:"t1"},P+"end","",{ph:"end"}))
        : h("td",{class:"time"}, h("span",{class:"t0"},r.start||""), r.end? h("span",{class:"t1"}," – "+r.end):null),
      (()=>{ const dur = !S.inline && ozf && isDuration(r.detail) ? r.detail : "";
        if(S.inline) return h("td",null, h("div",{class:"line"}, E("strong",null,P+"title","",{ph:"item"})),
          E("span",{class:"d"},P+"detail","",{ph:"detail / run time (one per line for a list)",multi:true}), E("span",{class:"who"},P+"who","",{ph:"who"}));
        return h("td",null, h("div",{class:"line"}, dur ? h("span",{class:"dur"},dur) : null, h("strong",null,r.title||"")),
          r.detail && !dur ? descNode(r.detail,"d") : null, r.who? h("span",{class:"who"},r.who):null); })())); });
    schedSec = h("section",{class:"sec"}, h("div",{class:"sec-h"},h("h3",null,"Running order"), ozf ? h("span",{class:"count"}, s.schedule.length+" items") : null), h("div",{class:"tbl"},h("table",{class:"sched"},tb)));
  }
  const notesSec = (s.notes||[]).length ? h("section",{class:"sec"}, h("div",{class:"sec-h"},h("h3",null,"Notes")), h("ul",{class:"list"}, ...s.notes.map((n,i)=>E("li",null,`notes.${i}`,n,{ph:"note (clear it to remove)"})))) : null;
  const openSec = (s.open||[]).length ? h("section",{class:"sec"}, h("div",{class:"sec-h"},h("h3",null,"Still to confirm"),h("span",{class:"count"},s.open.length+" open")),
    h("div",{class:"tbl"},h("table",{class:"open"}, h("thead",null,h("tr",null,h("th",null,"Item"),h("th",null,"Detail"),h("th",null,"Owner"))),
      h("tbody",null, ...s.open.map((o,i)=>h("tr",null,E("td",null,`open.${i}.item`,o.item||"",{ph:"item"}),E("td",null,`open.${i}.detail`,o.detail||"",{ph:"detail"}),E("td",null,`open.${i}.owner`,o.owner||"",{ph:"owner"}))))))) : null;
  const crewSec = peopleTable(s, s.crew||[], "crew", [{k:"role",l:"Role"},{k:"call",l:"Call"},{k:"base",l:"Base"}], "Crew");
  const castSec = peopleTable(s, s.cast||[], "cast", [{k:"role",l:"Role / wave"},{k:"call",l:"Call"},{k:"notes",l:"Notes"}], "Cast & talent");
  if(S.inline){
    const F=(k,paths,o={})=>h("div",{class:"fact"}, o.kpath ? E("span",{class:"k"},o.kpath,k,{ph:k}) : h("span",{class:"k"},k),
      ...paths.map(([p,ph])=>E("span",{class:"v ie-line"},p,"",{ph,multi:o.multi})));
    const L=[F(loc.label||"Location",[["location.name","venue"],["location.address","address"]],{kpath:"location.label"})];
    if(has2) L.push(F(loc2.label||"Studio location",[["location2.name","venue"],["location2.address","address"]],{kpath:"location2.label"}));
    if(!ozf) L.push(F("Venue hours",[["hours","08:00–18:00"]]), F("Sunset",[["sunset","≈ 16:10"]]));
    if(ozf) L.push(F("Nearest underground",[["tube","one point per line"]],{multi:true}));
    L.push(F("Nearest A&E",[["hospital","hospital, road, area"]]), F("Weather",[["weather","weather"]],{multi:true}), F("Parking & access",[["parking","parking & access"]],{multi:true}));
    sheet.append(h("div",{class:"facts"}, ...L));
    sheet.append(h("div",{class:"dayline"}, E("p",null,"location.notes","",{ph:"location / day notes",multi:true})));
    for(const x of (ozf ? [schedSec, castSec, crewSec, notesSec, contactsSec, openSec] : [contactsSec, schedSec, crewSec, castSec, notesSec, openSec])) if(x) sheet.append(x);
  } else if(ozf){
    // Only facts that are filled in; anything still TBC is listed once, quietly.
    const filled = facts.filter(([,v])=>!isTBC(v)), tbc = facts.filter(([,v])=>isTBC(v)).map(([k])=>k.toLowerCase());
    sheet.append(h("div",{class:"facts"}, ...filled.map(([k,v,l])=>factNode(k,v,l))));
    if(loc.notes || tbc.length) sheet.append(h("div",{class:"dayline"},
      loc.notes ? h("p",null, loc.notes) : null,
      tbc.length ? h("p",{class:"tbcline"}, "still to confirm: "+tbc.join(", ")) : null));
    for(const x of [schedSec, castSec, crewSec, notesSec, contactsSec, openSec]) if(x) sheet.append(x);
  } else {
    sheet.append(h("div",{class:"facts"}, ...facts.map(([k,v,l])=>isTBC(v) ? h("div",{class:"fact"},h("span",{class:"k"},k), h("span",{class:"v"},tbcNode(v))) : factNode(k,v,l))));
    if(loc.notes) sheet.append(h("section",{class:"sec"}, h("div",{class:"sec-h"},h("h3",null,"Location notes")), h("p",{style:"margin:0;white-space:pre-line"},loc.notes)));
    for(const x of [contactsSec, schedSec, crewSec, castSec, notesSec, openSec]) if(x) sheet.append(x);
  }
  sheet.append(h("div",{class:"foot"}, h("span",null,"Version "+(s.version||1)), s.updated? h("span",null,"Updated "+fmtStamp(s.updated)) : null, h("span",null,"Tap Confirm next to your name once you've read your call time")));
  main.append(sheet);
  if(S.inline) enableInline(sheet);
  else if(ozf) setupReveal(sheet);
}
// Fade content up as it scrolls into view (only what starts below the fold; skipped for reduced motion).
let revealObserver = null;
function setupReveal(root){
  if(!("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if(revealObserver) revealObserver.disconnect();
  revealObserver = new IntersectionObserver(entries=>{
    for(const e of entries) if(e.isIntersecting){ e.target.classList.add("rv-in"); revealObserver.unobserve(e.target); }
  }, {rootMargin:"0px 0px -5% 0px", threshold:0.05});
  const vh = window.innerHeight;
  const sel = ".fact,.dayline,.sec-h,.sched tr,.people tr,.contact,ul.list li,.open tr";
  root.querySelectorAll(sel).forEach(el=>{
    if(el.getBoundingClientRect().top < vh) return;
    if(el.parentElement && el.parentElement.closest(sel)) return; // nested (e.g. a list inside a row): the parent reveals it
    el.classList.add("rv"); revealObserver.observe(el);
  });
}
async function delSheet(id){
  const { error } = await sb.from("callsheets").delete().eq("id",id);
  S.delAsk=false;
  if(error){ flash("Couldn't delete it."); return; }
  S.sel=null; refresh();
}

/* ---------- editor (admins) ---------- */
const LISTS = {
  contacts:{label:"Key contacts", cols:[["name","Name","1.2fr"],["role","Role","1fr"],["phone","Phone","1fr"],["email","Email","1.3fr"]]},
  schedule:{label:"Running order", cols:[["start","Start","80px"],["end","End","80px"],["title","Item","1.4fr"],["detail","Detail","2fr"],["who","Who","1fr"],["kind","Type","110px"]]},
  crew:{label:"Crew", cols:[["name","Name","1.3fr"],["role","Role","1.3fr"],["call","Call","80px"],["base","Base","1fr"]], person:true},
  cast:{label:"Cast & talent", cols:[["name","Name","1.3fr"],["role","Role / wave","1.2fr"],["call","Call","80px"],["notes","Notes","1.3fr"]], person:true},
  open:{label:"Still to confirm", cols:[["item","Item","1fr"],["detail","Detail","2fr"],["owner","Owner","1fr"]]}
};
const KINDS=[["","Standard"],["shoot","Shooting"],["call","Call time"],["meal","Break / meal"]];
const blank = () => ({project:"",client:"",title:"",date:todayISO(),dayOf:"",status:"draft",crewCall:"",hours:"",sunset:"",weather:"",hospital:"",parking:"",location:{name:"",address:"",notes:""},location2:{label:"",name:"",address:""},contacts:[],schedule:[],crew:[],cast:[],notes:[],open:[]});
function startEdit(id, dup){
  S.inline=false;
  const d = id ? JSON.parse(JSON.stringify(S.sheets.get(id)||blank())) : blank();
  d.location = d.location||{name:"",address:"",notes:""};
  d.location2 = d.location2||{label:"",name:"",address:""};
  for(const k of Object.keys(LISTS)) d[k]=d[k]||[];
  d.notes=d.notes||[];
  if(dup){ d.status="draft"; d.title=(d.title||"")+" (copy)"; for(const p of [...d.crew,...d.cast]) p.id="p"+rid(); }
  S.editing = {id: dup?null:id, d, err:"", brand: (id && S.brandOf.get(id)) || (S.brands[0]||{}).id || ""};
  $("app").classList.add("has-sel"); renderSheet(); window.scrollTo({top:0});
}
function field(d, path, label, opts={}){
  const get=()=>path.split(".").reduce((o,k)=>o&&o[k],d)||"";
  const set=v=>{ const ks=path.split("."); let o=d; for(let i=0;i<ks.length-1;i++) o=o[ks[i]]; o[ks[ks.length-1]]=v; };
  const id="f-"+path.replace(/\./g,"-"); let inp;
  if(opts.options){ inp=h("select",{id,oninput:e=>set(e.target.value)}, ...opts.options.map(([v,l])=>{const o=h("option",{value:v},l); if(get()===v) o.selected=true; return o;})); }
  else if(opts.area){ inp=h("textarea",{id,oninput:e=>set(e.target.value)}); inp.value=get(); }
  else { inp=h("input",{id,type:opts.type||"text",placeholder:opts.ph||"",oninput:e=>set(e.target.value)}); inp.value=get(); }
  return h("div",{class:"f"+(opts.wide?" wide":"")}, h("label",{for:id},label), inp);
}
function listEditor(d, key){
  const L=LISTS[key], tmpl=L.cols.map(c=>c[2]).join(" ")+" 32px", rows=h("div",{class:"rows"});
  rows.append(h("div",{class:"rowed hd",style:"grid-template-columns:"+tmpl}, ...L.cols.map(c=>h("span",null,c[1])), h("span")));
  d[key].forEach((r,i)=>{
    rows.append(h("div",{class:"rowed",style:"grid-template-columns:"+tmpl},
      ...L.cols.map(([k,l])=>{
        const id="e-"+key+"-"+i+"-"+k;
        if(k==="kind") return h("select",{id,"aria-label":l,oninput:e=>{r[k]=e.target.value;}}, ...KINDS.map(([v,t])=>{const o=h("option",{value:v},t); if((r.kind||"")===v) o.selected=true; return o;}));
        if(key==="schedule" && k==="detail"){ const ta=h("textarea",{id,"aria-label":l,placeholder:"Detail (one per line for a list)",rows:1,class:"cell-area",oninput:e=>{r[k]=e.target.value;}}); ta.value=r[k]||""; return ta; }
        const inp=h("input",{id,"aria-label":l,placeholder:l,oninput:e=>{r[k]=e.target.value;}}); inp.value=r[k]||""; return inp;
      }),
      h("button",{class:"x",type:"button","aria-label":"Remove row",title:"Remove row",onclick:()=>{d[key].splice(i,1); renderSheet();}},"×")));
  });
  return h("section",{class:"sec"},
    h("div",{class:"sec-h"},h("h3",null,L.label), h("button",{class:"btn sm",type:"button",onclick:()=>{ const r={}; L.cols.forEach(c=>r[c[0]]=""); if(L.person) r.id="p"+rid(); d[key].push(r); renderSheet(); }},"Add row")),
    d[key].length ? rows : h("div",{class:"empty"},"Nothing here yet."));
}
function renderEditor(){
  const E=S.editing, d=E.d, wrap=h("article",{class:"sheet ed"+(E.brand?" b-"+E.brand:"")});
  const cancel = ()=>{ S.editing=null; render(); };
  wrap.append(h("div",{class:"sheet-top"}, h("div",null, h("div",{class:"kicker"},h("span",{class:"cs"}, E.id?"Editing call sheet":"New call sheet")), h("h2",null, d.project||"Untitled"),
    h("p",{class:"sub"}, E.id ? "Saving issues a new version. Anyone who confirmed an earlier one is asked to reconfirm." : "Fill in what you know. Blanks show as TBC."))));
  wrap.append(h("div",{class:"actions"}, h("button",{class:"btn primary",onclick:save},"Save call sheet"), h("button",{class:"btn",onclick:cancel},"Cancel"), h("span",{class:"sp"}), E.err? h("span",{class:"err"},E.err):null));
  wrap.append(h("section",{class:"sec"}, h("div",{class:"sec-h"},h("h3",null,"The day")),
    h("div",{class:"fgrid"},
      h("div",{class:"f"}, h("label",{for:"f-brand"},"Brand (who can see it)"),
        h("select",{id:"f-brand",oninput:e=>{E.brand=e.target.value; renderSheet();}}, ...S.brands.map(b=>{ const o=h("option",{value:b.id},b.name); if(E.brand===b.id) o.selected=true; return o; }))),
      field(d,"project","Project",{ph:"e.g. onezerofive"}), field(d,"client","Client"), field(d,"title","Title",{ph:"e.g. Campaign"}),
      field(d,"date","Date",{type:"date"}), field(d,"dayOf","Day",{ph:"Day 1 of 2"}),
      field(d,"status","Status",{options:[["draft","Draft"],["issued","Issued"],["wrapped","Wrapped"]]}),
      field(d,"crewCall","General crew call",{ph:"08:00"}), field(d,"hours","Venue hours",{ph:"08:00–18:00"}), field(d,"sunset","Sunset",{ph:"≈ 16:10"}),
      field(d,"weather","Weather"), field(d,"tube","Nearest underground (one point per line)",{area:true}), field(d,"hospital","Nearest A&E"), field(d,"parking","Parking & access"))));
  wrap.append(h("section",{class:"sec"}, h("div",{class:"sec-h"},h("h3",null,"Location")),
    h("div",{class:"fgrid"}, field(d,"location.label","Location label",{ph:"Location"}), field(d,"location.name","Venue"), field(d,"location.address","Address"), field(d,"location.notes","Location notes",{area:true,wide:true}),
      field(d,"location2.label","Second location label",{ph:"Studio location"}), field(d,"location2.name","Second location"), field(d,"location2.address","Second location address"))));
  for(const k of ["contacts","schedule","crew","cast"]) wrap.append(listEditor(d,k));
  const notesArea=h("textarea",{id:"e-notes",oninput:e=>{d.notes=e.target.value.split("\n").map(x=>x.trim()).filter(Boolean);}}); notesArea.value=(d.notes||[]).join("\n");
  wrap.append(h("section",{class:"sec"}, h("div",{class:"sec-h"},h("h3",null,"Notes")), h("div",{class:"f"}, h("label",{for:"e-notes"},"One note per line"), notesArea)));
  wrap.append(listEditor(d,"open"));
  wrap.append(h("div",{class:"actions"}, h("button",{class:"btn primary",onclick:save},"Save call sheet"), h("button",{class:"btn",onclick:cancel},"Cancel")));
  return wrap;
}
async function save(){
  const E=S.editing, d=E.d;
  if(!E.brand){ E.err="Choose which brand this call sheet belongs to."; renderSheet(); return; }
  if(!d.project.trim()){ E.err="Add a project name first."; renderSheet(); return; }
  const prev = E.id ? S.sheets.get(E.id) : null;
  const id = E.id || ((d.date||"undated")+"-"+slug(d.project)+"-"+rid());
  const body = {...d, version: prev ? (prev.version||1)+1 : 1, updated:new Date().toISOString()};
  const { error } = await sb.from("callsheets").upsert({ id, brand: E.brand, data: body, updated_at: body.updated });
  if(error){ E.err = "Couldn't save: " + (error.message||"try again"); renderSheet(); return; }
  S.editing=null; S.sel=id; try{history.replaceState(null,"","#"+id);}catch(e){}
  await refresh();
}

/* ---------- boot ---------- */
function render(){
  $("app").classList.toggle("has-sel", !!(S.sel || S.editing));
  $("newBtn").hidden = !S.admin;
  renderList(); renderSheet();
}
$("q").addEventListener("input", e=>{ S.q=e.target.value; renderList(); });
$("newBtn").addEventListener("click", ()=>startEdit(null,false));

async function boot(){
  if(!sb){ showGate(); return; }
  const { data:{ session } } = await sb.auth.getSession();
  if(session){
    const { data:isAdm } = await sb.rpc("is_admin");
    S.admin = !!isAdm; S.email = session.user.email || "";
    if(location.hash.includes("access_token")) try{ history.replaceState(null,"",location.pathname); }catch(e){}
    if(!S.admin){ await sb.auth.signOut(); $("signinMsg").textContent="That email isn't on the production list."; $("signinMsg").className="msg err"; $("signinForm").hidden=false; }
  }
  S.codes = loadCodes(); saveCodes();
  if(!S.admin && !S.codes.length){ showGate(); return; }
  showApp(); render(); await refresh();
  setInterval(()=>{ if(!document.hidden && !S.editing && !S.inline && !$("app").hidden) refresh(); }, 60000);
  document.addEventListener("visibilitychange", ()=>{ if(!document.hidden && !S.editing && !S.inline && !$("app").hidden) refresh(); });
}
boot();
})();
