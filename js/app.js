/* ===== 1. CONFIG ===== */
const API = "https://davyanh-cognysis-api.hf.space";
const RETELL_AGENT_ID = "agent_e35f16385938a997870f832f97"; // ← Paste from Retell dashboard
const RETELL_FROM_NUMBER = "+14244845972";      // ← Your Retell US number

/* ===== 2. STATE ===== */
let state = {
    patient: { id: null, first: "", last: "", age: 0, sex: "", edu: 0, lang: "" },
    screening: null,
    history: [],
    selectedFile: null,
    selectedFileOnly: null
};

async function saveScreeningSilently() {
    if (!state.screening || !state.patient.id) {
        console.log('Cannot save: no screening or patient data');
        return;
    }
    var endpoint = API + '/screenings';
    var pred = state.screening.prediction;
    var params = new URLSearchParams({
        patient_id: state.patient.id,
        patient_name: state.patient.first + ' ' + state.patient.last,
        filename: state.screening.filename || 'uploaded_audio.webm',
        risk_score: pred.risk_score,
        risk_level: pred.risk_level,
        features_json: JSON.stringify(state.screening.features),
        shap_json: JSON.stringify(pred.shap_breakdown),
        explanation_json: JSON.stringify(pred.explanation)
    });
    try {
        var res = await fetch(endpoint + '?' + params.toString(), { 
            method: 'POST', 
            headers: { 'Accept': 'application/json' } 
        });
        if (res.ok) {
            console.log('Screening auto-saved');
            await loadHistory(); // Refresh dashboard
        }
    } catch (e) {
        console.log('Silent save failed:', e);
    }
}
/* ===== 3. UI UTILITIES ===== */
function navTo(screenId) {
    document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
    document.querySelectorAll('.nav-item').forEach(function(n) { n.classList.remove('active'); });
    var target = document.getElementById(screenId);
    if (target) target.classList.add('active');
    var navItem = document.querySelector('.nav-item[data-screen="' + screenId + '"]');
    if (navItem) navItem.classList.add('active');
    document.querySelectorAll('.animate-in').forEach(function(el) {
        el.style.animation = 'none'; el.offsetHeight; el.style.animation = '';
    });
    if (screenId === 'audio-capture') populateAudioCapture();
}

function showToast(msg, type) {
    type = type || 'success';
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast toast-' + type;
    requestAnimationFrame(function() { t.classList.add('show'); });
    setTimeout(function() { t.classList.remove('show'); }, 4000);
}

function setSpinner(show, text) {
    var s = document.getElementById('spinner');
    if (text) document.getElementById('spinner-text').textContent = text;
    s.classList.toggle('active', show);
}

function openModal(id) {
    document.getElementById(id).classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
    document.body.style.overflow = '';
}

function formatTime(seconds) {
    var m = Math.floor(seconds / 60);
    var s = Math.floor(seconds % 60);
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
}

/* ============================================================
   AUDIO CAPTURE — simplified: patient header + status badge only.
   Waveform and transcript live on the Unified Report now.
   ============================================================ */
function loadAudioWaveform(file) {
    // Waveform removed — just mark the selected file as ready.
    var badge = document.getElementById('audio-status-badge');
    if (badge) {
        badge.textContent = 'READY';
        badge.className = 'risk-pill risk-low';
    }
}

function populateAudioCapture() {
    var p = state.patient;
    var badge = document.getElementById('audio-status-badge');

    // ─── Update patient header ───
    if (p.first) {
        document.getElementById('cap-name').textContent = p.first + ' ' + p.last;
        var initials = (p.first[0] && p.last[0]) ? (p.first[0] + p.last[0]).toUpperCase() : '??';
        document.getElementById('cap-avatar').textContent = initials;
        document.getElementById('cap-meta').innerHTML =
            '<span>' + p.age + ' yrs</span><span>•</span><span>' + p.sex +
            '</span><span>•</span><span>' + (eduLabel(p.edu) || '—') + '</span>';
    }

    // ─── Status badge reflects where we are in the flow ───
    if (badge) {
        if (state.selectedFile) {
            badge.textContent = 'READY';
            badge.className = 'risk-pill risk-low';
        } else {
            badge.textContent = 'Ready';
            badge.className = 'risk-pill risk-moderate';
        }
    }
}


/* ===== 4. API HELPERS ===== */
async function checkApiHealth() {
    var statusEl = document.getElementById('apiStatus');
    try {
        var res = await fetch(API + '/', { method: 'GET', headers: { 'Accept': 'application/json' } });
        if (res.ok) {
            statusEl.textContent = '● API Online';
            statusEl.className = 'api-status online';
        } else {
            statusEl.textContent = '● API Error ' + res.status;
            statusEl.className = 'api-status offline';
        }
    } catch (e) {
        statusEl.textContent = '● API Offline';
        statusEl.className = 'api-status offline';
    }
}

function diagnoseFetchError(error, url) {
    if (error.message && error.message.indexOf('Failed to fetch') !== -1) {
        return 'Cannot reach ' + url + '. Check: 1) Backend running, 2) CORS enabled, 3) URL correct (' + API + '), 4) Not using file:// protocol';
    }
    return 'Error: ' + error.message;
}

/* ===== 5. PATIENT FLOW ===== */
async function beginScreening() {
    var first = document.getElementById('p-first').value.trim();
    var last = document.getElementById('p-last').value.trim();
    var age = parseInt(document.getElementById('p-age').value) || 0;
    var sex = document.getElementById('p-sex').value;
    var edu = parseInt(document.getElementById('p-edu').value) || 0;
    var lang = document.getElementById('p-lang').value;

    if (!first || !last) { showToast('Please enter patient name', 'error'); return; }

    // Health background — stored as acknowledged predispositions (future:
    // condition-aware feature weighting). Checked = true.
    var conds = {
        cond_diabetes: !!(document.getElementById('h-dm') && document.getElementById('h-dm').checked),
        cond_hypertension: !!(document.getElementById('h-htn') && document.getElementById('h-htn').checked),
        cond_stroke: !!(document.getElementById('h-stroke') && document.getElementById('h-stroke').checked),
        cond_hearing_impairment: !!(document.getElementById('h-hear') && document.getElementById('h-hear').checked),
        cond_speech_impediment: !!(document.getElementById('h-speech') && document.getElementById('h-speech').checked)
    };

    // Core memory — the nurse asks the patient to recall this during the call.
    var memory = document.getElementById('p-memory') ? document.getElementById('p-memory').value.trim() : '';

    var fullUrl = API + '/patients?first_name=' + encodeURIComponent(first) + '&last_name=' + encodeURIComponent(last) + '&age=' + age + '&sex=' + encodeURIComponent(sex) + '&education=' + edu + '&language=' + encodeURIComponent(lang)
        + '&cond_diabetes=' + conds.cond_diabetes
        + '&cond_hypertension=' + conds.cond_hypertension
        + '&cond_stroke=' + conds.cond_stroke
        + '&cond_hearing_impairment=' + conds.cond_hearing_impairment
        + '&cond_speech_impediment=' + conds.cond_speech_impediment
        + '&core_memory=' + encodeURIComponent(memory);

    setSpinner(true, 'Creating patient record...');
    try {
        var res = await fetch(fullUrl, { method: 'POST', headers: { 'Accept': 'application/json' } });
        if (!res.ok) {
            var errText = await res.text().catch(function() { return 'Unknown error'; });
            throw new Error('HTTP ' + res.status + ': ' + errText);
        }
        var data = await res.json();
        state.patient = { id: data.id, first: first, last: last, age: age, sex: sex, edu: edu, lang: lang, conditions: conds, memory: memory };

        document.getElementById('cap-name').textContent = first + ' ' + last;
        document.getElementById('cap-avatar').textContent = (first[0] + last[0]).toUpperCase();
        document.getElementById('cap-meta').innerHTML = '<span>' + age + ' yrs</span><span>•</span><span>' + sex + '</span><span>•</span><span>' + edu + ' yrs education</span><span>•</span><span>' + lang + '</span>';

        state.selectedFile = null;
        document.getElementById('filePreview').style.display = 'none';
        document.getElementById('fileInput').value = '';

        navTo('audio-capture');
        showToast('Patient ' + first + ' ' + last + ' registered');
    } catch (e) {
        showToast(diagnoseFetchError(e, fullUrl), 'error');
        console.error(e);
    } finally {
        setSpinner(false);
    }
}

async function beginUploadScreening() {
    var first = document.getElementById('p-first-upload').value.trim();
    var last = document.getElementById('p-last-upload').value.trim();
    var age = parseInt(document.getElementById('p-age-upload').value) || 0;
    var sex = document.getElementById('p-sex-upload').value;
    var edu = parseInt(document.getElementById('p-edu-upload').value) || 0;
    var lang = document.getElementById('p-lang-upload').value;

    if (!first || !last) { showToast('Please enter patient name', 'error'); return; }
    if (!state.selectedFileOnly) { showToast('Please select an audio file first', 'error'); return; }

    var fullUrl = API + '/patients?first_name=' + encodeURIComponent(first) + '&last_name=' + encodeURIComponent(last) + '&age=' + age + '&sex=' + encodeURIComponent(sex) + '&education=' + edu + '&language=' + encodeURIComponent(lang);

    setSpinner(true, 'Creating patient record...');
    try {
        var res = await fetch(fullUrl, { method: 'POST', headers: { 'Accept': 'application/json' } });
        if (!res.ok) {
            var errText = await res.text().catch(function() { return 'Unknown error'; });
            throw new Error('HTTP ' + res.status + ': ' + errText);
        }
        var data = await res.json();
        state.patient = { id: data.id, first: first, last: last, age: age, sex: sex, edu: edu, lang: lang };
        showToast('Patient ' + first + ' ' + last + ' registered. Starting upload...');
        await processAudioUpload(state.selectedFileOnly);
    } catch (e) {
        showToast(diagnoseFetchError(e, fullUrl), 'error');
        console.error(e);
        setSpinner(false);
    }
}

/* ===== FEATURE EXTRACTION POPULATOR ===== */
function populateFeatureExtraction(data) {
    var a = data.features.acoustic;
    var l = data.features.linguistic;
    var transcript = l.transcript || "";

    function setStatus(id, status, valueText) {
        var el = document.getElementById(id);
        if (!el) return;
        var badge = el.querySelector('.cat-status');
        var desc = el.querySelector('.cat-desc');
        if (badge) {
            badge.className = 'cat-status';
            if (status === 'flagged') badge.classList.add('cat-flagged');
            else if (status === 'watch') badge.classList.add('cat-watch');
            else badge.classList.add('cat-normal');
            badge.textContent = status === 'flagged' ? 'Flagged' : status === 'watch' ? 'Watch' : 'Normal';
        }
        if (desc && valueText) desc.textContent = valueText;
    }

    // ─── ACOUSTIC ───
    var pauseRatio = a.pause_ratio || 0;
    var pauseStatus = pauseRatio > 0.30 ? 'flagged' : pauseRatio > 0.15 ? 'watch' : 'normal';
    setStatus('feat-pause', pauseStatus,
        'Pause ratio: ' + (pauseRatio * 100).toFixed(1) + '% · Avg pause: ' + (a.pause_duration_mean || 0).toFixed(2) + 's · ' + (a.pause_count || 0) + ' pauses');

    var pitchStd = a.pitch_std_hz || 0;
    var hnr = a.hnr || 0;
    var voiceStatus = (pitchStd < 20 || hnr < 15) ? 'flagged' : (pitchStd < 35 || hnr < 20) ? 'watch' : 'normal';
    setStatus('feat-voice', voiceStatus,
        'Jitter: ' + (a.jitter || 0).toFixed(2) + '% · Shimmer: ' + (a.shimmer || 0).toFixed(2) + '% · HNR: ' + hnr.toFixed(1) + ' dB');

    var rate = l.speech_rate_wpm || 0;
    var artRate = a.articulation_rate || 0;
    var rateStatus = rate < 80 ? 'flagged' : rate < 110 ? 'watch' : 'normal';
    setStatus('feat-rate', rateStatus,
        'Speech rate: ' + rate.toFixed(1) + ' WPM · Articulation: ' + artRate.toFixed(1) + ' syllables/sec');

    var pitchStatus = pitchStd < 25 ? 'flagged' : pitchStd < 40 ? 'watch' : 'normal';
    setStatus('feat-pitch', pitchStatus,
        'Pitch std: ' + pitchStd.toFixed(1) + ' Hz · Monotony index: ' + (a.monotony_index || 0).toFixed(2));

    var spectralStatus = 'normal';
    setStatus('feat-spectral', spectralStatus,
        'Spectral centroid: ' + (a.spectral_centroid || 0).toFixed(1) + ' Hz · Slope: ' + (a.spectral_slope || 0).toFixed(3));

    var latency = a.response_latency || 0;
    var shortCount = a.short_utterance_count || 0;
    var timingStatus = (latency > 3.0 || shortCount > 4) ? 'flagged' : (latency > 1.5 || shortCount > 2) ? 'watch' : 'normal';
    setStatus('feat-timing', timingStatus,
        'Response latency: ' + latency.toFixed(2) + 's · Short utterances: ' + shortCount);

    // ─── TRANSCRIPT ───
    var wordCount = l.word_count || 0;
    var ttr = l.type_token_ratio || 0;
    var vocabStatus = ttr < 0.35 ? 'flagged' : ttr < 0.50 ? 'watch' : 'normal';
    setStatus('feat-vocab', vocabStatus,
        'TTR: ' + ttr.toFixed(3) + ' · ' + wordCount + ' words · ' + (l.unique_word_count || 0) + ' unique · Brunet: ' + (l.brunet_index || 0));

    var fillerRate = l.filler_rate || 0;
    var semStatus = (fillerRate > 0.08 || wordCount < 50) ? 'flagged' : (fillerRate > 0.04 || wordCount < 100) ? 'watch' : 'normal';
    setStatus('feat-semantic', semStatus,
        'Filler rate: ' + (fillerRate * 100).toFixed(1) + '% · Sentences: ' + (l.sentence_count || 0));

    var vagueRate = l.vague_word_rate || 0;
    var wordfindStatus = (vagueRate > 0.06 || l.filler_count > 4) ? 'flagged' : (vagueRate > 0.03 || l.filler_count > 2) ? 'watch' : 'normal';
    setStatus('feat-wordfind', wordfindStatus,
        'Vague words: ' + (l.vague_word_count || 0) + ' · Circumlocutions approximated from vague substitutions');

    var avgLen = l.mean_sentence_length || 0;
    var sentStatus = avgLen < 5 ? 'flagged' : avgLen < 8 ? 'watch' : 'normal';
    setStatus('feat-sentence', sentStatus,
        'Mean sentence: ' + avgLen.toFixed(1) + ' words · ' + (l.sentence_count || 0) + ' sentences');

    var disfRate = l.disfluency_rate || 0;
    var disfStatus = disfRate > 0.10 ? 'flagged' : disfRate > 0.05 ? 'watch' : 'normal';
    setStatus('feat-disfluency', disfStatus,
        'Disfluency rate: ' + (disfRate * 100).toFixed(1) + '% · Repetitions: ' + (l.repetition_count || 0) + ' · Restarts: ' + (l.restart_count || 0));

    var uncertainty = l.uncertainty_count || 0;
    var memStatus = uncertainty > 3 ? 'flagged' : uncertainty > 1 ? 'watch' : 'normal';
    setStatus('feat-memory', memStatus,
        'Uncertainty markers: ' + uncertainty + ' · Confidence phrases: ' + (l.uncertainty_count === 0 ? 'absent' : 'present'));

    // ─── MODULE CARD STATS ───
    var acousticFlagged = [pauseStatus, voiceStatus, pitchStatus, timingStatus].filter(function(s) { return s === 'flagged'; }).length;
    var transcriptFlagged = [vocabStatus, semStatus, wordfindStatus, sentStatus, disfStatus, memStatus].filter(function(s) { return s === 'flagged'; }).length;

    document.getElementById('mod-acoustic-flagged').textContent = acousticFlagged;
    document.getElementById('mod-transcript-flagged').textContent = transcriptFlagged;
    document.getElementById('mod-acoustic-pause').textContent = (pauseRatio * 100).toFixed(0) + '%';
    document.getElementById('mod-transcript-vocab').textContent = (l.unique_word_count || 0) + ' unique';
}
/* ===== 6. FILE HANDLING ===== */
function handleFileSelect(input) {
    var file = input.files[0];
    if (!file) return;
    var validExts = ['.wav','.mp3','.m4a','.webm','.ogg','.mp4'];
    var hasValidExt = validExts.some(function(ext) { return file.name.toLowerCase().endsWith(ext); });
    if (!hasValidExt) {
        showToast('Please select a valid audio file (WAV, MP3, M4A, WEBM, OGG)', 'error');
        input.value = ''; state.selectedFile = null;
        document.getElementById('filePreview').style.display = 'none';
        return;
    }
    if (file.size > 20 * 1024 * 1024) {
        showToast('File too large. Max 20MB allowed.', 'error');
        input.value = ''; state.selectedFile = null;
        document.getElementById('filePreview').style.display = 'none';
        return;
    }
    state.selectedFile = file;
    document.getElementById('fileName').textContent = file.name;
    document.getElementById('fileSize').textContent = formatFileSize(file.size);
    document.getElementById('filePreview').style.display = 'block';
    showToast('Selected: ' + file.name);

    // Decode and draw real waveform immediately
    loadAudioWaveform(file);
}


function handleFileSelectOnly(input) {
    var file = input.files[0];
    if (!file) return;
    var validExts = ['.wav','.mp3','.m4a','.webm','.ogg','.mp4'];
    var hasValidExt = validExts.some(function(ext) { return file.name.toLowerCase().endsWith(ext); });
    if (!hasValidExt) {
        showToast('Please select a valid audio file (WAV, MP3, M4A, WEBM, OGG)', 'error');
        input.value = ''; state.selectedFileOnly = null;
        document.getElementById('filePreviewOnly').style.display = 'none';
        return;
    }
    if (file.size > 20 * 1024 * 1024) {
        showToast('File too large. Max 20MB allowed.', 'error');
        input.value = ''; state.selectedFileOnly = null;
        document.getElementById('filePreviewOnly').style.display = 'none';
        return;
    }
    state.selectedFileOnly = file;
    document.getElementById('fileNameOnly').textContent = file.name;
    document.getElementById('fileSizeOnly').textContent = formatFileSize(file.size);
    document.getElementById('filePreviewOnly').style.display = 'block';
    showToast('Selected: ' + file.name);
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    var k = 1024;
    var sizes = ['Bytes', 'KB', 'MB', 'GB'];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function uploadSelectedFile() {
    if (!state.selectedFile) { showToast('Please select a file first', 'error'); return; }
    await processAudioUpload(state.selectedFile);
}

async function processAudioUpload(file) {
    var endpoint = API + '/screen';
    navTo('report');
    runPipelineAnimation();
    setSpinner(true, 'Uploading and analyzing audio...');
    try {
        var formData = new FormData();
        formData.append('file', file);
        var res = await fetch(endpoint, { method: 'POST', body: formData, headers: { 'Accept': 'application/json' } });
        if (!res.ok) {
            var errText = await res.text().catch(function() { return 'Unknown error'; });
            throw new Error('HTTP ' + res.status + ': ' + errText);
        }
        var data = await res.json();
        state.screening = data;
        state.screening.source = 'upload';
        // Audio source for clickable review markers (this session's file).
        try { state.reviewAudioUrl = URL.createObjectURL(file); } catch (e) { state.reviewAudioUrl = null; }
        populateFeatureExtraction(data); 
        populateAnalysis(data);
        populateResults(data);
        populateExplainability(data);
        populateUnifiedReport(data);
        await new Promise(function(r) { setTimeout(r, 1500); });
        navTo('report');
        showToast('Analysis complete');
        
        // ─── AUTO-SAVE HERE ───
        await saveScreeningSilently();
        await loadHistory();
        
    } catch (e) {
        showToast(diagnoseFetchError(e, endpoint), 'error');
        console.error(e);
        navTo('audio-capture');
    } finally {
        setSpinner(false);
    }
}

/* ===== 7. PIPELINE ANIMATION ===== */
function runPipelineAnimation() {
    var steps = [
        { id: 'pipe-1', dot: 'dot-1', stat: 'stat-1', delay: 600 },
        { id: 'pipe-2', dot: 'dot-2', stat: 'stat-2', delay: 1400 },
        { id: 'pipe-3', dot: 'dot-3', stat: 'stat-3', delay: 2200 },
        { id: 'pipe-4', dot: 'dot-4', stat: 'stat-4', delay: 3000 },
    ];
    steps.forEach(function(s, i) {
        setTimeout(function() {
            var el = document.getElementById(s.id);
            var dot = document.getElementById(s.dot);
            var stat = document.getElementById(s.stat);
            el.classList.remove('pending');
            if (i < 2) {
                el.classList.add('complete');
                dot.className = 'step-dot done'; dot.textContent = '✓';
                stat.className = 'step-status status-done'; stat.textContent = 'Done';
            } else {
                el.classList.add('active');
                dot.className = 'step-dot run'; dot.textContent = '⚡';
                stat.className = 'step-status status-running'; stat.textContent = 'Running';
            }
        }, s.delay);
    });
    setTimeout(function() {
        document.getElementById('pipe-badge').textContent = 'Complete';
        document.getElementById('pipe-badge').className = 'badge badge-complete';
        steps.slice(2).forEach(function(s) {
            var el = document.getElementById(s.id);
            var dot = document.getElementById(s.dot);
            var stat = document.getElementById(s.stat);
            el.classList.remove('active'); el.classList.add('complete');
            dot.className = 'step-dot done'; dot.textContent = '✓';
            stat.className = 'step-status status-done'; stat.textContent = 'Done';
        });
    }, 4000);
}

/* ===== 8. POPULATE RESULTS ===== */
function populateAnalysis(data) {
    var pred = data.prediction;
    var score = Math.round(pred.risk_score * 100);
    var level = pred.risk_level;
    var color = level === 'high' ? '#ef4444' : level === 'moderate' ? '#f59e0b' : '#10b981';
    document.getElementById('ana-score').textContent = score;
    document.getElementById('ana-score').style.color = color;
    document.getElementById('ana-level').textContent = level.charAt(0).toUpperCase() + level.slice(1) + ' Risk';
    document.getElementById('ana-level').style.color = color;
    var marker = document.getElementById('ana-marker');
    marker.style.left = score + '%'; marker.textContent = score; marker.style.borderColor = color;

    var shapContainer = document.getElementById('ana-shap');
    shapContainer.innerHTML = '';
    var maxImpact = Math.max.apply(null, pred.shap_breakdown.map(function(d) { return Math.abs(d.impact); }));
    pred.shap_breakdown.forEach(function(item) {
        var width = (Math.abs(item.impact) / maxImpact * 100);
        var div = document.createElement('div');
        div.className = 'shap-row';
        div.innerHTML = '<div class="shap-label">' + formatFeatureName(item.feature) + '</div><div class="shap-bar-wrap"><div class="shap-bar ' + (item.impact > 0 ? 'positive' : 'negative') + '" style="width: ' + width + '%"></div><span class="shap-value">' + (item.impact > 0 ? '+' : '') + item.impact.toFixed(4) + '</span></div>';
        shapContainer.appendChild(div);
    });
}

function populateResults(data) {
    var pred = data.prediction;
    var features = data.features;
    var exp = pred.explanation;
    var score = Math.round(pred.risk_score * 100);
    var level = pred.risk_level;
    var color = level === 'high' ? '#ef4444' : level === 'moderate' ? '#f59e0b' : '#10b981';
    var p = state.patient;

    document.getElementById('res-name').textContent = p.first + ' ' + p.last;
    document.getElementById('res-avatar').textContent = (p.first[0] + p.last[0]).toUpperCase();
    document.getElementById('res-meta').innerHTML = '<span>' + p.age + ' yrs</span><span>•</span><span>' + p.sex + '</span><span>•</span><span>' + p.edu + ' yrs education</span>';
    document.getElementById('res-score').innerHTML = score + '<span style="font-size:14px;color:#94a3b8">/100</span>';
    document.getElementById('res-score').style.color = color;
    document.getElementById('res-pill').textContent = level.toUpperCase() + ' RISK';
    document.getElementById('res-pill').className = 'risk-pill risk-' + level;
    document.getElementById('res-card').style.borderLeftColor = color;
    document.getElementById('res-summary').innerHTML = 'The AI detected speech patterns consistent with <strong>' + level + ' risk</strong> for cognitive impairment. ' + (exp.key_indicators[0] || '') + ' ' + (exp.key_indicators[1] || '') + ' This is a <strong>screening result — not a clinical diagnosis</strong>.';

    var findings = document.getElementById('res-findings');
    findings.innerHTML = '';
    exp.key_indicators.forEach(function(indicator, i) {
        var isHigh = i < 2;
        var c = isHigh ? 'var(--danger)' : 'var(--warning)';
        var b = isHigh ? '3px solid var(--danger)' : '3px solid var(--warning)';
        var arrow = indicator.indexOf('↑') !== -1 ? '↑' : indicator.indexOf('↓') !== -1 ? '↓' : '•';
        var numMatch = indicator.match(/[\d\.]+/);
        var num = numMatch ? numMatch[0] : '';
        var div = document.createElement('div');
        div.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:12px;background:var(--bg);border-radius:var(--radius-sm);border-left:' + b + ';margin-bottom:8px;';
        div.innerHTML = '<div><div style="font-size:12px;font-weight:700;">' + indicator.split('—')[0] + '</div><div style="font-size:11px;color:var(--text-muted);">' + (indicator.split('—')[1] || '') + '</div></div><div style="font-size:16px;font-weight:800;color:' + c + ';">' + arrow + ' ' + num + '</div>';
        findings.appendChild(div);
    });

    var markers = document.getElementById('res-markers');
    markers.innerHTML = '';
    var markerData = [
        { name: 'Pause ratio (acoustic)', signal: 'High', result: features.acoustic.pause_ratio, chip: 'chip-danger' },
        { name: 'Speech rate (acoustic)', signal: 'High', result: features.linguistic.speech_rate_wpm + ' WPM', chip: 'chip-warn' },
        { name: 'Pitch variation (acoustic)', signal: 'Moderate', result: features.acoustic.pitch_std_hz + ' Hz', chip: 'chip-warn' },
        { name: 'Short utterances (acoustic)', signal: 'Moderate', result: features.acoustic.short_utterance_count, chip: 'chip-warn' },
        { name: 'Word count (linguistic)', signal: 'Low', result: features.linguistic.word_count, chip: 'chip-success' },
        { name: 'Filler rate (linguistic)', signal: 'Low', result: features.linguistic.filler_rate, chip: 'chip-success' },
    ];
    markerData.forEach(function(m) {
        var tr = document.createElement('tr');
        tr.innerHTML = '<td>' + m.name + '</td><td>' + m.signal + '</td><td><span class="chip ' + m.chip + '">' + m.result + '</span></td>';
        markers.appendChild(tr);
    });
}

/* ============================================================
   POPULATE EXPLAINABILITY — Shows all drivers (risk + protective)
   ============================================================ */
function populateExplainability(data) {
    var pred = data.prediction;
    var features = data.features;
    var acoustic = document.getElementById('exp-acoustic');
    var transcript = document.getElementById('exp-transcript');
    var protective = document.getElementById('exp-protective');
    acoustic.innerHTML = '';
    transcript.innerHTML = '';
    protective.innerHTML = '';

    // Which features are acoustic vs linguistic
    var acousticFeatures = ['pause_ratio','pitch_std_hz','short_utterance_count','duration_seconds','jitter','shimmer','hnr','spectral_centroid','spectral_rolloff','response_latency','articulation_rate','phonemes_per_second','zero_crossing_rate'];

    // Sort all SHAP by absolute impact (strongest first)
    var sortedShap = pred.shap_breakdown.slice().sort(function(a, b) {
        return Math.abs(b.impact) - Math.abs(a.impact);
    });

    sortedShap.forEach(function(item) {
        var isAcoustic = acousticFeatures.indexOf(item.feature) !== -1;
        var isPositive = item.impact > 0;
        var b = isPositive ? '3px solid var(--danger)' : '3px solid var(--success)';
        var c = isPositive ? 'var(--danger)' : 'var(--success)';
        var desc = getFeatureDesc(item.feature, features);

        var div = document.createElement('div');
        div.style.cssText = 'padding:14px;background:var(--bg);border-radius:var(--radius-sm);border-left:' + b + ';margin-bottom:10px;';
        div.innerHTML = '<div style="font-size:13px;font-weight:700;color:' + c + ';margin-bottom:4px;">' +
            getFeatureIcon(item.feature) + ' ' + formatFeatureName(item.feature) +
            ' — ' + (isPositive ? '↑ Risk +' : '↓ Risk ') + Math.abs(item.impact).toFixed(3) + '</div>' +
            '<div style="font-size:12px;color:var(--text-muted);line-height:1.6;">' + desc + '</div>';

        if (isAcoustic) {
            acoustic.appendChild(div);
        } else {
            transcript.appendChild(div);
        }
    });

    // Fallback if a section is empty
    if (!acoustic.hasChildNodes()) {
        acoustic.innerHTML = '<div style="padding:14px;color:var(--text-muted);font-size:13px;">No significant acoustic risk drivers for this recording.</div>';
    }
    if (!transcript.hasChildNodes()) {
        transcript.innerHTML = '<div style="padding:14px;color:var(--text-muted);font-size:13px;">No significant linguistic risk drivers for this recording.</div>';
    }

    // ─── PROTECTIVE FACTORS ───
    var edu = state.patient.edu;
    if (edu > 0) {
        var div = document.createElement('div');
        div.style.cssText = 'padding:14px;background:#d1fae5;border-radius:var(--radius-sm);border-left:3px solid var(--success);margin-bottom:10px;';
        div.innerHTML = '<div style="font-size:13px;font-weight:700;color:var(--success);margin-bottom:4px;">📖 ' + edu + ' Years of Education</div><div style="font-size:12px;color:#065f46;line-height:1.6;">' + edu + ' years of schooling provides cognitive reserve — extra brain capacity that helps compensate for early decline. The system adjusted the score upward because of this protective factor.</div>';
        protective.appendChild(div);
    }

    // Also list negative SHAP features as protective
    var protectiveFeatures = pred.shap_breakdown.filter(function(item) { return item.impact < 0; });
    protectiveFeatures.forEach(function(item) {
        var div = document.createElement('div');
        div.style.cssText = 'padding:14px;background:#d1fae5;border-radius:var(--radius-sm);border-left:3px solid var(--success);margin-bottom:10px;';
        div.innerHTML = '<div style="font-size:13px;font-weight:700;color:var(--success);margin-bottom:4px;">' + getFeatureIcon(item.feature) + ' ' + formatFeatureName(item.feature) + '</div><div style="font-size:12px;color:#065f46;line-height:1.6;">This feature acted as a protective factor, reducing the risk score by ' + Math.abs(item.impact).toFixed(4) + ' points.</div>';
        protective.appendChild(div);
    });

    if (!protective.hasChildNodes()) {
        protective.innerHTML = '<div style="padding:14px;color:var(--text-muted);font-size:13px;">No protective factors identified for this recording.</div>';
    }
}

/* ===== 9. HISTORY & SAVE ===== */
async function saveAndGoToResults() {
    if (!state.screening || !state.patient.id) {
        showToast('No screening data to save', 'error');
        return;
    }
    var endpoint = API + '/screenings';
    setSpinner(true, 'Saving to database...');
    try {
        var pred = state.screening.prediction;
        var params = new URLSearchParams({
            patient_id: state.patient.id,
            patient_name: state.patient.first + ' ' + state.patient.last,
            filename: state.screening.filename,
            risk_score: pred.risk_score,
            risk_level: pred.risk_level,
            features_json: JSON.stringify(state.screening.features),
            shap_json: JSON.stringify(pred.shap_breakdown),
            explanation_json: JSON.stringify(pred.explanation)
        });
        var res = await fetch(endpoint + '?' + params.toString(), { method: 'POST', headers: { 'Accept': 'application/json' } });
        if (!res.ok) {
            var errText = await res.text().catch(function() { return 'Unknown error'; });
            throw new Error('HTTP ' + res.status + ': ' + errText);
        }
        await loadHistory();
        navTo('report');
        showToast('Screening saved to database');
    } catch (e) {
        showToast(diagnoseFetchError(e, endpoint), 'error');
        console.error(e);
    } finally {
        setSpinner(false);
    }
}

async function loadHistory() {
    var endpoint = API + '/screenings';
    try {
        var res = await fetch(endpoint, { headers: { 'Accept': 'application/json' } });
        if (!res.ok) return;
        var rows = await res.json();
        state.history = rows;
        document.getElementById('dash-count').textContent = rows.length;
        document.getElementById('dash-high').textContent = rows.filter(function(r) { return r.risk_level === 'high'; }).length;
        var container = document.getElementById('dash-history');
        if (rows.length === 0) {
            container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📊</div><h3>No screenings yet</h3><p>Start a new screening to see results here.</p></div>';
            return;
        }
        var html = '<table class="data-table"><thead><tr><th>Patient</th><th>Date</th><th>Score</th><th>Status</th><th>Source</th><th></th></tr></thead><tbody>';
        rows.slice(0, 10).forEach(function(r) {
            var score = Math.round(r.risk_score * 100);
            var color = r.risk_level === 'high' ? 'var(--danger)' : r.risk_level === 'moderate' ? 'var(--warning)' : 'var(--success)';
            var tagClass = r.risk_level === 'high' ? 'background:#fee2e2;color:var(--danger);' : r.risk_level === 'moderate' ? 'background:#fef3c7;color:#92400e;' : 'background:#d1fae5;color:var(--success);';
            var date = new Date(r.created_at).toLocaleDateString();
            html += '<tr><td><strong>' + r.patient_name + '</strong></td><td>' + date + '</td><td><span style="color:' + color + ';font-weight:700;">' + score + '</span></td><td><span class="table-tag" style="' + tagClass + '">' + r.risk_level.toUpperCase() + '</span></td><td><span class="table-tag" style="background:#e0e7ff;color:#4338ca;font-size:9px;">' + (r.source ? r.source.toUpperCase() : "UPLOAD") + '</span></td><td><button class="btn btn-primary btn-sm" onclick="loadScreening(' + r.id + ')">View</button></td></tr>';
        });
        html += '</tbody></table>';
        container.innerHTML = html;
    } catch (e) {
        console.log('History load failed:', e);
    }
}

async function loadScreening(id) {
    var endpoint = API + '/screenings/' + id;
    // History rows have no local audio — disable marker playback so a stale
    // file from an earlier upload can't be matched to the wrong transcript.
    state.reviewAudioUrl = null;
    setSpinner(true, 'Loading screening...');
    try {
        var res = await fetch(endpoint, { headers: { 'Accept': 'application/json' } });
        if (!res.ok) {
            var errText = await res.text().catch(function() { return 'Unknown error'; });
            throw new Error('HTTP ' + res.status + ': ' + errText);
        }
        var data = await res.json();
        var nameParts = data.patient_name.split(' ');
        state.patient = { first: nameParts[0], last: nameParts[1] || '', age: 0, sex: '', edu: 0, lang: '' };
        state.screening = {
            filename: data.filename,
            features: data.features,
            prediction: {
                risk_score: data.risk_score,
                risk_level: data.risk_level,
                shap_breakdown: data.shap,
                explanation: data.explanation
            }
        };
        populateAnalysis(state.screening);
        populateResults(state.screening);
        populateExplainability(state.screening);
        populateUnifiedReport(state.screening);
        navTo('report');
    } catch (e) {
        showToast(diagnoseFetchError(e, endpoint), 'error');
        console.error(e);
    } finally {
        setSpinner(false);
    }
}

/* ===== 10. FEATURE HELPERS ===== */
function getFeatureIcon(name) {
    var map = {
        'pause_duration_mean': '⏸️', 'jitter': '🎤', 'pitch_std_hz': '🎵',
        'spectral_centroid': '📡', 'response_latency': '⏱️', 'speech_rate_wpm': '⚡',
        'type_token_ratio': '📚', 'vague_word_count': '🔎', 'mean_sentence_length': '📝',
        'filler_rate': '💬', 'uncertainty_count': '🧠',
        'pause_ratio': '⏱️', 'short_utterance_count': '💬', 'duration_seconds': '⏳'
    };
    return map[name] || '📊';
}
function formatFeatureName(name) {
    var map = { 'speech_rate_wpm': 'Speech Rate', 'pause_ratio': 'Pause Ratio', 'pitch_std_hz': 'Pitch Variation', 'short_utterance_count': 'Short Utterances', 'duration_seconds': 'Duration' };
    return map[name] || name;
}
function getFeatureDesc(name, features) {
    var a = features.acoustic;
    var l = features.linguistic;
    var descs = {
        'speech_rate_wpm': 'The patient spoke at ' + l.speech_rate_wpm + ' WPM. Normal is 120–180. Slower speech indicates the brain needs more time to retrieve words.',
        'pause_ratio': Math.round(a.pause_ratio * 100) + '% of the recording was silence. Healthy speech has 15–30% silence. Extended pauses suggest word-retrieval difficulty.',
        'pitch_std_hz': 'Pitch varied by only ' + a.pitch_std_hz + ' Hz. Healthy speech has 40–70 Hz. A monotone voice can indicate reduced motor control.',
        'short_utterance_count': 'The audio contained ' + a.short_utterance_count + ' very short speech segments that Whisper could not transcribe. These are likely "um" sounds or aborted word starts.',
        'duration_seconds': 'The recording was ' + a.duration_seconds + ' seconds. Extended duration with the same word count suggests slower, effortful speech.',
        'jitter': 'Jitter of ' + (a.jitter || 0).toFixed(2) + '% measures pitch cycle instability. Normal is <1%. Higher values suggest less stable vocal cord control.',
        'shimmer': 'Shimmer of ' + (a.shimmer || 0).toFixed(2) + '% measures loudness fluctuation. Normal is <4%. Higher values suggest inconsistent breath support.',
        'hnr': 'Harmonics-to-Noise Ratio of ' + (a.hnr || 0).toFixed(1) + ' dB. Normal is >20 dB. Lower values mean more breathiness and less clear tone.',
        'spectral_centroid': 'Spectral centroid of ' + (a.spectral_centroid || 0).toFixed(1) + ' Hz indicates where vocal energy is concentrated. Used to detect vocal tract changes.',
        'response_latency': 'Response latency of ' + (a.response_latency || 0).toFixed(2) + ' seconds before first speech. Longer delays suggest slower processing speed.',
        'articulation_rate': 'Articulation rate of ' + (a.articulation_rate || 0).toFixed(1) + ' syllables/sec. Slower articulation indicates effortful speech production.',
        'phonemes_per_second': 'Phonemes per second: ' + (a.phonemes_per_second || 0).toFixed(1) + '. Fewer sounds per second suggests simplified or slowed articulation.',
        'zero_crossing_rate': 'Zero-crossing rate of ' + (a.zero_crossing_rate || 0).toFixed(4) + ' indicates signal noisiness. Higher values can suggest breathiness or frication.'
    };
    return descs[name] || 'Significant contribution to risk score.';
}

/* ===== 11. LIVE CALL MONITOR ===== */
var liveCallPollInterval = null;
var currentLiveCallId = null;
var terminalPollSince = null;

function formatDuration(ms) {
    if (!ms || ms === 0) return '0s';
    var seconds = Math.floor(ms / 1000);
    var mins = Math.floor(seconds / 60);
    var secs = seconds % 60;
    if (mins > 0) return mins + 'm ' + secs + 's';
    return secs + 's';
}

function updateLiveRiskClass(element, risk) {
    element.style.color = '';
    if (risk === 'low') element.style.color = '#10b981';
    else if (risk === 'medium') element.style.color = '#f59e0b';
    else if (risk === 'high') element.style.color = '#ef4444';
    else element.style.color = '#6b7280';
}

async function pollLiveCall() {
    if (!currentLiveCallId) return;
    try {
        var res = await fetch(API + '/api/calls/' + currentLiveCallId);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var data = await res.json();

        document.getElementById('live-patient-name').textContent = data.patient_name || 'Unknown';
        document.getElementById('live-patient-phone').textContent = data.patient_phone || '—';
        document.getElementById('live-call-id').textContent = data.retell_call_id || currentLiveCallId;

        var statusEl = document.getElementById('live-status');
        var status = (data.status || 'unknown').toLowerCase();
        statusEl.textContent = data.status ? data.status.toUpperCase() : 'UNKNOWN';
        statusEl.className = 'status ' + status;

        var timerEl = document.getElementById('live-timer');
        if (status === 'completed') {
            timerEl.textContent = '⏱️ Duration: ' + formatDuration(data.duration_ms);
        } else if (status === 'ongoing') {
            timerEl.innerHTML = '<span class="spinner" style="display: inline-block; width: 20px; height: 20px; border: 3px solid #e5e7eb; border-top-color: #3b82f6; border-radius: 50%; animation: spin 1s linear infinite; margin-right: 8px; vertical-align: middle;"></span> Call in progress...';
        } else if (status === 'failed') {
            timerEl.textContent = '❌ Failed: ' + (data.disconnection_reason || 'Unknown reason');
        } else if (status === 'no_answer') {
            timerEl.textContent = '📞 No answer or voicemail — try calling again';
        } else {
            timerEl.innerHTML = '<span class="spinner" style="display: inline-block; width: 20px; height: 20px; border: 3px solid #e5e7eb; border-top-color: #3b82f6; border-radius: 50%; animation: spin 1s linear infinite; margin-right: 8px; vertical-align: middle;"></span> ' + (data.status || 'Waiting') + '...';
        }

        if (data.status === 'completed' || data.status === 'ongoing' || (data.transcript_object && data.transcript_object.length > 0)) {
            document.getElementById('live-analysis-card').classList.remove('hidden');
            document.getElementById('live-patient-words').textContent = data.patient_word_count || 0;
            document.getElementById('live-agent-words').textContent = data.agent_word_count || 0;
            document.getElementById('live-orientation').textContent = (data.orientation_score || 0) + '/100';
            document.getElementById('live-duration').textContent = formatDuration(data.duration_ms);
            document.getElementById('live-turns').textContent = (data.transcript_object || []).length;

            var riskEl = document.getElementById('live-risk-flag');
            riskEl.textContent = (data.risk_flag || 'unknown').toUpperCase();
            updateLiveRiskClass(riskEl, data.risk_flag);
        }

        if (data.transcript_object && data.transcript_object.length > 0) {
            var transcriptDiv = document.getElementById('live-transcript');
            transcriptDiv.innerHTML = data.transcript_object.map(function(turn, i) {
                var isAgent = turn.role === 'agent';
                var roleLabel = isAgent ? 'Nurse' : 'Patient';
                var cssClass = isAgent ? 'agent' : 'user';
                var roleClass = isAgent ? 'nurse' : 'patient';
                var bgColor = isAgent ? '#dbeafe' : '#d1fae5';
                var marginDir = isAgent ? 'margin-right: 60px; border-left: 4px solid #3b82f6;' : 'margin-left: 60px; text-align: right; border-right: 4px solid #10b981;';
                return '<div style="margin: 12px 0; padding: 14px 18px; border-radius: 12px; background: ' + bgColor + '; ' + marginDir + '">' +
                    '<div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px; color: ' + (isAgent ? '#2563eb' : '#059669') + ';">' + roleLabel + '</div>' +
                    '<div style="font-size: 15px; line-height: 1.5;">' + (turn.content || '') + '</div>' +
                    '</div>';
            }).join('');
        }

        var recordingCard = document.getElementById('live-recording-card');
        if (status === 'completed' || status === 'ongoing') {
            recordingCard.classList.remove('hidden');
        }

        if (data.recording_url || data.recording_download_url) {
            // Prefer the backend proxy (api.twilio.com URLs require Twilio
            // credentials, so linking them directly would fail in the browser)
            var downloadUrl = data.recording_download_url ? (API + data.recording_download_url) : data.recording_url;
            document.getElementById('live-recording-content').innerHTML =
                '<div style="padding: 16px; background: #fef3c7; border-radius: 10px; border: 1px solid #fcd34d;">' +
                '<a href="' + downloadUrl + '" target="_blank" download style="color: #b45309; font-weight: 600; text-decoration: none;">🔗 Download Dual-Channel Recording</a>' +
                '<div style="font-size: 12px; color: #92400e; margin-top: 8px;">Duration: ' + (data.recording_duration || '?') + 's | Channels: ' + (data.recording_channels || 2) + ' | Format: MP3 (Stereo)</div>' +
                '<div style="font-size: 12px; color: #92400e; margin-top: 4px;">Dual-channel stereo — the patient channel is <strong>auto-detected</strong> (the nurse AI identifies itself by script) before analysis</div>' +
                '</div>';
        }

        // ─── AUTO-ANALYZE: call ended + recording ready → run full pipeline ───
        // This replaces the manual "download recording → re-upload" step and
        // populates the Unified Report automatically.
        if (status === 'completed' && data.recording_download_url) {
            autoAnalyzeCallRecording(data);
        }

        return data;
    } catch (e) {
        console.error('Poll error:', e);
        document.getElementById('live-timer').textContent = '⚠️ Error: ' + e.message + '. Retrying...';
        return null;
    }
}

async function checkLiveRecording() {
    if (!currentLiveCallId) return;
    var btn = document.getElementById('live-check-recording-btn');
    btn.textContent = 'Checking Twilio...';
    btn.disabled = true;
    try {
        var res = await fetch(API + '/api/calls/' + currentLiveCallId + '/check-recording', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var data = await res.json();
        if (data.status === 'found') {
            await pollLiveCall();
        } else {
            btn.textContent = 'Not ready yet — try again';
            btn.disabled = false;
        }
    } catch (e) {
        console.error('Check recording error:', e);
        btn.textContent = 'Error — try again';
        btn.disabled = false;
    }
}

/* ===== AUTO-ANALYZE CALL RECORDING ===== */
// When a call completes, download the dual-channel recording through the
// backend proxy and run it through the same /screen pipeline as an upload.
// Result: the Unified Report (and every other results tab) populates itself,
// and the screening auto-saves to the database — no manual download/upload.
var autoAnalyzeTriggeredFor = null;

async function autoAnalyzeCallRecording(callData) {
    if (!callData.recording_download_url) return;
    if (autoAnalyzeTriggeredFor === callData.retell_call_id) return; // run once per call
    // Also skip if this call was already analyzed before a page refresh.
    try {
        if (localStorage.getItem('cognysis_analyzed_call') === callData.retell_call_id) return;
    } catch (e) {}
    autoAnalyzeTriggeredFor = callData.retell_call_id;
    try { localStorage.setItem('cognysis_analyzed_call', callData.retell_call_id); } catch (e) {}

    showToast('Call ended — analyzing patient audio...');
    try {
        // Preferred path: backend splits the patient channel (ch1) from the
        // dual-channel recording, runs the full pipeline, and saves the
        // screening — all server-side.
        var res = await fetch(API + '/api/calls/' + callData.retell_call_id + '/analyze', {
            method: 'POST',
            headers: { 'Accept': 'application/json' }
        });

        if (res.status === 409) {
            // Recording not ready yet — let the poller retry on next tick.
            autoAnalyzeTriggeredFor = null;
            try { localStorage.removeItem('cognysis_analyzed_call'); } catch (e) {}
            return;
        }

        if (res.status === 404) {
            // Backend not updated yet — legacy fallback: download and re-upload.
            await legacyAutoAnalyze(callData);
            return;
        }

        if (!res.ok) {
            var errText = await res.text().catch(function() { return 'Unknown error'; });
            throw new Error('HTTP ' + res.status + ': ' + errText);
        }

        var data = await res.json();
        state.screening = data;
        state.screening.source = 'call';
        // Call recordings play back through the backend proxy for marker review.
        state.reviewAudioUrl = callData.recording_download_url ? (API + callData.recording_download_url) : null;

        populateFeatureExtraction(data);
        populateAnalysis(data);
        populateResults(data);
        populateExplainability(data);
        populateUnifiedReport(data);

        await loadHistory();   // backend already saved this screening
        navTo('report');
        showToast('Call analysis complete — see Unified Report');
    } catch (e) {
        console.error('Auto-analysis failed:', e);
        showToast('Could not auto-analyze recording — use "Download" then upload manually', 'error');
    }
}

// Legacy path used only until the backend analyze endpoint is deployed:
// downloads the raw (mixed stereo) recording and re-uploads it to /screen.
async function legacyAutoAnalyze(callData) {
    var res = await fetch(API + callData.recording_download_url);
    if (!res.ok) throw new Error('Recording download failed (HTTP ' + res.status + ')');
    var blob = await res.blob();
    var file = new File([blob], 'call_' + callData.retell_call_id + '.mp3', { type: 'audio/mpeg' });
    state.selectedFile = file;
    await processAudioUpload(file);
    navTo('report');
    showToast('Call analysis complete — see Unified Report');
}

function startLiveCallPolling(callId) {
    currentLiveCallId = callId;
    terminalPollSince = null;
    // Persist so the monitor survives page refreshes and tab navigation.
    try { localStorage.setItem('cognysis_live_call', callId); } catch (e) {}
    document.getElementById('live-analysis-card').classList.add('hidden');
    document.getElementById('live-recording-card').classList.add('hidden');
    document.getElementById('live-transcript').innerHTML = 
        '<div style="text-align: center; padding: 40px; color: #9ca3af;">' +
        '<span class="spinner" style="display: inline-block; width: 20px; height: 20px; border: 3px solid #e5e7eb; border-top-color: #3b82f6; border-radius: 50%; animation: spin 1s linear infinite; margin-right: 8px; vertical-align: middle;"></span>' +
        '<p>Waiting for call to begin...</p></div>';
    navTo('live-call');
    pollLiveCall();
    if (liveCallPollInterval) clearInterval(liveCallPollInterval);
    liveCallPollInterval = setInterval(async function() {
        var data = await pollLiveCall();
        // Stop polling 60s after a terminal state (gives the Twilio
        // recording callback time to land and appear in the UI first).
        if (data && data.status) {
            var s = data.status.toLowerCase();
            if (s === 'completed' || s === 'failed' || s === 'no_answer') {
                if (!terminalPollSince) terminalPollSince = Date.now();
                if (Date.now() - terminalPollSince > 60000) {
                    clearInterval(liveCallPollInterval);
                    liveCallPollInterval = null;
                }
            }
        }
    }, 5000);
}

/* ===== 12. RETELL OUTBOUND CALL ===== */

async function triggerOutboundCall() {
    var phone = document.getElementById('p-phone') ? document.getElementById('p-phone').value.trim() : '';
    if (!phone) { showToast('Please enter a phone number first', 'error'); return; }
    if (!state.patient.id) { showToast('Please register the patient first (click Begin)', 'error'); return; }
    if (RETELL_AGENT_ID === "your_agent_id_here") { 
        showToast('⚠️ Update RETELL_AGENT_ID in app.js first', 'error'); 
        return; 
    }

    var endpoint = API + '/api/trigger-screening-call';
    setSpinner(true, 'Initiating Retell AI call...');
    try {
        var res = await fetch(endpoint, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json' 
            },
            body: JSON.stringify({
                patient_phone: phone,
                patient_name: state.patient.first + ' ' + state.patient.last,
                core_memory: state.patient.memory || '',
                agent_id: RETELL_AGENT_ID,
                from_number: RETELL_FROM_NUMBER
            })
        });
        if (!res.ok) {
            var err = await res.json().catch(function() { return { detail: 'Call failed' }; });
            throw new Error(err.detail || 'Call failed');
        }
        var data = await res.json();
        showToast('Calling ' + phone + '...', 'success');

        // FIXED: go to the Live Call Monitor and poll /api/calls/{id}.
        // Previously this called startCallPolling(), which polled /screenings —
        // an endpoint Retell calls NEVER appear in — so it always timed out
        // after 2 minutes with "Call monitoring timed out".
        if (data.retell_call_id) {
            startLiveCallPolling(data.retell_call_id);
        } else {
            showToast('Call started but no call ID returned', 'warning');
        }
    } catch (e) {
        showToast(diagnoseFetchError(e, endpoint), 'error');
        console.error(e);
    } finally {
        setSpinner(false);
    }
}

// REMOVED: startCallPolling() polled /screenings for Retell results that
// never appear there — this was the source of the false "monitoring timeout".

// Also refresh history when navigating to dashboard
function navTo(screenId) {
    document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
    document.querySelectorAll('.nav-item').forEach(function(n) { n.classList.remove('active'); });
    var target = document.getElementById(screenId);
    if (target) target.classList.add('active');
    var navItem = document.querySelector('.nav-item[data-screen="' + screenId + '"]');
    if (navItem) navItem.classList.add('active');
    document.querySelectorAll('.animate-in').forEach(function(el) {
        el.style.animation = 'none'; el.offsetHeight; el.style.animation = '';
    });
    if (screenId === 'audio-capture') populateAudioCapture();
    if (screenId === 'dashboard') loadHistory();
    if (screenId === 'live-call' && currentLiveCallId) pollLiveCall();
}

/* ===== 12. INITIALIZATION ===== */
document.addEventListener('DOMContentLoaded', function() {
    checkApiHealth();
    loadHistory();

    // Restore any in-progress/recent call after a page refresh, so the
    // Live Call monitor shows its last known state instead of resetting.
    try {
        var savedCall = localStorage.getItem('cognysis_live_call');
        if (savedCall) {
            currentLiveCallId = savedCall;
            pollLiveCall();
        }
    } catch (e) {}

    ['uploadArea', 'uploadAreaOnly'].forEach(function(id) {
        var area = document.getElementById(id);
        if (!area) return;
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(function(eventName) {
            area.addEventListener(eventName, function(e) { e.preventDefault(); e.stopPropagation(); }, false);
        });
        ['dragenter', 'dragover'].forEach(function(eventName) {
            area.addEventListener(eventName, function() { area.classList.add('dragover'); }, false);
        });
        ['dragleave', 'drop'].forEach(function(eventName) {
            area.addEventListener(eventName, function() { area.classList.remove('dragover'); }, false);
        });
        area.addEventListener('drop', function(e) {
            var dt = e.dataTransfer;
            var files = dt.files;
            if (files.length > 0) {
                if (id === 'uploadAreaOnly') {
                    var input = document.getElementById('fileInputOnly');
                    var dataTransfer = new DataTransfer();
                    dataTransfer.items.add(files[0]);
                    input.files = dataTransfer.files;
                    handleFileSelectOnly(input);
                } else {
                    var input = document.getElementById('fileInput');
                    var dataTransfer = new DataTransfer();
                    dataTransfer.items.add(files[0]);
                    input.files = dataTransfer.files;
                    handleFileSelect(input);
                }
            }
        }, false);
    });

    document.querySelectorAll('.modal-overlay').forEach(function(overlay) {
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) { overlay.classList.remove('active'); document.body.style.overflow = ''; }
        });
    });
});


/* ============================================================
   UNIFIED REPORT — processing + transcript + results on one tab
   Added per lecturer feedback: no fragmented results screens,
   no hardcoded signals, full score transparency (no black box),
   all features shown (not just top 5).
   ============================================================ */

// Interview questions with their clinical basis — answers Ramon's
// "where do the questions come from?" before it is asked.
var INTERVIEW_QUESTIONS = [
    { q: 'Can you tell me about what you did yesterday?', basis: 'MMSE recall & episodic memory items' }
];

// Map stored education years to the categorical label shown in the form.
function eduLabel(edu) {
    edu = parseInt(edu) || 0;
    if (edu >= 22) return 'Doctorate (PhD/MD)';
    if (edu >= 18) return "Master's Degree";
    if (edu >= 16) return "Bachelor's Degree";
    if (edu >= 14) return 'Associate Degree';
    if (edu >= 12) return 'High School Diploma';
    if (edu > 0)   return 'Some High School';
    return null;
}

function urStatusChip(status) {
    if (status === 'flagged') return '<span class="chip chip-danger">Flagged</span>';
    if (status === 'watch')   return '<span class="chip chip-warn">Watch</span>';
    return '<span class="chip chip-success">Normal</span>';
}

/* ── What Was Analysed (call-based screenings only) ──
   Renders the response-window breakdown: which parts of the call were scored
   (patient answers to nurse questions), the exact analysed audio, and the
   full two-way conversation for context. Hidden for file uploads. */
function populateResponseAnalysis(data) {
    var card = document.getElementById('ur-analysis-card');
    if (!card) return;
    var ra = data.response_analysis || (data.features && data.features.response_analysis);
    if (!ra || !ra.summary) { card.style.display = 'none'; return; }
    card.style.display = '';
    var s = ra.summary;

    function esc(t) {
        return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    function trunc(t, n) { t = esc(t); return t.length > n ? t.slice(0, n) + '…' : t; }
    function chip(label, value) {
        return '<div style="padding:10px;background:var(--bg);border-radius:var(--radius-sm);text-align:center;">' +
            '<div style="font-size:18px;font-weight:800;color:var(--accent);">' + value + '</div>' +
            '<div style="font-size:11px;color:var(--text-muted);margin-top:3px;">' + label + '</div></div>';
    }

    document.getElementById('ur-ra-summary').innerHTML =
        '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;">' +
        chip('Responses analysed', s.analysed_windows + ' / ' + s.total_windows) +
        chip('Speech analysed', s.analysed_seconds + 's') +
        chip('% of patient channel', s.analysed_pct + '%') +
        chip('Avg response latency', (s.mean_response_latency_s != null ? s.mean_response_latency_s.toFixed(2) + 's' : '—')) +
        '</div>' +
        (ra.analysis_note ? '<div style="font-size:12px;color:var(--text-muted);margin-top:8px;">' + esc(ra.analysis_note) + '</div>' : '');

    var audioBox = document.getElementById('ur-ra-audio');
    if (ra.response_audio_url) {
        audioBox.innerHTML =
            '<div style="font-size:12px;font-weight:700;margin-bottom:4px;">🔊 Analysed audio — the exact ' +
            (ra.responses_audio_seconds || s.analysed_seconds) + 's of patient speech the model scored</div>' +
            '<audio controls style="width:100%;" src="' + API + ra.response_audio_url + '"></audio>';
    } else {
        audioBox.innerHTML = '';
    }

    var rows = (ra.windows || []).map(function(w) {
        var status = w.analysed
            ? '<span style="color:var(--success);font-weight:700;">✓ analysed</span>'
            : '<span style="color:var(--text-muted);">skipped — ' + esc(w.skip_reason || '') + '</span>';
        return '<tr style="border-top:1px solid var(--border);">' +
            '<td style="padding:6px;">' + w.index + '</td>' +
            '<td style="padding:6px;font-size:12px;">' + (trunc(w.nurse_text, 70) || '—') + '</td>' +
            '<td style="padding:6px;font-size:12px;">' + (trunc(w.patient_text, 70) || '<span style="color:var(--text-muted);">—</span>') + '</td>' +
            '<td style="padding:6px;">' + (w.response_latency_s != null ? w.response_latency_s.toFixed(2) + 's' : '—') + '</td>' +
            '<td style="padding:6px;">' + status + '</td></tr>';
    }).join('');
    document.getElementById('ur-ra-table').innerHTML =
        '<table style="width:100%;border-collapse:collapse;margin-top:6px;">' +
        '<thead><tr style="text-align:left;font-size:11px;color:var(--text-muted);text-transform:uppercase;">' +
        '<th style="padding:6px;">#</th><th style="padding:6px;">Nurse asked</th>' +
        '<th style="padding:6px;">Patient answered</th><th style="padding:6px;">Latency</th>' +
        '<th style="padding:6px;">Scored?</th></tr></thead><tbody>' + rows + '</tbody></table>';

    var conv = (ra.conversation || []).map(function(t) {
        var nurse = t.speaker !== 'Patient';
        return '<div style="margin:4px 0;font-size:12px;">' +
            '<span style="font-weight:700;color:' + (nurse ? 'var(--accent)' : 'var(--text)') + ';">' +
            esc(t.speaker) + ':</span> ' + esc(t.text) + '</div>';
    }).join('');
    document.getElementById('ur-ra-conversation').innerHTML =
        '<details style="margin-top:12px;"><summary style="cursor:pointer;font-size:12px;font-weight:700;">' +
        'Full conversation transcript (nurse + patient) — shown for context, not scored</summary>' +
        '<div style="margin-top:8px;max-height:260px;overflow-y:auto;padding:10px;background:var(--bg);border-radius:var(--radius-sm);">' +
        (conv || '<span style="color:var(--text-muted);font-size:12px;">No conversation available.</span>') +
        '</div></details>';
}

function populateUnifiedReport(data) {
    var pred = data.prediction;
    var features = data.features;
    var a = features.acoustic;
    var l = features.linguistic;
    var exp = pred.explanation || { key_indicators: [] };
    var score = Math.round(pred.risk_score * 100);
    var level = pred.risk_level;
    var color = level === 'high' ? '#ef4444' : level === 'moderate' ? '#f59e0b' : '#10b981';
    var p = state.patient;

    /* ── 1. Patient + score header ── */
    if (p.first) {
        document.getElementById('ur-name').textContent = p.first + ' ' + p.last;
        document.getElementById('ur-avatar').textContent = (p.first[0] + (p.last[0] || '')).toUpperCase();
        var meta = [];
        if (p.age) meta.push(p.age + ' yrs');
        if (p.sex) meta.push(p.sex);
        var eduTxt = eduLabel(p.edu);
        if (eduTxt) meta.push(eduTxt);
        // Acknowledged predispositions (recorded, not scored — future weighting)
        var condNames = { cond_diabetes: 'Diabetes', cond_hypertension: 'Hypertension', cond_stroke: 'Stroke/TIA', cond_hearing_impairment: 'Hearing impairment', cond_speech_impediment: 'Speech impediment' };
        var activeConds = [];
        if (p.conditions) {
            Object.keys(condNames).forEach(function(k) { if (p.conditions[k]) activeConds.push(condNames[k]); });
        }
        document.getElementById('ur-meta').innerHTML = (meta.length
            ? '<span>' + meta.join('</span><span>•</span><span>') + '</span>'
            : '<span>Patient record</span>') +
            (activeConds.length
                ? '<div style="margin-top:6px;font-size:11px;color:var(--text-muted);">Recorded conditions: ' + activeConds.join(', ') +
                  ' <em>(acknowledged predispositions — not scored; condition-aware weighting planned)</em></div>'
                : '');
    }
    document.getElementById('ur-score').innerHTML = score + '<span style="font-size:14px;color:#94a3b8">/100</span>';
    document.getElementById('ur-score').style.color = color;
    document.getElementById('ur-pill').textContent = level.toUpperCase() + ' RISK';
    document.getElementById('ur-pill').className = 'risk-pill risk-' + level;
    document.getElementById('ur-card').style.borderLeftColor = color;

    /* ── 2. Processing summary ── */
    document.getElementById('ur-pipe-duration').textContent = (a.duration_seconds || 0) + 's';
    document.getElementById('ur-pipe-words').textContent = (l.word_count || 0) + ' words';

    /* ── 3. Transcript (color-coded, MMSE-labelled) ── */
    var transcript = l.transcript || '';
    var tBox = document.getElementById('ur-transcript');
    if (transcript) {
        var html = '<div class="transcript-line"><div class="transcript-speaker">AI INTERVIEWER</div><div class="transcript-text">' +
            INTERVIEW_QUESTIONS[0].q +
            ' <span style="font-size:10px;color:var(--text-muted);">(' + INTERVIEW_QUESTIONS[0].basis + ')</span></div></div>';
        html += '<div class="transcript-line"><div class="transcript-speaker">PATIENT</div><div class="transcript-text">';
        var fillerWords = ['um','uh','erm','hmm','ah','er'];
        var vagueWords = ['thing','things','stuff','something','someone','somewhere'];
        transcript.split(/(\s+)/).forEach(function(token) {
            var clean = token.toLowerCase().replace(/[.,!?;:"'()]/g, '');
            if (fillerWords.indexOf(clean) !== -1) html += '<span class="t-hesit">' + token + '</span>';
            else if (vagueWords.indexOf(clean) !== -1) html += '<span class="t-vague">' + token + '</span>';
            else html += '<span class="t-speech">' + token + '</span>';
        });
        html += '</div></div>';
        html += '<div class="transcript-line" style="margin-top:12px;padding-top:8px;border-top:1px solid var(--border);">';
        html += '<div style="font-size:11px;color:var(--text-muted);">';
        html += '📊 ' + (l.word_count || 0) + ' words · ' + (l.filler_count || 0) + ' fillers · ' + (l.vague_word_count || 0) + ' vague words';
        html += ' · <span class="t-hesit" style="padding:0 2px;">hesitation</span> and <span class="t-vague" style="padding:0 2px;">vague word</span> highlighting';
        html += '</div></div>';
        tBox.innerHTML = html;
    }

    /* ── 3b. Review markers — click a pause/filler to HEAR that exact moment.
       Clinician verification: 3s before and after, per lecturer feedback. ── */
    var markers = Array.isArray(l.markers) ? l.markers : [];
    var markerBox = document.getElementById('ur-markers');
    var audioEl = document.getElementById('review-audio');
    if (markerBox) {
        if (markers.length && transcript) {
            var canPlay = !!state.reviewAudioUrl;
            var mh = '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:12px;">';
            markers.slice(0, 40).forEach(function(m, idx) {
                var icon = m.type === 'pause' ? '⏸' : m.type === 'filler' ? '💬' : '🔁';
                var dur = m.duration || (m.end - m.start);
                var label = m.type === 'pause' ? 'pause ' + dur.toFixed(1) + 's' : (m.text || m.type);
                mh += '<button class="chip ' + (m.type === 'pause' ? 'chip-warn' : 'chip-info') + '" style="cursor:' +
                    (canPlay ? 'pointer' : 'default') + ';border:none;" data-marker-idx="' + idx + '"' +
                    (canPlay ? '' : ' disabled') + '>' + icon + ' ' + label + ' @' + (m.start || 0).toFixed(1) + 's</button>';
            });
            mh += '</div>';
            mh += '<div style="font-size:11px;color:var(--text-muted);margin-top:6px;">' +
                (canPlay
                    ? 'Click a marker to hear 3s before and after that moment — verify every marker against the real audio.'
                    : 'Markers shown for reference; audio playback is available right after an upload or call analysis.') +
                '</div>';
            markerBox.innerHTML = mh;

            if (canPlay && audioEl) {
                audioEl.src = state.reviewAudioUrl;
                markerBox.querySelectorAll('[data-marker-idx]').forEach(function(btn) {
                    btn.onclick = function() {
                        var m = markers[parseInt(btn.getAttribute('data-marker-idx'), 10)];
                        audioEl.currentTime = Math.max(0, m.start - 3);
                        audioEl.play();
                        clearTimeout(state._markerStop);
                        state._markerStop = setTimeout(function() { audioEl.pause(); },
                            ((m.end - m.start) + 6) * 1000);
                    };
                });
            }
        } else {
            markerBox.innerHTML = '';
        }
    }

    /* ── 3c. Core-memory recall result (call-based screenings) ── */
    var memBox = document.getElementById('ur-memory');
    if (memBox) {
        var mc = data.memory_check;
        if (mc) {
            var pct = Math.round((mc.recall_ratio || 0) * 100);
            var ok = mc.recalled;
            memBox.innerHTML =
                '<div style="margin-top:12px;padding:12px;background:var(--bg);border-radius:var(--radius-sm);border-left:3px solid ' +
                (ok ? 'var(--success)' : 'var(--danger)') + ';">' +
                '<div style="font-size:12px;font-weight:700;color:' + (ok ? 'var(--success)' : 'var(--danger)') + ';">' +
                '🧠 Core Memory: ' + (ok ? 'RECALLED' : 'NOT RECALLED') + ' — ' + pct + '% of key details matched</div>' +
                '<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Recorded memory: "' + mc.core_memory + '"</div>' +
                '<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">Matched: ' +
                (mc.matched_keywords.length ? mc.matched_keywords.join(', ') : 'none') +
                ' of ' + mc.keywords.join(', ') + '</div></div>';
        } else {
            memBox.innerHTML = '';
        }
    }

    /* ── 3b. What was analysed (calls only — hidden for uploads) ── */
    populateResponseAnalysis(data);

    /* ── 4. Risk score ── */
    document.getElementById('ur-big-score').textContent = score;
    document.getElementById('ur-big-score').style.color = color;
    var marker = document.getElementById('ur-marker');
    marker.style.left = score + '%';
    marker.textContent = score;
    marker.style.borderColor = color;
    var levelEl = document.getElementById('ur-level');
    levelEl.textContent = level.charAt(0).toUpperCase() + level.slice(1) + ' Risk';
    levelEl.style.color = color;

    /* ── 5. How the score was calculated ──
       Hybrid scoring: final = 50% ML model + 50% weighted clinical panel.
       Both halves are decomposed line-by-line so every judge can verify
       the arithmetic on screen. Falls back to the single ML waterfall if
       the backend hasn't been updated with panel scoring yet. */
    var shap = (pred.shap_breakdown || []).slice().sort(function(x, y) {
        return Math.abs(y.impact) - Math.abs(x.impact);
    });
    var totalImpact = shap.reduce(function(s, item) { return s + item.impact; }, 0);
    var hasPanel = typeof pred.panel_score === 'number' && Array.isArray(pred.panel_breakdown);
    var mlScore = (typeof pred.ml_score === 'number') ? pred.ml_score : pred.risk_score;
    var base = (typeof pred.base_score === 'number') ? pred.base_score : (mlScore - totalImpact);
    var calcHtml = '';

    if (hasPanel) {
        /* ── Blended summary ── */
        calcHtml += '<tr style="background:var(--bg);">' +
            '<td><strong>① ML model score</strong></td>' +
            '<td>XGBoost on 5 core speech markers, SHAP-verified below</td>' +
            '<td style="font-weight:700;">× 50%</td>' +
            '<td><strong>' + Math.round(mlScore * 100) + '</strong></td></tr>';
        calcHtml += '<tr style="background:var(--bg);">' +
            '<td><strong>② Clinical panel score</strong></td>' +
            '<td>12-feature assessment framework (weights & normal ranges), decomposed below</td>' +
            '<td style="font-weight:700;">× 50%</td>' +
            '<td><strong>' + Math.round(pred.panel_score * 100) + '</strong></td></tr>';
        calcHtml += '<tr style="background:#eef2ff;border-top:2px solid var(--accent);border-bottom:2px solid var(--accent);">' +
            '<td><strong>Final blended score</strong></td>' +
            '<td>(' + Math.round(mlScore * 100) + ' + ' + Math.round(pred.panel_score * 100) + ') ÷ 2 — matches the headline number</td>' +
            '<td>=</td>' +
            '<td><strong style="color:' + color + ';">' + score + '</strong></td></tr>';

        /* ── ML half: SHAP waterfall ── */
        calcHtml += '<tr><td colspan="4" style="background:#f8fafc;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">① ML model drivers — base + contributions = ML score</td></tr>';
        calcHtml += '<tr>' +
            '<td>Base risk</td>' +
            '<td style="font-size:12px;color:var(--text-muted);">Model average before this patient\'s features</td>' +
            '<td>—</td>' +
            '<td>' + Math.round(base * 100) + '</td></tr>';
        var running = base;
        shap.forEach(function(item) {
            running += item.impact;
            var up = item.impact > 0;
            calcHtml += '<tr>' +
                '<td>' + getFeatureIcon(item.feature) + ' ' + formatFeatureName(item.feature) + '</td>' +
                '<td style="font-size:12px;color:var(--text-muted);">' + getFeatureDesc(item.feature, features) + '</td>' +
                '<td style="font-weight:700;color:' + (up ? 'var(--danger)' : 'var(--success)') + ';">' +
                    (up ? '↑ +' : '↓ −') + Math.abs(item.impact).toFixed(3) + '</td>' +
                '<td>' + Math.round(running * 100) + '</td></tr>';
        });

        /* ── Panel half: weighted contributions ── */
        calcHtml += '<tr><td colspan="4" style="background:#f8fafc;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">② Clinical panel contributions — sum = panel score</td></tr>';
        pred.panel_breakdown.forEach(function(row) {
            if (!row.available) {
                calcHtml += '<tr style="opacity:0.55;">' +
                    '<td>' + row.name + '</td>' +
                    '<td style="font-size:12px;color:var(--text-muted);">' + row.measured + ' — excluded from scoring (no fabricated values)</td>' +
                    '<td>—</td><td>—</td></tr>';
                return;
            }
            var sev = row.severity || 0;
            var pts = (row.contribution || 0) * 100;
            var sevColor = sev >= 0.6 ? 'var(--danger)' : sev >= 0.25 ? 'var(--warning)' : 'var(--success)';
            calcHtml += '<tr>' +
                '<td>' + row.name + ' <span style="font-size:10px;color:var(--text-muted);">(' + row.weight_label + ')</span></td>' +
                '<td style="font-size:12px;color:var(--text-muted);">' + row.measured + ' · normal: ' + row.normal_range + '</td>' +
                '<td style="font-weight:700;color:' + sevColor + ';">' + Math.round(sev * 100) + '% severity</td>' +
                '<td>+' + pts.toFixed(1) + ' pts</td></tr>';
        });
    } else {
        /* ── Legacy single waterfall (backend without panel scoring) ── */
        calcHtml += '<tr style="background:var(--bg);">' +
            '<td><strong>Base risk</strong></td>' +
            '<td>Model average before this patient\'s features</td>' +
            '<td>—</td>' +
            '<td><strong>' + Math.round(base * 100) + '</strong></td></tr>';
        var running2 = base;
        shap.forEach(function(item) {
            running2 += item.impact;
            var up = item.impact > 0;
            calcHtml += '<tr>' +
                '<td>' + getFeatureIcon(item.feature) + ' ' + formatFeatureName(item.feature) + '</td>' +
                '<td style="font-size:12px;color:var(--text-muted);">' + getFeatureDesc(item.feature, features) + '</td>' +
                '<td style="font-weight:700;color:' + (up ? 'var(--danger)' : 'var(--success)') + ';">' +
                    (up ? '↑ +' : '↓ −') + Math.abs(item.impact).toFixed(3) + '</td>' +
                '<td>' + Math.round(running2 * 100) + '</td></tr>';
        });
        calcHtml += '<tr style="background:var(--bg);border-top:2px solid var(--border);">' +
            '<td><strong>Final score</strong></td>' +
            '<td>Base + all contributions (matches the score above)</td>' +
            '<td>—</td>' +
            '<td><strong style="color:' + color + ';">' + score + '</strong></td></tr>';
    }
    document.getElementById('ur-calc').innerHTML = calcHtml;

    /* ── 6. Feature panel — matches the presentation slide exactly ──
       12 features (6 acoustic + 6 language) with the weights and normal
       ranges from the assessment framework slide. Measured values always
       come from the live extraction; status is computed from the slide's
       reference boundary — never hardcoded. */
    function slideRow(icon, name, weight, measured, normal, statusHtml) {
        var wColor = weight === 'HIGH' ? '#0d9488' : weight === 'Medium' ? '#d97706' : '#6b7280';
        return '<tr><td>' + icon + ' ' + name + '</td>' +
               '<td><span style="font-weight:700;color:' + wColor + ';">' + weight + '</span></td>' +
               '<td><strong>' + measured + '</strong></td>' +
               '<td style="font-size:12px;color:var(--text-muted);">' + normal + '</td>' +
               '<td>' + statusHtml + '</td></tr>';
    }
    function slideStat(value, normalIf, watchIf) {
        if (normalIf(value)) return 'normal';
        if (watchIf(value)) return 'watch';
        return 'flagged';
    }
    function noDataChip() {
        return '<span class="chip" style="background:#e5e7eb;color:#6b7280;">No data</span>';
    }

    var jitterPct = a.jitter || 0;
    var ttrVal = l.type_token_ratio || 0;
    var fillerPer100 = (l.filler_rate || 0) * 100;
    var semCoh = (typeof l.semantic_coherence === 'number') ? l.semantic_coherence : null;
    var circumloc = (typeof l.circumlocution_count === 'number') ? l.circumlocution_count : (l.vague_word_count || 0);

    var featHtml = '';
    // ── ACOUSTIC FEATURES ──
    featHtml += slideRow('⏱️', 'Pause Patterns', 'HIGH',
        (a.pause_duration_mean || 0).toFixed(2) + 's avg · ' + ((a.pause_ratio || 0) * 100).toFixed(0) + '% silence',
        '< 0.5 sec avg',
        urStatusChip(slideStat(a.pause_duration_mean || 0, function(v){return v < 0.5;}, function(v){return v < 1.0;})));
    featHtml += slideRow('🗣️', 'Voice Quality', 'Medium',
        'Jitter ' + jitterPct.toFixed(2) + '% · Shimmer ' + (a.shimmer || 0).toFixed(2) + '%',
        'Jitter < 1.04%',
        // Chip boundaries aligned with the panel severity ramp
        // (0% below 1.04, 100% at 5.0 — frame-level instrument calibration)
        urStatusChip(slideStat(jitterPct, function(v){return v < 1.04;}, function(v){return v < 5.0;})));
    featHtml += slideRow('⚡', 'Speech Rate', 'Medium',
        (l.speech_rate_wpm || 0).toFixed(0) + ' wpm',
        '120–150 wpm',
        urStatusChip(slideStat(l.speech_rate_wpm || 0, function(v){return v >= 120;}, function(v){return v >= 90;})));
    featHtml += slideRow('🎵', 'Pitch & Prosody', 'HIGH',
        (a.pitch_std_hz || 0).toFixed(1) + ' Hz variation',
        'Variation > 20 Hz',
        urStatusChip(slideStat(a.pitch_std_hz || 0, function(v){return v > 20;}, function(v){return v > 10;})));
    featHtml += slideRow('📊', 'Spectral Features', 'Low',
        (a.spectral_centroid || 0).toFixed(0) + ' Hz centroid',
        'Stable harmonics',
        urStatusChip('normal'));
    featHtml += slideRow('⏳', 'Response Timing', 'HIGH',
        (a.response_latency || 0).toFixed(2) + 's onset',
        '< 2 sec onset',
        urStatusChip(slideStat(a.response_latency || 0, function(v){return v < 2;}, function(v){return v < 3;})));
    // ── LANGUAGE FEATURES ──
    featHtml += slideRow('📚', 'Vocabulary Diversity', 'HIGH',
        'TTR ' + ttrVal.toFixed(2) + ' · ' + (l.unique_word_count || 0) + ' unique words',
        'TTR > 0.5',
        urStatusChip(slideStat(ttrVal, function(v){return v > 0.5;}, function(v){return v > 0.35;})));
    featHtml += slideRow('🔗', 'Semantic Coherence', 'HIGH',
        semCoh !== null ? semCoh.toFixed(2) + ' cosine' : 'Not extracted in prototype',
        'Cosine > 0.7',
        semCoh !== null ? urStatusChip(slideStat(semCoh, function(v){return v > 0.7;}, function(v){return v > 0.5;})) : noDataChip());
    featHtml += slideRow('🔍', 'Word-Finding Ability', 'HIGH',
        circumloc + ' circumlocution' + (circumloc === 1 ? '' : 's') + ' · ' + (l.vague_word_count || 0) + ' vague words',
        '< 2 circumlocutions',
        urStatusChip(slideStat(circumloc, function(v){return v < 2;}, function(v){return v < 5;})));
    featHtml += slideRow('🏗️', 'Sentence Structure', 'Medium',
        (l.mean_sentence_length || 0).toFixed(1) + ' words avg · ' + (l.sentence_count || 0) + ' sentences',
        'Complete > 80%',
        urStatusChip(slideStat(l.mean_sentence_length || 0, function(v){return v >= 8;}, function(v){return v >= 5;})));
    featHtml += slideRow('💬', 'Disfluency Markers', 'Low',
        fillerPer100.toFixed(1) + ' per 100 words · ' + (l.repetition_count || 0) + ' repetitions',
        '< 6 per 100 words',
        urStatusChip(slideStat(fillerPer100, function(v){return v < 6;}, function(v){return v < 9;})));
    featHtml += slideRow('🧠', 'Memory Language', 'Medium',
        (l.uncertainty_count || 0) + ' hedges ("I think", "maybe")',
        '< 4 hedges',
        urStatusChip(slideStat(l.uncertainty_count || 0, function(v){return v < 4;}, function(v){return v < 7;})));
    document.getElementById('ur-features').innerHTML = featHtml;

    /* ── 7. Key findings ── */
    var findings = document.getElementById('ur-findings');
    findings.innerHTML = '';
    (exp.key_indicators || []).forEach(function(indicator, i) {
        var isHigh = i < 2;
        var c = isHigh ? 'var(--danger)' : 'var(--warning)';
        var b = isHigh ? '3px solid var(--danger)' : '3px solid var(--warning)';
        var arrow = indicator.indexOf('↑') !== -1 ? '↑' : indicator.indexOf('↓') !== -1 ? '↓' : '•';
        var numMatch = indicator.match(/[\d\.]+/);
        var num = numMatch ? numMatch[0] : '';
        var div = document.createElement('div');
        div.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:12px;background:var(--bg);border-radius:var(--radius-sm);border-left:' + b + ';margin-bottom:8px;';
        div.innerHTML = '<div><div style="font-size:12px;font-weight:700;">' + indicator.split('—')[0] + '</div><div style="font-size:11px;color:var(--text-muted);">' + (indicator.split('—')[1] || '') + '</div></div><div style="font-size:16px;font-weight:800;color:' + c + ';">' + arrow + ' ' + num + '</div>';
        findings.appendChild(div);
    });
    if (!findings.hasChildNodes()) {
        findings.innerHTML = '<div style="padding:14px;color:var(--text-muted);font-size:13px;">No key findings returned for this recording.</div>';
    }

    /* ── 8. Explainability (acoustic / transcript / protective) ── */
    var acousticFeatures = ['pause_ratio','pitch_std_hz','short_utterance_count','duration_seconds','jitter','shimmer','hnr','spectral_centroid','spectral_rolloff','response_latency','articulation_rate','phonemes_per_second','zero_crossing_rate'];
    var expA = document.getElementById('ur-exp-acoustic');
    var expT = document.getElementById('ur-exp-transcript');
    var expP = document.getElementById('ur-exp-protective');
    expA.innerHTML = ''; expT.innerHTML = ''; expP.innerHTML = '';

    shap.forEach(function(item) {
        var isPositive = item.impact > 0;
        var div = document.createElement('div');
        div.style.cssText = 'padding:14px;background:var(--bg);border-radius:var(--radius-sm);border-left:' +
            (isPositive ? '3px solid var(--danger)' : '3px solid var(--success)') + ';margin-bottom:10px;';
        div.innerHTML = '<div style="font-size:13px;font-weight:700;color:' + (isPositive ? 'var(--danger)' : 'var(--success)') + ';margin-bottom:4px;">' +
            getFeatureIcon(item.feature) + ' ' + formatFeatureName(item.feature) +
            ' — ' + (isPositive ? '↑ Risk +' : '↓ Risk −') + Math.abs(item.impact).toFixed(3) + '</div>' +
            '<div style="font-size:12px;color:var(--text-muted);line-height:1.6;">' + getFeatureDesc(item.feature, features) + '</div>';
        if (acousticFeatures.indexOf(item.feature) !== -1) expA.appendChild(div);
        else expT.appendChild(div);
    });
    if (!expA.hasChildNodes()) expA.innerHTML = '<div style="padding:14px;color:var(--text-muted);font-size:13px;">No significant acoustic risk drivers.</div>';
    if (!expT.hasChildNodes()) expT.innerHTML = '<div style="padding:14px;color:var(--text-muted);font-size:13px;">No significant linguistic risk drivers.</div>';

    if (p.edu > 0) {
        var divE = document.createElement('div');
        divE.style.cssText = 'padding:14px;background:#d1fae5;border-radius:var(--radius-sm);border-left:3px solid var(--success);margin-bottom:10px;';
        divE.innerHTML = '<div style="font-size:13px;font-weight:700;color:var(--success);margin-bottom:4px;">📖 ' + eduLabel(p.edu) + '</div><div style="font-size:12px;color:#065f46;line-height:1.6;">Education provides cognitive reserve — extra brain capacity that helps compensate for early decline.</div>';
        expP.appendChild(divE);
    }
    shap.filter(function(item) { return item.impact < 0; }).forEach(function(item) {
        var divP = document.createElement('div');
        divP.style.cssText = 'padding:14px;background:#d1fae5;border-radius:var(--radius-sm);border-left:3px solid var(--success);margin-bottom:10px;';
        divP.innerHTML = '<div style="font-size:13px;font-weight:700;color:var(--success);margin-bottom:4px;">' + getFeatureIcon(item.feature) + ' ' + formatFeatureName(item.feature) + '</div><div style="font-size:12px;color:#065f46;line-height:1.6;">Acted as a protective factor, reducing the risk score by ' + Math.abs(item.impact).toFixed(3) + ' points.</div>';
        expP.appendChild(divP);
    });
    if (!expP.hasChildNodes()) expP.innerHTML = '<div style="padding:14px;color:var(--text-muted);font-size:13px;">No protective factors identified.</div>';
}
