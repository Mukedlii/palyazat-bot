// Ez a fájl fut naponta 14:00-kor a GitHub Actions-on
import * as cheerio from 'cheerio';
import * as fs from 'fs';

const TOKEN = process.env.TELEGRAM_TOKEN;

// Felhasználók betöltése
function loadUsers() {
    try { return JSON.parse(fs.readFileSync('./users.json', 'utf8')); }
    catch { return {}; }
}

// Telegram üzenet küldése
async function sendMessage(chatId, text, options = {}) {
    const url = `https://api.telegram.org/bot${TOKEN}/sendMessage`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: 'Markdown',
            disable_web_page_preview: true,
            ...options
        })
    });
    return response.json();
}

// Pályázatok scrape-elése
async function scrapePalyazatok() {
    const palyazatok = [];
    
    const sources = [
        { url: 'https://www.palyazatok.org', name: 'Pályázatok.org' },
        { url: 'https://palyazat.gov.hu', name: 'Palyazat.gov.hu' },
    ];

    for (const source of sources) {
        try {
            const response = await fetch(source.url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                    'Accept-Language': 'hu-HU,hu;q=0.9',
                }
            });
            
            if (!response.ok) continue;
            
            const html = await response.text();
            const $ = cheerio.load(html);
            
            $('a[href]').each((_, el) => {
                const title = $(el).text().trim();
                const href = $(el).attr('href') || '';
                
                if (title.length > 20 && title.length < 200 && 
                    (title.toLowerCase().includes('pályázat') || 
                     title.toLowerCase().includes('támogatás') ||
                     title.toLowerCase().includes('segély') ||
                     title.toLowerCase().includes('program') ||
                     title.toLowerCase().includes('ösztöndíj'))) {
                    
                    const link = href.startsWith('http') ? href : `${source.url}${href}`;
                    palyazatok.push({ title, link, source: source.name });
                }
            });
        } catch (e) {
            console.log(`Hiba ${source.name}: ${e.message}`);
        }
    }
    
    // Duplikátumok szűrése
    return palyazatok.filter((p, i, self) => 
        i === self.findIndex(t => t.title === p.title)
    ).slice(0, 10);
}

// Kategória szűrés
function filterByCategory(palyazatok, category) {
    if (!category || category === 'mind') return palyazatok;
    const keywords = {
        'vallalkozo': ['vállalkozás', 'vállalkozó', 'kkv', 'startup', 'cég'],
        'maganszem': ['magánszemély', 'család', 'lakás', 'otthon', 'felújítás'],
        'civil': ['civil', 'nonprofit', 'alapítvány', 'egyesület'],
        'mezogazd': ['mezőgazdaság', 'agrárium', 'farmer', 'vidék'],
    };
    const kws = keywords[category] || [];
    return palyazatok.filter(p => 
        kws.some(kw => p.title.toLowerCase().includes(kw))
    );
}

// FŐ FUNKCIÓ
async function main() {
    console.log('📨 Napi értesítők küldése...');
    
    const users = loadUsers();
    const userCount = Object.keys(users).length;
    console.log(`👥 ${userCount} felhasználó`);
    
    if (userCount === 0) {
        console.log('❌ Nincs még felhasználó!');
        return;
    }
    
    const palyazatok = await scrapePalyazatok();
    console.log(`📋 ${palyazatok.length} pályázat találva`);
    
    let sent = 0;
    
    for (const [chatId, user] of Object.entries(users)) {
        if (user.active === false) continue;
        
        const filtered = filterByCategory(palyazatok, user.category);
        
        if (filtered.length === 0) continue;
        
        const today = new Date().toLocaleDateString('hu-HU');
        let msg = `🗓️ *Mai pályázatok – ${today}*\n\n`;
        
        filtered.slice(0, 5).forEach((p, i) => {
            msg += `*${i + 1}. ${p.title}*\n`;
            msg += `📌 ${p.source}\n`;
            msg += `🔗 [Részletek](${p.link})\n\n`;
        });
        
        msg += `💡 _Napi értesítő – minden nap 14:00-kor_`;
        
        try {
            await sendMessage(parseInt(chatId), msg);
            sent++;
            console.log(`✅ Elküldve: ${chatId}`);
            await new Promise(r => setTimeout(r, 500));
        } catch (e) {
            console.log(`❌ Hiba ${chatId}: ${e.message}`);
        }
    }
    
    console.log(`✅ Kész! ${sent} értesítő elküldve.`);
}

main().catch(console.error);
