const { Telegraf, Markup } = require("telegraf");

require("dotenv").config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const TeamService = require("./services/TeamService");
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
  admin: new AdminService(),
};

const PENALTIES = {
  BASE_QUESTION_POINTS: 10,  // Начальная стоимость вопроса
  WRONG_ANSWER: 1,           // Штраф за ошибку
  TOO_FAST_ANSWER: 3,        // Штраф за скорость
  WRONG_CODE: 1,             // Штраф за неверный код
  MIN_TIME_BETWEEN_ANSWERS: 5 // Минимальное время между ответами (71 сек)
};

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
// Команды бота
// ======================
bot.command("start", handleStart);
bot.command("admin", handleAdminPanel);
bot.action(/^team_/, handleTeamSelection);
bot.action("reset_confirm", handleResetConfirm);
bot.action("reset_cancel", handleResetCancel);
bot.action(/^point_/, handlePointActivation);
bot.action('clear_prizes_confirm', handleClearPrizesConfirm);
bot.action('clear_prizes_cancel', handleClearPrizesCancel);
bot.hears("▶ Начать квест", handleBeginQuest);
bot.hears("🌍 Выбрать точку", handlePointSelection);
bot.hears("📊 Прогресс", handleProgress);
bot.hears("🏆 Топ команд", handleTopTeams);
bot.hears("📊 Статистика", handleStats);
bot.hears("🔄 Сбросить прогресс", handleResetConfirmation);
bot.hears("📢 Рассылка", handleBroadcast);
bot.hears("🏆 Показать топ", handleTopTeams);
bot.hears("⬅️ В главное меню", handleMainMenu);
bot.hears("👑 Админ-панель", handleAdminPanel);
bot.hears("ℹ️ Информация", handleInfo);
bot.hears('🧹 Чистка призов', handleClearPrizesConfirmation);

bot.use(async (ctx, next) => {
  if (services.team.isTeamRegistered(ctx.chat.id)) {
    ctx.team = services.team.getTeam(ctx.chat.id);

    // Разрешаем доступ к меню если игра активна ИЛИ команда ожидает ввода участников
    if (services.admin.isGameActive || ctx.team.waitingForMembers) {
      return next();
    }
  }

  const infoRoutes = [
    "contact_support", "contact_org", "about_project",
    "show_rules", "show_map", "donate", "visit_site",
    "back_to_info"
  ];

  const exemptRoutes = [
    "/start", "team_", "/admin", "top_", "reset_",
    "ℹ️ Информация", "📊 Прогресс", "🏆 Топ команд"
  ];

  const isInfoRoute = infoRoutes.some(route =>
    ctx.callbackQuery?.data === route
  );

  const isExempt = exemptRoutes.some(
    (route) =>
      ctx.message?.text?.startsWith(route) ||
      ctx.callbackQuery?.data?.startsWith(route)
  ) || isInfoRoute;

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

  // Убедимся, что prizesReceived инициализирован
  if (!team.prizesReceived || team.prizesReceived.length === 0) {
    return ctx.reply('🎁 У вашей команды пока нет полученных призов.');
  }

  const prizes = team.prizesReceived.map(threshold => {
    const prize = locales.prizes[threshold];
    if (prize) {
      return `🏆 ${threshold} точек: ${prize.promoCode} - ${prize.cafeName}`;
    }
    return `🏆 ${threshold} точек: Приз (детали недоступны)`;
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
// Обработчики сообщений
// ======================
bot.on("text", async (ctx) => {
  if (ctx.team?.waitingForMembers) {
    return handleMembersInput(ctx);
  }
  if (ctx.team?.waitingForBroadcast) {
    return handleBroadcastMessage(ctx);
  }
  // Добавить проверку на активную точку без активных вопросов
  if (ctx.team?.currentPoint !== null && ctx.team?.currentPoint !== undefined &&
    ctx.team.currentQuestion === 0 && ctx.team.totalQuestions === 0) {
    return handlePointCode(ctx);
  }
  if (ctx.team?.currentPoint !== null && ctx.team?.currentPoint !== undefined) {
    const questions = require("./data/questions.json");
    const point = questions.find((p) => p.pointId === ctx.team.currentPoint);

    if (point && point.questions[ctx.team.currentQuestion]) {
      const question = point.questions[ctx.team.currentQuestion];

      if (!Array.isArray(question.options)) {
        const hasPenalty = await checkTimePenalty(ctx, ctx.team.currentQuestion);
        const isCorrect = services.team.verifyAnswer(
          ctx.team.currentPoint,
          ctx.team.currentQuestion,
          ctx.message.text
        );

        await processQuestionAnswer(ctx, isCorrect, {
          questionIndex: ctx.team.currentQuestion,
          point,
          hasPenalty
        });
        return;
      }
    }
  }
});

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
      ...Markup.inlineKeyboard([
        [{ text: "⬅️ Назад", callback_data: "back_to_info" }]
      ])
    }
  );
});

bot.action("visit_site", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(
    "🌐 Посетите наш сайт: https://ulysses-club.github.io/odissea/",
    Markup.inlineKeyboard([
      [{ text: "⬅️ Назад", callback_data: "back_to_info" }]
    ])
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
    "   • Правильный ответ: от 1 до 10 баллов\n" +
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
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [{ text: "⬅️ Назад", callback_data: "back_to_info" }]
      ])
    }
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

bot.action("show_map", async (ctx) => {
  await ctx.answerCbQuery();
  try {
    await ctx.replyWithPhoto(
      { source: "./assets/map.jpg" },
      {
        caption: locales.mapMessage,
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [{ text: "⬅️ Назад", callback_data: "back_to_info" }]
        ])
      }
    );
  } catch (error) {
    console.error("Error sending map:", error);
    await ctx.reply("❌ Карта временно недоступна. Попробуйте позже.");
  }
});

bot.action("donate", async (ctx) => {
  await ctx.answerCbQuery();
  try {
    await ctx.replyWithPhoto(
      { source: "./assets/donat/qr_code.jpg" },
      {
        caption: locales.donateMessage,
        ...Markup.inlineKeyboard([
          [{ text: "⬅️ Назад", callback_data: "back_to_info" }]
        ])
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
    ...Markup.inlineKeyboard([
      [{ text: "⬅️ Назад", callback_data: "back_to_info" }]
    ])
  });
});

bot.command("donate", async (ctx) => {
  try {
    await ctx.replyWithPhoto(
      { source: "./assets/donat/qr_code.jpg" },
      {
        caption: locales.donateMessage,
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [{ text: "⬅️ Назад", callback_data: "back_to_info" }]
        ])
      }
    );
  } catch (error) {
    console.error("Error sending QR code:", error);
  }
});

bot.action(/^answer_/, async (ctx) => {
  try {
    await handleQuestionAnswer(ctx);
  } catch (error) {
    console.error("Error handling question answer:", error);
    await ctx.answerCbQuery("Произошла ошибка, попробуйте еще раз");
  }
});

/**
 * Обрабатывает команду /start — регистрацию или возврат в главное меню.
 * 
 * @param {Object} ctx — контекст Telegram-бота.
 * @returns {Promise<void>} — отправляет сообщение с выбором команды или главным меню.
 * 
 * @description
 * Если команда уже зарегистрирована — показывает главное меню с учетом статуса игры и ожидания участников.
 * Если нет — предлагает выбрать название команды через inline-кнопки.
 */
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

/**
 * Отображает время завершения квеста командой.
 * 
 * @param {Object} ctx — контекст Telegram-бота.
 * @param {Object} team — объект команды с полем startTime.
 * @returns {Promise<void>} — отправляет сообщение с поздравлением и временем прохождения.
 * 
 * @description
 * Используется при завершении квеста. Форматирует разницу между startTime и текущим временем.
 */
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

/**
 * Обрабатывает команду /info — отправляет информацию о проекте с фото и кнопками.
 * 
 * @param {Object} ctx — контекст Telegram-бота.
 * @returns {Promise<void>} — отправляет фото с описанием и inline-кнопками.
 * 
 * @description
 * Включает ссылку на сайт проекта, кнопки поддержки, правил, карты и доната.
 * При ошибке отправляет текст без фото.
 */
async function handleInfo(ctx) {
  try {
    const isFromMainMenu = !ctx.callbackQuery; // Если вызвано из главного меню, а не по callback

    const keyboardButtons = [
      [
        { text: "📞 Поддержка", callback_data: "contact_support" },
        { text: "🌐 Сайт", url: "https://ulysses-club.github.io/odissea/" },
      ],
      [
        { text: "🎬 О проекте", callback_data: "about_project" },
        { text: "📊 Правила", callback_data: "show_rules" },
      ],
      [
        { text: locales.mapButton, callback_data: "show_map" },
        { text: locales.donateButton, callback_data: "donate" }
      ]
    ];

    // Добавляем кнопку "Назад" только если это не из главного меню
    if (!isFromMainMenu) {
      keyboardButtons.push([{ text: "⬅️ Назад", callback_data: "back_to_info" }]);
    }

    await ctx.replyWithPhoto(
      {
        source: "./assets/donat/logo.jpg",
      },
      {
        caption: locales.infoMessage,
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard(keyboardButtons),
      }
    );
  } catch (error) {
    console.error("Error in handleInfo:", error);
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
        [
          { text: locales.mapButton, callback_data: "show_map" },
          { text: locales.donateButton, callback_data: "donate" }
        ]
      ]),
    });
  }
}

/**
 * Обрабатывает выбор названия команды через callback-кнопку.
 * 
 * @param {Object} ctx — контекст Telegram-бота.
 * @returns {Promise<void>} — регистрирует команду или возвращает ошибку, если название занято.
 * 
 * @description
 * После успешной регистрации переводит команду в состояние ожидания участников.
 */
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

/**
 * Обрабатывает начало квеста командой.
 * 
 * @param {Object} ctx — контекст Telegram-бота.
 * @returns {Promise<void>} — отправляет приветственное сообщение и главное меню.
 * 
 * @description
 * Проверяет, активна ли игра. Только админы могут начать вне активной игры.
 */
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

/**
 * Предлагает команде выбрать точку для прохождения.
 * 
 * @param {Object} ctx — контекст Telegram-бота.
 * @returns {Promise<void>} — отправляет inline-кнопки с доступными точками.
 * 
 * @description
 * Фильтрует только непройденные точки. Если все пройдены — сообщает об этом.
 */
async function handlePointSelection(ctx) {
  const questions = require("./data/questions.json");
  const team = services.team.getTeam(ctx.chat.id);

  // Фильтруем только непройденные точки
  const availablePoints = [...new Set(questions.map((q) => q.pointId))].filter(
    (p) => !team?.completedPoints?.includes(p)
  );

  if (availablePoints.length === 0) {
    return ctx.reply(locales.noPointsAvailable);
  }

  // Создаем кнопки для выбора точек
  const pointButtons = availablePoints.map(pointId => {
    const pointDescription = keyboards.pointSelection.getPointDescription(pointId);
    return Markup.button.callback(
      `${pointDescription}`,
      `point_${pointId}`
    );
  });

  await ctx.reply(
    locales.selectPoint,
    Markup.inlineKeyboard(pointButtons, { columns: 1 })
  );
}

/**
 * Активирует выбранную точку: отправляет фото, описание и подсказку, фиксирует время активации.
 * 
 * @param {Object} ctx — контекст Telegram-бота.
 * @returns {Promise<void>} — отправляет информацию о точке и устанавливает состояние команды.
 * 
 * @description
 * Важно: фиксирует pointActivationTime для корректного расчета штрафов за скорость на первом вопросе.
 */
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

/**
 * Проверяет введенный код активации точки.
 * 
 * @param {Object} ctx — контекст Telegram-бота.
 * @returns {Promise<void>} — если код верный — запускает первый вопрос; если нет — штраф.
 * 
 * @description
 * При успешной верификации фиксирует время первого вопроса и запускает askQuestion.
 */
async function handlePointCode(ctx) {
  const code = ctx.message.text.trim();
  const team = ctx.team;

  if (services.team.verifyCode(team.currentPoint, code)) {
    // Код верный - активируем вопросы
    const questions = require("./data/questions.json");
    const point = questions.find((p) => p.pointId === team.currentPoint);

    // Устанавливаем время активации точки для отсчета времени первого вопроса
    services.team.updateTeam(ctx.chat.id, {
      currentQuestion: 0,
      totalQuestions: point.questions.length,
      lastAnswerTime: new Date().toISOString(),
      pointActivationTime: new Date().toISOString() // Важно: фиксируем время активации для первого вопроса
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

/**
 * Задает вопрос команде (текстовый или с вариантами).
 * 
 * @param {Object} ctx — контекст Telegram-бота.
 * @param {number} questionIndex — индекс вопроса в массиве вопросов точки.
 * @returns {Promise<void>} — отправляет текст вопроса и кнопки (если есть варианты).
 * 
 * @description
 * Отображает текущее количество доступных баллов за вопрос.
 */
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

/**
 * Обрабатывает ответ на вопрос с вариантами (через callback).
 * 
 * @param {Object} ctx — контекст Telegram-бота.
 * @returns {Promise<void>} — проверяет правильность, применяет штрафы, начисляет баллы.
 * 
 * @description
 * Вызывает processQuestionAnswer после проверки времени и правильности.
 */
async function handleQuestionAnswer(ctx) {
  const [_, questionIndex, answerIndex] = ctx.callbackQuery.data
    .split("_")
    .map(Number);

  // Получаем данные о текущей точке
  const questions = require("./data/questions.json");
  const point = questions.find((p) => p.pointId === ctx.team.currentPoint);

  if (!point) {
    await ctx.answerCbQuery("Ошибка: точка не найдена");
    return;
  }

  // Проверяем штраф за скорость
  const hasPenalty = await checkTimePenalty(ctx, questionIndex);

  // Проверяем ответ (передаем answerIndex как число, а не строку)
  const isCorrect = services.team.verifyAnswer(
    ctx.team.currentPoint,
    questionIndex,
    answerIndex // передаем число, а не строку
  );

  await processQuestionAnswer(ctx, isCorrect, {
    questionIndex,
    point,
    hasPenalty
  });

  // Подтверждаем обработку callback
  await ctx.answerCbQuery();
}

/**
 * Отображает прогресс команды: участники, баллы, пройденные точки, время в игре.
 * 
 * @param {Object} ctx — контекст Telegram-бота.
 * @returns {Promise<void>} — отправляет статистику команды в формате Markdown.
 * 
 * @description
 * Если квест завершен — добавляет время завершения.
 */
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
    `⏱ *В игре:* ${progress.timeInGame}`,
    `🕒 *Старт:* ${new Date(progress.startTime).toLocaleString()}`,
    completionInfo
  ].join("\n");

  await ctx.reply(message, { parse_mode: "Markdown" });
}

/**
 * Отображает топ команд по баллам.
 * 
 * @param {Object} ctx — контекст Telegram-бота.
 * @returns {Promise<void>} — отправляет отформатированный список топ-команд.
 * 
 * @description
 * Использует services.admin.getTopTeams.
 */
async function handleTopTeams(ctx) {
  const topTeams = services.admin.getTopTeams(
    services.team.getAllTeams(),
    true
  );
  await ctx.reply(topTeams, { parse_mode: "Markdown" });
}

/**
 * Открывает панель администратора.
 * 
 * @param {Object} ctx — контекст Telegram-бота.
 * @returns {Promise<void>} — отправляет меню админа, если пользователь — админ.
 * 
 * @description
 * Проверяет права через services.admin.isAdmin.
 */
async function handleAdminPanel(ctx) {
  if (!services.admin.isAdmin(ctx.from.id)) return;
  ctx.reply(locales.adminPanel, {
    ...keyboards.admin.getKeyboard(services.admin.getGameStatus()),
    parse_mode: "Markdown",
  });
}

/**
 * Отображает полную статистику игры (только для админов).
 * 
 * @param {Object} ctx — контекст Telegram-бота.
 * @returns {Promise<void>} — отправляет статистику в Markdown.
 * 
 * @description
 * Использует services.admin.getFullStats.
 */
async function handleStats(ctx) {
  if (!services.admin.isAdmin(ctx.from.id)) return;

  const stats = await services.admin.getFullStats(services.team.getAllTeams());
  ctx.reply(stats, { parse_mode: "Markdown" });
}

/**
 * Запрашивает подтверждение сброса всех команд.
 * 
 * @param {Object} ctx — контекст Telegram-бота.
 * @returns {Promise<void>} — отправляет inline-кнопки подтверждения/отмены.
 * 
 * @description
 * Только для админов.
 */
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

/**
 * Переводит админа в режим ввода сообщения для рассылки.
 * 
 * @param {Object} ctx — контекст Telegram-бота.
 * @returns {Promise<void>} — устанавливает флаг waitingForBroadcast и убирает клавиатуру.
 * 
 * @description
 * Только для админов.
 */
async function handleBroadcast(ctx) {
  if (!services.admin.isAdmin(ctx.from.id)) return;

  // Создаем временное состояние для админа
  services.team.updateTeam(ctx.chat.id, {
    waitingForBroadcast: true,
    waitingForMembers: false,
  });

  await ctx.reply(locales.broadcastPrompt, Markup.removeKeyboard());
}

/**
 * Отправляет рассылку всем командам.
 * 
 * @param {Object} ctx — контекст Telegram-бота.
 * @returns {Promise<void>} — отправляет сообщение всем командам и показывает статистику доставки.
 * 
 * @description
 * После отправки сбрасывает флаг waitingForBroadcast.
 */
async function handleBroadcastMessage(ctx) {
  const team = services.team.getTeam(ctx.chat.id);
  if (!team?.waitingForBroadcast) return;

  const teams = services.team.getAllTeams();
  const message = ctx.message.text;

  // Проверяем, есть ли команды для рассылки
  if (teams.length === 0) {
    await ctx.reply("❌ Нет зарегистрированных команд для рассылки");
    services.team.updateTeam(ctx.chat.id, {
      waitingForBroadcast: false,
    });
    return;
  }

  let successCount = 0;
  let failedCount = 0;
  const failedTeams = []; // Для отслеживания команд, которым не удалось отправить
  const adminIds = services.admin.admins.map(id => Number(id));

  // Фильтруем команды, исключая администраторов и самого отправителя
  const teamsToNotify = teams.filter(team => {
    const teamChatId = Number(team.chatId);
    const senderChatId = Number(ctx.chat.id);

    // Исключаем администраторов И текущего отправителя (чтобы админ не получал свою же рассылку)
    return !adminIds.includes(teamChatId) && teamChatId !== senderChatId;
  });

  if (teamsToNotify.length === 0) {
    await ctx.reply("❌ Нет команд для рассылки (все зарегистрированные - администраторы)");
    services.team.updateTeam(ctx.chat.id, {
      waitingForBroadcast: false,
    });
    return;
  }

  // Отправляем сообщение каждой команде с обработкой ошибок
  for (const team of teamsToNotify) {
    try {
      await bot.telegram.sendMessage(
        team.chatId,
        `📢 *Сообщение от администратора:*\n\n${message}`,
        { parse_mode: 'Markdown' }
      );
      successCount++;

      // Небольшая задержка между отправками, чтобы избежать лимитов Telegram
      await new Promise(resolve => setTimeout(resolve, 100));

    } catch (err) {
      console.error(`Ошибка отправки команде ${team.teamName} (${team.chatId}):`, err.message);
      failedCount++;
      failedTeams.push({
        name: team.teamName,
        chatId: team.chatId,
        error: err.message
      });
    }
  }

  // Сбрасываем флаг ожидания
  services.team.updateTeam(ctx.chat.id, {
    waitingForBroadcast: false,
  });

  // Формируем детальный отчет для администратора
  let reportMessage = `📊 *Отчет о рассылке:*\n\n`;
  reportMessage += `✅ Успешно отправлено: ${successCount} из ${teamsToNotify.length} команд\n`;
  reportMessage += `❌ Не удалось отправить: ${failedCount} команд\n\n`;

  if (failedCount > 0) {
    reportMessage += `*Команды с ошибками доставки:*\n`;
    failedTeams.forEach((team, index) => {
      reportMessage += `${index + 1}. ${team.name} (ID: ${team.chatId}) - ${team.error}\n`;
    });
  }

  // Отправляем отчет администратору
  await ctx.reply(
    reportMessage,
    {
      parse_mode: 'Markdown',
      ...keyboards.admin.getKeyboard(services.admin.getGameStatus())
    }
  );
}

/**
 * Открывает главное меню.
 * 
 * @param {Object} ctx — контекст Telegram-бота.
 * @returns {Promise<void>} — отправляет главное меню.
 */
async function handleMainMenu(ctx) {
  ctx.reply(locales.mainMenu, keyboards.mainMenu.getKeyboard());
}

/**
 * Подтверждает и выполняет сброс всех команд.
 * 
 * @param {Object} ctx — контекст Telegram-бота.
 * @returns {Promise<void>} — сбрасывает команды, уведомляет их и админов.
 * 
 * @description
 * Только для админов. Уведомляет каждую команду о сбросе.
 */
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

/**
 * Отменяет сброс команд.
 * 
 * @param {Object} ctx — контекст Telegram-бота.
 * @returns {Promise<void>} — отправляет сообщение об отмене и возвращает в админ-панель.
 * 
 * @description
 * Только для админов.
 */
async function handleResetCancel(ctx) {
  if (!services.admin.isAdmin(ctx.from.id)) return;

  await ctx.reply(locales.resetCanceled);
  await handleAdminPanel(ctx);
}

/**
 * Обрабатывает ввод списка участников команды.
 * 
 * @param {Object} ctx — контекст Telegram-бота.
 * @returns {Promise<void>} — сохраняет участников и показывает главное меню.
 * 
 * @description
 * Ожидается строка с именами, разделенными запятыми.
 */
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

/**
 * Обрабатывает правильный/неправильный ответ на вопрос, начисляет/снимает баллы, применяет штрафы.
 * 
 * @param {Object} ctx — контекст Telegram-бота.
 * @param {boolean} isCorrect — правильный ли ответ.
 * @param {Object} options — дополнительные параметры: questionIndex, point, hasPenalty.
 * @returns {Promise<void>} — обновляет состояние, отправляет сообщения, переходит к следующему вопросу или точке.
 * 
 * @description
 * При последнем вопросе завершает точку, проверяет завершение квеста, выдает призы.
 */
async function processQuestionAnswer(ctx, isCorrect, options) {
  const { questionIndex, point } = options;

  const key = `${ctx.team.currentPoint}_${questionIndex}`;
  const currentPoints = ctx.team.questionPoints?.[key] || PENALTIES.BASE_QUESTION_POINTS;

  // Проверяем время для ВСЕХ вопросов (включая первый)
  const hasPenalty = await checkTimePenalty(ctx, questionIndex);
  services.team.updateLastAnswerTime(ctx.chat.id, new Date().toISOString());

  if (isCorrect) {
    let pointsToAdd = currentPoints;
    let penaltyMessage = "";

    // Применяем штраф за скорость для ЛЮБОГО вопроса
    if (hasPenalty.hasPenalty) {
      const penalty = PENALTIES.TOO_FAST_ANSWER;
      pointsToAdd = Math.max(1, currentPoints - penalty); // Минимум 1 балл
      penaltyMessage = ` (${currentPoints}-${penalty} за скорость)`;

      // Отправляем сообщение о штрафе
      await ctx.reply(getRandomTooFastMessage(), { parse_mode: "Markdown" });

      // ОБНОВЛЯЕМ стоимость вопроса после штрафа
      services.team.updateQuestionPoints(
        ctx.chat.id,
        ctx.team.currentPoint,
        questionIndex,
        -penalty
      );
    }

    // Начисляем баллы (уже с учетом штрафа)
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

        // Уведомляем админа о завершении квеста этой командой
        await services.admin.notifyAdminAboutCompletion(updatedTeam, totalPoints);

        // Проверяем, все ли команды завершили квест
        const allTeams = services.team.getAllTeams();
        if (services.admin.checkAllTeamsCompleted(allTeams, totalPoints)) {
          // Рассылаем глобальное уведомление
          await services.admin.notifyAllTeamsAboutGlobalCompletion(bot, allTeams);

          // Также уведомляем админов о полном завершении
          for (const adminId of services.admin.admins) {
            try {
              await bot.telegram.sendMessage(
                adminId,
                "🎉 *Все команды завершили квест!* Миссия выполнена!",
                { parse_mode: 'Markdown' }
              );
            } catch (err) {
              console.error(`Ошибка уведомления админа ${adminId}:`, err);
            }
          }
        }
      }

      // Проверяем и выдаем призы (если применимо) - ВАЖНО: только при завершении точки
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

/**
 * Проверяет, не ответила ли команда слишком быстро (меньше MIN_TIME_BETWEEN_ANSWERS секунд).
 * 
 * @param {Object} ctx — контекст Telegram-бота.
 * @param {number} questionIndex — индекс текущего вопроса.
 * @returns {Promise<{hasPenalty: boolean, timeDiff: number}>} — объект с флагом штрафа и разницей во времени.
 * 
 * @description
 * Для первого вопроса использует pointActivationTime, для остальных — lastAnswerTime.
 */
async function checkTimePenalty(ctx, questionIndex) {
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

  // Штрафуем если ответили слишком быстро
  return {
    hasPenalty: timeDiff < PENALTIES.MIN_TIME_BETWEEN_ANSWERS,
    timeDiff: timeDiff
  };
}

/**
 * Возвращает сообщение о слишком быстром ответе.
 * 
 * @returns {string} — одно из сообщений из locales.penaltyMessages.tooFast.
 */
function getRandomTooFastMessage() {
  return locales.penaltyMessages.tooFast[
    Math.floor(Math.random() * locales.penaltyMessages.tooFast.length)
  ];
}

/**
 * Возвращает сообщение о неправильном ответе.
 * 
 * @returns {string} — одно из сообщений из locales.penaltyMessages.wrongAnswer.
 */
function getRandomWrongAnswerMessage() {
  return locales.penaltyMessages.wrongAnswer[
    Math.floor(Math.random() * locales.penaltyMessages.wrongAnswer.length)
  ];
}

/**
 * Читает данные о выданных призах из файла prizes.json.
 * 
 * @returns {Object} — объект с выданными призами по количеству точек.
 * 
 * @description
 * При ошибке возвращает пустой объект. Создает файл, если он не существует.
 */
function readPrizes() {
  try {
    // Создаем директорию, если её нет
    const dirPath = path.dirname(prizesFile);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    // Создаем файл, если он не существует
    if (!fs.existsSync(prizesFile)) {
      fs.writeFileSync(prizesFile, '{}');
      return {};
    }

    const data = fs.readFileSync(prizesFile, 'utf8');
    const prizes = JSON.parse(data);
    return prizes && typeof prizes === 'object' ? prizes : {};
  } catch (err) {
    console.error('Ошибка чтения prizes.json:', err);
    // Пытаемся создать чистый файл при ошибке
    try {
      fs.writeFileSync(prizesFile, '{}');
    } catch (writeErr) {
      console.error('Ошибка создания prizes.json:', writeErr);
    }
    return {};
  }
}

/**
 * Записывает данные о выданных призах в файл prizes.json.
 * 
 * @param {Object} data — объект с данными о призах.
 * 
 * @description
 * При ошибке логирует сообщение.
 */
function writePrizes(data) {
  try {
    fs.writeFileSync(prizesFile, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Ошибка записи prizes.json:', err);
  }
}

/**
 * Проверяет, достигла ли команда порога для получения приза, и выдает его, если еще не выдан.
 * 
 * @param {Object} ctx — контекст Telegram-бота.
 * @param {number} chatId — ID чата команды.
 * @param {number} completedPointsCount — количество пройденных точек.
 * @returns {Promise<void>} — отправляет команде и админам сообщение с промокодом и картами.
 * 
 * @description
 * Проверяет глобальное состояние призов — приз за N точек может получить только одна команда.
 * Отправляет кнопки навигации (Google Maps, Яндекс.Карты, 2GIS).
 */
async function checkAndAwardPrizes(ctx, chatId, completedPointsCount) {
  const team = services.team.getTeam(chatId);
  if (!team) return;

  const thresholds = [1, 4, 8, 10];

  // Проверяем, достигли ли мы одного из порогов призов
  if (!thresholds.includes(completedPointsCount)) {
    return;
  }

  // Проверяем, не получала ли команда уже этот приз
  if (services.team.hasPrize(chatId, completedPointsCount)) {
    console.log(`Команда уже получала приз за ${completedPointsCount} точек`);
    return;
  }

  // Проверяем глобально, не был ли приз уже выдан другой команде
  const prizes = readPrizes();
  if (prizes[completedPointsCount]) {
    console.log(`Приз за ${completedPointsCount} точек уже был выдан команде ${prizes[completedPointsCount].awardedTo}`);
    return; // Тихо пропускаем, не уведомляя команду
  }

  const prizeConfig = locales.prizes[completedPointsCount];
  if (!prizeConfig) {
    console.log(`Нет конфигурации приза для ${completedPointsCount} точек`);
    return;
  }

  // Награждаем команду - только если приз еще не был выдан никому
  services.team.addPrize(chatId, completedPointsCount);

  // Записываем в глобальный файл призов
  prizes[completedPointsCount] = {
    awardedTo: team.teamName,
    awardedToChatId: chatId,
    awardedAt: new Date().toISOString()
  };
  writePrizes(prizes);

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

  // Отправляем сообщение с промокодом команде-получателю
  try {
    await bot.telegram.sendMessage(
      chatId,
      message,
      {
        parse_mode: 'Markdown',
        ...keyboard
      }
    );
  } catch (err) {
    console.error(`Ошибка отправки приза команде ${chatId}:`, err);
  }

  // Также отправляем уведомление админам
  const admins = services.admin.admins;
  for (const adminId of admins) {
    try {
      await bot.telegram.sendMessage(
        adminId,
        `🎉 Команда "${team.teamName}" получила приз за ${completedPointsCount} точек!\n` +
        `Промокод: ${prizeConfig.promoCode}\n` +
        `Кофейня: ${prizeConfig.cafeName}`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      console.error(`Ошибка отправки уведомления админу ${adminId}:`, err);
    }
  }
}

/**
 * Запрашивает подтверждение очистки файла призов
 * 
 * @param {Object} ctx - контекст Telegram-бота
 * @returns {Promise<void>}
 * 
 * @description
 * Проверяет права администратора, проверяет наличие призов в файле,
 * и отправляет сообщение с кнопками подтверждения очистки
 */
async function handleClearPrizesConfirmation(ctx) {
  if (!services.admin.isAdmin(ctx.from.id)) return;

  const prizes = readPrizes();
  const prizeCount = Object.keys(prizes).length;

  if (prizeCount === 0) {
    return ctx.reply('🎁 Файл призов уже пуст!');
  }

  ctx.reply(
    `⚠️ Вы уверены, что хотите очистить файл призов?\n\n` +
    `Будет удалено ${prizeCount} выданных призов.\n\n` +
    `Это действие нельзя отменить!`,
    {
      reply_markup: {
        inline_keyboard: [
          [Markup.button.callback('✅ Да, очистить', 'clear_prizes_confirm')],
          [Markup.button.callback('❌ Нет, отменить', 'clear_prizes_cancel')],
        ],
      },
      parse_mode: 'Markdown',
    }
  );
}

/**
 * Подтверждает и выполняет очистку файла призов
 * 
 * @param {Object} ctx - контекст Telegram-бота
 * @returns {Promise<void>}
 * 
 * @description
 * Проверяет права администратора, очищает файл призов и удаляет призы у всех команд,
 * затем возвращает в админ-панель
 */
async function handleClearPrizesConfirm(ctx) {
  if (!services.admin.isAdmin(ctx.from.id)) return;

  try {
    // Очищаем файл призов
    writePrizes({});

    // Очищаем призы у всех команд
    const teams = services.team.getAllTeams();
    teams.forEach(team => {
      if (team.prizesReceived && team.prizesReceived.length > 0) {
        team.prizesReceived = [];
      }
    });
    services.team.saveTeams();

    await ctx.reply('✅ Файл призов успешно очищен! Все выданные призы удалены.');
    await handleAdminPanel(ctx);
  } catch (err) {
    console.error('Ошибка при очистке призов:', err);
    await ctx.reply('❌ Произошла ошибка при очистке призов.');
  }
}

/**
 * Отменяет очистку файла призов
 * 
 * @param {Object} ctx - контекст Telegram-бота
 * @returns {Promise<void>}
 * 
 * @description
 * Проверяет права администратора и отменяет операцию очистки призов,
 * затем возвращает в админ-панель
 */
async function handleClearPrizesCancel(ctx) {
  if (!services.admin.isAdmin(ctx.from.id)) return;

  await ctx.reply('❌ Очистка призов отменена.');
  await handleAdminPanel(ctx);
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
