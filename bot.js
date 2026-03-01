import TelegramBot from 'node-telegram-bot-api';
import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as https from 'https';

const TOKEN = '8751133024:AAE7OQ9r2-gN0He9-IUHT29q8Hvu3-t_99o';
const bot = new TelegramBot(TOKEN, { polling: true });

const DB_FILE = './users.json';

function loadUsers() {
    try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
    catch { return {}; }
}

function saveUsers(users) {
    fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
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
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept-Language': 'hu-HU,hu;q=0.9',
                    'Accept': 'text/html',
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
                    palyazatok.push({
                        title,
                        link,
                        source: source.name,
                        date: new Date().toLocaleDateString('hu-HU'),
                    });
                }
            });
        } catch (e) {
            console.log(`Hiba ${source.name}: ${e.message}`);
        }
    }
    
    // Duplikátumok szűrése
    const unique = palyazatok.filter((p, index, self) => 
        index === self.findIndex(t => t.title === p.title)
    );
    
    return unique.slice(0, 10); // Max 10 legfrissebb
}

// Kategória szűrés
function filterByCategory(palyazatok, category) {
    if (category === 'mind') return palyazatok;
    
    const keywords = {
        'vallalkozo': ['vállalkozás', 'vállalkozó', 'kkv', 'startup', 'üzlet', 'cég'],
        'maganszem': ['magánszemély', 'család', 'lakás', 'otthon', 'felújítás', 'gyermek'],
        'civil': ['civil', 'nonprofit', 'alapítvány', 'egyesület', 'kulturális'],
        'mezogazd': ['mezőgazdaság', 'agrárium', 'farmer', 'vidék', 'erdő'],
    };
    
    const kws = keywords[category] || [];
    return palyazatok.filter(p => 
        kws.some(kw => p.title.toLowerCase().includes(kw))
    );
}

// Pályázatok küldése egy felhasználónak
async function sendPalyazatokToUser(chatId, category) {
    try {
        const palyazatok = await scrapePalyazatok();
        const filtered = filterByCategory(palyazatok, category);
        
        if (filtered.length === 0) {
            await bot.sendMessage(chatId, '😕 Ma nem találtam új releváns pályázatot. Holnap újra nézem!');
            return;
        }
        
        let msg = `🗓️ *Mai pályázatok – ${new Date().toLocaleDateString('hu-HU')}*\n\n`;
        
        filtered.slice(0, 5).forEach((p, i) => {
            msg += `*${i + 1}. ${p.title}*\n`;
            msg += `📌 ${p.source}\n`;
            msg += `🔗 [Részletek](${p.link})\n\n`;
        });
        
        if (filtered.length > 5) {
            msg += `_...és még ${filtered.length - 5} további pályázat_\n\n`;
        }
        
        msg += `💡 _Napi értesítő – minden nap 14:00-kor_`;
        
        await bot.sendMessage(chatId, msg, {
            parse_mode: 'Markdown',
            disable_web_page_preview: true,
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔄 Frissítés most', callback_data: 'frissit' }],
                    [{ text: '⭐ Prémium - 990 Ft/hó', callback_data: 'premium' }],
                ]
            }
        });
        
        console.log(`✅ Elküldve: ${chatId}`);
    } catch (e) {
        console.log(`Hiba küldésnél ${chatId}: ${e.message}`);
    }
}

// Napi 14:00-kor küldés MINDEN felhasználónak
function scheduleDailyNotifications() {
    setInterval(async () => {
        const now = new Date();
        const hours = now.getHours();
        const minutes = now.getMinutes();
        
        // 14:00-kor küldjük
        if (hours === 14 && minutes === 0) {
            console.log('📨 Napi értesítők küldése...');
            const users = loadUsers();
            
            for (const [chatId, user] of Object.entries(users)) {
                if (user.active !== false) {
                    await sendPalyazatokToUser(parseInt(chatId), user.category || 'mind');
                    // Kis szünet felhasználók között
                    await new Promise(r => setTimeout(r, 1000));
                }
            }
            
            console.log(`✅ Értesítők elküldve ${Object.keys(users).length} felhasználónak`);
        }
    }, 60 * 1000); // Percenként ellenőrzi
}

// /start parancs
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const users = loadUsers();
    
    if (!users[chatId]) {
        users[chatId] = { chatId, category: 'mind', active: true };
        saveUsers(users);
    }
    
    await bot.sendMessage(chatId,
        `🇭🇺 *Magyar Pályázat Figyelő Bot*\n\n` +
        `Üdvözöllek! Minden nap *14:00-kor* értesítlek az aktuális magyar pályázatokról és támogatásokról – *teljesen ingyen!*\n\n` +
        `Válaszd ki a kategóriádat:`,
        {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '👤 Magánszemély', callback_data: 'cat_maganszem' }],
                    [{ text: '🏢 Vállalkozó / Cég', callback_data: 'cat_vallalkozo' }],
                    [{ text: '🤝 Civil szervezet', callback_data: 'cat_civil' }],
                    [{ text: '🌾 Mezőgazdaság', callback_data: 'cat_mezogazd' }],
                    [{ text: '📋 Mindent mutass!', callback_data: 'cat_mind' }],
                ]
            }
        }
    );
});

// Callback kezelés
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    const users = loadUsers();
    
    if (!users[chatId]) users[chatId] = { chatId, active: true };
    
    if (data.startsWith('cat_')) {
        const category = data.replace('cat_', '');
        users[chatId].category = category;
        users[chatId].active = true;
        saveUsers(users);
        
        const categoryNames = {
            'maganszem': '👤 Magánszemély',
            'vallalkozo': '🏢 Vállalkozó',
            'civil': '🤝 Civil szervezet',
            'mezogazd': '🌾 Mezőgazdaság',
            'mind': '📋 Minden kategória',
        };
        
        await bot.answerCallbackQuery(query.id);
        await bot.sendMessage(chatId,
            `✅ *${categoryNames[category]}* kategória beállítva!\n\n` +
            `📅 Minden nap *14:00-kor* kapsz értesítést az új pályázatokról!\n\n` +
            `Most mutassam az aktuális pályázatokat?`,
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✅ Igen, mutasd most!', callback_data: 'frissit' }],
                        [{ text: '⏰ Várok a 14:00-ra', callback_data: 'varok' }],
                    ]
                }
            }
        );
    }
    
    if (data === 'frissit') {
        await bot.answerCallbackQuery(query.id, { text: '⏳ Keresem...' });
        await sendPalyazatokToUser(chatId, users[chatId]?.category || 'mind');
    }
    
    if (data === 'varok') {
        await bot.answerCallbackQuery(query.id);
        await bot.sendMessage(chatId, '⏰ Oké! 14:00-kor küldöm az első értesítést!');
    }
    
    if (data === 'premium') {
        await bot.answerCallbackQuery(query.id);
        await bot.sendMessage(chatId,
            `⭐ *Prémium – 990 Ft/hó*\n\n` +
            `✅ Korlátlan pályázat lista\n` +
            `✅ AI pályázatírás segítség\n` +
            `✅ Határidő emlékeztetők\n` +
            `✅ Email összefoglaló\n\n` +
            `📧 Kapcsolat: @palyazatbot_support`,
            { parse_mode: 'Markdown' }
        );
    }
});

// /palyazatok parancs - azonnali lekérés
bot.onText(/\/palyazatok/, async (msg) => {
    const chatId = msg.chat.id;
    const users = loadUsers();
    await bot.sendMessage(chatId, '⏳ Keresem az aktuális pályázatokat...');
    await sendPalyazatokToUser(chatId, users[chatId]?.category || 'mind');
});

// /stop parancs - leiratkozás
bot.onText(/\/stop/, async (msg) => {
    const chatId = msg.chat.id;
    const users = loadUsers();
    if (users[chatId]) {
        users[chatId].active = false;
        saveUsers(users);
    }
    await bot.sendMessage(chatId, '❌ Leiratkoztál a napi értesítőről. /start-tal újra bekapcsolhatod!');
});

// /help parancs
bot.onText(/\/help/, async (msg) => {
    await bot.sendMessage(msg.chat.id,
        `ℹ️ *Súgó*\n\n` +
        `/start – Indítás, kategória választás\n` +
        `/palyazatok – Azonnali pályázat lista\n` +
        `/stop – Leiratkozás\n` +
        `/premium – Prémium funkciók\n` +
        `/help – Súgó\n\n` +
        `📅 Napi értesítő: minden nap *14:00-kor*`,
        { parse_mode: 'Markdown' }
    );
});

// Napi értesítők indítása
scheduleDailyNotifications();

console.log('🤖 Magyar Pályázat Bot elindult!');
console.log('📅 Napi értesítők: 14:00-kor');
