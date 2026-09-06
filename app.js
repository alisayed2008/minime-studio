const $ = (s) => document.querySelector(s);

const intro = $('#intro');
const files = $('#files');
const upload = $('#upload');
const thumbs = $('#thumbs');
const stage = $('#stage');
const canvasLayer = $('#canvasLayer');
const empty = $('#empty');
const generate = $('#generate');
const buy = $('#buy');
const creditsEl = $('#credits');
const priceEl = $('#price');
const notice = $('#notice');
const noteCursor = $('#noteCursor');

const PRICES = { '8cm': 1500, '10cm': 2000, '15cm': 2500 };
const STYLE_PROMPTS = {
  figure: 'Create a collectible 3D figure of the person or subject shown in the reference images. Preserve identity, facial structure, hairstyle, clothing, colors, accessories and distinctive details. Use a premium realistic vinyl/resin collectible figure presentation, clean studio lighting, full body, centered, isolated, no text, no extra people.',
  funko: 'Create a Funko Pop inspired collectible figure of the person or subject shown in the reference images. Preserve recognizable identity, hairstyle, clothing colors, accessories and distinctive details while using the iconic stylized oversized head, simplified facial features and compact body proportions. Clean studio lighting, centered, isolated, no text, no extra people.',
  voxel: 'Create a voxel/block-art collectible figure of the person or subject shown in the reference images. Preserve recognizable identity, hairstyle, clothing colors, accessories and distinctive details using clean cubic geometry and a polished 3D voxel aesthetic. Centered, isolated, no text, no extra people.'
};

let images = [], style = 'figure', size = '10cm', credits = 10, creditsDay = '', zoom = 1, notes = [], noteMode = false, history = [], historyIndex = -1, generatedData = '', payment = 'instapay', introTimer;

function toast(message) { notice.textContent = message; notice.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => notice.classList.remove('show'), 2200); }
function todayKey() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function loadCredits() { try { const saved = JSON.parse(localStorage.getItem('minime-credits') || 'null'), today = todayKey(); if (saved?.date === today) credits = Math.max(0, Math.min(10, Number(saved.credits) || 0)); else { credits = 10; localStorage.setItem('minime-credits', JSON.stringify({ date: today, credits })); } } catch { credits = 10; } creditsDay = todayKey(); renderCredits(); }
function renderCredits() { creditsEl.textContent = `${credits} credits`; generate.disabled = images.length === 0 || credits < 5 || stage.classList.contains('generating'); }
function saveCredits() { creditsDay = todayKey(); localStorage.setItem('minime-credits', JSON.stringify({ date: creditsDay, credits })); renderCredits(); }
function persistState() { try { localStorage.setItem('minime-state', JSON.stringify({ images, style, size, zoom, notes, generatedData, savedAt: Date.now() })); } catch {} }
function restoreState() { try { const s = JSON.parse(localStorage.getItem('minime-state') || 'null'); if (!s) return; images = Array.isArray(s.images) ? s.images.slice(0,5) : []; style = s.style || 'figure'; size = s.size || '10cm'; zoom = Number(s.zoom) || 1; notes = Array.isArray(s.notes) ? s.notes : []; generatedData = s.generatedData || ''; renderThumbs(); applyChoices(); if (generatedData) showGenerated(generatedData, false); else applyZoom(); } catch {} }
function save() { persistState(); toast('Progress saved on this device.'); }

function renderThumbs() { thumbs.innerHTML = ''; images.forEach((src, i) => { const d = document.createElement('div'); d.className = 'thumb'; const img = document.createElement('img'); img.src = src; img.alt = `Reference ${i+1}`; const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.setAttribute('aria-label','Remove image'); remove.onclick = e => { e.stopPropagation(); images.splice(i,1); renderThumbs(); renderCredits(); persistState(); }; d.append(img,remove); thumbs.appendChild(d); }); }

async function compressImage(file) {
  const bitmap = await createImageBitmap(file);
  const max = 1400;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.82);
}

function readFiles(list) {
  const incoming = [...list].filter(f => f.type.startsWith('image/')).slice(0, Math.max(0,5-images.length));
  if (!incoming.length) return;
  Promise.all(incoming.map(compressImage)).then(results => {
    images.push(...results);
    renderThumbs(); renderCredits(); persistState();
  }).catch(() => toast('Could not read one of the images.'));
}

upload.addEventListener('click', () => files.click());
upload.addEventListener('dragover', e => { e.preventDefault(); upload.classList.add('drag'); });
upload.addEventListener('dragleave', () => upload.classList.remove('drag'));
upload.addEventListener('drop', e => { e.preventDefault(); upload.classList.remove('drag'); readFiles(e.dataTransfer.files); });
files.addEventListener('change', () => { readFiles(files.files); files.value = ''; });

document.querySelectorAll('#styles button').forEach(btn => btn.addEventListener('click', () => { style = btn.dataset.value; applyChoices(); persistState(); }));
document.querySelectorAll('#sizes button').forEach(btn => btn.addEventListener('click', () => { size = btn.dataset.value; applyChoices(); persistState(); }));
function applyChoices() { document.querySelectorAll('#styles button').forEach(b => b.classList.toggle('active',b.dataset.value===style)); document.querySelectorAll('#sizes button').forEach(b => b.classList.toggle('active',b.dataset.value===size)); priceEl.textContent = `Total price: ${PRICES[size]} EGP`; $('#orderSummary').textContent = `${size} · ${PRICES[size]} EGP`; renderCredits(); }

function addHistory(src) { history = history.slice(0,historyIndex+1); history.push(src); historyIndex = history.length-1; }
function showGenerated(src, addToHistory=true) { generatedData=src; empty.style.display='none'; canvasLayer.innerHTML=''; const img=document.createElement('img'); img.className='modelImage'; img.src=src; img.alt='Generated mini me'; canvasLayer.appendChild(img); notes.forEach(addNoteMarker); applyZoom(); stage.classList.add('generated'); $('#download').disabled=false; $('#share').disabled=false; buy.disabled=false; if(addToHistory) addHistory(src); }
function applyZoom() { canvasLayer.style.transform=`scale(${zoom})`; }
function setZoom(next) { zoom=Math.max(.45,Math.min(3.2,Number(next.toFixed(2)))); applyZoom(); persistState(); }
$('#zin').addEventListener('click',()=>setZoom(zoom+.2)); $('#zout').addEventListener('click',()=>setZoom(zoom-.2));
function showHistory(index) { if(index<0||index>=history.length)return; historyIndex=index; generatedData=history[index]; showGenerated(generatedData,false); }
function goBack(){if(historyIndex>0)showHistory(historyIndex-1)} function goForward(){if(historyIndex<history.length-1)showHistory(historyIndex+1)}
$('#back').addEventListener('click',goBack); $('#backIcon').addEventListener('click',goBack); $('#forward').addEventListener('click',goForward); $('#forwardIcon').addEventListener('click',goForward); $('#save').addEventListener('click',save);

function setNoteMode(active){noteMode=active;stage.style.cursor=active?'crosshair':'default';noteCursor.style.display=active?'block':'none';}
$('#note').addEventListener('click',()=>{if(!generatedData)return toast('Generate a model first.');setNoteMode(!noteMode);});
stage.addEventListener('mousemove',e=>{if(!noteMode)return;noteCursor.style.left=`${e.clientX+12}px`;noteCursor.style.top=`${e.clientY+12}px`;});
stage.addEventListener('mouseleave',()=>{if(noteMode)noteCursor.style.display='none'}); stage.addEventListener('mouseenter',()=>{if(noteMode)noteCursor.style.display='block'});
function addNoteMarker(note){const marker=document.createElement('button');marker.type='button';marker.className='noteMarker';marker.textContent=note.text;marker.style.left=`${note.x}%`;marker.style.top=`${note.y}%`;marker.title='Click to edit or remove this note';marker.onclick=e=>{e.stopPropagation();const value=prompt('Edit note. Leave empty to remove:',note.text);if(value===null)return;if(!value.trim())notes=notes.filter(n=>n.id!==note.id);else note.text=value.trim();persistState();if(generatedData)showGenerated(generatedData,false)};canvasLayer.appendChild(marker);}
stage.addEventListener('click',e=>{if(!noteMode||!generatedData||e.target.closest('.noteMarker'))return;const r=stage.getBoundingClientRect(),x=((e.clientX-r.left)/r.width)*100,y=((e.clientY-r.top)/r.height)*100,text=prompt('Write your note:');if(!text?.trim()){setNoteMode(false);return;}const note={id:crypto.randomUUID?.()||String(Date.now()),x,y,text:text.trim()};notes.push(note);addNoteMarker(note);persistState();setNoteMode(false);});
function imageParts(){return images.map((src,i)=>({name:`reference-${i+1}.jpg`,data:src}));}

async function generateModel(){if(!images.length)return toast('Upload 1 to 5 reference images first.');if(credits<5)return toast('No credits remaining today.');generate.disabled=true;stage.classList.add('generating');$('#stageStatus').textContent='Generating…';setNoteMode(false);try{const response=await fetch('/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({images:imageParts(),style,size,prompt:STYLE_PROMPTS[style]})});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'Generation failed.');if(!data.image)throw new Error('The image service returned no image.');credits-=5;saveCredits();notes=[];showGenerated(data.image);persistState();toast('Model generated. 5 credits used.');}catch(err){toast(err.message||'Generation failed.');}finally{stage.classList.remove('generating');$('#stageStatus').textContent='';renderCredits();}}
generate.addEventListener('click',generateModel);

function downloadBlob(dataUrl,filename){const a=document.createElement('a');a.href=dataUrl;a.download=filename;document.body.appendChild(a);a.click();a.remove();}
async function createAnnotatedImage(){if(!generatedData)return '';const img=new Image();img.src=generatedData;await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject});const canvas=document.createElement('canvas');canvas.width=img.naturalWidth||1024;canvas.height=img.naturalHeight||1024;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0,canvas.width,canvas.height);ctx.font='bold 28px Arial';notes.forEach(n=>{const x=canvas.width*n.x/100,y=canvas.height*n.y/100,pad=10,w=ctx.measureText(n.text).width+pad*2;ctx.fillStyle='#fff4a3';ctx.strokeStyle='#000';ctx.lineWidth=5;ctx.beginPath();ctx.roundRect(x-w/2,y-48,w,44,8);ctx.fill();ctx.stroke();ctx.fillStyle='#000';ctx.fillText(n.text,x-w/2+pad,y-17);});return canvas.toDataURL('image/png');}
$('#download').addEventListener('click',async()=>{if(!generatedData)return;const annotated=await createAnnotatedImage();downloadBlob(annotated||generatedData,notes.length?'mini-me-with-notes.png':'mini-me.png');});
$('#share').addEventListener('click',async()=>{if(!generatedData)return;const annotated=await createAnnotatedImage();try{const blob=await(await fetch(annotated||generatedData)).blob(),file=new File([blob],'mini-me.png',{type:'image/png'});if(navigator.canShare?.({files:[file]})&&navigator.share)await navigator.share({title:'mini me',text:'My mini me model',files:[file]});else if(navigator.share)await navigator.share({title:'mini me',url:location.href});else{await navigator.clipboard.writeText(location.href);toast('Page link copied.');}}catch{}});

function openModal(){if(!generatedData)return toast('Generate a model before buying.');$('#orderSummary').textContent=`${size} · ${PRICES[size]} EGP`;$('#buyModal').classList.add('open');$('#buyModal').setAttribute('aria-hidden','false');}
function closeModal(){$('#buyModal').classList.remove('open');$('#buyModal').setAttribute('aria-hidden','true');}
buy.addEventListener('click',openModal);$('#close').addEventListener('click',closeModal);$('#buyModal').addEventListener('click',e=>{if(e.target.id==='buyModal')closeModal()});
document.querySelectorAll('.payments button').forEach(btn=>btn.addEventListener('click',()=>{payment=btn.dataset.pay;document.querySelectorAll('.payments button').forEach(b=>b.classList.toggle('selected',b===btn));}));
$('#order').addEventListener('submit',async e=>{e.preventDefault();const status=$('#status');status.textContent='Sending order…';const annotated=await createAnnotatedImage();try{const response=await fetch('/api/order',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:$('#name').value.trim(),address:$('#address').value.trim(),phone:$('#phone').value.trim(),email:$('#email').value.trim(),payment,size,price:PRICES[size],style,generatedImage:generatedData,annotatedImage:annotated||generatedData})});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'Could not send the order.');status.textContent='Order sent successfully.';toast('Order sent.');setTimeout(closeModal,1000);}catch(err){status.textContent=err.message||'Could not send the order.';}});

document.querySelectorAll('.help').forEach(help=>{let tip,hideTimer;const show=()=>{clearTimeout(hideTimer);if(tip)tip.remove();tip=document.createElement('div');tip.className='helpTip';tip.textContent=help.dataset.help;const r=help.getBoundingClientRect();tip.style.left=`${Math.min(window.innerWidth-240,r.left+15)}px`;tip.style.top=`${Math.max(8,r.bottom+6)}px`;document.body.appendChild(tip);};const hide=()=>{hideTimer=setTimeout(()=>{tip?.remove();tip=null},2000)};help.addEventListener('mouseenter',show);help.addEventListener('mouseleave',hide);help.addEventListener('click',()=>{if(tip)hide();else show()});});

function finishIntro(){clearTimeout(introTimer);intro.classList.add('hide');setTimeout(()=>intro.remove(),500)}
window.addEventListener('load',()=>{introTimer=setTimeout(finishIntro,350)},{once:true});
setTimeout(()=>{if(document.readyState==='complete')finishIntro()},5000);
loadCredits();restoreState();applyChoices();