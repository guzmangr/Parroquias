try{ if('scrollRestoration' in history){ history.scrollRestoration = 'manual'; } }catch(e){}
/* Mapa Interactivo Parroquias de Oviedo - lectura extensa + JSON */
const SVG_PATH = 'fondo.svg';

const svgContainer = document.getElementById('svgContainer');
const listEl = document.getElementById('parishList');
const searchInput = document.getElementById('searchInput');

const modal = document.getElementById('modal');
const modalClose = document.getElementById('modalClose');
const modalTitle = document.getElementById('modalTitle');
const modalContent = document.getElementById('modalContent');
const carouselViewport = document.getElementById('carouselViewport');
const dotsEl = document.getElementById('carouselDots');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');

let carouselIndex = 0;
let currentSlides = [];
let regions = []; // {el, name, id}
let parishData = {}; // name -> {title, desc, images:[]}
let lastFocused = null;

const slugify = s => (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
const placeholderImagesFor = (name) => [1,2,3,4,5,6,7,8,9,10].map(i => `assets/placeholders/${slugify(name||'parroquia')}-${i}.jpg`);

// Markdown -> HTML (sencillo)
function mdToHTML(md){
  if (!md) return '';
  md = md.replace(/\r\n/g,'\n');
  md = md.replace(/^\s*###\s+(.*)$/gm, '<h4>$1</h4>');
  md = md.replace(/^\s*##\s+(.*)$/gm, '<h3>$1</h3>');
  md = md.replace(/^\s*#\s+(.*)$/gm, '<h2>$1</h2>');
  md = md.replace(/(?:^|\n)-\s+(.+)(?=\n|$)/g, (_, item)=>`\n<li>${item}</li>`);
  md = md.replace(/(?:<li>.*<\/li>\n?)+/gs, block=>`<ul>\n${block.trim()}\n</ul>\n`);
  md = md.replace(/(?:^|\n)\d+\.\s+(.+)(?=\n|$)/g, (_, item)=>`\n<li>${item}</li>`);
  md = md.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  md = md.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  md = md.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  md = md.replace(/\n{2,}/g, '</p><p>');
  if (!/^<h\d|<ul>|<ol>|<p>/.test(md.trim())) md = `<p>${md}</p>`;
  if (!md.startsWith('<p>')) md = `<p>${md}`;
  if (!md.endsWith('</p>')) md = `${md}</p>`;
  return md;
}

// Carga JSON externo si existe
async function loadExternalParishData(){
  try{
    const res = await fetch('assets/data/parroquias.json', {cache:'no-store'});
    if (!res.ok) return;
    const arr = await res.json();
    arr.forEach(item => {
      const key = item.id || item.name;
      if (!key) return;
      let match = regions.find(r => r.id === key) || regions.find(r => r.name === key) ||
                  regions.find(r => slugify(r.name) === slugify(key));
      if (!match) return;
      parishData[match.name] = {
        title: item.name || match.name,
        desc: item.desc_md || item.desc || '',
        images: (item.images && item.images.length ? item.images : (parishData[match.name]?.images || placeholderImagesFor(match.name))).slice(0, 10)
      };
    });
  }catch(e){
    console.warn('Sin parroquias.json', e);
  }
}

// Carga SVG inline, construye regiones (desactiva Oviedo)
async function loadSVGInline() {
  const res = await fetch(SVG_PATH);
  const txt = await res.text();
  svgContainer.innerHTML = txt;
  const svg = svgContainer.querySelector('svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Mapa de las parroquias de Oviedo');
  fitSVG(svg);

  let root = svg;
  const namedRoot = svg.querySelector('g#Parroquias_Oviedo, g#parroquias, g#PARROQUIAS, g[id*="Parroquias"]');
  if (namedRoot) root = namedRoot;

  const groups = Array.from(root.children).filter(n => n.tagName.toLowerCase()==='g');

  groups.forEach(g => {
    const name = g.getAttribute('data-name') || g.getAttribute('inkscape:label') || g.id || g.getAttribute('title') || 'Parroquia';
    const nm = (name||'').trim().toLowerCase();
    if (nm === 'oviedo') {
      g.removeAttribute('tabindex'); g.removeAttribute('role'); g.setAttribute('aria-hidden','true'); g.style.pointerEvents='none';
      return; // no se añade a la lista ni eventos
    }

    g.classList.add('region');
    g.setAttribute('tabindex','0');
    g.setAttribute('role','button');
    g.setAttribute('aria-label', `Parroquia ${name}`);

    if (!parishData[name]) {
      parishData[name] = {
        title: name,
        desc: `Descripción de ${name}.`,
        images: placeholderImagesFor(name)
      };
    }
    g.addEventListener('click', () => openParish(name));
    g.addEventListener('keydown', (e) => { if (e.key==='Enter'||e.key===' ') { e.preventDefault(); openParish(name);} });
    regions.push({el:g, name, id:g.id || slugify(name)});
  });

  await loadExternalParishData();
  renderList();
}

function fitSVG(svg){
  if (!svg.getAttribute('preserveAspectRatio')) { svg.setAttribute('preserveAspectRatio','xMidYMid meet'); }
  if (!svg.getAttribute('viewBox')) {
    const bb = svg.getBBox ? svg.getBBox() : {x:0,y:0,width:1200,height:800};
    svg.setAttribute('viewBox', `${bb.x} ${bb.y} ${bb.width} ${bb.height}`);
  }
}

function renderList(){
  const items = regions.slice().sort((a,b) => a.name.localeCompare(b.name, 'es')).map(r => r.name);
  listEl.innerHTML = '';
  items.forEach(name => {
    const li = document.createElement('li');
    li.tabIndex = 0;
    li.innerHTML = `<div class="parish-name">${name}</div><div class="parish-meta">Haz clic para ver detalles</div>`;
    li.addEventListener('click', () => openParish(name));
    li.addEventListener('keydown', (e)=>{ if (e.key==='Enter'||e.key===' ') { e.preventDefault(); openParish(name);} });
    listEl.appendChild(li);
  });

  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    Array.from(listEl.children).forEach(li => {
      const name = li.querySelector('.parish-name').textContent.toLowerCase();
      li.style.display = name.includes(q) ? '' : 'none';
    });
  });
}

function openParish(name){
  
  try{ resetModalScroll(); }catch(e){}
lastFocused = document.activeElement;
  const data = parishData[name] || {title:name, desc:'', images: placeholderImagesFor(name)};
  modalTitle.textContent = data.title;
  modalContent.innerHTML = mdToHTML(data.desc || '');
resetModalScrollDeferred();
resetModalScrollDeferred();
  try{ resetModalScroll(); }catch(e){}

  currentSlides = (data.images || []).slice(0, 10);
  carouselIndex = 0;
  renderCarousel();
resetModalScrollDeferred();
hookCarouselImageLoads();resetModalScrollDeferred();
hookCarouselImageLoads();
resetModalScrollDeferred();
  try{ resetModalScroll(); }catch(e){}

  modal.setAttribute('aria-hidden','false');
onModalOpened();
resetModalScrollDeferred();
resetModalScrollDeferred();
  try{ resetModalScroll(); }catch(e){}

  document.body.style.overflow='hidden';
  try{ resetModalScroll(); }catch(e){}
resetModalScrollDeferred();
setTimeout(()=>{ try{ document.getElementById('modalClose')?.focus({preventScroll:true}); }catch(e){} }, 0);
}

function renderCarousel(){
  const track = document.createElement('div');
  track.className = 'carousel__track';
  track.style.transform = `translateX(-${carouselIndex*100}%)`;
  currentSlides.forEach(src => {
    const slide = document.createElement('div'); slide.className = 'carousel__slide';
    const img = document.createElement('img'); img.loading = 'lazy'; img.alt = 'Imagen de ejemplo'; img.src = src;
    slide.appendChild(img); track.appendChild(slide);
  });
  carouselViewport.innerHTML = ''; carouselViewport.appendChild(track);
  dotsEl.innerHTML = '';
  currentSlides.forEach((_,i)=>{
    const dot = document.createElement('button'); dot.className = 'carousel__dot';
    dot.setAttribute('aria-current', i===carouselIndex ? 'true':'false');
    dot.addEventListener('click', ()=>{ carouselIndex=i; renderCarousel();
resetModalScrollDeferred();
hookCarouselImageLoads();resetModalScrollDeferred();
hookCarouselImageLoads();
resetModalScrollDeferred();
  try{ resetModalScroll(); }catch(e){}
 });
    dotsEl.appendChild(dot);
  });
}

prevBtn.addEventListener('click', ()=>{ carouselIndex = (carouselIndex - 1 + currentSlides.length) % currentSlides.length; renderCarousel();
resetModalScrollDeferred();
hookCarouselImageLoads();resetModalScrollDeferred();
hookCarouselImageLoads();
resetModalScrollDeferred();
  try{ resetModalScroll(); }catch(e){}
 });
nextBtn.addEventListener('click', ()=>{ carouselIndex = (carouselIndex + 1) % currentSlides.length; renderCarousel();
resetModalScrollDeferred();
hookCarouselImageLoads();resetModalScrollDeferred();
hookCarouselImageLoads();
resetModalScrollDeferred();
  try{ resetModalScroll(); }catch(e){}
 });

function closeModal(){
  try{ resetModalScroll(); }catch(e){}

  modal.setAttribute('aria-hidden','true');
  document.body.style.overflow='';
  if (lastFocused && typeof lastFocused.focus === 'function') { try{ lastFocused.focus(); }catch(e){} }
}
document.getElementById('modalClose').addEventListener('click', closeModal);
modal.addEventListener('click', (e)=>{ if(e.target === modal) closeModal(); });
window.addEventListener('keydown', (e)=>{ if(e.key==='Escape' && modal.getAttribute('aria-hidden')==='false') closeModal(); });

loadSVGInline().catch(err=>{
  console.error('Error cargando SVG', err);
  svgContainer.innerHTML = `<div style="color:#111;padding:10px">No se pudo cargar el SVG. Asegúrate de que el archivo <code>fondo.svg</code> esté junto a este HTML.</div>`;
});

function resetModalScroll(){
  try{
    const modal = document.getElementById('modal');
    const modalBody = document.getElementById('modalBody');
    const modalContent = document.getElementById('modalContent');
    if (modal) { modal.scrollTop = 0; if (modal.scrollTo) modal.scrollTo(0,0); }
    if (modalBody) { modalBody.scrollTop = 0; if (modalBody.scrollTo) modalBody.scrollTo(0,0); }
    if (modalContent) { modalContent.scrollTop = 0; if (modalContent.scrollTo) modalContent.scrollTo(0,0); }
    document.documentElement.scrollTop = 0; document.body.scrollTop = 0;
    try { window.scrollTo({top:0, left:0, behavior:'instant'}); } catch(e){ window.scrollTo(0,0); }
  }catch(e){}
}

function resetModalScrollDeferred(){
  try{
    resetModalScroll();
    requestAnimationFrame(()=>{
      resetModalScroll();
      setTimeout(()=>{ resetModalScroll(); }, 100);
    });
  }catch(e){}
}

function hookCarouselImageLoads(){
  try{
    const viewport = document.getElementById('carouselViewport') || document.querySelector('.carousel__viewport');
    if (!viewport) return;
    const imgs = viewport.querySelectorAll('img');
    imgs.forEach(img=>{
      img.addEventListener('load', ()=>{ resetModalScrollDeferred(); }, {once:true});
    });
  }catch(e){}
}

function onModalOpened(){
  try{
    resetModalScroll();
    resetModalScrollDeferred();
    // segundo ciclo de seguridad
    setTimeout(()=>resetModalScrollDeferred(), 200);
  }catch(e){}
}

function hookModalTransition(){
  try{
    const modal = document.getElementById('modal');
    if (!modal) return;
    modal.addEventListener('transitionend', ()=>{ resetModalScrollDeferred(); }, {once:false});
  }catch(e){}
}


// === mdToHTML sobrescrito: secciones con <div class="sec"> y listas bien cerradas ===
function mdToHTML(src){
  function escapeHtml(s){
    return String(s || '')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;');
  }
  function slugify(s){
    return (s||'').normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g,'-')
      .replace(/(^-|-$)/g,'');
  }
  const lines = String(src||'').split(/\r?\n/);
  let html = '';
  let inList = false;
  let secOpen = false;

  for(let i=0;i<lines.length;i++){
    const raw = lines[i];
    const line = raw.trim();

    // Heading "## "
    if (line.startsWith('## ')){
      if (inList){ html += '</ul>'; inList=false; }
      if (secOpen){ html += '</div>'; secOpen=false; }
      const title = line.slice(3).trim();
      const slug = slugify(title);
      html += `<div class="sec sec--${slug}">`;
      secOpen = true;
      html += `<h2>${escapeHtml(title)}</h2>`;
      continue;
    }

    // Blank line
    if (!line) { if (inList) { html += '</ul>'; inList = false; } html += '<div class="sec__spacer"></div>'; continue; }

    // Bullets "- " o "• "
    if (/^(-|•)\s+/.test(line)){
      const content = raw.replace(/^(\s*(-|•)\s+)/,''); // conservar espacios interiores
      if (!inList){
        html += '<ul>';
        inList = true;
      }
      // Permitimos <u> y etiquetas simples en contenido, el resto escapado
      // Estrategia: no escapar y confiar en entradas controladas (JSON)
      html += `<li>${content}</li>`;
      continue;
    }

    // Párrafo normal
    if (inList){ html += '</ul>'; inList=false; }
    html += `<p>${escapeHtml(raw)}</p>`;
  }

  if (inList){ html += '</ul>'; inList=false; }
  if (secOpen){ html += '</div>'; secOpen=false; }
  return html;
}

