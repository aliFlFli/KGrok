require('dotenv').config();
var TelegramBot = require('node-telegram-bot-api');
var axios = require('axios');
var cheerio = require('cheerio');
var https = require('https');
var moment = require('moment-timezone');
var fs = require('fs');
var path = require('path');
var express = require('express');
var cors = require('cors');
var winston = require('winston');
var config = require('./config');
var messages = require('./messages');
const { HttpsProxyAgent } = require('https-proxy-agent');

// تنظیم پراکسی برای axios (در صورت نیاز فعال کن)
const proxyUrl = 'http://80.241.212.166:80'; // پراکسی ایرانی (از proxyscrape.com بگیر)
let proxyAgent = null;
// اگر می‌خوای پراکسی فعال باشه، خط زیر رو از کامنت دربیار
// proxyAgent = new HttpsProxyAgent(proxyUrl);

// تنظیم axios
axios.defaults.timeout = 120000; // 120 ثانیه
if (proxyAgent) {
  axios.defaults.httpsAgent = proxyAgent;
}
axios.defaults.headers.common['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
axios.defaults.headers.common['Accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8';
axios.defaults.headers.common['Accept-Language'] = 'fa-IR,fa;q=0.9,en-US;q=0.8,en;q=0.7';
axios.defaults.headers.common['Referer'] = 'http://shahkardrama.ir/';
axios.defaults.headers.common['Cookie'] = 'session=anonymous; country=IR';
axios.defaults.headers.common['Connection'] = 'keep-alive';
axios.defaults.headers.common['Upgrade-Insecure-Requests'] = '1';

var express = require('express');
var cors = require('cors');

var app = express();

app.use(cors());
app.options('*', cors());

app.use(express.static(__dirname));

// سرو کردن فایل‌های استاتیک (مثل HTML، JSON)
app.use(express.static(__dirname));

// مسیر برای دسترسی به فایل‌های JSON
app.get('/series_info.json', (req, res) => {
  res.sendFile(__dirname + '/series_info.json');
});
app.get('/posters.json', (req, res) => {
  res.sendFile(__dirname + '/posters.json');
});

// لود poster.html
app.get('/poster.html', (req, res) => {
  res.sendFile(__dirname + '/poster.html');
});
app.get('/', function(req, res) {
  res.send('ربات فعال است!');
});

app.get('/ping', function(req, res) {
  res.send('پینگ دریافت شد!');
});

// API برای برگردوندن لیست سریال‌ها
app.get('/api/series', function(req, res) {
  scrapeSeries(function(err, result) {
    if (err) {
      logger.error('خطا در دریافت لیست سریال‌ها برای API:', { error: err.message });
      return res.status(500).json({ error: 'خطا در دریافت داده‌ها' });
    }

    // برگردوندن داده‌ها به صورت JSON
    res.json(result);
  });
});

// API برای برگردوندن پوسترها
app.get('/api/posters', function(req, res) {
  const posters = loadPosters();
  res.json(posters);
});

app.listen(3000, function() {
  logger.info('سرور Express روی پورت 3001 اجرا شد.');
  logger.info('شروع تست دستی پینگ...');
  var options = {
    hostname: 'https://tulip-nervous-library.glitch.me/ping',
    path: '/ping',
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; MyBot/1.0)'
    }
  };
  var req = https.request(options, function(res) {
    var data = '';
    res.on('data', function(chunk) { data += chunk; });
    res.on('end', function() {
      logger.info('پاسخ تست دستی پینگ دریافت شد. کد وضعیت: ' + res.statusCode + ', داده: ' + data);
      if (res.statusCode === 200) {
        logger.info("تست دستی پینگ موفق بود ✅");
      } else {
        logger.warn('تست دستی پینگ ناموفق بود: کد وضعیت ' + res.statusCode);
      }
    });
  });
  req.on('error', function(error) {
    logger.error('خطا در تست دستی پینگ:', { error: error.message });
  });
  req.end();
});

var token = process.env.BOT_TOKEN;
if (!token) {
  logger.error('Token is missing! Set BOT_TOKEN environment variable.');
  process.exit(1);
}
var bot = new TelegramBot(token, { 
  polling: true,
  cancelPendingPromises: true // رفع هشدار
});

var subscriberFile = path.join(__dirname, 'subscribers.json');
var cacheFile = path.join(__dirname, 'cache.json');
var postersFile = path.join(__dirname, 'posters.json');
var subscribers = new Set();

var logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console()
  ]
});

function loadSubscribers() {
  try {
    var data = fs.readFileSync(subscriberFile, 'utf8');
    if (data.trim() === '') {
      subscribers = new Set();
    } else {
      var ids = JSON.parse(data);
      subscribers = new Set(ids.map(function(id) { return parseInt(id); }));
    }
    logger.info('کاربران اشتراکی بارگذاری شدند. تعداد: ' + subscribers.size);
  } catch (error) {
    logger.error('خطا در بارگذاری کاربران اشتراکی:', { error: error.message });
    subscribers = new Set();
  }
}

function saveSubscriber(userId) {
  subscribers.add(userId);
  saveSubscribers();
}

function removeSubscriber(userId) {
  subscribers.delete(userId);
  saveSubscribers();
}

function saveSubscribers() {
  try {
    var data = JSON.stringify(Array.from(subscribers));
    fs.writeFileSync(subscriberFile, data, 'utf8');
    logger.info('لیست سابسکرایبرها با موفقیت ذخیره شد. تعداد: ' + subscribers.size);
  } catch (error) {
    logger.error('خطا در ذخیره‌سازی کاربران اشتراکی:', { error: error.message });
  }
}

loadSubscribers();

function loadPosters() {
  try {
    if (fs.existsSync(postersFile)) {
      const data = fs.readFileSync(postersFile, 'utf8');
      if (data.trim() === '') {
        logger.info('فایل posters.json خالی است. مقدار پیش‌فرض برگردانده شد.');
        return {};
      }
      const parsed = JSON.parse(data);
      logger.info('پوسترها با موفقیت لود شدند:', { posterCount: Object.keys(parsed).length });
      return parsed;
    }
    logger.info('فایل posters.json وجود ندارد. فایل جدید ساخته شد.');
    fs.writeFileSync(postersFile, '{}', 'utf8');
    return {};
  } catch (error) {
    logger.error('خطا در بارگذاری posters.json:', { error: error.message });
    return {};
  }
}

function savePosters(posters) {
  try {
    fs.writeFileSync(postersFile, JSON.stringify(posters, null, 2), 'utf8');
    logger.info('پوسترها با موفقیت ذخیره شدند:', { posterCount: Object.keys(posters).length });
  } catch (error) {
    logger.error('خطا در ذخیره posters.json:', { error: error.message });
    notifyAdmin('<b>⚠️ خطا در ذخیره پوسترها:</b>\n' + error.message);
  }
}

function loadCacheFromFile() {
  try {
    var data = fs.readFileSync(cacheFile, 'utf8');
    if (data.trim() === '') {
      return { data: null, timestamp: null };
    }
    return JSON.parse(data);
  } catch (error) {
    logger.error('خطا در بارگذاری کش از فایل:', { error: error.message });
    return { data: null, timestamp: null };
  }
}

function saveCacheToFile(data, timestamp) {
  try {
    var content = JSON.stringify({ data: data, timestamp: timestamp }, null, 2);
    fs.writeFileSync(cacheFile, content, 'utf8');
    logger.info('کش توی فایل ذخیره شد.');
  } catch (error) {
    logger.error('خطا در ذخیره کش توی فایل:', { error: error.message });
    notifyAdmin('<b>⚠️ خطا در ذخیره کش:</b>\n' + error.message);
  }
}

var cache = loadCacheFromFile();
cache.expiration = config.CACHE_EXPIRATION;

function notifyAdmin(message) {
  config.ADMINS.forEach(function(adminId) {
    try {
      bot.sendMessage(adminId, message, { parse_mode: 'HTML' });
    } catch (error) {
      logger.error('خطا در ارسال پیام به ادمین ' + adminId + ':', { error: error.message });
    }
  });
}

var lastError = null;

function pingServer() {
  axios.get('https://tulip-nervous-library.glitch.me/ping')
    .then(function(response) {
      if (response.status === 200) {
        logger.info('پینگ موفق:', { data: response.data });
        lastError = null;
      } else {
        throw new Error('وضعیت غیرمنتظره: ' + response.status);
      }
    })
    .catch(function(error) {
      logger.error('خطا در پینگ سرور:', { error: error.message });
      if (lastError !== error.message) {
        lastError = error.message;
        notifyAdmin('<b>⚠️ خطا در پینگ سرور:</b>\n' + error.message);
      }
    });
}

setInterval(pingServer, config.PING_INTERVAL);

function checkChannelMembership(userId, chatId, callback) {
  bot.getChatMember(config.REQUIRED_CHANNEL, userId)
    .then(function(member) {
      var status = member.status;
      var isMember = status === 'member' || status === 'administrator' || status === 'creator';
      if (!isMember) {
        var keyboard = {
          inline_keyboard: [
            [{ text: '🇰🇷 عضویت در کانال سریال کره‌ای', url: 'https://t.me/KoreaMixPlus' }]
          ]
        };
        sendMessageWithAutoDelete(chatId, '<b>برای استفاده از ربات، باید عضو کانال ما باشید.\nلطفاً ابتدا به کانال بپیوندید و دوباره امتحان کنید:</b>', keyboard);
      }
      callback(isMember);
    })
    .catch(function(error) {
      logger.error('خطا در بررسی عضویت:', { error: error.message });
      bot.sendMessage(chatId, messages.MEMBERSHIP_ERROR, { parse_mode: 'HTML' });
      callback(false);
    });
}

function scrapeSeries(callback) {
  var now = Date.now();

  if (cache.data && cache.timestamp && (now - cache.timestamp < cache.expiration)) {
    logger.info('استفاده از داده‌های کش‌شده...');
    return callback(null, cache.data);
  }

  var maxRetries = 2;
  var attempt = 0;

  function tryScrape() {
    logger.info('شروع اسکرپینگ از سایت... (تلاش ' + (attempt + 1) + ')');
    axios.get('http://shahkardrama.ir/')
      .then(function(response) {
        var $ = cheerio.load(response.data);

        var seriesDict = {};
        var daysMapping = {};
        var persianToEnglish = {
          'شنبه': 'Saturday',
          'یکشنبه': 'Sunday',
          'دوشنبه': 'Monday',
          'سه‌شنبه': 'Tuesday',
          'چهارشنبه': 'Wednesday',
          'پنج‌شنبه': 'Thursday',
          'جمعه': 'Friday'
        };

        $('.card.text-secondary.bg-light').each(function(i, element) {
          var dayTitle = $(element).find('h4.card-title').text().trim();
          var dayParts = dayTitle.split('                ');
          var dayName = dayParts[0].trim();
          var dayDate = dayParts[1] ? dayParts[1].trim() : "تاریخ نامعلوم";
          var seriesList = $(element).find('.list-group.list-group-numbered');

          if (persianToEnglish.hasOwnProperty(dayName)) {
            var seriesInfo = [];
            if (seriesList) {
              seriesList.find('a.list-group-item').each(function(j, item) {
                var persianName = $(item).find('div.fw-bold.text-dark').text().trim();
                var englishDiv = $(item).find('div.me-2.ms-auto');
                var englishName = "بدون اسم انگلیسی";
                if (englishDiv.length > 0) {
                  var rawEnglish = englishDiv.text().trim();
                  englishName = rawEnglish
                    .replace(persianName, '')
                    .replace(/^\s*\(\s*|\s*\)\s*$/g, '')
                    .replace(/\s+/g, ' ')
                    .trim() || "بدون اسم انگلیسی";
                }

                var badge = $(item).find('span.badge');
                var statusText = badge.text().trim().replace('\r\n', '').replace('                        ', '') || "";
                var status = "وضعیت نامعلوم";
                if (statusText.indexOf('تموم شده') !== -1) {
                  return;
                } else {
                  var partMatch = statusText.match(/قسمت\s*(\d+)/);
                  if (partMatch) {
                    status = 'قسمت ' + partMatch[1];
                  }
                }

                // تغییر فرمت seriesId به شکل ساده‌تر
                const cleanedEnglishName = englishName.replace(/[\s\/\\]+/g, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
                const seriesId = `_${cleanedEnglishName}`;
                // لاگ برای بررسی seriesId
                logger.info(`ساخت seriesId: ${seriesId} برای سریال ${persianName} (${englishName})`);

                seriesInfo.push({ persianName: persianName, englishName: englishName, status: status, seriesId: seriesId });
              });
            }

            seriesDict[dayName + ' - ' + dayDate] = seriesInfo;
            daysMapping[persianToEnglish[dayName]] = dayName + ' - ' + dayDate;
          }
        });

        cache.data = { seriesDict: seriesDict, daysMapping: daysMapping };
        cache.timestamp = now;
        saveCacheToFile(cache.data, cache.timestamp);
        logger.info('داده‌ها با موفقیت توی کش ذخیره شدند.');
        callback(null, { seriesDict: seriesDict, daysMapping: daysMapping });
      })
      .catch(function(error) {
        attempt++;
        if (attempt === maxRetries) {
          logger.error('خطا در اسکرپینگ:', { error: error.message });
          notifyAdmin('<b>⚠️ خطا در اسکرپینگ:</b>\n' + error.message);
          if (cache.data) {
            logger.info('استفاده از کش قدیمی به دلیل خطا در اسکرپینگ...');
            return callback(null, cache.data);
          }
          return callback(null, { seriesDict: {}, daysMapping: {} });
        }
        setTimeout(tryScrape, 2000);
      });
  }

  tryScrape();
}

function sendMessageWithAutoDelete(chatId, text, replyMarkup) {
  var options = { parse_mode: 'HTML' };
  if (replyMarkup) {
    options.reply_markup = replyMarkup;
  }
  bot.sendMessage(chatId, text, options).then(function(message) {
    setTimeout(function() {
      try {
        bot.deleteMessage(chatId, message.message_id);
      } catch (e) {
        logger.error('خطا در حذف پیام ربات:', { error: e.message });
      }
    }, config.MESSAGE_DELETE_TIMEOUT);
  });
}

function sendMessageWithoutDelete(chatId, text) {
  bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
}

bot.on('message', function(msg) {
  var chatId = msg.chat.id;
  var userMessageId = msg.message_id;

  setTimeout(function() {
    try {
      bot.deleteMessage(chatId, userMessageId);
    } catch (e) {
      logger.error('خطا در حذف پیام کاربر:', { error: e.message });
    }
  }, config.USER_MESSAGE_DELETE_TIMEOUT);
});

var dayKeyboard = {
  inline_keyboard: [
    [
      { text: '📅 دوشنبه', callback_data: 'day_Monday' },
      { text: '📅 یکشنبه', callback_data: 'day_Sunday' },
      { text: '📅 شنبه', callback_data: 'day_Saturday' }
    ],
    [
      { text: '📅 پنج‌شنبه', callback_data: 'day_Thursday' },
      { text: '📅 چهارشنبه', callback_data: 'day_Wednesday' },
      { text: '📅 سه‌شنبه', callback_data: 'day_Tuesday' }
    ],
    [
      { text: '📋 لیست کامل', callback_data: 'list' },
      { text: '📅 جمعه', callback_data: 'day_Friday' }
    ],
    [
      { text: '🔕 لغو خودکار', callback_data: 'unsubscribe' },
      { text: '🔔 دریافت خودکار', callback_data: 'subscribe' }
    ]
  ]
};

bot.onText(/\/start/, function(msg, match) {

  var chatId = msg.chat.id;

  var userId = msg.from.id;

  var startParam = msg.text.split(' ')[1]; // گرفتن پارامتر بعد از /start

  // اگه پارامتر poster_ داره، فقط پوستر رو نشون بده

  if (startParam && startParam.startsWith('poster_')) {

    var seriesIdPart = startParam.replace('poster_', ''); // فقط goodboy

    var seriesId = `_${seriesIdPart}`; // تبدیل به _goodboy برای مطابقت با posters.json

    logger.info(`تلاش برای نمایش پوستر با seriesId: ${seriesId}`); // لاگ برای دیباگ

    var posters = loadPosters();

    var poster = posters[seriesId];

    if (poster) {

      bot.sendPhoto(chatId, poster.photoId, {

        caption: `<b>☝️ اطلاعات سریال کره‌ای\n${poster.name} (${poster.english})</b>`,

        parse_mode: 'HTML'

      }).then(function(message) {

        setTimeout(function() {

          try {

            bot.deleteMessage(chatId, message.message_id);

          } catch (e) {

            logger.error('خطا در حذف پوستر:', { error: e.message });

          }

        }, 300000); // 300 ثانیه = 5 دقیقه

      }).catch(error => {

        logger.error(`خطا در ارسال پوستر سریال ${poster.name}:`, { error: error.message });

        sendMessageWithAutoDelete(chatId, '<b>❌ خطا در ارسال پوستر.</b>');

      });

    } else {

      // فقط اگه پوستر پیدا نشد، پیام بده

      sendMessageWithAutoDelete(chatId, `<b>❌ پوستر پیدا نشد. ID: ${seriesId}</b>`);

    }

    return; // از اجرای بقیه کد جلوگیری می‌کنه

  }

  // اگه پارامتر poster_ نداره، پیام خوش‌آمدگویی رو نشون بده

  checkChannelMembership(userId, chatId, function(isMember) {

    if (!isMember) return;

    sendMessageWithAutoDelete(chatId, messages.START_MESSAGE, dayKeyboard);

  });

});

bot.onText(/\/subscribe/, function(msg) {
  var chatId = msg.chat.id;
  var userId = msg.from.id;

  if (subscribers.has(userId)) {
    sendMessageWithAutoDelete(chatId, messages.ALREADY_SUBSCRIBED);
  } else {
    subscribers.add(userId);
    saveSubscriber(userId);
    sendMessageWithAutoDelete(chatId, messages.SUBSCRIBE_SUCCESS);
    logger.info('کاربر ' + userId + ' سابسکرایب کرد. تعداد کل: ' + subscribers.size);
  }
});

bot.onText(/\/unsubscribe/, function(msg) {
  var chatId = msg.chat.id;
  var userId = msg.from.id;

  if (subscribers.has(userId)) {
    subscribers.delete(userId);
    removeSubscriber(userId);
    sendMessageWithAutoDelete(chatId, messages.UNSUBSCRIBE_SUCCESS);
    logger.info('کاربر ' + userId + ' آن‌سابسکرایب کرد. تعداد کل: ' + subscribers.size);
  } else {
    sendMessageWithAutoDelete(chatId, messages.NOT_SUBSCRIBED);
  }
});

bot.onText(/\/subscribers/, function(msg) {
  var chatId = msg.chat.id;
  var userId = msg.from.id;

  if (config.ADMINS.indexOf(userId) === -1) {
    sendMessageWithAutoDelete(chatId, messages.ONLY_ADMIN);
    return;
  }

  var subscriberList = Array.from(subscribers).join(', ');
  sendMessageWithAutoDelete(chatId, '<b>📋 تعداد سابسکرایبرها: ' + subscribers.size + '</b>\n<b>لیست IDها:</b>\n' + (subscriberList || 'هیچ سابسکرایبری وجود ندارد'));
});

bot.onText(/\/clearcache/, function(msg) {
  var chatId = msg.chat.id;
  var userId = msg.from.id;

  if (config.ADMINS.indexOf(userId) === -1) {
    sendMessageWithAutoDelete(chatId, messages.ONLY_ADMIN);
    return;
  }

  cache.data = null;
  cache.timestamp = null;
  saveCacheToFile(cache.data, cache.timestamp);
  sendMessageWithAutoDelete(chatId, messages.CACHE_CLEARED);
});

bot.onText(/\/refresh/, function(msg) {
  var chatId = msg.chat.id;
  var userId = msg.from.id;

  if (config.ADMINS.indexOf(userId) === -1) {
    sendMessageWithAutoDelete(chatId, messages.ONLY_ADMIN);
    return;
  }

  cache.data = null;
  cache.timestamp = null;
  saveCacheToFile(cache.data, cache.timestamp);
  scrapeSeries(function(err, result) {
    if (err) {
      sendMessageWithAutoDelete(chatId, '<b>❌ خطا در به‌روزرسانی داده‌ها.</b>');
      return;
    }
    sendMessageWithAutoDelete(chatId, '<b>✅ داده‌ها با موفقیت از سایت به‌روزرسانی شدند.</b>');
  });
});

bot.onText(/\/list/, function(msg) {
  var chatId = msg.chat.id;
  var userId = msg.from.id;

  checkChannelMembership(userId, chatId, function(isMember) {
    if (!isMember) return;

    scrapeSeries(function(err, result) {
      if (err) {
        logger.error('خطا در دریافت لیست سریال‌ها:', { error: err.message });
        return sendMessageWithAutoDelete(chatId, messages.NO_SERIES_FOUND);
      }

      var seriesDict = result.seriesDict;
      if (Object.keys(seriesDict).length === 0) {
        sendMessageWithAutoDelete(chatId, messages.NO_SERIES_FOUND);
      } else {
        var message = '<b>لیست سریال‌های در حال پخش:</b>\n\n';
        for (var day in seriesDict) {
          if (seriesDict.hasOwnProperty(day)) {
            message += `<b>📅 ${day}</b>\n\n`;
            if (seriesDict[day].length === 0) {
              message += '<b>در حال حاضر سریالی برای این روز در حال پخش نیست.</b>\n\n';
            } else {
              seriesDict[day].forEach(function(series, index) {
                const cleanSeriesId = series.seriesId.startsWith('_') ? series.seriesId.substring(1) : series.seriesId; // حذف _ اول
                const seriesLink = loadPosters()[series.seriesId]
                  ? `<b><a href="https://t.me/${config.BOT_USERNAME}?start=poster_${cleanSeriesId}">${series.persianName}</a> (${series.englishName})</b>`
                  : `<b>${series.persianName} (${series.englishName})</b>`;
                message += `<b>${index + 1}. ${seriesLink}</b>\n`;
                message += `<b>   ▶️ ${series.status}</b>\n`;
                if (config.ADMINS && config.ADMINS.includes(userId)) {
                  message += `<b>   ID: ${series.seriesId}</b>\n`;
                }
                message += `\n`;
              });
            }
            message += '<b>' + '─'.repeat(26) + '</b>\n\n';
          }
        }
        message += '<b>🆔 @KoreaMixPlus | @KGrokBot 🤖</b>';

        sendMessageWithAutoDelete(chatId, message, { reply_markup: dayKeyboard });
      }
    });
  });
});

// دستور /addposter
let pendingPoster = {};

bot.onText(/\/addposter (.+)/, function(msg, match) {
  var chatId = msg.chat.id;
  var userId = msg.from.id;
  var seriesIdInput = match[1].trim();

  if (config.ADMINS.indexOf(userId) === -1) {
    return sendMessageWithAutoDelete(chatId, '<b>❌ فقط ادمین‌ها می‌تونن پوستر اضافه کنن.</b>');
  }

  // مطمئن شو که seriesId با _ شروع می‌شه
  var seriesId = seriesIdInput.startsWith('_') ? seriesIdInput : `_${seriesIdInput}`;
  pendingPoster[userId] = { seriesId };
  sendMessageWithAutoDelete(chatId, `<b>لطفاً پوستر سریال با ID ${seriesId} رو ارسال کنید.</b>`);
});

// هندل کردن عکس‌ها برای اضافه کردن پوستر
bot.on('photo', function(msg) {
  var chatId = msg.chat.id;
  var userId = msg.from.id;

  if (!pendingPoster[userId]) return;

  var { seriesId } = pendingPoster[userId];
  var photoId = msg.photo[msg.photo.length - 1].file_id; // بالاترین کیفیت

  var seriesData = null;
  if (cache.data && cache.data.seriesDict) {
    for (var day in cache.data.seriesDict) {
      seriesData = cache.data.seriesDict[day].find(series => series.seriesId === seriesId);
      if (seriesData) break;
    }
  }

  if (!seriesData) {
    sendMessageWithAutoDelete(chatId, `<b>❌ سریال با این ID پیدا نشد. لطفاً از /list چک کنید.</b>`);
    delete pendingPoster[userId];
    return;
  }

  var posters = loadPosters();
  posters[seriesId] = {
    name: seriesData.persianName,
    english: seriesData.englishName,
    status: seriesData.status,
    photoId: photoId
  };
  savePosters(posters);

  sendMessageWithAutoDelete(chatId, `<b>✅ پوستر برای ${seriesData.persianName} اضافه شد.</b>`);
  delete pendingPoster[userId];
});

bot.onText(/\/(Saturday|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday)/, function(msg, match) {
  var chatId = msg.chat.id;
  var userId = msg.from.id;
  var day = match[1];

  checkChannelMembership(userId, chatId, function(isMember) {
    if (!isMember) return;

    scrapeSeries(function(err, result) {
      if (err) {
        logger.error('خطا در دریافت سریال‌های روز:', { error: err.message });
        return sendMessageWithAutoDelete(chatId, messages.NO_SERIES_FOUND);
      }

      var seriesDict = result.seriesDict;
      var daysMapping = result.daysMapping;

      if (daysMapping.hasOwnProperty(day)) {
        var dayName = daysMapping[day];
        var seriesList = seriesDict[dayName] || [];
        if (seriesList.length > 0) {
          var message = `<b>📅 ${dayName}</b>\n\n`;
          seriesList.forEach(function(series, index) {
            const cleanSeriesId = series.seriesId.startsWith('_') ? series.seriesId.substring(1) : series.seriesId; // حذف _ اول
            const seriesLink = loadPosters()[series.seriesId]
              ? `<b><a href="https://t.me/${config.BOT_USERNAME}?start=poster_${cleanSeriesId}">${series.persianName}</a> (${series.englishName})</b>`
              : `<b>${series.persianName} (${series.englishName})</b>`;
            message += `<b>${index + 1}. ${seriesLink}</b>\n`;
            message += `<b>   ▶️ ${series.status}</b>\n`;
            if (config.ADMINS && config.ADMINS.includes(userId)) {
              message += `<b>   ID: ${series.seriesId}</b>\n`;
            }
            message += `\n`;
          });
          message += '<b>🆔 @KoreaMixPlus | @KGrokBot 🤖</b>';
          sendMessageWithAutoDelete(chatId, message);
        } else {
          sendMessageWithAutoDelete(chatId, messages.NO_SERIES_MESSAGE(dayName));
        }
      } else {
        sendMessageWithAutoDelete(chatId, messages.INVALID_DAY_MESSAGE);
      }
    });
  });
});

bot.on('callback_query', function(query) {
  var chatId = query.message.chat.id;
  var userId = query.from.id;
  var data = query.data;

  checkChannelMembership(userId, chatId, function(isMember) {
    if (!isMember) {
      bot.answerCallbackQuery(query.id);
      return;
    }

    if (data === 'list') {
      scrapeSeries(function(err, result) {
        if (err) {
          logger.error('خطا در دریافت لیست سریال‌ها:', { error: err.message });
          return sendMessageWithAutoDelete(chatId, messages.NO_SERIES_FOUND);
        }

        var seriesDict = result.seriesDict;
        if (Object.keys(seriesDict).length === 0) {
          sendMessageWithAutoDelete(chatId, messages.NO_SERIES_FOUND);
        } else {
          var message = '<b>لیست سریال‌های در حال پخش:</b>\n\n';
          for (var day in seriesDict) {
            if (seriesDict.hasOwnProperty(day)) {
              message += `<b>📅 ${day}</b>\n\n`;
              if (seriesDict[day].length === 0) {
                message += '<b>در حال حاضر سریالی برای این روز در حال پخش نیست.</b>\n\n';
              } else {
                seriesDict[day].forEach(function(series, index) {
                  const cleanSeriesId = series.seriesId.startsWith('_') ? series.seriesId.substring(1) : series.seriesId; // حذف _ اول
                  const seriesLink = loadPosters()[series.seriesId]
                    ? `<b><a href="https://t.me/${config.BOT_USERNAME}?start=poster_${cleanSeriesId}">${series.persianName}</a> (${series.englishName})</b>`
                    : `<b>${series.persianName} (${series.englishName})</b>`;
                  message += `<b>${index + 1}. ${seriesLink}</b>\n`;
                  message += `<b>   ▶️ ${series.status}</b>\n`;
                  if (config.ADMINS && config.ADMINS.includes(userId)) {
                    message += `<b>   ID: ${series.seriesId}</b>\n`;
                  }
                  message += `\n`;
                });
              }
              message += '<b>' + '─'.repeat(26) + '</b>\n\n';
            }
          }
          message += '<b>🆔 @KoreaMixPlus | @KGrokBot 🤖</b>';
          sendMessageWithAutoDelete(chatId, message, { reply_markup: dayKeyboard });
        }
      });
    } else if (data.indexOf('day_') === 0) {
      var day = data.split('_')[1];
      scrapeSeries(function(err, result) {
        if (err) {
          logger.error('خطا در دریافت سریال‌های روز:', { error: err.message });
          return sendMessageWithAutoDelete(chatId, messages.NO_SERIES_FOUND);
        }

        var seriesDict = result.seriesDict;
        var daysMapping = result.daysMapping;

        if (daysMapping.hasOwnProperty(day)) {
          var dayName = daysMapping[day];
          var seriesList = seriesDict[dayName] || [];
          if (seriesList.length > 0) {
            var message = `<b>📅 ${dayName}</b>\n\n`;
            seriesList.forEach(function(series, index) {
              const cleanSeriesId = series.seriesId.startsWith('_') ? series.seriesId.substring(1) : series.seriesId; // حذف _ اول
              const seriesLink = loadPosters()[series.seriesId]
                ? `<b><a href="https://t.me/${config.BOT_USERNAME}?start=poster_${cleanSeriesId}">${series.persianName}</a> (${series.englishName})</b>`
                : `<b>${series.persianName} (${series.englishName})</b>`;
              message += `<b>${index + 1}. ${seriesLink}</b>\n`;
              message += `<b>   ▶️ ${series.status}</b>\n`;
              if (config.ADMINS && config.ADMINS.includes(userId)) {
                message += `<b>   ID: ${series.seriesId}</b>\n`;
              }
              message += `\n`;
            });
            message += '<b>🆔 @KoreaMixPlus | @KGrokBot 🤖</b>';
            sendMessageWithAutoDelete(chatId, message);
          } else {
            sendMessageWithAutoDelete(chatId, messages.NO_SERIES_MESSAGE(dayName));
          }
        } else {
          sendMessageWithAutoDelete(chatId, messages.INVALID_DAY_MESSAGE);
        }
      });
    } else if (data === 'subscribe') {
      if (subscribers.has(userId)) {
        sendMessageWithAutoDelete(chatId, messages.ALREADY_SUBSCRIBED);
      } else {
        subscribers.add(userId);
        saveSubscriber(userId);
        sendMessageWithAutoDelete(chatId, messages.SUBSCRIBE_SUCCESS);
        logger.info('کاربر ' + userId + ' سابسکرایب کرد. تعداد کل: ' + subscribers.size);
      }
    } else if (data === 'unsubscribe') {
      if (subscribers.has(userId)) {
        subscribers.delete(userId);
        removeSubscriber(userId);
        sendMessageWithAutoDelete(chatId, messages.UNSUBSCRIBE_SUCCESS);
        logger.info('کاربر ' + userId + ' آن‌سابسکرایب کرد. تعداد کل: ' + subscribers.size);
      } else {
        sendMessageWithAutoDelete(chatId, messages.NOT_SUBSCRIBED);
      }
    }

    bot.answerCallbackQuery(query.id);
  });
});

function sendToSubscribers(message) {
  var subscriberArray = Array.from(subscribers);
  var batchSize = config.SUBSCRIBER_BATCH_SIZE;
  var i = 0;

  function sendBatch() {
    if (i >= subscriberArray.length) return;

    var batch = subscriberArray.slice(i, i + batchSize);
    var promises = batch.map(function(userId) {
      return bot.sendMessage(userId, message, { parse_mode: 'HTML' })
        .catch(function(error) {
          logger.error('خطا در ارسال به کاربر ' + userId + ':', { error: error.message });
          if (error.response && error.response.statusCode === 403) {
            subscribers.delete(userId);
            removeSubscriber(userId);
          }
        });
    });

    Promise.all(promises).then(function() {
      i += batchSize;
      setTimeout(sendBatch, config.SUBSCRIBER_SEND_DELAY);
    });
  }

  sendBatch();
}

function sendDailySeries() {
  var now = moment.tz('Asia/Tehran');
  var today = now;
  var todayDay = today.format('dddd');

  scrapeSeries(function(err, result) {
    if (err) {
      logger.error('خطا در ارسال روزانه سریال‌ها:', { error: err.message });
      return notifyAdmin('<b>⚠️ خطا در ارسال روزانه سریال‌ها:</b>\n' + err.message);
    }

    var seriesDict = result.seriesDict;
    var daysMapping = result.daysMapping;

    if (daysMapping.hasOwnProperty(todayDay)) {
      var dayName = daysMapping[todayDay];
      var seriesList = seriesDict[dayName] || [];
      var message;
      if (seriesList.length > 0) {
        message = `<b>📅 سریال‌های امروز (${dayName})</b>\n\n`;
        seriesList.forEach(function(series, index) {
          const cleanSeriesId = series.seriesId.startsWith('_') ? series.seriesId.substring(1) : series.seriesId; // حذف _ اول
          const seriesLink = loadPosters()[series.seriesId]
            ? `<b><a href="https://t.me/${config.BOT_USERNAME}?start=poster_${cleanSeriesId}">${series.persianName}</a> (${series.englishName})</b>`
            : `<b>${series.persianName} (${series.englishName})</b>`;
          message += `<b>${index + 1}. ${seriesLink}</b>\n`;
          message += `<b>   ▶️ ${series.status}</b>\n`;
          message += `\n`;
        });
        message += '<b>🆔 @KoreaMixPlus | @KGrokBot 🤖</b>';
      } else {
        message = messages.NO_SERIES_DAILY_MESSAGE(dayName);
      }
      sendMessageWithoutDelete(config.ALLOWED_GROUP_ID, message);
      sendToSubscribers(message);
    } else {
      logger.warn('روز ' + todayDay + ' در daysMapping پیدا نشد.');
      notifyAdmin('<b>⚠️ خطا:</b>\nروز ' + todayDay + ' در daysMapping پیدا نشد.');
    }
  });
}

function getTimeUntilNextSend() {
  var now = moment.tz('Asia/Tehran');
  var nextSend = now.clone().startOf('day').add(config.DAILY_SEND_HOUR, 'hours');
  if (now.isAfter(nextSend)) {
    nextSend.add(1, 'day');
  }
  return nextSend.diff(now);
}

function scheduleDailySeries() {
  var timeUntilNextSend = getTimeUntilNextSend();
  var now = moment.tz('Asia/Tehran');
  var nextSendTime = now.clone().add(timeUntilNextSend, 'milliseconds');
  logger.info('زمان‌بندی ارسال روزانه: ' + nextSendTime.format('YYYY-MM-DD HH:mm:ss') + ' (به وقت تهران)');
  setTimeout(function() {
    logger.info('اجرای تابع sendDailySeries در ' + moment.tz('Asia/Tehran').format('YYYY-MM-DD HH:mm:ss'));
    sendDailySeries();
    scheduleDailySeries();
  }, timeUntilNextSend);
}

scheduleDailySeries();

setInterval(function() {
  logger.info('زمان‌بندی پینگ اجرا شد در ' + new Date().toLocaleString());
  https.get("https://tulip-nervous-library.glitch.me/ping", {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; MyBot/1.0)'
    }
  }, function(res) {
    var data = '';
    res.on('data', function(chunk) { data += chunk; });
    res.on('end', function() {
      logger.info('پاسخ پینگ دریافت شد. کد وضعیت: ' + res.statusCode + ', داده: ' + data);
      if (res.statusCode === 200) {
        logger.info("پینگ موفق بود ✅");
      } else {
        logger.warn('پینگ ناموفق بود: کد وضعیت ' + res.statusCode);
        notifyAdmin('<b>⚠️ پینگ ناموفق بود:</b>\nکد وضعیت: ' + res.statusCode);
      }
    });
  }).on('error', function(error) {
    logger.error('خطا در پینگ:', { error: error.message });
    notifyAdmin('<b>⚠️ خطا در پینگ:</b>\n' + error.message);
  });
}, config.PING_INTERVAL);