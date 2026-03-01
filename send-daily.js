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
    if (!result.ok) console.log('Telegram hiba:', JSON.stringify(result));
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
            if (title && title.length > 5) items.push({ title, link, source: sourceName });
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
        // === HIVATALOS GOV ===
        { url: 'https://palyazat.gov.hu/rss.xml', name: 'Palyazat.gov.hu' },
        { url: 'https://rss.nkfih.gov.hu/hirek?rss=1', name: 'NKFIH Hírek' },
        { url: 'https://rss.nkfih.gov.hu/hirek-180603?rss=1', name: 'NKFIH Pályázati hírek' },
        { url: 'https://nkfih.gov.hu/magyar/rss/hazai-innovacios-hirek?rss=1', name: 'NIH Hazai innováció' },

        // === PÁLYÁZATFIGYELŐ PORTÁLOK ===
        { url: 'https://palyazatfigyelo.webnode.hu/rss/all.xml', name: 'Pályázat Figyelő' },
        { url: 'https://palyazatfigyelo.webnode.hu/rss/ujdonsagok.xml', name: 'Pályázat Figyelő Újdonságok' },
        { url: 'https://tamogatas.mtva.hu/rss_news.xml', name: 'MTVA Támogatás' },
        { url: 'https://materal.energiagazdasag.hu/feed', name: 'Energiagazdaság' },
        { url: 'https://tender.sff.hu/rss.xml', name: 'SFF Tender' },

        // === PALYAZATOK.ORG ===
        { url: 'https://www.palyazatok.org/feed/', name: 'Pályázatok.org' },
        { url: 'https://www.palyazatok.org/palyazatok-vallalkozasoknak/feed/', name: 'Vállalkozói pályázatok' },
        { url: 'https://www.palyazatok.org/palyazatok-maganszemelyek-szamara/feed/', name: 'Magánszemély pályázatok' },
        { url: 'https://www.palyazatok.org/palyazatok-civil-szervezeteknek/feed/', name: 'Civil pályázatok' },
        { url: 'https://www.palyazatok.org/palyazatok-onkormanyzatoknak/feed/', name: 'Önkormányzati pályázatok' },
        { url: 'https://www.palyazatok.org/palyazatok-intezmenyeknek/feed/', name: 'Intézményi pályázatok' },
        { url: 'http://palyazatok.org/category/turisztikai-palyazatok/feed/', name: 'Turisztikai pályázatok' },
        { url: 'http://palyazatok.org/category/kreativ-palyazatok/feed/', name: 'Kreatív pályázatok' },
        { url: 'http://palyazatok.org/tag/operativ-program/feed', name: 'Operatív programok' },

        // === PÁLYÁZATMENEDZSER ===
        { url: 'http://palyazatmenedzser.hu/cimke/informatikai-palyazatok/feed', name: 'IT pályázatok' },
        { url: 'http://palyazatmenedzser.hu/cimke/mezogazdasagi-palyazatok/feed', name: 'Mezőgazdasági pályázatok' },
        { url: 'http://palyazatmenedzser.hu/cimke/turisztikai-palyazatok/feed', name: 'Turisztikai pályázatok PM' },
        { url: 'http://palyazatmenedzser.hu/cimke/energetikai-palyazatok/feed', name: 'Energetikai pályázatok' },
        { url: 'http://palyazatmenedzser.hu/cimke/innovacios-palyazatok/feed', name: 'Innovációs pályázatok' },
        { url: 'http://palyazatmenedzser.hu/cimke/osztondijak/feed', name: 'Ösztöndíjak' },
        { url: 'http://palyazatmenedzser.hu/cimke/kulturalis-palyazatok/feed', name: 'Kulturális pályázatok' },
        { url: 'http://palyazatmenedzser.hu/cimke/kkv-palyazatok/feed', name: 'KKV pályázatok' },
        { url: 'http://palyazatmenedzser.hu/cimke/ifjusagi-palyazatok/feed', name: 'Ifjúsági pályázatok' },
        { url: 'http://palyazatmenedzser.hu/cimke/sportpalyazatok/feed', name: 'Sport pályázatok' },

        // === PAFI ===
        { url: 'https://pafi.hu/feed/', name: 'PAFI' },
        { url: 'https://pafi.hu/palyazatok/vallalkozasok/feed/', name: 'PAFI Vállalkozások' },
        { url: 'https://pafi.hu/palyazatok/maganszemely/feed/', name: 'PAFI Magánszemélyek' },
        { url: 'https://pafi.hu/palyazatok/civil/feed/', name: 'PAFI Civil' },

        // === MNL ===
        { url: 'https://mnl.gov.hu/mnl/1/rss.xml', name: 'MNL 1' },
        { url: 'https://mnl.gov.hu/mnl/2/rss.xml', name: 'MNL 2' },
        { url: 'https://mnl.gov.hu/mnl/14/rss.xml', name: 'MNL 14' },
        { url: 'https://mnl.gov.hu/mnl/15/rss.xml', name: 'MNL 15' },
        { url: 'https://mnl.gov.hu/mnl/16/rss.xml', name: 'MNL 16' },

        // === EGYÉB ===
        { url: 'https://magyarfaluprogram.hu/feed/', name: 'Magyar Falu Program' },
        { url: 'https://bgazrt.hu/feed/', name: 'Bethlen Gábor Alapkezelő' },
        { url: 'https://www.palyazatihirek.eu/feed/', name: 'Pályázati Hírek' },
        { url: 'https://mercatorconsulting.webnode.hu/rss/all.xml', name: 'Mercator Consulting' },
        { url: 'https://mercatorconsulting.webnode.hu/rss/energetikai-palyazatok.xml', name: 'Mercator Energetika' },
    ];

    const allItems = [];
    for (const source of sources) {
        const items = await fetchRSS(source.url, source.name);
        items.forEach(item => allItems.push(item));
    }
    
    const unique = allItems.filter((p, i, self) => 
        i === self.findIndex(t => t.title === p.title)
    );
    
    console.log(`📋 Összesen: ${unique.length} egyedi pályázat`);
    return unique;
}

function kategoriaBesorol(title, source) {
    const t = title.toLowerCase();
    const s = (source || '').toLowerCase();
    
    if (s.includes('magánszemély') || s.includes('maganszemely') || s.includes('ösztöndíj') || s.includes('ifjúsági')) return 'maganszem';
    if (s.includes('vállalkozói') || s.includes('vallalkozasoknak') || s.includes('kkv') || s.includes('it pályázat') || s.includes('energetikai') || s.includes('innovációs') || s.includes('turisztikai')) return 'vallalkozo';
    if (s.includes('civil') || s.includes('kulturális') || s.includes('sport') || s.includes('kreatív')) return 'civil';
    if (s.includes('önkormányzat') || s.includes('intézményi') || s.includes('mnl')) return 'intezm';
    if (s.includes('mezőgazdasági') || s.includes('mezogazdasagi')) return 'mezogazd';

    const vallalkozo = ['vállalkozás', 'vállalkozó', 'kkv', 'startup', 'cég', 'üzlet', 'mikro', 'munkaadó', 'gazdasági', 'innováci', 'informatik', 'it ', 'energetik', 'napelem', 'elektromos', 'töltő', 'e-autó', 'rrf', 'turizm'];
    const maganszem = ['magánszemély', 'család', 'lakás', 'otthon', 'felújítás', 'gyermek', 'nyugdíjas', 'álláskeresők', 'fiatal', 'szülő', 'ösztöndíj', 'diák', 'tanuló', 'ifjú', 'e-bike', 'mosógép'];
    const civil = ['civil', 'nonprofit', 'alapítvány', 'egyesület', 'kulturális', 'közösség', 'szervezet', 'egyházi', 'irodalmi', 'művészeti', 'sport', 'kreatív'];
    const mezogazd = ['mezőgazdaság', 'agrárium', 'farmer', 'vidék', 'erdő', 'gazdák', 'termelők', 'agrár', 'falu', 'állattenyésztés'];
    const intezm = ['önkormányzat', 'intézmény', 'iskola', 'kórház', 'óvoda', 'köznevelés', 'közintézmény', 'levéltár'];

    if (vallalkozo.some(k => t.includes(k))) return 'vallalkozo';
    if (maganszem.some(k => t.includes(k))) return 'maganszem';
    if (civil.some(k => t.includes(k))) return 'civil';
    if (mezogazd.some(k => t.includes(k))) return 'mezogazd';
    if (intezm.some(k => t.includes(k))) return 'intezm';
    return 'egyeb';
}

// Üzenetek felosztása max 4000 karakter/üzenet
function splitMessages(groups, today, totalCount) {
    const messages = [];
    
    // 1. fejléc üzenet
    messages.push(`🗓️ *Mai pályázatok – ${today}*\n📊 Összesen *${totalCount} pályázat* találva\n\n_Kategóriánként külön üzenetben küldöm!_ 👇`);
    
    const groupDefs = [
        { key: 'maganszem', emoji: '👤', label: 'MAGÁNSZEMÉLYEKNEK' },
        { key: 'vallalkozo', emoji: '🏢', label: 'VÁLLALKOZÓKNAK' },
        { key: 'civil', emoji: '🤝', label: 'CIVIL SZERVEZETEKNEK' },
        { key: 'mezogazd', emoji: '🌾', label: 'MEZŐGAZDASÁGNAK' },
        { key: 'intezm', emoji: '🏫', label: 'INTÉZMÉNYEKNEK' },
        { key: 'egyeb', emoji: '📋', label: 'EGYÉB PÁLYÁZATOK' },
    ];

    for (const def of groupDefs) {
        const items = groups[def.key];
        if (!items || items.length === 0) continue;

        // Felosztjuk 15-ösével
        const chunkSize = 15;
        for (let i = 0; i < items.length; i += chunkSize) {
            const chunk = items.slice(i, i + chunkSize);
            const part = Math.floor(i / chunkSize) + 1;
            const totalParts = Math.ceil(items.length / chunkSize);
            
            let msg = `${def.emoji} *${def.label}*`;
            if (totalParts > 1) msg += ` (${part}/${totalParts})`;
            msg += ` – ${items.length} db\n\n`;
            
            chunk.forEach((p, idx) => {
                const num = i + idx + 1;
                const link = p.link ? `[${p.title}](${p.link})` : p.title;
                msg += `${num}. ${link}\n`;
            });
            
            messages.push(msg);
        }
    }
    
    messages.push(`💡 _Napi értesítő – minden nap 14:00-kor_\n/stop – leiratkozás`);
    return messages;
}

async function main() {
    console.log('📨 Napi értesítők küldése...');
    const users = loadUsers();
    const userCount = Object.keys(users).length;
    console.log(`👥 ${userCount} felhasználó`);
    if (userCount === 0) { console.log('❌ Nincs még felhasználó!'); return; }
    
    const palyazatok = await scrapePalyazatok();
    
    if (palyazatok.length === 0) {
        for (const [chatId, user] of Object.entries(users)) {
            if (user.active === false) continue;
            await sendMessage(parseInt(chatId), `🇭🇺 *Pályázat Figyelő*\n\nMa technikai hiba történt.\n\n🔗 [palyazatok.org](https://www.palyazatok.org)`);
        }
        return;
    }

    const today = new Date().toLocaleDateString('hu-HU');
    let sent = 0;
    
    for (const [chatId, user] of Object.entries(users)) {
        if (user.active === false) continue;
        
        // Szűrés kategória szerint
        let toSend = palyazatok;
        if (user.category && user.category !== 'mind') {
            const filtered = palyazatok.filter(p => kategoriaBesorol(p.title, p.source) === user.category);
            if (filtered.length > 0) toSend = filtered;
        }

        // Csoportosítás
        const groups = {
            maganszem: [], vallalkozo: [], civil: [],
            mezogazd: [], intezm: [], egyeb: []
        };
        toSend.forEach(p => groups[kategoriaBesorol(p.title, p.source)].push(p));

        // Üzenetek felosztva
        const messages = splitMessages(groups, today, toSend.length);
        
        try {
            for (const msg of messages) {
                await sendMessage(parseInt(chatId), msg);
                await new Promise(r => setTimeout(r, 300));
            }
            sent++;
            console.log(`✅ Elküldve: ${chatId} (${messages.length} üzenet)`);
            await new Promise(r => setTimeout(r, 1000));
        } catch (e) {
            console.log(`❌ Hiba ${chatId}: ${e.message}`);
        }
    }
    console.log(`✅ Kész! ${sent} felhasználónak elküldve.`);
}

main().catch(console.error);


