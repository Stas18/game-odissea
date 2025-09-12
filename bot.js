const { Telegraf, Markup } = require("telegraf");

require("dotenv").config();

const TeamService = require("./services/TeamService");
const QuestService = require("./services/QuestService");
const AdminService = require("./services/AdminService");
const locales = require("./data/locales.json");
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
  WRONG_ANSWER: 1,
  TOO_FAST_ANSWER: 3,
  WRONG_CODE: 1,
  MIN_TIME_BETWEEN_ANSWERS: 71,
  BASE_QUESTION_POINTS: 10
};

async function checkTimePenalty(ctx, questionIndex) {
  let referenceTime;
  
  if (questionIndex === 0) {
    referenceTime = new Date(ctx.team.pointActivationTime);
  } else {
    referenceTime = new Date(ctx.team.lastAnswerTime || ctx.team.pointActivationTime);
  }
  
  const now = new Date();
  const timeDiff = (now - referenceTime) / 1000;
  
  if (timeDiff < PENALTIES.MIN_TIME_BETWEEN_ANSWERS) {
    // НЕ применяем штраф здесь, только возвращаем флаг
    return true;
  }
  return false;
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

    // Разрешаем доступ к меню если игра активна
    if (services.admin.isGameActive) {
      return next();
    }
  }

  const exemptRoutes = ["/start", "team_", "/admin", "top_", "reset_"];
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

bot.hears(locales.gameStartButton, async (ctx) => {
  if (!services.admin.isAdmin(ctx.from.id)) return;
  const result = services.admin.setGameActive(true);

  await ctx.reply(result.adminMessage);
  await handleAdminPanel(ctx);

  // Рассылаем уведомление всем командам
  const teams = services.team.getAllTeams();
  for (const team of teams) {
    try {
      await bot.telegram.sendMessage(
        team.chatId,
        result.broadcastMessage,
        keyboards.mainMenu.getKeyboard(false, true) // isAdmin=false, isGameActive=true
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

  // Рассылаем уведомление всем командам
  const teams = services.team.getAllTeams();
  for (const team of teams) {
    try {
      await bot.telegram.sendMessage(
        team.chatId,
        result.broadcastMessage,
        Markup.removeKeyboard()
      );
    } catch (err) {
      console.error(`Ошибка отправки команде ${team.chatId}:`, err);
    }
  }
});

bot.use(async (ctx, next) => {
  if (services.team.isTeamRegistered(ctx.chat.id)) {
    ctx.team = services.team.getTeam(ctx.chat.id);
  }
  await next();
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
      const question = point.questions[ctx.team.currentQuestion];

      // Если это текстовый вопрос (не карточки)
      if (!Array.isArray(question.options)) {
        return handleTextQuestionAnswer(ctx);
      }
    }
  

  return ctx.reply(locales.useMenuButtons);
});

async function handleTextQuestionAnswer(ctx) {
  const questions = require("./data/questions.json");
  const point = questions.find((p) => p.pointId === ctx.team.currentPoint);

  if (!point || !point.questions[ctx.team.currentQuestion]) {
    return ctx.reply(locales.questionNotFound);
  }

  const key = `${ctx.team.currentPoint}_${ctx.team.currentQuestion}`;
  const currentPoints = ctx.team.questionPoints?.[key] || PENALTIES.BASE_QUESTION_POINTS;

  // Только проверка, без применения штрафа
  const hasPenalty = await checkTimePenalty(ctx, ctx.team.currentQuestion);

  const isCorrect = services.team.verifyAnswer(
    ctx.team.currentPoint,
    ctx.team.currentQuestion,
    ctx.message.text
  );

  services.team.updateLastAnswerTime(ctx.chat.id, new Date().toISOString());

  if (isCorrect) {
    services.team.addPoints(ctx.chat.id, currentPoints);
    
    let actualPoints = currentPoints;
    let penaltyMessage = "";

    // Применяем временной штраф ПОСЛЕ начисления
    if (hasPenalty) {
      services.team.addPoints(ctx.chat.id, -PENALTIES.TOO_FAST_ANSWER);
      actualPoints = currentPoints - PENALTIES.TOO_FAST_ANSWER;
      penaltyMessage = ` (${currentPoints}-${PENALTIES.TOO_FAST_ANSWER} за скорость)`;
      await ctx.reply(getRandomTooFastMessage(), { parse_mode: "Markdown" });
    }

    // Показываем сообщение с ФАКТИЧЕСКИМИ баллами
    await ctx.reply(locales.correctAnswer.replace("%d", actualPoints) + penaltyMessage);

    // Адаптивная стоимость следующего вопроса
    const nextKey = `${ctx.team.currentPoint}_${ctx.team.currentQuestion + 1}`;
    if (hasPenalty && ctx.team.currentQuestion < point.questions.length - 1) {
      services.team.updateQuestionPoints(
        ctx.chat.id,
        ctx.team.currentPoint,
        ctx.team.currentQuestion + 1,
        -3
      );
    }

    if (ctx.team.currentQuestion < point.questions.length - 1) {
      services.team.updateTeam(ctx.chat.id, {
        currentQuestion: ctx.team.currentQuestion + 1,
      });
      await askQuestion(ctx, ctx.team.currentQuestion + 1);
    } else {
      const completedPointId = services.team.completePoint(
        ctx.chat.id,
        ctx.team.currentPoint
      );
      await ctx.reply(
        locales.pointCompleted
          .replace("%d", completedPointId)
          .replace("%d", services.team.getTeam(ctx.chat.id).points),
        keyboards.mainMenu.getKeyboard(
          services.admin.isAdmin(ctx.from.id),
          services.admin.isGameActive
        )
      );
    }
  } else {
    services.team.addPoints(ctx.chat.id, -PENALTIES.WRONG_ANSWER);
    await ctx.reply(
      getRandomWrongAnswerMessage(),
      { parse_mode: "Markdown" }
    );
    
    // Адаптивная стоимость при ошибке
    services.team.updateQuestionPoints(
      ctx.chat.id,
      ctx.team.currentPoint,
      ctx.team.currentQuestion,
      -2
    );
    
    await askQuestion(ctx, ctx.team.currentQuestion);
  }
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
    "🎯 *Правила квеста:*\n\n" +
    "1. Находите коды в городе по загадкам\n" +
    "2. Отвечайте на вопросы о кино (+10 баллов)\n" +
    "3. Выполняйте мини-квесты (+5 баллов)\n" +
    "4. Соревнуйтесь за первое место!\n\n" +
    "⏱ *Время игры:* не ограничено\n" +
    "👥 *Команда:* 2-100 человек\n\n" +
    "«Играйте честно — как в настоящем кино!» 🎬",
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

    if (team.waitingForMembers) {
      return ctx.reply(locales.addMembers, Markup.removeKeyboard());
    }

    if (!isGameActive && !services.admin.isAdmin(ctx.from.id)) {
      return ctx.reply(
        locales.alreadyRegistered + "\n\n" + locales.gameNotStarted,
        Markup.keyboard([
          ["🏆 Топ команд", "ℹ️ Информация"], // Обновленные кнопки
        ]).resize()
      );
    }

    return ctx.reply(
      locales.alreadyRegistered,
      keyboards.mainMenu.getKeyboard(
        services.admin.isAdmin(ctx.from.id),
        isGameActive
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
    Markup.removeKeyboard() // Убираем клавиатуру для свободного ввода
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

async function handleMembersInput(ctx) {
  // Проверяем что мы действительно ожидаем ввода участников
  if (!ctx.team?.waitingForMembers) {
    return ctx.reply(locales.useMenuButtons);
  }

  const members = ctx.message.text
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);

  services.team.updateTeam(ctx.chat.id, {
    members,
    waitingForMembers: false, // Сбрасываем флаг ожидания
  });

  await ctx.reply(
    locales.membersAdded.replace("%s", members.join(", ") || "не указаны"),
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
      `📍 Точка ${pointId} - ${keyboards.pointSelection.getPointDescription(pointId)}`,
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

  if (!point) {
    return ctx.reply(locales.pointNotFound);
  }

  try {
    await ctx.replyWithPhoto({
      source: `./assets/point_${pointId}.jpg`,
    });
  } catch (err) {
    console.log(`Фото для точки ${pointId} не найдено, продолжаем без фото`);
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
  services.team.updateTeam(ctx.chat.id, {
    currentPoint: pointId,
    currentQuestion: 0,
    totalQuestions: 0,
    waitingForMembers: false,
    waitingForBroadcast: false,
    lastAnswerTime: null
  });
}

// validate-questions.js
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
      pointActivationTime: new Date().toISOString()
    });
    await askQuestion(ctx, 0);
  } else {
    // Код неверный - применяем штраф
    services.team.addPoints(ctx.chat.id, -PENALTIES.WRONG_CODE);
    
    // Отправляем сообщение со штрафом
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
  const question = point.questions[questionIndex];

  const key = `${ctx.team.currentPoint}_${questionIndex}`;
  
  // Инициализируем questionPoints если не существует
  if (!ctx.team.questionPoints) {
    services.team.updateTeam(ctx.chat.id, { questionPoints: {} });
  }
  
  // Устанавливаем базовое значение, если не установлено
  const currentPoints = ctx.team.questionPoints[key] || PENALTIES.BASE_QUESTION_POINTS;

  // Проверяем временной интервал (только флаг, без штрафа)
  const hasPenalty = await checkTimePenalty(ctx, questionIndex);

  const isCorrect = services.team.verifyAnswer(
    ctx.team.currentPoint,
    questionIndex,
    answerIndex.toString()
  );

  // Обновляем время ответа
  services.team.updateLastAnswerTime(ctx.chat.id, new Date().toISOString());

  if (isCorrect) {
    // Сначала начисляем баллы
    services.team.addPoints(ctx.chat.id, currentPoints);
    
    let actualPoints = currentPoints; // Фактические баллы после всех операций
    let penaltyMessage = "";

    // Применяем временной штраф ПОСЛЕ начисления
    if (hasPenalty) {
      services.team.addPoints(ctx.chat.id, -PENALTIES.TOO_FAST_ANSWER);
      actualPoints = currentPoints - PENALTIES.TOO_FAST_ANSWER;
      penaltyMessage = ` (${currentPoints}-${PENALTIES.TOO_FAST_ANSWER} за скорость)`;
      await ctx.reply(getRandomTooFastMessage(), { parse_mode: "Markdown" });
    }

    // Показываем сообщение с ФАКТИЧЕСКИМИ баллами
    await ctx.reply(locales.correctAnswer.replace("%d", actualPoints) + penaltyMessage);

    // Уменьшаем стоимость следующего вопроса при быстром ответе
    const nextKey = `${ctx.team.currentPoint}_${questionIndex + 1}`;
    if (hasPenalty && questionIndex < point.questions.length - 1) {
      services.team.updateQuestionPoints(
        ctx.chat.id,
        ctx.team.currentPoint,
        questionIndex + 1,
        -3 // Уменьшаем стоимость следующего вопроса
      );
    }

    if (questionIndex < point.questions.length - 1) {
      services.team.updateTeam(ctx.chat.id, {
        currentQuestion: questionIndex + 1,
      });
      await askQuestion(ctx, questionIndex + 1);
    } else {
      const completedPointId = services.team.completePoint(
        ctx.chat.id,
        ctx.team.currentPoint
      );
      await ctx.reply(
        locales.pointCompleted
          .replace("%d", completedPointId)
          .replace("%d", services.team.getTeam(ctx.chat.id).points),
        keyboards.mainMenu.getKeyboard(
          services.admin.isAdmin(ctx.from.id),
          services.admin.isGameActive
        )
      );
    }
  } else {
    // Штраф за неправильный ответ (без временного штрафа)
    services.team.addPoints(ctx.chat.id, -PENALTIES.WRONG_ANSWER);
    await ctx.reply(
      getRandomWrongAnswerMessage(),
      { parse_mode: "Markdown" }
    );
    
    // Увеличиваем стоимость этого вопроса при следующей попытке
    services.team.updateQuestionPoints(
      ctx.chat.id,
      ctx.team.currentPoint,
      questionIndex,
      -2 // Уменьшаем, но делаем отрицательным для логики
    );
    
    await askQuestion(ctx, questionIndex);
  }
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
          { parse_mode: "Markdown" }
        );
      } else {
        await ctx.reply(locales.questAlreadyCompleted);
      }
    } else {
      await ctx.reply(locales.miniQuestWrong);
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

  const message = [
    `🏆 *Команда:* ${progress.teamName}`,
    `👤 *Капитан:* ${ctx.from.first_name} ${ctx.from.last_name || ""}`,
    `👥 *Участники:* ${progress.members.join(", ") || "нет"}`,
    `📊 *Баллы:* ${progress.points}`,
    `📍 *Пройдено точек:* ${progress.completedPoints.length}/${progress.totalPoints}`,
    `🎲 *Пройдено мини-квестов:* ${progress.completedMiniQuests.length}/${progress.totalMiniQuests}`,
    `⏱ *В игре:* ${progress.timeInGame}`,
    `🕒 *Старт:* ${new Date(progress.startTime).toLocaleString()}`,
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
  await ctx.reply(locales.broadcastPrompt);
}

async function handleBroadcastMessage(ctx) {
  const teams = services.team.getAllTeams();
  const successCount = await services.admin.broadcastMessage(
    bot,
    ctx.message.text,
    teams
  );

  services.team.updateTeam(ctx.chat.id, {
    waitingForBroadcast: false,
  });

  await ctx.reply(locales.broadcastSuccess.replace("%d", successCount), {
    parse_mode: "Markdown",
  });
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

  if (members.length > 0) {
    services.team.updateTeam(ctx.chat.id, {
      members,
      waitingForMembers: false,
    });

    await ctx.reply(
      locales.membersAdded.replace("%s", members.join(", ")),
      keyboards.mainMenu.getKeyboard()
    );
  } else {
    await ctx.reply(locales.invalidFormat);
  }
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
