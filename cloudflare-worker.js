// KV namespace bindings:
// - RELAY_STATE: for storing relay state
// - RELAY_HISTORY: for storing trigger history

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
            Last Poll: <span id="lastPoll">Loading...</span>
        </div>
        <button id="triggerButton" class="button" onclick="triggerRelay()">
            Trigger Relay
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
                    document.getElementById('triggerButton').disabled = !data.canTrigger;
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

        function triggerRelay() {
            fetch('/trigger', { method: 'POST' })
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
    return hour >= 23 || hour < 7;
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

async function handleRequest(request) {
    const url = new URL(request.url);
    
    // Serve web interface
    if (url.pathname === '/' || url.pathname === '') {
        return new Response(HTML_TEMPLATE, {
            headers: { 'Content-Type': 'text/html' }
        });
    }
    
    // Handle status request
    if (url.pathname === '/status') {
        const state = await RELAY_STATE.get('state') || 'off';
        const lastPoll = await RELAY_STATE.get('lastPoll') || new Date().toISOString();
        const canTrigger = isWithinAllowedHours();
        
        return new Response(JSON.stringify({
            state,
            lastPoll,
            canTrigger,
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
    
    // Handle poll request from Pico
    if (url.pathname === '/poll') {
        const state = await RELAY_STATE.get('state') || 'off';
        await RELAY_STATE.put('lastPoll', new Date().toISOString());
        return new Response(state);
    }
    
    // Handle trigger request
    if (url.pathname === '/trigger') {
        if (!isWithinAllowedHours()) {
            return new Response(JSON.stringify({
                error: 'Relay can only be triggered between 11 PM and 7 AM EST'
            }), {
                status: 403,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        const currentState = await RELAY_STATE.get('state') || 'off';
        const newState = currentState === 'on' ? 'off' : 'on';
        
        await RELAY_STATE.put('state', newState);
        await addToHistory(newState, request.headers.get('User-Agent')?.includes('Mozilla') ? 'Web Interface' : 'Gmail');
        
        return new Response(JSON.stringify({ state: newState }), {
            headers: { 'Content-Type': 'application/json' }
        });
    }
    
    return new Response('Not Found', { status: 404 });
}

addEventListener('fetch', event => {
    event.respondWith(handleRequest(event.request));
});