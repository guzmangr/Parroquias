/*
  waypoints.js — icono 8px + zoom 1.5x y ficha pegada por POI (mismo formato).
  - Usa assets/icons/way.png
  - Auto-resuelve regiones anidadas
  - Centroide visual por muestreo
  - Copia de la "ficha" de la parroquia y extrae la sección correspondiente al POI
*/
(function(){
  'use strict';
  const ICON = 'assets/icons/way.png';
  const $ = (sel,root=document)=>root.querySelector(sel);
  const $$ = (sel,root=document)=>Array.from(root.querySelectorAll(sel));

// ---- Tooltip hover para waypoints ----
let WP_TOOLTIP = null;
function ensureTooltip(){
  if (WP_TOOLTIP) return WP_TOOLTIP;
  const el = document.createElement('div');
  el.className = 'wp-tooltip';
  el.setAttribute('role','tooltip');
  el.style.opacity = '0';
  el.style.transform = 'translateY(-4px)';
  el.style.display = 'none';
  document.body.appendChild(el);
  WP_TOOLTIP = el;
  return el;
}
function setTooltipContent(poi){
  const el = ensureTooltip();
  const title = (poi && poi.title) ? poi.title : '';
  const img = (poi && poi.images && poi.images[0]) ? poi.images[0] : '';
  el.innerHTML = `<h4 class="wp-tooltip__title"></h4>${img?`<img class="wp-tooltip__img" alt="">`:''}`;
  el.querySelector('.wp-tooltip__title').textContent = title || '';
  if (img){
    const im = el.querySelector('.wp-tooltip__img');
    im.src = img;
    im.alt = title || '';
  }
}
function showTooltipAt(x,y){
  const el = ensureTooltip();
  const pad=12, vw=window.innerWidth, vh=window.innerHeight;
  const rectW = el.offsetWidth||240, rectH = el.offsetHeight||120;
  // Posición preferente arriba-izquierda del cursor
  let left = Math.min(Math.max(x+14, pad), vw - rectW - pad);
  let top  = Math.min(Math.max(y-rectH-14, pad), vh - rectH - pad);
  el.style.left = left + 'px';
  el.style.top  = top + 'px';
  el.style.display = 'block';
  requestAnimationFrame(()=>{ el.style.opacity='1'; el.style.transform='translateY(0)'; });
}
function hideTooltip(){
  if (!WP_TOOLTIP) return;
  WP_TOOLTIP.style.opacity='0';
  WP_TOOLTIP.style.transform='translateY(-4px)';
  // Retraso breve para permitir transición
  setTimeout(()=>{ if(WP_TOOLTIP) WP_TOOLTIP.style.display='none'; }, 140);
}


function getViewBox(svg){
  const vb = (svg.getAttribute('viewBox')||'').trim().split(/\s+/).map(parseFloat);
  if (vb.length===4 && vb.every(n=>!isNaN(n))) return {minx:vb[0], miny:vb[1], w:vb[2], h:vb[3]};
  const r = svg.getBBox ? svg.getBBox() : {x:0,y:0,width:svg.clientWidth||1000,height:svg.clientHeight||1000};
  return {minx:r.x, miny:r.y, w:r.width, h:r.height};
}
function applyPositionToMarker(svg, g, pos){
  const img = g.querySelector('image'); if(!img || !pos) return;
  const w = parseFloat(img.getAttribute('width'))||8;
  const h = parseFloat(img.getAttribute('height'))||8;
  const vb = getViewBox(svg);
  const x = vb.minx + (pos.vx/100)*vb.w - w/2;
  const y = vb.miny + (pos.vy/100)*vb.h - h;
  img.setAttribute('x', x);
  img.setAttribute('y', y);
}


  function normalizeName(s){
    try{
      let t = s.toString().replace(/[_-]+/g,' ');
      t = t.normalize('NFD').replace(/[\u0300-\u036f]/g,'');
      t = t.toLowerCase().trim().replace(/^parroquia\s+/, '');
      t = t.replace(/\s+/g,' ');
      t = t.replace(/^(la|el|los|las)\s+/, '');
      return t.trim();
    }catch(e){
      return (s||'').toString().toLowerCase().trim();
    }
  }

  function waitForSVG(){
    return new Promise(resolve=>{
      const container = $('#svgContainer');
      if (!container){ resolve(document.querySelector('svg')); return; }
      let tries = 0;
      const iv = setInterval(()=>{
        const svg = container.querySelector('svg');
        if (svg){ clearInterval(iv); resolve(svg); }
        else if (++tries>100){ clearInterval(iv); resolve(document.querySelector('svg')); }
      }, 60);
    });
  }

  async function loadJSON(p){
    try{ const r = await fetch(p,{cache:'no-store'}); return await r.json(); }
    catch(e){ console.warn('[WP] sin JSON', e); return {}; }
  }

  function collectRegions(svg){
    const regs = [];
    $$('g.region', svg).forEach(g=>{
      const raw = (g.getAttribute('aria-label')||g.id||'').replace(/^Parroquia\s+/i,'').trim();
      if (raw) regs.push({el:g, name: raw});
    });
    if (regs.length) return regs;
    $$('g', svg).forEach(g=>{
      const raw = (g.getAttribute('aria-label')||g.id||'').replace(/^Parroquia\s+/i,'').trim();
      if (raw) regs.push({el:g, name: raw});
    });
    return regs;
  }

  function ensureLayer(svg){
    let layer = svg.querySelector('g.wp-root');
    if (!layer){
      layer = document.createElementNS('http://www.w3.org/2000/svg','g');
      layer.setAttribute('class','wp-root');
      svg.appendChild(layer);
    }
    return layer;
  }

  function regionCentroid(targetEl, svg){
    let bb; try{ bb = targetEl.getBBox(); }catch(e){ return {x:0,y:0}; }
    const cols = 24, rows = 24;
    const pt = svg.createSVGPoint();
    let sx = 0, sy = 0, n = 0;
    for (let i=0;i<cols;i++){
      for (let j=0;j<rows;j++){
        const x = bb.x + (i+0.5)*bb.width/cols;
        const y = bb.y + (j+0.5)*bb.height/rows;
        pt.x = x; pt.y = y;
        try{
          if (targetEl.isPointInFill && targetEl.isPointInFill(pt)) { sx += x; sy += y; n++; }
        }catch(e){}
      }
    }
    if (n>0) return {x: sx/n, y: sy/n};
    return {x: bb.x + bb.width/2, y: bb.y + bb.height/2};
  }

  function resolveRegionElement(svg, rawName, baseEl){
    const key = normalizeName(rawName);
    const inside = $$('path,polygon', baseEl).find(p=>{
      const n = normalizeName(p.getAttribute('aria-label')||p.id||'');
      return n===key || n.includes(key) || key.includes(n);
    });
    if (inside) return inside;
    const candidates = $$('path,polygon', svg).filter(p=>{
      const n = normalizeName(p.getAttribute('aria-label')||p.id||'');
      return n===key || n.includes(key) || key.includes(n);
    });
    if (candidates.length) return candidates[0];
    return baseEl;
  }

  // --- FICHA: localizar la sección concreta del POI dentro de la ficha de la parroquia ---
  function getParishFichaRoot(parishName){
    const key = normalizeName(parishName);
    const selectors = [
      `[data-parish]`, `[data-parroquia]`, `#ficha-${key}`, `#parish-${key}`, `.ficha[data-parish]`, `.parish-ficha`, `.parroquia-ficha`
    ];
    for (const sel of selectors){
      const nodes = $$(sel, document);
      for (const node of nodes){
        const attrs = [
          node.getAttribute('data-parish'),
          node.getAttribute('data-parroquia'),
          node.id || '',
          node.getAttribute('aria-label')||''
        ].map(v => normalizeName(v||''));
        const inText = normalizeName(node.textContent||'');
        if (attrs.includes(key) || inText.includes(key)) return node;
      }
    }
    return null;
  }

  function getPOISectionHTML(parishName, poi){
    const root = getParishFichaRoot(parishName);
    if (!root) return '';

    const keyTitle = normalizeName(poi.title||'');

    // 1) Por data-id/anchors
    const direct = root.querySelector(`[data-poi-id="${poi.id}"]`) || root.querySelector(`#${poi.id}`) || root.querySelector(`[data-id="${poi.id}"]`);
    if (direct){
      // Incluir el propio nodo + sus hermanos siguientes hasta el próximo encabezado/POI
      return sliceUntilNextSection(direct);
    }

    // 2) Buscar por texto de título (en headings y listas)
    const headings = root.querySelectorAll('h1,h2,h3,h4,h5,dt,li,strong,em,b');
    for (const h of headings){
      const txt = normalizeName(h.textContent||'');
      if (txt.includes(keyTitle) || keyTitle.includes(txt)){
        return sliceUntilNextSection(h);
      }
    }

    // 3) Último recurso: primer párrafo que contenga el título
    const paras = root.querySelectorAll('p');
    for (const p of paras){
      const txt = normalizeName(p.textContent||'');
      if (txt.includes(keyTitle)){
        return p.outerHTML;
      }
    }

    return '';
  }

  function sliceUntilNextSection(startNode){
    // Toma el nodo de inicio y concatena sus hermanos siguientes hasta llegar a un límite (encabezado/HR/separador)
    const limits = new Set(['H1','H2','H3','H4','H5','HR']);
    let html = startNode.outerHTML || '';
    let node = startNode.nextElementSibling;
    while (node){
      if (limits.has(node.tagName)) break;
      // si detectamos otro bloque marcado como data-poi-id, cortamos
      if (node.hasAttribute && (node.hasAttribute('data-poi-id') || node.hasAttribute('data-id'))) break;
      html += node.outerHTML || '';
      node = node.nextElementSibling;
    }
    return html;
  }

  function openPopup(title, desc, images, parishName, poi){
    // 1) Intentar sección específica del POI desde la ficha (manteniendo formato)
    const poiHTML = getPOISectionHTML(parishName, poi);
    // 2) Si no hay sección, usar desc/imágenes del JSON
    const fallbackHTML=(function(){ let html=''; if(desc){ try{ html+=(typeof mdToHTML==='function')?mdToHTML(desc):`<p>${desc}</p>`;}catch(e){ html+=`<p>${desc}</p>`;} } return html; })();

    
// --- Single image rendering for waypoints (no thumbnails/carrusel) ---
try{
  const wrap = document.getElementById('parishSwiperWrapper');
  if (wrap){
    wrap.innerHTML = '';
    // Fallback to parish image if none
    if ((!images || images.length===0) && parish){
      const parishSlug = parish.toLowerCase()
        .replace(/[áàä]/g,'a').replace(/[éèë]/g,'e')
        .replace(/[íìï]/g,'i').replace(/[óòö]/g,'o')
        .replace(/[úùü]/g,'u').replace(/ñ/g,'n')
        .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
      images = [`assets/parroquias/${parishSlug}/01.png`];
    }
    const mainSrc = (images && images.length) ? images[0] : '';
    const img = document.createElement('img');
    img.src = mainSrc;
    img.alt = title || '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.style.width = '100%';
    img.style.height = 'auto';
    img.style.borderRadius = '12px';
    img.style.margin = '.5rem 0';
    wrap.appendChild(img);
  }
}catch(e){ console.warn('single-image waypoint render failed', e); }
const modal = $('#modal');
    if(modal){
      const titleEl = $('#modalTitle');
      const contentEl = $('#modalContent');
      if(titleEl) titleEl.textContent = title;
      if(contentEl) contentEl.innerHTML = poiHTML || fallbackHTML || '';
      modal.setAttribute('aria-hidden','false');
      // Hide thumbs strip for waypoints (no miniatures)
const thumbsEl = document.getElementById('parishThumbs');
if (thumbsEl) thumbsEl.style.display = 'none';
try { } catch(e){}
document.body.style.overflow='hidden';
      try{ }catch(e){}
      return;
    }
    // Fallback: plano
    const plain = (poiHTML && poiHTML.replace(/<[^>]+>/g,'')) || (desc||'');
    alert(title + (plain ? ('\n\n'+plain) : ''));
  }

  function makeMarker(x, y, poi, parishName){
    const g = document.createElementNS('http://www.w3.org/2000/svg','g');
    g.setAttribute('class','wp');
    g.setAttribute('tabindex','0');
    g.setAttribute('role','button');
    g.setAttribute('data-waypoint-id', poi.id || poi.title || 'wp');
    g.setAttribute('data-parish', parishName || 'Parroquia');
    g.style.transformBox = 'fill-box';
    g.style.transformOrigin = 'center';
    g.style.transition = 'transform .2s ease, filter .2s ease';

    const img = document.createElementNS('http://www.w3.org/2000/svg','image');
    const size = 8; // tamaño base 8px
    img.setAttributeNS('http://www.w3.org/1999/xlink','href', ICON);
    img.setAttribute('width', size);
    img.setAttribute('height', size);
    img.setAttribute('x', x - size/2);
    img.setAttribute('y', y - size);
    img.setAttribute('preserveAspectRatio','xMidYMid slice');
    g.appendChild(img);

    const focus = ()=>{ g.style.transform = 'scale(1.5)'; g.style.filter='drop-shadow(0 2px 4px rgba(0,0,0,.3))'; };
    const blur  = ()=>{ g.style.transform = 'scale(1.0)';  g.style.filter='none'; };
    g.addEventListener('mouseenter', focus);
    g.addEventListener('mouseenter', (e)=>{ setTooltipContent(poi); showTooltipAt(e.clientX, e.clientY); });
    g.addEventListener('mouseleave', blur);
    g.addEventListener('mouseleave', hideTooltip);
    g.addEventListener('focus', focus);
    g.addEventListener('focus', ()=>{ setTooltipContent(poi); const bb = g.getBoundingClientRect(); showTooltipAt(bb.left+bb.width/2, bb.top); });
    g.addEventListener('blur', blur);
    g.addEventListener('blur', hideTooltip);

    g.addEventListener('click', ()=>openPopup(poi.title, poi.desc||'', poi.images||[], parishName, poi));

    g.addEventListener('mousemove', (e)=>{ showTooltipAt(e.clientX, e.clientY); });

    g.addEventListener('keydown', e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); openPopup(poi.title, poi.desc||'', poi.images||[], parishName, poi); } });

    return g;
  }

  function placeWaypoints(svg, regions, map){
    const layer = ensureLayer(svg);
    Array.from(layer.querySelectorAll('g.wp')).forEach(n=>n.remove());

    regions.forEach(r=>{
      const k = normalizeName(r.name);
      const list = map[k] || [];
      if (!list.length) return;

      const target = resolveRegionElement(svg, r.name, r.el);
      const cen = regionCentroid(target, svg);

      const N = list.length;
      const dy = 12;
      const positions = Array.from({length:N}, (_,i)=>({x:cen.x, y:cen.y + (i-(N-1)/2)*dy}));
      positions.forEach((p,idx)=>{
        const g = makeMarker(p.x, p.y, list[idx], r.name);
      layer.appendChild(g);
      try{ if(list[idx] && list[idx].pos){ applyPositionToMarker(svg, g, list[idx].pos); } }catch(e){}});
    });
  }

  (async function init(){
    const [svg, data, pos] = await Promise.all([ waitForSVG(), loadJSON('assets/data/waypoints.json'), loadJSON('assets/data/waypoint-positions.svg.json') ]);
    const map = {}; Object.keys(data||{}).forEach(k=>{ map[normalizeName(k)] = data[k]; });
    const regions = collectRegions(svg);
    placeWaypoints(svg, regions, map, pos||{});
  })();
})();