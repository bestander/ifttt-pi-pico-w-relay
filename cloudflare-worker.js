// KV namespace bindings:
// - RELAY_STATE: for storing relay state
// - RELAY_HISTORY: for storing trigger history

const AUTO_OFF_DELAY = 120; // 2 minutes in seconds
const SPREADSHEET_ID = 'MY_SPREADSHEET_ID';
const ALLOWED_START_HOUR = 23; // 11 PM EST
const ALLOWED_END_HOUR = 7;    // 7 AM EST

const HTML_TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
    <title>Relay Control</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 20px auto;
            padding: 0 20px;
            background-color: #f5f5f5;
        }
        .card {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin-bottom: 20px;
        }
        .button {
            background-color: #4CAF50;
            color: white;
            padding: 10px 20px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
        }
        .button:disabled {
            background-color: #cccccc;
            cursor: not-allowed;
        }
        .status {
            font-size: 18px;
            margin: 20px 0;
        }
        .history {
            margin-top: 20px;
        }
        .history-item {
            padding: 10px;
            border-bottom: 1px solid #eee;
        }
        .error {
            color: red;
            margin: 10px 0;
        }
    </style>
</head>
<body>
    <div class="card">
        <h1>Relay Control</h1>
        <div class="status">
            Current State: <strong id="currentState">Loading...</strong><br>
            Last Poll: <span id="lastPoll">Loading...</span><br>
            <span id="autoOffStatus"></span>
        </div>
        <button id="triggerOnButton" class="button" onclick="triggerRelay('on')" style="margin-right: 10px;">
            Turn On
        </button>
        <button id="triggerOffButton" class="button" onclick="triggerRelay('off')">
            Turn Off
        </button>
        <div id="error" class="error"></div>
    </div>
    
    <div class="card">
        <h2>Trigger History</h2>
        <div id="history" class="history">
            Loading...
        </div>
    </div>

    <script>
        function updateUI() {
            fetch('/status')
                .then(response => response.json())
                .then(data => {
                    document.getElementById('currentState').textContent = data.state;
                    document.getElementById('lastPoll').textContent = new Date(data.lastPoll).toLocaleString();
                    document.getElementById('triggerOnButton').disabled = !data.canTrigger;
                    document.getElementById('triggerOffButton').disabled = !data.canTrigger;
                    
                    // Update auto-off status
                    const autoOffEl = document.getElementById('autoOffStatus');
                    if (data.state === 'on' && data.autoOffAt) {
                        const timeLeft = Math.max(0, Math.floor((new Date(data.autoOffAt) - new Date()) / 1000));
                        if (timeLeft > 0) {
                            autoOffEl.textContent = \`Auto-off in \${timeLeft} seconds\`;
                        } else {
                            autoOffEl.textContent = 'Turning off...';
                        }
                    } else {
                        autoOffEl.textContent = '';
                    }
                    
                    if (!data.canTrigger) {
                        document.getElementById('error').textContent = data.message || '';
                    } else {
                        document.getElementById('error').textContent = '';
                    }
                });
            
            fetch('/history')
                .then(response => response.json())
                .then(data => {
                    const historyHtml = data.map(item => 
                        \`<div class="history-item">
                            \${new Date(item.timestamp).toLocaleString()} - \${item.action} 
                            (\${item.source})
                        </div>\`
                    ).join('');
                    document.getElementById('history').innerHTML = historyHtml;
                });
        }

        function triggerRelay(action) {
            fetch('/trigger_' + action, { 
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ source: 'Web Interface' })
            })
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    document.getElementById('error').textContent = data.error;
                }
                updateUI();
            });
        }

        // Update UI every 5 seconds
        updateUI();
        setInterval(updateUI, 5000);
    </script>
</body>
</html>
`;

// Check if current time is within allowed hours (11 PM - 7 AM EST)
function isWithinAllowedHours() {
    const now = new Date();
    const est = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const hour = est.getHours();
    return hour >= ALLOWED_START_HOUR || hour < ALLOWED_END_HOUR;
}

async function addToHistory(action, source) {
    const history = JSON.parse(await RELAY_HISTORY.get('history') || '[]');
    history.unshift({
        timestamp: new Date().toISOString(),
        action,
        source
    });
    
    // Keep only last 50 entries
    if (history.length > 50) {
        history.length = 50;
    }
    
    await RELAY_HISTORY.put('history', JSON.stringify(history));
}

async function scheduleAutoOff() {
    const turnOffTime = new Date(Date.now() + AUTO_OFF_DELAY * 1000).toISOString();
    await RELAY_STATE.put('auto_off_time', turnOffTime);
}

async function checkAutoOff() {
    const turnOffTime = await RELAY_STATE.get('auto_off_time');
    const currentState = await RELAY_STATE.get('state');
    
    if (turnOffTime && currentState === 'on' && new Date(turnOffTime) <= new Date()) {
        await RELAY_STATE.put('state', 'off');
        await addToHistory('off', 'Auto Off');
        await RELAY_STATE.delete('auto_off_time');
        return true;
    }
    return false;
}

async function checkSpreadsheet(env) {
    try {
        const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv`;
        const response = await fetch(spreadsheetUrl);
        if (!response.ok) {
            console.error('Failed to fetch spreadsheet:', response.status);
            return false;
        }

        const csv = await response.text();
        const rows = csv.split('\n').filter(row => row.trim());
        
        if (rows.length === 0) return false;
        
        // Only check the first row
        const firstRow = rows[0];
        const timestamp = firstRow.split('\t')[0].trim(); // Get first column (A1) and trim whitespace
        
        if (!timestamp) return false;

        console.log('Raw timestamp from spreadsheet:', timestamp);

        // Parse the timestamp from the spreadsheet
        const newTimestamp = new Date(timestamp);
        console.log('Parsed timestamp:', newTimestamp.toISOString());

        if (isNaN(newTimestamp.getTime())) {
            console.error('Invalid timestamp format:', timestamp);
            return false;
        }

        // Get the last triggered timestamp
        const lastTriggerTime = await RELAY_STATE.get('last_trigger_time');
        if (lastTriggerTime && lastTriggerTime === timestamp) {
            console.log('Already triggered this timestamp:', timestamp);
            return false;
        }

        // Store the raw timestamp string to compare exactly
        await RELAY_STATE.put('last_trigger_time', timestamp);
        console.log('New activity detected, triggering relay');
        return true;

    } catch (error) {
        console.error('Error checking spreadsheet:', error);
        return false;
    }
}

async function handleRequest(request, env) {
    const url = new URL(request.url);
    
    // Serve web interface
    if (url.pathname === '/' || url.pathname === '') {
        return new Response(HTML_TEMPLATE, {
            headers: { 'Content-Type': 'text/html' }
        });
    }
    
    // Add auto-off check to status endpoint since it's frequently polled
    if (url.pathname === '/status') {
        await checkAutoOff();
        
        const state = await RELAY_STATE.get('state') || 'off';
        const lastPoll = await RELAY_STATE.get('lastPoll') || new Date().toISOString();
        const turnOffTime = await RELAY_STATE.get('auto_off_time');
        const canTrigger = isWithinAllowedHours();
        
        return new Response(JSON.stringify({
            state,
            lastPoll,
            canTrigger,
            autoOffAt: turnOffTime,
            message: canTrigger ? '' : 'Relay can only be triggered between 11 PM and 7 AM EST'
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
    }
    
    // Handle history request
    if (url.pathname === '/history') {
        const history = JSON.parse(await RELAY_HISTORY.get('history') || '[]');
        return new Response(JSON.stringify(history), {
            headers: { 'Content-Type': 'application/json' }
        });
    }
    
    // Also check auto-off on poll requests
    if (url.pathname === '/poll') {
        await checkAutoOff();
        // First check current state
        const currentState = await RELAY_STATE.get('state') || 'off';
        
        // Only check spreadsheet if relay is off
        if (currentState === 'off') {
            const hasNewActivity = await checkSpreadsheet(env);
            if (hasNewActivity && isWithinAllowedHours()) {
                await RELAY_STATE.put('state', 'on');
                await scheduleAutoOff();
                await addToHistory('on', 'Spreadsheet Activity');
            }
        }

        // Return current state
        const state = await RELAY_STATE.get('state') || 'off';
        await RELAY_STATE.put('lastPoll', new Date().toISOString());
        return new Response(state);
    }
    
    // Handle trigger request
    if (url.pathname === '/trigger_on' || url.pathname === '/trigger_off') {
        if (!isWithinAllowedHours()) {
            return new Response(JSON.stringify({
                error: 'Relay can only be triggered between 11 PM and 7 AM EST'
            }), {
                status: 403,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        const newState = url.pathname === '/trigger_on' ? 'on' : 'off';
        let source = 'External';  // default source
        
        // Try to get source from request body
        try {
            const body = await request.json();
            if (body.source) {
                source = body.source;
            }
        } catch (e) {
            // If no body or invalid JSON, use default source
        }
        
        // First add to history, then update state
        await addToHistory(newState, source);
        await RELAY_STATE.put('state', newState);
        
        // Schedule auto-off if turning on
        if (newState === 'on') {
            await scheduleAutoOff();
        } else {
            await RELAY_STATE.delete('auto_off_time');
            await RELAY_STATE.put('last_processed_timestamp', new Date().toISOString());
        }
        
        return new Response(JSON.stringify({ 
            state: newState,
            autoOffAt: newState === 'on' ? await RELAY_STATE.get('auto_off_time') : null
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
    }
    
    return new Response('Not Found', { status: 404 });
}

addEventListener('fetch', event => {
    event.respondWith(handleRequest(event.request, event.env));
});