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
        [{ text: '🏆 Мои призы' }, { text: '📊 Прогресс' }],
        [{ text: 'ℹ️ Информация' }],
      ];
      
      // Админы видят топ команд даже во время игры
      if (isAdmin) {
        buttons[2].push({ text: '🏆 Топ команд' });
      }
    } else if (isTeamRegistered) {
      // Зарегистрированная команда, но игра не активна - ограниченный набор
      buttons = [
        [{ text: '📊 Прогресс' }, { text: '🏆 Мои призы' },],
        [{ text: 'ℹ️ Информация' }],
      ];
    } else {
      // Незарегистрированная команда - минимальный набор
      buttons = [
        [{ text: 'ℹ️ Информация' }],
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
