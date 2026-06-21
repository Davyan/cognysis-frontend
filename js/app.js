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
    if (screenId === 'audio-capture') populateAudioCapture(); 
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

/* ============================================================
   REAL WAVEFORM ENGINE — Web Audio API Canvas Renderer
   ============================================================ */
var audioCtx = null;
var currentAudioBuffer = null;
var waveformAnimId = null;

function getAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
}

function drawStaticWaveform(audioBuffer, color) {
    var canvas = document.getElementById('waveformCanvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var width = canvas.width;
    var height = canvas.height;
    var data = audioBuffer.getChannelData(0);
    var step = Math.ceil(data.length / width);
    var amp = height / 2;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = color || '#22d3ee';
    ctx.beginPath();

    for (var i = 0; i < width; i++) {
        var min = 1.0;
        var max = -1.0;
        for (var j = 0; j < step; j++) {
            var datum = data[i * step + j];
            if (datum < min) min = datum;
            if (datum > max) max = datum;
        }
        var y1 = (1 + min) * amp;
        var y2 = (1 + max) * amp;
        ctx.fillRect(i, y1, 1, Math.max(1, y2 - y1));
    }
}

function drawLiveWaveform() {
    var canvas = document.getElementById('waveformCanvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var width = canvas.width;
    var height = canvas.height;
    var barCount = 80;
    var barWidth = width / barCount;

    function animate() {
        if (!document.getElementById('waveformCanvas')) return;
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#22d3ee';

        for (var i = 0; i < barCount; i++) {
            var h = 10 + Math.random() * (height - 20);
            var x = i * barWidth;
            var y = (height - h) / 2;
            ctx.fillRect(x + 1, y, barWidth - 2, h);
        }
        waveformAnimId = requestAnimationFrame(animate);
    }
    animate();
}

function stopLiveWaveform() {
    if (waveformAnimId) {
        cancelAnimationFrame(waveformAnimId);
        waveformAnimId = null;
    }
}

function loadAudioWaveform(file) {
    stopLiveWaveform();
    var reader = new FileReader();
    reader.onload = function(e) {
        var arrayBuffer = e.target.result;
        getAudioContext().decodeAudioData(arrayBuffer, function(buffer) {
            currentAudioBuffer = buffer;
            drawStaticWaveform(buffer, '#22d3ee');
            document.getElementById('waveform-label').textContent = '📁 FILE LOADED';
            document.getElementById('audio-status-badge').textContent = 'READY';
            document.getElementById('audio-status-badge').className = 'risk-pill risk-low';
            document.getElementById('waveform-timer').textContent = formatTime(buffer.duration);
        }, function(err) {
            console.error('Decode error:', err);
            showToast('Could not decode audio file', 'error');
        });
    };
    reader.readAsArrayBuffer(file);
}

function formatTime(seconds) {
    var m = Math.floor(seconds / 60);
    var s = Math.floor(seconds % 60);
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
}

/* ============================================================
   POPULATE AUDIO CAPTURE — Real transcript + waveform
   ============================================================ */
function populateAudioCapture() {
    var p = state.patient;
    var badge = document.getElementById('audio-status-badge');
    var transcriptCard = document.getElementById('transcript-card');

    // Update patient header
    if (p.first) {
        document.getElementById('cap-name').textContent = p.first + ' ' + p.last;
        document.getElementById('cap-avatar').textContent = (p.first[0] && p.last[0]) ? (p.first[0] + p.last[0]).toUpperCase() : '??';
        document.getElementById('cap-meta').innerHTML = '<span>' + p.age + ' yrs</span><span>•</span><span>' + p.sex + '</span><span>•</span><span>' + p.edu + ' yrs education</span>';
    }

    // If we have screening data (upload completed), show real transcript + waveform
    if (state.screening && state.screening.features && state.screening.features.linguistic) {
        var l = state.screening.features.linguistic;
        var transcript = l.transcript || '';
        var source = state.screening.source || 'upload';

        // Update badge
        if (badge) {
            if (source === 'twilio') {
                badge.textContent = '🔴 LIVE CALL';
                badge.className = 'risk-pill risk-high';
                document.getElementById('waveform-label').textContent = '🔴 LIVE CALL';
            } else {
                badge.textContent = '✓ UPLOAD COMPLETE';
                badge.className = 'risk-pill risk-low';
                document.getElementById('waveform-label').textContent = '📁 FILE LOADED';
            }
        }

        // Show transcript card
        if (transcriptCard) transcriptCard.style.display = 'block';

        // Build color-coded transcript
        var transcriptBox = document.getElementById('audio-capture-transcript');
        if (transcriptBox && transcript) {
            var html = '<div class="transcript-line"><div class="transcript-speaker">AI INTERVIEWER</div><div class="transcript-text">Can you tell me about what you did yesterday?</div></div>';
            html += '<div class="transcript-line"><div class="transcript-speaker">PATIENT</div><div class="transcript-text">';
            var tokens = transcript.split(/(\s+)/);
            var fillerWords = ['um','uh','erm','hmm','ah','er'];
            var vagueWords = ['thing','things','stuff','something','someone','somewhere','that place','the thing'];
            tokens.forEach(function(token) {
                var clean = token.toLowerCase().replace(/[.,!?;:"'()]/g, '');
                if (fillerWords.indexOf(clean) !== -1) {
                    html += '<span class="t-hesit">' + token + '</span>';
                } else if (vagueWords.indexOf(clean) !== -1) {
                    html += '<span class="t-vague">' + token + '</span>';
                } else {
                    html += '<span class="t-speech">' + token + '</span>';
                }
            });
            html += '</div></div>';
            html += '<div class="transcript-line" style="margin-top:12px;padding-top:8px;border-top:1px solid var(--border);">';
            html += '<div style="font-size:11px;color:var(--text-muted);">';
            html += '📊 ' + (l.word_count || 0) + ' words · ' + (l.filler_count || 0) + ' fillers · ' + (l.vague_word_count || 0) + ' vague words';
            html += '</div></div>';
            transcriptBox.innerHTML = html;
        }

        // If we have a buffer from file upload, draw it; otherwise live animation
        if (currentAudioBuffer && source !== 'twilio') {
            drawStaticWaveform(currentAudioBuffer, '#22d3ee');
        } else if (source === 'twilio') {
            drawLiveWaveform();
        }

    } else {
        // No data yet — show live animation and "Ready" badge
        if (badge) {
            badge.textContent = 'Ready';
            badge.className = 'risk-pill risk-moderate';
        }
        document.getElementById('waveform-label').textContent = '🔴 LIVE';
        document.getElementById('waveform-timer').textContent = '00:00';
        stopLiveWaveform();
        drawLiveWaveform();
        if (transcriptCard) transcriptCard.style.display = 'none';
    }
}

/* ============================================================
   POPULATE AUDIO CAPTURE — Shows real transcript after upload
   ============================================================ */
function populateAudioCapture() {
    var p = state.patient;
    var badge = document.querySelector('#audio-capture .risk-pill');
    var transcriptBox = document.querySelector('#audio-capture .transcript-box');

    // Update patient header from state
    if (p.first) {
        document.getElementById('cap-name').textContent = p.first + ' ' + p.last;
        document.getElementById('cap-avatar').textContent = (p.first[0] && p.last[0]) ? (p.first[0] + p.last[0]).toUpperCase() : '??';
        document.getElementById('cap-meta').innerHTML = '<span>' + p.age + ' yrs</span><span>•</span><span>' + p.sex + '</span><span>•</span><span>' + p.edu + ' yrs education</span>';
    }

    // If we have screening data, show real transcript
    if (state.screening && state.screening.features && state.screening.features.linguistic) {
        var l = state.screening.features.linguistic;
        var transcript = l.transcript || '';
        var source = state.screening.source || 'upload';

        // Update badge based on source
        if (badge) {
            if (source === 'twilio') {
                badge.textContent = '🔴 LIVE CALL';
                badge.className = 'risk-pill risk-high';
            } else {
                badge.textContent = '✓ UPLOAD COMPLETE';
                badge.className = 'risk-pill risk-low';
            }
        }

        // Build color-coded transcript HTML
        if (transcriptBox && transcript) {
            var html = '<div class="transcript-line"><div class="transcript-speaker">AI INTERVIEWER</div><div class="transcript-text">Can you tell me about what you did yesterday?</div></div>';
            html += '<div class="transcript-line"><div class="transcript-speaker">PATIENT</div><div class="transcript-text">';

            var tokens = transcript.split(/(\s+)/);
            var fillerWords = ['um','uh','erm','hmm','ah','er'];
            var vagueWords = ['thing','things','stuff','something','someone','somewhere','that place','the thing'];

            tokens.forEach(function(token) {
                var clean = token.toLowerCase().replace(/[.,!?;:"'()]/g, '');
                if (fillerWords.indexOf(clean) !== -1) {
                    html += '<span class="t-hesit">' + token + '</span>';
                } else if (vagueWords.indexOf(clean) !== -1) {
                    html += '<span class="t-vague">' + token + '</span>';
                } else {
                    html += '<span class="t-speech">' + token + '</span>';
                }
            });

            html += '</div></div>';
            html += '<div class="transcript-line" style="margin-top:12px;padding-top:8px;border-top:1px solid var(--border);">';
            html += '<div style="font-size:11px;color:var(--text-muted);">';
            html += '📊 ' + (l.word_count || 0) + ' words · ' + (l.filler_count || 0) + ' fillers · ' + (l.vague_word_count || 0) + ' vague words';
            html += '</div></div>';

            transcriptBox.innerHTML = html;
        }
    } else {
        // No data yet — show demo transcript and "Recording" badge
        if (badge) {
            badge.textContent = 'Recording';
            badge.className = 'risk-pill risk-moderate';
        }
        // Leave the default HTML demo transcript as-is
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
        state.screening.source = 'upload';  
        populateFeatureExtraction(data); 
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
