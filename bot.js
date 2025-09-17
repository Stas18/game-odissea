const { Telegraf, Markup } = require("telegraf");

require("dotenv").config();

const TeamService = require("./services/TeamService");
const QuestService = require("./services/QuestService");
const AdminService = require("./services/AdminService");
const fs = require('fs');
const path = require('path');
const locales = require("./data/locales.json");
const prizesFile = path.join(__dirname, './data/prizes.json');
const keyboards = {
  mainMenu: require("./keyboards/mainMenu"),
  pointSelection: require("./keyboards/pointSelection"),
  admin: require("./keyboards/adminKeyboard"),
};

const services = {
  team: new TeamService(),
  quest: new QuestService(),
  admin: new AdminService(),
};

const bot = new Telegraf(process.env.BOT_TOKEN);

// ======================
// Функции для проверки временных интервалов, константы для штрафа за код
// ======================

const PENALTIES = {
  BASE_QUESTION_POINTS: 10,  // Начальная стоимость вопроса
  WRONG_ANSWER: 1,           // Штраф за ошибку
  TOO_FAST_ANSWER: 3,        // Штраф за скорость
  WRONG_CODE: 1,             // Штраф за неверный код
  MIN_TIME_BETWEEN_ANSWERS: 70 // Минимальное время между ответами (71 сек)
};

async function checkTimePenalty(ctx, questionIndex, isFirstQuestion = false) {
  // Не штрафуем за первый вопрос после активации точки
  if (isFirstQuestion) return { hasPenalty: false, timeDiff: 0 };

  let referenceTime;

  if (questionIndex === 0) {
    // Для первого вопроса используем время активации точки
    referenceTime = new Date(ctx.team.pointActivationTime);
  } else {
    // Для последующих вопросов используем время последнего ответа
    referenceTime = new Date(ctx.team.lastAnswerTime || ctx.team.pointActivationTime);
  }

  const now = new Date();
  const timeDiff = (now - referenceTime) / 1000; // Разница в секундах

  // Штрафуем если ответили слишком быстро (менее 70 секунд)
  return {
    hasPenalty: timeDiff < PENALTIES.MIN_TIME_BETWEEN_ANSWERS,
    timeDiff: timeDiff
  };
}

// Получение случайного сообщения о слишком быстром ответе
function getRandomTooFastMessage() {
  return locales.penaltyMessages.tooFast[
    Math.floor(Math.random() * locales.penaltyMessages.tooFast.length)
  ];
}

// Получение случайного сообщения о неправильном ответе
function getRandomWrongAnswerMessage() {
  return locales.penaltyMessages.wrongAnswer[
    Math.floor(Math.random() * locales.penaltyMessages.wrongAnswer.length)
  ];
}

// Список команд для регистрации
const teamOptions = [
  { name: "Безумцы с попкорном", id: "team_1" },
  { name: "Форрест Гамплики", id: "team_2" },
  { name: "Криминальное чтиво", id: "team_3" },
  { name: "Кино по-братски", id: "team_4" },
  { name: "Офисные кинокрысы", id: "team_5" },
  { name: "Тайна кинокока", id: "team_6" },
  { name: "Клуб 'Красная таблетка'", id: "team_7" },
  { name: "Чёрные из сумрака", id: "team_8" },
  { name: "Хабенские", id: "team_9" },
];

// ======================
// Middlewares
// ======================

bot.use(async (ctx, next) => {
  if (services.team.isTeamRegistered(ctx.chat.id)) {
    ctx.team = services.team.getTeam(ctx.chat.id);

    // Разрешаем доступ к меню если игра активна ИЛИ команда ожидает ввода участников
    if (services.admin.isGameActive || ctx.team.waitingForMembers) {
      return next();
    }
  }

  const exemptRoutes = ["/start", "team_", "/admin", "top_", "reset_", "ℹ️ Информация", "📊 Прогресс", "🏆 Топ команд"];
  const isExempt = exemptRoutes.some(
    (route) =>
      ctx.message?.text?.startsWith(route) ||
      ctx.callbackQuery?.data?.startsWith(route)
  );

  if (
    !isExempt &&
    !services.admin.isGameActive &&
    !services.admin.isAdmin(ctx.from.id)
  ) {
    return ctx.reply(locales.gameNotStarted);
  }

  await next();
});

bot.hears('🏆 Мои призы', async (ctx) => {
  const team = services.team.getTeam(ctx.chat.id);
  if (!team) return;

  if (!team.prizesReceived || team.prizesReceived.length === 0) {
    return ctx.reply('🎁 У вашей команды пока нет полученных призов.');
  }

  const prizes = team.prizesReceived.map(threshold => {
    const prize = locales.prizes[threshold];
    return `🏆 ${threshold} точек: ${prize.promoCode} - ${prize.cafeName}`;
  }).join('\n');

  await ctx.reply(`🎁 *Ваши призы:*\n\n${prizes}`, { parse_mode: 'Markdown' });
});

bot.hears('🎁 Выданные призы', async (ctx) => {
  if (!services.admin.isAdmin(ctx.from.id)) return;

  const prizes = readPrizes();
  if (Object.keys(prizes).length === 0) {
    return ctx.reply('🎁 Призы еще не выдавались.');
  }

  const prizeList = Object.entries(prizes).map(([threshold, data]) => {
    return `${threshold} точек: ${data.teamName} (ID: ${data.chatId}) - ${new Date(data.awardedAt).toLocaleString()}`;
  }).join('\n');

  await ctx.reply(`🎁 *Выданные призы:*\n\n${prizeList}`, { parse_mode: 'Markdown' });
});

bot.hears(locales.gameStartButton, async (ctx) => {
  if (!services.admin.isAdmin(ctx.from.id)) return;
  const result = services.admin.setGameActive(true);

  await ctx.reply(result.adminMessage);
  await handleAdminPanel(ctx);

  // Рассылаем уведомление всем командам с обновленным меню
  const teams = services.team.getAllTeams();
  for (const team of teams) {
    try {
      const isTeamRegistered = services.team.isTeamRegistered(team.chatId);

      await bot.telegram.sendMessage(
        team.chatId,
        result.broadcastMessage,
        keyboards.mainMenu.getKeyboard(
          services.admin.isAdmin(team.chatId),
          true, // isGameActive = true
          isTeamRegistered
        )
      );
    } catch (err) {
      console.error(`Ошибка отправки команде ${team.chatId}:`, err);
    }
  }
});

bot.hears(locales.gameStopButton, async (ctx) => {
  if (!services.admin.isAdmin(ctx.from.id)) return;
  const result = services.admin.setGameActive(false);

  await ctx.reply(result.adminMessage);
  await handleAdminPanel(ctx);

  // Рассылаем уведомление всем командам с обновленным меню
  const teams = services.team.getAllTeams();
  for (const team of teams) {
    try {
      const isTeamRegistered = services.team.isTeamRegistered(team.chatId);

      await bot.telegram.sendMessage(
        team.chatId,
        result.broadcastMessage,
        keyboards.mainMenu.getKeyboard(
          services.admin.isAdmin(team.chatId),
          false, // isGameActive = false
          isTeamRegistered
        )
      );
    } catch (err) {
      console.error(`Ошибка отправки команде ${team.chatId}:`, err);
    }
  }
});

// ======================
// Команды бота
// ======================

bot.command("start", handleStart);
bot.action(/^team_/, handleTeamSelection);
bot.hears("▶ Начать квест", handleBeginQuest);
bot.hears("🌍 Выбрать точку", handlePointSelection);
bot.action(/^point_/, handlePointActivation);
bot.hears("🎲 Мини-квест", handleMiniQuest);
bot.hears("📊 Прогресс", handleProgress);
bot.hears("🏆 Топ команд", handleTopTeams);
bot.command("admin", handleAdminPanel);
bot.hears("📊 Статистика", handleStats);
bot.hears("🔄 Сбросить прогресс", handleResetConfirmation);
bot.hears("📢 Рассылка", handleBroadcast);
bot.hears("🏆 Показать топ", handleTopTeams);
bot.hears("⬅️ В главное меню", handleMainMenu);
bot.hears("👑 Админ-панель", handleAdminPanel);
bot.hears("ℹ️ Информация", handleInfo);
bot.action("reset_confirm", handleResetConfirm);
bot.action("reset_cancel", handleResetCancel);

// ======================
// Обработчики сообщений
// ======================

bot.on("text", async (ctx) => {
  if (ctx.team?.waitingForMembers) {
    return handleMembersInput(ctx);
  }
  if (ctx.team?.waitingForBroadcast) {
    return handleBroadcastMessage(ctx);
  }
  if (ctx.team?.currentMiniQuest) {
    return handleMiniQuestAnswer(ctx);
  }
  // Добавить проверку на активную точку без активных вопросов
  if (ctx.team?.currentPoint !== null && ctx.team?.currentPoint !== undefined &&
    ctx.team.currentQuestion === 0 && ctx.team.totalQuestions === 0) {
    return handlePointCode(ctx);
  }
  if (ctx.team?.currentPoint !== null && ctx.team?.currentPoint !== undefined) {
    const questions = require("./data/questions.json");
    const point = questions.find((p) => p.pointId === ctx.team.currentPoint);

    // Добавить проверку существования вопроса
    if (point && point.questions[ctx.team.currentQuestion]) {
      const question = point.questions[ctx.team.currentQuestion];

      if (!Array.isArray(question.options)) {
        const isFirstQuestion = (ctx.team.currentQuestion === 0);
        const hasPenalty = await checkTimePenalty(ctx, ctx.team.currentQuestion, isFirstQuestion);
        const isCorrect = services.team.verifyAnswer(
          ctx.team.currentPoint,
          ctx.team.currentQuestion,
          ctx.message.text
        );

        await processQuestionAnswer(ctx, isCorrect, {
          isFirstQuestion,
          questionIndex: ctx.team.currentQuestion,
          point,
          hasPenalty
        });
        return;
      }
    }
  }
});

async function showCompletionTime(ctx, team) {
  const startTime = new Date(team.startTime);
  const endTime = new Date();
  const duration = endTime - startTime;
  const hours = Math.floor(duration / 3600000);
  const minutes = Math.floor((duration % 3600000) / 60000);

  await ctx.reply(
    `🎉 *Квест завершен!*\n⏱ Ваше время: ${hours}ч ${minutes}м`,
    { parse_mode: 'Markdown' }
  );
}

bot.action(/^answer_/, handleQuestionAnswer);

bot.action("contact_org", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply("📞 Свяжитесь с организаторами: @GeekLS");
});

bot.action("contact_support", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(
    "📞 *Свяжитесь с организаторами:*\n@GeekLS\n+7 (978) 7975 939",
    {
      parse_mode: "Markdown",
    }
  );
});

bot.action("visit_site", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(
    "🌐 Посетите наш сайт: https://ulysses-club.github.io/odissea/"
  );
});

bot.action("show_rules", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(
    "🎬 *Краткая инструкция для участников киноквеста «Odissea»*\n\n" +
    "🎯 *Цель игры:* Набрать максимальное количество баллов, находя коды на реальных локациях в городе и правильно отвечая на вопросы.\n\n" +
    "⚠️ *Главное правило:* Физическое присутствие на локациях — обязательно! Бот отслеживает время ваших ответов. Слишком быстрые ответы, когда вы не на точке, караются штрафными баллами.\n\n" +

    "🧭 *Как играть:*\n\n" +
    "1️⃣ *Регистрация команды*\n" +
    "– Нажмите /start\n" +
    "– Выберите крутое название команды из списка\n" +
    "– Введите имена всех участников через запятую (например, Тони, Вадим, Отец)\n\n" +

    "2️⃣ *Выбор и прохождение точки*\n" +
    "– Ожидайте старт от админов: *«🚀 Игра началась! Можете приступать к прохождению точек!»*\n" +
    "– В главном меню нажмите «🌍 Выбрать точку»\n" +
    "– Бот предложит список доступных локаций. Выбирайте любую! (После правильного ответа локация пропадает)\n" +
    "– Вы получите описание точки, загадку для поиска кода и кнопки для навигации в картах\n" +
    "– Ваша задача: найти на локации физический код (надпись, цифру, предмет)\n" +
    "– Найдя код, введите его в чат\n\n" +

    "3️⃣ *Ответы на вопросы*\n" +
    "– Если код верный — откроется вопрос (или несколько), связанный с темой локации\n" +
    "– Вопрос может быть:\n" +
    "   • С вариантами ответа → нажмите кнопку с правильным вариантом\n" +
    "   • Текстовым → введите ответ вручную\n" +
    "– *Система начисления очков:*\n" +
    "   • Правильный ответ: от 1 до 10 баллов (чем медленнее — тем больше баллов)\n" +
    "   • Неправильный ответ: -3 балла (можно попробовать снова)\n" +
    "   • Слишком быстрый ответ (< ~n сек): -3 балла (вы не на локации!)\n\n" +

    "4️⃣ *Мини-квесты*\n" +
    "– Нажмите «🎲 Мини-квест», чтобы получить задание (например, «сфотографировать в тематике...»)\n" +
    "– Выполните и отправьте фото в чат\n" +
    "– Награда: +5 баллов после валидации админа\n\n" +

    "📊 *Контроль и помощь:*\n" +
    "– «📊 Прогресс»: ваш счёт, пройденные точки, время в игре\n" +
    "– «🏆 Топ команд»: рейтинг участников\n" +
    "– «ℹ️ Информация»: правила, контакты организаторов, полезные ссылки\n\n" +

    "💡 *Важные советы:*\n" +
    "– Не спешите! Наслаждайтесь поиском — спешка = штрафы\n" +
    "– Внимательно читайте описание и загадку — там есть подсказки\n" +
    "– Думайте логически. Ответ часто зависит от деталей локации\n" +
    "– Работайте в команде! Обсуждайте, ищите вместе\n\n" +

    "⚖️ *Текущая система баллов:*\n" +
    "– Базовый вопрос: до 10 баллов\n" +
    "– Штраф за ошибку: -1 балл\n" +
    "– Штраф за скорость: -3 балла\n" +
    "– Штраф за неверный код: -1 балл\n" +
    "– Минимум за вопрос: 1 балл\n\n" +

    "🌟 *Удачи в прохождении! Пусть сила (и хорошее кино) будут с вами!* 🎥",
    { parse_mode: "Markdown" }
  );
});

bot.action(/^show_map_/, async (ctx) => {
  const pointId = parseInt(ctx.callbackQuery.data.split("_")[2]);
  const questions = require("./data/questions.json");
  const point = questions.find((p) => p.pointId === pointId);

  if (point && point.coordinates) {
    await ctx.replyWithLocation(point.coordinates.lat, point.coordinates.lng, {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🗺️ Открыть в Google Maps",
              url: `https://maps.google.com/?q=${point.coordinates.lat},${point.coordinates.lng}`,
            },
          ],
          [
            {
              text: "📍 Открыть в Яндекс.Картах",
              url: `https://yandex.ru/maps/?pt=${point.coordinates.lng},${point.coordinates.lat}&z=17&l=map`,
            },
          ],
        ],
      },
    });
  }
});

// ======================
// Функции обработчиков
// ======================

async function handleStart(ctx) {
  if (services.team.isTeamRegistered(ctx.chat.id)) {
    const team = services.team.getTeam(ctx.chat.id);
    const isGameActive = services.admin.isGameActive;
    const isTeamRegistered = services.team.isTeamRegistered(ctx.chat.id);

    if (team.waitingForMembers) {
      return ctx.reply(locales.addMembers, Markup.removeKeyboard());
    }

    // Всегда показываем кнопки для зарегистрированных команд с учетом статуса игры
    return ctx.reply(
      locales.alreadyRegistered,
      keyboards.mainMenu.getKeyboard(
        services.admin.isAdmin(ctx.from.id),
        isGameActive,
        isTeamRegistered,
        team.waitingForMembers
      )
    );
  }

  const teamButtons = teamOptions.map((team) =>
    Markup.button.callback(team.name, team.id)
  );

  await ctx.reply(
    locales.welcomeMessage,
    Markup.inlineKeyboard(teamButtons, { columns: 2 })
  );
}

async function handleInfo(ctx) {
  try {
    // Отправляем фото с QR-кодом
    await ctx.replyWithPhoto(
      {
        source: "./assets/donat/logo.jpg",
      },
      {
        caption: locales.infoMessage,
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [
            { text: "📞 Поддержка", callback_data: "contact_support" },
            { text: "🌐 Сайт", url: "https://ulysses-club.github.io/odissea/" },
          ],
          [
            { text: "🎬 О проекте", callback_data: "about_project" },
            { text: "📊 Правила", callback_data: "show_rules" },
          ],
          [{ text: locales.donateButton, callback_data: "donate" }],
        ]),
      }
    );
  } catch (error) {
    console.error("Error in handleInfo:", error);
    // Если фото не найдено, отправляем обычное сообщение
    await ctx.reply(locales.infoMessage, {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [
          { text: "📞 Поддержка", callback_data: "contact_support" },
          { text: "🌐 Сайт", url: "https://ulysses-club.github.io/odissea/" },
        ],
        [
          { text: "🎬 О проекте", callback_data: "about_project" },
          { text: "📊 Правила", callback_data: "show_rules" },
        ],
        [{ text: locales.donateButton, callback_data: "donate" }],
      ]),
    });
  }
}

bot.action("donate", async (ctx) => {
  await ctx.answerCbQuery();
  try {
    // Отправляем фото с QR-кодом
    await ctx.replyWithPhoto(
      {
        source: "./assets/donat/qr_code.jpg",
      },
      {
        caption: locales.donateMessage,
      }
    );
  } catch (error) {
    console.error("Error sending QR code:", error);
  }
});

// Обработчик для копирования номера карты
bot.action("copy_card_number", async (ctx) => {
  await ctx.answerCbQuery("Номер карты скопирован в буфер обмена");
  // Здесь можно добавить логику для копирования текста, если поддерживается браузером
});

// Обработчик для возврата к информации
bot.action("back_to_info", async (ctx) => {
  await ctx.answerCbQuery();
  await handleInfo(ctx);
});

bot.action("about_project", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(locales.aboutUs, {
    parse_mode: "Markdown",
  });
});

bot.command("donate", async (ctx) => {
  try {
    // Отправляем фото с QR-кодом
    await ctx.replyWithPhoto(
      {
        source: "./assets/donat/qr_code.jpg", // Путь к QR-коду
      },
      {
        caption: locales.donateMessage,
        parse_mode: "Markdown",
      }
    );
  } catch (error) {
    console.error("Error sending QR code:", error);
  }
});

async function handleTeamSelection(ctx) {
  const selectedTeam = teamOptions.find(
    (team) => team.id === ctx.callbackQuery.data
  );
  if (!selectedTeam) {
    return ctx.reply(locales.teamSelectionError);
  }

  if (!services.team.isTeamNameAvailable(selectedTeam.name)) {
    return ctx
      .reply(
        `❌ Команда "${selectedTeam.name}" уже зарегистрирована. Пожалуйста, выберите другое название.`,
        Markup.removeKeyboard()
      )
      .then(() => handleStart(ctx));
  }

  const team = services.team.registerTeam(
    ctx.chat.id,
    selectedTeam.name,
    ctx.from.id
  );

  await ctx.reply(
    locales.teamRegistered.replace("%s", selectedTeam.name),
    Markup.removeKeyboard()
  );

  // Устанавливаем флаг ожидания участников
  services.team.updateTeam(ctx.chat.id, {
    waitingForMembers: true,
    waitingForBroadcast: false,
  });

  await ctx.reply(
    locales.addMembers,
    keyboards.mainMenu.getKeyboard(
      services.admin.isAdmin(ctx.from.id),
      services.admin.isGameActive,
      true, // isTeamRegistered = true
      true  // waitingForMembers = true
    )
  );
}

async function handleBeginQuest(ctx) {
  // Всегда проверяем активность игры
  if (!services.admin.isGameActive && !services.admin.isAdmin(ctx.from.id)) {
    return ctx.reply(locales.gameNotStarted);
  }

  await ctx.reply(
    locales.startQuest,
    keyboards.mainMenu.getKeyboard(
      services.admin.isAdmin(ctx.from.id),
      services.admin.isGameActive
    )
  );
}

async function handlePointSelection(ctx) {
  const questions = require("./data/questions.json");
  const availablePoints = [...new Set(questions.map((q) => q.pointId))].filter(
    (p) => !ctx.team?.completedPoints?.includes(p)
  );

  if (availablePoints.length === 0) {
    return ctx.reply(locales.noPointsAvailable);
  }

  // Создаем кнопки для выбора точек
  const pointButtons = availablePoints.map(pointId =>
    Markup.button.callback(
      `${keyboards.pointSelection.getPointDescription(pointId)}`,
      `point_${pointId}`
    )
  );

  await ctx.reply(
    locales.selectPoint,
    Markup.inlineKeyboard(pointButtons, { columns: 1 })
  );
}

async function handlePointActivation(ctx) {
  const pointId = parseInt(ctx.callbackQuery.data.split("_")[1]);
  const questions = require("./data/questions.json");
  const point = questions.find((p) => p.pointId === pointId);

  try {
    await ctx.replyWithPhoto({ source: `./assets/point_${pointId}.jpg` });
  } catch (err) {
    console.log("Фото недоступно");
  }

  // Отправляем описание точки и инструкцию по вводу кода
  const formattedMessage =
    `🎬 *${keyboards.pointSelection.getPointDescription(pointId)}*\n\n` +
    `📍 ${point.description}\n\n` +
    `🔍 *Подсказка для кода:*\n` +
    `${point.locationHint}\n\n` +
    `📝 *Введите полученный код:*`;

  // Получаем клавиатуру навигации
  const navigationKeyboard = keyboards.pointSelection.getNavigationKeyboard(pointId);

  if (navigationKeyboard) {
    await ctx.reply(formattedMessage, {
      parse_mode: "Markdown",
      ...navigationKeyboard,
    });
  } else {
    await ctx.reply(formattedMessage, {
      parse_mode: "Markdown",
    });
  }

  // Устанавливаем текущую точку и сбрасываем состояние вопросов
  // Фиксируем время активации точки для отсчета первого вопроса
  services.team.updateTeam(ctx.chat.id, {
    currentPoint: pointId,
    currentQuestion: 0,
    totalQuestions: 0,
    waitingForMembers: false,
    waitingForBroadcast: false,
    lastAnswerTime: null,
    pointActivationTime: new Date().toISOString() // Важно: фиксируем время активации
  });
}

const questions = require("./data/questions.json");

questions.forEach((question) => {
  const hint = question.locationHint.toLowerCase();
  const code = question.code.toLowerCase();

  if (!hint.includes(code) && !hint.includes("ответ")) {
    console.warn(
      `⚠️ Точка ${question.pointId}: подсказка не содержит код или указание на ответ`
    );
  }
});

async function handlePointCode(ctx) {
  const code = ctx.message.text.trim();
  const team = ctx.team;

  if (services.team.verifyCode(team.currentPoint, code)) {
    // Код верный - активируем вопросы
    const questions = require("./data/questions.json");
    const point = questions.find((p) => p.pointId === team.currentPoint);

    services.team.updateTeam(ctx.chat.id, {
      currentQuestion: 0,
      totalQuestions: point.questions.length,
      lastAnswerTime: new Date().toISOString(),
      pointActivationTime: new Date().toISOString() // Устанавливаем время активации
    });
    await askQuestion(ctx, 0);
  } else {
    // Код неверный - применяем штраф
    services.team.addPoints(ctx.chat.id, -PENALTIES.WRONG_CODE);
    await ctx.reply(
      locales.wrongCodePenalty.replace("%d", PENALTIES.WRONG_CODE),
      { parse_mode: "Markdown" }
    );
  }
}

async function askQuestion(ctx, questionIndex) {
  const questions = require("./data/questions.json");
  const point = questions.find((p) => p.pointId === ctx.team.currentPoint);

  if (!point || !point.questions[questionIndex]) {
    return ctx.reply(locales.questionNotFound);
  }

  const question = point.questions[questionIndex];

  const key = `${ctx.team.currentPoint}_${questionIndex}`;
  const currentPoints = ctx.team.questionPoints?.[key] || 10;

  // Если это вопрос с вариантами ответов
  if (Array.isArray(question.options)) {
    const options = question.options.map((option, i) =>
      Markup.button.callback(option, `answer_${questionIndex}_${i}`)
    );

    await ctx.reply(
      locales.questionTemplate
        .replace("%d", questionIndex + 1)
        .replace("%d", point.questions.length)
        .replace("%s", question.text) +
      `\n\n*Доступно баллов за этот вопрос: ${currentPoints}*`,
      Markup.inlineKeyboard(options, { columns: 1 })
    );
  } else {
    // Если это текстовый вопрос
    await ctx.reply(
      locales.questionTemplate
        .replace("%d", questionIndex + 1)
        .replace("%d", point.questions.length)
        .replace("%s", question.text) +
      `\n\n*Доступно баллов за этот вопрос: ${currentPoints}*\n\n` +
      `📝 *Введите ваш ответ:*`,
      { parse_mode: "Markdown" }
    );
  }
}

async function handleQuestionAnswer(ctx) {
  const [_, questionIndex, answerIndex] = ctx.callbackQuery.data
    .split("_")
    .map(Number);
  const questions = require("./data/questions.json");
  const point = questions.find((p) => p.pointId === ctx.team.currentPoint);

  const isFirstQuestion = (questionIndex === 0);
  const hasPenalty = await checkTimePenalty(ctx, questionIndex, isFirstQuestion);
  const isCorrect = services.team.verifyAnswer(
    ctx.team.currentPoint,
    questionIndex,
    answerIndex.toString()
  );

  await processQuestionAnswer(ctx, isCorrect, {
    isFirstQuestion,
    questionIndex,
    point,
    hasPenalty
  });
}

async function handleMiniQuest(ctx) {
  try {
    const team = ctx.team;
    if (!team) return;

    const availableQuests = services.quest.getAvailableMiniQuests(
      team.completedMiniQuests
    );

    if (availableQuests.length === 0) {
      return ctx.reply(locales.miniQuestAllCompleted);
    }

    const miniQuest =
      availableQuests[Math.floor(Math.random() * availableQuests.length)];

    await ctx.reply(locales.miniQuestTask.replace("%s", miniQuest.task), {
      parse_mode: "Markdown",
    });

    services.team.updateTeam(ctx.chat.id, {
      currentMiniQuest: miniQuest,
      waitingForMembers: false,
      waitingForBroadcast: false,
    });
  } catch (err) {
    console.error("Error in handleMiniQuest:", err);
    ctx.reply(locales.errorOccurred);
  }
}

async function handleMiniQuestAnswer(ctx) {
  try {
    const team = ctx.team;
    if (!team?.currentMiniQuest) {
      return ctx.reply(locales.noActiveMiniQuest);
    }

    const wasCorrect = ctx.message.text === team.currentMiniQuest.answer;
    const updates = {
      currentMiniQuest: null,
      waitingForMembers: false,
      waitingForBroadcast: false,
    };

    if (wasCorrect) {
      const questCompleted = services.team.completeMiniQuest(
        ctx.chat.id,
        team.currentMiniQuest.task
      );

      if (questCompleted) {
        services.team.addPoints(ctx.chat.id, 5);
        await ctx.reply(
          locales.miniQuestCorrect.replace("%d", team.points + 5),
          {
            parse_mode: "Markdown",
            ...keyboards.mainMenu.getKeyboard(
              services.admin.isAdmin(ctx.from.id),
              services.admin.isGameActive,
              true, // isTeamRegistered
              false // waitingForMembers
            )
          }
        );
      } else {
        await ctx.reply(locales.questAlreadyCompleted);
      }
    } else {
      await ctx.reply(locales.miniQuestWrong, {
        ...keyboards.mainMenu.getKeyboard(
          services.admin.isAdmin(ctx.from.id),
          services.admin.isGameActive,
          true, // isTeamRegistered
          false // waitingForMembers
        )
      });
    }

    services.team.updateTeam(ctx.chat.id, updates);
  } catch (err) {
    console.error("Error in handleMiniQuestAnswer:", err);
    ctx.reply(locales.errorOccurred);
  }
}

async function handleProgress(ctx) {
  const progress = services.team.getTeamProgress(ctx.chat.id);
  if (!progress) return;

  let completionInfo = '';
  if (progress.completionTime) {
    const completionDate = new Date(progress.completionTime);
    completionInfo = `\n🏁 *Завершил:* ${completionDate.toLocaleString()}`;
  }

  const message = [
    `🏆 *Команда:* ${progress.teamName}`,
    `👤 *Капитан:* ${ctx.from.first_name} ${ctx.from.last_name || ""}`,
    `👥 *Участники:* ${progress.members.join(", ") || "нет"}`,
    `📊 *Баллы:* ${progress.points}`,
    `📍 *Пройдено точек:* ${progress.completedPoints.length}/${progress.totalPoints}`,
    `🎲 *Пройдено мини-квестов:* ${progress.completedMiniQuests.length}/${progress.totalMiniQuests}`,
    `⏱ *В игре:* ${progress.timeInGame}`,
    `🕒 *Старт:* ${new Date(progress.startTime).toLocaleString()}`,
    completionInfo
  ].join("\n");

  await ctx.reply(message, { parse_mode: "Markdown" });
}

async function handleTopTeams(ctx) {
  const topTeams = services.admin.getTopTeams(
    services.team.getAllTeams(),
    true
  );
  await ctx.reply(topTeams, { parse_mode: "Markdown" });
}

async function handleAdminPanel(ctx) {
  if (!services.admin.isAdmin(ctx.from.id)) return;
  ctx.reply(locales.adminPanel, {
    ...keyboards.admin.getKeyboard(services.admin.getGameStatus()),
    parse_mode: "Markdown",
  });
}

async function handleStats(ctx) {
  if (!services.admin.isAdmin(ctx.from.id)) return;

  const stats = await services.admin.getFullStats(services.team.getAllTeams());
  ctx.reply(stats, { parse_mode: "Markdown" });
}

async function handleResetConfirmation(ctx) {
  if (!services.admin.isAdmin(ctx.from.id)) return;

  ctx.reply(locales.resetConfirm, {
    reply_markup: {
      inline_keyboard: [
        [Markup.button.callback("✅ Да", "reset_confirm")],
        [Markup.button.callback("❌ Нет", "reset_cancel")],
      ],
    },
    parse_mode: "Markdown",
  });
}

async function handleBroadcast(ctx) {
  if (!services.admin.isAdmin(ctx.from.id)) return;

  services.team.updateTeam(ctx.chat.id, {
    waitingForBroadcast: true,
    waitingForMembers: false,
  });
  await ctx.reply(locales.broadcastPrompt, Markup.removeKeyboard());
}

async function handleBroadcastMessage(ctx) {
  if (!ctx.team?.waitingForBroadcast) return;

  const teams = services.team.getAllTeams();

  // Проверяем, есть ли команды для рассылки
  if (teams.length === 0) {
    await ctx.reply("❌ Нет зарегистрированных команд для рассылки");
    services.team.updateTeam(ctx.chat.id, {
      waitingForBroadcast: false,
    });
    return;
  }

  const successCount = await services.admin.broadcastMessage(
    bot,
    ctx.message.text,
    teams
  );

  services.team.updateTeam(ctx.chat.id, {
    waitingForBroadcast: false,
  });

  if (successCount > 0) {
    await ctx.reply(locales.broadcastSuccess.replace("%d", successCount), {
      parse_mode: "Markdown",
      ...keyboards.admin.getKeyboard(services.admin.getGameStatus())
    });
  } else {
    await ctx.reply("❌ Не удалось отправить рассылку ни одной команде", {
      ...keyboards.admin.getKeyboard(services.admin.getGameStatus())
    });
  }
}

async function handleMainMenu(ctx) {
  ctx.reply(locales.mainMenu, keyboards.mainMenu.getKeyboard());
}

async function handleResetConfirm(ctx) {
  if (!services.admin.isAdmin(ctx.from.id)) return;

  const result = services.admin.resetAllTeams(services.team);
  await ctx.reply(result.message, { parse_mode: "Markdown" });

  for (const chatId of result.affectedChatIds) {
    try {
      await bot.telegram.sendMessage(
        chatId,
        locales.resetNotification,
        Markup.removeKeyboard()
      );
    } catch (err) {
      console.error(`Ошибка отправки команде ${chatId}:`, err);
    }
  }

  await handleAdminPanel(ctx);
}

async function handleResetCancel(ctx) {
  if (!services.admin.isAdmin(ctx.from.id)) return;

  await ctx.reply(locales.resetCanceled);
  await handleAdminPanel(ctx);
}

async function handleMembersInput(ctx) {
  const members = ctx.message.text
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);

  services.team.updateTeam(ctx.chat.id, {
    members,
    waitingForMembers: false,
  });

  const isTeamRegistered = services.team.isTeamRegistered(ctx.chat.id);

  await ctx.reply(
    locales.membersAdded.replace("%s", members.join(", ")),
    keyboards.mainMenu.getKeyboard(
      services.admin.isAdmin(ctx.from.id),
      services.admin.isGameActive,
      isTeamRegistered,
      false  // waitingForMembers = false
    )
  );
}

async function processQuestionAnswer(ctx, isCorrect, options) {
  const { isFirstQuestion, questionIndex, point, hasPenalty } = options;

  const key = `${ctx.team.currentPoint}_${questionIndex}`;
  const currentPoints = ctx.team.questionPoints?.[key] || PENALTIES.BASE_QUESTION_POINTS;

  services.team.updateLastAnswerTime(ctx.chat.id, new Date().toISOString());

  if (isCorrect) {
    let pointsToAdd = currentPoints;
    let penaltyMessage = "";

    // Применяем штраф за скорость (только если не первый вопрос)
    if (hasPenalty && !isFirstQuestion) {
      const penalty = PENALTIES.TOO_FAST_ANSWER;
      pointsToAdd = Math.max(1, currentPoints - penalty); // Минимум 1 балл
      penaltyMessage = ` (${currentPoints}-${penalty} за скорость)`;

      // Отправляем сообщение о штрафе
      await ctx.reply(getRandomTooFastMessage(), { parse_mode: "Markdown" });
    }

    // Начисляем баллы
    services.team.addPoints(ctx.chat.id, pointsToAdd);

    // Сообщение о правильном ответе
    await ctx.reply(locales.correctAnswer.replace("%d", pointsToAdd) + penaltyMessage);

    // Переход к следующему вопросу или завершение точки
    if (questionIndex < point.questions.length - 1) {
      // Переходим к следующему вопросу
      services.team.updateTeam(ctx.chat.id, {
        currentQuestion: questionIndex + 1,
      });
      await askQuestion(ctx, questionIndex + 1);
    } else {
      // Это был последний вопрос — завершаем точку
      const completedPointId = services.team.completePoint(
        ctx.chat.id,
        ctx.team.currentPoint
      );

      const updatedTeam = services.team.getTeam(ctx.chat.id);

      await ctx.reply(
        locales.pointCompleted
          .replace("%d", completedPointId)
          .replace("%d", updatedTeam.points),
        keyboards.mainMenu.getKeyboard(
          services.admin.isAdmin(ctx.from.id),
          services.admin.isGameActive,
          true, // isTeamRegistered
          false // waitingForMembers
        )
      );

      // Проверяем, завершен ли весь квест
      const questions = require("./data/questions.json");
      const totalPoints = [...new Set(questions.map(q => q.pointId))].length;

      if (updatedTeam.completedPoints.length >= totalPoints) {
        // Фиксируем время завершения
        services.team.setCompletionTime(ctx.chat.id);
        await showCompletionTime(ctx, updatedTeam);
      }

      // Проверяем и выдаем призы (если применимо)
      await checkAndAwardPrizes(ctx, ctx.chat.id, updatedTeam.completedPoints.length);
    }
  } else {
    // Неправильный ответ
    services.team.addPoints(ctx.chat.id, -PENALTIES.WRONG_ANSWER);
    await ctx.reply(
      getRandomWrongAnswerMessage(),
      {
        parse_mode: "Markdown",
        ...keyboards.mainMenu.getKeyboard(
          services.admin.isAdmin(ctx.from.id),
          services.admin.isGameActive,
          true, // isTeamRegistered
          false // waitingForMembers
        )
      }
    );

    // Адаптивная стоимость при ошибке
    services.team.updateQuestionPoints(
      ctx.chat.id,
      ctx.team.currentPoint,
      questionIndex,
      -2 // Снижаем стоимость этого вопроса
    );

    await askQuestion(ctx, questionIndex);
  }
}

// Функции для работы с призами
function readPrizes() {
  try {
    if (fs.existsSync(prizesFile)) {
      return JSON.parse(fs.readFileSync(prizesFile, 'utf8'));
    }
    return {};
  } catch (err) {
    console.error('Ошибка чтения prizes.json:', err);
    return {};
  }
}

function writePrizes(data) {
  try {
    fs.writeFileSync(prizesFile, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Ошибка записи prizes.json:', err);
  }
}

function isPrizeAlreadyAwarded(threshold) {
  const prizes = readPrizes();
  return prizes[threshold] !== undefined;
}

function markPrizeAsAwarded(threshold, teamName, chatId) {
  const prizes = readPrizes();
  prizes[threshold] = {
    teamName: teamName,
    chatId: chatId,
    awardedAt: new Date().toISOString()
  };
  writePrizes(prizes);
}

async function checkAndAwardPrizes(ctx, chatId, completedPointsCount) {
  const team = services.team.getTeam(chatId);
  if (!team) return;

  const thresholds = [4, 8, 10];

  if (!thresholds.includes(completedPointsCount)) {
    return;
  }

  // Проверяем, не выдан ли уже приз за этот порог
  if (isPrizeAlreadyAwarded(completedPointsCount)) {
    console.log(`Приз за ${completedPointsCount} точек уже выдан`);
    return;
  }

  // Проверяем, не получала ли команда уже этот приз
  if (services.team.hasPrize(chatId, completedPointsCount)) {
    console.log(`Команда уже получала приз за ${completedPointsCount} точек`);
    return;
  }

  const prizeConfig = locales.prizes[completedPointsCount];
  if (!prizeConfig) {
    console.log(`Нет конфигурации приза для ${completedPointsCount} точек`);
    return;
  }

  // Награждаем команду
  markPrizeAsAwarded(completedPointsCount, team.teamName, team.chatId);
  services.team.addPrize(chatId, completedPointsCount);

  // Формируем сообщение с промокодом
  const message = locales.prizeMessage
    .replace('%d', completedPointsCount)
    .replace('%s', prizeConfig.promoCode)
    .replace('%s', prizeConfig.cafeName)
    .replace('%s', prizeConfig.address);

  // Создаем клавиатуру с кнопками для навигации
  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.url(
        '🗺️ Google Maps',
        `https://maps.google.com/?q=${prizeConfig.coordinates.lat},${prizeConfig.coordinates.lng}`
      ),
      Markup.button.url(
        '📍 Яндекс.Карты',
        `https://yandex.ru/maps/?pt=${prizeConfig.coordinates.lng},${prizeConfig.coordinates.lat}&z=17&l=map`
      )
    ],
    [
      Markup.button.url(
        '📱 2GIS',
        `https://2gis.ru/geo/${prizeConfig.coordinates.lng},${prizeConfig.coordinates.lat}`
      )
    ]
  ]);

  // Отправляем сообщение с промокодом
  await ctx.reply(message, {
    parse_mode: 'Markdown',
    ...keyboard
  });
}

// ======================
// Запуск бота
// ======================

bot
  .launch()
  .then(() => console.log("🎬 Бот успешно запущен!"))
  .catch((err) => console.error("Ошибка запуска бота:", err));

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
