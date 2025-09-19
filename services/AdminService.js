const fs = require('fs');
const path = require('path');
const locales = require('../data/locales.json');

class AdminService {
  constructor() {
    this.admins = JSON.parse(process.env.ADMINS || '[1147849296,863909091]');
    this.gameStatusFile = path.join(__dirname, '../data/gameStatus.json');
    this.isGameActive = this.loadGameStatus();
  }

  /**
   * Загружает текущий статус активности игры из файла gameStatus.json.
   * 
   * @returns {boolean} — true, если игра активна, иначе false. При ошибке чтения файла возвращает false.
   * 
   * @description
   * Вызывается автоматически при создании экземпляра класса.
   * Не выбрасывает исключения — ошибки обрабатываются внутри catch.
   */
  loadGameStatus() {
    try {
      const data = fs.readFileSync(this.gameStatusFile, 'utf-8');
      return JSON.parse(data).isGameActive || false;
    } catch (err) {
      return false;
    }
  }

  /**
   * Сохраняет текущее значение isGameActive в файл gameStatus.json.
   * 
   * @returns {undefined}
   * 
   * @description
   * Перезаписывает файл целиком.
   * Использует синхронную запись (writeFileSync).
   * Не обрабатывает ошибки записи — может выбросить исключение.
   */
  saveGameStatus() {
    fs.writeFileSync(this.gameStatusFile, JSON.stringify({
      isGameActive: this.isGameActive
    }));
  }

  /**
   * Устанавливает статус активности игры и сохраняет его. Возвращает сообщения для администратора и рассылки.
   * 
   * @param {boolean} status — желаемый статус игры (true — активна, false — приостановлена).
   * @returns {string | { adminMessage: string, broadcastMessage: string }} —
   *          Если статус не изменился — строка локализованного уведомления.
   *          Иначе — объект с сообщениями для администратора и команд.
   * 
   * @description
   * Если статус уже установлен — возвращает локализованное сообщение без изменений.
   * Автоматически вызывает saveGameStatus() для сохранения нового статуса.
   * Сообщения формируются на основе локализации (locales).
   */
  setGameActive(status) {
    if (this.isGameActive === status) {
      return status ? locales.gameAlreadyActive : locales.gameAlreadyInactive;
    }
    this.isGameActive = status;
    this.saveGameStatus();

    const message = status
      ? "🚀 Игра началась! Можете приступать к прохождению точек!"
      : "🛑 Игра приостановлена. Новые действия недоступны!";

    return {
      adminMessage: status ? locales.gameStarted : "Игра приостановлена",
      broadcastMessage: message
    };
  }

  /**
   * Возвращает текущий статус активности игры.
   * 
   * @returns {boolean} — текущее значение isGameActive.
   * 
   * @description
   * Простой геттер, не обращается к файловой системе.
   * Отражает состояние, загруженное при инициализации или изменённое через setGameActive.
   */
  getGameStatus() {
    return this.isGameActive;
  }

  /**
   * Проверяет, является ли пользователь с указанным ID администратором.
   * 
   * @param {string | number} userId — идентификатор пользователя.
   * @returns {boolean} — true, если пользователь есть в списке администраторов, иначе false.
   * 
   * @description
   * Внутри преобразует userId к числу для сравнения.
   * Список администраторов задаётся через переменную окружения ADMINS или по умолчанию [1111111111, 222222222].
   */
  isAdmin(userId) {
    return this.admins.includes(Number(userId));
  }

  /**
   * Рассылает сообщение всем командам, кроме администраторов.
   * 
   * @param {Object} bot — экземпляр Telegraf бота.
   * @param {string} message — текст сообщения для рассылки.
   * @param {Array<Object>} teams — массив команд.
   * @returns {Promise<number>} — количество успешно отправленных сообщений.
   * 
   * @description
   * Исключает из рассылки команды, чей chatId совпадает с ID администраторов.
   * Использует parse_mode: 'Markdown'.
   * При ошибке отправки — логирует ошибку, но не прерывает рассылку.
   * Возвращает 0, если команд для рассылки нет.
   */
  async broadcastMessage(bot, message, teams) {
    let successCount = 0;
    const adminIds = this.admins.map(id => Number(id));

    // Фильтруем команды, исключая администраторов
    const teamsToNotify = teams.filter(team =>
      !adminIds.includes(Number(team.chatId))
    );

    if (teamsToNotify.length === 0) {
      return 0;
    }

    for (const team of teamsToNotify) {
      try {
        await bot.telegram.sendMessage(
          team.chatId,
          `📢 *Сообщение от администратора:*\n\n${message}`,
          { parse_mode: 'Markdown' }
        );
        successCount++;
      } catch (err) {
        console.error(`Ошибка отправки команде ${team.teamName}:`, err.message);
      }
    }

    return successCount;
  }

  /**
   * Сбрасывает прогресс всех команд и сохраняет пустой список команд.
   * 
   * @param {Object} teamService — экземпляр сервиса команд с полями teams и методом saveTeams().
   * @returns {Object} — { message: string, affectedChatIds: number[] }
   *                   message — локализованное сообщение об успехе,
   *                   affectedChatIds — массив chatId команд, у которых был сброшен прогресс.
   * 
   * @description
   * Сбрасываются только команды с ненулевым прогрессом (баллы, пройденные точки).
   * После сброса вызывает teamService.saveTeams() для сохранения изменений.
   * Модифицирует состояние teamService.teams напрямую.
   */
  resetAllTeams(teamService) {
    const teamsWithProgress = teamService.teams.filter(
      team => team.points > 0 ||
        team.completedPoints.length > 0
    );
    const chatIds = teamsWithProgress.map(team => team.chatId);

    teamService.teams = [];
    teamService.saveTeams();

    return {
      message: locales.resetSuccess,
      affectedChatIds: chatIds
    };
  }

  /**
   * Формирует отформатированный рейтинг команд для вывода администратору или игрокам.
   * 
   * @param {Array<Object>} teams — массив команд.
   * @param {boolean} [showAll=false] — если true, показывает все команды, включая не начавшие игру.
   * @returns {string} — отформатированное сообщение с топом команд и общей статистикой.
   * 
   * @description
   * Сортировка: по баллам → по количеству пройденных точек → по времени начала.
   * Использует данные из questions.json для расчёта общего количества точек.
   * Формат времени в игре: "ччч + ммм" (если больше часа) или только "ммм".
   * Поддерживает локализацию через locales.
   */
  getTopTeams(teams, showAll = false) {
    const questions = require('../data/questions.json');
    const totalPoints = [...new Set(questions.map(q => q.pointId))].length;

    const sortedTeams = [...teams].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.completedPoints.length !== a.completedPoints.length) {
        return b.completedPoints.length - a.completedPoints.length;
      }
      return new Date(a.startTime) - new Date(b.startTime);
    });

    if (sortedTeams.length === 0) {
      return locales.noTeamsRegistered;
    }

    const topTeams = sortedTeams
      .filter(team => showAll || team.completedPoints.length > 0)
      .map((team, index) => {
        const timeInGame = this.formatGameTime(team.startTime);
        const progress = team.completedPoints.length >= totalPoints ?
          locales.questCompleted :
          `${locales.pointsProgress.replace('%d', team.completedPoints.length).replace('%d', totalPoints)}`;

        let completionInfo = '';
        if (team.completionTime) {
          const completionDate = new Date(team.completionTime);
          completionInfo = ` | 🏁 Завершил: ${completionDate.toLocaleTimeString()}`;
        }

        return `*${index + 1}. ${team.teamName}* - ${team.points} ${locales.points}\n` +
          `   ${progress} | ⏱ ${timeInGame}${completionInfo}`;
      })
      .join('\n\n');

    return `${locales.topTeamsHeader}\n\n${topTeams || locales.noData}\n\n` +
      `${locales.totalStats.replace('%d', totalPoints).replace('%d', 0)}`;
  }

  /**
   * Форматирует время, прошедшее с момента начала игры команды.
   * 
   * @param {string | Date} startTime — время начала игры команды.
   * @returns {string} — форматированная строка времени (например, "2ч 15мин" или "45мин").
   * 
   * @description
   * Используется в getTopTeams() и getFullStats().
   * Локализация единиц времени берётся из locales.hours и locales.minutes.
   */
  formatGameTime(startTime) {
    if (!startTime) return "Не начали";

    const start = new Date(startTime);
    const now = new Date();
    const duration = now - start;

    const hours = Math.floor(duration / 3600000);
    const minutes = Math.floor((duration % 3600000) / 60000);

    return `${hours}ч ${minutes}м`;
  }

  /**
   * Формирует детальную статистику по всем командам для администратора.
   * 
   * @param {Array<Object>} teams — массив команд.
   * @returns {string} — отформатированное сообщение со статистикой всех команд.
   * 
   * @description
   * Включает: имя команды, ID чата, капитана, участников, баллы, пройденные точки, время в игре, время начала и (если есть) время завершения.
   * Использует Markdown-форматирование.
   * Разделяет команды визуальным разделителем "────────────────".
   */
  async getFullStats(teams) {
    const stats = teams.map(team => {
      const timeInGame = this.formatGameTime(team.startTime);
      let completionInfo = '';
      if (team.completionTime) {
        const completionDate = new Date(team.completionTime);
        completionInfo = `\n🏁 Завершил: ${completionDate.toLocaleString()}`;
      }

      return `*${team.teamName}* (ID: ${team.chatId}):\n` +
        `${locales.captain}: ${team.captainId}\n` +
        `${locales.members}: ${team.members.join(', ') || locales.none}\n` +
        `${locales.points}: ${team.points}\n` +
        `${locales.completedPoints}: ${team.completedPoints.join(', ') || locales.none}\n` +
        `${locales.timeInGame}: ${timeInGame}\n` +
        `${locales.startTime}: ${new Date(team.startTime).toLocaleString()}` +
        completionInfo;
    }).join('\n\n────────────────\n');

    return `${locales.fullStatsHeader.replace('%d', teams.length)}\n\n${stats || locales.noData}`;
  }

  /**
   * Отправляет уведомление всем администраторам о завершении квеста командой.
   * 
   * @param {Object} team — объект команды, завершившей квест.
   * @param {number} totalPoints — общее количество точек в квеста.
   * @returns {Promise<void>}
   * 
   * @description
   * Отправляет сообщение каждому администратору по отдельности.
   * При ошибке отправки — логирует ошибку, но не прерывает цикл.
   * Формат сообщения: Markdown.
   * ⚠️ ВНИМАНИЕ: Использует глобальный объект `bot`, который должен быть доступен в области видимости!
   * Рекомендуется передавать bot как параметр для лучшей модульности.
   */
  async notifyAdminAboutCompletion(team, totalPoints) {
    const admins = this.admins;
    const completionTime = this.formatGameTime(team.startTime);

    const message = `🏁 *Команда завершила квест!*\n\n` +
      `🏆 Команда: ${team.teamName}\n` +
      `👥 Участники: ${team.members.join(', ') || 'нет'}\n` +
      `📊 Баллы: ${team.points}\n` +
      `📍 Точек пройдено: ${team.completedPoints.length}/${totalPoints}\n` +
      `⏱ Время прохождения: ${completionTime}\n` +
      `🕒 Завершила: ${new Date().toLocaleString()}`;

    for (const adminId of admins) {
      try {
        await bot.telegram.sendMessage(adminId, message, { parse_mode: 'Markdown' });
      } catch (err) {
        console.error(`Ошибка отправки уведомления админу ${adminId}:`, err);
      }
    }
  }

  /**
   * Рассылает уведомление всем командам о том, что все завершили квест.
   * 
   * @param {Object} bot — экземпляр Telegraf бота.
   * @param {Array<Object>} teams — массив команд.
   * @returns {Promise<void>}
   * 
   * @description
   * Отправляет одинаковое сообщение всем командам.
   * Использует Markdown.
   * При ошибке отправки — логирует ошибку, продолжает рассылку.
   */
  async notifyAllTeamsAboutGlobalCompletion(bot, teams) {
    const message = `🎉 *Все команды завершили квест!*\n\n` +
      `🏁 Миссия выполнена! Все участники успешно прошли все точки киноквеста.\n\n` +
      `Ожидайте информации о награждении победителей!`;

    for (const team of teams) {
      try {
        await bot.telegram.sendMessage(
          team.chatId,
          message,
          { parse_mode: 'Markdown' }
        );
      } catch (err) {
        console.error(`Ошибка отправки команде ${team.chatId}:`, err);
      }
    }
  }

  /**
   * Проверяет, завершили ли все команды прохождение всех точек квеста.
   * 
   * @param {Array<Object>} teams — массив команд.
   * @param {number} totalPoints — общее количество точек в квесте.
   * @returns {boolean} — true, если все команды прошли все точки, иначе false.
   * 
   * @description
   * Проверяет, что у каждой команды completedPoints.length >= totalPoints.
   * Используется для триггера notifyAllTeamsAboutGlobalCompletion().
   */
  checkAllTeamsCompleted(teams, totalPoints) {
    return teams.every(team =>
      team.completedPoints && team.completedPoints.length >= totalPoints
    );
  }

  /**
 * Рассчитывает и возвращает топ-3 призеров по указанным критериям.
 * 
 * @param {Array<Object>} teams — массив команд.
 * @returns {string} — отформатированное сообщение с топ-3 призерами.
 * 
 * @description
 * Сортировка: по баллам (по убыванию) → по времени завершения (по возрастанию) → по времени старта (по возрастанию).
 * Форматирует время прохождения для завершивших и время в игре для не завершивших.
 */
  calculateWinners(teams) {
    // Фильтруем команды, которые хотя бы начали игру
    const activeTeams = teams.filter(team => team.startTime && (team.points > 0 || team.completedPoints.length > 0));

    if (activeTeams.length === 0) {
      return "🏆 *Призеры не определены*\n\nНет активных команд с баллами.";
    }

    // Сортируем команды по критериям: баллы → время завершения → время старта
    const sortedTeams = [...activeTeams].sort((a, b) => {
      // Сначала по баллам (по убыванию)
      if (b.points !== a.points) {
        return b.points - a.points;
      }

      // Если баллы равны, то по времени завершения (кто раньше завершил)
      if (a.completionTime && b.completionTime) {
        return new Date(a.completionTime) - new Date(b.completionTime);
      }

      // Если одна команда завершила, а другая нет - завершившая выше
      if (a.completionTime && !b.completionTime) {
        return -1;
      }
      if (!a.completionTime && b.completionTime) {
        return 1;
      }

      // Если обе не завершили, то по времени старта (кто раньше начал)
      return new Date(a.startTime) - new Date(b.startTime);
    });

    // Берем топ-3 команды
    const top3 = sortedTeams.slice(0, 3);

    // Формируем сообщение с призерами
    let message = "🏆 *Топ-3 призера:*\n\n";

    top3.forEach((team, index) => {
      const place = index + 1;
      const emoji = place === 1 ? "🥇" : place === 2 ? "🥈" : "🥉";

      let timeInfo;
      if (team.completionTime) {
        // Команда завершила квест - показываем время прохождения
        const start = new Date(team.startTime);
        const end = new Date(team.completionTime);
        const duration = end - start;
        const hours = Math.floor(duration / 3600000);
        const minutes = Math.floor((duration % 3600000) / 60000);
        timeInfo = `⏱ Время прохождения: ${hours}ч ${minutes}м`;
      } else {
        // Команда не завершила - показываем время в игре
        const start = new Date(team.startTime);
        const now = new Date();
        const duration = now - start;
        const hours = Math.floor(duration / 3600000);
        const minutes = Math.floor((duration % 3600000) / 60000);
        timeInfo = `⏱ В игре: ${hours}ч ${minutes}м (не завершили)`;
      }

      message += `${emoji} *${place}. ${team.teamName}*\n`;
      message += `   📊 Баллы: ${team.points}\n`;
      message += `   ${timeInfo}\n`;

      if (team.completedPoints.length > 0) {
        message += `   📍 Пройдено точек: ${team.completedPoints.length}\n`;
      }

      message += "\n";
    });

    // Добавляем общую статистику
    message += `\nВсего участвовало команд: ${activeTeams.length}`;

    return message;
  }
}

module.exports = AdminService;