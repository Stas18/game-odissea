module.exports = {
  getKeyboard: (isAdmin = false, isGameActive = false) => {
    let buttons = [];

    if (isGameActive) {
      buttons = [
        [{ text: '🌍 Выбрать точку' }],
        [{ text: '🎲 Мини-квест' }, { text: '📊 Прогресс' }],
        [{ text: '🏆 Топ команд' }, { text: '🏆 Мои призы' }],
        [{ text: 'ℹ️ Информация' }],
      ];
    } else {
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