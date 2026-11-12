// OptoLink: пересылка писем из ящика поддержки Gmail на платформу (раздел «Поддержка» у суперадмина).
// Нужна, когда хостинг сервера закрывает исходящий порт 993 и сервер не может читать почту по IMAP.
//
// Как поставить (docs/deploy.md, «Почта техподдержки»):
//  1. На сервере: sudo b2b-support-mail gmail-script — команда выведет этот файл с уже вписанными URL и SECRET.
//  2. Войдите в Gmail поддержки, откройте script.google.com → «Новый проект», вставьте текст целиком, сохраните.
//  3. Вверху выберите функцию setup и нажмите «Выполнить», разрешите доступ к Gmail и внешним запросам.
// Дальше скрипт сам раз в минуту отправляет новые письма. Письма в Gmail не меняются.

var URL = '__URL__';
var SECRET = '__SECRET__';

var FIRST_RUN_DAYS = 7;   // при первом запуске — письма за последние дни
var PER_RUN = 20;         // писем за один запуск
var KEEP_IDS = 400;       // сколько отправленных id помнить, чтобы не слать повторно
var MAX_TEXT = 100000;

function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'forwardSupportMail') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('forwardSupportMail').timeBased().everyMinutes(1).create();
  forwardSupportMail();
}

function forwardSupportMail() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    var props = PropertiesService.getScriptProperties();
    var stored = props.getProperty('sentIds');
    var initial = stored === null;
    var sent = stored ? JSON.parse(stored) : [];
    var seen = {};
    sent.forEach(function (id) { seen[id] = true; });
    var me = (Session.getEffectiveUser().getEmail() || '').toLowerCase();

    var query = 'in:inbox newer_than:' + (initial ? FIRST_RUN_DAYS : 2) + 'd';
    var threads = GmailApp.search(query, 0, 50);
    var batch = [];
    for (var i = 0; i < threads.length && batch.length < PER_RUN; i++) {
      var msgs = threads[i].getMessages();
      for (var j = 0; j < msgs.length && batch.length < PER_RUN; j++) {
        var m = msgs[j];
        var id = m.getId();
        if (seen[id]) continue;
        // Свои ответы из этого ящика не пересылаем
        if (me && m.getFrom().toLowerCase().indexOf(me) !== -1) { seen[id] = true; sent.push(id); continue; }
        var atts = m.getAttachments({ includeInlineImages: false }).map(function (a) {
          return { name: a.getName(), size: a.getSize(), type: a.getContentType() };
        });
        batch.push({
          id: id,
          messageId: m.getHeader('Message-ID') || null,
          from: m.getFrom(),
          replyTo: m.getReplyTo() || null,
          subject: m.getSubject(),
          text: (m.getPlainBody() || '').slice(0, MAX_TEXT),
          date: m.getDate().toISOString(),
          attachments: atts,
        });
      }
    }

    if (batch.length > 0) {
      var res = UrlFetchApp.fetch(URL, {
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + SECRET },
        payload: JSON.stringify({ initial: initial, messages: batch }),
        muteHttpExceptions: true,
      });
      if (res.getResponseCode() !== 200) {
        console.error('OptoLink ответил ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 200));
        return; // письма уйдут при следующем запуске
      }
      batch.forEach(function (b) { sent.push(b.id); });
    }
    props.setProperty('sentIds', JSON.stringify(sent.slice(-KEEP_IDS)));
  } finally {
    lock.releaseLock();
  }
}
