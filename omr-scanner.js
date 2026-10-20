/* ================= omr-scanner.js =================
   नवोदय OMR शीट प्रत्यक्ष कॅमेरा डिटेक्शन व पिक्सेल रिडिंग
   ==================================================== */

let omrDetectionInterval = null;
let omrConsecutiveStableFrames = 0;
let isAutoCaptured = false;

function openOmrScannerModal(stdId, stdName) {
  CURRENT_SCANNING_STUDENT_ID = stdId;
  const testNo = document.getElementById('entry-test-no').value;
  const savedKey = NAVODAYA_ANSWER_KEYS_STORE[`test_${testNo}`];

  if (!savedKey || Object.keys(savedKey).length === 0) {
    showCustomAlert(`शिक्षणाधिकारी कक्षातून अद्याप या चाचणीची अधिकृत नवोदय Answer Key फीड केलेली नाही! Answer Key फीड केल्यानंतरच OMR स्कॅनिंग करता येईल.`);
    return;
  }

  document.getElementById('omr-scanning-student-label').innerHTML = `विद्यार्थी: <span style="color:#0284c7; font-weight:800;">${stdName}</span>`;
  document.getElementById('omr-summary-display-card').style.display = 'none';
  
  const captureBtn = document.getElementById('btn-capture-omr');
  captureBtn.removeAttribute('data-state');
  captureBtn.innerHTML = `<i class="fa-solid fa-camera"></i> OMR कडे कॅमेरा धरा`;
  captureBtn.style.opacity = '0.65';
  captureBtn.disabled = true;

  const pBox = document.getElementById('omr-portrait-box');
  pBox.classList.remove('detected-green');
  document.getElementById('omr-live-status-pill').innerText = "❌ OMR शीट दिसत नाही";
  
  document.getElementById('omrCameraModal').style.display = 'flex';

  const video = document.getElementById('omr-video-stream');
  const placeholder = document.getElementById('omr-camera-placeholder');
  isAutoCaptured = false;
  omrConsecutiveStableFrames = 0;

  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ 
      video: { facingMode: "environment" } 
    }).then(stream => {
      cameraMediaStream = stream;
      video.srcObject = stream;
      video.style.display = 'block';
      placeholder.style.display = 'none';

      clearInterval(omrDetectionInterval);
      omrDetectionInterval = setInterval(checkLiveOmrPatternInFrame, 160);
    }).catch(err => {
      console.warn("कॅमेरा सुरू होऊ शकला नाही:", err);
      video.style.display = 'none';
      placeholder.style.display = 'block';
    });
  }
}

function closeOmrScanner() {
  clearInterval(omrDetectionInterval);
  omrDetectionInterval = null;
  if (cameraMediaStream) {
    cameraMediaStream.getTracks().forEach(track => track.stop());
    cameraMediaStream = null;
  }
  document.getElementById('omrCameraModal').style.display = 'none';
  CURRENT_SCANNING_STUDENT_ID = null;
  isAutoCaptured = false;
}

function checkLiveOmrPatternInFrame() {
  if (isAutoCaptured) return;
  const video = document.getElementById('omr-video-stream');
  if (!video || video.readyState !== 4) return;

  const canvas = document.getElementById('omr-hidden-canvas');
  const ctx = canvas.getContext('2d');
  const vWidth = video.videoWidth || 640;
  const vHeight = video.videoHeight || 480;
  canvas.width = vWidth;
  canvas.height = vHeight;
  ctx.drawImage(video, 0, 0, vWidth, vHeight);

  const imgData = ctx.getImageData(0, 0, vWidth, vHeight);
  const pixels = imgData.data;

  // १. पांढऱ्या कागदाची पडताळणी
  let lightPixels = 0;
  let totalSampled = 0;
  for (let y = vHeight * 0.2; y < vHeight * 0.8; y += 12) {
    for (let x = vWidth * 0.2; x < vWidth * 0.8; x += 12) {
      const idx = (Math.floor(y) * vWidth + Math.floor(x)) * 4;
      const brightness = pixels[idx] * 0.299 + pixels[idx+1] * 0.587 + pixels[idx+2] * 0.114;
      if (brightness > 130) lightPixels++;
      totalSampled++;
    }
  }
  const paperWhiteRatio = lightPixels / totalSampled;

  // २. ४ स्तंभांमधील ३ उभ्या पांढऱ्या पोकळ्या (Gutters) तपासणे
  const gutterXPositions = [0.32, 0.53, 0.74];
  let validGuttersCount = 0;

  gutterXPositions.forEach(ratio => {
    let gutterDarkCount = 0;
    let gutterTotal = 0;
    const gX = vWidth * ratio;
    for (let gY = vHeight * 0.25; gY < vHeight * 0.85; gY += 8) {
      const idx = (Math.floor(gY) * vWidth + Math.floor(gX)) * 4;
      const br = pixels[idx] * 0.299 + pixels[idx+1] * 0.587 + pixels[idx+2] * 0.114;
      if (br < 115) gutterDarkCount++;
      gutterTotal++;
    }
    if ((gutterDarkCount / gutterTotal) < 0.12) {
      validGuttersCount++;
    }
  });

  const pBox = document.getElementById('omr-portrait-box');
  const statusPill = document.getElementById('omr-live-status-pill');
  const isOmrValid = (paperWhiteRatio > 0.60 && validGuttersCount >= 2);

  if (isOmrValid) {
    omrConsecutiveStableFrames++;
    pBox.classList.add('detected-green');
    statusPill.innerText = "✅ OMR शीट जुळली (स्थिर ठेवा)";
    
    if (omrConsecutiveStableFrames >= 3) {
      isAutoCaptured = true;
      statusPill.innerText = "📸 आपोआप कॅप्चर झाले!";
      executeRealOmrAnalysis(pixels, vWidth, vHeight);
    }
  } else {
    omrConsecutiveStableFrames = 0;
    pBox.classList.remove('detected-green');
    statusPill.innerText = "❌ OMR शीट दिसत नाही";
  }
}

function executeRealOmrAnalysis(pixels, vWidth, vHeight) {
  clearInterval(omrDetectionInterval);
  showToast("OMR शीट स्कॅन झाली! गुण मोजले जात आहेत...");

  const testNo = document.getElementById('entry-test-no').value;
  const savedKey = NAVODAYA_ANSWER_KEYS_STORE[`test_${testNo}`] || {};

  function getBubbleDarkness(centerX, centerY, radius) {
    let darkPixelCount = 0;
    let totalCount = 0;
    for (let x = centerX - radius; x <= centerX + radius; x += 2) {
      for (let y = centerY - radius; y <= centerY + radius; y += 2) {
        if (x >= 0 && x < vWidth && y >= 0 && y < vHeight) {
          const idx = (Math.floor(y) * vWidth + Math.floor(x)) * 4;
          const brightness = pixels[idx] * 0.299 + pixels[idx+1] * 0.587 + pixels[idx+2] * 0.114;
          if (brightness < 120) darkPixelCount++;
          totalCount++;
        }
      }
    }
    return totalCount > 0 ? (darkPixelCount / totalCount) : 0;
  }

  const tableLeft = vWidth * 0.11;
  const tableTop = vHeight * 0.16;
  const tableWidth = vWidth * 0.78;
  const tableHeight = vHeight * 0.74;

  const colWidth = tableWidth / 4;
  const rowHeight = tableHeight / 20;
  const optLetters = ['A', 'B', 'C', 'D'];

  let studentAnswers = {};

  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 20; row++) {
      const qNo = col * 20 + (row + 1);
      const qY = tableTop + (row + 0.5) * rowHeight;
      const qColX = tableLeft + col * colWidth;

      let detectedForThisQ = [];
      for (let optIdx = 0; optIdx < 4; optIdx++) {
        const bubbleX = qColX + (colWidth * 0.32) + (optIdx * (colWidth * 0.16));
        const darkness = getBubbleDarkness(bubbleX, qY, 6);

        if (darkness > 0.38) {
          detectedForThisQ.push(optLetters[optIdx]);
        }
      }

      if (detectedForThisQ.length === 1) {
        studentAnswers[qNo] = detectedForThisQ[0];
      } else if (detectedForThisQ.length > 1) {
        studentAnswers[qNo] = 'INVALID';
      } else {
        studentAnswers[qNo] = null;
      }
    }
  }

  let attemptedCount = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let invalidCount = 0;

  for (let q = 1; q <= 80; q++) {
    const stdAns = studentAnswers[q];
    const correctAns = savedKey[q];

    if (stdAns === 'INVALID') {
      invalidCount++;
      attemptedCount++;
    } else if (stdAns) {
      attemptedCount++;
      if (stdAns === correctAns) {
        correctCount++;
      } else {
        wrongCount++;
      }
    }
  }

  if (attemptedCount === 0) {
    showCustomAlert("ओएमआर शीटवरील वर्तुळे स्पष्ट ओळखता आली नाहीत! कृपया उत्तरपत्रिका कॅमेऱ्याच्या आयताकृती फ्रेममध्ये सरळ व चांगल्या प्रकाशात धरा.");
    return;
  }

  const totalCalculatedMarks = parseFloat((correctCount * 1.25).toFixed(2));

  document.getElementById('omr-sum-attempted').innerText = `${attemptedCount} / 80`;
  document.getElementById('omr-sum-correct').innerText = `${correctCount}`;
  document.getElementById('omr-sum-wrong').innerText = `${wrongCount}`;
  document.getElementById('omr-sum-invalid').innerText = `${invalidCount}`;
  document.getElementById('omr-sum-final-score').innerText = `${totalCalculatedMarks} / 100`;

  document.getElementById('omr-summary-display-card').style.display = 'block';

  const captureBtn = document.getElementById('btn-capture-omr');
  captureBtn.setAttribute('data-state', 'confirm');
  captureBtn.setAttribute('data-score', totalCalculatedMarks);
  captureBtn.innerHTML = `<i class="fa-solid fa-circle-check"></i> हे गुण सबमिट करा (${totalCalculatedMarks})`;
  captureBtn.style.opacity = '1';
  captureBtn.disabled = false;
  showToast("OMR पडताळणी पूर्ण! खात्री करून गुण सबमिट करा.");
}

function submitScannedScoreDirectly() {
  const captureBtn = document.getElementById('btn-capture-omr');
  if (captureBtn.getAttribute('data-state') === 'confirm') {
    const finalScore = parseFloat(captureBtn.getAttribute('data-score'));
    if (CURRENT_SCANNING_STUDENT_ID) {
      const inp = document.getElementById(`marks-input-${CURRENT_SCANNING_STUDENT_ID}`);
      if (inp) {
        inp.value = finalScore;
        inp.style.backgroundColor = '#dcfce7';
        inp.style.borderColor = '#16a34a';
        validateMarksInput(inp, CURRENT_SCANNING_STUDENT_ID);
      }
      setAttendance(CURRENT_SCANNING_STUDENT_ID, 'present');
    }
    captureBtn.removeAttribute('data-state');
    closeOmrScanner();
    showToast(`गुण यशस्वीरीत्या नोंदवले: ${finalScore}`);
  }
}
