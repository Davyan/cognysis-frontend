/* ===== LIVE CALL MONITOR ===== */
const API_BASE = "https://davyanh-cognysis-api.hf.space";

function getCallIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('call_id');
}

function formatDuration(ms) {
    if (!ms || ms === 0) return '0s';
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
}

function updateRiskClass(element, risk) {
    element.className = 'value';
    if (risk === 'low') element.classList.add('risk-low');
    else if (risk === 'medium') element.classList.add('risk-medium');
    else if (risk === 'high') element.classList.add('risk-high');
    else element.classList.add('risk-unknown');
}

async function pollCall(callId) {
    try {
        const res = await fetch(`${API_BASE}/api/calls/${callId}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        // Update call info
        document.getElementById('patientName').textContent = data.patient_name || 'Unknown';
        document.getElementById('patientPhone').textContent = data.patient_phone || '—';
        document.getElementById('callId').textContent = data.retell_call_id || callId;

        // Update status
        const statusEl = document.getElementById('status');
        const status = (data.status || 'unknown').toLowerCase();
        statusEl.textContent = data.status ? data.status.toUpperCase() : 'UNKNOWN';
        statusEl.className = `status ${status}`;

        // Update timer
        const timerEl = document.getElementById('timer');
        if (status === 'completed') {
            timerEl.textContent = `⏱️ Duration: ${formatDuration(data.duration_ms)}`;
        } else if (status === 'ongoing') {
            timerEl.innerHTML = `<span class="spinner"></span> Call in progress...`;
        } else if (status === 'failed') {
            timerEl.textContent = `❌ Failed: ${data.disconnection_reason || 'Unknown reason'}`;
        } else {
            timerEl.innerHTML = `<span class="spinner"></span> ${data.status || 'Waiting'}...`;
        }

        // Show analysis
        if (data.status === 'completed' || data.status === 'ongoing' || (data.transcript_object && data.transcript_object.length > 0)) {
            document.getElementById('analysisCard').classList.remove('hidden');
            document.getElementById('patientWords').textContent = data.patient_word_count || 0;
            document.getElementById('agentWords').textContent = data.agent_word_count || 0;
            document.getElementById('orientationScore').textContent = (data.orientation_score || 0) + '/100';
            document.getElementById('durationSec').textContent = formatDuration(data.duration_ms);
            document.getElementById('transcriptTurns').textContent = (data.transcript_object || []).length;

            const riskEl = document.getElementById('riskFlag');
            riskEl.textContent = (data.risk_flag || 'unknown').toUpperCase();
            updateRiskClass(riskEl, data.risk_flag);
        }

        // Render transcript
        if (data.transcript_object && data.transcript_object.length > 0) {
            const transcriptDiv = document.getElementById('transcript');
            transcriptDiv.innerHTML = data.transcript_object.map((turn, i) => {
                const isAgent = turn.role === 'agent';
                const roleLabel = isAgent ? 'Nurse' : 'Patient';
                const cssClass = isAgent ? 'agent' : 'user';
                const roleClass = isAgent ? 'nurse' : 'patient';
                return `<div class="turn ${cssClass}" style="animation-delay: ${i * 0.05}s">
                    <div class="role ${roleClass}">${roleLabel}</div>
                    <div class="content">${turn.content || ''}</div>
                </div>`;
            }).join('');
        }

        // Handle recording
        const recordingCard = document.getElementById('recordingCard');
        if (status === 'completed' || status === 'ongoing') {
            recordingCard.classList.remove('hidden');
        }

        if (data.recording_url) {
            document.getElementById('recordingContent').innerHTML = `
                <div class="recording">
                    <a href="${data.recording_url}" target="_blank" download>
                        🔗 Download Dual-Channel Recording
                    </a>
                    <div class="recording-meta">
                        Duration: ${data.recording_duration || '?'}s | 
                        Channels: ${data.recording_channels || 2} | 
                        Format: MP3 (Stereo)
                    </div>
                    <div class="recording-meta" style="margin-top:4px;">
                        <strong>Channel 1</strong> = Patient audio | 
                        <strong>Channel 2</strong> = Nurse AI audio
                    </div>
                </div>
            `;
        }

        return data;

    } catch (e) {
        console.error('Poll error:', e);
        document.getElementById('timer').textContent = `⚠️ Error: ${e.message}. Retrying...`;
        return null;
    }
}

async function checkRecording(callId) {
    const btn = document.getElementById('checkRecordingBtn');
    if (!btn) return;

    btn.textContent = 'Checking Twilio...';
    btn.disabled = true;

    try {
        const res = await fetch(`${API_BASE}/api/calls/${callId}/check-recording`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        console.log('Recording check:', data);

        if (data.status === 'found') {
            await pollCall(callId);
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

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    const callId = getCallIdFromUrl();
    
    if (!callId) {
        document.getElementById('status').textContent = 'ERROR: NO CALL ID';
        document.getElementById('status').className = 'status failed';
        document.getElementById('timer').textContent = 'Add ?call_id=call_xxx to the URL';
        return;
    }

    pollCall(callId);

    const pollInterval = setInterval(() => {
        pollCall(callId).then(data => {
            if (data && (data.status === 'completed' || data.status === 'failed')) {
                setTimeout(() => clearInterval(pollInterval), 30000);
            }
        });
    }, 5000);
});
