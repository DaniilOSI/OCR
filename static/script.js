document.addEventListener('DOMContentLoaded', function () {
    // ===== меню =====
    const menuBtns = document.querySelectorAll(".menu-btn");
    const blocks = document.querySelectorAll(".content-block");
    menuBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            menuBtns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            blocks.forEach(b => b.style.display = (b.id === btn.dataset.target) ? "block" : "none");
        });
    });

    // ===== OCR =====
    const dropzone = document.getElementById("dropzone");
    const fileInput = document.getElementById("fileInput");
    const startBtn = document.getElementById("startBtn");
    const clearBtn = document.getElementById("clearBtn");
    const status = document.getElementById("status");
    const fileList = document.getElementById("fileList");
    const showMoreBtn = document.getElementById("showMoreBtn");
    const progressContainer = document.getElementById("progressContainer");
    const progressBar = document.getElementById("progressBar");
    const progressText = document.getElementById("progressText");

    const formatPopup = document.getElementById('formatPopup');
    const formatForm = document.getElementById('formatForm');
    const formatCancel = document.getElementById('formatCancel');

    let files = [];
    let showAll = false;
    let isProcessing = false;
    let selectedFormats = ['pdf'];
    let archiveMode = false;

    dropzone.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", e => addFiles(Array.from(e.target.files)));
    dropzone.addEventListener("dragover", e => { e.preventDefault(); dropzone.classList.add("drag-over"); });
    dropzone.addEventListener("dragleave", e => { e.preventDefault(); dropzone.classList.remove("drag-over"); });
    dropzone.addEventListener("drop", e => { e.preventDefault(); dropzone.classList.remove("drag-over"); addFiles(Array.from(e.dataTransfer.files)); });

    showMoreBtn.addEventListener("click", () => { showAll = !showAll; renderFileList(); });
    clearBtn.addEventListener("click", () => { files = []; showAll=false; renderFileList(); });

    startBtn.addEventListener("click", () => { openFormatPopup(); });
    formatCancel.onclick = () => formatPopup.style.display="none";
    formatForm.onsubmit = e => {
        e.preventDefault();
        selectedFormats = Array.from(formatForm.querySelectorAll('input[name="fmt"]:checked')).map(cb => cb.value);
        archiveMode = !!formatForm.querySelector('input[name="archive"]:checked');
        formatPopup.style.display = "none";
        handleUpload();
    };
    function openFormatPopup() { formatPopup.style.display="flex"; }

    function addFiles(newFiles) {
        newFiles.forEach(f => { if (!files.find(file=>file.name===f.name)) files.push(f); });
        renderFileList();
    }

    function renderFileList() {
        fileList.innerHTML = "";
        const displayFiles = showAll ? files : files.slice(0,6);
        displayFiles.forEach(f => {
            const li = document.createElement("li");
            const span = document.createElement("span"); span.textContent=f.name;
            const removeBtn = document.createElement("button"); removeBtn.className="remove-btn"; removeBtn.textContent="✕"; removeBtn.onclick=()=>{ files.splice(files.indexOf(f),1); renderFileList(); };
            li.appendChild(span); li.appendChild(removeBtn); fileList.appendChild(li);
        });
        document.getElementById("fileCount").innerText=`(${files.length} файл${files.length===1?'':'ов'} добавлено)`;
        showMoreBtn.style.display = files.length>6?"inline-block":"none";
        showMoreBtn.innerText = showAll?"Скрыть":`Показать все (${files.length})`;
        clearBtn.style.display = files.length>0?"inline-block":"none";
    }

    function getSelectedLangs() { return Array.from(document.querySelectorAll('.ocrLang:checked')).map(cb=>cb.value).join('+')||'rus+eng'; }

    async function handleUpload() {
        if(files.length===0) return alert("Выберите хотя бы один файл");
        if(isProcessing) return;
        isProcessing=true; startBtn.disabled=true; clearBtn.disabled=true; status.innerText=""; progressContainer.style.display="block";
        const formData = new FormData(); files.forEach(f=>formData.append("file",f)); formData.append("lang", getSelectedLangs()); formData.append("formats", selectedFormats.join(',')); formData.append("zip", archiveMode?"1":"0");
        try{
            const response=await fetch("/upload",{method:"POST",body:formData});
            if(!response.ok){const err=await response.json().catch(()=>({})); throw new Error(err.error||"Ошибка OCR");}
            const blob=await response.blob(); downloadBlob(blob, `ocr_files_${Date.now()}.zip`);
            status.innerText="✅ Готово! Архив скачан.";
        } catch(err){status.innerText=`❌ Ошибка: ${err.message}`;}
        finally{isProcessing=false; startBtn.disabled=false; clearBtn.disabled=false; files=[]; renderFileList(); progressContainer.style.display="none";}
    }

    function downloadBlob(blob,filename){const url=window.URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=filename;a.click();window.URL.revokeObjectURL(url);}

    // ===== Транскрибация аудио =====
    const audioDrop = document.getElementById("audioDrop");
    const audioInput = document.getElementById("audioInput");
    const startTranscribeBtn = document.getElementById("startTranscribeBtn");
    const transcribeStatus = document.getElementById("transcribeStatus");
    const audioFileList = document.getElementById("audioFileList");
    const clearAudioBtn = document.getElementById("clearAudioBtn");

    let audioFiles = [];

    audioDrop.addEventListener("click", ()=>audioInput.click());
    audioInput.addEventListener("change", e => addAudioFile(Array.from(e.target.files)));
    audioDrop.addEventListener("dragover", e=>{e.preventDefault(); audioDrop.classList.add("drag-over");});
    audioDrop.addEventListener("dragleave", e=>{e.preventDefault(); audioDrop.classList.remove("drag-over");});
    audioDrop.addEventListener("drop", e=>{e.preventDefault(); audioDrop.classList.remove("drag-over"); addAudioFile(Array.from(e.dataTransfer.files));});

    clearAudioBtn.addEventListener("click", () => { audioFiles=[]; renderAudioList(); });

    function addAudioFile(newFiles){
        newFiles.forEach(f=>{ if(!audioFiles.find(a=>a.name===f.name)) audioFiles.push(f); });
        renderAudioList();
    }

    function renderAudioList(){
        audioFileList.innerHTML="";
        audioFiles.forEach(f=>{
            const li = document.createElement("li");
            const span = document.createElement("span"); span.textContent=f.name;
            const removeBtn = document.createElement("button"); removeBtn.className="remove-btn"; removeBtn.textContent="✕"; removeBtn.onclick=()=>{ audioFiles.splice(audioFiles.indexOf(f),1); renderAudioList(); };
            li.appendChild(span); li.appendChild(removeBtn); audioFileList.appendChild(li);
        });
        clearAudioBtn.style.display = audioFiles.length>0?"inline-block":"none";
    }

    startTranscribeBtn.addEventListener("click", async()=>{
        if(!audioFiles.length) return alert("Выберите хотя бы один аудиофайл");
        const file=audioFiles[0];
        transcribeStatus.innerText="Транскрибирование...";
        const fd=new FormData(); fd.append("file",file);
        try{
            const resp=await fetch("/transcribe",{method:"POST",body:fd});
            if(!resp.ok){const err=await resp.json().catch(()=>({})); throw new Error(err.error||"Ошибка транскрибации");}
            const blob=await resp.blob(); downloadBlob(blob, file.name.replace(/\.[^/.]+$/,"")+".docx");
            transcribeStatus.innerText="✅ Готово! Word скачан.";
            audioInput.value=""; audioFiles=[]; renderAudioList();
        }catch(e){transcribeStatus.innerText=`❌ ${e.message}`;}
    });

    // ===== FAQ =====
    const faqBtn = document.getElementById('faqBtn');
    const faqModal = document.getElementById('faqModal');
    const faqClose = document.getElementById('faqClose');
    faqBtn.onclick = () => { faqModal.style.display = "flex"; };
    faqClose.onclick = () => { faqModal.style.display = "none"; };
    faqModal.onclick = (e) => { if(e.target===faqModal) faqModal.style.display="none"; };
});