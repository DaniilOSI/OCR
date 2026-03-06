document.addEventListener('DOMContentLoaded', function () {
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

    // Pop-up
    const formatPopup = document.getElementById('formatPopup');
    const formatForm = document.getElementById('formatForm');
    const formatCancel = document.getElementById('formatCancel');

    let files = [];
    let showAll = false;
    let isProcessing = false;
    let selectedFormats = ['pdf'];
    let archiveMode = false;

    dropzone.addEventListener("click", () => fileInput.click());

    fileInput.addEventListener("change", (e) => {
        const allowedTypes = [
            "application/pdf", "image/jpeg", "image/png", "image/tiff"
        ];
        const newFiles = Array.from(e.target.files).filter(f =>
            allowedTypes.includes(f.type) ||
            (f.name && /\.(pdf|jpg|jpeg|png|tif|tiff)$/i.test(f.name))
        );
        if (newFiles.length < e.target.files.length) {
            alert("Некоторые файлы имеют неподдерживаемый формат и были пропущены");
        }
        addFiles(newFiles);
        fileInput.value = "";
    });

    dropzone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropzone.classList.add("drag-over");
    });

    dropzone.addEventListener("dragleave", (e) => {
        e.preventDefault();
        dropzone.classList.remove("drag-over");
    });

    dropzone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropzone.classList.remove("drag-over");
        const allowedTypes = [
            "application/pdf", "image/jpeg", "image/png", "image/tiff"
        ];
        const newFiles = Array.from(e.dataTransfer.files).filter(f =>
            allowedTypes.includes(f.type) ||
            (f.name && /\.(pdf|jpg|jpeg|png|tif|tiff)$/i.test(f.name))
        );
        if (newFiles.length < e.dataTransfer.files.length) {
            alert("Некоторые файлы имеют неподдерживаемый формат и были пропущены");
        }
        addFiles(newFiles);
    });

    showMoreBtn.addEventListener("click", () => {
        showAll = !showAll;
        renderFileList();
    });

    clearBtn.addEventListener("click", () => {
        if (confirm("Удалить все файлы из списка?")) {
            files = [];
            showAll = false;
            renderFileList();
        }
    });

    // Pop-up
    startBtn.addEventListener("click", openFormatPopup);
    formatCancel.onclick = function () {
        formatPopup.style.display = "none";
    };
    formatForm.onsubmit = function (e) {
        e.preventDefault();
        selectedFormats = Array.from(formatForm.querySelectorAll('input[name="fmt"]:checked')).map(cb => cb.value);
        if (selectedFormats.length === 0) {
            alert("Выберите хотя бы один формат (PDF или TXT)");
            return;
        }
        archiveMode = !!formatForm.querySelector('input[name="archive"]:checked');
        formatPopup.style.display = "none";
        handleUpload();
    };

    function openFormatPopup() {
        // PDF по умолчанию, TXT выключен, архив выключен
        Array.from(formatForm.querySelectorAll('input[name="fmt"]')).forEach(cb => {
            if (cb.value === 'pdf') cb.checked = true;
            if (cb.value === 'txt') cb.checked = false;
        });
        formatForm.querySelector('input[name="archive"]').checked = false;
        formatPopup.style.display = "flex";
    }

    function addFiles(newFiles) {
        newFiles.forEach(f => {
            if (!files.find(file => file.name === f.name)) {
                files.push(f);
            }
        });
        renderFileList();
    }

    function removeFile(index) {
        files.splice(index, 1);
        renderFileList();
    }

    function renderFileList() {
        fileList.innerHTML = "";
        const displayFiles = showAll ? files : files.slice(0, 6);

        displayFiles.forEach((f) => {
            const li = document.createElement("li");
            const removeBtn = document.createElement("button");
            removeBtn.className = "remove-btn";
            removeBtn.textContent = "✕";
            removeBtn.disabled = isProcessing;
            removeBtn.onclick = () => removeFile(files.indexOf(f));

            const span = document.createElement("span");
            span.textContent = f.name;

            li.appendChild(span);
            li.appendChild(removeBtn);
            fileList.appendChild(li);
        });

        const count = files.length;
        document.getElementById("fileCount").innerText = `(${count} файл${getFileSuffix(count)} добавлено)`;
        showMoreBtn.style.display = files.length > 6 ? "inline-block" : "none";
        showMoreBtn.innerText = showAll ? "Скрыть" : `Показать все (${files.length})`;
        clearBtn.style.display = files.length > 0 ? "inline-block" : "none";
    }

    function getFileSuffix(count) {
        if (count === 1) return '';
        if (count < 5) return 'а';
        return 'ов';
    }

    function updateProgress(current, total) {
        const percent = Math.round((current / total) * 100);
        progressBar.style.width = percent + "%";
        progressText.innerText = `${percent}% (${current}/${total})`;
    }

    function getSelectedLangs() {
        const langs = Array.from(document.querySelectorAll('.ocrLang:checked')).map(cb => cb.value);
        return langs.length ? langs.join('+') : 'rus+eng';
    }

    async function handleUpload() {
        if (files.length === 0) {
            alert("Выберите хотя бы один файл");
            return;
        }
        if (isProcessing) return;

        isProcessing = true;
        startBtn.disabled = true;
        clearBtn.disabled = true;
        status.innerText = "";
        progressContainer.style.display = "block";
        try {
            // Теперь архив не зависит от количества файлов, а только от archiveMode
            if (archiveMode || files.length > 1) {
                await handleZipUpload();
            } else {
                await handleSingleUpload();
            }
            setTimeout(() => {
                files = [];
                showAll = false;
                renderFileList();
                progressContainer.style.display = "none";
            }, 3000);
        } catch (error) {
            status.innerHTML = `❌ Ошибка: ${error.message}`;
            progressContainer.style.display = "none";
        } finally {
            isProcessing = false;
            startBtn.disabled = false;
            clearBtn.disabled = false;
        }
    }

    async function handleZipUpload() {
        status.innerText = "Создание архива...";
        updateProgress(0, 1);
        const formData = new FormData();
        files.forEach(f => formData.append("file", f));
        formData.append("lang", getSelectedLangs());
        formData.append("formats", selectedFormats.join(','));
        formData.append("zip", "1");

        const response = await fetch("/upload", { method: "POST", body: formData });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || "Ошибка OCR");
        }
        const blob = await response.blob();
        downloadBlob(blob, `ocr_files_${Date.now()}.zip`);
        updateProgress(1, 1);
        status.innerHTML = "✅ Готово! Архив скачан.";
    }

    async function handleSingleUpload() {
        let successCount = 0;
        let errorCount = 0;
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            status.innerText = `Обработка ${file.name}...`;
            updateProgress(i, files.length);

            const formData = new FormData();
            formData.append("file", file);
            formData.append("lang", getSelectedLangs());
            formData.append("formats", selectedFormats.join(','));

            try {
                const response = await fetch("/upload", { method: "POST", body: formData });
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    console.error(`Ошибка с ${file.name}:`, errorData);
                    errorCount++;
                    continue;
                }
                const contentDisposition = response.headers.get('Content-Disposition') || '';
                const isZip = contentDisposition.includes('.zip');
                const ext = selectedFormats.includes('txt') && !selectedFormats.includes('pdf') ? '.txt.zip' : '.pdf';
                const blob = await response.blob();
                const filename = isZip ? `ocr_${file.name.replace(/\.[^.]+$/, "")}_files.zip` : `ocr_${file.name.replace(/\.[^.]+$/, "")}${ext}`;
                downloadBlob(blob, filename);
                successCount++;
            } catch (err) {
                console.error(`Ошибка сети с ${file.name}:`, err);
                errorCount++;
            }
        }
        updateProgress(files.length, files.length);

        if (errorCount > 0) {
            status.innerHTML = `⚠️ Готово с ошибками: ${successCount} успешно, ${errorCount} с ошибками`;
        } else {
            status.innerHTML = `✅ Готово! Все ${successCount} файлов обработаны.`;
        }
    }

    function downloadBlob(blob, filename) {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        window.URL.revokeObjectURL(url);
    }
});