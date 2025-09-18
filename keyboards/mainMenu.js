module.exports = {
  getKeyboard: (isAdmin = false, isGameActive = false, isTeamRegistered = false, waitingForMembers = false) => {
    let buttons = [];

    if (waitingForMembers) {
      // Ожидание ввода участников - только информационные кнопки
      buttons = [
        [{ text: 'ℹ️ Информация' }, { text: '🏆 Топ команд' }],
      ];
    } else if (isGameActive && isTeamRegistered) {
      // Активная игра + зарегистрированная команда - полный набор кнопок
      buttons = [
        [{ text: '🌍 Выбрать точку' }],
        [{ text: '🎲 Мини-квест' }, { text: '📊 Прогресс' }],
        [{ text: '🏆 Топ команд' }, { text: '🏆 Мои призы' }],
        [{ text: 'ℹ️ Информация' }],
      ];
    } else if (isTeamRegistered) {
      // Зарегистрированная команда, но игра не активна - ограниченный набор
      buttons = [
        [{ text: '📊 Прогресс' }, { text: 'ℹ️ Информация' }],
        [{ text: '🏆 Топ команд' }],
      ];
    } else {
      // Незарегистрированная команда - минимальный набор
      buttons = [
        [{ text: '🏆 Топ команд' }, { text: 'ℹ️ Информация' }],
      ];
    }

    if (isAdmin) {
      buttons.push([{ text: '👑 Админ-панель' }]);
    }

    return {
      reply_markup: {
        keyboard: buttons,
        resize_keyboard: true,
        one_time_keyboard: false
      }
    };
  }
};
