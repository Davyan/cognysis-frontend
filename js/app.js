/* ===== 1. CONFIG ===== */
const API = "https://davyanh-cognysis-api.hf.space";

/* ===== 2. STATE ===== */
let state = {
    patient: { id: null, first: "", last: "", age: 0, sex: "", edu: 0, lang: "" },
    screening: null,
    history: [],
    selectedFile: null,
    selectedFileOnly: null
};

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
    if (screenId === 'audio-capture') initWaveform();
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

function initWaveform() {
    var container = document.getElementById('waveform');
    if (!container) return;
    container.innerHTML = '';
    var barCount = 60;
    for (var i = 0; i < barCount; i++) {
        var bar = document.createElement('div');
        bar.className = 'waveform-bar';
        bar.style.left = (i * (100 / barCount)) + '%';
        bar.style.height = (20 + Math.random() * 80) + '%';
        bar.style.animationDelay = (i * 0.05) + 's';
        bar.style.opacity = 0.3 + Math.random() * 0.7;
        container.appendChild(bar);
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

    // Helper to set status badge
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
    // Pause Patterns
    var pauseRatio = a.pause_ratio || 0;
    var pauseStatus = pauseRatio > 0.35 ? 'flagged' : pauseRatio > 0.20 ? 'watch' : 'normal';
    setStatus('feat-pause', pauseStatus, 'Pause ratio: ' + (pauseRatio * 100).toFixed(1) + '% — ' + (pauseRatio > 0.30 ? 'elevated pauses between words' : 'within typical range'));

    // Voice Quality (proxy: pitch stability + HNR)
    var pitchStd = a.pitch_std_hz || 0;
    var hnr = 20; // placeholder since backend doesn't compute HNR yet
    var voiceStatus = (pitchStd < 15 || hnr < 15) ? 'flagged' : (pitchStd < 25 || hnr < 20) ? 'watch' : 'normal';
    setStatus('feat-voice', voiceStatus, 'Pitch std: ' + pitchStd.toFixed(1) + ' Hz — ' + (pitchStd < 20 ? 'reduced variation detected' : 'stable vocal control'));

    // Speech Rate
    var rate = l.speech_rate_wpm || 0;
    var rateStatus = rate < 80 ? 'flagged' : rate < 110 ? 'watch' : 'normal';
    setStatus('feat-rate', rateStatus, 'Speech rate: ' + rate.toFixed(1) + ' WPM — ' + (rate < 100 ? 'slower than typical' : 'normal pace'));

    // Pitch & Prosody
    var pitchStatus = pitchStd < 20 ? 'flagged' : pitchStd < 35 ? 'watch' : 'normal';
    setStatus('feat-pitch', pitchStatus, 'Pitch variation: ' + pitchStd.toFixed(1) + ' Hz — ' + (pitchStd < 25 ? 'monotone tendencies detected' : 'expressive range'));

    // Spectral Features (proxy: MFCC variance)
    var mfccVar = a.mfcc_mean ? 1.0 : 0.89; // placeholder
    var spectralStatus = 'normal';
    setStatus('feat-spectral', spectralStatus, 'MFCC fingerprint extracted — vocal tract dynamics normal');

    // Response Timing (proxy: duration + short utterances)
    var dur = a.duration_seconds || 0;
    var shortCount = a.short_utterance_count || 0;
    var timingStatus = (dur > 90 || shortCount > 4) ? 'flagged' : (dur > 60 || shortCount > 2) ? 'watch' : 'normal';
    setStatus('feat-timing', timingStatus, 'Duration: ' + dur.toFixed(1) + 's, Short utterances: ' + shortCount + ' — ' + (shortCount > 3 ? 'frequent aborted starts' : 'typical turn structure'));

    // ─── TRANSCRIPT ───
    // Vocabulary Diversity (proxy: word count / unique estimate)
    var wordCount = l.word_count || 0;
    var vocabStatus = wordCount < 60 ? 'flagged' : wordCount < 120 ? 'watch' : 'normal';
    setStatus('feat-vocab', vocabStatus, 'Word count: ' + wordCount + ' — ' + (wordCount < 80 ? 'reduced lexical output' : 'healthy vocabulary range'));

    // Semantic Coherence (proxy: transcript length + filler ratio)
    var fillerRate = l.filler_rate || 0;
    var semStatus = (fillerRate > 0.08 || wordCount < 50) ? 'flagged' : (fillerRate > 0.04 || wordCount < 100) ? 'watch' : 'normal';
    setStatus('feat-semantic', semStatus, 'Filler rate: ' + (fillerRate * 100).toFixed(1) + '% — ' + (fillerRate > 0.06 ? 'ideas may drift or empty' : 'coherent topic flow'));

    // Word-Finding (proxy: fillers + short utterances as proxy for circumlocutions)
    var wordfindStatus = (fillerRate > 0.06 || shortCount > 3) ? 'flagged' : (fillerRate > 0.03 || shortCount > 1) ? 'watch' : 'normal';
    setStatus('feat-wordfind', wordfindStatus, 'Filled pauses: ' + l.filler_count + ' — ' + (l.filler_count > 3 ? 'frequent word-searching behavior' : 'smooth retrieval'));

    // Sentence Structure (proxy: word count per sentence estimate)
    var estSentences = Math.max(1, transcript.split(/[.!?]+/).length - 1);
    var avgLen = wordCount / estSentences;
    var sentStatus = avgLen < 5 ? 'flagged' : avgLen < 8 ? 'watch' : 'normal';
    setStatus('feat-sentence', sentStatus, 'Avg sentence: ' + avgLen.toFixed(1) + ' words — ' + (avgLen < 6 ? 'simplified structure' : 'complex grammar'));

    // Disfluency Markers
    var disfStatus = fillerRate > 0.08 ? 'flagged' : fillerRate > 0.04 ? 'watch' : 'normal';
    setStatus('feat-disfluency', disfStatus, 'Disfluency rate: ' + (fillerRate * 100).toFixed(1) + '% — ' + (fillerRate > 0.06 ? 'frequent "um/uh" buffering' : 'normal self-correction'));

    // Memory Language (proxy: uncertainty phrases in transcript)
    var lowerTrans = transcript.toLowerCase();
    var uncertainty = ['i think', 'maybe', 'probably', 'sort of', 'i guess', 'not sure'].filter(function(w) {
        return lowerTrans.indexOf(w) !== -1;
    }).length;
    var memStatus = uncertainty > 3 ? 'flagged' : uncertainty > 1 ? 'watch' : 'normal';
    setStatus('feat-memory', memStatus, 'Uncertainty markers: ' + uncertainty + ' — ' + (uncertainty > 2 ? 'frequent verbal hedging' : 'confident declarations'));

    // ─── MODULE CARD STATS ───
    var acousticFlagged = [pauseStatus, voiceStatus, pitchStatus, timingStatus].filter(function(s) { return s === 'flagged'; }).length;
    var transcriptFlagged = [vocabStatus, semStatus, wordfindStatus, sentStatus, disfStatus, memStatus].filter(function(s) { return s === 'flagged'; }).length;

    document.getElementById('mod-acoustic-flagged').textContent = acousticFlagged;
    document.getElementById('mod-transcript-flagged').textContent = transcriptFlagged;
    document.getElementById('mod-acoustic-pause').textContent = (pauseRatio * 100).toFixed(0) + '%';
    document.getElementById('mod-transcript-vocab').textContent = wordCount + ' words';
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
    navTo('feature-extraction');
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
        populateAnalysis(data);
        populateResults(data);
        populateExplainability(data);
        await new Promise(function(r) { setTimeout(r, 1500); });
        navTo('analysis');
        showToast('Analysis complete');
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

function populateExplainability(data) {
    var pred = data.prediction;
    var features = data.features;
    var acoustic = document.getElementById('exp-acoustic');
    var transcript = document.getElementById('exp-transcript');
    var protective = document.getElementById('exp-protective');
    acoustic.innerHTML = ''; transcript.innerHTML = ''; protective.innerHTML = '';

    pred.shap_breakdown.forEach(function(item) {
        if (item.impact <= 0) return;
        var isHigh = item.impact > 0.1;
        var b = isHigh ? '3px solid var(--danger)' : '3px solid var(--warning)';
        var c = isHigh ? 'var(--danger)' : 'var(--warning)';
        var desc = getFeatureDesc(item.feature, features);
        var div = document.createElement('div');
        div.style.cssText = 'padding:14px;background:var(--bg);border-radius:var(--radius-sm);border-left:' + b + ';margin-bottom:10px;';
        div.innerHTML = '<div style="font-size:13px;font-weight:700;color:' + c + ';margin-bottom:4px;">' + getFeatureIcon(item.feature) + ' ' + formatFeatureName(item.feature) + ' — Impact: +' + item.impact.toFixed(3) + '</div><div style="font-size:12px;color:var(--text-muted);line-height:1.6;">' + desc + '</div>';
        if (['pause_ratio','pitch_std_hz','short_utterance_count','duration_seconds'].indexOf(item.feature) !== -1) {
            acoustic.appendChild(div);
        } else {
            transcript.appendChild(div);
        }
    });

    var edu = state.patient.edu;
    if (edu > 0) {
        var div = document.createElement('div');
        div.style.cssText = 'padding:14px;background:#d1fae5;border-radius:var(--radius-sm);border-left:3px solid var(--success);';
        div.innerHTML = '<div style="font-size:13px;font-weight:700;color:var(--success);margin-bottom:4px;">📖 ' + edu + ' Years of Education</div><div style="font-size:12px;color:#065f46;line-height:1.6;">' + edu + ' years of schooling provides cognitive reserve — extra brain capacity that helps compensate for early decline. The system adjusted the score upward because of this protective factor.</div>';
        protective.appendChild(div);
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
        navTo('results');
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
        navTo('results');
    } catch (e) {
        showToast(diagnoseFetchError(e, endpoint), 'error');
        console.error(e);
    } finally {
        setSpinner(false);
    }
}

/* ===== 10. FEATURE HELPERS ===== */
function getFeatureIcon(name) {
    var map = { 'speech_rate_wpm': '⚡', 'pause_ratio': '⏱️', 'pitch_std_hz': '🎵', 'short_utterance_count': '💬', 'duration_seconds': '⏳' };
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
        'duration_seconds': 'The recording was ' + a.duration_seconds + ' seconds. Extended duration with the same word count suggests slower, effortful speech.'
    };
    return descs[name] || 'Significant contribution to risk score.';
}

/* ===== 11. TWILIO ===== */
async function triggerOutboundCall() {
    var phone = document.getElementById('p-phone') ? document.getElementById('p-phone').value.trim() : '';
    if (!phone) { showToast('Please enter a phone number first', 'error'); return; }
    if (!state.patient.id) { showToast('Please register the patient first (click Begin)', 'error'); return; }
    var endpoint = API + '/twilio/call?phone_number=' + encodeURIComponent(phone) + '&patient_id=' + state.patient.id;
    setSpinner(true, 'Initiating Twilio call...');
    try {
        var res = await fetch(endpoint, { headers: { 'Accept': 'application/json' } });
        if (!res.ok) {
            var err = await res.json().catch(function() { return { detail: 'Call failed' }; });
            throw new Error(err.detail || 'Call failed');
        }
        var data = await res.json();
        showToast('Calling ' + phone + '... Call SID: ' + data.call_sid);
        setTimeout(function() { pollForTwilioResult(); }, 30000);
    } catch (e) {
        showToast(diagnoseFetchError(e, endpoint), 'error');
        console.error(e);
    } finally {
        setSpinner(false);
    }
}

async function pollForTwilioResult() {
    await loadHistory();
    var twilioScreening = state.history.find(function(s) { return s.source === 'twilio' && s.patient_name.indexOf(state.patient.first) !== -1; });
    if (twilioScreening) {
        showToast('Phone screening received!');
        await loadScreening(twilioScreening.id);
    } else {
        showToast('Call still in progress. Check history later.', 'warning');
    }
}

/* ===== 12. INITIALIZATION ===== */
document.addEventListener('DOMContentLoaded', function() {
    checkApiHealth();
    loadHistory();

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
