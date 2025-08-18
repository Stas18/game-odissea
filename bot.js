// bot.js
const { Telegraf, Markup } = require('telegraf');
require('dotenv').config();
const TeamService = require('./services/TeamService');
const QuestService = require('./services/QuestService');
const AdminService = require('./services/AdminService');
const locales = require('./data/locales.json');
const keyboards = {
  mainMenu: require('./keyboards/mainMenu'),
  pointSelection: require('./keyboards/pointSelection'),
  admin: require('./keyboards/adminKeyboard')
};

const services = {
  team: new TeamService(),
  quest: new QuestService(),
  admin: new AdminService()
};

const bot = new Telegraf(process.env.BOT_TOKEN);

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
  { name: "Хабенские", id: "team_9" }
];

// ======================
// Middlewares
// ======================

bot.use(async (ctx, next) => {
  const exemptRoutes = ['/start', 'team_', 'point_', 'answer_', '/admin', 'top_', 'reset_', 'begin_'];
  const isExempt = exemptRoutes.some(route => 
    ctx.message?.text?.startsWith(route) || 
    ctx.callbackQuery?.data?.startsWith(route)
  );

  if (isExempt || services.admin.isAdmin(ctx.from.id)) {
    return next();
  }
  
  // Проверяем, есть ли команда с таким chatId
  const existingTeam = services.team.getTeam(ctx.chat.id);
  if (!existingTeam) {
    return ctx.reply(locales.registrationRequired, Markup.removeKeyboard());
  }
  
  await next();
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

bot.command('start', handleStart);
bot.action(/^team_/, handleTeamSelection);
bot.hears('▶ Начать квест', handleBeginQuest);
bot.hears('🌍 Выбрать точку', handlePointSelection);
bot.action(/^point_/, handlePointActivation);
bot.hears('🎲 Мини-квест', handleMiniQuest);
bot.hears('📊 Прогресс', handleProgress);
bot.hears('🏆 Топ команд', handleTopTeams);
bot.hears('📞 Помощь', handleHelp);
bot.command('admin', handleAdminPanel);
bot.hears('📊 Статистика', handleStats);
bot.hears('🔄 Сбросить прогресс', handleResetConfirmation);
bot.hears('📢 Рассылка', handleBroadcast);
bot.hears('🏆 Показать топ', handleTopTeams);
bot.hears('⬅️ В главное меню', handleMainMenu);
bot.hears('👑 Админ-панель', handleAdminPanel);
bot.action('reset_confirm', handleResetConfirm);
bot.action('reset_cancel', handleResetCancel);

// ======================
// Обработчики сообщений
// ======================

bot.on('text', async (ctx) => {
  if (ctx.team?.waitingForMembers) {
    return handleMembersInput(ctx);
  }
  if (ctx.team?.waitingForBroadcast) {
    return handleBroadcastMessage(ctx);
  }
  if (ctx.team?.currentMiniQuest) {
    return handleMiniQuestAnswer(ctx);
  }
  if (ctx.team?.currentPoint) {
    return handlePointCode(ctx);
  }
  return ctx.reply(locales.useMenuButtons);
});

bot.action(/^answer_/, handleQuestionAnswer);

// ======================
// Функции обработчиков
// ======================

async function handleStart(ctx) {
  if (services.team.isTeamRegistered(ctx.chat.id)) {
    return ctx.reply(
      locales.alreadyRegistered,
      keyboards.mainMenu.getKeyboard()
    );
  }

  const teamButtons = teamOptions.map(team => 
    Markup.button.callback(team.name, team.id)
  );

  await ctx.reply(
    locales.welcomeMessage,
    Markup.inlineKeyboard(teamButtons, { columns: 2 })
  );
}

async function handleTeamSelection(ctx) {
  const selectedTeam = teamOptions.find(team => team.id === ctx.callbackQuery.data);
  if (!selectedTeam) {
    return ctx.reply(locales.teamSelectionError);
  }

  // Проверяем доступность имени команды
  if (!services.team.isTeamNameAvailable(selectedTeam.name)) {
    return ctx.reply(
      `❌ Команда "${selectedTeam.name}" уже зарегистрирована. Пожалуйста, выберите другое название.`,
      Markup.removeKeyboard()
    ).then(() => handleStart(ctx)); // Возвращаем к выбору команды
  }

  const team = services.team.registerTeam(
    ctx.chat.id, 
    selectedTeam.name, 
    ctx.from.id
  );
  
  await ctx.reply(
    locales.teamRegistered.replace('%s', selectedTeam.name),
    Markup.removeKeyboard()
  );
  
  await ctx.reply(
    locales.membersAdded.replace('%s', selectedTeam.name),
    Markup.keyboard([[Markup.button.text('▶ Начать квест')]])
      .oneTime()
      .resize()
  );
  
  await ctx.reply(locales.addMembers);
}

async function handleBeginQuest(ctx) {
  await ctx.reply(
    locales.startQuest,
    keyboards.mainMenu.getKeyboard()
  );
}

async function handlePointSelection(ctx) {
  const questions = require('./data/questions.json');
  const availablePoints = [...new Set(questions.map(q => q.pointId))]
    .filter(p => !ctx.team?.completedPoints?.includes(p));
  
  if (availablePoints.length === 0) {
    return ctx.reply(locales.noPointsAvailable);
  }
  
  ctx.reply(
    locales.selectPoint,
    keyboards.pointSelection.getKeyboard(availablePoints)
  );
}

async function handlePointActivation(ctx) {
  const pointId = parseInt(ctx.callbackQuery.data.split('_')[1]);
  const questions = require('./data/questions.json');
  const point = questions.find(p => p.pointId === pointId);
  
  if (!point) {
    return ctx.reply(locales.pointNotFound);
  }

  try {
    await ctx.replyWithPhoto({
      source: `./assets/point_${pointId}.jpg`
    });
  } catch (err) {
    console.log(`Фото для точки ${pointId} не найдено`);
  }
  
  await ctx.reply(
    locales.pointDescription
      .replace('%d', pointId)
      .replace('%s', keyboards.pointSelection.getPointDescription(pointId))
      .replace('%s', locales.pointDescriptions[pointId]),
    Markup.removeKeyboard()
  );
  
  services.team.updateTeam(ctx.chat.id, { 
    currentPoint: pointId,
    waitingForMembers: false,
    waitingForBroadcast: false
  });
}

async function handlePointCode(ctx) {
  const code = ctx.message.text.trim();
  const team = ctx.team;
  
  if (services.team.verifyCode(team.currentPoint, code)) {
    services.team.updateTeam(ctx.chat.id, {
      currentQuestion: 0,
      totalQuestions: 3
    });
    await askQuestion(ctx, 0);
  } else {
    ctx.reply(locales.wrongCode);
  }
}

async function askQuestion(ctx, questionIndex) {
  const questions = require('./data/questions.json');
  const point = questions.find(p => p.pointId === ctx.team.currentPoint);
  
  if (!point || !point.questions[questionIndex]) {
    return ctx.reply(locales.questionNotFound);
  }

  const question = point.questions[questionIndex];
  const options = question.options.map((option, i) => 
    Markup.button.callback(option, `answer_${questionIndex}_${i}`)
  );

  // Получаем текущие баллы за вопрос
  const key = `${ctx.team.currentPoint}_${questionIndex}`;
  const currentPoints = ctx.team.questionPoints?.[key] || 10;

  await ctx.reply(
    locales.questionTemplate
      .replace('%d', questionIndex + 1)
      .replace('%d', point.questions.length)
      .replace('%s', question.text) +
    `\n\n*Доступно баллов за этот вопрос: ${currentPoints}*`,
    Markup.inlineKeyboard(options, { columns: 1 })
  );
}

async function handleQuestionAnswer(ctx) {
  const [_, questionIndex, answerIndex] = ctx.callbackQuery.data.split('_').map(Number);
  const questions = require('./data/questions.json');
  const point = questions.find(p => p.pointId === ctx.team.currentPoint);
  const question = point.questions[questionIndex];
  
  const key = `${ctx.team.currentPoint}_${questionIndex}`;
  const currentPoints = ctx.team.questionPoints?.[key] || 10;

  if (answerIndex === question.answer) {
    services.team.addPoints(ctx.chat.id, currentPoints);
    await ctx.reply(
      locales.correctAnswer.replace('+10', `+${currentPoints}`)
    );
    
    if (questionIndex < point.questions.length - 1) {
      services.team.updateTeam(ctx.chat.id, { 
        currentQuestion: questionIndex + 1 
      });
      await askQuestion(ctx, questionIndex + 1);
    } else {
      const completedPointId = services.team.completePoint(
        ctx.chat.id, 
        ctx.team.currentPoint
      );
      await ctx.reply(
        locales.pointCompleted
          .replace('%d', completedPointId)
          .replace('%d', ctx.team.points),
        keyboards.mainMenu.getKeyboard()
      );
    }
  } else {
    // Уменьшаем баллы за этот вопрос на 3 за каждую ошибку (но не меньше 1)
    const newPoints = Math.max(1, currentPoints - 3);
    services.team.updateQuestionPoints(
      ctx.chat.id, 
      ctx.team.currentPoint, 
      questionIndex, 
      -3
    );
    
    await ctx.reply(
      `❌ Неверно! Баллы за этот вопрос уменьшены до ${newPoints}. Попробуйте еще раз!`,
      { parse_mode: 'Markdown' }
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

    const miniQuest = availableQuests[
      Math.floor(Math.random() * availableQuests.length)
    ];
    
    await ctx.reply(
      locales.miniQuestTask.replace('%s', miniQuest.task),
      { parse_mode: 'Markdown' }
    );
    
    services.team.updateTeam(ctx.chat.id, { 
      currentMiniQuest: miniQuest,
      waitingForMembers: false,
      waitingForBroadcast: false
    });
  } catch (err) {
    console.error('Error in handleMiniQuest:', err);
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
      waitingForBroadcast: false
    };

    if (wasCorrect) {
      const questCompleted = services.team.completeMiniQuest(
        ctx.chat.id, 
        team.currentMiniQuest.task
      );
      
      if (questCompleted) {
        services.team.addPoints(ctx.chat.id, 5);
        await ctx.reply(
          locales.miniQuestCorrect.replace('%d', team.points + 5),
          { parse_mode: 'Markdown' }
        );
      } else {
        await ctx.reply(locales.questAlreadyCompleted);
      }
    } else {
      await ctx.reply(locales.miniQuestWrong);
    }
    
    services.team.updateTeam(ctx.chat.id, updates);
  } catch (err) {
    console.error('Error in handleMiniQuestAnswer:', err);
    ctx.reply(locales.errorOccurred);
  }
}

async function handleProgress(ctx) {
  const progress = services.team.getTeamProgress(ctx.chat.id);
  if (!progress) return;

  const message = [
    `🏆 *Команда:* ${progress.teamName}`,
    `👤 *Капитан:* ${ctx.from.first_name} ${ctx.from.last_name || ''}`,
    `👥 *Участники:* ${progress.members.join(', ') || 'нет'}`,
    `📊 *Баллы:* ${progress.points}`,
    `📍 *Пройдено точек:* ${progress.completedPoints.length}/${progress.totalPoints}`,
    `🎲 *Пройдено мини-квестов:* ${progress.completedMiniQuests.length}/${progress.totalMiniQuests}`,
    `⏱ *В игре:* ${progress.timeInGame}`,
    `🕒 *Старт:* ${new Date(progress.startTime).toLocaleString()}`
  ].join('\n');

  await ctx.reply(message, { parse_mode: 'Markdown' });
}

async function handleTopTeams(ctx) {
  const topTeams = services.admin.getTopTeams(
    services.team.getAllTeams(),
    true
  );
  await ctx.reply(topTeams, { parse_mode: 'Markdown' });
}

async function handleHelp(ctx) {
  await ctx.reply(locales.helpMessage, { parse_mode: 'Markdown' });
}

async function handleAdminPanel(ctx) {
  if (!services.admin.isAdmin(ctx.from.id)) return;
  ctx.reply(
    locales.adminPanel,
    { 
      ...keyboards.admin.getKeyboard(),
      parse_mode: 'Markdown' 
    }
  );
}

async function handleStats(ctx) {
  if (!services.admin.isAdmin(ctx.from.id)) return;
  
  const stats = await services.admin.getFullStats(
    services.team.getAllTeams()
  );
  ctx.reply(stats, { parse_mode: 'Markdown' });
}

async function handleResetConfirmation(ctx) {
  if (!services.admin.isAdmin(ctx.from.id)) return;
  
  ctx.reply(locales.resetConfirm, {
    reply_markup: {
      inline_keyboard: [
        [Markup.button.callback("✅ Да", "reset_confirm")],
        [Markup.button.callback("❌ Нет", "reset_cancel")]
      ]
    },
    parse_mode: 'Markdown'
  });
}

async function handleBroadcast(ctx) {
  if (!services.admin.isAdmin(ctx.from.id)) return;
  
  services.team.updateTeam(ctx.chat.id, { 
    waitingForBroadcast: true,
    waitingForMembers: false
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
    waitingForBroadcast: false 
  });
  
  await ctx.reply(
    locales.broadcastSuccess.replace('%d', successCount),
    { parse_mode: 'Markdown' }
  );
}

async function handleMainMenu(ctx) {
  ctx.reply(
    locales.mainMenu, 
    keyboards.mainMenu.getKeyboard()
  );
}

async function handleResetConfirm(ctx) {
  if (!services.admin.isAdmin(ctx.from.id)) return;
  
  const result = services.admin.resetAllTeams(services.team);
  await ctx.reply(result.message, { parse_mode: 'Markdown' });
  
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
    .split(',')
    .map(name => name.trim())
    .filter(name => name.length > 0);
    
  if (members.length > 0) {
    services.team.updateTeam(ctx.chat.id, {
      members,
      waitingForMembers: false
    });
    
    await ctx.reply(
      locales.membersAdded.replace('%s', members.join(', ')), 
      keyboards.mainMenu.getKeyboard()
    );
  } else {
    await ctx.reply(locales.invalidFormat);
  }
}

// ======================
// Запуск бота
// ======================

bot.launch()
  .then(() => console.log('🎬 Бот успешно запущен!'))
  .catch(err => console.error('Ошибка запуска бота:', err));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));