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
        // === PÁLYÁZATFIGYELŐ PORTÁLOK ===
        { url: 'https://palyazatfigyelo.webnode.hu/rss/all.xml', name: 'Pályázat Figyelő' },
        { url: 'https://palyazatfigyelo.webnode.hu/rss/ujdonsagok.xml', name: 'Pályázat Figyelő – Újdonságok' },
        { url: 'https://tamogatas.mtva.hu/rss_news.xml', name: 'MTVA Támogatási Program' },
        { url: 'https://materal.energiagazdasag.hu/feed', name: 'Energiagazdaság pályázatok' },
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

        // === PÁLYÁZATMENEDZSER – TEMATIKUS ===
        { url: 'http://palyazatmenedzser.hu/cimke/informatikai-palyazatok/feed', name: 'IT pályázatok' },
        { url: 'http://palyazatmenedzser.hu/cimke/mezogazdasagi-palyazatok/feed', name: 'Mezőgazdasági pályázatok' },
        { url: 'http://palyazatmenedzser.hu/cimke/turisztikai-palyazatok/feed', name: 'Turisztikai pályázatok' },
        { url: 'http://palyazatmenedzser.hu/cimke/energetikai-palyazatok/feed', name: 'Energetikai pályázatok' },
        { url: 'http://palyazatmenedzser.hu/cimke/innovacios-palyazatok/feed', name: 'Innovációs pályázatok' },
        { url: 'http://palyazatmenedzser.hu/cimke/osztondijak/feed', name: 'Ösztöndíjak' },
        { url: 'http://palyazatmenedzser.hu/cimke/kulturalis-palyazatok/feed', name: 'Kulturális pályázatok' },
        { url: 'http://palyazatmenedzser.hu/cimke/kkv-palyazatok/feed', name: 'KKV pályázatok' },
        { url: 'http://palyazatmenedzser.hu/cimke/ifjusagi-palyazatok/feed', name: 'Ifjúsági pályázatok' },
        { url: 'http://palyazatmenedzser.hu/cimke/sportpalyazatok/feed', name: 'Sport pályázatok' },

        // === PAFI ===
        { url: 'https://pafi.hu/feed/', name: 'PAFI Pályázatfigyelő' },
        { url: 'https://pafi.hu/palyazatok/vallalkozasok/feed/', name: 'PAFI Vállalkozások' },
        { url: 'https://pafi.hu/palyazatok/maganszemely/feed/', name: 'PAFI Magánszemélyek' },
        { url: 'https://pafi.hu/palyazatok/civil/feed/', name: 'PAFI Civil' },

        // === NKFIH ===
        { url: 'https://rss.nkfih.gov.hu/hirek?rss=1', name: 'NKFIH Hírek' },
        { url: 'https://rss.nkfih.gov.hu/hirek-180603?rss=1', name: 'NKFIH Pályázati hírek' },
        { url: 'https://nkfih.gov.hu/magyar/rss/hazai-innovacios-hirek?rss=1', name: 'NIH Hazai innováció' },

        // === MNL ===
        { url: 'https://mnl.gov.hu/mnl/1/rss.xml', name: 'MNL 1' },
        { url: 'https://mnl.gov.hu/mnl/2/rss.xml', name: 'MNL 2' },
        { url: 'https://mnl.gov.hu/mnl/3/rss.xml', name: 'MNL 3' },
        { url: 'https://mnl.gov.hu/mnl/14/rss.xml', name: 'MNL 14' },
        { url: 'https://mnl.gov.hu/mnl/15/rss.xml', name: 'MNL 15' },
        { url: 'https://mnl.gov.hu/mnl/16/rss.xml', name: 'MNL 16' },
        { url: 'https://mnl.gov.hu/mnl/17/rss.xml', name: 'MNL 17' },

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
    
    if (s.includes('magánszemély') || s.includes('maganszemely')) return 'maganszem';
    if (s.includes('vállalkozói') || s.includes('vallalkozasoknak') || s.includes('kkv')) return 'vallalkozo';
    if (s.includes('civil')) return 'civil';
    if (s.includes('önkormányzat') || s.includes('intézményi')) return 'intezm';
    if (s.includes('mezőgazdasági') || s.includes('mezogazdasagi')) return 'mezogazd';
    if (s.includes('ifjúsági') || s.includes('ösztöndíj')) return 'maganszem';
    if (s.includes('kulturális') || s.includes('irodalmi') || s.includes('sport') || s.includes('kreatív')) return 'civil';
    if (s.includes('energetikai') || s.includes('innovációs') || s.includes('it pályázat') || s.includes('turisztikai')) return 'vallalkozo';

    const vallalkozo = ['vállalkozás', 'vállalkozó', 'kkv', 'startup', 'cég', 'üzlet', 'mikro', 'munkaadó', 'gazdasági', 'innováci', 'it ', 'informatik', 'turizm', 'energetik'];
    const maganszem = ['magánszemély', 'család', 'lakás', 'otthon', 'felújítás', 'gyermek', 'nyugdíjas', 'álláskeresők', 'fiatal', 'szülő', 'ösztöndíj', 'diák', 'tanuló', 'ifjú'];
    const civil = ['civil', 'nonprofit', 'alapítvány', 'egyesület', 'kulturális', 'közösség', 'szervezet', 'egyházi', 'irodalmi', 'művészeti', 'sport'];
    const mezogazd = ['mezőgazdaság', 'agrárium', 'farmer', 'vidék', 'erdő', 'gazdák', 'termelők', 'agrár', 'falu', 'állattenyésztés'];
    const intezm = ['önkormányzat', 'intézmény', 'iskola', 'kórház', 'óvoda', 'köznevelés', 'közintézmény', 'levéltár'];

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
        intezm: { emoji: '🏫', label: 'INTÉZMÉNYEKNEK', items: [] },
        egyeb: { emoji: '📋', label: 'EGYÉB', items: [] },
    };

    palyazatok.forEach(p => {
        groups[kategoriaBesorol(p.title, p.source)].items.push(p);
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
        if (group.items.length > 4) msg += `_...+${group.items.length - 4} további_\n`;
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
        let toSend = palyazatok;
        if (user.category && user.category !== 'mind') {
            const filtered = palyazatok.filter(p => kategoriaBesorol(p.title, p.source) === user.category);
            if (filtered.length > 0) toSend = filtered;
        }
        try {
            await sendMessage(parseInt(chatId), buildMessage(toSend, today));
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


