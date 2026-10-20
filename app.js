/* ==========================================================================
   APP.JS - मुख्य पोर्टल जावास्क्रिप्ट (Core System Logic)
   जिल्हा परिषद, बीड - शिक्षण विभाग | सराव चाचणी गुणवत्ता डॅशबोर्ड
   ========================================================================== */

const TALUKA_LIST = [
  "अंबाजोगाई", "आष्टी", "बीड ग्रामीण", "बीड शहर", "धारूर", 
  "गेवराई", "केज", "माजलगाव", "परळी", "पाटोदा", "शिरूर कासार", "वडवणी"
];

const firebaseConfig = {
  apiKey: "AIzaSyBrKGEMc9uxBoZ4VIcNfOXq7xt_IZmluDE",
  authDomain: "test-database-34c8a.firebaseapp.com",
  projectId: "test-database-34c8a",
  storageBucket: "test-database-34c8a.firebasestorage.app",
  messagingSenderId: "245228014027",
  appId: "1:245228014027:web:fa439be5e1739868a74e4e",
  databaseURL: "https://test-database-34c8a-default-rtdb.firebaseio.com"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

function getMinAllowedTestNo(category) {
  return (category === 'navodaya') ? 6 : 8;
}

let TEST_DEFINITIONS_STORE = {};
let ACTIVE_TESTS_STORE = {};
let NAVODAYA_ANSWER_KEYS_STORE = {};
let CUSTOM_MAX_MARKS_STORE = {};
let DECLARED_DATA_STORE = {};
let DASH_STATS_MEMORY_CACHE = {};

let currentSelectedCategory = 'navodaya';
let currentSelectedTest = getMinAllowedTestNo('navodaya');
let currentTriTab = 'district';
let selectedTopperTaluka = null;

let currentEntryCategory = 'navodaya';
let currentStudentsList = [];
let selectedSchoolObj = null;
let currentRawResults = {};

let pendingSchoolToLock = null;
let isCurrentSchoolPinNew = false;
let isReRegistrationNeeded = false;
let fetchedSchoolSecurityPin = null;
let fetchedSchoolHmMobile = null;

let BEED_ALL_SCHOOLS = [];
let PRE_LOCK_CALCULATED_DATA = null;
let currentActiveDashboardRef = null;
let adminClickCount = 0;
let adminClickTimer = null;
let currentCertStudentName = 'Student';

const DEFAULT_CERT_POSITIONS = {
  title: { top: 44, left: 130 },
  date: { top: 104, left: 660 },
  name: { top: 142, left: 55 },
  body: { top: 198, left: 55 },
  badges: { top: 332, left: 55 },
  ribbon: { top: 405, left: 55 },
  sign: { top: 470, left: 510 }
};

let CERT_CONFIG = {
  title: "गुणवत्ता सन्मान प्रमाणपत्र",
  titleFont: "'Rozha One', serif",
  nameFont: "'Yatra One', cursive",
  body: "गौरवपूर्वक प्रमाणित करण्यात येते की, विद्यार्थी / विद्यार्थिनी <strong>{NAME}</strong> ({CLASS}), शाळा: <strong>{SCHOOL}</strong> (UDISE: {UDISE}), तालुका: <strong>{TALUKA}</strong> {PRONOUN} जिल्हा परिषद, बीड अंतर्गत आयोजित <strong>{EXAM}</strong> अंतर्गत <strong>{TEST}</strong> मध्ये उल्लेखनीय गुणवत्ता सिद्ध करून खालीलप्रमाणे घवघवीत यश संपादन केले आहे.",
  sign: "शिक्षणाधिकारी (प्राथमिक), जिल्हा परिषद बीड",
  bgUrl: "cert.jpeg",
  fontSize: 16,
  lineHeight: 1.85,
  positions: JSON.parse(JSON.stringify(DEFAULT_CERT_POSITIONS))
};

let BANNER_CONFIG = {
  title: "बीड जिल्हा सराव परीक्षा टॉपर्स",
  badge: "💐 हार्दिक अभिनंदन ! हार्दिक अभिनंदन ! 💐",
  footer: "🎯 शिक्षण विभाग, जिल्हा परिषद बीड",
  fontSize: 26,
  gap: 6
};

/* ================= 1. इनिशियलायझेशन ================= */
function initPortal() {
  loadSchoolsData();
  initTalukaDropdowns();
  build12Taluka4ColGrid();
  listenDeclaredResults();
  listenTestDefinitionsAndActive();
  buildDashboardTestPills();
  buildEntryTestOptions();
  listenLiveDashboardData();
  listenCustomMaxMarks();
  listenCustomTemplates();
  initAdminPanelOptions();
  initAllDraggables();
  initNavodayaAkTestOptions();

  try { history.pushState({ page: 'home' }, ''); } catch(e) {}
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPortal);
} else {
  initPortal();
}

/* ================= 2. शाळा डेटा व चाचणी व्याख्या ================= */
function loadSchoolsData() {
  fetch('schools.json')
    .then(res => res.json())
    .then(data => {
      BEED_ALL_SCHOOLS = data.map(s => ({
        c: String(s.udise).trim(),
        n: s.name ? s.name.trim() : '',
        t: s.taluka ? s.taluka.trim() : '',
        k: (s.kendra || s.cluster || s.taluka || '').trim(),
        l: parseInt(s.lowest_class, 10) || 1,
        h: parseInt(s.highest_class, 10) || 7
      }));
      listenLiveDashboardData();
    })
    .catch(err => console.error("schools.json त्रुटी:", err));
}

function getDefaultTests(category) {
  const minStart = getMinAllowedTestNo(category);
  let list = [];
  for (let i = minStart; i <= 10; i++) {
    list.push({ no: i, name: `चाचणी ${i}` });
  }
  return list;
}

function getTestsListForCategory(category) {
  const minStart = getMinAllowedTestNo(category);
  if (TEST_DEFINITIONS_STORE && TEST_DEFINITIONS_STORE[category] && Array.isArray(TEST_DEFINITIONS_STORE[category])) {
    const filtered = TEST_DEFINITIONS_STORE[category].filter(t => t.no >= minStart);
    if (filtered.length > 0) return filtered;
  }
  return getDefaultTests(category);
}

function getTestDisplayName(category, testNo) {
  const list = getTestsListForCategory(category);
  const found = list.find(t => t.no === parseInt(testNo, 10));
  return found ? found.name : `चाचणी ${testNo}`;
}

function getAutoActiveTest(category) {
  const minStart = getMinAllowedTestNo(category);
  if (ACTIVE_TESTS_STORE && ACTIVE_TESTS_STORE[category]) {
    const val = parseInt(ACTIVE_TESTS_STORE[category], 10);
    if (val >= minStart) return val;
  }
  return minStart;
}

function getInitialDeclaredTestForDashboard(category) {
  const declaredCat = DECLARED_DATA_STORE[category];
  const minStart = getMinAllowedTestNo(category);
  if (declaredCat) {
    for (let t = 20; t >= minStart; t--) {
      if (declaredCat[`test_${t}`]) return t;
    }
  }
  return minStart;
}

function listenTestDefinitionsAndActive() {
  db.ref('test_definitions').on('value', (snap) => {
    TEST_DEFINITIONS_STORE = snap.val() || {};
    buildDashboardTestPills();
    updateAdminTestOptions();
    updateAdminLockTestOptions();
    refreshAdminTestManagerUI();
    initNavodayaAkTestOptions();
  });

  db.ref('active_tests').on('value', (snap) => {
    ACTIVE_TESTS_STORE = snap.val() || {};
    if (currentEntryCategory) {
      const aTest = getAutoActiveTest(currentEntryCategory);
      const inp = document.getElementById('entry-test-no');
      if (inp) inp.value = aTest;
      updateEntryNotice(aTest);
    }
    buildDashboardTestPills();
    refreshAdminTestManagerUI();
  });

  db.ref('navodaya_answer_keys').on('value', (snap) => {
    NAVODAYA_ANSWER_KEYS_STORE = snap.val() || {};
    loadNavodayaAnswerKey();
  });
}

function listenCustomMaxMarks() {
  db.ref('custom_max_marks').on('value', (snap) => {
    CUSTOM_MAX_MARKS_STORE = snap.val() || {};
    listenLiveDashboardData();
  });
}

function getMaxMarksForTest(category, testNo) {
  const key = `${category}_test_${testNo}`;
  if (CUSTOM_MAX_MARKS_STORE && CUSTOM_MAX_MARKS_STORE[key]) {
    return parseInt(CUSTOM_MAX_MARKS_STORE[key], 10);
  }
  return (category === 'navodaya') ? 100 : 50;
}

function isSchoolEligible(school, examType) {
  let target = (examType === '4th') ? 4 : (examType === 'navodaya') ? 5 : (examType === '7th') ? 7 : 8;
  return school.l <= target && school.h >= target;
}

function getTotalEligibleSchoolsForCategory(category) {
  if (!BEED_ALL_SCHOOLS || BEED_ALL_SCHOOLS.length === 0) return 0;
  return BEED_ALL_SCHOOLS.filter(s => isSchoolEligible(s, category)).length;
}

/* ================= 3. डॅशबोर्ड व टॉपर्स रेंडरिंग ================= */
function buildDashboardTestPills() {
  const cont = document.getElementById('dash-test-pills');
  if (!cont) return;
  cont.innerHTML = '';
  
  const tests = getTestsListForCategory(currentSelectedCategory);
  if (!tests.find(t => t.no === currentSelectedTest)) {
    currentSelectedTest = getInitialDeclaredTestForDashboard(currentSelectedCategory);
  }

  tests.forEach(t => {
    let parts = t.name.split('दिनांक');
    let title = parts[0].trim();
    let datePart = parts[1] ? 'दि. ' + parts[1].trim() : `चाचणी क्र. ${t.no}`;

    cont.innerHTML += `
      <button id="pill-test-${t.no}" class="test-capsule-chip ${t.no === currentSelectedTest ? 'active' : ''}" onclick="selectTest(${t.no}, this)">
        <div class="capsule-badge-icon">
          <i class="fa-solid fa-calendar-check"></i>
        </div>
        <div class="capsule-text-wrap">
          <span class="capsule-text-title">${title}</span>
          <span class="capsule-text-sub">${datePart}</span>
        </div>
      </button>`;
  });
}

function selectDashboardCategoryBySelect(cat) {
  currentSelectedCategory = cat;
  currentSelectedTest = getInitialDeclaredTestForDashboard(cat);
  buildDashboardTestPills();
  listenLiveDashboardData();
}

function selectTest(no, el) {
  document.querySelectorAll('#dash-test-pills .test-capsule-chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  currentSelectedTest = no;
  listenLiveDashboardData();
}

function initTalukaDropdowns() {
  const triTalSelect = document.getElementById('tri-taluka-select');
  const preLockTalSelect = document.getElementById('pre-lock-taluka-select');
  if (triTalSelect) triTalSelect.innerHTML = '';
  if (preLockTalSelect) preLockTalSelect.innerHTML = '<option value="">-- तालुका Toppers निवडा --</option>';

  TALUKA_LIST.forEach(t => {
    if (triTalSelect) triTalSelect.innerHTML += `<option value="${t}">${t} तालुका</option>`;
    if (preLockTalSelect) preLockTalSelect.innerHTML += `<option value="${t}">${t} तालुका</option>`;
  });
}

function build12Taluka4ColGrid() {
  const cont = document.getElementById('taluka-4col-container');
  if (!cont) return;
  cont.innerHTML = '';

  TALUKA_LIST.forEach(tName => {
    cont.innerHTML += `
      <button class="taluka-4col-btn" id="btn-taluka-${tName}" onclick="handleTalukaSelection('${tName}', this)">
        ${tName}
      </button>
    `;
  });
}

function switchTriTab(tab) {
  currentTriTab = tab;
  document.getElementById('tri-btn-district').classList.toggle('active', tab === 'district');
  document.getElementById('tri-btn-taluka').classList.toggle('active', tab === 'taluka');
  document.getElementById('tri-btn-kendra').classList.toggle('active', tab === 'kendra');
  
  const talukaGridWrap = document.getElementById('taluka-4col-grid-wrap');
  const gridLabel = document.getElementById('taluka-grid-label');
  document.querySelectorAll('.taluka-4col-btn').forEach(b => b.classList.remove('active'));

  if (tab === 'district') {
    talukaGridWrap.style.display = 'none';
    selectedTopperTaluka = null;
  } else if (tab === 'taluka') {
    talukaGridWrap.style.display = 'block';
    gridLabel.innerHTML = `<i class="fa-solid fa-hand-pointer" style="color:var(--sky);"></i> ज्या तालुक्याचे Top 10 पाहायचे आहेत तो तालुका निवडा:`;
    selectedTopperTaluka = TALUKA_LIST[0];
    const firstBtn = document.getElementById(`btn-taluka-${selectedTopperTaluka}`);
    if (firstBtn) firstBtn.classList.add('active');
  } else if (tab === 'kendra') {
    talukaGridWrap.style.display = 'none';
    selectedTopperTaluka = null;
  }

  renderDeclaredResultsOnDashboard();
}

function handleTalukaSelection(tName, btn) {
  document.querySelectorAll('.taluka-4col-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  selectedTopperTaluka = tName;
  if (currentTriTab === 'taluka') {
    renderDeclaredResultsOnDashboard();
  }
}

function listenLiveDashboardData() {
  const cacheKey = `${currentSelectedCategory}_test_${currentSelectedTest}`;
  const totalEligibleSchools = getTotalEligibleSchoolsForCategory(currentSelectedCategory);

  if (DASH_STATS_MEMORY_CACHE[cacheKey]) {
    const c = DASH_STATS_MEMORY_CACHE[cacheKey];
    document.getElementById('stat-total-students').innerText = c.students;
    document.getElementById('stat-active-schools').innerText = `${c.active}/${totalEligibleSchools}`;
  } else {
    document.getElementById('stat-total-students').innerText = '...';
    document.getElementById('stat-active-schools').innerText = `.../${totalEligibleSchools}`;
  }

  if (currentActiveDashboardRef) {
    currentActiveDashboardRef.off();
    currentActiveDashboardRef = null;
  }

  const refPath = `results/${currentSelectedCategory}/test_${currentSelectedTest}`;
  currentActiveDashboardRef = db.ref(refPath);

  currentActiveDashboardRef.on('value', (snapshot) => {
    const data = snapshot.val();
    currentRawResults = data || {};
    let allStudentsCount = 0;
    let submittedSchoolsSet = new Set();

    if (data) {
      Object.values(data).forEach(entry => {
        let schoolHasMarks = false;
        if (entry.students && Array.isArray(entry.students)) {
          entry.students.forEach(st => {
            if (st.marks !== undefined && st.marks !== '') {
              schoolHasMarks = true;
              const mStr = String(st.marks).toUpperCase();
              if (mStr !== 'AB') allStudentsCount++;
            }
          });
        }
        if (schoolHasMarks && entry.udise) submittedSchoolsSet.add(entry.udise);
      });
    }

    DASH_STATS_MEMORY_CACHE[cacheKey] = {
      students: allStudentsCount,
      active: submittedSchoolsSet.size
    };

    document.getElementById('stat-total-students').innerText = allStudentsCount;
    document.getElementById('stat-active-schools').innerText = `${submittedSchoolsSet.size}/${totalEligibleSchools}`;
    renderDeclaredResultsOnDashboard();
  });
}

function listenDeclaredResults() {
  db.ref('declared_toppers').on('value', (snap) => {
    DECLARED_DATA_STORE = snap.val() || {};
    currentSelectedTest = getInitialDeclaredTestForDashboard(currentSelectedCategory);
    buildDashboardTestPills();
    listenLiveDashboardData();
    renderDeclaredResultsOnDashboard();
  });
}

function renderDeclaredResultsOnDashboard() {
  const cont = document.getElementById('dashboard-toppers-container');
  if (!cont) return;
  cont.innerHTML = '';

  if (currentTriTab === 'kendra') {
    cont.innerHTML = `
      <div style="text-align:center; padding:30px 16px; background:#fffbeb; border-radius:12px; border:1.5px solid #fed7aa; margin:8px 0;">
        <i class="fa-solid fa-circle-exclamation" style="font-size:2.4rem; color:#d97706; margin-bottom:10px;"></i>
        <h4 style="font-size:1.08rem; color:#92400e; font-weight:800; margin-bottom:4px;">केंद्राचे निकाल संकलन सुरू आहे</h4>
        <p style="font-size:0.94rem; color:#78350f; font-weight:600; line-height:1.45;">
          📢 <strong>सूचना:</strong> सध्या केंद्राच्या टॉपर्ससाठी पुरेसा डेटा उपलब्ध नाही.<br>
          <strong>पुढील चाचणीच्या निकालामध्ये केंद्राचे टॉपर्स जाहीर करण्यात येतील.</strong>
        </p>
      </div>
    `;
    return;
  }

  const declaredCat = DECLARED_DATA_STORE[currentSelectedCategory];
  const testKey = `test_${currentSelectedTest}`;
  const maxM = getMaxMarksForTest(currentSelectedCategory, currentSelectedTest);

  if (!declaredCat || !declaredCat[testKey]) {
    cont.innerHTML = `
      <div style="text-align:center; padding:24px 14px; color:#64748b;">
        <i class="fa-solid fa-clock-rotate-left" style="font-size:2rem; color:#cbd5e1; margin-bottom:8px;"></i>
        <p style="font-weight:700; font-size:0.96rem; color:#475569;">या चाचणीचा निकाल अद्याप अधिकृतपणे जाहीर केलेला नाही.</p>
        <span style="font-size:0.82rem;">शिक्षणाधिकारी (प्राथमिक) यांच्याकडून निकाल लॉक झाल्यावर गुणवत्ता यादी येथे उपलब्ध होईल.</span>
      </div>
    `;
    return;
  }

  const testData = declaredCat[testKey];

  if (currentTriTab === 'district') {
    const list = testData.districtToppers || [];
    if (list.length === 0) {
      cont.innerHTML = `<p style="text-align:center; color:#64748b; padding:12px;">यादी उपलब्ध नाही.</p>`;
      return;
    }
    cont.innerHTML += `
      <div style="margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
        <strong style="color:#0f2b5c; font-size:0.98rem;"><i class="fa-solid fa-trophy" style="color:var(--gold);"></i> बीड जिल्हा Top 10</strong>
        <button class="app-btn btn-gold" style="width:auto; height:34px; font-size:0.84rem; padding:0 12px;" onclick="openDeclaredBanner(${currentSelectedTest}, 'district')">
          <i class="fa-solid fa-award"></i> जिल्हा Top 10 बॅनर पहा
        </button>
      </div>
    `;
    renderStudentsCards(list, maxM, 'जिल्ह्यात क्रमांक');
  } 
  else if (currentTriTab === 'taluka') {
    const selTaluka = selectedTopperTaluka || TALUKA_LIST[0];
    const tToppers = (testData.talukaToppers && testData.talukaToppers[selTaluka]) ? testData.talukaToppers[selTaluka] : [];

    cont.innerHTML += `
      <div style="margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
        <strong style="color:#059669; font-size:0.98rem;"><i class="fa-solid fa-award"></i> ${selTaluka} तालुका Top 10</strong>
        <button class="app-btn btn-success" style="width:auto; height:34px; font-size:0.84rem; padding:0 12px;" onclick="openDeclaredBanner(${currentSelectedTest}, 'taluka', '${selTaluka}')">
          <i class="fa-solid fa-award"></i> ${selTaluka} तालुका बॅनर पहा
        </button>
      </div>
    `;
    if (tToppers.length === 0) {
      cont.innerHTML += `<p style="text-align:center; color:#64748b; padding:12px;">या तालुक्याचा निकाल अद्याप उपलब्ध नाही.</p>`;
      return;
    }
    renderStudentsCards(tToppers, maxM, `${selTaluka} तालुक्यात क्रमांक`);
  }
}

function renderStudentsCards(list, maxM, rankPrefix) {
  const cont = document.getElementById('dashboard-toppers-container');
  list.forEach((st, idx) => {
    const fullRankText = `${rankPrefix} #${idx + 1}`;
    cont.innerHTML += `
      <div class="topper-card">
        <div class="topper-rank">#${idx + 1}</div>
        <div class="topper-details">
          <h4>${st.name}</h4>
          <p>${st.school} (${st.taluka || '-'})</p>
        </div>
        <div class="topper-score">
          <span class="topper-score-badge">${st.marks}/${maxM} गुण</span>
          <button class="app-btn btn-outline" style="width:auto; height:26px; font-size:0.75rem; padding:0 8px; margin-top:3px;" 
            onclick="openCertificateModal('${st.name}', '${st.school}', '${st.udise}', '${st.taluka}', ${st.marks}, '${fullRankText}', '${st.gender || ''}', ${maxM})">
            <i class="fa-solid fa-award"></i> प्रमाणपत्र
          </button>
        </div>
      </div>
    `;
  });
}

/* ================= 4. शाळा शोध व सुरक्षा पिन (Login PIN) पडताळणी ================= */
function buildEntryTestOptions() {
  const autoTest = getAutoActiveTest(currentEntryCategory);
  document.getElementById('entry-test-no').value = autoTest;
  updateEntryNotice(autoTest);
}

function selectEntryCategory(cat) {
  currentEntryCategory = cat;
  const selectBox = document.getElementById('entry-category-select');
  if (selectBox) selectBox.value = cat;
  const autoTest = getAutoActiveTest(cat);
  document.getElementById('entry-test-no').value = autoTest;
  updateEntryNotice(autoTest);
  resetSchoolLock();
}

function searchSchoolsByUdise(query) {
  const box = document.getElementById('udise-results-box');
  const q = query.trim().toLowerCase();
  
  if (q.length < 2 || BEED_ALL_SCHOOLS.length === 0) {
    box.style.display = 'none';
    return;
  }

  const matches = BEED_ALL_SCHOOLS.filter(s => 
    (s.c.includes(q) || s.n.toLowerCase().includes(q)) && 
    isSchoolEligible(s, currentEntryCategory)
  ).slice(0, 20);
  
  if (matches.length === 0) {
    box.innerHTML = `<div style="padding:10px; color:#64748b; font-size:0.92rem; text-align:center;">या माहितीशी जुळणारी शाळा सापडली नाही.</div>`;
  } else {
    box.innerHTML = matches.map(s => `
      <div class="udise-suggest-item" onclick="selectSchoolFromUdise('${s.c}')">
        <strong>${s.c}</strong> - ${s.n} <span style="color:#0284c7; font-weight:700;">(${s.t})</span>
      </div>
    `).join('');
  }
  box.style.display = 'block';
}

function selectSchoolFromUdise(udiseCode) {
  const school = BEED_ALL_SCHOOLS.find(s => s.c === udiseCode);
  if (!school) return;
  
  const schoolHidden = document.getElementById('entry-school');
  if (schoolHidden) schoolHidden.value = school.c;

  document.getElementById('udise-results-box').style.display = 'none';
  document.getElementById('udise-search-input').value = `${school.c} - ${school.n} (${school.t})`;
  handleSchoolSelectionWithSecurity();
}

function handleSchoolSelectionWithSecurity() {
  const udise = document.getElementById('entry-school').value;
  if (!udise) return;

  pendingSchoolToLock = BEED_ALL_SCHOOLS.find(s => s.c === udise);
  if (!pendingSchoolToLock) return;

  const schoolKey = pendingSchoolToLock.c;

  db.ref(`school_auth/${schoolKey}`).once('value', (snapAuth) => {
    const authData = snapAuth.val();

    if (authData && authData.pin && authData.mobile) {
      fetchedSchoolSecurityPin = authData.pin;
      fetchedSchoolHmMobile = authData.mobile;
      isCurrentSchoolPinNew = false;
      isReRegistrationNeeded = false;

      document.getElementById('pinModalTitle').innerText = "शाळा सुरक्षा पिन पडताळणी";
      document.getElementById('pinModalDesc').innerText = `शाळा: ${pendingSchoolToLock.n}\n(UDISE: ${pendingSchoolToLock.c})\nआपला 4-अंकी सुरक्षा पिन टाका:`;
      document.getElementById('groupHmMobileReg').style.display = 'none';
      document.getElementById('pinNoticeReg').style.display = 'none';
      document.getElementById('labelSchoolPin').style.display = 'none';
      document.getElementById('btnForgotPin').style.display = 'block';
      
      document.getElementById('inputSchoolPin').value = '';
      document.getElementById('schoolPinModal').style.display = 'flex';
      setTimeout(() => document.getElementById('inputSchoolPin').focus(), 150);
    } else {
      db.ref(`school_pins/${schoolKey}`).once('value', (snapOld) => {
        const oldPin = snapOld.val();

        if (!oldPin) {
          isCurrentSchoolPinNew = true;
          isReRegistrationNeeded = false;
          document.getElementById('pinModalTitle').innerText = "शाळा सुरक्षा पिन सेट करा";
          document.getElementById('pinModalDesc').innerText = `शाळा: ${pendingSchoolToLock.n}\n(UDISE: ${pendingSchoolToLock.c})\nमुख्याध्यापकांचा अधिकृत WhatsApp नंबर व नवीन 4-अंकी पिन तयार करा (हाच पिन सर्व परीक्षांसाठी राहील):`;
        } else {
          isCurrentSchoolPinNew = false;
          isReRegistrationNeeded = true;
          document.getElementById('pinModalTitle').innerText = "सुरक्षा अद्ययावत करा";
          document.getElementById('pinModalDesc').innerText = `शाळा: ${pendingSchoolToLock.n}\nमुख्याध्यापकांचा अधिकृत WhatsApp नंबर नोंदवून नवीन पिन तयार करा:`;
        }

        document.getElementById('groupHmMobileReg').style.display = 'block';
        document.getElementById('pinNoticeReg').style.display = 'block';
        document.getElementById('labelSchoolPin').style.display = 'block';
        document.getElementById('btnForgotPin').style.display = 'none';

        document.getElementById('inputHmMobileReg').value = '';
        document.getElementById('inputSchoolPin').value = '';
        document.getElementById('schoolPinModal').style.display = 'flex';
        setTimeout(() => document.getElementById('inputHmMobileReg').focus(), 150);
      });
    }
  });
}

function verifyOrSetSchoolPin() {
  const enteredPin = document.getElementById('inputSchoolPin').value.trim();

  if (!enteredPin || enteredPin.length !== 4 || isNaN(enteredPin)) {
    showCustomAlert("कृपया बरोबर 4 आकडी संख्यात्मक पिन टाका!");
    return;
  }

  const schoolKey = pendingSchoolToLock.c;

  if (isCurrentSchoolPinNew || isReRegistrationNeeded) {
    const hmMobile = document.getElementById('inputHmMobileReg').value.trim();
    if (!hmMobile || hmMobile.length !== 10 || isNaN(hmMobile)) {
      showCustomAlert("कृपया मुख्याध्यापकांचा वैध 10-अंकी WhatsApp नंबर टाका! पिन विसरल्यास तो रिसेट करण्यासाठी हा नंबर अनिवार्य आहे.");
      return;
    }

    const authPayload = {
      pin: enteredPin,
      mobile: hmMobile,
      updatedAt: new Date().toISOString()
    };

    db.ref(`school_auth/${schoolKey}`).set(authPayload).then(() => {
      db.ref(`school_pins/${schoolKey}`).set(enteredPin);
      fetchedSchoolSecurityPin = enteredPin;
      fetchedSchoolHmMobile = hmMobile;
      closeModal('schoolPinModal');
      showToast('शाळा पिन व मुख्याध्यापक नंबर यशस्वीरीत्या सेट झाला!');
      proceedWithSchoolSelection(pendingSchoolToLock);
    });
  } else {
    if (enteredPin === String(fetchedSchoolSecurityPin)) {
      closeModal('schoolPinModal');
      showToast('पिन पडताळणी यशस्वी!');
      proceedWithSchoolSelection(pendingSchoolToLock);
    } else {
      showCustomAlert('चुकीचा सुरक्षा पिन!');
    }
  }
}

function cancelPinModal() {
  closeModal('schoolPinModal');
  const schoolHidden = document.getElementById('entry-school');
  if (schoolHidden) schoolHidden.value = '';
  const searchInp = document.getElementById('udise-search-input');
  if (searchInp) searchInp.value = '';
  pendingSchoolToLock = null;
  lockUIWithoutPin();
}

function openForgotPinModal() {
  closeModal('schoolPinModal');
  document.getElementById('inputVerifyHmMobile').value = '';
  document.getElementById('inputResetNewPin').value = '';

  const hintEl = document.getElementById('txtHmMobileMasked');
  if (fetchedSchoolHmMobile && String(fetchedSchoolHmMobile).length === 10) {
    const lastDigits = String(fetchedSchoolHmMobile).slice(-4);
    hintEl.innerText = `******${lastDigits}`;
  } else {
    hintEl.innerText = `उपलब्ध नाही`;
  }

  document.getElementById('forgotPinModal').style.display = 'flex';
  setTimeout(() => document.getElementById('inputVerifyHmMobile').focus(), 150);
}

function verifyMobileAndResetPin() {
  const enteredMobile = document.getElementById('inputVerifyHmMobile').value.trim();
  const newPin = document.getElementById('inputResetNewPin').value.trim();

  if (!enteredMobile || enteredMobile.length !== 10 || isNaN(enteredMobile)) {
    showCustomAlert("कृपया मुख्याध्यापकांचा वैध 10-अंकी WhatsApp नंबर टाका!");
    return;
  }

  if (!newPin || newPin.length !== 4 || isNaN(newPin)) {
    showCustomAlert("कृपया नवीन 4-अंकी संख्यात्मक पिन टाका!");
    return;
  }

  if (enteredMobile !== String(fetchedSchoolHmMobile)) {
    showCustomAlert("टाकलेला मुख्याध्यापकांचा नंबर चुकीचा आहे! या शाळेसाठी नोंदवलेल्या अधिकृत WhatsApp नंबरवरूनच पिन रिसेट करता येईल.");
    return;
  }

  const schoolKey = pendingSchoolToLock.c;
  const authPayload = {
    pin: newPin,
    mobile: enteredMobile,
    updatedAt: new Date().toISOString()
  };

  db.ref(`school_auth/${schoolKey}`).set(authPayload).then(() => {
    db.ref(`school_pins/${schoolKey}`).set(newPin);
    fetchedSchoolSecurityPin = newPin;
    closeModal('forgotPinModal');
    showCustomAlert("शाळा सुरक्षा पिन यशस्वीरीत्या रिसेट झाला आहे! हाच पिन सर्व परीक्षांसाठी राहील.");
    proceedWithSchoolSelection(pendingSchoolToLock);
  }).catch(err => showCustomAlert("त्रुटी: " + err.message));
}

function proceedWithSchoolSelection(schoolObj) {
  selectedSchoolObj = schoolObj;
  document.getElementById('lock-notice').style.display = 'block';
  const searchInp = document.getElementById('udise-search-input');
  if (searchInp) searchInp.classList.add('locked');

  unlockUIWithPin();
  loadStudentsFromFirebase();
}

function unlockUIWithPin() {
  const sec2 = document.getElementById('card-student-add-section');
  const sec3 = document.getElementById('card-student-marks-section');
  if (sec2) { sec2.style.opacity = '1'; sec2.style.pointerEvents = 'auto'; }
  if (sec3) { sec3.style.opacity = '1'; sec3.style.pointerEvents = 'auto'; }
}

function lockUIWithoutPin() {
  const sec2 = document.getElementById('card-student-add-section');
  const sec3 = document.getElementById('card-student-marks-section');
  if (sec2) { sec2.style.opacity = '0.5'; sec2.style.pointerEvents = 'none'; }
  if (sec3) { sec3.style.opacity = '0.5'; sec3.style.pointerEvents = 'none'; }
  document.getElementById('student-list-container').innerHTML = `<p style="text-align:center; color:var(--text-muted); padding:16px; font-size:0.92rem;">कृपया प्रथम वरील फॉर्ममधून शाळा निवडून सुरक्षा पिन टाका.</p>`;
  document.getElementById('registered-students-box').style.display = 'none';
}

function resetSchoolLock() {
  selectedSchoolObj = null;
  document.getElementById('lock-notice').style.display = 'none';
  const searchInp = document.getElementById('udise-search-input');
  if (searchInp) {
    searchInp.classList.remove('locked');
    searchInp.value = '';
  }
  const schoolHidden = document.getElementById('entry-school');
  if (schoolHidden) schoolHidden.value = '';
  lockUIWithoutPin();
  currentStudentsList = [];
}

function getSchoolDbKey() {
  if (!selectedSchoolObj) return null;
  return `${currentEntryCategory}_${selectedSchoolObj.c}`;
}

/* ================= 5. विद्यार्थी यादी व्यवस्थापन व गुण नोंदणी ================= */
function loadStudentsFromFirebase() {
  const key = getSchoolDbKey();
  if (!key) return;

  db.ref(`students_master/${key}`).once('value', (snapshot) => {
    currentStudentsList = snapshot.val() || [];
    renderRegisteredStudentsManager();
    loadStudentMarksForSelectedTest();
  });
}

function renderRegisteredStudentsManager() {
  const box = document.getElementById('registered-students-box');
  const listEl = document.getElementById('registered-students-list');
  if (!box || !listEl) return;

  if (!currentStudentsList || currentStudentsList.length === 0) {
    box.style.display = 'none';
    return;
  }

  box.style.display = 'block';
  listEl.innerHTML = '';

  currentStudentsList.forEach((st, idx) => {
    listEl.innerHTML += `
      <div class="reg-std-item">
        <div>
          <strong>${idx + 1}. ${st.name}</strong><br>
          <span>लिंग: ${st.gender}</span>
        </div>
        <div style="display:flex; gap:6px;">
          <button class="btn-icon-action btn-edit" title="नाव बदला" onclick="openEditStudentModal(${st.id}, '${st.name}', '${st.gender}')">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="btn-icon-action btn-delete" title="कमी करा" onclick="deleteStudent(${st.id}, '${st.name}')">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
    `;
  });
}

function openEditStudentModal(id, name, gender) {
  document.getElementById('edit-std-id').value = id;
  document.getElementById('edit-std-name').value = name;
  document.getElementById('edit-std-gender').value = gender || 'मुलगा';
  document.getElementById('editStudentModal').style.display = 'flex';
}

function saveEditedStudent() {
  const id = parseInt(document.getElementById('edit-std-id').value, 10);
  const newName = document.getElementById('edit-std-name').value.trim();
  const newGender = document.getElementById('edit-std-gender').value;

  if (!newName) {
    showCustomAlert('नाव रिकामे असू शकत नाही!');
    return;
  }

  const key = getSchoolDbKey();
  if (!key) return;

  const std = currentStudentsList.find(s => s.id === id);
  if (std) {
    std.name = newName;
    std.gender = newGender;
    db.ref(`students_master/${key}`).set(currentStudentsList).then(() => {
      closeModal('editStudentModal');
      renderRegisteredStudentsManager();
      loadStudentMarksForSelectedTest();
      showToast('माहिती अद्ययावत झाली!');
    });
  }
}

function setAttendance(id, status) {
  const inp = document.getElementById(`marks-input-${id}`);
  const btnP = document.getElementById(`att-p-${id}`);
  const btnA = document.getElementById(`att-a-${id}`);

  if (status === 'absent') {
    inp.value = 'AB';
    inp.readOnly = true;
    inp.classList.add('is-absent');
    inp.classList.remove('invalid-mark');
    btnA.classList.add('active');
    btnP.classList.remove('active');
  } else {
    if (inp.value === 'AB') inp.value = '';
    inp.readOnly = false;
    inp.classList.remove('is-absent');
    btnP.classList.add('active');
    btnA.classList.remove('active');
    inp.focus();
  }
}

function addStudentToList() {
  const fname = document.getElementById('std-fname').value.trim();
  const mname = document.getElementById('std-mname').value.trim();
  const lname = document.getElementById('std-lname').value.trim();
  const gender = document.getElementById('std-gender').value;

  if (!fname || !lname) {
    showCustomAlert('कृपया विद्यार्थ्याचे नाव व आडनाव भरा!');
    return;
  }

  const key = getSchoolDbKey();
  if (!key) {
    showCustomAlert('आधी भाग 1 मधून आपली शाळा निवडा!');
    return;
  }

  currentStudentsList.push({
    id: Date.now(),
    name: `${fname} ${mname} ${lname}`.replace(/\s+/g, ' '),
    gender: gender
  });

  db.ref(`students_master/${key}`).set(currentStudentsList).then(() => {
    document.getElementById('std-fname').value = '';
    document.getElementById('std-mname').value = '';
    document.getElementById('std-lname').value = '';
    const hint = document.getElementById('marathi-input-hint');
    if (hint) hint.style.display = 'none';
    renderRegisteredStudentsManager();
    loadStudentMarksForSelectedTest();
    showToast('विद्यार्थी जोडला गेला!');
  });
}

function deleteStudent(id, name) {
  showCustomConfirm(`तुम्हाला "${name}" या विद्यार्थ्याचे नाव यादीतून नक्की कमी करायचे आहे का?`, () => {
    const key = getSchoolDbKey();
    if (!key) return;

    currentStudentsList = currentStudentsList.filter(s => s.id !== id);
    db.ref(`students_master/${key}`).set(currentStudentsList).then(() => {
      renderRegisteredStudentsManager();
      loadStudentMarksForSelectedTest();
      showToast('नाव कमी केले!');
    });
  });
}

function validateMarksInput(inputEl, studentId) {
  const val = inputEl.value.trim();
  const testNo = parseInt(document.getElementById('entry-test-no').value, 10) || getMinAllowedTestNo(currentEntryCategory);
  const maxLimit = getMaxMarksForTest(currentEntryCategory, testNo);

  if (val.toUpperCase() === 'AB' || val === '') {
    inputEl.classList.remove('invalid-mark');
    return;
  }

  const num = parseFloat(val);
  if (isNaN(num) || num < 0 || num > maxLimit) {
    inputEl.classList.add('invalid-mark');
    showToast(`गुण ० ते ${maxLimit} दरम्यान असावेत!`);
  } else {
    inputEl.classList.remove('invalid-mark');
  }
}

function loadStudentMarksForSelectedTest() {
  const key = getSchoolDbKey();
  const testNo = document.getElementById('entry-test-no').value;
  if (!key) return;

  db.ref(`results/${currentEntryCategory}/test_${testNo}/${key}`).once('value', (snapshot) => {
    const testData = snapshot.val();
    renderMobileStudentList(testData ? testData.students : null);
  });
}

function renderMobileStudentList(savedStudents) {
  const cont = document.getElementById('student-list-container');
  cont.innerHTML = '';

  if (currentStudentsList.length === 0) {
    cont.innerHTML = `<p style="text-align:center; color:var(--text-muted); padding:16px; font-size:0.92rem;">या शाळेसाठी अद्याप विद्यार्थी जोडलेले नाहीत. कृपया वरील भाग 2 मधून जोडा.</p>`;
    return;
  }

  const testNo = parseInt(document.getElementById('entry-test-no').value, 10) || getMinAllowedTestNo(currentEntryCategory);
  const maxLimit = getMaxMarksForTest(currentEntryCategory, testNo);

  currentStudentsList.forEach((st, idx) => {
    let marks = '';
    let isAbsent = false;
    if (savedStudents) {
      const found = savedStudents.find(s => s.id === st.id || s.name.trim() === st.name.trim());
      if (found && found.marks !== undefined) {
        marks = found.marks;
        if (String(marks).toUpperCase() === 'AB') isAbsent = true;
      }
    }

    const isGirl = (st.gender === "मुलगी" || st.gender === "girl");
    const genderClass = isGirl ? "girl" : "boy";

    cont.innerHTML += `
      <div class="student-entry-card">
        <div class="compact-name-row">
          <span class="compact-name-text">${idx + 1}. ${st.name}</span>
          <span class="compact-gender-tag ${genderClass}">${st.gender}</span>
        </div>
        
        <div class="compact-action-row">
          <div class="compact-att-group">
            <button type="button" class="compact-att-btn present ${!isAbsent ? 'active' : ''}" id="att-p-${st.id}" onclick="setAttendance(${st.id}, 'present')">उपस्थित</button>
            <button type="button" class="compact-att-btn absent ${isAbsent ? 'active' : ''}" id="att-a-${st.id}" onclick="setAttendance(${st.id}, 'absent')">गैरहजर</button>
          </div>

          <button type="button" class="btn-scan-omr" onclick="openOmrScannerModal(${st.id}, '${st.name}')" title="कॅमेऱ्याने OMR स्कॅन करा">
            <i class="fa-solid fa-camera"></i> OMR स्कॅन
          </button>

          <div class="compact-marks-wrap">
            <input type="text" inputmode="numeric" pattern="[0-9]*" class="compact-marks-input ${isAbsent ? 'is-absent' : ''}" 
              id="marks-input-${st.id}" value="${marks}" placeholder="गुण" ${isAbsent ? 'readonly' : ''} oninput="validateMarksInput(this, ${st.id})">
            <span class="compact-denominator">/ ${maxLimit}</span>
          </div>

          <button class="btn-compact-chart" onclick="openReportCardModal(${st.id}, '${st.name}')" title="विद्यार्थी प्रगती आलेख">
            <i class="fa-solid fa-chart-column"></i>
          </button>
        </div>
      </div>
    `;
  });
}

function submitMarksToFirebase() {
  const key = getSchoolDbKey();
  if (!key || !selectedSchoolObj) {
    showCustomAlert('कृपया प्रथम भाग 1 मधून शाळा निवडा!');
    return;
  }

  const testNo = document.getElementById('entry-test-no').value;
  const maxLimit = getMaxMarksForTest(currentEntryCategory, parseInt(testNo, 10));

  let hasInvalidMarks = false;
  let currentScreenInputs = {};
  currentStudentsList.forEach(st => {
    const inp = document.getElementById(`marks-input-${st.id}`);
    const val = inp ? inp.value.trim() : '';
    if (inp && inp.classList.contains('invalid-mark')) hasInvalidMarks = true;
    currentScreenInputs[st.id] = {
      name: st.name,
      gender: st.gender,
      marks: val
    };
  });

  if (hasInvalidMarks) {
    showCustomAlert(`काही विद्यार्थ्यांचे गुण चुकीचे भरले आहेत (कमाल गुण ${maxLimit} पेक्षा जास्त असू नयेत). कृपया लाल रंगातील गुण दुरुस्त करा!`);
    return;
  }

  const targetDbRef = db.ref(`results/${currentEntryCategory}/test_${testNo}/${key}`);

  targetDbRef.once('value', (snapshot) => {
    const existingData = snapshot.val();
    let existingStudentsMap = {};

    if (existingData && existingData.students && Array.isArray(existingData.students)) {
      existingData.students.forEach(st => {
        existingStudentsMap[st.id] = st;
      });
    }

    let mergedStudentsList = currentStudentsList.map(st => {
      const currentInput = currentScreenInputs[st.id];
      const previousSaved = existingStudentsMap[st.id];

      let finalMarks = '';
      if (currentInput && currentInput.marks !== '') {
        finalMarks = currentInput.marks;
      } else if (previousSaved && previousSaved.marks !== undefined && previousSaved.marks !== '') {
        finalMarks = previousSaved.marks;
      }

      return {
        id: st.id,
        name: st.name,
        gender: st.gender,
        marks: finalMarks
      };
    });

    const payload = {
      taluka: selectedSchoolObj.t || 'बीड',
      school: selectedSchoolObj.n,
      udise: selectedSchoolObj.c,
      students: mergedStudentsList,
      maxMarks: maxLimit,
      updatedAt: new Date().toISOString()
    };

    targetDbRef.set(payload).then(() => {
      showToast('सर्व गुण सुरक्षित सेव्ह झाले!');
      loadStudentMarksForSelectedTest();
    }).catch(err => showCustomAlert('त्रुटी: ' + err.message));
  });
}

/* ================= 6. अधिकृत मल्टिपेज शाळा PDF जनरेशन ================= */
function downloadSchoolRecordPDF() {
  if (!selectedSchoolObj) {
    showCustomAlert('कृपया प्रथम शाळा निवडा!');
    return;
  }

  if (!currentStudentsList || currentStudentsList.length === 0) {
    showCustomAlert('या शाळेमध्ये अद्याप एकही विद्यार्थी नोंदणीकृत नाही!');
    return;
  }

  const key = getSchoolDbKey();
  const testNo = document.getElementById('entry-test-no').value;
  const maxLimit = getMaxMarksForTest(currentEntryCategory, parseInt(testNo, 10));

  db.ref(`results/${currentEntryCategory}/test_${testNo}/${key}`).once('value', (snapshot) => {
    const savedData = snapshot.val();

    if (!savedData || !savedData.students || savedData.students.length === 0) {
      showCustomAlert("कृपया अगोदर 'सर्व गुण सुरक्षित सेव्ह करा' बटणावर क्लिक करून गुण सेव्ह करा, त्यानंतरच अधिकृत PDF डाऊनलोड करा!");
      return;
    }

    let savedStudentsMap = {};
    savedData.students.forEach(s => savedStudentsMap[s.id] = s);

    let hasUnsavedChanges = false;
    currentStudentsList.forEach(st => {
      const inp = document.getElementById(`marks-input-${st.id}`);
      const screenVal = inp ? inp.value.trim() : '';
      const savedRecord = savedStudentsMap[st.id] || savedData.students.find(s => s.name.trim() === st.name.trim());
      const savedVal = savedRecord && savedRecord.marks !== undefined ? String(savedRecord.marks).trim() : '';

      if (screenVal !== savedVal) hasUnsavedChanges = true;
    });

    if (hasUnsavedChanges) {
      showCustomAlert("आपण काही विद्यार्थ्यांचे गुण बदलले आहेत किंवा नवीन भरले आहेत. कृपया अगोदर 'सर्व गुण सुरक्षित सेव्ह करा' बटण दाबा, नंतर PDF डाऊनलोड करा!");
      return;
    }

    const examNames = {
      'navodaya': 'नवोदय प्रवेश परीक्षा (5 वी)',
      '4th': '4 थी शिष्यवृत्ती परीक्षा',
      '7th': '7 वी शिष्यवृत्ती परीक्षा',
      'nmms': 'NMMS शिष्यवृत्ती परीक्षा (8 वी)'
    };
    const examTitle = examNames[currentEntryCategory] || 'सराव परीक्षा';
    const testName = getTestDisplayName(currentEntryCategory, testNo);

    const students = currentStudentsList.map(st => {
      const saved = savedStudentsMap[st.id] || savedData.students.find(s => s.name.trim() === st.name.trim());
      return {
        id: st.id,
        name: st.name,
        gender: st.gender,
        marks: (saved && saved.marks !== undefined) ? saved.marks : ''
      };
    });

    const totalStudents = students.length;
    const STUDENTS_PER_PAGE = 26;
    const totalPages = Math.ceil(totalStudents / STUDENTS_PER_PAGE);

    const pagesContainer = document.getElementById('school-record-print-pages-container');
    pagesContainer.innerHTML = '';

    let overallPresent = 0, overallAbsent = 0;
    students.forEach(s => {
      const v = String(s.marks || '').toUpperCase();
      if (v === 'AB') overallAbsent++;
      else if (v !== '') overallPresent++;
    });

    for (let p = 0; p < totalPages; p++) {
      const pageDiv = document.createElement('div');
      pageDiv.className = 'school-record-page';
      pageDiv.id = `school-print-page-${p}`;

      const startIdx = p * STUDENTS_PER_PAGE;
      const endIdx = Math.min(startIdx + STUDENTS_PER_PAGE, totalStudents);
      const pageStudents = students.slice(startIdx, endIdx);

      let rowsHtml = '';
      pageStudents.forEach((st, idx) => {
        const actualIdx = startIdx + idx + 1;
        const val = st.marks !== undefined ? String(st.marks).trim() : '';
        let status = 'कोरे';
        let marksDisplay = '-';

        if (val.toUpperCase() === 'AB') {
          status = '<span style="color:#b91c1c; font-weight:800;">गैरहजर (AB)</span>';
          marksDisplay = 'AB';
        } else if (val !== '') {
          status = '<span style="color:#15803d; font-weight:800;">उपस्थित</span>';
          marksDisplay = val;
        }

        rowsHtml += `
          <tr style="text-align:center;">
            <td style="font-family:'Poppins', sans-serif;">${actualIdx}</td>
            <td style="text-align:left; font-weight:700;">${st.name}</td>
            <td>${st.gender || '-'}</td>
            <td>${status}</td>
            <td style="font-weight:800; font-family:'Poppins', sans-serif;">${marksDisplay}</td>
          </tr>
        `;
      });

      pageDiv.innerHTML = `
        <div style="text-align:center; border-bottom:2px solid #0f172a; padding-bottom:8px; margin-bottom:8px;">
          <h2 style="font-size:1.35rem; color:#0f2b5c; font-weight:800; margin-bottom:2px;">जिल्हा परिषद बीड - शिक्षण विभाग</h2>
          <h3 style="font-size:1.15rem; color:#b45309; font-weight:700;">${examTitle} - विद्यार्थी गुण नोंद तक्ता</h3>
          <p style="font-size:0.96rem; font-weight:600; color:#334155; margin-top:2px; word-spacing: 2px;">
            शाळा: <strong>${selectedSchoolObj.n}</strong> | UDISE: <strong>${selectedSchoolObj.c}</strong> | तालुका: <strong>${selectedSchoolObj.t || '-'}</strong>
          </p>
          <div style="display:flex; justify-content:space-between; font-size:0.88rem; font-weight:700; color:#0369a1; margin-top:3px;">
            <span>${testName} | कमाल गुण: ${maxLimit}</span>
            <span>एकूण विद्यार्थी: ${totalStudents} (उपस्थित: ${overallPresent} | गैरहजर: ${overallAbsent})</span>
            <span>पृष्ठ: ${p + 1} / ${totalPages}</span>
          </div>
        </div>

        <table class="school-record-table">
          <thead>
            <tr>
              <th style="width:50px;">अ.क्र.</th>
              <th>विद्यार्थ्याचे संपूर्ण नाव</th>
              <th style="width:80px;">लिंग</th>
              <th style="width:110px;">हजेरी स्थिती</th>
              <th style="width:110px;">प्राप्त गुण (/${maxLimit})</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <div style="display:flex; justify-content:space-between; margin-top:24px; font-weight:700; font-size:0.95rem; padding:0 10px;">
          <div>वर्गशिक्षक स्वाक्षरी: ________________</div>
          <div>मुख्याध्यापक स्वाक्षरी व शिक्का: ________________</div>
        </div>
      `;

      pagesContainer.appendChild(pageDiv);
    }

    showToast(`शाळेची ${totalPages} पानांची PDF यादी तयार होत आहे...`);
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    let renderPromises = [];
    for (let p = 0; p < totalPages; p++) {
      const pageElement = document.getElementById(`school-print-page-${p}`);
      renderPromises.push(html2canvas(pageElement, { scale: 2, useCORS: true }));
    }

    Promise.all(renderPromises).then(canvases => {
      canvases.forEach((canvas, idx) => {
        if (idx > 0) pdf.addPage();
        const imgData = canvas.toDataURL('image/jpeg', 0.9);
        const pageWidth = 210, pageHeight = 297, margin = 8;
        const maxW = pageWidth - (margin * 2);
        const printH = (canvas.height * maxW) / canvas.width;
        pdf.addImage(imgData, 'JPEG', margin, margin, maxW, Math.min(printH, pageHeight - (margin * 2)));
      });

      const cleanSchoolName = selectedSchoolObj.n.replace(/\s+/g, '_');
      pdf.save(`${cleanSchoolName}_${testName}_सर्व_${totalStudents}_विद्यार्थी_गुण_यादी.pdf`);
      showToast(`शाळेची संपूर्ण ${totalPages} पानांची PDF डाऊनलोड झाली!`);
    });
  });
}

/* ================= 7. गुणवत्ता सन्मान प्रमाणपत्र व बॅनर ================= */
function openCertificateModal(name, school, udise, taluka, marks, rankText, gender, maxMarks) {
  currentCertStudentName = name.trim();
  
  const stdNameEl = document.getElementById('cert-std-name');
  if (stdNameEl) {
    stdNameEl.innerText = name;
    stdNameEl.style.fontFamily = CERT_CONFIG.nameFont || "'Yatra One', cursive";
  }
  
  const classMap = { 
    'navodaya': 'इयत्ता 5 वी (नवोदय)', 
    '4th': 'इयत्ता चौथी शिष्यवृत्ती', 
    '7th': 'इयत्ता सातवी शिष्यवृत्ती', 
    'nmms': 'NMMS (8 वी)' 
  };
  const className = classMap[currentSelectedCategory] || 'इयत्ता 5 वी (नवोदय)';

  const isGirl = (gender === "मुलगी" || gender === "girl");
  const pronoun = isGirl ? "या विद्यार्थिनीने" : "या विद्यार्थ्याने";

  const examNames = {
    'navodaya': 'नवोदय प्रवेश परीक्षा (5 वी)',
    '4th': '4 थी शिष्यवृत्ती परीक्षा',
    '7th': '7 वी शिष्यवृत्ती परीक्षा',
    'nmms': 'NMMS शिष्यवृत्ती परीक्षा (8 वी)'
  };
  const examTitle = examNames[currentSelectedCategory] || 'सराव परीक्षा';
  const totalM = maxMarks || getMaxMarksForTest(currentSelectedCategory, currentSelectedTest);
  const testDisplayName = getTestDisplayName(currentSelectedCategory, currentSelectedTest);

  const titleEl = document.getElementById('cert-render-title');
  if (titleEl) {
    titleEl.innerText = CERT_CONFIG.title || "गुणवत्ता सन्मान प्रमाणपत्र";
    titleEl.style.fontFamily = CERT_CONFIG.titleFont || "'Rozha One', serif";
  }

  document.getElementById('cert-render-sign').innerText = CERT_CONFIG.sign || "शिक्षणाधिकारी (प्राथमिक), जिल्हा परिषद बीड";

  let bodyHtml = CERT_CONFIG.body || "";
  bodyHtml = bodyHtml.replace(/{NAME}/g, name)
                     .replace(/{CLASS}/g, className)
                     .replace(/{SCHOOL}/g, school)
                     .replace(/{UDISE}/g, udise)
                     .replace(/{TALUKA}/g, taluka)
                     .replace(/{PRONOUN}/g, pronoun)
                     .replace(/{EXAM}/g, examTitle)
                     .replace(/{TEST}/g, testDisplayName)
                     .replace(/{MARKS}/g, marks)
                     .replace(/{TOTAL}/g, totalM)
                     .replace(/{RANK}/g, rankText);

  const renderBody = document.getElementById('cert-render-body');
  renderBody.innerHTML = bodyHtml;
  renderBody.style.fontSize = (CERT_CONFIG.fontSize || 16) + 'px';
  renderBody.style.lineHeight = CERT_CONFIG.lineHeight || 1.85;

  document.getElementById('cert-marks').innerHTML = `<i class="fa-solid fa-star"></i> प्राप्त गुण: ${marks} / ${totalM}`;
  document.getElementById('cert-rank-text').innerHTML = `<i class="fa-solid fa-trophy"></i> ${rankText}`;

  const today = new Date();
  const dd = String(today.getDate()).padStart(2, '0');
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const yyyy = today.getFullYear();
  document.getElementById('cert-date-text').innerText = `Date: ${dd}/${mm}/${yyyy}`;

  document.getElementById('certModal').style.display = 'flex';
}

function downloadCertificatePDF() {
  const { jsPDF } = window.jspdf;
  const card = document.getElementById('cert-card-render');
  showToast('प्रमाणपत्र PDF तयार होत आहे...');

  html2canvas(card, { scale: 1.8, useCORS: true, letterRendering: true }).then(canvas => {
    const imgData = canvas.toDataURL('image/jpeg', 0.88);
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = 297, pageHeight = 210, margin = 8;
    const maxW = pageWidth - (margin * 2);
    const maxH = pageHeight - (margin * 2);

    const imgRatio = canvas.width / canvas.height;
    let printW = maxW;
    let printH = printW / imgRatio;

    if (printH > maxH) {
      printH = maxH;
      printW = printH * imgRatio;
    }

    const posX = (pageWidth - printW) / 2;
    const posY = (pageHeight - printH) / 2;

    pdf.addImage(imgData, 'JPEG', posX, posY, printW, printH);
    const cleanName = currentCertStudentName.replace(/\s+/g, '_');
    pdf.save(`Certificate_${cleanName}.pdf`);
    showToast('प्रमाणपत्र PDF डाऊनलोड झाले!');
  });
}

function openDeclaredBanner(testNum, type, scopeName) {
  const declaredCat = DECLARED_DATA_STORE[currentSelectedCategory];
  const testData = declaredCat ? declaredCat[`test_${testNum}`] : null;
  if (!testData) return;

  const listEl = document.getElementById('banner-toppers-list');
  listEl.innerHTML = '';

  const maxM = getMaxMarksForTest(currentSelectedCategory, testNum);

  const examNames = {
    'navodaya': 'नवोदय प्रवेश परीक्षा (5 वी)',
    '4th': '4 थी शिष्यवृत्ती परीक्षा',
    '7th': '7 वी शिष्यवृत्ती परीक्षा',
    'nmms': 'NMMS शिष्यवृत्ती परीक्षा (8 वी)'
  };
  const examTitle = examNames[currentSelectedCategory] || 'सराव परीक्षा';
  const testDisplayName = getTestDisplayName(currentSelectedCategory, testNum);

  let titleText = "";
  let toppersList = [];

  if (type === 'district') {
    titleText = `बीड जिल्हा Top 10 गुणवत्ता यादी`;
    toppersList = testData.districtToppers || [];
  } else if (type === 'taluka') {
    const selTaluka = scopeName || selectedTopperTaluka || TALUKA_LIST[0];
    titleText = `${selTaluka} तालुका Top 10 गुणवत्ता यादी`;
    toppersList = (testData.talukaToppers && testData.talukaToppers[selTaluka]) ? testData.talukaToppers[selTaluka] : [];
  } else if (type === 'kendra') {
    const selKendra = scopeName || "केंद्र";
    titleText = `${selKendra} केंद्र Top 10 गुणवत्ता यादी`;
    toppersList = (testData.kendraToppers && testData.kendraToppers[selKendra]) ? testData.kendraToppers[selKendra] : [];
  }

  document.getElementById('banner-render-exam-name').innerText = examTitle;
  document.getElementById('banner-heading-text').innerText = titleText;
  document.getElementById('banner-sub-text').innerText = `${testDisplayName} अधिकृत निकाल`;
  document.getElementById('banner-render-badge').innerText = BANNER_CONFIG.badge || "💐 हार्दिक अभिनंदन ! हार्दिक अभिनंदन ! 💐";
  document.getElementById('banner-render-footer').innerText = BANNER_CONFIG.footer || "🎯 शिक्षण विभाग, जिल्हा परिषद बीड";

  toppersList.forEach((st, idx) => {
    const medal = (idx === 0) ? '🥇 ' : (idx === 1) ? '🥈 ' : (idx === 2) ? '🥉 ' : '🎖️ ';
    listEl.innerHTML += `
      <div class="banner-row">
        <div>${medal} <span class="b-std-name">${idx + 1}. ${st.name}</span> <span class="b-sch-name">(${st.school})</span></div>
        <div class="b-marks-badge">${st.marks}/${maxM} गुण</div>
      </div>
    `;
  });

  document.getElementById('bannerModal').style.display = 'flex';

  setTimeout(() => {
    const container = document.getElementById('banner-fit-container');
    const bannerCard = document.getElementById('banner-card-render');
    if (container && bannerCard) {
      const availWidth = container.clientWidth - 20;
      const cardWidth = 720;
      if (availWidth < cardWidth) {
        const scaleRatio = availWidth / cardWidth;
        bannerCard.style.transform = `scale(${scaleRatio})`;
        container.style.height = `${1020 * scaleRatio + 15}px`;
      } else {
        bannerCard.style.transform = 'scale(1)';
        container.style.height = 'auto';
      }
    }
  }, 50);
}

function downloadBannerPDF() {
  const { jsPDF } = window.jspdf;
  const card = document.getElementById('banner-card-render');
  showToast('बॅनर PDF तयार होत आहे...');

  const prevTransform = card.style.transform;
  card.style.transform = 'scale(1)';

  html2canvas(card, { scale: 2, useCORS: true }).then(canvas => {
    card.style.transform = prevTransform;
    const imgData = canvas.toDataURL('image/jpeg', 0.9);
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = 210, pageHeight = 297, margin = 8;
    const maxW = pageWidth - (margin * 2);
    const maxH = pageHeight - (margin * 2);

    const imgRatio = canvas.width / canvas.height;
    let printW = maxW;
    let printH = printW / imgRatio;

    if (printH > maxH) {
      printH = maxH;
      printW = printH * imgRatio;
    }

    const posX = (pageWidth - printW) / 2;
    const posY = (pageHeight - printH) / 2;

    pdf.addImage(imgData, 'JPEG', posX, posY, printW, printH);
    pdf.save(`Banner_Beed_${currentSelectedTest}.pdf`);
    showToast('बॅनर PDF डाऊनलोड झाले!');
  }).catch(err => {
    card.style.transform = prevTransform;
    showCustomAlert("त्रुटी: " + err.message);
  });
}

function openReportCardModal(studentId, studentName) {
  if (!selectedSchoolObj) return;

  document.getElementById('rc-student-name').innerText = studentName;
  document.getElementById('rc-school-name').innerText = selectedSchoolObj.n;
  document.getElementById('rc-taluka-name').innerText = selectedSchoolObj.t || '-';
  document.getElementById('rc-udise').innerText = selectedSchoolObj.c;
  const classMap = { 'navodaya': 'Class 5th', '4th': 'Class 4th', '7th': 'Class 7th', 'nmms': 'Class 8th' };
  document.getElementById('rc-class-name').innerText = classMap[currentEntryCategory] || '-';

  const tests = getTestsListForCategory(currentEntryCategory);
  const key = getSchoolDbKey();
  const theadRow = document.getElementById('rc-thead-row');
  const marksRow = document.getElementById('rc-marks-row');
  const graphBars = document.getElementById('rc-graph-bars');

  theadRow.innerHTML = '';
  marksRow.innerHTML = '';
  graphBars.innerHTML = '';

  tests.forEach(t => {
    theadRow.innerHTML += `<th style="border:1.5px solid #cbd5e1; padding:6px 4px;">T${t.no}</th>`;
  });
  theadRow.innerHTML += `<th style="border:1.5px solid #cbd5e1; padding:6px 4px; color:var(--sky-dark);">Avg %</th>`;

  let promises = tests.map(t => db.ref(`results/${currentEntryCategory}/test_${t.no}/${key}`).once('value'));

  Promise.all(promises).then(snapshots => {
    let total = 0, count = 0, totalMaxSum = 0;

    snapshots.forEach((snap, idx) => {
      const tItem = tests[idx];
      const tNum = tItem.no;
      const maxLimit = getMaxMarksForTest(currentEntryCategory, tNum);
      const val = snap.val();
      let m = '-';

      if (val && val.students) {
        const found = val.students.find(s => s.id === studentId || s.name === studentName);
        if (found && found.marks !== '') {
          const mStr = String(found.marks).toUpperCase();
          if (mStr === 'AB') {
            m = 'AB';
          } else {
            m = parseFloat(found.marks);
            total += m;
            totalMaxSum += maxLimit;
            count++;
          }
        }
      }

      marksRow.innerHTML += `<td style="border:1.5px solid #cbd5e1; padding:6px 4px;">${m}</td>`;

      const heightPercent = (m !== '-' && m !== 'AB' && maxLimit > 0) ? ((m / maxLimit) * 100) : 0;
      graphBars.innerHTML += `
        <div style="flex:1; display:flex; flex-direction:column; align-items:center; height:100%; justify-content:flex-end;">
          <span style="font-size:0.75rem; font-weight:800; font-family:'Poppins', sans-serif; color:#0f172a; margin-bottom:2px;">${m !== '-' ? m : ''}</span>
          <div style="width:70%; max-width:24px; background:linear-gradient(to top, #0284c7, #38bdf8); border-radius:4px 4px 0 0; height:${heightPercent}%; min-height:${heightPercent > 0 ? 4 : 0}px;"></div>
          <span style="font-size:0.78rem; font-weight:800; color:#64748b; font-family:'Poppins', sans-serif; margin-top:3px;">T${tNum}</span>
        </div>
      `;
    });

    const avgPercent = (totalMaxSum > 0) ? ((total / totalMaxSum) * 100).toFixed(1) : 0;
    marksRow.innerHTML += `<td style="border:1.5px solid #cbd5e1; padding:6px 4px; color:#0284c7; font-weight:800;">${avgPercent}%</td>`;

    let remark = "उत्कृष्ट कामगिरी व सातत्यपूर्ण प्रगती!";
    if (avgPercent < 50) remark = "विशेष मार्गदर्शनाची व सरावाची आवश्यकता आहे.";
    else if (avgPercent < 75) remark = "चांगली प्रगती, काठिण्य पातळीनुसार अधिक सराव हवा.";
    document.getElementById('rc-remark-text').innerText = remark;

    document.getElementById('reportCardModal').style.display = 'flex';
  });
}

function downloadReportCardPDF() {
  const { jsPDF } = window.jspdf;
  const card = document.getElementById('report-card-render');
  html2canvas(card, { scale: 2 }).then(canvas => {
    const imgData = canvas.toDataURL('image/jpeg', 0.85);
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const imgWidth = 190;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    pdf.addImage(imgData, 'JPEG', 10, 15, imgWidth, imgHeight);
    
    const stdName = document.getElementById('rc-student-name').innerText.trim().replace(/\s+/g, '_');
    pdf.save(`Report_Card_${stdName}.pdf`);
  });
}

/* ================= 8. ॲडमिन पॅनल व्यवस्थापन व निकाल लॉकिंग ================= */
function onAdminTManageCategoryChange() {
  refreshAdminTestManagerUI();
}

function refreshAdminTestManagerUI() {
  const cat = document.getElementById('admin-tmanage-category') ? document.getElementById('admin-tmanage-category').value : 'navodaya';
  const tests = getTestsListForCategory(cat);
  const activeTest = getAutoActiveTest(cat);

  const actSelect = document.getElementById('admin-active-test-select');
  if (actSelect) {
    actSelect.innerHTML = '';
    tests.forEach(t => {
      actSelect.innerHTML += `<option value="${t.no}" ${t.no === activeTest ? 'selected' : ''}>${t.name}</option>`;
    });
  }

  const renSelect = document.getElementById('admin-rename-test-select');
  if (renSelect) {
    renSelect.innerHTML = '';
    tests.forEach(t => {
      renSelect.innerHTML += `<option value="${t.no}">${t.name}</option>`;
    });
  }
}

function saveAdminActiveTest() {
  const cat = document.getElementById('admin-tmanage-category').value;
  const testNo = parseInt(document.getElementById('admin-active-test-select').value, 10);

  db.ref(`active_tests/${cat}`).set(testNo).then(() => {
    ACTIVE_TESTS_STORE[cat] = testNo;
    showToast(`सध्या ${getTestDisplayName(cat, testNo)} सुरू केली!`);
  });
}

function saveTestRenaming() {
  const cat = document.getElementById('admin-tmanage-category').value;
  const tNo = parseInt(document.getElementById('admin-rename-test-select').value, 10);
  const newName = document.getElementById('admin-rename-test-input').value.trim();

  if (!newName) {
    showCustomAlert('कृपया चाचणीचे नाव भरा!');
    return;
  }

  let tests = JSON.parse(JSON.stringify(getTestsListForCategory(cat)));
  const idx = tests.findIndex(t => t.no === tNo);
  if (idx !== -1) {
    tests[idx].name = newName;
  } else {
    tests.push({ no: tNo, name: newName });
  }

  db.ref(`test_definitions/${cat}`).set(tests).then(() => {
    TEST_DEFINITIONS_STORE[cat] = tests;
    showToast('नाव बदलले!');
    refreshAdminTestManagerUI();
    buildDashboardTestPills();
  });
}

function addNewTestDefinition() {
  const cat = document.getElementById('admin-tmanage-category').value;
  const newNo = parseInt(document.getElementById('admin-add-test-no').value, 10);
  const newName = document.getElementById('admin-add-test-name').value.trim();

  if (!newName) {
    showCustomAlert('कृपया नवीन चाचणीचे नाव भरा!');
    return;
  }

  let tests = JSON.parse(JSON.stringify(getTestsListForCategory(cat)));
  tests.push({ no: newNo, name: newName });

  db.ref(`test_definitions/${cat}`).set(tests).then(() => {
    TEST_DEFINITIONS_STORE[cat] = tests;
    showToast('नवीन चाचणी जोडली!');
    refreshAdminTestManagerUI();
    buildDashboardTestPills();
  });
}

function initAdminPanelOptions() {
  refreshAdminTestManagerUI();
  updateAdminTestOptions();
  updateAdminLockTestOptions();
  loadCurrentCustomMaxMarks();
  updateAdminMaxMarksInfo();
}

function updateAdminTestOptions() {
  const cat = document.getElementById('admin-mm-category').value;
  const admMmTest = document.getElementById('admin-mm-test');
  if (!admMmTest) return;

  const tests = getTestsListForCategory(cat);
  admMmTest.innerHTML = '';
  tests.forEach(t => {
    admMmTest.innerHTML += `<option value="${t.no}">${t.name}</option>`;
  });
}

function updateAdminLockTestOptions() {
  const cat = document.getElementById('admin-lock-category').value;
  const admLockTest = document.getElementById('admin-lock-test');
  if (!admLockTest) return;

  const tests = getTestsListForCategory(cat);
  admLockTest.innerHTML = '';
  tests.forEach(t => {
    admLockTest.innerHTML += `<option value="${t.no}">${t.name}</option>`;
  });
}

function loadCurrentCustomMaxMarks() {
  const cat = document.getElementById('admin-mm-category').value;
  const testNo = parseInt(document.getElementById('admin-mm-test').value, 10) || getAutoActiveTest(cat);
  const currentVal = getMaxMarksForTest(cat, testNo);
  const inp = document.getElementById('admin-mm-input');
  if (inp) inp.value = currentVal;
}

function saveCustomMaxMarks() {
  const cat = document.getElementById('admin-mm-category').value;
  const testNo = parseInt(document.getElementById('admin-mm-test').value, 10) || getAutoActiveTest(cat);
  const val = parseInt(document.getElementById('admin-mm-input').value, 10);

  if (!val || val <= 0) {
    showCustomAlert('कृपया वैध एकूण गुण भरा (उदा. 50 किंवा 100)!');
    return;
  }

  const key = `${cat}_test_${testNo}`;
  db.ref(`custom_max_marks/${key}`).set(val).then(() => {
    showToast('या चाचणीचे एकूण गुण सुरक्षित सेव्ह झाले!');
    showCustomAlert(`यशस्वी! ${getTestDisplayName(cat, testNo)} चे एकूण गुण ${val} निश्चित केले आहेत.`);
    updateAdminMaxMarksInfo();
  }).catch(err => showCustomAlert('त्रुटी: ' + err.message));
}

function updateAdminMaxMarksInfo() {
  const cat = document.getElementById('admin-lock-category').value;
  const testNo = parseInt(document.getElementById('admin-lock-test').value, 10) || getAutoActiveTest(cat);
  const maxM = getMaxMarksForTest(cat, testNo);
  const info = document.getElementById('admin-max-marks-info');
  if (info) {
    info.innerText = `* या चाचणीचे कमाल गुण: ${maxM} पैकी धरले जातील.`;
  }
}

function openPreLockReviewModal() {
  const cat = document.getElementById('admin-lock-category').value;
  const testNo = document.getElementById('admin-lock-test').value;
  const maxM = getMaxMarksForTest(cat, parseInt(testNo, 10));

  showToast('तात्पुरती गुणवत्ता यादी संकलित होत आहे...');

  db.ref(`results/${cat}/test_${testNo}`).once('value', (snap) => {
    const data = snap.val() || {};
    let allStudents = [];
    let talukaWise = {};

    Object.values(data).forEach(entry => {
      if (entry.students && Array.isArray(entry.students)) {
        entry.students.forEach(st => {
          if (st.marks !== '' && String(st.marks).toUpperCase() !== 'AB') {
            const marksNum = parseFloat(st.marks) || 0;
            const rec = {
              name: st.name,
              school: entry.school,
              taluka: entry.taluka || 'इतर',
              udise: entry.udise || '-',
              marks: marksNum,
              gender: st.gender || 'मुलगा'
            };
            allStudents.push(rec);

            if (!talukaWise[entry.taluka]) talukaWise[entry.taluka] = [];
            talukaWise[entry.taluka].push(rec);
          }
        });
      }
    });

    allStudents.sort((a,b) => b.marks - a.marks);
    const districtToppers = allStudents.slice(0, 10);

    let talukaToppers = {};
    Object.keys(talukaWise).forEach(tName => {
      talukaWise[tName].sort((a,b) => b.marks - a.marks);
      talukaToppers[tName] = talukaWise[tName].slice(0, 10);
    });

    PRE_LOCK_CALCULATED_DATA = {
      cat: cat,
      testNo: testNo,
      maxM: maxM,
      districtToppers: districtToppers,
      talukaToppers: talukaToppers
    };

    renderPreLockDistrictReview();
    document.getElementById('preLockReviewModal').style.display = 'flex';
  });
}

function renderPreLockDistrictReview() {
  if (!PRE_LOCK_CALCULATED_DATA) return;
  const area = document.getElementById('pre-lock-content-area');
  const list = PRE_LOCK_CALCULATED_DATA.districtToppers || [];
  const maxM = PRE_LOCK_CALCULATED_DATA.maxM;

  area.innerHTML = `<h4 style="color:#0f2b5c; font-size:1.02rem; margin-bottom:8px;"><i class="fa-solid fa-trophy" style="color:var(--gold);"></i> बीड जिल्हा Top 10 प्रिव्ह्यू:</h4>`;

  if (list.length === 0) {
    area.innerHTML += `<p style="text-align:center; color:#64748b; padding:12px;">अद्याप गुण नोंदवलेले नाहीत.</p>`;
    return;
  }

  list.forEach((st, idx) => {
    area.innerHTML += `
      <div class="topper-card">
        <div class="topper-rank">#${idx + 1}</div>
        <div class="topper-details">
          <h4>${st.name}</h4>
          <p>${st.school} (${st.taluka})</p>
        </div>
        <div class="topper-score">
          <span class="topper-score-badge">${st.marks}/${maxM} गुण</span>
        </div>
      </div>
    `;
  });
}

function renderPreLockTalukaReview(talukaName) {
  if (!PRE_LOCK_CALCULATED_DATA || !talukaName) return;
  const area = document.getElementById('pre-lock-content-area');
  const tToppers = PRE_LOCK_CALCULATED_DATA.talukaToppers[talukaName] || [];
  const maxM = PRE_LOCK_CALCULATED_DATA.maxM;

  area.innerHTML = `<h4 style="color:#059669; font-size:1.02rem; margin-bottom:8px;"><i class="fa-solid fa-award"></i> ${talukaName} तालुका Top 10 प्रिव्ह्यू:</h4>`;

  if (tToppers.length === 0) {
    area.innerHTML += `<p style="text-align:center; color:#64748b; padding:12px;">या तालुक्यात अद्याप गुण उपलब्ध नाहीत.</p>`;
    return;
  }

  tToppers.forEach((st, idx) => {
    area.innerHTML += `
      <div class="topper-card">
        <div class="topper-rank">#${idx + 1}</div>
        <div class="topper-details">
          <h4>${st.name}</h4>
          <p>${st.school}</p>
        </div>
        <div class="topper-score">
          <span class="topper-score-badge">${st.marks}/${maxM} गुण</span>
        </div>
      </div>
    `;
  });
}

function declareAndLockResults() {
  const cat = document.getElementById('admin-lock-category').value;
  const testNo = document.getElementById('admin-lock-test').value;
  const maxM = getMaxMarksForTest(cat, parseInt(testNo, 10));

  showCustomConfirm(`तुम्ही सर्व जिल्हा व तालुका टॉपर्स तपासले आहेत का? निकाल लॉक केल्यास ते अधिकृत म्हणून सर्व पोर्टलवर जाहीर होतील!`, () => {
    showToast('गुणांची गणना व अधिकृत लॉकिंग सुरू आहे...');

    db.ref(`results/${cat}/test_${testNo}`).once('value', (snap) => {
      const data = snap.val() || {};
      let allStudents = [];
      let talukaWise = {};

      Object.values(data).forEach(entry => {
        if (entry.students && Array.isArray(entry.students)) {
          entry.students.forEach(st => {
            if (st.marks !== '' && String(st.marks).toUpperCase() !== 'AB') {
              const marksNum = parseFloat(st.marks) || 0;
              const rec = {
                name: st.name,
                school: entry.school,
                taluka: entry.taluka || 'इतर',
                udise: entry.udise || '-',
                marks: marksNum,
                gender: st.gender || 'मुलगा'
              };
              allStudents.push(rec);

              if (!talukaWise[entry.taluka]) talukaWise[entry.taluka] = [];
              talukaWise[entry.taluka].push(rec);
            }
          });
        }
      });

      allStudents.sort((a,b) => b.marks - a.marks);
      const districtToppers = allStudents.slice(0, 10);

      let talukaToppers = {};
      Object.keys(talukaWise).forEach(tName => {
        talukaWise[tName].sort((a,b) => b.marks - a.marks);
        talukaToppers[tName] = talukaWise[tName].slice(0, 10);
      });

      const payload = {
        declaredAt: new Date().toISOString(),
        maxMarks: maxM,
        districtToppers: districtToppers,
        talukaToppers: talukaToppers
      };

      db.ref(`declared_toppers/${cat}/test_${testNo}`).set(payload).then(() => {
        showCustomAlert(`अभिनंदन! ${getTestDisplayName(cat, testNo)} चे अधिकृत निकाल यशस्वीरित्या जाहीर व लॉक झाले आहेत!`);
        showToast('निकाल यशस्वीरित्या जाहीर झाले!');
      }).catch(err => showCustomAlert('लॉकिंग त्रुटी: ' + err.message));
    });
  });
}

/* ================= 9. कस्टम अलर्ट्स व नेव्हिगेशन ================= */
function switchTab(view) {
  document.getElementById('screen-dashboard').style.display = (view === 'dashboard') ? 'block' : 'none';
  document.getElementById('screen-entry').style.display = (view === 'entry') ? 'block' : 'none';
  document.getElementById('screen-admin-backend').style.display = (view === 'admin') ? 'block' : 'none';

  document.getElementById('nav-btn-dash').classList.toggle('active', view === 'dashboard');
  document.getElementById('nav-btn-entry').classList.toggle('active', view === 'entry');
  
  if (view === 'entry') {
    const autoTest = getAutoActiveTest(currentEntryCategory);
    document.getElementById('entry-test-no').value = autoTest;
    updateEntryNotice(autoTest);
    if (selectedSchoolObj) {
      loadStudentMarksForSelectedTest();
    }
  } else if (view === 'admin') {
    refreshAdminTestManagerUI();
    updateAdminTestOptions();
    updateAdminLockTestOptions();
    initNavodayaAkTestOptions();
  }
  window.scrollTo(0, 0);
}

function updateEntryNotice(testNo) {
  const disp = document.getElementById('entry-active-test-display');
  const notice = document.getElementById('entry-locked-test-notice');
  const badge = document.getElementById('entry-total-marks-badge');
  const maxM = getMaxMarksForTest(currentEntryCategory, testNo);
  const testName = getTestDisplayName(currentEntryCategory, testNo);

  if (disp) disp.innerText = testName;
  if (notice) notice.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> सूचना: सध्या फक्त <strong>${testName}</strong> चे गुण भरणे सुरू आहे. केवळ याच चाचणीचे गुण भरा.`;
  if (badge) badge.innerText = `${maxM} पैकी गुण`;
}

function handleSecretAdminTrigger() {
  adminClickCount++;
  clearTimeout(adminClickTimer);
  adminClickTimer = setTimeout(() => { adminClickCount = 0; }, 1000);

  if (adminClickCount === 3) {
    adminClickCount = 0;
    const pin = prompt("शिक्षणाधिकारी (प्राथमिक) गुप्त ॲडमिन पिन टाका:");
    if (pin === 'beed2026' || pin === '2026' || pin === 'admin') {
      showToast('शिक्षणाधिकारी कक्ष उघडत आहे...');
      switchTab('admin');
    } else if (pin !== null) {
      showCustomAlert('चुकीचा पिन क्रमांक!');
    }
  }
}

function showCustomAlert(message) {
  document.getElementById('customNoticeBody').innerText = message;
  document.getElementById('customNoticeActions').innerHTML = `
    <button class="app-btn btn-primary" style="height:40px; width:auto; padding:0 24px;" onclick="closeModal('customNoticeModal')">समजले</button>
  `;
  document.getElementById('customNoticeModal').style.display = 'flex';
}

function showCustomConfirm(message, onConfirm, onCancel) {
  document.getElementById('customNoticeBody').innerText = message;
  document.getElementById('customNoticeActions').innerHTML = `
    <button class="app-btn btn-outline" style="height:38px; width:auto; padding:0 18px;" id="cnCancelBtn">रद्द करा</button>
    <button class="app-btn btn-danger" style="height:38px; width:auto; padding:0 22px;" id="cnOkBtn">होय</button>
  `;
  document.getElementById('customNoticeModal').style.display = 'flex';

  document.getElementById('cnOkBtn').onclick = () => {
    closeModal('customNoticeModal');
    if (onConfirm) onConfirm();
  };
  document.getElementById('cnCancelBtn').onclick = () => {
    closeModal('customNoticeModal');
    if (onCancel) onCancel();
  };
}

window.addEventListener('popstate', function(event) {
  const openModal = document.querySelector('.modal[style*="display: flex"]');
  if (openModal) {
    openModal.style.display = 'none';
    try { history.pushState({ page: 'home' }, ''); } catch(e) {}
    return;
  }

  const activeView = ['screen-entry', 'screen-admin-backend'].find(id => {
    const el = document.getElementById(id);
    return el && el.style.display !== 'none';
  });

  if (activeView) {
    switchTab('dashboard');
    try { history.pushState({ page: 'home' }, ''); } catch(e) {}
    return;
  }

  showCustomConfirm("आपणास हे ॲप बंद करायचे आहे का?", () => {
    history.back();
  }, () => {
    try { history.pushState({ page: 'home' }, ''); } catch(e) {}
  });
});

function showToast(msg) {
  const t = document.getElementById('toastMsg');
  t.innerText = msg;
  t.style.display = 'block';
  setTimeout(() => { t.style.display = 'none'; }, 2200);
}

function closeModal(id) { 
  document.getElementById(id).style.display = 'none'; 
}
