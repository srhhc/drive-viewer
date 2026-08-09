/**
 * ============================================
 * get-refresh-token.js
 *
 * רץ פעם אחת על המחשב שלך כדי לקבל Refresh Token של Google OAuth.
 * הטוקן הזה יאוחסן ב-GitHub Secrets ויאפשר ל-workflow לגשת
 * לתיקיות Drive שהמשתמש שלך צופה בהן (גם כאלו שאינן ציבוריות).
 *
 * דרישות מקדימות:
 *   1. כנס ל-Google Cloud Console → APIs & Services → Credentials
 *   2. צור "OAuth 2.0 Client ID" מסוג "Web application"
 *   3. הוסף את הכתובת הזו ל-"Authorized redirect URIs":
 *      http://localhost:3000/oauth2callback
 *   4. העתק את ה-Client ID וה-Client Secret
 *
 * הרצה:
 *   DRIVE_CLIENT_ID=xxx DRIVE_CLIENT_SECRET=yyy node get-refresh-token.js
 * ============================================
 */

const http = require('http');
const { exec } = require('child_process');

const CLIENT_ID = process.env.DRIVE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.DRIVE_CLIENT_SECRET || '';
const PORT = 3000;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;

// Scopes needed for reading Drive files
const SCOPES = 'https://www.googleapis.com/auth/drive.readonly';

const OAUTH_BASE = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

async function main() {
    if (!CLIENT_ID || !CLIENT_SECRET) {
        console.error('❌ Missing DRIVE_CLIENT_ID or DRIVE_CLIENT_SECRET.');
        console.error('   Set them as environment variables and try again.');
        console.error('   Example: DRIVE_CLIENT_ID=xxx DRIVE_CLIENT_SECRET=yyy node get-refresh-token.js');
        process.exit(1);
    }

    console.log('🔐 Google Drive OAuth — Generating Refresh Token');
    console.log('─'.repeat(50));

    // Build the OAuth URL
    const authUrl = `${OAUTH_BASE}?` + new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: 'code',
        scope: SCOPES,
        access_type: 'offline',       // ← This gives us a refresh token
        prompt: 'consent'             // ← Force re-consent to ensure refresh token
    }).toString();

    console.log(`\n📋 Opening your browser for Google login...`);
    console.log(`   If it doesn't open, go to:\n   ${authUrl}\n`);

    // Open the browser
    openBrowser(authUrl);

    // Start a local HTTP server to catch the OAuth callback
    const code = await startServer();

    console.log('   ✅ Authorization code received.');

    // Exchange the authorization code for tokens
    console.log('🔄 Exchanging code for tokens...');
    const tokens = await exchangeCode(code);

    console.log('\n' + '═'.repeat(50));
    console.log('🎉 Success! Here is your REFRESH TOKEN:\n');
    console.log(tokens.refresh_token);
    console.log('\n' + '═'.repeat(50));
    console.log('\n📋 Add these to your GitHub Secrets:');
    console.log(`   DRIVE_CLIENT_ID     = ${CLIENT_ID}`);
    console.log(`   DRIVE_CLIENT_SECRET = ${CLIENT_SECRET}`);
    console.log(`   DRIVE_REFRESH_TOKEN = ${tokens.refresh_token}`);
    console.log('\n💡 Keep the refresh token secret — it grants access to your Drive files.');
}

function startServer() {
    return new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
            const url = new URL(req.url, `http://localhost:${PORT}`);

            if (url.pathname === '/oauth2callback') {
                const code = url.searchParams.get('code');
                const error = url.searchParams.get('error');

                if (error) {
                    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
                    res.end(`<h1>שגיאה</h1><p>${error}</p><p>אפשר לסגור את החלון.</p>`);
                    server.close();
                    reject(new Error(`OAuth error: ${error}`));
                    return;
                }

                if (code) {
                    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                    res.end(`<h1>✅ ההזדהות הצליחה!</h1><p>אפשר לסגור את החלון ולחזור לטרמינל.</p>`);
                    server.close();
                    resolve(code);
                    return;
                }

                res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end('<h1>לא התקבל קוד</h1><p>נסה שוב.</p>');
                server.close();
                reject(new Error('No authorization code received'));
            } else {
                res.writeHead(404);
                res.end('Not found');
            }
        });

        server.listen(PORT, () => {
            console.log(`   Waiting for authorization on ${REDIRECT_URI}...`);
        });

        // Timeout after 5 minutes
        setTimeout(() => {
            server.close();
            reject(new Error('Timeout: No authorization received within 5 minutes.'));
        }, 5 * 60 * 1000);
    });
}

async function exchangeCode(code) {
    const response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            code: code,
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            redirect_uri: REDIRECT_URI,
            grant_type: 'authorization_code'
        })
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Token exchange failed: HTTP ${response.status} — ${body}`);
    }

    const data = await response.json();
    if (!data.refresh_token) {
        throw new Error('No refresh token returned. Make sure you set access_type=offline and prompt=consent.');
    }

    return data;
}

function openBrowser(url) {
    const cmd = process.platform === 'darwin' ? `open "${url}"`
        : process.platform === 'win32' ? `start "" "${url}"`
        : `xdg-open "${url}"`;
    exec(cmd, (err) => {
        if (err) console.log(`   Could not open browser automatically. Please open:\n   ${url}`);
    });
}

// --- Run ---

main().catch(err => {
    console.error('\n💥 Error:', err.message);
    process.exit(1);
});
