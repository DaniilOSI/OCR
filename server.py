from flask import Flask, render_template, request, send_file, after_this_request, jsonify, RequestEntityTooLarge
import os
import uuid
import ocrmypdf
from zipfile import ZipFile
from werkzeug.utils import secure_filename
from PIL import Image
import fitz  # PyMuPDF

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 40 * 1024 * 1024  # 40 МБ на всё

UPLOAD_FOLDER = "uploads"
OUTPUT_FOLDER = "output"
ALLOWED_EXTENSIONS = {'pdf', 'jpg', 'jpeg', 'png', 'tif', 'tiff'}
ALLOWED_MIMES = {
    "application/pdf", "image/jpeg", "image/png", "image/tiff"
}
MAX_FILES = 10

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

@app.errorhandler(RequestEntityTooLarge)
def file_too_large(e):
    return 'Файл слишком большой (максимум 40 МБ на один запрос)', 413

def allowed_file(filename, content_type):
    ext_ok = '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS
    type_ok = content_type in ALLOWED_MIMES
    return ext_ok and type_ok

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/upload", methods=["POST"])
def upload_file():
    uploaded_files = request.files.getlist("file")
    if not uploaded_files:
        return jsonify({"error": "Нет файлов"}), 400
    if len(uploaded_files) > MAX_FILES:
        return jsonify({"error": f"Слишком много файлов (максимум {MAX_FILES} за раз)."}), 400

    zip_mode = request.form.get("zip") == "1"
    lang = request.form.get("lang", "rus+eng")
    formats = request.form.get("formats", "pdf").split(",")

    output_files = []
    input_files = []
    txt_files = []
    errors = []

    def convert_image_to_pdf(img_path, pdf_path):
        try:
            im = Image.open(img_path)
            # конвертируем все страницы TIFF/JPEG если надо
            if getattr(im, "n_frames", 1) > 1:
                imgs = []
                for i in range(im.n_frames):
                    im.seek(i)
                    imgs.append(im.copy().convert('RGB'))
                imgs[0].save(pdf_path, save_all=True, append_images=imgs[1:], format="PDF")
            else:
                im.convert('RGB').save(pdf_path, "PDF")
        except Exception as ex:
            raise Exception("Ошибка при преобразовании в PDF: " + str(ex))

    for f in uploaded_files:
        # проверка по имени и MIME
        if not allowed_file(f.filename, f.content_type):
            errors.append(f"{f.filename}: файл не поддерживается")
            continue
        orig_ext = os.path.splitext(f.filename)[1].lower()
        unique_name = str(uuid.uuid4()) + orig_ext
        input_path = os.path.join(UPLOAD_FOLDER, unique_name)
        f.save(input_path)
        input_files.append(input_path)

        ocr_input_path = input_path
        # преобразуем картинку в PDF
        if orig_ext not in [".pdf"]:
            ocr_input_path = input_path.replace(orig_ext, ".pdf")
            try:
                convert_image_to_pdf(input_path, ocr_input_path)
            except Exception as ex:
                errors.append(f"{f.filename}: {str(ex)}")
                continue

        output_path = os.path.join(OUTPUT_FOLDER, "ocr_" + unique_name.replace(orig_ext, ".pdf"))
        try:
            # Timeout защиты от висящих OCR
            ocrmypdf.ocr(ocr_input_path, output_path, force_ocr=True, language=lang, timeout=300)
            output_files.append((f.filename, output_path))
        except Exception as e:
            errors.append(f"{f.filename}: {str(e)}")
            print(f"Ошибка OCR для {f.filename}: {e}")
            continue

        if 'txt' in formats:
            txt_path = os.path.splitext(output_path)[0] + ".txt"
            try:
                doc = fitz.open(output_path)
                full = ""
                for page in doc:
                    full += page.get_text("text")
                with open(txt_path, "w", encoding="utf-8") as out_txt:
                    out_txt.write(full)
                txt_files.append((f.filename, txt_path))
            except Exception as e:
                print(f"Ошибка TXT для {f.filename}: {e}")

    if not output_files:
        for path in input_files:
            try: os.remove(path)
            except: pass
        return jsonify({"error": "OCR не сработал ни с одним файлом", "details": errors}), 500

    zip_path = None

    @after_this_request
    def cleanup(response):
        try:
            for _, path in output_files:
                if os.path.exists(path):
                    os.remove(path)
            for path in input_files:
                if os.path.exists(path):
                    os.remove(path)
            for _, path in txt_files:
                if os.path.exists(path):
                    os.remove(path)
            if zip_path and os.path.exists(zip_path):
                os.remove(zip_path)
        except Exception as e:
            print("Ошибка удаления файлов:", e)
        return response

    # Всегда архив, если явно выбран ZIP, если несколько файлов, или оба формата
    if zip_mode or len(output_files) > 1 or (('pdf' in formats) and ('txt' in formats)):
        zip_path = os.path.join(OUTPUT_FOLDER, f"ocr_{uuid.uuid4()}.zip")
        with ZipFile(zip_path, 'w') as zipf:
            for orig_name, path in output_files:
                if 'pdf' in formats:
                    zipf.write(path, f"ocr_{orig_name.rsplit('.',1)[0]}.pdf")
            if 'txt' in formats:
                for orig_name, txt_path in txt_files:
                    zipf.write(txt_path, f"ocr_{orig_name.rsplit('.',1)[0]}.txt")
        return send_file(zip_path, as_attachment=True, download_name="ocr_files.zip")

    # Только TXT (один файл) — zip с .txt
    pdf_path = output_files[0][1]
    if 'txt' in formats and not 'pdf' in formats:
        txt_path = os.path.splitext(pdf_path)[0] + ".txt"
        zip_path = os.path.join(OUTPUT_FOLDER, f"ocr_{uuid.uuid4()}.zip")
        with ZipFile(zip_path, 'w') as zipf:
            zipf.write(txt_path, f"ocr_{output_files[0][0].rsplit('.',1)[0]}.txt")
        return send_file(zip_path, as_attachment=True, download_name=f"ocr_{output_files[0][0].rsplit('.',1)[0]}.zip")
    else:
        # Только PDF (один файл)
        return send_file(pdf_path, as_attachment=True, download_name=f"ocr_{output_files[0][0]}")

if __name__ == "__main__":
    app.run(debug=True, port=5000)