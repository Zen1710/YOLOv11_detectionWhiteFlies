# Deteksi Kutu Kebul (Whiteflies) dengan YOLOv11

Aplikasi web untuk mendeteksi dan menghitung **kutu kebul (whiteflies)** pada tanaman labu-labuan, langsung di browser. Model YOLO11n dilatih dengan Ultralytics, lalu diekspor ke TensorFlow.js sehingga inferensi berjalan sepenuhnya di sisi klien: tanpa server dan tanpa mengunggah gambar ke mana pun.

Selain jumlah kutu kebul, aplikasi juga memberi **kategori risiko serangan** berdasarkan jumlah objek yang terdeteksi.

**Live demo:** https://zen1710.github.io/YOLOv11_detectionWhiteFlies/

## Fitur

- **Webcam realtime**: deteksi langsung dari kamera (kamera belakang di HP), inferensi tiap ~150 ms.
- **Unggah gambar**: deteksi dari file gambar.
- **Statistik hasil**: total deteksi, rata-rata confidence, jumlah deteksi per kelas.
- **Kategori risiko**:

  | Jumlah deteksi | Kategori |
  | --- | --- |
  | 0 | Tidak Ada Deteksi |
  | 1–2 | Sangat Rendah |
  | 3–5 | Rendah–Sedang |
  | 6–20 | Sedang |
  | 21–50 | Tinggi |
  | > 50 | Sangat Tinggi / Krisis |

## Kelas yang dideteksi

Model mengenali 6 kelas: 5 tanaman inang dan kutu kebulnya.

| ID | Kelas |
| --- | --- |
| 0 | Cucumis melo (Melon) |
| 1 | Cucumis sativus (Mentimun) |
| 2 | Lagenaria siceraria (Labu Air) |
| 3 | Luffa acutangula (Gambas) |
| 4 | Momordica charantia (Pare) |
| 5 | Whiteflies (Kutu Kebul) |

## Tech stack

- **Training**: Python 3.12, [Ultralytics](https://docs.ultralytics.com) 8.3.139 (YOLO11n), Roboflow, OpenCV, Jupyter.
- **Web app**: HTML/CSS/JavaScript tanpa build step, [TensorFlow.js](https://www.tensorflow.org/js) (backend WASM), Bootstrap 5, SweetAlert2, anime.js, Font Awesome.

## Struktur project

```
.
├── index.html                          # Halaman utama web app
├── script.js                           # Load model, inferensi, gambar bounding box, statistik
├── style.css                           # Styling tambahan
├── model.json                          # Model YOLO11n format TF.js (graph model)
├── group1-shard{1,2,3}of3.bin          # Bobot model TF.js
├── labels.json                         # Daftar nama kelas (dibaca script.js)
├── metadata.yaml                       # Metadata ekspor dari Ultralytics
├── Whiteflies jupyter NOTEBOOK.ipynb   # Notebook training (dataset → train → uji → ekspor)
└── Sumber Dataset Whiteflies.txt       # Link sumber dataset
```

## Cara menjalankan web app

Web app harus dibuka lewat HTTP server, bukan dengan double-click `index.html`, karena `model.json` dan `labels.json` dimuat dengan `fetch` (diblokir di `file://`).

1. Clone repo:

   ```bash
   git clone https://github.com/Zen1710/YOLOv11_detectionWhiteFlies.git
   cd YOLOv11_detectionWhiteFlies
   ```

2. Jalankan static server, pilih salah satu:

   ```bash
   # Python
   python3 -m http.server 8000

   # atau Node.js
   npx serve -l 8000 .
   ```

3. Buka `http://localhost:8000` di browser. Tunggu notifikasi **"Model Siap!"**, lalu pilih tab **Webcam Realtime** atau **Unggah Gambar**.

> Akses webcam hanya diizinkan browser di `localhost` atau lewat HTTPS. Kalau di-deploy (mis. GitHub Pages), pastikan pakai HTTPS.

Butuh koneksi internet saat pertama kali dibuka, karena library (TF.js, Bootstrap, dll.) dimuat dari CDN.

## Melatih ulang model

Notebook `Whiteflies jupyter NOTEBOOK.ipynb` berisi seluruh pipeline: instal dependensi, unduh dataset dari Roboflow, validasi anotasi secara visual, training, uji inferensi, dan ekspor artefak (`best.pt`, `data.yaml`, `labels.json`). Notebook ini awalnya dijalankan di server JupyterLab dengan GPU.

1. Siapkan environment dan buka notebook:

   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   pip install jupyterlab ultralytics==8.3.139 roboflow opencv-python Pillow numpy tqdm pyyaml matplotlib
   ```

2. Set API key Roboflow sebagai environment variable (jangan ditulis langsung di notebook), lalu jalankan Jupyter:

   ```bash
   export ROBOFLOW_API_KEY="api-key-roboflow-kamu"
   jupyter lab
   ```

3. Di sel training, ubah `BASE_NOTEBOOKS_DIR` ke folder kerja di mesin kamu, lalu jalankan sel dari atas ke bawah.

Konfigurasi training yang dipakai:

| Parameter | Nilai |
| --- | --- |
| Base model | `yolo11n.pt` (pretrained COCO) |
| Epochs | 150 (early stopping, patience 50) |
| Image size | 640 × 640 |
| Optimizer | AdamW |
| Dataset | 2.824 gambar train, 339 gambar validasi (3.432 objek) |

Pada log yang tersimpan di notebook, mAP50 validasi mencapai sekitar 0,85 dan mAP50-95 sekitar 0,70 di epoch ke-49. Log berhenti di epoch 51, jadi angka ini belum hasil akhir. Model di web app berasal dari run lain (`WhiteFlies_4`, lihat `metadata.yaml`).

### Ekspor ke TensorFlow.js

Setelah dapat `best.pt`, ekspor ke format TF.js lalu salin hasilnya (`model.json`, file `*.bin`, `metadata.yaml`) ke root project:

```bash
yolo export model=best.pt format=tfjs imgsz=640
```

Kalau kelasnya berubah, perbarui juga `labels.json` (urutannya harus sama dengan `names` di `data.yaml`).

## Dataset

Dataset dianotasi dan dikelola di Roboflow, dengan sumber gambar dari:

- [Cassava Healthy & Whitefly Classification (Kaggle)](https://www.kaggle.com/datasets/mahmoudreda55/cassava-healthy-whitefly-classification)
- [Whiteflies (Roboflow Universe)](https://universe.roboflow.com/brocode-2ih4l/whiteflies-n4w73)

## Catatan dan keterbatasan

- Model diekspor tanpa NMS (`nms: false`) dan `script.js` belum menerapkan NMS, sehingga satu objek bisa terhitung lebih dari sekali dan total deteksi bisa lebih besar dari jumlah sebenarnya.
- Angka "Total Kutu Kebul" dan kategori risiko menghitung semua deteksi di atas threshold 0,25, termasuk kelas tanaman, bukan hanya kelas `Whiteflies`.
- Gambar di-resize langsung ke 640 × 640 tanpa letterbox, jadi gambar yang sangat lebar atau tinggi bisa menurunkan akurasi.

## Lisensi

Model dilatih dengan Ultralytics YOLO yang berlisensi [AGPL-3.0](https://ultralytics.com/license).
