const fs = require('fs');
const path = require('path');
const util = require('util');
const loggerConfig = require('./config/loggerConfig');

class Logger {
  constructor() {
    this.logLevels = {
      ERROR: 0,
      WARN: 1,
      INFO: 2,
      DEBUG: 3
    };

    this.config = loggerConfig;
    this.currentLevel = this.logLevels[this.config.level] || this.logLevels.INFO;
    this.logFile = path.resolve(__dirname, this.config.logFile);
    this.init();
  }

  async checkRotationAsync() {
    try {
      if (fs.existsSync(this.logFile)) {
        const stats = await fs.promises.stat(this.logFile);
        if (stats.size > this.config.maxFileSize) {
          await this.rotateLogsAsync();
        }
      }
    } catch (error) {
      console.error('Ошибка проверки ротации логов:', error);
    }
  }

  async rotateLogsAsync() {
    // Асинхронная реализация rotateLogs
  }

  /**
   * Проверяет необходимость ротации лог-файла
   */
  checkRotation() {
    try {
      if (fs.existsSync(this.logFile)) {
        const stats = fs.statSync(this.logFile);
        if (stats.size > this.config.maxFileSize) {
          this.rotateLogs();
        }
      }
    } catch (error) {
      console.error('Ошибка проверки ротации логов:', error);
    }
  }

  /**
   * Выполняет ротацию лог-файлов
   */
  rotateLogs() {
    try {
      for (let i = this.config.maxFiles - 1; i > 0; i--) {
        const oldFile = `${this.logFile}.${i}`;
        const newFile = `${this.logFile}.${i + 1}`;

        if (fs.existsSync(oldFile)) {
          if (i === this.config.maxFiles - 1) {
            fs.unlinkSync(oldFile);
          } else {
            fs.renameSync(oldFile, newFile);
          }
        }
      }

      if (fs.existsSync(this.logFile)) {
        fs.renameSync(this.logFile, `${this.logFile}.1`);
      }
    } catch (error) {
      console.error('Ошибка ротации логов:', error);
    }
  }

  /**
   * Инициализирует систему логирования - создает директорию для логов
   */
  init() {
    const logDir = path.dirname(this.logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  /**
   * Устанавливает уровень логирования
   * @param {string} level - Уровень логирования (ERROR, WARN, INFO, DEBUG)
   */
  setLevel(level) {
    if (this.logLevels[level] !== undefined) {
      this.currentLevel = this.logLevels[level];
      this.info(`Уровень логирования установлен на: ${level}`);
    }
  }

  /**
   * Форматирует сообщение для логирования
   * @param {string} level - Уровень логирования
   * @param {string} message - Сообщение
   * @param {any} meta - Дополнительные данные
   * @returns {string} - Отформатированное сообщение
   */
  formatMessage(level, message, meta = null) {
    const timestamp = new Date().toISOString();
    let formattedMessage = `[${timestamp}] [${level}] ${message}`;

    if (meta) {
      if (typeof meta === 'object') {
        formattedMessage += ` | ${util.inspect(meta, { depth: 2 })}`;
      } else {
        formattedMessage += ` | ${meta}`;
      }
    }

    return formattedMessage;
  }

  /**
   * Записывает сообщение в лог-файл с проверкой ротации
   * @param {string} message - Сообщение для записи
   */
  async writeToFile(message) {
    try {
      await this.checkRotationAsync();
      await fs.promises.appendFile(this.logFile, message + '\n', 'utf8');
    } catch (error) {
      console.error('Ошибка записи в лог-файл:', error);
    }
  }

  /**
   * Логирует сообщение с указанным уровнем
   * @param {string} level - Уровень логирования
   * @param {string} message - Сообщение
   * @param {any} meta - Дополнительные данные
   */
  log(level, message, meta = null) {
    if (this.logLevels[level] <= this.currentLevel) {
      const formattedMessage = this.formatMessage(level, message, meta);

      // Вывод в консоль
      const consoleMethod = level === 'ERROR' ? console.error :
        level === 'WARN' ? console.warn :
          console.log;
      consoleMethod(formattedMessage);

      // Запись в файл
      this.writeToFile(formattedMessage);
    }
  }

  /**
   * Логирует ошибку
   * @param {string} message - Сообщение об ошибке
   * @param {Error|any} error - Объект ошибки
   */
  error(message, error = null) {
    this.log('ERROR', message, error);
  }

  /**
   * Логирует предупреждение
   * @param {string} message - Сообщение предупреждения
   * @param {any} meta - Дополнительные данные
   */
  warn(message, meta = null) {
    this.log('WARN', message, meta);
  }

  /**
   * Логирует информационное сообщение
   * @param {string} message - Информационное сообщение
   * @param {any} meta - Дополнительные данные
   */
  info(message, meta = null) {
    this.log('INFO', message, meta);
  }

  /**
   * Логирует отладочное сообщение
   * @param {string} message - Отладочное сообщение
   * @param {any} meta - Дополнительные данные
   */
  debug(message, meta = null) {
    this.log('DEBUG', message, meta);
  }

  /**
   * Логирует входящее сообщение от пользователя
   * @param {Object} ctx - Контекст Telegram
   */
  logIncomingMessage(ctx) {
    const userInfo = ctx.from ? `${ctx.from.first_name} ${ctx.from.last_name || ''} (@${ctx.from.username || 'нет'})` : 'Unknown';
    const chatType = ctx.chat ? (ctx.chat.type === 'private' ? 'private' : `group: ${ctx.chat.title}`) : 'unknown';

    let messageText = 'Нет текста';
    if (ctx.message && ctx.message.text) {
      messageText = ctx.message.text;
    } else if (ctx.callbackQuery && ctx.callbackQuery.data) {
      messageText = `callback: ${ctx.callbackQuery.data}`;
    }

    this.debug(`Входящее сообщение`, {
      userId: ctx.from?.id,
      user: userInfo,
      chatId: ctx.chat?.id,
      chatType: chatType,
      message: messageText
    });
  }

  /**
   * Логирует действие команды
   * @param {string} action - Действие команды
   * @param {Object} team - Объект команды
   * @param {any} details - Детали действия
   */
  logTeamAction(action, team, details = null) {
    this.info(`Действие команды: ${action}`, {
      team: team.teamName,
      chatId: team.chatId,
      points: team.points,
      completedPoints: team.completedPoints.length,
      details: details
    });
  }

  /**
   * Логирует административное действие
   * @param {string} action - Действие администратора
   * @param {Object} admin - Объект администратора
   * @param {any} details - Детали действия
   */
  logAdminAction(action, admin, details = null) {
    this.info(`Админ действие: ${action}`, {
      adminId: admin.id,
      adminName: `${admin.first_name} ${admin.last_name || ''}`,
      details: details
    });
  }
}

// Создаем singleton экземпляр логгера
const logger = new Logger();

module.exports = logger;