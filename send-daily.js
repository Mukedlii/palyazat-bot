import * as fs from 'fs';

const TOKEN = process.env.TELEGRAM_TOKEN;

function loadUsers() {
    try { return JSON.parse(fs.readFileSync('./users.json', 'utf8')); }
    catch { return {}; }
}

async function sendMessage(chatId, text) {
    const url = `https://api.telegram.org/bot${TOKEN}/sendMessage`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: 'Markdown',
            disable_web_page_preview: true,
        })
    });
    const result = await response.json();
    if (!result.ok) console.log('Telegram hiba:', result);
    return result;
}

// RSS feed olvasás
async function fetchRSS(url) {
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; RSS Reader)',
                'Accept': 'application/rss+xml, application/xml, text/xml',
            }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const xml = await response.text();
        
        // Egyszerű XML parse - title és link kinyerése
        const items = [];
        const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);
        
        for (const match of itemMatches) {
            const itemXml = match[1];
            const titleMatch = itemXml.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/);
            const linkMatch = itemXml.match(/<link>(.*?)<\/link>|<guid>(https?:\/\/[^<]+)<\/guid>/);
            const descMatch = itemXml.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>|<description>(.*?)<\/description>/s);
            
            const title = (titleMatch?.[1] || titleMatch?.[2] || '').trim();
            const link = (linkMatch?.[1] || linkMatch?.[2] || '').trim();
            const desc = (descMatch?.[1] || descMatch?.[2] || '').trim().substring(0, 100);
            
            if (title && title.length > 5) {
                items.push({ title, link, desc });
            }
        }
        
        return items;
    } catch (e) {
        console.log(`RSS hiba ${url}: ${e.message}`);
        return [];
    }
}

// Pályázatok gyűjtése RSS feedekből
async function scrapePalyazatok() {
    const sources = [
        { 
            url: 'https://www.palyazatok.org/feed/', 
            name: 'Pályázatok.org' 
        },
        { 
            url: 'https://nkfih.gov.hu/palyazoknak/rss', 
            name: 'NKFIH' 
        },
        {
            url: 'https://www.szechenyi2020.hu/rss',
            name: 'Széchenyi 2020'
        }
    ];

    const allItems = [];
    
    for (const source of sources) {
        console.log(`Fetching: ${source.url}`);
        const items = await fetchRSS(source.url);
        console.log(`  → ${items.length} elem`);
        items.forEach(item => allItems.push({ ...item, source: source.name }));
    }
    
    // Duplikátumok szűrése
    const unique = allItems.filter((p, i, self) => 
        i === self.findIndex(t => t.title === p.title)
    );
    
    console.log(`Összesen: ${unique.length} egyedi pályázat`);
    return unique.slice(0, 10);
}

// Kategória szűrés
function filterByCategory(palyazatok, category) {
    if (!category || category === 'mind') return palyazatok;
    const keywords = {
        'vallalkozo': ['vállalkozás', 'vállalkozó', 'kkv', 'startup', 'cég', 'üzlet'],
        'maganszem': ['magánszemély', 'család', 'lakás', 'otthon', 'felújítás', 'gyermek'],
        'civil': ['civil', 'nonprofit', 'alapítvány', 'egyesület', 'kulturális'],
        'mezogazd': ['mezőgazdaság', 'agrárium', 'farmer', 'vidék', 'erdő'],
    };
    const kws = keywords[category] || [];
    const filtered = palyazatok.filter(p => 
        kws.some(kw => p.title.toLowerCase().includes(kw))
    );
    return filtered.length > 0 ? filtered : palyazatok; // ha nincs találat, mindent küld
}

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
    
    if (palyazatok.length === 0) {
        console.log('⚠️ Nem sikerült pályázatokat lekérni!');
        // Küldünk egy fallback üzenetet
        for (const [chatId, user] of Object.entries(users)) {
            if (user.active === false) continue;
            await sendMessage(parseInt(chatId), 
                `🇭🇺 *Pályázat Figyelő*\n\nMa technikai hiba miatt nem sikerült a pályázatokat lekérni. Holnap újra próbáljuk!\n\n🔗 Manuálisan: [palyazatok.org](https://www.palyazatok.org)`
            );
        }
        return;
    }
    
    let sent = 0;
    const today = new Date().toLocaleDateString('hu-HU');
    
    for (const [chatId, user] of Object.entries(users)) {
        if (user.active === false) continue;
        
        const filtered = filterByCategory(palyazatok, user.category);
        
        let msg = `🗓️ *Mai pályázatok – ${today}*\n\n`;
        
        filtered.slice(0, 5).forEach((p, i) => {
            msg += `*${i + 1}. ${p.title}*\n`;
            msg += `📌 ${p.source}\n`;
            if (p.link) msg += `🔗 [Részletek](${p.link})\n`;
            msg += `\n`;
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
