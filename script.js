document.addEventListener("DOMContentLoaded", async () => {
  // Referensi Elemen DOM
  const webcamElement = document.getElementById("webcam");
  const canvasElement = document.getElementById("canvas");
  const webcamButton = document.getElementById("webcamButton");
  const imageUpload = document.getElementById("imageUpload");
  const displayContainer = document.getElementById("displayContainer");
  const statsContainer = document.getElementById("statsContainer");
  const detectionCountElem = document.getElementById("detectionCount");
  const avgConfidenceElem = document.getElementById("avgConfidence"); // Corrected ID
  const objectDetectionStatsElem = document.getElementById(
    "objectDetectionStats"
  );
  const riskCategoryElem = document.getElementById("riskCategory");
  const riskIconElem = riskCategoryElem.parentElement.querySelector("i");
  const canvasCtx = canvasElement.getContext("2d");

  // Label dari metadata
  let labels = {};
  let model;
  let streamActive = false;

  // Variabel untuk kontrol loop
  let animationFrameId;
  let latestDetections = [];
  let detectionTimeoutId;

  // Fungsi untuk memuat labels.json
  async function loadLabels() {
    try {
      const response = await fetch("labels.json");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      labels = data.labels.reduce((obj, item, index) => {
        obj[index] = item;
        return obj;
      }, {});
      console.log("Labels loaded:", labels);
    } catch (error) {
      console.error("Gagal memuat labels.json:", error);
      Swal.fire({
        icon: "error",
        title: "Oops... Gagal Memuat Label",
        text: "Terjadi kesalahan saat memuat file label. Silakan muat ulang halaman.",
      });
    }
  }

  // Fungsi untuk memuat model dengan notifikasi SweetAlert
  async function loadModel() {
    Swal.fire({
      title: "Memuat Model AI",
      html: "Mohon tunggu, model sedang disiapkan...",
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });

    try {
      await tf.setBackend("wasm");
      // Pakai "./": tanpa itu TF.js memuat file .bin dari root domain, bukan dari folder halaman (404 di GitHub Pages)
      model = await tf.loadGraphModel("./model.json");
      tf.tidy(() => {
        model.predict(tf.zeros([1, 640, 640, 3]));
      });
      Swal.fire({
        icon: "success",
        title: "Model Siap!",
        text: "Model AI berhasil dimuat dan siap digunakan.",
        timer: 2000,
        showConfirmButton: false,
      });
    } catch (err) {
      console.error("Gagal memuat model:", err);
      Swal.fire({
        icon: "error",
        title: "Oops... Gagal Memuat Model",
        text: "Terjadi kesalahan saat menyiapkan model AI. Silakan muat ulang halaman.",
      });
    }
  }

  await loadLabels();
  await loadModel();

  webcamButton.onclick = () => {
    if (streamActive) {
      stopWebcam();
    } else {
      startWebcam();
    }
  };

  imageUpload.onchange = (event) => {
    const file = event.target.files[0];
    if (file) {
      stopWebcam();
      resetUI();
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          displayContainer.style.width = "100%";
          displayContainer.style.display = "block";
          const aspectRatio = img.width / img.height;
          displayContainer.style.height = `${
            displayContainer.offsetWidth / aspectRatio
          }px`;
          canvasElement.width = img.width;
          canvasElement.height = img.height;
          runDetection(img, "image");
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  };

  async function startWebcam() {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: "environment" },
        });
        window.stream = stream;
        webcamElement.srcObject = stream;
        displayContainer.style.width = "100%";
        displayContainer.style.display = "block";
        webcamElement.style.display = "block";
        webcamElement.onloadedmetadata = () => {
          const videoAspectRatio =
            webcamElement.videoWidth / webcamElement.videoHeight;
          displayContainer.style.height = `${
            displayContainer.offsetWidth / videoAspectRatio
          }px`;
          canvasElement.width = webcamElement.videoWidth;
          canvasElement.height = webcamElement.videoHeight;
          streamActive = true;
          webcamButton.innerHTML =
            '<i class="fas fa-stop me-2"></i>Hentikan Webcam';
          webcamButton.classList.remove("btn-primary");
          webcamButton.classList.add("btn-danger");
          renderLoop();
          runDetection(webcamElement, "video");
        };
      } catch (error) {
        console.error("Error mengakses webcam:", error);
        Swal.fire(
          "Error",
          "Tidak dapat mengakses webcam. Pastikan Anda memberikan izin.",
          "error"
        );
      }
    } else {
      Swal.fire(
        "Error",
        "Fitur webcam tidak didukung oleh browser Anda.",
        "error"
      );
    }
  }

  function stopWebcam() {
    if (window.stream) {
      window.stream.getTracks().forEach((track) => track.stop());
    }
    cancelAnimationFrame(animationFrameId);
    clearTimeout(detectionTimeoutId);
    streamActive = false;
    latestDetections = [];
    webcamButton.innerHTML = '<i class="fas fa-play me-2"></i>Mulai Webcam';
    webcamButton.classList.remove("btn-danger");
    webcamButton.classList.add("btn-primary");
    resetUI();
  }

  function resetUI() {
    displayContainer.style.display = "none";
    statsContainer.style.display = "none";
    statsContainer.style.opacity = "0";
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    webcamElement.style.display = "none";
    if (objectDetectionStatsElem) {
      objectDetectionStatsElem.innerHTML = "";
      objectDetectionStatsElem.style.display = "none";
      objectDetectionStatsElem.style.opacity = "0";
    }
  }
  
  function getRiskInfo(count) {
    let risk = {
      text: "Tidak Ada Deteksi",
      colorClass: "text-secondary",
      iconClass: "fa-shield-alt",
    };

    if (count > 0 && count <= 2) {
      risk = { text: "Sangat Rendah", colorClass: "text-success", iconClass: "fa-shield-alt" };
    } else if (count >= 3 && count <= 5) {
      risk = { text: "Rendah–Sedang", colorClass: "text-info", iconClass: "fa-shield-alt" };
    } else if (count >= 6 && count <= 20) {
      risk = { text: "Sedang", colorClass: "text-primary", iconClass: "fa-shield-alt" };
    } else if (count >= 21 && count <= 50) {
      risk = { text: "Tinggi", colorClass: "text-warning", iconClass: "fa-triangle-exclamation" };
    } else if (count > 50) {
      // Menggabungkan >50 dan 100 dari tabel ke kategori yang sama
      risk = { text: "Sangat Tinggi / Krisis", colorClass: "text-danger", iconClass: "fa-skull-crossbones" };
    }
    return risk;
  }

  function renderLoop() {
    if (!streamActive) return;
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(
      webcamElement,
      0,
      0,
      canvasElement.width,
      canvasElement.height
    );
    latestDetections.forEach((detection) => {
      drawBoundingBox(
        detection.x,
        detection.y,
        detection.width,
        detection.height,
        detection.klass,
        detection.score
      );
    });
    animationFrameId = requestAnimationFrame(renderLoop);
  }

  async function runDetection(source, type) {
    if (!model) return;
    if (type === "video" && !streamActive) return;

    tf.engine().startScope();
    const [modelWidth, modelHeight] = model.inputs[0].shape.slice(1, 3);
    // Letterbox: tambah padding abu-abu (114, seperti saat training) di kanan dan
    // bawah sampai persegi, baru di-resize, supaya gambar tidak gepeng.
    const input = tf.tidy(() => {
      const img = tf.browser.fromPixels(source);
      const [height, width] = img.shape.slice(0, 2);
      const size = Math.max(width, height);
      const padded = img.pad(
        [
          [0, size - height],
          [0, size - width],
          [0, 0],
        ],
        114
      );
      return tf.image
        .resizeBilinear(padded, [modelHeight, modelWidth])
        .div(255.0)
        .expandDims(0);
    });

    try {
      const res = model.execute(input);
      processDetections(res, source, type);
      res.dispose();
    } catch (err) {
      console.error("Error saat inferensi: ", err);
    }

    tf.engine().endScope();

    if (type === "video" && streamActive) {
      detectionTimeoutId = setTimeout(() => runDetection(source, type), 150);
    }
  }

  // Intersection over Union: luas irisan dua kotak dibagi luas gabungannya.
  function iou(a, b) {
    const overlapWidth =
      Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
    const overlapHeight =
      Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
    if (overlapWidth <= 0 || overlapHeight <= 0) return 0;
    const intersection = overlapWidth * overlapHeight;
    const union = a.width * a.height + b.width * b.height - intersection;
    return union > 0 ? intersection / union : 0;
  }

  // Non-Maximum Suppression per kelas: ambil kotak dengan skor tertinggi, lalu
  // buang kotak sekelas yang tumpang tindih dengannya melebihi iouThreshold.
  function nonMaxSuppression(detections, iouThreshold) {
    const sorted = [...detections].sort((a, b) => b.score - a.score);
    const kept = [];
    for (const candidate of sorted) {
      const duplicate = kept.some(
        (box) =>
          box.klass === candidate.klass && iou(box, candidate) > iouThreshold
      );
      if (!duplicate) kept.push(candidate);
    }
    return kept;
  }

  function processDetections(res, source, type) {
    const transposed = res.transpose([0, 2, 1]);
    const data = transposed.dataSync();
    transposed.dispose();

    const numClasses = Object.keys(labels).length;
    const stride = 4 + numClasses;

    if (data.length % stride !== 0) {
      console.warn(
        "Panjang data output model tidak sesuai dengan stride yang diharapkan. Periksa format output model."
      );
      return;
    }

    const detections = [];
    let detectionCount = 0;
    let totalConfidence = 0;
    let classCounts = {};
    for (const key in labels) {
      classCounts[labels[key]] = 0;
    }

    for (let i = 0; i < data.length; i += stride) {
      const [cx, cy, w, h, ...classScores] = data.slice(i, i + stride);

      let maxClassScore = 0;
      let detectedClassId = -1;

      for (let j = 0; j < numClasses; j++) {
        if (classScores[j] > maxClassScore) {
          maxClassScore = classScores[j];
          detectedClassId = j;
        }
      }

      const finalScore = maxClassScore;
      if (finalScore < 0.25) continue;

      const klass = labels[detectedClassId];
      if (!klass) continue;

      const x1 = cx - w / 2;
      const y1 = cy - h / 2;

      const sourceWidth = type === "image" ? source.width : source.videoWidth;
      const sourceHeight =
        type === "image" ? source.height : source.videoHeight;
      // Input di-letterbox dari persegi sisi terpanjang, jadi skalanya sama di
      // kedua sumbu dan padding di kanan/bawah tidak menggeser koordinat.
      const scale = Math.max(sourceWidth, sourceHeight) / 640;
      const x1_scaled = x1 * scale;
      const y1_scaled = y1 * scale;
      const w_scaled = w * scale;
      const h_scaled = h * scale;

      detections.push({
        x: x1_scaled,
        y: y1_scaled,
        width: w_scaled,
        height: h_scaled,
        klass,
        score: finalScore,
      });
    }

    // Model mengeluarkan banyak kotak untuk objek yang sama, jadi kotak yang
    // tumpang tindih dibuang dulu supaya satu objek hanya dihitung sekali.
    const kept = nonMaxSuppression(detections, 0.45);
    for (const detection of kept) {
      classCounts[detection.klass] = (classCounts[detection.klass] || 0) + 1;
      // Total, rata-rata kepercayaan, dan kategori risiko hanya untuk kutu kebul;
      // daun tanaman tetap muncul di statistik per kelas.
      if (detection.klass !== "Whiteflies") continue;
      detectionCount++;
      totalConfidence += detection.score;
    }

    latestDetections = kept;
    updateStats(detectionCount, totalConfidence);
    updateObjectStats(classCounts);

    if (type === "image") {
      canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
      canvasCtx.drawImage(
        source,
        0,
        0,
        canvasElement.width,
        canvasElement.height
      );
      latestDetections.forEach((d) =>
        drawBoundingBox(d.x, d.y, d.width, d.height, d.klass, d.score)
      );
    }
  }

  function updateStats(count, totalConfidence) {
    if (statsContainer.style.display === "none") {
      statsContainer.style.display = "block";
      anime({
        targets: statsContainer,
        opacity: [0, 1],
        translateY: [20, 0],
        duration: 800,
        easing: "easeOutCubic",
      });
    }
    const avgConfidence = count > 0 ? (totalConfidence / count) * 100 : 0;
    anime({
      targets: detectionCountElem,
      innerHTML: count,
      round: 1,
      duration: 500,
      easing: "easeOutCubic",
    });
    anime({
      targets: avgConfidenceElem,
      innerHTML: avgConfidence.toFixed(1) + "%",
      duration: 500,
      easing: "easeOutCubic",
    });
    
    // Logika baru untuk memperbarui Kategori Risiko
    const riskInfo = getRiskInfo(count);
    
    riskCategoryElem.textContent = riskInfo.text;
    
    riskCategoryElem.classList.remove("text-secondary", "text-success", "text-info", "text-primary", "text-warning", "text-danger");
    riskIconElem.classList.remove("fa-shield-alt", "fa-triangle-exclamation", "fa-skull-crossbones");

    riskCategoryElem.classList.add(riskInfo.colorClass);
    riskIconElem.className = `fas ${riskInfo.iconClass} fa-3x mb-3`;
    riskIconElem.classList.add(riskInfo.colorClass);
  }

  function updateObjectStats(classCounts) {
    if (!objectDetectionStatsElem) return;
    objectDetectionStatsElem.innerHTML = "";
    let hasDetections = false;
    for (const klass in classCounts) {
      if (classCounts[klass] > 0) {
        hasDetections = true;
        const statItem = document.createElement("div");
        statItem.className = "col-md-6 col-lg-4";
        statItem.innerHTML = `
                    <div class="stat-item card shadow-sm text-center p-3 h-100 border-0">
                        <div class="card-body">
                            <h3 class="h5">${klass.replace(/_/g, " ")}</h3>
                            <p class="display-4 fw-bold text-info mb-0">${
                              classCounts[klass]
                            }</p>
                        </div>
                    </div>
                `;
        objectDetectionStatsElem.appendChild(statItem);
      }
    }
    if (!hasDetections) {
      objectDetectionStatsElem.innerHTML = `
                <div class="col-12 text-center text-muted p-3">
                    <p>Tidak ada objek terdeteksi untuk label lain.</p>
                </div>
            `;
    }
    if (
      objectDetectionStatsElem.style.display === "none" ||
      objectDetectionStatsElem.style.opacity === "0"
    ) {
      objectDetectionStatsElem.style.display = "flex";
      anime({
        targets: objectDetectionStatsElem,
        opacity: [0, 1],
        translateY: [20, 0],
        duration: 800,
        easing: "easeOutCubic",
      });
    }
  }

  function drawBoundingBox(x, y, width, height, klass, score) {
    canvasCtx.strokeStyle = "#0d6efd";
    canvasCtx.lineWidth = 4;
    canvasCtx.strokeRect(x, y, width, height);
    canvasCtx.fillStyle = "#0d6efd";
    const text = `${klass} | ${(score * 100).toFixed(1)}%`;
    canvasCtx.font = "18px 'Poppins'";
    const textWidth = canvasCtx.measureText(text).width;
    const textHeight = 24;
    canvasCtx.fillRect(x, y - textHeight, textWidth + 10, textHeight);
    canvasCtx.fillStyle = "#ffffff";
    canvasCtx.fillText(text, x + 5, y - 5);
  }
});