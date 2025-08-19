module.exports = {
  getKeyboard: (isAdmin = false, isGameActive = false) => {
    const buttons = [
      isGameActive ? [{ text: '🌍 Выбрать точку' }] : [],
      isGameActive ? [{ text: '🎲 Мини-квест' }, { text: '📊 Прогресс' }] : [],
      [{ text: '🏆 Топ команд' }, { text: '📞 Помощь' }]
    ].filter(arr => arr.length > 0);

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