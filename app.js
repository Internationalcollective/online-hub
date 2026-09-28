(function(){
"use strict";
const CFG = window.HUB_CONFIG || {};
const S = { sheets:new Map(), confirms:new Map(), sel:null, editing:null, q:"", admin:false, email:"", code:"", ready:false, delAsk:false, err:"" };
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
  const { data, error } = await sb.rpc("hub_read", { p_code: S.code || "" });
  if (error) throw error;
  S.sheets = new Map((data.callsheets||[]).map(r=>[r.id, r.data]));
  const m = new Map();
  for (const c of (data.confirms||[])){ if(!m.has(c.sheet)) m.set(c.sheet,new Map()); m.get(c.sheet).set(c.person,c); }
  S.confirms = m; S.ready = true;
}
async function refresh(){
  try{ await loadAll(); S.err=""; }
  catch(e){
    if (isBadCode(e)){ store.set("hub-code",null); S.code=""; showGate("That passcode didn't work. Check it and try again."); return; }
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
const isBadCode = e => e && (e.code==="28P01" || /bad_passcode/.test(e.message||""));

/* ---------- gate ---------- */
function showGate(msg){
  $("app").hidden = true; $("gate").hidden = false;
  $("codeMsg").textContent = msg || ""; $("codeMsg").className = "msg" + (msg ? " err" : "");
  if(!configured){ $("codeMsg").textContent = "This hub isn't connected to its database yet. Fill in config.js."; $("codeMsg").className="msg err"; }
}
function showApp(){ $("gate").hidden = true; $("app").hidden = false; }
$("codeForm").addEventListener("submit", async e=>{
  e.preventDefault(); if(!sb) return;
  S.code = $("code").value.trim(); $("codeMsg").textContent = "Checking…"; $("codeMsg").className="msg";
  try{ await loadAll(); store.set("hub-code", S.code); showApp(); S.sel=null; await refresh(); }
  catch(err){ $("codeMsg").textContent = isBadCode(err) ? "That passcode didn't work. Check it and try again." : "Couldn't reach the call sheets. Try again."; $("codeMsg").className="msg err"; }
});
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
  const up = all.filter(s=>(s.date||"9999")>=t).sort((a,b)=>(a.date||"").localeCompare(b.date||""));
  const past = all.filter(s=>(s.date||"9999")<t).sort((a,b)=>(b.date||"").localeCompare(a.date||""));
  if(!all.length){ box.append(h("div",{class:"empty"}, S.q ? "No callsheets match that search." : (S.admin ? "No callsheets yet. Press New to make the first one." : "No callsheets have been issued yet."))); return; }
  const grp = (label, arr) => {
    if(!arr.length) return;
    const g = h("div",{class:"grp"}, h("h2",null,label));
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
  grp("Upcoming", up); grp("Past", past);
  const who = $("who"); who.replaceChildren();
  if(S.admin) who.append(h("span",null,"Signed in as "+S.email), h("button",{class:"linkbtn",onclick:signOut},"Sign out"));
  else who.append(h("button",{class:"linkbtn",onclick:()=>{ store.set("hub-code",null); S.code=""; showGate(); }},"Lock this device"));
}
async function signOut(){ await sb.auth.signOut(); S.admin=false; S.email=""; if(S.code) refresh(); else showGate(); }

/* ---------- sheet view ---------- */
function select(id){ S.sel=id; S.editing=null; S.delAsk=false; try{ history.replaceState(null,"","#"+id); }catch(e){} render(); window.scrollTo({top:0}); }
let flashMsg="";
function flash(m){ flashMsg=m; render(); setTimeout(()=>{flashMsg=""; render();},4000); }

function confirmCell(sheet, p){
  const c = (S.confirms.get(sheet.id)||new Map()).get(p.id);
  const wrap = h("div",{class:"cf"});
  if(c){
    const stale = (c.version||1) < (sheet.version||1);
    wrap.append(h("div",null, h("span",{class:"ok"},"Confirmed"), h("small",null, stale ? h("span",{class:"old"},"on v"+(c.version||1)+" · ") : null, fmtStamp(c.at))));
    if(stale) wrap.append(h("button",{class:"btn sm",onclick:()=>doConfirm(sheet,p)},"Reconfirm"));
    if(S.admin) wrap.append(h("button",{class:"x",title:"Undo confirmation","aria-label":"Undo confirmation for "+(p.name||"this person"),onclick:()=>undoConfirm(sheet,p)},"×"));
  } else wrap.append(h("button",{class:"btn sm",onclick:()=>doConfirm(sheet,p)},"Confirm"));
  return wrap;
}
async function doConfirm(sheet,p){
  const { error } = await sb.rpc("hub_confirm", { p_code:S.code||"", p_sheet:sheet.id, p_person:p.id });
  if(error){ flash(/no_person|no_sheet/.test(error.message||"") ? "This call sheet changed. Reload and try again." : "Couldn't save the confirmation. Try again."); return; }
  await refresh();
}
async function undoConfirm(sheet,p){
  const { error } = await sb.from("confirms").delete().eq("sheet",sheet.id).eq("person",p.id);
  if(error) flash("Couldn't undo that confirmation."); else refresh();
}

function peopleTable(sheet, rows, cols, label){
  const cm = S.confirms.get(sheet.id) || new Map();
  const n = rows.filter(p=>cm.has(p.id)).length, pct = rows.length ? Math.round(n/rows.length*100) : 0;
  const sec = h("section",{class:"sec"}, h("div",{class:"sec-h"}, h("h3",null,label), rows.length ? h("span",{class:"count"}, n+" of "+rows.length+" confirmed", h("span",{class:"bar"}, h("i",{style:"width:"+pct+"%"}))) : null));
  if(!rows.length){ sec.append(h("div",{class:"empty"},"No names added yet.")); return sec; }
  const tb = h("tbody");
  for(const p of rows) tb.append(h("tr",null,
    h("td",null, tbcNode(p.name)),
    ...cols.map(c=> c.k==="call" ? h("td",{class:"time"}, val(p.call,"—")) : h("td",null, p[c.k]||"")),
    h("td",{class:"cfc"}, confirmCell(sheet,p))));
  sec.append(h("div",{class:"tbl"}, h("table",{class:"people"},
    h("thead",null,h("tr",null,h("th",null,"Name"),...cols.map(c=>h("th",null,c.l)),h("th",{style:"text-align:right"},"Read & confirmed"))), tb)));
  return sec;
}

function renderSheet(){
  const main = $("main"); main.replaceChildren();
  if(S.editing){ main.append(renderEditor()); return; }
  if(!S.ready){ main.append(h("div",{class:"placeholder"}, S.err || "loading…")); return; }
  const raw = S.sheets.get(S.sel);
  if(!raw){ main.append(h("div",{class:"placeholder"}, S.sheets.size ? "pick a call sheet from the list." : "no call sheets yet.")); return; }
  const s = {id:S.sel, ...raw}, loc = s.location||{};
  const sheet = h("article",{class:"sheet"});
  sheet.append(h("div",{class:"sheet-top"},
    h("div",null,
      h("div",{class:"kicker"}, h("span",{class:"cs"},"Call sheet"), s.dayOf? h("span",null,s.dayOf):null, statusChip(s.status), h("span",{class:"chip"},"v"+(s.version||1))),
      h("h2",null, s.project||"Untitled"),
      h("p",{class:"sub"}, [s.title, s.client && s.client!==s.project ? "for "+s.client : null].filter(Boolean).join(" · ")),
      h("p",{class:"when"}, fmtLong(s.date)+" · "+rel(s.date))),
    h("div",{class:"callbox"}, h("span",null,"General crew call"), h("b",null, val(s.crewCall,"TBC")), h("small",null, s.hours ? "Venue "+s.hours : ""))));
  const act = h("div",{class:"actions"}, h("button",{class:"btn back",onclick:()=>{S.sel=null;render();}},"← All call sheets"), h("span",{class:"sp"}));
  if(S.admin){
    if(S.delAsk) act.append(h("span",{class:"inline-confirm"},"Delete this call sheet and its confirmations?", h("button",{class:"btn sm danger",onclick:()=>delSheet(s.id)},"Delete"), h("button",{class:"btn sm",onclick:()=>{S.delAsk=false;render();}},"Cancel")));
    else act.append(h("button",{class:"btn",onclick:()=>startEdit(s.id,false)},"Edit"), h("button",{class:"btn",onclick:()=>startEdit(s.id,true)},"Duplicate"), h("button",{class:"btn danger",onclick:()=>{S.delAsk=true;render();}},"Delete"));
  }
  if(S.admin || mobile()) sheet.append(act);
  if(flashMsg) sheet.append(h("div",{class:"banner"},flashMsg));
  const facts = [["Location",[loc.name,loc.address].filter(Boolean).join("\n")],["Venue hours",s.hours],["Sunset",s.sunset],["Weather",s.weather],["Nearest A&E",s.hospital],["Parking & access",s.parking]];
  sheet.append(h("div",{class:"facts"}, ...facts.map(([k,v])=>h("div",{class:"fact"},h("span",{class:"k"},k), h("span",{class:"v"}, isTBC(v)? tbcNode(v) : v)))));
  if(loc.notes) sheet.append(h("section",{class:"sec"}, h("div",{class:"sec-h"},h("h3",null,"Location notes")), h("p",{style:"margin:0;white-space:pre-line"},loc.notes)));
  if((s.contacts||[]).length) sheet.append(h("section",{class:"sec"}, h("div",{class:"sec-h"},h("h3",null,"Key contacts")),
    h("div",{class:"contacts"}, ...s.contacts.map(c=>h("div",{class:"contact"}, h("b",null,c.name||"TBC"), h("span",{class:"r"},c.role||""), c.phone?h("span",{class:"n"},c.phone):null, c.email?h("span",{class:"n"},c.email):null)))));
  if((s.schedule||[]).length){
    const tb=h("tbody");
    for(const r of s.schedule) tb.append(h("tr",{class:r.kind||""},
      h("td",{class:"time"}, r.start||"", r.end? h("span",null," – "+r.end):null),
      h("td",null, h("strong",null,r.title||""), r.detail? h("span",{class:"d"},r.detail):null, r.who? h("span",{class:"who"},r.who):null)));
    sheet.append(h("section",{class:"sec"}, h("div",{class:"sec-h"},h("h3",null,"Running order")), h("div",{class:"tbl"},h("table",{class:"sched"},tb))));
  }
  sheet.append(peopleTable(s, s.crew||[], [{k:"role",l:"Role"},{k:"call",l:"Call"},{k:"base",l:"Base"}], "Crew"));
  sheet.append(peopleTable(s, s.cast||[], [{k:"role",l:"Role / wave"},{k:"call",l:"Call"},{k:"notes",l:"Notes"}], "Cast & talent"));
  if((s.notes||[]).length) sheet.append(h("section",{class:"sec"}, h("div",{class:"sec-h"},h("h3",null,"Notes")), h("ul",{class:"list"}, ...s.notes.map(n=>h("li",null,n)))));
  if((s.open||[]).length) sheet.append(h("section",{class:"sec"}, h("div",{class:"sec-h"},h("h3",null,"Still to confirm"),h("span",{class:"count"},s.open.length+" open")),
    h("div",{class:"tbl"},h("table",{class:"open",style:"min-width:520px"}, h("thead",null,h("tr",null,h("th",null,"Item"),h("th",null,"Detail"),h("th",null,"Owner"))),
      h("tbody",null, ...s.open.map(o=>h("tr",null,h("td",null,o.item||""),h("td",null,o.detail||""),h("td",null,o.owner||""))))))));
  sheet.append(h("div",{class:"foot"}, h("span",null,"Version "+(s.version||1)), s.updated? h("span",null,"Updated "+fmtStamp(s.updated)) : null, h("span",null,"Tap Confirm next to your name once you've read your call time")));
  main.append(sheet);
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
const blank = () => ({project:"",client:"",title:"",date:todayISO(),dayOf:"",status:"draft",crewCall:"",hours:"",sunset:"",weather:"",hospital:"",parking:"",location:{name:"",address:"",notes:""},contacts:[],schedule:[],crew:[],cast:[],notes:[],open:[]});
function startEdit(id, dup){
  const d = id ? JSON.parse(JSON.stringify(S.sheets.get(id)||blank())) : blank();
  d.location = d.location||{name:"",address:"",notes:""};
  for(const k of Object.keys(LISTS)) d[k]=d[k]||[];
  d.notes=d.notes||[];
  if(dup){ d.status="draft"; d.title=(d.title||"")+" (copy)"; for(const p of [...d.crew,...d.cast]) p.id="p"+rid(); }
  S.editing = {id: dup?null:id, d, err:""};
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
        const inp=h("input",{id,"aria-label":l,placeholder:l,oninput:e=>{r[k]=e.target.value;}}); inp.value=r[k]||""; return inp;
      }),
      h("button",{class:"x",type:"button","aria-label":"Remove row",title:"Remove row",onclick:()=>{d[key].splice(i,1); renderSheet();}},"×")));
  });
  return h("section",{class:"sec"},
    h("div",{class:"sec-h"},h("h3",null,L.label), h("button",{class:"btn sm",type:"button",onclick:()=>{ const r={}; L.cols.forEach(c=>r[c[0]]=""); if(L.person) r.id="p"+rid(); d[key].push(r); renderSheet(); }},"Add row")),
    d[key].length ? rows : h("div",{class:"empty"},"Nothing here yet."));
}
function renderEditor(){
  const E=S.editing, d=E.d, wrap=h("article",{class:"sheet ed"});
  const cancel = ()=>{ S.editing=null; render(); };
  wrap.append(h("div",{class:"sheet-top"}, h("div",null, h("div",{class:"kicker"},h("span",{class:"cs"}, E.id?"Editing call sheet":"New call sheet")), h("h2",null, d.project||"untitled"),
    h("p",{class:"sub"}, E.id ? "saving issues a new version. anyone who confirmed an earlier one is asked to reconfirm." : "fill in what you know. blanks show as TBC."))));
  wrap.append(h("div",{class:"actions"}, h("button",{class:"btn primary",onclick:save},"Save call sheet"), h("button",{class:"btn",onclick:cancel},"Cancel"), h("span",{class:"sp"}), E.err? h("span",{class:"err"},E.err):null));
  wrap.append(h("section",{class:"sec"}, h("div",{class:"sec-h"},h("h3",null,"The day")),
    h("div",{class:"fgrid"},
      field(d,"project","Project",{ph:"e.g. onezerofive"}), field(d,"client","Client"), field(d,"title","Title",{ph:"e.g. Campaign"}),
      field(d,"date","Date",{type:"date"}), field(d,"dayOf","Day",{ph:"Day 1 of 2"}),
      field(d,"status","Status",{options:[["draft","Draft"],["issued","Issued"],["wrapped","Wrapped"]]}),
      field(d,"crewCall","General crew call",{ph:"08:00"}), field(d,"hours","Venue hours",{ph:"08:00–18:00"}), field(d,"sunset","Sunset",{ph:"≈ 16:10"}),
      field(d,"weather","Weather"), field(d,"hospital","Nearest A&E"), field(d,"parking","Parking & access"))));
  wrap.append(h("section",{class:"sec"}, h("div",{class:"sec-h"},h("h3",null,"Location")),
    h("div",{class:"fgrid"}, field(d,"location.name","Venue"), field(d,"location.address","Address"), field(d,"location.notes","Location notes",{area:true,wide:true}))));
  for(const k of ["contacts","schedule","crew","cast"]) wrap.append(listEditor(d,k));
  const notesArea=h("textarea",{id:"e-notes",oninput:e=>{d.notes=e.target.value.split("\n").map(x=>x.trim()).filter(Boolean);}}); notesArea.value=(d.notes||[]).join("\n");
  wrap.append(h("section",{class:"sec"}, h("div",{class:"sec-h"},h("h3",null,"Notes")), h("div",{class:"f"}, h("label",{for:"e-notes"},"One note per line"), notesArea)));
  wrap.append(listEditor(d,"open"));
  wrap.append(h("div",{class:"actions"}, h("button",{class:"btn primary",onclick:save},"Save call sheet"), h("button",{class:"btn",onclick:cancel},"Cancel")));
  return wrap;
}
async function save(){
  const E=S.editing, d=E.d;
  if(!d.project.trim()){ E.err="Add a project name first."; renderSheet(); return; }
  const prev = E.id ? S.sheets.get(E.id) : null;
  const id = E.id || ((d.date||"undated")+"-"+slug(d.project)+"-"+rid());
  const body = {...d, version: prev ? (prev.version||1)+1 : 1, updated:new Date().toISOString()};
  const { error } = await sb.from("callsheets").upsert({ id, data: body, updated_at: body.updated });
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
  S.code = store.get("hub-code") || "";
  if(!S.admin && !S.code){ showGate(); return; }
  showApp(); render(); await refresh();
  setInterval(()=>{ if(!document.hidden && !S.editing && !$("app").hidden) refresh(); }, 60000);
  document.addEventListener("visibilitychange", ()=>{ if(!document.hidden && !S.editing && !$("app").hidden) refresh(); });
}
boot();
})();
