const fs = require("fs");
const path = require("path");
const locales = require("../data/locales.json");
const questions = require("../data/questions.json");

/**
 * Сервис для управления командами игроков: регистрация, сохранение прогресса, проверка кодов и ответов, начисление очков и т.д.
 * 
 * @description
 * Отвечает за загрузку/сохранение данных команд из файла `teams.json`, управление состоянием команд (очки, пройденные точки),
 * а также за валидацию ответов и кодов. При инициализации загружает существующие команды и добавляет недостающие поля (например, `prizesReceived`).
 */
class TeamService {

  /**
   * Конструктор класса. Загружает команды из файла и инициализирует структуру данных.
   */
  constructor() {
    this.teams = this.loadTeams();
    this.teams.forEach(team => {
      if (!team.prizesReceived) {
        team.prizesReceived = [];
      }
    });
    this.saveTeams();
  }

  /**
   * Проверяет, совпадает ли введённый пользователем код с кодом указанной точки.
   * 
   * @param {number|string} pointId - Идентификатор точки (локации), для которой проверяется код.
   * @param {string} userInput - Введённый пользователем код.
   * @returns {boolean} - `true`, если код совпадает (с нормализацией регистра и пробелов), иначе `false`.
   * 
   * @description
   * Нормализует оба кода: приводит к нижнему регистру, удаляет лишние пробелы. Используется при вводе кода локации.
   */
  verifyCode(pointId, userInput) {
    const point = questions.find((p) => p.pointId === pointId);
    if (!point) return false;

    const normalizedInput = userInput
      .toString()
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
    const normalizedCode = point.code
      .toString()
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");

    return normalizedInput === normalizedCode;
  }

  /**
   * Загружает список команд из JSON-файла `teams.json`.
   * 
   * @returns {Array<Object>} - Массив объектов команд. В случае ошибки или отсутствия файла — пустой массив.
   * 
   * @description
   * При ошибке чтения (кроме отсутствия файла) выводит сообщение об ошибке через `locales.loadTeamsError`.
   */
  loadTeams() {
    const filePath = path.join(__dirname, "../data/teams.json");
    try {
      const data = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(data) || [];
    } catch (err) {
      if (err.code === "ENOENT") {
        return [];
      }
      console.error(locales.loadTeamsError, err);
      return [];
    }
  }

  /**
   * Сохраняет текущий список команд в файл `teams.json`.
   * 
   * @description
   * Используется после любого изменения состояния команды (регистрация, обновление очков, завершение точки и т.д.).
   */
  saveTeams() {
    const filePath = path.join(__dirname, "../data/teams.json");
    fs.writeFileSync(filePath, JSON.stringify(this.teams, null, 2));
  }

  /**
   * Регистрирует новую команду, если команда с таким chatId ещё не существует.
   * 
   * @param {number|string} chatId - Уникальный идентификатор чата команды.
   * @param {string} teamName - Название команды.
   * @param {number|string} captainId - ID капитана команды.
   * @returns {Object} - Объект созданной команды. Если команда уже существует — возвращает существующую.
   * 
   * @description
   * Инициализирует все необходимые поля команды: очки, массивы пройденных точек, тайминги и т.д.
   */
  registerTeam(chatId, teamName, captainId) {
    const existingTeam = this.getTeam(chatId);
    if (existingTeam) return existingTeam;

    const newTeam = {
      chatId,
      teamName,
      captainId,
      members: [],
      points: 0,
      completedPoints: [],
      currentPoint: null,
      currentQuestion: 0,
      totalQuestions: 0,
      startTime: new Date().toISOString(),
      completionTime: null,
      waitingForMembers: false,
      waitingForBroadcast: false,
      lastAnswerTime: null,
      questionPoints: {},
      prizesReceived: []
    };

    this.teams.push(newTeam);
    this.saveTeams();
    return newTeam;
  }

  /**
   * Проверяет, зарегистрирована ли команда с указанным chatId.
   * 
   * @param {number|string} chatId - Идентификатор чата команды.
   * @returns {boolean} - `true`, если команда существует, иначе `false`.
   */
  isTeamRegistered(chatId) {
    return this.teams.some((team) => team.chatId === chatId);
  }

  /**
   * Находит команду по chatId.
   * 
   * @param {number|string} chatId - Идентификатор чата команды.
   * @returns {Object|null} - Объект команды или `null`, если не найдена.
   */
  getTeam(chatId) {
    return this.teams.find((team) => team.chatId === chatId);
  }

  /**
   * Обновляет данные команды по chatId.
   * 
   * @param {number|string} chatId - Идентификатор чата команды.
   * @param {Object} updates - Объект с полями, которые нужно обновить.
   * @returns {Object|null} - Обновлённый объект команды или `null`, если команда не найдена.
   * 
   * @description
   * Использует `Object.assign` для частичного обновления. После обновления сохраняет данные в файл.
   */
  updateTeam(chatId, updates) {
    const team = this.getTeam(chatId);
    if (team) {
      Object.assign(team, updates);
      this.saveTeams();
      return team;
    }
    return null;
  }

  /**
   * Начисляет очки команде.
   * 
   * @param {number|string} chatId - Идентификатор чата команды.
   * @param {number} points - Количество очков для начисления (может быть отрицательным).
   * 
   * @description
   * Обновляет поле `points` команды и сохраняет изменения.
   */
  addPoints(chatId, points) {
    const team = this.getTeam(chatId);
    if (team) {
      team.points += points;
      this.saveTeams();
    }
  }

  /**
   * Отмечает точку как завершённую для команды.
   * 
   * @param {number|string} chatId - Идентификатор чата команды.
   * @param {number|string} pointId - Идентификатор завершённой точки.
   * @returns {number|string|null} - Возвращает `pointId`, если точка успешно завершена, иначе `null`.
   * 
   * @description
   * Сбрасывает `currentPoint`, `currentQuestion`, `totalQuestions`. Не дублирует запись, если точка уже завершена.
   */
  completePoint(chatId, pointId) {
    const team = this.getTeam(chatId);
    if (team && !team.completedPoints.includes(pointId)) {
      team.completedPoints.push(pointId);
      team.currentPoint = null;
      team.currentQuestion = 0;
      team.totalQuestions = 0;
      this.saveTeams();
      return pointId;
    }
    return null;
  }

  /**
   * Возвращает список всех зарегистрированных команд.
   * 
   * @returns {Array<Object>} - Массив объектов команд.
   */
  getAllTeams() {
    return this.teams;
  }

  /**
   * Возвращает время, прошедшее с начала игры для указанной команды.
   * 
   * @param {number|string} chatId - Идентификатор чата команды.
   * @returns {string} - Форматированная строка времени (например, "2ч 15мин" или "45мин").
   *                   Если команда не найдена — возвращает `locales.zeroTime`.
   * 
   * @description
   * Использует `locales.hours` и `locales.minutes` для локализации единиц измерения.
   */
  getGameTime(chatId) {
    const team = this.getTeam(chatId);
    if (!team) return locales.zeroTime;

    const start = new Date(team.startTime);
    const now = new Date();
    const diffMs = now - start;
    const diffMins = Math.floor(diffMs / 60000);
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;

    return hours > 0
      ? `${hours}${locales.hours} ${mins}${locales.minutes}`
      : `${mins}${locales.minutes}`;
  }

  /**
   * Устанавливает время завершения игры для команды.
   * 
   * @param {number|string} chatId - Идентификатор чата команды.
   * @returns {boolean} - `true`, если время установлено успешно, иначе `false`.
   */
  setCompletionTime(chatId) {
    const team = this.getTeam(chatId);
    if (team) {
      team.completionTime = new Date().toISOString();
      this.saveTeams();
      return true;
    }
    return false;
  }

  /**
   * Возвращает прогресс команды: очки, пройденные точки, время игры и т.д.
   * 
   * @param {number|string} chatId - Идентификатор чата команды.
   * @returns {Object|null} - Объект с прогрессом команды или `null`, если команда не найдена.
   * 
   * @description
   * Включает общее количество точек (из внешних файлов), что позволяет отображать прогресс в процентах.
   */
  getTeamProgress(chatId) {
    const team = this.getTeam(chatId);
    if (!team) return null;

    const questions = require("../data/questions.json");

    return {
      teamName: team.teamName,
      captainId: team.captainId,
      members: team.members,
      points: team.points,
      completedPoints: team.completedPoints,
      totalPoints: [...new Set(questions.map((q) => q.pointId))].length,
      startTime: team.startTime,
      completionTime: team.completionTime,
      timeInGame: this.getGameTime(chatId),
    };
  }

  /**
   * Проверяет, доступно ли указанное название команды (не занято другими командами).
   * 
   * @param {string} teamName - Название команды для проверки.
   * @returns {boolean} - `true`, если название свободно, иначе `false`.
   */
  isTeamNameAvailable(teamName) {
    return !this.teams.some((team) => team.teamName === teamName);
  }

  /**
   * Проверяет правильность ответа на вопрос в указанной точке.
   * 
   * @param {number|string} pointId - Идентификатор точки.
   * @param {number} questionIndex - Индекс вопроса в массиве вопросов точки.
   * @param {string|number} answer - Ответ пользователя (может быть индексом или строкой).
   * @returns {boolean} - `true`, если ответ верный, иначе `false`.
   * 
   * @description
   * Поддерживает два типа вопросов:
   * - карточки (массив `options`): ответ — индекс правильного варианта.
   * - текстовые (строка `options`): ответ — строка, сравнивается без регистра.
   */
  verifyAnswer(pointId, questionIndex, answer) {
    const questions = require("../data/questions.json");
    const point = questions.find((p) => p.pointId === pointId);

    if (!point || !point.questions[questionIndex]) return false;

    const question = point.questions[questionIndex];

    // Если это карточки (массив options)
    if (Array.isArray(question.options)) {
      // Приводим ответ к числу (для кнопочных ответов)
      const answerIndex = typeof answer === 'string' ? parseInt(answer) : answer;
      return !isNaN(answerIndex) && answerIndex === question.answer;
    }

    // Если это текстовый ответ (строка options)
    return answer.toString().trim().toLowerCase() === question.options.toLowerCase();
  }

  /**
   * Обновляет количество очков за конкретный вопрос для команды (например, при штрафах за повторные попытки).
   * 
   * @param {number|string} chatId - Идентификатор чата команды.
   * @param {number|string} pointId - Идентификатор точки.
   * @param {number} questionIndex - Индекс вопроса.
   * @param {number} pointsDelta - Изменение очков (обычно отрицательное).
   * 
   * @description
   * Использует ключ вида `"pointId_questionIndex"` для хранения текущего значения очков за вопрос.
   * Минимальное значение — 1 очко. Базовое — 10 очков.
   */
  updateQuestionPoints(chatId, pointId, questionIndex, pointsDelta) {
    const team = this.getTeam(chatId);
    if (team) {
      if (!team.questionPoints) team.questionPoints = {};
      const key = `${pointId}_${questionIndex}`;

      const BASE_POINTS = 10;
      const newPoints = Math.max(1, (team.questionPoints[key] || BASE_POINTS) + pointsDelta);
      team.questionPoints[key] = newPoints;

      this.saveTeams();
    }
  }

  /**
   * Обновляет время последнего ответа команды (для контроля частоты попыток).
   * 
   * @param {number|string} chatId - Идентификатор чата команды.
   * @param {string} time - ISO-строка времени последнего ответа.
   * @returns {boolean} - `true`, если обновление прошло успешно, иначе `false`.
   */
  updateLastAnswerTime(chatId, time) {
    const team = this.getTeam(chatId);
    if (team) {
      team.lastAnswerTime = time;
      this.saveTeams();
      return true;
    }
    return false;
  }

  /**
   * Добавляет приз в список полученных призов команды (по порогу очков).
   * 
   * @param {number|string} chatId - Идентификатор чата команды.
   * @param {number} prizeThreshold - Порог очков, за который выдан приз.
   * @returns {boolean} - `true`, если приз успешно добавлен, иначе `false`.
   * 
   * @description
   * Не дублирует призы — проверяет наличие в `prizesReceived`.
   */
  addPrize(chatId, prizeThreshold) {
    const team = this.getTeam(chatId);
    if (team && !team.prizesReceived.includes(prizeThreshold)) {
      team.prizesReceived.push(prizeThreshold);
      this.saveTeams();
      return true;
    }
    return false;
  }

  /**
   * Проверяет, получил ли игрок приз (общий факт или за конкретный порог).
   * 
   * @param {number|string} chatId - Идентификатор чата команды.
   * @param {number|null} [prizeThreshold=null] - Опционально: порог очков для проверки конкретного приза.
   * @returns {boolean} - `true`, если приз(ы) получены, иначе `false`.
   */
  hasPrize(chatId, prizeThreshold = null) {
    const team = this.getTeam(chatId);
    if (!team || !team.prizesReceived) return false;

    if (prizeThreshold) {
      return team.prizesReceived.includes(prizeThreshold);
    }
    return team.prizesReceived.length > 0;
  }
}

module.exports = TeamService;