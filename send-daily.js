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

async function fetchRSS(url, sourceName) {
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; RSS Reader)',
                'Accept': 'application/rss+xml, application/xml, text/xml, */*',
            },
            signal: AbortSignal.timeout(10000)
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const xml = await response.text();
        
        const items = [];
        const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);
        
        for (const match of itemMatches) {
            const itemXml = match[1];
            const titleMatch = itemXml.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>([^<]+)<\/title>/);
            const linkMatch = itemXml.match(/<link>([^<]+)<\/link>|<guid isPermaLink="true">([^<]+)<\/guid>/);
            
            const title = (titleMatch?.[1] || titleMatch?.[2] || '').trim()
                .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#8211;/g, '–');
            const link = (linkMatch?.[1] || linkMatch?.[2] || '').trim();
            
            if (title && title.length > 5) {
                items.push({ title, link, source: sourceName });
            }
        }
        
        console.log(`  ✅ ${sourceName}: ${items.length} elem`);
        return items;
    } catch (e) {
        console.log(`  ❌ ${sourceName}: ${e.message}`);
        return [];
    }
}

async function scrapePalyazatok() {
    console.log('📡 RSS feedek lekérése...');
    
    const sources = [
        // palyazatok.org - fő kategóriák
        { url: 'https://www.palyazatok.org/feed/', name: 'Pályázatok.org' },
        { url: 'https://www.palyazatok.org/palyazatok-vallalkozasoknak/feed/', name: 'Vállalkozói pályázatok' },
        { url: 'https://www.palyazatok.org/palyazatok-maganszemelyek-szamara/feed/', name: 'Magánszemély pályázatok' },
        { url: 'https://www.palyazatok.org/palyazatok-civil-szervezeteknek/feed/', name: 'Civil pályázatok' },
        { url: 'https://www.palyazatok.org/palyazatok-onkormanyzatoknak/feed/', name: 'Önkormányzati pályázatok' },
        { url: 'https://www.palyazatok.org/palyazatok-intezmenyeknek/feed/', name: 'Intézményi pályázatok' },
        // pafi.hu
        { url: 'https://pafi.hu/feed/', name: 'PAFI Pályázatfigyelő' },
        { url: 'https://pafi.hu/palyazatok/vallalkozasok/feed/', name: 'PAFI Vállalkozások' },
        { url: 'https://pafi.hu/palyazatok/maganszemely/feed/', name: 'PAFI Magánszemélyek' },
        { url: 'https://pafi.hu/palyazatok/civil/feed/', name: 'PAFI Civil' },
        // egyéb
        { url: 'https://magyarfaluprogram.hu/feed/', name: 'Magyar Falu Program' },
        { url: 'https://www.palyazatihirek.eu/feed/', name: 'Pályázati Hírek' },
        { url: 'https://bgazrt.hu/feed/', name: 'Bethlen Gábor Alapkezelő' },
    ];

    const allItems = [];
    for (const source of sources) {
        const items = await fetchRSS(source.url, source.name);
        items.forEach(item => allItems.push(item));
    }
    
    // Duplikátumok szűrése cím alapján
    const unique = allItems.filter((p, i, self) => 
        i === self.findIndex(t => t.title === p.title)
    );
    
    console.log(`📋 Összesen: ${unique.length} egyedi pályázat`);
    return unique;
}

function kategoriaBesorol(title, source) {
    const t = title.toLowerCase();
    const s = (source || '').toLowerCase();
    
    // Forrás alapú besorolás
    if (s.includes('magánszemély') || s.includes('maganszemely')) return 'maganszem';
    if (s.includes('vállalkozói') || s.includes('vallalkozasoknak') || s.includes('vállalkozások')) return 'vallalkozo';
    if (s.includes('civil')) return 'civil';
    if (s.includes('önkormányzat') || s.includes('intézményi')) return 'intezm';
    
    // Kulcsszó alapú besorolás
    const vallalkozo = ['vállalkozás', 'vállalkozó', 'kkv', 'startup', 'cég', 'üzlet', 'mikro', 'kisvállalkozás', 'munkaadó', 'gazdasági fejleszt'];
    const maganszem = ['magánszemély', 'család', 'lakás', 'otthon', 'felújítás', 'gyermek', 'nyugdíjas', 'álláskeresők', 'fiatal', 'szülő', 'ösztöndíj', 'diák', 'tanuló', 'utazási támogatás'];
    const civil = ['civil', 'nonprofit', 'alapítvány', 'egyesület', 'kulturális', 'közösség', 'szervezet', 'egyházi', 'norvég'];
    const mezogazd = ['mezőgazdaság', 'agrárium', 'farmer', 'vidék', 'erdő', 'gazdák', 'termelők', 'állattenyésztés', 'növénytermesztés', 'kap ', 'agrár'];
    const intezm = ['önkormányzat', 'intézmény', 'iskola', 'kórház', 'óvoda', 'köznevelés', 'közintézmény'];

    if (vallalkozo.some(k => t.includes(k))) return 'vallalkozo';
    if (maganszem.some(k => t.includes(k))) return 'maganszem';
    if (civil.some(k => t.includes(k))) return 'civil';
    if (mezogazd.some(k => t.includes(k))) return 'mezogazd';
    if (intezm.some(k => t.includes(k))) return 'intezm';
    return 'egyeb';
}

function buildMessage(palyazatok, today) {
    const groups = {
        maganszem: { emoji: '👤', label: 'MAGÁNSZEMÉLYEKNEK', items: [] },
        vallalkozo: { emoji: '🏢', label: 'VÁLLALKOZÓKNAK', items: [] },
        civil: { emoji: '🤝', label: 'CIVIL SZERVEZETEKNEK', items: [] },
        mezogazd: { emoji: '🌾', label: 'MEZŐGAZDASÁGNAK', items: [] },
        intezm: { emoji: '🏫', label: 'INTÉZMÉNYEKNEK / ÖNKORMÁNYZATOKNAK', items: [] },
        egyeb: { emoji: '📋', label: 'EGYÉB PÁLYÁZATOK', items: [] },
    };

    palyazatok.forEach(p => {
        const kat = kategoriaBesorol(p.title, p.source);
        groups[kat].items.push(p);
    });

    let msg = `🗓️ *Mai pályázatok – ${today}*\n`;
    msg += `📊 Összesen ${palyazatok.length} pályázat\n\n`;

    for (const group of Object.values(groups)) {
        if (group.items.length === 0) continue;
        msg += `${group.emoji} *${group.label}:*\n`;
        group.items.slice(0, 4).forEach((p, i) => {
            const link = p.link ? `[${p.title}](${p.link})` : p.title;
            msg += `${i + 1}. ${link}\n`;
        });
        if (group.items.length > 4) {
            msg += `_...+${group.items.length - 4} további_\n`;
        }
        msg += `\n`;
    }

    msg += `💡 _Napi értesítő – minden nap 14:00-kor_`;
    return msg;
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
    
    if (palyazatok.length === 0) {
        for (const [chatId, user] of Object.entries(users)) {
            if (user.active === false) continue;
            await sendMessage(parseInt(chatId), 
                `🇭🇺 *Pályázat Figyelő*\n\nMa technikai hiba miatt nem sikerült lekérni a pályázatokat.\n\n🔗 [palyazatok.org](https://www.palyazatok.org)`
            );
        }
        return;
    }

    const today = new Date().toLocaleDateString('hu-HU');
    let sent = 0;
    
    for (const [chatId, user] of Object.entries(users)) {
        if (user.active === false) continue;
        
        let toSend = palyazatok;
        if (user.category && user.category !== 'mind') {
            const filtered = palyazatok.filter(p => kategoriaBesorol(p.title, p.source) === user.category);
            if (filtered.length > 0) toSend = filtered;
        }
        
        const msg = buildMessage(toSend, today);
        
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


