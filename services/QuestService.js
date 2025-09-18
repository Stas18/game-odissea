const miniQuests = require('../data/miniQuests.json');
const locales = require('../data/locales.json');

/**
 * Сервис для работы с мини-квестами: выбор случайного квеста, фильтрация доступных и т.д.
 */
class QuestService {

  /**
   * Возвращает случайный мини-квест из списка всех доступных.
   * 
   * @returns {Object} - Объект мини-квеста с полями, определёнными в `miniQuests.json` (например, `task`, `reward`, `description`).
   * 
   * @description
   * Используется, например, для выдачи игроку случайного задания.
   * Выбор осуществляется с равномерным распределением.
   */
  getRandomMiniQuest() {
    return miniQuests[Math.floor(Math.random() * miniQuests.length)];
  }

  /**
   * Возвращает список мини-квестов, которые ещё не были выполнены пользователем.
   * 
   * @param {Array<string>} [completedQuests=[]] - Массив идентификаторов (или описаний) уже выполненных квестов.
   *                                                 Сравнение происходит по полю `task` каждого квеста.
   * @returns {Array<Object>} - Массив объектов мини-квестов, не входящих в список выполненных.
   * 
   * @description
   * Позволяет фильтровать квесты, чтобы пользователь не получал повторяющиеся задания.
   * Используется, например, при отображении списка доступных квестов в интерфейсе.
   */
  getAvailableMiniQuests(completedQuests = []) {
    return miniQuests.filter(quest =>
      !completedQuests.includes(quest.task)
    );
  }
}

module.exports = QuestService;